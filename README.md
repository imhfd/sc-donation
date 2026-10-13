# Sacred Chronicles donation page

The existing site and brand are preserved. The campaign supports monthly and one-time GBP/USD gifts with custom amounts through Stripe Checkout. Verified progress is stored in Neon Postgres; incomplete totals and supporter counts are never displayed.

## Development

Node 22+:

```sh
npm ci
npm test
npm run build
npm run dev
```

Open http://127.0.0.1:4173. The build emits only public assets to `dist/`; server code in `api/` and `lib/` is not copied to the browser bundle.

## Backend setup

The public page stays on GitHub Pages and calls the Vercel API at `https://sc-donation.vercel.app`. A free Neon database has been created in London; connect it to the Vercel project so Vercel can supply `DATABASE_URL`. Configure these sensitive server-side values in Vercel: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `DATABASE_URL`, and `CRON_SECRET`. Also set `SITE_URL=https://donation.sacredchronicles.online` and `ALLOWED_ORIGIN=https://donation.sacredchronicles.online`. Use a restricted Stripe key. Never commit credentials.

Create a Stripe webhook at `https://sc-donation.vercel.app/api/webhook` and subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `invoice.paid`, `invoice.payment_failed`, `charge.captured`, `charge.succeeded`, `charge.updated`, `charge.refunded`, `refund.created`, `refund.failed`, `refund.updated`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `charge.dispute.funds_withdrawn`, and `charge.dispute.funds_reinstated`. Save its signing secret in Vercel as `STRIPE_WEBHOOK_SECRET`.

The daily Vercel Cron job at `/api/reconcile` verifies the existing campaign links and paid subscription invoices, then reconciles captured charges from 1 August 2026 onward. It includes invoices from campaign subscriptions even when an invoice was created before the reporting period but paid during it. Progress stays unpublished until the first reconciliation succeeds. Webhook updates are signature-checked, transactional and idempotent. USD gifts use face value; GBP gifts use the closest ECB daily USD/GBP reference rate on or before the payment date for campaign reporting.

No test or live charge has been made by this code change. Verify one-time, monthly, custom GBP/USD, failure, cancellation, refund and dispute behavior in Stripe test mode before enabling live checkout.

## Campaign settings

`config.js` defines the $100,000 USD goal and API origin. Raised totals are served by the verified backend; they are never hard-coded into the public page.
