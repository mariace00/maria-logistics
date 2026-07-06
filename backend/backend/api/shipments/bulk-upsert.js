// api/shipments/bulk-upsert.js
// POST /api/shipments/bulk-upsert
// Lets the browser dashboard push its already-parsed shipment list straight into
// the database — no local Python/psql needed. Protected by the same secret used
// for the cron job, sent as "Authorization: Bearer <secret>".
import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized — check your admin key' });
  }

  const { shipments } = req.body || {};
  if (!Array.isArray(shipments)) {
    return res.status(400).json({ success: false, error: 'Expected { shipments: [...] }' });
  }

  let inserted = 0, updated = 0;
  try {
    for (const s of shipments) {
      const etaVal = !s.plannedEta || String(s.plannedEta).toLowerCase() === 'tbd' ? null : s.plannedEta;
      const weightVal = typeof s.weight === 'number' ? s.weight : null;
      const flagNote = s.containerFlagged ? 'Container ID malformed in ZMM48 — needs manual check' : null;

      const result = await sql`
        INSERT INTO shipments (ot, container, tracking, ship_type, carrier, vessel, mode, pod,
                                destination, weight, eta, air_tracking_url, check_error)
        VALUES (${s.ot}, ${s.container}, ${s.tracking}, ${s.shipType}, ${s.carrier}, ${s.lastKnownVessel || null},
                ${s.mode}, ${s.pod}, ${s.dest}, ${weightVal}, ${etaVal}, ${s.airTrackingUrl}, ${flagNote})
        ON CONFLICT (ot, container) DO UPDATE SET
          tracking = EXCLUDED.tracking, ship_type = EXCLUDED.ship_type,
          carrier = COALESCE(shipments.carrier, EXCLUDED.carrier),
          mode = EXCLUDED.mode, pod = COALESCE(shipments.pod, EXCLUDED.pod),
          destination = EXCLUDED.destination, weight = EXCLUDED.weight,
          eta = COALESCE(shipments.eta, EXCLUDED.eta),
          air_tracking_url = EXCLUDED.air_tracking_url, check_error = EXCLUDED.check_error,
          updated_at = now()
        RETURNING id, (xmax = 0) AS was_insert
      `;
      const { id: shipmentId, was_insert } = result.rows[0];
      was_insert ? inserted++ : updated++;

      await sql`DELETE FROM sales_orders WHERE shipment_id = ${shipmentId}`;
      for (const o of s.orders || []) {
        await sql`
          INSERT INTO sales_orders (shipment_id, so_number, customer, project, contact, type, notes)
          VALUES (${shipmentId}, ${o.so}, ${o.customer}, ${o.project}, ${o.contact}, ${o.city}, ${o.rawNote})
        `;
      }
    }
    return res.status(200).json({ success: true, inserted, updated, total: shipments.length });
  } catch (e) {
    return res.status(500).json({ success: false, error: String(e.message || e) });
  }
}
