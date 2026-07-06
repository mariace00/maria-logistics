// api/cron/poll.js
// Vercel Cron hits this on a schedule (see vercel.json). It is NOT publicly callable —
// it checks for the CRON_SECRET header that Vercel automatically attaches to cron requests.
import { checkHapag } from '../../lib/carriers/hapag.js';
import { checkMSC } from '../../lib/carriers/msc.js';
import { getShipmentsDueForCheck, applyCheckResult, markCheckFailed } from '../../lib/db.js';

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const due = await getShipmentsDueForCheck();
  const results = [];

  for (const shipment of due) {
    try {
      const check = shipment.carrier === 'MSC'
        ? await checkMSC(shipment.container)
        : await checkHapag(shipment.container);

      const changes = await applyCheckResult(shipment, check);
      results.push({ container: shipment.container, changed: changes.length > 0, changes });
    } catch (e) {
      await markCheckFailed(shipment.id, String(e.message || e));
      results.push({ container: shipment.container, error: String(e.message || e) });
    }
    // Small delay between requests so we don't hammer carrier sites in one burst.
    await new Promise(r => setTimeout(r, 1500));
  }

  return res.status(200).json({
    success: true,
    checked: due.length,
    changed: results.filter(r => r.changed).length,
    results,
  });
}
