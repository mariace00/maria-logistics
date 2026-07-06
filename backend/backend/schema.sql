-- Run this once against your Postgres database (Vercel Postgres, Supabase, Neon — any works)

CREATE TABLE IF NOT EXISTS shipments (
  id             SERIAL PRIMARY KEY,
  ot             BIGINT NOT NULL,
  container      TEXT,                 -- NULL for air shipments
  tracking       TEXT,                 -- container # for ocean, AWB/tracking # for air
  ship_type      TEXT NOT NULL,        -- 'Ocean' | 'Air'
  carrier        TEXT,                 -- 'Hapag-Lloyd' | 'MSC' | 'CMA CGM' | NULL (air, unknown carrier)
  vessel         TEXT,
  mode           TEXT,                 -- 'Port' | 'Rail' (ocean only)
  pod            TEXT,
  destination    TEXT,
  state          TEXT,
  weight         NUMERIC,
  eta            DATE,
  latest_log     TEXT,
  air_tracking_url TEXT,        -- pre-built carrier tracking link for air shipments (FedEx/UPS/Lufthansa Cargo/etc)
  last_checked   TIMESTAMPTZ,
  check_error    TEXT,                 -- last error message, if the automated check failed
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ot, container)
);

CREATE TABLE IF NOT EXISTS sales_orders (
  id             SERIAL PRIMARY KEY,
  shipment_id    INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  so_number      BIGINT,
  customer       TEXT,
  project        TEXT,
  contact        TEXT,
  type           TEXT,
  notes          TEXT
);

-- Append-only log: every time the cron job detects a real change, it writes a row here.
-- This is what lets the dashboard show "recent updates" honestly instead of simulating it.
CREATE TABLE IF NOT EXISTS shipment_events (
  id             SERIAL PRIMARY KEY,
  shipment_id    INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  field          TEXT NOT NULL,        -- 'latest_log' | 'eta' | 'pod' | 'vessel' etc
  old_value      TEXT,
  new_value      TEXT,
  detected_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipments_ship_type ON shipments(ship_type);
CREATE INDEX IF NOT EXISTS idx_sales_orders_shipment ON sales_orders(shipment_id);
CREATE INDEX IF NOT EXISTS idx_events_shipment ON shipment_events(shipment_id, detected_at DESC);
