import {cors} from '../lib/stripe.js';
import {ensureSchema, getCampaignTotal} from '../lib/db.js';

const GOAL_USD_MINOR = 10_000_000;

export default async function handler(req,res) {
  if (!cors(req,res)) return;
  if (req.method !== 'GET') return res.status(405).json({error:'Use GET.'});
  try {
    await ensureSchema();
    const total = await getCampaignTotal();
    res.setHeader('Cache-Control','public, s-maxage=15, stale-while-revalidate=30');
    return res.status(200).json({
      published:total.published,
      currency:'usd',
      raisedUsdMinor:total.published ? Number(total.raised_usd_minor) : null,
      goalUsdMinor:GOAL_USD_MINOR,
      updatedAt:total.published ? total.updated_at : null,
      historyReconciledAt:total.historyReconciledAt,
    });
  } catch {
    return res.status(503).json({error:'Campaign progress is temporarily unavailable.'});
  }
}
