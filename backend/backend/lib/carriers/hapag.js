// lib/carriers/hapag.js
// Same scraping logic as your original hapag.js, refactored into a plain function
// so both api/hapag.js (manual single lookups) and the cron job can call it directly
// without an HTTP round trip.

export async function checkHapag(container) {
  const prefix = container.slice(0, 4);
  const number = container.slice(4);
  const encoded = `${prefix}%20${number}`;

  const url =
    `https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html?container=${encoded}`;

  const html = await fetchHTML(url);

  const appData = extractAppData(html);
  if (appData && appData.containerData) {
    const c = appData.containerData;
    return {
      success: true,
      trackingUrl: url,
      eta: c.eta || '',
      latestLog: c.lastEventName || '',
      pod: c.lastLocation || '',
      type: c.containerType || '',
      company: 'Hapag-Lloyd',
      vessel: c.vesselName || '',
      movements: c.movements || normalizeEvents(c.containerEvents) || [],
    };
  }

  const movements = extractMovements(html);
  if (!movements.length) return blank(url);

  const summary = summarize(movements);
  return {
    success: true,
    trackingUrl: url,
    eta: summary.eta,
    latestLog: summary.latestLog,
    pod: summary.pod,
    type: summary.type,
    company: summary.company,
    vessel: summary.vessel,
    movements,
  };
}

function blank(url) {
  return { success: true, trackingUrl: url, eta: '', latestLog: '', pod: '', type: '', company: '', vessel: '', movements: [] };
}

async function fetchHTML(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'text/html',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  });
  return await res.text();
}

function extractAppData(html) {
  const marker = 'window.appData = ';
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const jsonStart = start + marker.length;
  const jsonEnd = html.indexOf(';</script>', jsonStart);
  if (jsonEnd === -1) return null;
  try {
    return JSON.parse(html.substring(jsonStart, jsonEnd).trim());
  } catch {
    return null;
  }
}

function normalizeEvents(events) {
  if (!events || !Array.isArray(events)) return [];
  return events.map(e => ({
    status: e.eventName || '',
    location: e.locationName || '',
    date: e.eventDate || '',
    time: e.eventTime || '',
    transport: e.vesselName || '',
  }));
}

function extractMovements(html) {
  const rows = [];
  const regex = /<tr[^>]*>(.*?)<\/tr>/gs;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const cells = [...match[1].matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map(c => clean(c[1]));
    if (cells.length < 3) continue;
    rows.push({ status: cells[0] || '', location: cells[1] || '', date: cells[2] || '', time: cells[3] || '', transport: cells[4] || '' });
  }
  return rows;
}

function clean(str) {
  return str.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function summarize(movements) {
  const parsed = movements
    .map(m => {
      const d = m.date.match(/(\d{4}-\d{2}-\d{2})/);
      return { ...m, parsedDate: d ? d[1] : null };
    })
    .filter(m => m.parsedDate);

  if (!parsed.length) return { eta: '', latestLog: '', pod: '', type: '', company: '', vessel: '' };

  parsed.sort((a, b) => (a.parsedDate < b.parsedDate ? 1 : -1));
  const latest = parsed[0];
  const type = latest.transport.toLowerCase() === 'rail' ? 'Rail' : 'Port';

  let vessel = '';
  if (type === 'Port') {
    vessel = latest.transport !== 'Rail' ? latest.transport : '';
  } else {
    for (let i = 1; i < parsed.length; i++) {
      if (parsed[i].transport && parsed[i].transport.toLowerCase() !== 'rail') {
        vessel = parsed[i].transport;
        break;
      }
    }
  }

  return { eta: latest.parsedDate, latestLog: latest.status, pod: latest.location || '', type, company: 'Hapag-Lloyd', vessel };
}
