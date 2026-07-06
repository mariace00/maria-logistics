// lib/db.js
// Uses @vercel/postgres — works out of the box with Vercel Postgres, and with any
// standard Postgres connection string (Supabase, Neon, RDS) via POSTGRES_URL.
import { sql } from '@vercel/postgres';

export async function getAllShipments() {
  // SELECT * already includes air_tracking_url, carrier, etc — nothing extra needed here.
  const { rows: shipments } = await sql`SELECT * FROM shipments ORDER BY eta ASC NULLS LAST`;
  const { rows: orders } = await sql`SELECT * FROM sales_orders`;
  const { rows: events } = await sql`
    SELECT * FROM shipment_events ORDER BY detected_at DESC LIMIT 50
  `;

  const ordersByShipment = {};
  for (const o of orders) {
    (ordersByShipment[o.shipment_id] ??= []).push(o);
  }

  return {
    shipments: shipments.map(s => ({ ...s, orders: ordersByShipment[s.id] || [] })),
    recentEvents: events,
  };
}

export async function getShipmentsDueForCheck(staleAfterMinutes = 90) {
  // Only ocean shipments with a container are auto-checkable right now (hapag/msc adapters).
  const { rows } = await sql`
    SELECT * FROM shipments
    WHERE ship_type = 'Ocean'
      AND container IS NOT NULL
      AND carrier IN ('Hapag-Lloyd', 'MSC')
      AND (last_checked IS NULL OR last_checked < NOW() - (${staleAfterMinutes} || ' minutes')::interval)
    ORDER BY last_checked ASC NULLS FIRST
    LIMIT 25
  `;
  return rows;
}

export async function applyCheckResult(shipment, result) {
  const changes = [];
  const fieldsToCompare = {
    eta: result.eta || null,
    latest_log: result.latestLog || null,
    pod: result.pod || null,
    vessel: result.vessel || null,
  };

  for (const [field, newValue] of Object.entries(fieldsToCompare)) {
    const oldValue = shipment[field];
    if (newValue && String(newValue) !== String(oldValue || '')) {
      changes.push({ field, oldValue, newValue });
    }
  }

  await sql`
    UPDATE shipments SET
      eta = COALESCE(${fieldsToCompare.eta}, eta),
      latest_log = COALESCE(${fieldsToCompare.latest_log}, latest_log),
      pod = COALESCE(${fieldsToCompare.pod}, pod),
      vessel = COALESCE(${fieldsToCompare.vessel}, vessel),
      last_checked = NOW(),
      check_error = NULL,
      updated_at = NOW()
    WHERE id = ${shipment.id}
  `;

  for (const c of changes) {
    await sql`
      INSERT INTO shipment_events (shipment_id, field, old_value, new_value)
      VALUES (${shipment.id}, ${c.field}, ${c.oldValue}, ${c.newValue})
    `;
  }

  return changes;
}

export async function markCheckFailed(shipmentId, errorMessage) {
  await sql`
    UPDATE shipments SET last_checked = NOW(), check_error = ${errorMessage}, updated_at = NOW()
    WHERE id = ${shipmentId}
  `;
}

export async function manualUpdate(shipmentId, fields) {
  // For air shipments / carriers without an automated adapter yet (e.g. CMA CGM AWB numbers).
  // Ops can PATCH these from the dashboard until a real adapter exists.
  const { eta, latestLog, pod, vessel, carrier } = fields;
  await sql`
    UPDATE shipments SET
      eta = COALESCE(${eta}, eta),
      latest_log = COALESCE(${latestLog}, latest_log),
      pod = COALESCE(${pod}, pod),
      vessel = COALESCE(${vessel}, vessel),
      carrier = COALESCE(${carrier}, carrier),
      last_checked = NOW(),
      updated_at = NOW()
    WHERE id = ${shipmentId}
  `;
}
