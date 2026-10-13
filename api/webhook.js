import {stripeClient} from '../lib/stripe.js';
import {eventStatus} from '../lib/events.js';
export const config = {api:{bodyParser:false}};
export default async function handler(req,res) {
  if(req.method !== 'POST') return res.status(405).end();
  if (!process.env.STRIPE_WEBHOOK_SECRET || !process.env.STRIPE_SECRET_KEY) return res.status(503).end();
  let event;
  try {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 1048576) return res.status(413).end(); chunks.push(chunk); }
    event = stripeClient().webhooks.constructEvent(Buffer.concat(chunks), req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch { return res.status(400).json({error:'Invalid webhook signature.'}); }
  const status = eventStatus(event);
  if (status) console.info('stripe_event', {eventId:event.id, type:event.type, status});
  return res.status(200).json({received:true});
}
