# Sacred Chronicles donation page

The existing HTML site and brand are preserved. The mobile-first campaign section adds monthly/one-time giving, GBP/USD, custom amounts, native sharing, copy-link fallback, and honest campaign progress. The configurable goal is $100,000 USD. No unverified totals or supporter counts are displayed.

## Development

Node 22+:

```sh
npm ci
npm test
npm run build
npm run dev
```

Open http://127.0.0.1:4173. The build emits only public assets to `dist/`; no backend code or secrets are copied there. GitHub Pages can continue serving the repository root. `api/` contains Vercel Node functions.

## Why custom amounts currently fail on the public site

The public site is on GitHub Pages, which cannot run the server-side Stripe functions. The Checkout backend is implemented under `api/`, but it is not yet connected to the public site. That is why custom gifts, one-time gifts and USD checkout cannot complete yet; it is a hosting configuration issue, not a problem with the amount entered. The page now says this clearly. Four original GBP monthly presets still use active Stripe Payment Links verified on 13 October 2026. The original one-time custom-amount link is under **Other ways to give** and asks the donor to choose their amount on Stripe.

These links use Stripe's existing hosted confirmation pages. New Checkout success/cancel handling applies to sessions created by the API.

## Required backend activation

1. Connect **imhfd/sc-donation** to the Vercel account using `vercel.json` (Other framework). The GitHub Vercel App must have access to this repository. No domain migration is needed: keep GitHub Pages and use the Vercel deployment as the API backend.
2. Add sensitive server-side environment variables `STRIPE_SECRET_KEY` (prefer a restricted key with Checkout Sessions write/read and the Prices, Products, Customers, Subscriptions and PaymentIntents permissions needed by inline-price Checkout), `SITE_URL=https://donation.sacredchronicles.online`, and `ALLOWED_ORIGIN=https://donation.sacredchronicles.online`. Use a sandbox/test key first. Never commit a real key.
3. Add a Stripe webhook for `https://<deployment>/api/webhook`, subscribe to the events below, and save its signing secret as sensitive `STRIPE_WEBHOOK_SECRET`. Redeploy. The API refuses new sessions until both Stripe credentials and SITE_URL are configured.
4. Set `apiBase` in `config.js` to the backend HTTPS origin and push. If moving the full website to Vercel instead, leave `apiBase` empty and use the same-origin API. For a cross-origin backend hosted frontend, add that exact origin to `connect-src` in the CSP.
5. Verify sandbox one-time and monthly gifts, decimal custom amounts in GBP/USD, failed/3DS payments, cancellation and signed webhook delivery. Then configure the matching live credentials and live webhook. No live payment has been claimed or made by this implementation.

Webhook events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.

Stripe remains the durable transaction/subscription ledger and manages renewals. The signature-verified webhook logs only event ID/type/status for operational monitoring; repeated delivery has no payment or totals side effects. No donor information is exposed or persisted by this site. Monitor payment failures in Stripe and enable Stripe's receipt, subscription-management and failed-payment email settings as appropriate. There is no order/access fulfillment for these voluntary gifts. If adding automated public totals or other post-payment effects later, store processed event IDs and update a durable ledger transactionally before acknowledging events.

Tax is not automatically added; assess the treatment of contributions for this business before enabling Stripe Tax or changing donation pricing. The amount sent by this integration is exactly the amount displayed.

## Campaign configuration

Edit `config.js`: `goal` and `currency` define the $100,000 USD target. `raised`, `supporters`, and `updatedAt` remain empty until a verified, persistent Stripe reconciliation and conversion source is connected. Unknown progress is explicitly labelled rather than presented as 0% funded. Donations in GBP do not get relabelled as USD.

Payment marks: Visa/Mastercard SVGs from [svg-credit-card-payment-icons](https://github.com/aaronfagan/svg-credit-card-payment-icons), used solely to identify payment methods. Card/wallet availability depends on Stripe settings, location and device. The original Sacred Chronicles logo, photographs and story content are reused.
