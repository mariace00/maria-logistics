// lib/carriers/msc.js
// Same reasoning as hapag.js - routed through your Cloudflare Worker's
// /msc path instead of hitting msc.com directly from Vercel.
const WORKER_BASE = process.env.TRACKING_WORKER_URL || 'https://white-mouse-309b.maria-carrallo.workers.dev';

export async function checkMSC(container) {
  const trackingUrl = `${WORKER_BASE}/msc?container=${container}`;

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
      company: data.company || 'MSC',
      vessel: data.vessel || '',
    };
  } catch (e) {
    return blank(container, String(e.message || e));
  }
}

function blank(container, error) {
  return {
    success: true,
    trackingUrl: `${WORKER_BASE}/msc?container=${container}`,
    eta: '', latestLog: '', pod: '', company: '', vessel: '',
    error,
  };
}
