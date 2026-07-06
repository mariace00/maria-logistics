// api/hapag.js — unchanged public interface, now just calls the shared adapter
import { checkHapag } from '../lib/carriers/hapag.js';

export default async function handler(req, res) {
  const container = req.query.container;
  if (!container) {
    return res.status(400).json({ success: false, error: 'Missing container parameter' });
  }
  try {
    const result = await checkHapag(container);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Hapag-Lloyd fetch failed' });
  }
}
