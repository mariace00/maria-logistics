# Maria Logistics — Shipment Tracker backend

Turns `container-tracker.html` from a static snapshot into a self-updating dashboard.

## What's here

```
schema.sql              — run once against Postgres
lib/db.js                — all database reads/writes
lib/carriers/hapag.js    — your original hapag.js scraping logic, refactored to be reusable
lib/carriers/msc.js      — your original msc.js logic, refactored to be reusable
api/hapag.js             — manual single-container lookup (same as before)
api/msc.js               — manual single-container lookup (same as before)
api/shipments/index.js   — GET endpoint the dashboard fetches from
api/shipments/[id]/update.js — PATCH endpoint for manual updates (air shipments, CMA CGM, etc.)
api/cron/poll.js         — the scheduled job that checks containers automatically
seed/derive_shipment_master.py — the core parser: reads ZSD28+ZSD29+ZMM48 directly
seed/seed_from_excel.py  — writes derive_shipment_master.py's output into Postgres
vercel.json              — adds the cron schedule
```

## Setup

1. **Create a Postgres database.** Easiest path: Vercel dashboard → Storage → Create Database → Postgres. It sets the `POSTGRES_URL` env var for you automatically. (Supabase or Neon work too — just set `POSTGRES_URL` yourself.)

2. **Run the schema:**
   ```
   psql $POSTGRES_URL -f schema.sql
   ```

3. **Seed real data from your current export:**
   ```
   pip install openpyxl psycopg2-binary --break-system-packages
   POSTGRES_URL="..." python3 seed/seed_from_excel.py "Containers_Report_-_0625.xlsm"
   ```
   Re-run this any time you have a fresher export — it upserts, so it won't duplicate.

4. **Set the cron secret.** In Vercel project settings → Environment Variables, add `CRON_SECRET` to any random string. Vercel automatically sends it as a Bearer token when it triggers your cron job, so `/api/cron/poll` only runs for real scheduled calls.

5. **Deploy.** `vercel.json` schedules `/api/cron/poll` for every 2 hours (`0 */2 * * *`). Change the schedule string if you want a different cadence.
   > Note: Vercel Cron Jobs require a Pro plan (or the Hobby plan's 1x-per-day limit if you're on the free tier). If you're on Hobby and want more frequent checks, an external scheduler like [cron-job.org](https://cron-job.org) hitting your `/api/cron/poll` URL with the right `Authorization` header works too.

6. **Point the dashboard at your deployment.** `container-tracker.html` already tries `fetch('/api/shipments')` first and falls back to the bundled snapshot if that fails — so once you drop this HTML file into the same Vercel project (e.g. `public/index.html`) and deploy, it goes live automatically. Opened standalone (like right now), it just shows the snapshot.

## What's automated vs. what still needs a person

- **Master data (what to track, and who it belongs to):** fully derived from ZSD28 + ZSD29 + ZMM48 — no dependency on Final or PROJECT_TRACKING, and no manual copy-paste. Re-run `seed_from_excel.py` against a fresh export any time and it picks up new OTs automatically, including ones that were only "planned, not departed yet" in a free-text note.
- **Live status (latest log, actual ETA, POD, vessel):** ocean containers on Hapag-Lloyd and MSC get this from the cron job. Air shipments and CMA CGM containers still need `PATCH /api/shipments/:id/update` until an adapter exists for them.
- **Known gap:** one shipment (OT 1160192539, Air Canada Cargo, FORTNA) has no trace at all in ZSD28/ZSD29/ZMM48 — it was apparently entered by hand outside the normal data flow. If this happens again, it likely means someone typed it straight into PROJECT_TRACKING without it ever hitting SAP — worth flagging to whoever owns that process.
- **Data quality note:** the derivation flags container IDs that don't match the standard format (4 letters + 6-7 digits) instead of silently accepting them — it found 2 in this export (a stray space and a stray dash) that are genuine typos in ZMM48, not parsing errors.
