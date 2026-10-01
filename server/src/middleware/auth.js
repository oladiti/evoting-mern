import { verifyAccessToken } from '../services/tokens.js';

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.ev_access;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const user = await verifyAccessToken(token);
    if (!user) return res.status(401).json({ error: 'Session expired, please log in again' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Authentication error' });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

export async function optionalAuth(req, res, next) {
  try {
    const token = req.cookies?.ev_access;
    if (token) {
      const user = await verifyAccessToken(token);
      if (user) req.user = user;
    }
  } catch {
    /* ignore — treat as guest */
  }
  next();
}
