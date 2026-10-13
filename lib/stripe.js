import Stripe from 'stripe';
let client;
export function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured.');
  return client ||= new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, timeout: 15000 });
}
export const configured = () => Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && process.env.SITE_URL && process.env.DATABASE_URL && process.env.CRON_SECRET);
export function siteUrl() {
  const url = new URL(process.env.SITE_URL);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('SITE_URL must use HTTPS.');
  return url.origin;
}
export function cors(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Origin');
  const allowed = new Set([process.env.ALLOWED_ORIGIN, process.env.SITE_URL].filter(Boolean).map(value => new URL(value).origin));
  if (req.headers.origin && !allowed.has(req.headers.origin)) { res.status(403).json({error:'Origin not allowed.'}); return false; }
  if (req.headers.origin) res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return false; }
  return true;
}
export function checkoutParams(donation, origin) {
  const {unitAmount, currency, mode} = donation;
  const recurring = mode === 'monthly';
  return {
    mode: recurring ? 'subscription' : 'payment',
    integration_identifier: 'sc_donation_hqnxazpr',
    client_reference_id: donation.requestId,
    // Disable currency conversion so Checkout matches the donor's selected currency.
    adaptive_pricing: {enabled:false},
    line_items: [{quantity:1, price_data:{currency, unit_amount:unitAmount, product_data:{name:'Sacred Chronicles — community film support'}, ...(recurring ? {recurring:{interval:'month'}} : {})}}],
    metadata: {campaign:'sc-donation'},
    ...(recurring ? {subscription_data:{metadata:{campaign:'sc-donation'}}} : {payment_intent_data:{metadata:{campaign:'sc-donation'}}}),
    success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?checkout=cancelled#donate`,
    // Taxes, quantity adjustments and promotions are not added to the chosen gift.
  };
}
