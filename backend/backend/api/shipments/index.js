// api/shipments/index.js
// GET  /api/shipments      -> full list the dashboard renders
import { getAllShipments } from '../../lib/db.js';

export default async function handler(req, res) {
  // The dashboard artifact runs on claude.ai's domain, not this one, so it's a
  // cross-origin request — these headers are required or the browser blocks it.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  try {
    const data = await getAllShipments();
    return res.status(200).json({ success: true, ...data });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Could not load shipments' });
  }
}

