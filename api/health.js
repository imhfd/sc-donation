import { checkoutConfigured, cors } from '../lib/stripe.js';
import {databaseConfigured, ensureSchema} from '../lib/db.js';
export default function handler(req,res) {
  if (!cors(req,res)) return;
  if (req.method !== 'GET') return res.status(405).json({error:'Use GET.'});
  if (databaseConfigured()) {
    ensureSchema().then(() => res.status(200).json({checkoutReady:checkoutConfigured(), progressReady:true})).catch(() => res.status(200).json({checkoutReady:checkoutConfigured(), progressReady:false}));
    return;
  }
  res.status(200).json({checkoutReady:checkoutConfigured(), progressReady:false});
}
