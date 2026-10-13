import { donationInput } from '../lib/amount.js';
import { stripeClient, configured, siteUrl, cors, checkoutParams } from '../lib/stripe.js';
export default async function handler(req, res) {
  if (!cors(req,res)) return;
  if (req.method !== 'POST') return res.status(405).json({error:'Use POST.'});
  if (!req.headers['content-type']?.includes('application/json')) return res.status(415).json({error:'Send JSON.'});
  let donation;
  try { donation = donationInput(typeof req.body === 'string' ? JSON.parse(req.body) : req.body); }
  catch (error) { return res.status(400).json({error:error.message}); }
  if (!configured()) return res.status(503).json({error:'Secure checkout is still being connected. Please try again soon, or choose a GBP monthly preset.'});
  try {
    const session = await stripeClient().checkout.sessions.create(checkoutParams(donation, siteUrl()), {idempotencyKey:`sc-donation-${donation.requestId}`});
    return res.status(200).json({url:session.url});
  } catch (error) {
    // No request body, email, API keys or Stripe error details reach logs or the browser.
    console.error('checkout_failed', {type:error.type || 'configuration_error'});
    return res.status(502).json({error:'Secure checkout is temporarily unavailable. Please retry your donation.'});
  }
}
