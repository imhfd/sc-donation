import {stripeClient, cors, configured} from '../lib/stripe.js';
export default async function handler(req,res) {
  if (!cors(req,res)) return;
  if (req.method !== 'GET') return res.status(405).json({error:'Use GET.'});
  const id = req.query.session_id;
  if (typeof id !== 'string' || !/^cs_(test_|live_)[a-zA-Z0-9]{16,}$/.test(id)) return res.status(400).json({error:'Invalid checkout reference.'});
  if (!configured()) return res.status(503).json({error:'Payment status unavailable.'});
  try {
    const session = await stripeClient().checkout.sessions.retrieve(id);
    if (session.metadata?.campaign !== 'sc-donation') return res.status(404).json({error:'Donation not found.'});
    return res.status(200).json({paymentStatus:session.payment_status,amountTotal:session.amount_total,currency:session.currency,mode:session.mode});
  } catch { return res.status(404).json({error:'Donation status unavailable.'}); }
}
