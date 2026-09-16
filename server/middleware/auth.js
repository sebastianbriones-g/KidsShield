const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'kidsshield_secret_key_2026';

// In-memory rate limiter for brute-force prevention
const rateLimitMap = new Map();
function rateLimit({ windowMs = 60000, max = 15, message = 'Demasiadas solicitudes. Por favor espera un momento.' } = {}) {
  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const key = `${req.path}_${ip}`;
    const now = Date.now();
    const record = rateLimitMap.get(key) || { count: 0, resetTime: now + windowMs };
    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
    } else {
      record.count++;
    }
    rateLimitMap.set(key, record);
    if (record.count > max) {
      return res.status(429).json({ error: message, retryAfterSeconds: Math.ceil((record.resetTime - now) / 1000) });
    }
    next();
  };
}

// Middleware para verificar token JWT en rutas administrativas
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({ error: 'Acceso no autorizado. Inicia sesión para continuar.' });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token de sesión inválido o expirado. Inicia sesión nuevamente.' });
  }
}

// Optional Auth: Si el token es válido inyecta req.user, sino prosigue sin req.user
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (e) {}
  }
  next();
}

module.exports = {
  JWT_SECRET,
  rateLimit,
  authenticateToken,
  optionalAuth
};
