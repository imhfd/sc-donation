import {stripeClient} from './stripe.js';
import {database, ensureSchema, getDonation, getCampaignSubscription} from './db.js';
import {isCampaignLink} from './campaign-links.js';
import {convertToUsdMinor, preloadedRateFor, rateForPayment} from './fx.js';

const idOf = value => typeof value === 'string' ? value : value?.id || null;
const isTagged = value => value?.metadata?.campaign === 'sc-donation';
const activeDisputeStatuses = new Set(['needs_response','under_review','warning_needs_response','warning_under_review','lost']);

export function netDonationMinor(captured, refunded, disputed, succeeded) {
  if (!succeeded) return 0;
  return Math.max(0, captured - refunded - disputed);
}

async function checkoutSessionFor({paymentIntentId, subscriptionId}) {
  const stripe = stripeClient();
  let sessions = [];
  if (paymentIntentId) {
    const result = await stripe.checkout.sessions.list({payment_intent:paymentIntentId, limit:100});
    sessions = result.data;
  }
  if (!sessions.length && subscriptionId) {
    const result = await stripe.checkout.sessions.list({subscription:subscriptionId, limit:100});
    sessions = result.data;
  }
  return sessions.find(session => isTagged(session) || isCampaignLink(session.payment_link)) || null;
}

async function campaignSource({charge, intent, invoice, session, subscriptionId, stored}) {
  if (stored?.campaign_source) return {source:stored.campaign_source, paymentLinkId:stored.payment_link_id, subscriptionId:stored.subscription_id || subscriptionId};
  const paymentLinkId = session?.payment_link || null;
  if (isTagged(session) || isTagged(intent) || isTagged(invoice)) return {source:'donation_page', paymentLinkId, subscriptionId};
  if (isCampaignLink(paymentLinkId)) return {source:'legacy_payment_link', paymentLinkId, subscriptionId};
  const invoiceSubscription = subscriptionId || idOf(invoice?.subscription) || idOf(invoice?.parent?.subscription_details?.subscription);
  if (invoiceSubscription) {
    const campaignSubscription = await getCampaignSubscription(invoiceSubscription);
    if (campaignSubscription) return {
      source:campaignSubscription.source,
      paymentLinkId:campaignSubscription.payment_link_id || null,
      subscriptionId:invoiceSubscription,
    };
  }
  if (invoiceSubscription) {
    const subscription = await stripeClient().subscriptions.retrieve(invoiceSubscription);
    if (isTagged(subscription)) return {source:'donation_page', paymentLinkId:null, subscriptionId:invoiceSubscription};
  }
  const matched = await checkoutSessionFor({paymentIntentId:idOf(charge?.payment_intent), subscriptionId:invoiceSubscription});
  if (matched) return {
    source: isTagged(matched) ? 'donation_page' : 'legacy_payment_link',
    paymentLinkId:matched.payment_link || null,
    subscriptionId:invoiceSubscription,
  };
  return null;
}

async function latestDispute(charge) {
  if (!charge.dispute) return charge.disputed ? {amount:charge.amount_captured || charge.amount, status:'unknown'} : null;
  if (typeof charge.dispute !== 'string') return charge.dispute;
  return stripeClient().disputes.retrieve(charge.dispute);
}

export async function donationForCharge(chargeRef, context = {}) {
  const stripe = stripeClient();
  const chargeId = idOf(chargeRef);
  if (!chargeId) return null;
  const stored = await getDonation(chargeId);
  const charge = context.charge || await stripe.charges.retrieve(chargeId, {expand:['dispute']});
  const intentId = idOf(charge.payment_intent) || idOf(context.intent);
  const intent = context.intent || (!context.source && intentId ? await stripe.paymentIntents.retrieve(intentId, {expand:['latest_charge']}) : null);
  const invoiceId = context.invoiceId || idOf(charge.invoice) || idOf(context.invoice?.id);
  const invoice = context.invoice || (!context.source && invoiceId ? await stripe.invoices.retrieve(invoiceId) : null);
  const subscriptionId = context.subscriptionId || idOf(invoice?.subscription) || idOf(invoice?.parent?.subscription_details?.subscription);
  const session = context.session || (!context.source ? await checkoutSessionFor({paymentIntentId:intentId, subscriptionId}) : null);
  const classification = context.source
    ? {source:context.source, paymentLinkId:context.paymentLinkId || null, subscriptionId}
    : await campaignSource({charge,intent,invoice,session,subscriptionId,stored});
  if (!classification) return null;

  const capturedMinor = Number(charge.amount_captured ?? (charge.captured ? charge.amount : 0));
  const refundedMinor = Number(charge.amount_refunded || 0);
  const dispute = await latestDispute(charge);
  const disputedMinor = dispute && activeDisputeStatuses.has(dispute.status)
    ? Math.min(capturedMinor, Number(dispute.amount || capturedMinor))
    : dispute?.status === 'unknown' ? capturedMinor : 0;
  const currency = String(charge.currency || intent?.currency || '').toLowerCase();
  if (!['usd','gbp'].includes(currency)) throw new Error('Campaign charge currency is unsupported.');
  const paidAt = new Date(Number(charge.created) * 1000);
  const date = paidAt.toISOString().slice(0,10);
  const rate = context.fxRates ? preloadedRateFor(currency, paidAt, context.fxRates) : await rateForPayment(currency, paidAt);
  const succeeded = charge.status === 'succeeded' && charge.paid === true && charge.captured === true;
  const netMinor = netDonationMinor(capturedMinor, refundedMinor, disputedMinor, succeeded);
  return {
    chargeId,
    paymentIntentId:intentId,
    invoiceId,
    subscriptionId:classification.subscriptionId,
    paymentLinkId:classification.paymentLinkId,
    currency,
    capturedMinor,
    refundedMinor,
    disputedMinor,
    paymentDate:date,
    usdMinor:convertToUsdMinor(netMinor, rate.rate),
    fxRate:rate.rate.toFixed(8),
    fxDate:rate.fxDate,
    fxSource:rate.source,
    campaignSource:classification.source,
    paymentStatus:succeeded ? 'succeeded' : 'not_counted',
  };
}

function invoicePayment(invoice) {
  const payments = invoice.payments?.data || [];
  const payment = payments.find(row => row.status === 'paid' || row.status === 'succeeded')?.payment;
  const paymentIntentId = idOf(invoice.payment_intent) || idOf(payment?.payment_intent);
  const chargeId = idOf(invoice.charge) || idOf(payment?.charge);
  return {paymentIntentId, chargeId};
}

export async function processDonationEvent(event) {
  await ensureSchema();
  const object = event.data?.object || {};
  let donation = null;
  let subscription = null;
  const stripe = stripeClient();

  if (event.type.startsWith('checkout.session.')) {
    if (object.mode === 'subscription' && idOf(object.subscription) && (isTagged(object) || isCampaignLink(object.payment_link))) {
      subscription = {
        id:idOf(object.subscription),
        paymentLinkId:object.payment_link || null,
        source:isTagged(object) ? 'donation_page' : 'legacy_payment_link',
      };
    }
    if (object.mode === 'payment' && object.payment_status === 'paid' && idOf(object.payment_intent)) {
      const intent = await stripe.paymentIntents.retrieve(idOf(object.payment_intent), {expand:['latest_charge']});
      donation = await donationForCharge(idOf(intent.latest_charge), {session:object, intent});
    }
  } else if (event.type === 'invoice.paid' && Number(object.amount_paid) > 0) {
    const subscriptionId = idOf(object.subscription) || idOf(object.parent?.subscription_details?.subscription);
    const refs = invoicePayment(object);
    if (refs.paymentIntentId) {
      const intent = await stripe.paymentIntents.retrieve(refs.paymentIntentId, {expand:['latest_charge']});
      donation = await donationForCharge(idOf(intent.latest_charge), {intent, invoice:object, subscriptionId});
    } else if (refs.chargeId) donation = await donationForCharge(refs.chargeId, {invoice:object, subscriptionId});
  } else if (event.type.startsWith('charge.dispute.')) {
    const chargeId = idOf(object.charge);
    if (chargeId) donation = await donationForCharge(chargeId);
  } else if (event.type.startsWith('refund.')) {
    const chargeId = idOf(object.charge);
    if (chargeId) donation = await donationForCharge(chargeId);
  } else if (['charge.captured','charge.succeeded','charge.updated','charge.refunded'].includes(event.type)) {
    donation = await donationForCharge(object.id);
  }

  return {donation, subscription};
}
