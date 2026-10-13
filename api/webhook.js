import {stripeClient} from '../lib/stripe.js';
import {databaseConfigured, ensureSchema, persistStripeEvent} from '../lib/db.js';
import {eventStatus} from '../lib/events.js';
import {processDonationEvent} from '../lib/ledger.js';

export const config = {api:{bodyParser:false}};

export default async function handler(req,res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!process.env.STRIPE_WEBHOOK_SECRET || !process.env.STRIPE_SECRET_KEY || !databaseConfigured()) return res.status(503).end();
  let event;
  try {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 1048576) return res.status(413).end(); chunks.push(chunk); }
    event = stripeClient().webhooks.constructEvent(Buffer.concat(chunks), req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch { return res.status(400).json({error:'Invalid webhook signature.'}); }
  if (!eventStatus(event)) return res.status(200).json({received:true, ignored:true});
  try {
    await ensureSchema();
    const ledger = await processDonationEvent(event);
    await persistStripeEvent(event, ledger);
    return res.status(200).json({received:true});
  } catch (error) {
    console.error('stripe_webhook_failed', {type:error.type || error.name || 'processing_error'});
    return res.status(500).json({error:'Donation update will be retried.'});
  }
}
