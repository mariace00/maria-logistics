// lib/carriers/msc.js
export async function checkMSC(container) {
  const url = `https://www.msc.com/api/containertracking/${container}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
  });
  const data = await response.json();

  return {
    success: true,
    trackingUrl: `https://www.msc.com/en/track-a-shipment?container=${container}`,
    eta: data?.eta || '',
    latestLog: data?.lastEvent || '',
    pod: data?.pod || '',
    type: data?.type || '',
    company: 'MSC',
    vessel: data?.vessel || '',
    movements: data?.movements || [],
  };
}
