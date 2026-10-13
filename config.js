// Public campaign settings only. Never put Stripe secret keys in this file.
export const campaign = {
  apiBase: 'https://sc-donation.vercel.app', // Secure backend; the public page remains on GitHub Pages.
  currency: 'usd',
  goal: 100000, // USD fundraising target; this is not a claimed amount raised.
  raised: null, // Populate only with verified totals in campaign.currency.
  supporters: null,
  updatedAt: null,
  shareUrl: 'https://donation.sacredchronicles.online/',
};
// Existing active GBP monthly links, verified against Stripe on 2026-10-13.
export const monthlyLinks = {
  5: 'https://donate.stripe.com/4gM14p9mafFf65b05a7IY06',
  10: 'https://donate.stripe.com/3cI00l9ma78JctzdW07IY03',
  30: 'https://donate.stripe.com/28EbJ3eGuboZ2SZ8BG7IY04',
  50: 'https://donate.stripe.com/6oU5kFbui64FbpvdW07IY07',
};
