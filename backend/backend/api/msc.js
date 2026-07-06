// api/msc.js — unchanged public interface, now just calls the shared adapter
import { checkMSC } from '../lib/carriers/msc.js';

export default async function handler(req, res) {
  const container = req.query.container;
  if (!container) {
    return res.status(400).json({ success: false, error: 'Missing container parameter' });
  }
  try {
    const result = await checkMSC(container);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ success: false, error: 'MSC fetch failed' });
  }
}
