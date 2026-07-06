#!/usr/bin/env python3
"""
seed/seed_from_excel.py

Writes the shipment master list — derived directly from ZSD28, ZSD29, and ZMM48
by derive_shipment_master.py — into Postgres. Final and PROJECT_TRACKING are
not used at all; this replicates their logic straight from the SAP source data.

Usage:
    pip install openpyxl psycopg2-binary --break-system-packages
    POSTGRES_URL="postgres://..." python3 seed_from_excel.py "Containers_Report_-_0625.xlsm"

Safe to re-run: upserts on (ot, container), so a fresh weekly export just updates
existing rows and adds new ones.

Note: this seeds MASTER data only (what to track, and who it belongs to). The
"latest_log" / actual "eta" / "pod" / "vessel" fields are left for the cron job
(api/cron/poll.js, using hapag.js/msc.js) to fill in by actually checking the
carrier's tracking page — those fields don't exist in any of these three sheets.
"""
import sys
import os
import psycopg2
from derive_shipment_master import main as derive


def main(path):
    shipments, so_master, recovered = derive(path)

    print(f"Derived {len(shipments)} shipments from ZSD28 + ZSD29 + ZMM48.")
    if recovered:
        print(f"  {len(recovered)} recovered from free-text mentions only (no tracking data yet): {recovered}")
    flagged = [s['ot'] for s in shipments.values() if s.get('containerFlagged')]
    if flagged:
        print(f"  ⚠ {len(flagged)} container ID(s) look malformed in source data: {flagged}")

    conn = psycopg2.connect(os.environ['POSTGRES_URL'])
    cur = conn.cursor()

    inserted, updated = 0, 0
    for s in shipments.values():
        eta_val = None if s.get("plannedEta") in (None, "tbd", "TBD") else s["plannedEta"]
        weight_val = s["weight"] if isinstance(s.get("weight"), (int, float)) else None
        cur.execute("""
            INSERT INTO shipments (ot, container, tracking, ship_type, carrier, vessel, mode, pod,
                                    destination, state, weight, eta, latest_log, air_tracking_url,
                                    check_error)
            VALUES (%(ot)s, %(container)s, %(tracking)s, %(shipType)s, %(carrier)s, %(vessel)s,
                    %(mode)s, %(pod)s, %(dest)s, NULL, %(weight_val)s, %(eta)s, %(lastKnownLog)s,
                    %(airTrackingUrl)s, %(flag_note)s)
            ON CONFLICT (ot, container) DO UPDATE SET
                tracking = EXCLUDED.tracking, ship_type = EXCLUDED.ship_type,
                carrier = COALESCE(shipments.carrier, EXCLUDED.carrier),
                mode = EXCLUDED.mode, pod = COALESCE(shipments.pod, EXCLUDED.pod),
                destination = EXCLUDED.destination, weight = EXCLUDED.weight,
                eta = COALESCE(shipments.eta, EXCLUDED.eta),
                air_tracking_url = EXCLUDED.air_tracking_url,
                check_error = EXCLUDED.check_error, updated_at = now()
            RETURNING id, (xmax = 0) AS was_insert
        """, {
            **s, "eta": eta_val, "weight_val": weight_val,
            "vessel": s.get("lastKnownVessel"),
            "flag_note": "Container ID malformed in ZMM48 — needs manual check" if s.get("containerFlagged") else None,
        })
        shipment_id, was_insert = cur.fetchone()
        inserted += was_insert
        updated += not was_insert

        cur.execute("DELETE FROM sales_orders WHERE shipment_id = %s", (shipment_id,))
        for o in s["orders"]:
            cur.execute("""
                INSERT INTO sales_orders (shipment_id, so_number, customer, project, contact, type, notes)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (shipment_id, o.get("so"), o.get("customer"), o.get("project"), o.get("contact"),
                  o.get("city"), o.get("raw_note")))

    conn.commit()
    cur.close()
    conn.close()
    print(f"Seed complete: {inserted} inserted, {updated} updated.")


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: python3 seed_from_excel.py <path-to-xlsm>")
        sys.exit(1)
    main(sys.argv[1])
