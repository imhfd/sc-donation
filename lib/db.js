import {neon} from '@neondatabase/serverless';

let client;
let schema;
export const databaseConfigured = () => Boolean(process.env.DATABASE_URL);

export function database() {
  if (!process.env.DATABASE_URL) throw new Error('Database is not configured.');
  return client ||= neon(process.env.DATABASE_URL);
}

export async function ensureSchema() {
  if (!schema) schema = (async () => {
    const sql = database();
    await sql.transaction([
      sql`CREATE TABLE IF NOT EXISTS stripe_webhook_events (
        id text PRIMARY KEY,
        type text NOT NULL,
        received_at timestamptz NOT NULL DEFAULT now(),
        processed_at timestamptz
      )`,
      sql`CREATE TABLE IF NOT EXISTS campaign_subscriptions (
        subscription_id text PRIMARY KEY,
        payment_link_id text,
        source text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      sql`CREATE TABLE IF NOT EXISTS campaign_fx_rates (
        observation_date date PRIMARY KEY,
        usd_per_eur numeric(18, 8) NOT NULL,
        gbp_per_eur numeric(18, 8) NOT NULL,
        source text NOT NULL
      )`,
      sql`CREATE TABLE IF NOT EXISTS campaign_metadata (
        key text PRIMARY KEY,
        value text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
      sql`CREATE TABLE IF NOT EXISTS campaign_donations (
        charge_id text PRIMARY KEY,
        payment_intent_id text NOT NULL,
        invoice_id text,
        subscription_id text,
        payment_link_id text,
        currency text NOT NULL CHECK (currency IN ('usd', 'gbp')),
        captured_minor bigint NOT NULL,
        refunded_minor bigint NOT NULL DEFAULT 0,
        disputed_minor bigint NOT NULL DEFAULT 0,
        payment_date date NOT NULL,
        usd_minor bigint NOT NULL,
        fx_rate numeric(18, 8) NOT NULL,
        fx_date date NOT NULL,
        fx_source text NOT NULL,
        campaign_source text NOT NULL,
        payment_status text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
      sql`CREATE INDEX IF NOT EXISTS campaign_donations_payment_date_idx ON campaign_donations (payment_date)`,
    ]);
  })().catch(error => { schema = null; throw error; });
  return schema;
}

export async function getDonation(chargeId) {
  const rows = await database()`SELECT charge_id, payment_intent_id, invoice_id, subscription_id, payment_link_id,
    currency, captured_minor, refunded_minor, disputed_minor, payment_date, usd_minor, fx_rate, fx_date,
    fx_source, campaign_source, payment_status
    FROM campaign_donations WHERE charge_id = ${chargeId} LIMIT 1`;
  return rows[0] || null;
}

export async function getCampaignSubscription(subscriptionId) {
  if (!subscriptionId) return null;
  const rows = await database()`SELECT subscription_id, payment_link_id, source
    FROM campaign_subscriptions WHERE subscription_id = ${subscriptionId} LIMIT 1`;
  return rows[0] || null;
}

export async function persistStripeEvent(event, {donation = null, subscription = null} = {}) {
  const sql = database();
  const queries = [sql`INSERT INTO stripe_webhook_events (id, type)
    VALUES (${event.id}, ${event.type}) ON CONFLICT (id) DO NOTHING`];
  if (subscription) queries.push(sql`INSERT INTO campaign_subscriptions (subscription_id, payment_link_id, source)
    VALUES (${subscription.id}, ${subscription.paymentLinkId}, ${subscription.source})
    ON CONFLICT (subscription_id) DO UPDATE SET
      payment_link_id = COALESCE(EXCLUDED.payment_link_id, campaign_subscriptions.payment_link_id),
      source = EXCLUDED.source`);
  if (donation) queries.push(sql`INSERT INTO campaign_donations (
      charge_id, payment_intent_id, invoice_id, subscription_id, payment_link_id, currency,
      captured_minor, refunded_minor, disputed_minor, payment_date, usd_minor, fx_rate, fx_date,
      fx_source, campaign_source, payment_status
    ) SELECT ${donation.chargeId}, ${donation.paymentIntentId}, ${donation.invoiceId},
      ${donation.subscriptionId}, ${donation.paymentLinkId}, ${donation.currency},
      ${donation.capturedMinor}, ${donation.refundedMinor}, ${donation.disputedMinor},
      ${donation.paymentDate}, ${donation.usdMinor}, ${donation.fxRate}, ${donation.fxDate},
      ${donation.fxSource}, ${donation.campaignSource}, ${donation.paymentStatus}
    WHERE EXISTS (SELECT 1 FROM stripe_webhook_events WHERE id = ${event.id} AND processed_at IS NULL)
    ON CONFLICT (charge_id) DO UPDATE SET
      payment_intent_id = EXCLUDED.payment_intent_id,
      invoice_id = COALESCE(EXCLUDED.invoice_id, campaign_donations.invoice_id),
      subscription_id = COALESCE(EXCLUDED.subscription_id, campaign_donations.subscription_id),
      payment_link_id = COALESCE(EXCLUDED.payment_link_id, campaign_donations.payment_link_id),
      currency = EXCLUDED.currency,
      captured_minor = EXCLUDED.captured_minor,
      refunded_minor = EXCLUDED.refunded_minor,
      disputed_minor = EXCLUDED.disputed_minor,
      payment_date = EXCLUDED.payment_date,
      usd_minor = EXCLUDED.usd_minor,
      fx_rate = EXCLUDED.fx_rate,
      fx_date = EXCLUDED.fx_date,
      fx_source = EXCLUDED.fx_source,
      campaign_source = EXCLUDED.campaign_source,
      payment_status = EXCLUDED.payment_status,
      updated_at = now()`);
  queries.push(sql`UPDATE stripe_webhook_events SET processed_at = now()
    WHERE id = ${event.id} AND processed_at IS NULL`);
  await sql.transaction(queries);
}

function donationUpsert(sql, donation) {
  return sql`INSERT INTO campaign_donations (
      charge_id, payment_intent_id, invoice_id, subscription_id, payment_link_id, currency,
      captured_minor, refunded_minor, disputed_minor, payment_date, usd_minor, fx_rate, fx_date,
      fx_source, campaign_source, payment_status
    ) VALUES (${donation.chargeId}, ${donation.paymentIntentId}, ${donation.invoiceId},
      ${donation.subscriptionId}, ${donation.paymentLinkId}, ${donation.currency},
      ${donation.capturedMinor}, ${donation.refundedMinor}, ${donation.disputedMinor},
      ${donation.paymentDate}, ${donation.usdMinor}, ${donation.fxRate}, ${donation.fxDate},
      ${donation.fxSource}, ${donation.campaignSource}, ${donation.paymentStatus})
    ON CONFLICT (charge_id) DO UPDATE SET
      payment_intent_id = EXCLUDED.payment_intent_id,
      invoice_id = COALESCE(EXCLUDED.invoice_id, campaign_donations.invoice_id),
      subscription_id = COALESCE(EXCLUDED.subscription_id, campaign_donations.subscription_id),
      payment_link_id = COALESCE(EXCLUDED.payment_link_id, campaign_donations.payment_link_id),
      currency = EXCLUDED.currency,
      captured_minor = EXCLUDED.captured_minor,
      refunded_minor = EXCLUDED.refunded_minor,
      disputed_minor = EXCLUDED.disputed_minor,
      payment_date = EXCLUDED.payment_date,
      usd_minor = EXCLUDED.usd_minor,
      fx_rate = EXCLUDED.fx_rate,
      fx_date = EXCLUDED.fx_date,
      fx_source = EXCLUDED.fx_source,
      campaign_source = EXCLUDED.campaign_source,
      payment_status = EXCLUDED.payment_status,
      updated_at = now()`;
}

export async function persistReconciledDonations(donations) {
  const sql = database();
  const queries = donations.map(donation => donationUpsert(sql, donation));
  queries.push(sql`INSERT INTO campaign_metadata (key, value)
    VALUES ('history_reconciled_at', now()::text)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`);
  await sql.transaction(queries);
}

export async function getCampaignTotal() {
  const rows = await database()`SELECT COALESCE(SUM(usd_minor), 0)::text AS raised_usd_minor,
    MAX(updated_at) AS updated_at, COUNT(*) FILTER (WHERE usd_minor > 0)::int AS donation_count
    FROM campaign_donations WHERE payment_status = 'succeeded'`;
  const marker = await database()`SELECT value FROM campaign_metadata WHERE key = 'history_reconciled_at' LIMIT 1`;
  return {...rows[0], published: marker.length > 0, historyReconciledAt: marker[0]?.value || null};
}
