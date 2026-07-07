// lib/carriers/hapag.js
// Uses a real (headless) browser instead of a plain fetch, since Hapag-Lloyd's
// tracking page is a JavaScript-rendered app - confirmed by fetching it
// directly and finding only "this app doesn't work without JavaScript
// enabled" in the raw HTML. This actually executes the page's JS so the
// site's own code populates the tracking data.
//
// Because the exact internal API shape isn't something we could verify
// ahead of time (no network access to hapag-lloyd.com from the build
// environment), this tries two strategies and a flexible field search
// rather than one brittle fixed schema:
//   1. Capture any JSON network response the page itself makes that looks
//      tracking-related.
//   2. Fall back to reading `window.appData` directly from the rendered
//      page's JS runtime (the original scraper's marker, which may still
//      be set as a real JS global even though it's no longer in the raw
//      HTML source).
import { renderAndCapture } from '../browser.js';

const FIELD_CANDIDATES = {
  eta: ['eta', 'ETA', 'estimatedArrival', 'estimatedTimeOfArrival'],
  latestLog: ['lastEventName', 'lastEvent', 'latestEvent', 'status', 'eventName', 'currentStatus'],
  pod: ['lastLocation', 'location', 'currentLocation', 'portOfDischarge', 'pod'],
  vessel: ['vesselName', 'vessel', 'currentVessel', 'mainVessel'],
};

export async function checkHapag(container) {
  const prefix = container.slice(0, 4);
  const number = container.slice(4);
  const trackingUrl =
    `https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html?container=${prefix}%20${number}`;

  try {
    const { capturedJson, evaluated, seenResponses, pageTitle, htmlLength, html } = await renderAndCapture(trackingUrl, {
      urlIncludes: ['track', 'container', 'tracing'],
      evaluateFn: `(() => { try { return window.appData || null; } catch (e) { return null; } })()`,
    });

    const source = capturedJson || evaluated;
    if (!source) {
      return {
        ...blank(trackingUrl, 'No tracking data found - page may have changed or container not found'),
        debug: {
          pageTitle,
          htmlLength,
          jsonResponsesSeen: seenResponses.slice(0, 15),
          htmlSnippet: html ? html.replace(/\s+/g, ' ').slice(0, 800) : '',
        },
      };
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
      company: 'Hapag-Lloyd',
      vessel: vessel || '',
    };
  } catch (e) {
    return blank(trackingUrl, String(e.message || e));
  }
}

function blank(trackingUrl, error) {
  return { success: true, trackingUrl, eta: '', latestLog: '', pod: '', company: '', vessel: '', error };
}

/** Recursively searches obj for the first key (case-insensitive) matching
 *  any of candidateNames, returning its value if it's a string or number. */
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
