// lib/carriers/hapag.js
// Calls your existing Cloudflare Worker instead of fetching Hapag-Lloyd
// directly. Hapag-Lloyd's site sits behind Cloudflare's bot protection,
// which flags requests coming from Vercel/AWS as generic cloud traffic and
// blocks them - but a request from Cloudflare's own network (your Worker)
// to another Cloudflare-protected site doesn't trigger that same check.
// Same fetch-and-parse logic either way; only *where* it runs changed.
const WORKER_BASE = process.env.TRACKING_WORKER_URL || 'https://white-mouse-309b.maria-carrallo.workers.dev';

export async function checkHapag(container) {
  const trackingUrl = `${WORKER_BASE}/track?container=${container}`;

  try {
    const res = await fetch(trackingUrl, { headers: { Accept: 'application/json' } });
    const data = await res.json();

    if (!data || data.success !== true) {
      return blank(container, data?.error || 'Worker returned an unsuccessful response');
    }

    return {
      success: true,
      trackingUrl: data.trackingUrl || trackingUrl,
      eta: data.eta || '',
      latestLog: data.latestLog || '',
      pod: data.pod || '',
      company: data.company || 'Hapag-Lloyd',
      vessel: data.vessel || '',
      _debugRaw: data, // TEMPORARY - remove once we confirm the real field shape
    };
  } catch (e) {
    return blank(container, String(e.message || e));
  }
}

function blank(container, error) {
  return {
    success: true,
    trackingUrl: `${WORKER_BASE}/track?container=${container}`,
    eta: '', latestLog: '', pod: '', company: '', vessel: '',
    error,
  };
}
