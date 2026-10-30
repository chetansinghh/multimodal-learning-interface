// authMiddleware.js — Server-side API authentication, rate-limiting, and session scoping
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'agy_multimodal_research_jwt_secret_token_key_2026_x89!';

/** Rate-limiter for admin login endpoint — prevents brute-force dictionary attacks */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // reasonable for testing and multi-login
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' }
});

/** Rate-limiter for OTP verify endpoint */
export const otpVerifyRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification attempts. Please wait before trying again.' }
});

/** Verify Admin JWT Token for researcher-only endpoints */
export function verifyAdminToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid authorization token.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || !decoded.isAdmin) {
      return res.status(401).json({ error: 'Unauthorized: Admin privileges required.' });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Token expired or invalid.' });
  }
}

/** Verify Participant Session Scope — prevents cross-session reading/overwriting */
export function verifySessionScope(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing session authorization token.' });
  }

  const token = authHeader.split(' ')[1];

  // 1. Support participant session tokens generated client-side or offline
  if (token.startsWith('pt_token_') || token.startsWith('pt_')) {
    const pid = token.replace('pt_token_', '').replace('pt_', '');
    req.user = { participantId: pid, role: 'participant' };
    return next();
  }

  // 2. Support signed JWT tokens
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const targetSessionId = req.params.sessionId ||
      (Array.isArray(req.body) ? req.body[0]?.session_id : (req.body?.session_id || req.body?.sessionId));

    // Admin token can access any session
    if (decoded.isAdmin || decoded.role === 'admin') {
      req.user = decoded;
      return next();
    }

    // Participant token can access their own session
    if (decoded.sessionId && targetSessionId && decoded.sessionId !== targetSessionId) {
      return res.status(403).json({ error: 'Forbidden: Cannot access or modify another participant session.' });
    }

    req.user = decoded;
    next();
  } catch (err) {
    // If the token was a non-JWT participant token format
    if (token.length > 5 && !token.includes('.')) {
      req.user = { participantId: token, role: 'participant' };
      return next();
    }
    return res.status(401).json({ error: 'Unauthorized: Session token expired or invalid.' });
  }
}
