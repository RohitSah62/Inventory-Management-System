import crypto from 'node:crypto';
import { config } from '../config/env.js';

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyBasicToken(base64Token, authConfig = config.auth) {
  try {
    const decoded = Buffer.from(base64Token, 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) return false;
    const username = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);
    return safeEqual(username, authConfig.username) && safeEqual(password, authConfig.password);
  } catch {
    return false;
  }
}

export function createBasicAuthMiddleware(authConfig = config.auth, options = {}) {
  const allowQueryToken = options.allowQueryToken === true;

  return function basicAuthMiddleware(req, res, next) {
    const header = req.headers.authorization || '';
    let token = null;

    if (header.startsWith('Basic ')) {
      token = header.slice(6).trim();
    } else if (allowQueryToken && typeof req.query.auth === 'string' && req.query.auth.trim()) {
      token = req.query.auth.trim();
    }

    if (!token || !verifyBasicToken(token, authConfig)) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Inventory FIFO Dashboard"');
      return res.status(401).json({ error: 'Unauthorized: valid Basic Auth credentials required' });
    }

    req.user = { username: authConfig.username };
    return next();
  };
}
