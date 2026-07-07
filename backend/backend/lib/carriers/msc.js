// lib/carriers/msc.js
// Same reasoning as hapag.js: the old direct fetch to msc.com/api/... was
// hitting an unofficial, reverse-engineered endpoint (MSC's real API
// requires registration and a signed data agreement - it was never truly
// public). This renders the actual public tracking page instead and
// captures whichever internal JSON call the page itself makes to fetch
// results, which is the same data a person sees, sourced the same way the
// page itself sources it.
import { renderAndCapture } from '../browser.js';

const FIELD_CANDIDATES = {
  eta: ['eta', 'ETA', 'estimatedArrival', 'estimatedTimeOfArrival'],
  latestLog: ['lastEvent', 'latestEvent', 'status', 'eventName', 'currentStatus', 'lastEventName'],
  pod: ['pod', 'location', 'currentLocation', 'portOfDischarge', 'lastLocation'],
  vessel: ['vessel', 'vesselName', 'currentVessel', 'mainVessel'],
};

export async function checkMSC(container) {
  const trackingUrl = `https://www.msc.com/en/track-a-shipment?container=${container}`;

  try {
    const { capturedJson, evaluated } = await renderAndCapture(trackingUrl, {
      urlIncludes: ['track', 'container', 'shipment'],
      evaluateFn: `(() => { try { return window.__NUXT__ || window.__INITIAL_STATE__ || null; } catch (e) { return null; } })()`,
    });

    const source = capturedJson || evaluated;
    if (!source) {
      return blank(trackingUrl, 'No tracking data found - page may have changed or container not found');
    }

    const eta = deepFind(source, FIELD_CANDIDATES.eta);
    const latestLog = deepFind(source, FIELD_CANDIDATES.latestLog);
    const pod = deepFind(source, FIELD_CANDIDATES.pod);
    const vessel = deepFind(source, FIELD_CANDIDATES.vessel);

    return {
      success: true,
      trackingUrl,
      eta: eta || '',
      latestLog: latestLog || '',
      pod: pod || '',
      company: 'MSC',
      vessel: vessel || '',
    };
  } catch (e) {
    return blank(trackingUrl, String(e.message || e));
  }
}

function blank(trackingUrl, error) {
  return { success: true, trackingUrl, eta: '', latestLog: '', pod: '', company: '', vessel: '', error };
}

function deepFind(obj, candidateNames, depth = 0) {
  if (depth > 6 || obj === null || typeof obj !== 'object') return null;
  const lowerCandidates = candidateNames.map((c) => c.toLowerCase());

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = deepFind(item, candidateNames, depth + 1);
      if (found) return found;
    }
    return null;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (lowerCandidates.includes(key.toLowerCase())) {
      if (typeof value === 'string' || typeof value === 'number') return String(value);
    }
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') {
      const found = deepFind(value, candidateNames, depth + 1);
      if (found) return found;
    }
  }
  return null;
}
