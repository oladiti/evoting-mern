import ActivityLog from '../models/ActivityLog.js';
import { getClientIp } from '../utils/index.js';

export async function logActivity({ user, username, action, description = '', entity_type = null, entity_id = null, req = null }) {
  try {
    await ActivityLog.create({
      user: user || null,
      username,
      action,
      description,
      entity_type,
      entity_id: entity_id != null ? String(entity_id) : null,
      ip_address: req ? getClientIp(req) : null,
      user_agent: req?.headers?.['user-agent'] ? String(req.headers['user-agent']).slice(0, 500) : null,
    });
  } catch (err) {
    console.error('[activity] failed to log:', err.message);
  }
}
