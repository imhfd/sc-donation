import {stripeClient} from '../lib/stripe.js';
import {databaseConfigured, ensureSchema, persistReconciledDonations} from '../lib/db.js';
import {CAMPAIGN_PAYMENT_LINK_IDS, isCampaignLink} from '../lib/campaign-links.js';
import {donationForCharge} from '../lib/ledger.js';
import {preloadFxRates} from '../lib/fx.js';

export const config = {maxDuration:60};
const START = Date.parse('2026-08-01T00:00:00Z') / 1000;
const idOf = value => typeof value === 'string' ? value : value?.id || null;
export const invoiceSubscriptionId = invoice => idOf(invoice?.subscription) || idOf(invoice?.parent?.subscription_details?.subscription);

async function collectCampaignSessions(stripe) {
  const sessions = new Map();
  for (const paymentLink of CAMPAIGN_PAYMENT_LINK_IDS) {
    let after;
    do {
      const page = await stripe.checkout.sessions.list({payment_link:paymentLink, limit:100, ...(after ? {starting_after:after} : {})});
      for (const session of page.data) sessions.set(session.id, session);
      after = page.has_more ? page.data.at(-1)?.id : null;
    } while (after);
  }
  let after;
  do {
    const page = await stripe.checkout.sessions.list({created:{gte:START}, limit:100, ...(after ? {starting_after:after} : {})});
    for (const session of page.data) {
      if (session.metadata?.campaign === 'sc-donation') sessions.set(session.id, session);
    }
    after = page.has_more ? page.data.at(-1)?.id : null;
  } while (after);
  return [...sessions.values()];
}

async function collectSinceStart(listPage) {
  const items = [];
  let after;
  do {
    const page = await listPage({created:{gte:START}, limit:100, ...(after ? {starting_after:after} : {})});
    items.push(...page.data);
    after = page.has_more ? page.data.at(-1)?.id : null;
  } while (after);
  return items;
}

async function collectCampaignInvoices(stripe, subscriptionIds) {
  const result = new Map();
  const ids = [...subscriptionIds];
  for (let start = 0; start < ids.length; start += 8) {
    const pageSets = await Promise.all(ids.slice(start, start + 8).map(async subscription => {
      const invoices = new Map();
      let after;
      do {
        const page = await stripe.invoices.list({subscription, status:'paid', limit:100, ...(after ? {starting_after:after} : {})});
        for (const invoice of page.data) invoices.set(invoice.id, invoice);
        after = page.has_more ? page.data.at(-1)?.id : null;
      } while (after);
      return invoices;
    }));
    for (const invoices of pageSets) for (const [id, invoice] of invoices) result.set(id, invoice);
  }
  return [...result.values()];
}

export default async function handler(req,res) {
  if (req.method !== 'GET') return res.status(405).json({error:'Use GET.'});
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({error:'Unauthorized.'});
  if (!process.env.STRIPE_SECRET_KEY || !databaseConfigured()) return res.status(503).json({error:'Reconciliation is not configured.'});
  try {
    await ensureSchema();
    const stripe = stripeClient();
    const [sessions, charges] = await Promise.all([
      collectCampaignSessions(stripe),
      collectSinceStart(params => stripe.charges.list(params)),
    ]);
    const sessionsByPaymentIntent = new Map();
    const sessionsBySubscription = new Map();
    for (const session of sessions) {
      if (session.payment_intent) sessionsByPaymentIntent.set(typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent.id, session);
      if (session.subscription) {
        const subscriptionId = idOf(session.subscription);
        sessionsBySubscription.set(subscriptionId, {
          session,
          source:session.metadata?.campaign === 'sc-donation' ? 'donation_page' : 'legacy_payment_link',
        });
      }
    }
    const invoices = await collectCampaignInvoices(stripe, sessionsBySubscription.keys());
    const invoicesById = new Map();
    const campaignInvoices = new Set();
    for (const invoice of invoices) {
      const subscription = invoiceSubscriptionId(invoice);
      if (invoice.metadata?.campaign === 'sc-donation' || sessionsBySubscription.has(subscription)) {
        invoicesById.set(invoice.id, invoice);
        campaignInvoices.add(invoice.id);
      }
    }
    const selected = charges.filter(charge => {
      const paymentIntent = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
      const invoice = typeof charge.invoice === 'string' ? charge.invoice : charge.invoice?.id;
      return sessionsByPaymentIntent.has(paymentIntent) || campaignInvoices.has(invoice);
    });

    const today = new Date().toISOString().slice(0,10);
    const fxRates = await preloadFxRates('2026-08-01', today);
    const donations = [];
    for (const charge of selected) {
      const paymentIntent = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
      const invoiceId = typeof charge.invoice === 'string' ? charge.invoice : charge.invoice?.id;
      const session = sessionsByPaymentIntent.get(paymentIntent) || null;
      const invoice = invoiceId ? invoicesById.get(invoiceId) || null : null;
      const subscriptionId = invoice ? invoiceSubscriptionId(invoice) : idOf(session?.subscription);
      const subscriptionSession = sessionsBySubscription.get(subscriptionId);
      const source = session?.metadata?.campaign === 'sc-donation' || invoice?.metadata?.campaign === 'sc-donation'
        ? 'donation_page'
        : session && isCampaignLink(session.payment_link) ? 'legacy_payment_link'
        : subscriptionSession?.source || null;
      if (!source) continue;
      const donation = await donationForCharge(charge.id, {
        charge,
        session,
        invoice,
        subscriptionId,
        source,
        paymentLinkId:session?.payment_link || subscriptionSession?.session.payment_link || null,
        fxRates,
      });
      if (donation) donations.push(donation);
    }
    await persistReconciledDonations(donations);
    console.info('campaign_reconciled', {chargeCount:donations.length, sessionCount:sessions.length});
    return res.status(200).json({reconciled:true, donationCount:donations.length});
  } catch (error) {
    console.error('campaign_reconcile_failed', {type:error.type || error.name || 'processing_error'});
    return res.status(500).json({error:'Reconciliation failed and will retry tomorrow.'});
  }
}
