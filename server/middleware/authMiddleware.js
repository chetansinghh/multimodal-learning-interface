// authMiddleware.js — Server-side API authentication, rate-limiting, and session scoping
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'agy_multimodal_research_jwt_secret_token_key_2026_x89!';

/** Rate-limiter for admin login endpoint — prevents brute-force dictionary attacks */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // max 5 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' }
});

/** Rate-limiter for OTP verify endpoint — forces all guessing through live server */
export const otpVerifyRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10-minute window (matches OTP lifetime)
  max: 10,                   // max 10 verify attempts per IP per window
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
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const targetSessionId = req.params.sessionId || req.body.session_id || req.body.sessionId;

    // Admin token can access any session
    if (decoded.isAdmin) {
      req.user = decoded;
      return next();
    }

    // Participant token can only access their own session_id
    if (!decoded.sessionId || (targetSessionId && decoded.sessionId !== targetSessionId)) {
      return res.status(403).json({ error: 'Forbidden: Cannot access or modify another participant session.' });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Session token expired or invalid.' });
  }
}
