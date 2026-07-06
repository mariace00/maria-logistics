// api/shipments/[id]/update.js
// PATCH /api/shipments/:id  -> manual update for air shipments / carriers without
// an automated adapter yet (e.g. CMA CGM AWB numbers, DHL/FedEx air waybills).
// This is the honest answer to "why isn't this live" for anything hapag.js/msc.js
// don't cover: someone on the team updates it here in 10 seconds instead of editing Excel,
// and it shows up on the dashboard immediately for everyone.
import { manualUpdate } from '../../../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'PATCH') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const { id } = req.query;
  const { eta, latestLog, pod, vessel, carrier } = req.body || {};

  try {
    await manualUpdate(id, { eta, latestLog, pod, vessel, carrier });
    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Update failed' });
  }
}
