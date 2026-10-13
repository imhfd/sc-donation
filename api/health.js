import { configured, cors } from '../lib/stripe.js';
export default function handler(req,res) {
  if (!cors(req,res)) return;
  if (req.method !== 'GET') return res.status(405).json({error:'Use GET.'});
  res.status(200).json({checkoutReady:configured()});
}
