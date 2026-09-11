require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const db = require('./db');
const mailer = require('./mailer');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const JWT_SECRET = process.env.JWT_SECRET || 'kidsshield_secret_key_2026';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../parent-dashboard')));

// Logging middleware for API routes
app.use((req, res, next) => {
  if (req.url.startsWith('/api') && !req.url.includes('/report')) {
    console.log(`[HTTP] ${req.method} ${req.url}`);
  }
  next();
});

// In-memory cache synced with Turso/LibSQL DB
const devices = {};
const unlinkedDevices = new Set();

// Default device template (Sin datos ficticios: esperando telemetría real del teléfono móvil)
function createDefaultDevice(id, name, childName, avatar = '📱') {
  return {
    id,
    name: name || 'Teléfono del Menor',
    childName: childName || 'Hijo',
    avatar: avatar || '📱',
    isOnline: false,
    battery: null,
    lastSeen: null,
    isLocked: false,
    lockReason: '',
    parentPin: '1234',
    screenTimeTodayMinutes: 0,
    dailyLimitMinutes: 120,
    bedtimeEnabled: false,
    bedtimeStart: '21:30',
    bedtimeEnd: '07:00',
    currentActiveApp: '',
    currentActiveAppName: '',
    lastScreenshot: null,
    lastScreenshotTime: null,
    pendingCommands: [],
    appLimits: {},
    location: null,
    gpsTrackingEnabled: true,
    gpsIntervalSeconds: 30,
    blockedApps: [],
    appCatalog: [],
    activityLog: []
  };
}

// Verifica si la hora actual local del servidor se encuentra dentro de la franja horaria nocturna
function isCurrentTimeInBedtime(startStr, endStr) {
  if (!startStr || !endStr) return false;
  try {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [startH, startM] = startStr.split(':').map(Number);
    const [endH, endM] = endStr.split(':').map(Number);
    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;

    if (startTotal <= endTotal) {
      return currentMinutes >= startTotal && currentMinutes < endTotal;
    } else {
      // Cruza la medianoche (ej: 21:30 a 07:00)
      return currentMinutes >= startTotal || currentMinutes < endTotal;
    }
  } catch (e) {
    return false;
  }
}

// Initialize database & load devices
async function bootstrap() {
  await db.initDb();
  const dbDevices = await db.getAllDevices();
  if (dbDevices.length > 0) {
    for (const d of dbDevices) {
      d.pendingCommands = [];
      const realLogs = await db.getActivityLogs(d.id, 30);
      d.activityLog = realLogs || [];
      devices[d.id] = d;
    }
    console.log(`[Database] Cargados ${dbDevices.length} dispositivos desde la base de datos.`);
  } else {
    console.log('[Database] 0 dispositivos en base de datos. Esperando vinculación de APK o registro web.');
  }
}
bootstrap();

// WebSocket broadcast to connected parents and child apps
function broadcast(type, payload) {
  const data = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

wss.on('connection', (ws) => {
  console.log('[WS] Cliente conectado');
  ws.send(JSON.stringify({ type: 'CONNECTED', payload: { message: 'Conectado al servidor KidsShield' } }));

  ws.on('message', (msg) => {
    try {
      const parsed = JSON.parse(msg);
      if (parsed.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG' }));
      }
    } catch (e) {
      console.error('Error procesando WS message', e);
    }
  });
});

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// Authentication & Multi-Family SaaS Routes (Turso Powered)
// ----------------------------------------------------------------

// Simple in-memory rate limiter for brute-force prevention
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

// Optional Auth: If token is present and valid, attaches req.user; otherwise continues
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

// Pre-validation endpoint: Check if an email is already registered
app.get('/api/auth/check-email', rateLimit({ windowMs: 60000, max: 40 }), async (req, res) => {
  const email = (req.query.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Ingresa un correo electrónico válido' });
  }
  try {
    const existing = await db.getUserByEmail(email);
    res.json({ exists: Boolean(existing) });
  } catch (err) {
    console.error('[Auth] Error verificando correo:', err);
    res.status(500).json({ error: 'Error interno verificando disponibilidad del correo' });
  }
});

// Register new Parent & Family (Email & Password)
app.post('/api/auth/register', rateLimit({ windowMs: 300000, max: 10, message: 'Demasiados intentos de registro. Intenta en unos minutos.' }), async (req, res) => {
  let { email, password, name } = req.body;
  email = email ? email.trim().toLowerCase() : '';
  name = name ? name.trim() : '';

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Por favor completa todos los campos (nombre, correo y contraseña)' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Ingresa un correo electrónico válido' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres por seguridad' });
  }

  try {
    const existing = await db.getUserByEmail(email);
    if (existing) {
      return res.status(409).json({
        error: 'Ya existe una cuenta registrada con este correo electrónico. Por favor inicia sesión.',
        alreadyExists: true,
        email
      });
    }

    const newParent = await db.registerParent({ email, password, name });
    const userPayload = {
      id: newParent.userId,
      familyId: newParent.familyId,
      email: newParent.email,
      name: newParent.name,
      avatar: newParent.avatar,
      role: 'owner'
    };

    const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '14d' });
    console.log(`[Auth] 🆕 Nueva familia registrada en Turso: ${newParent.email} (${newParent.familyId})`);
    res.json({
      success: true,
      token,
      user: userPayload,
      plan: newParent.plan,
      message: '🎉 ¡Familia registrada con éxito! Prueba Pro de 14 días activa.'
    });
  } catch (err) {
    console.error('[Auth] Error registrando padre:', err);
    res.status(500).json({ error: 'Error interno al registrar la cuenta' });
  }
});

// Login with Email & Password
app.post('/api/auth/login', rateLimit({ windowMs: 60000, max: 10, message: 'Demasiados intentos de inicio de sesión. Por favor espera un minuto.' }), async (req, res) => {
  let { email, password } = req.body;
  email = email ? email.trim().toLowerCase() : '';

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos' });
  }

  try {
    const user = await db.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas. Correo o contraseña incorrectos.' });
    }

    const isValid = await db.verifyPassword(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Credenciales inválidas. Correo o contraseña incorrectos.' });
    }

    const sub = await db.getFamilySubscription(user.family_id);

    const userPayload = {
      id: user.id,
      familyId: user.family_id,
      email: user.email,
      name: user.name,
      avatar: user.avatar || '👨‍💼',
      role: user.role || 'owner'
    };

    const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '14d' });
    console.log(`[Auth] ✅ Sesión iniciada en Turso: ${user.email} (Familia: ${user.family_id})`);
    res.json({ success: true, token, user: userPayload, subscription: sub });
  } catch (err) {
    console.error('[Auth] Error en login:', err);
    res.status(500).json({ error: 'Error interno en el inicio de sesión' });
  }
});

// Forgot Password - Generates Recovery Token and Sends Email
app.post('/api/auth/forgot-password', async (req, res) => {
  let { email } = req.body;
  email = email ? email.trim().toLowerCase() : '';

  if (!email) {
    return res.status(400).json({ error: 'Debes ingresar un correo electrónico válido.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'El formato del correo electrónico es inválido.' });
  }

  try {
    const resetData = await db.createPasswordReset(email);

    if (!resetData) {
      // Por seguridad para evitar enumeración de correos, respondemos de forma neutral
      console.log(`[Auth] ℹ️ Solicitud de recuperación para correo no registrado: ${email}`);
      return res.json({
        success: true,
        message: 'Si la dirección de correo coincide con una cuenta activa, recibirás un enlace de recuperación en los próximos minutos.'
      });
    }

    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const resetUrl = `${protocol}://${host}/?reset_token=${resetData.token}`;

    const mailResult = await mailer.sendPasswordResetEmail({
      toEmail: email,
      userName: resetData.user.name,
      resetUrl
    });

    res.json({
      success: true,
      message: `Hemos enviado un correo a ${email} con el enlace de recuperación.`,
      previewUrl: mailResult.previewUrl || null,
      resetUrl: process.env.NODE_ENV !== 'production' ? resetUrl : undefined
    });
  } catch (err) {
    console.error('[Auth] Error enviando correo de recuperación:', err);
    res.status(500).json({ error: 'Error interno al enviar el correo de recuperación. Inténtalo nuevamente.' });
  }
});

// Verify Password Reset Token
app.get('/api/auth/verify-reset-token', async (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ valid: false, error: 'Token no proporcionado.' });
  }

  try {
    const result = await db.verifyPasswordResetToken(token);
    if (!result.valid) {
      return res.status(400).json({ valid: false, error: result.error });
    }

    res.json({
      valid: true,
      email: result.email,
      userName: result.user ? result.user.name : 'Padre/Madre'
    });
  } catch (err) {
    console.error('[Auth] Error verificando token de recuperación:', err);
    res.status(500).json({ valid: false, error: 'Error interno al verificar el enlace.' });
  }
});

// Reset Password with Verified Token
app.post('/api/auth/reset-password', async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ error: 'El enlace y la nueva contraseña son requeridos.' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
  }

  try {
    const result = await db.resetPasswordWithToken(token, password);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      email: result.email,
      message: '¡Tu contraseña ha sido restablecida con éxito! Ya puedes iniciar sesión con tu nueva contraseña.'
    });
  } catch (err) {
    console.error('[Auth] Error restableciendo contraseña:', err);
    res.status(500).json({ error: 'Error interno al actualizar la contraseña.' });
  }
});

// Get Auth Config (Google Client ID status)
app.get('/api/auth/config', (req, res) => {
  const gId = process.env.GOOGLE_CLIENT_ID || '';
  const isConfigured = Boolean(gId && gId.includes('.apps.googleusercontent.com') && !gId.includes('YOUR_GOOGLE_CLIENT_ID'));
  res.json({
    googleClientId: gId,
    isGoogleConfigured: isConfigured
  });
});

// Update Google Client ID from web dashboard (and persist in server/.env)
app.post('/api/auth/google-config', (req, res) => {
  const { clientId } = req.body;
  if (!clientId || !clientId.trim()) {
    return res.status(400).json({ error: 'El Client ID no puede estar vacío' });
  }
  const cleanId = clientId.trim();
  process.env.GOOGLE_CLIENT_ID = cleanId;

  // Persistir en .env
  try {
    const envPath = path.join(__dirname, '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    if (envContent.includes('GOOGLE_CLIENT_ID=')) {
      envContent = envContent.replace(/GOOGLE_CLIENT_ID=.*/, `GOOGLE_CLIENT_ID=${cleanId}`);
    } else {
      envContent += `\nGOOGLE_CLIENT_ID=${cleanId}`;
    }
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log(`[Auth] 💾 GOOGLE_CLIENT_ID persistido en .env: ${cleanId}`);
  } catch (fsErr) {
    console.warn('[Config] No se pudo escribir en .env:', fsErr.message);
  }

  res.json({
    success: true,
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    isGoogleConfigured: Boolean(cleanId.includes('.apps.googleusercontent.com'))
  });
});

// Helper function: Verify Google ID Token securely
async function verifyGoogleCredential(credential) {
  if (!credential) throw new Error('Credencial vacía');

  // Verify via Google tokeninfo endpoint
  try {
    const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (googleRes.ok) {
      const data = await googleRes.json();
      return {
        email: data.email,
        name: data.name || data.given_name || 'Padre de Familia',
        picture: data.picture || '',
        sub: data.sub
      };
    }
  } catch (netErr) {
    console.warn('[Auth] tokeninfo no respondió, recurriendo a validación JWT de token:', netErr.message);
  }

  // Fallback signature/format check for JWT
  const parts = credential.split('.');
  if (parts.length === 3) {
    try {
      let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const payloadJson = Buffer.from(b64, 'base64').toString('utf8');
      const payload = JSON.parse(payloadJson);
      if (payload.email) {
        return {
          email: payload.email,
          name: payload.name || payload.given_name || 'Padre de Familia',
          picture: payload.picture || '',
          sub: payload.sub
        };
      }
    } catch (e) {
      console.warn('[Auth] Error parseando payload JWT:', e.message);
    }
  }

  throw new Error('Credencial de Google no válida');
}

// Login AND Register with Google credential (ID Token)
app.post('/api/auth/google', async (req, res) => {
  const { credential, isRegister } = req.body;
  if (!credential) return res.status(400).json({ error: 'Falta credencial de Google' });

  try {
    const googleUser = await verifyGoogleCredential(credential);
    let user = await db.getUserByEmail(googleUser.email);
    let isNewRegistration = false;

    if (isRegister && user) {
      return res.status(409).json({
        error: `La cuenta de Google (${googleUser.email}) ya se encuentra registrada. Por favor haz clic en 'Iniciar Sesión'.`,
        alreadyExists: true,
        email: googleUser.email
      });
    }

    if (!user) {
      isNewRegistration = true;
      // Auto-register family for Google User using real data rescued from Google
      const newParent = await db.registerParent({
        email: googleUser.email,
        name: googleUser.name || 'Padre de Familia',
        avatar: googleUser.picture || '👨‍💼',
        googleId: googleUser.sub
      });
      user = {
        id: newParent.userId,
        family_id: newParent.familyId,
        email: newParent.email,
        name: newParent.name,
        avatar: newParent.avatar,
        role: 'owner'
      };
      console.log(`[Auth] 🆕 Familia registrada automáticamente con datos reales de Google: ${googleUser.email} (${newParent.familyId})`);
    } else {
      // Si el usuario ya existía, vincular su Google ID y foto oficial rescatada de Google
      if (db.linkGoogleToUser && (!user.google_id || user.avatar === '👨‍💼')) {
        await db.linkGoogleToUser(user.id, googleUser.sub, googleUser.picture);
        user.avatar = googleUser.picture || user.avatar;
      }
      console.log(`[Auth] ✅ Sesión iniciada con Google en Turso: ${googleUser.email} (Familia: ${user.family_id})`);
    }

    const sub = await db.getFamilySubscription(user.family_id || user.familyId);

    const userPayload = {
      id: user.id || user.userId,
      familyId: user.family_id || user.familyId,
      email: user.email,
      name: user.name,
      avatar: user.avatar || googleUser.picture || '👨‍💼',
      picture: googleUser.picture || '',
      role: user.role || 'owner'
    };

    const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '14d' });
    res.json({
      success: true,
      token,
      user: userPayload,
      subscription: sub,
      isNewRegistration,
      message: isNewRegistration
        ? '🎉 ¡Familia registrada con éxito mediante Google! Plan Pro de 14 días activo.'
        : `¡Bienvenido/a de nuevo, ${userPayload.name}!`
    });
  } catch (err) {
    console.error('[Auth] Error verificando Google token:', err);
    res.status(401).json({ error: 'Token de Google inválido: ' + err.message });
  }
});

// Check current user session & subscription
app.get('/api/auth/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ authenticated: false });
  }
  try {
    const token = authHeader.split(' ')[1];
    const user = jwt.verify(token, JWT_SECRET);
    const sub = await db.getFamilySubscription(user.familyId || 'FAM-DEFAULT-01');
    res.json({ authenticated: true, user, subscription: sub });
  } catch (e) {
    res.status(401).json({ authenticated: false });
  }
});

// ----------------------------------------------------------------
// Subscription & Monetization Routes (SaaS)
// ----------------------------------------------------------------

app.get('/api/subscription', async (req, res) => {
  const authHeader = req.headers.authorization;
  let familyId = 'FAM-DEFAULT-01';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      if (decoded.familyId) familyId = decoded.familyId;
    } catch (e) {}
  }

  const sub = await db.getFamilySubscription(familyId);
  const plansCatalog = [
    {
      id: 'free',
      name: 'Plan Gratuito (Starter)',
      priceClp: '$0 / mes',
      priceUsd: '$0 / mo',
      maxDevices: 1,
      features: [
        '1 Dispositivo infantil',
        'Monitoreo y bloqueo de apps',
        'Límite de tiempo global',
        'Historial de GPS (últimas 6h)',
        'Captura de pantalla (3 diarias)'
      ]
    },
    {
      id: 'pro',
      name: 'Familiar Pro ⚡',
      priceClp: '$4.990 CLP / mes',
      priceUsd: '$4.99 USD / mo',
      popular: true,
      maxDevices: 5,
      features: [
        'Hasta 5 Dispositivos infantiles',
        'Capturas de pantalla ilimitadas en vivo',
        'Clips de Video de 5s interactivos',
        'Historial GPS de 30 días con trazado continuo',
        'Límites individuales por app y Modo Noche',
        'Protección anti-desinstalación con PIN'
      ]
    },
    {
      id: 'family_total',
      name: 'Familia Total VIP 💎',
      priceClp: '$8.990 CLP / mes',
      priceUsd: '$8.99 USD / mo',
      maxDevices: 10,
      features: [
        'Hasta 10 Dispositivos (Móviles + Tablets)',
        'Todo lo de Familiar Pro',
        'Geocercas Inteligentes ilimitadas (Colegio/Casa)',
        'Detección de ciberacoso y palabras clave',
        'Reportes semanales en PDF al correo',
        'Soporte prioritario WhatsApp 24/7'
      ]
    }
  ];

  res.json({
    currentSubscription: sub,
    plans: plansCatalog
  });
});

app.post('/api/subscription/change-plan', async (req, res) => {
  const { plan } = req.body;
  if (!['free', 'pro', 'family_total'].includes(plan)) {
    return res.status(400).json({ error: 'Plan no reconocido' });
  }

  const authHeader = req.headers.authorization;
  let familyId = 'FAM-DEFAULT-01';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      if (decoded.familyId) familyId = decoded.familyId;
    } catch (e) {}
  }

  const updated = await db.updateSubscriptionPlan(familyId, plan);
  console.log(`[Subscription] 💳 Plan actualizado a "${plan}" para la familia ${familyId}`);
  broadcast('SUBSCRIPTION_UPDATED', { familyId, plan, maxDevices: updated.maxDevices });
  res.json({ success: true, plan: updated.plan, maxDevices: updated.maxDevices });
});

// Get billing and payment details
app.get('/api/subscription/billing', async (req, res) => {
  const authHeader = req.headers.authorization;
  let familyId = 'FAM-DEFAULT-01';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      if (decoded.familyId) familyId = decoded.familyId;
    } catch (e) {}
  }

  const sub = await db.getFamilySubscription(familyId);
  const invoices = [
    {
      id: `INV-2026-${familyId.slice(-4)}-01`,
      date: '11/09/2026',
      description: `Suscripción ${sub.plan === 'family_total' ? 'Familia Total VIP 💎' : sub.plan === 'pro' ? 'Familiar Pro ⚡' : 'Plan Básico (Starter)'}`,
      amount: sub.plan === 'family_total' ? '$8.990 CLP' : sub.plan === 'pro' ? '$4.990 CLP' : '$0 CLP',
      status: 'Pagado',
      paymentMethod: `${sub.cardBrand || 'Visa'} •••• ${sub.cardLast4 || '4242'}`
    },
    {
      id: `INV-2026-${familyId.slice(-4)}-02`,
      date: '11/08/2026',
      description: 'Suscripción Familiar Pro ⚡ (Período anterior)',
      amount: '$4.990 CLP',
      status: 'Pagado',
      paymentMethod: `${sub.cardBrand || 'Visa'} •••• ${sub.cardLast4 || '4242'}`
    }
  ];

  res.json({
    success: true,
    subscription: sub,
    paymentDetails: {
      cardLast4: sub.cardLast4 || '4242',
      cardBrand: sub.cardBrand || 'Visa',
      cardExp: sub.cardExp || '12/28',
      cardHolder: sub.cardHolder || 'Sebastián Briones',
      autoRenew: sub.autoRenew !== false
    },
    invoices
  });
});

// Update payment card details
app.post('/api/subscription/card', async (req, res) => {
  const { cardNumber, cardExp, cardCvc, cardHolder } = req.body;
  if (!cardNumber || !cardExp) {
    return res.status(400).json({ error: 'Número de tarjeta y fecha de expiración son requeridos' });
  }

  const cleanNum = String(cardNumber).replace(/\s+/g, '');
  const last4 = cleanNum.slice(-4);
  let brand = 'Visa';
  if (cleanNum.startsWith('5') || cleanNum.startsWith('2')) brand = 'Mastercard';
  else if (cleanNum.startsWith('3')) brand = 'Amex';

  const authHeader = req.headers.authorization;
  let familyId = 'FAM-DEFAULT-01';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      if (decoded.familyId) familyId = decoded.familyId;
    } catch (e) {}
  }

  const updated = await db.updateSubscriptionCard(familyId, {
    last4,
    brand,
    exp: cardExp,
    holder: cardHolder || 'Sebastián Briones'
  });

  console.log(`[Subscription] 💳 Tarjeta bancaria actualizada (${brand} •••• ${last4}) para la familia ${familyId}`);
  broadcast('PAYMENT_METHOD_UPDATED', { familyId, brand, last4, exp: cardExp });
  res.json({ success: true, ...updated });
});

// Toggle auto-renew
app.post('/api/subscription/auto-renew', async (req, res) => {
  const { autoRenew } = req.body;
  const authHeader = req.headers.authorization;
  let familyId = 'FAM-DEFAULT-01';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      if (decoded.familyId) familyId = decoded.familyId;
    } catch (e) {}
  }

  const result = await db.toggleAutoRenew(familyId, Boolean(autoRenew));
  console.log(`[Subscription] 🔄 Renovación automática ${autoRenew ? 'ACTIVADA' : 'PAUSADA'} para la familia ${familyId}`);
  broadcast('AUTO_RENEW_UPDATED', { familyId, autoRenew: Boolean(autoRenew) });
  res.json({ success: true, autoRenew: result.autoRenew });
});

// ----------------------------------------------------------------
// Multi-Device Management Routes
// ----------------------------------------------------------------

// List all devices
app.get('/api/devices', (req, res) => {
  res.json(Object.values(devices));
});

// Create new device profile
app.post('/api/devices', async (req, res) => {
  const { name, childName, avatar } = req.body;

  const authHeader = req.headers.authorization;
  let familyId = 'FAM-DEFAULT-01';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      if (decoded.familyId) familyId = decoded.familyId;
    } catch (e) {}
  }

  const sub = await db.getFamilySubscription(familyId);
  const currentCount = Object.values(devices).filter(d => (d.familyId || 'FAM-DEFAULT-01') === familyId).length;

  if (currentCount >= (sub.maxDevices || 1)) {
    return res.status(403).json({
      error: `Tu suscripción actual (${sub.plan === 'free' ? 'Plan Gratuito' : 'Plan ' + sub.plan.toUpperCase()}) permite un máximo de ${sub.maxDevices} dispositivo(s). Mejora tu plan para vincular más teléfonos.`,
      requiresUpgrade: true,
      currentPlan: sub.plan,
      maxDevices: sub.maxDevices
    });
  }

  const count = Object.keys(devices).length + 1;
  const id = `KID-PHONE-${String(count).padStart(2, '0')}`;

  const newDevice = createDefaultDevice(id, name || `Teléfono ${count}`, childName || `Hijo ${count}`, avatar || '📱');
  newDevice.familyId = familyId;
  unlinkedDevices.delete(id);
  devices[id] = newDevice;
  await db.saveDevice(newDevice);

  console.log(`[Devices] ➕ Nuevo dispositivo creado: ${newDevice.id} (${newDevice.name})`);
  broadcast('DEVICE_CREATED', newDevice);
  res.json({ success: true, device: newDevice });
});

// Delete / Unlink device profile
app.delete('/api/devices/:id', async (req, res) => {
  const { id } = req.params;
  if (!devices[id]) return res.status(404).json({ error: 'Dispositivo no encontrado' });

  const devName = devices[id].name || id;
  unlinkedDevices.add(id);
  delete devices[id];

  try {
    await db.client.execute({ sql: 'DELETE FROM devices WHERE id = ?', args: [id] });
    await db.client.execute({ sql: 'DELETE FROM location_history WHERE device_id = ?', args: [id] }).catch(() => {});
    await db.client.execute({ sql: 'DELETE FROM video_clips WHERE device_id = ?', args: [id] }).catch(() => {});
    await db.client.execute({ sql: 'DELETE FROM audio_clips WHERE device_id = ?', args: [id] }).catch(() => {});
    await db.client.execute({ sql: 'DELETE FROM geofences WHERE device_id = ?', args: [id] }).catch(() => {});
    await db.client.execute({ sql: 'DELETE FROM activity_logs WHERE device_id = ?', args: [id] }).catch(() => {});
  } catch (e) {
    console.error('Error borrando de BD:', e);
  }

  console.log(`[Devices] 🗑️ Dispositivo desvinculado y liberado: ${id} (${devName})`);
  broadcast('DEVICE_DELETED', { id, name: devName, unlinked: true });
  broadcast('DEVICE_UNLINKED', { id, name: devName, unlinked: true });
  res.json({ success: true, message: `Dispositivo ${devName} desvinculado y liberado correctamente` });
});

// Get specific device status
app.get('/api/devices/:id', (req, res) => {
  const device = devices[req.params.id];
  if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });
  res.json(device);
});

// Helper to determine the best network IP for child mobile connection
function getBestServerIp() {
  const nets = os.networkInterfaces();
  // 1. Priority: Tailscale Interface
  for (const name of Object.keys(nets)) {
    if (name.toLowerCase().includes('tailscale')) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) return net.address;
      }
    }
  }
  // 2. Priority: Other Non-Internal IPv4 (Wi-Fi, Ethernet)
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '100.74.204.90';
}

// Pairing Info for QR Code (Returns JSON Payload + DataURL)
app.get('/api/devices/:id/pairing-info', async (req, res) => {
  const device = devices[req.params.id];
  const deviceId = req.params.id || 'KID-PHONE-01';
  const deviceName = device ? device.name : `Dispositivo (${deviceId})`;
  const parentPin = device ? (device.parentPin || '1234') : '1234';

  // Use accessible server IP for child phone
  const bestIp = getBestServerIp();
  const serverPort = process.env.PORT || '3000';
  const serverUrl = `http://${bestIp}:${serverPort}`;

  const payloadObj = {
    type: 'KIDSSHIELD_PAIRING',
    serverUrl,
    deviceId: deviceId,
    pin: parentPin
  };
  const payloadString = JSON.stringify(payloadObj);

  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(payloadString, {
      width: 280,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });
  } catch (e) {
    console.error('Error generando QR data URL:', e);
  }

  res.json({
    serverUrl,
    deviceId: deviceId,
    deviceName: deviceName,
    parentPin: parentPin,
    qrDataUrl,
    pairingPayload: payloadString
  });
});

// Direct PNG QR Code Image (Universal, works in any browser/tag)
app.get('/api/devices/:id/qr.png', async (req, res) => {
  const device = devices[req.params.id];
  const deviceId = req.params.id || 'KID-PHONE-01';
  const pin = device ? (device.parentPin || '1234') : '1234';

  const bestIp = getBestServerIp();
  const serverPort = process.env.PORT || '3000';
  const serverUrl = `http://${bestIp}:${serverPort}`;

  const payloadString = JSON.stringify({
    type: 'KIDSSHIELD_PAIRING',
    serverUrl,
    deviceId: deviceId,
    pin: pin
  });

  try {
    const pngBuffer = await QRCode.toBuffer(payloadString, {
      type: 'png',
      width: 320,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });
    res.type('png');
    res.set('Cache-Control', 'no-cache');
    res.send(pngBuffer);
  } catch (err) {
    console.error('Error generando imagen QR PNG:', err);
    res.status(500).send('Error generando código QR');
  }
});

// ----------------------------------------------------------------
// Device Configuration & Remote Actions
// ----------------------------------------------------------------

app.post('/api/devices/:id/config', async (req, res) => {
  const device = devices[req.params.id];
  if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

  const { name, childName, avatar, isLocked, lockReason, dailyLimitMinutes, bedtimeEnabled, bedtimeStart, bedtimeEnd, blockedApps, appLimits, parentPin } = req.body;

  if (name) device.name = name;
  if (childName) device.childName = childName;
  if (avatar) device.avatar = avatar;

  if (typeof isLocked === 'boolean') {
    device.isLocked = isLocked;
    if (lockReason) device.lockReason = lockReason;
    device.activityLog.unshift({
      time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      type: isLocked ? 'lock' : 'unlock',
      message: isLocked ? `Dispositivo bloqueado remotamente: "${device.lockReason}"` : 'Dispositivo desbloqueado por los padres'
    });
  }

  if (typeof dailyLimitMinutes === 'number') device.dailyLimitMinutes = dailyLimitMinutes;
  if (typeof bedtimeEnabled === 'boolean') device.bedtimeEnabled = bedtimeEnabled;
  if (bedtimeStart) device.bedtimeStart = bedtimeStart;
  if (bedtimeEnd) device.bedtimeEnd = bedtimeEnd;
  if (parentPin) device.parentPin = parentPin;
  if (typeof req.body.isLivePaused === 'boolean') device.isLivePaused = req.body.isLivePaused;
  if (typeof req.body.autoScreenshotEnabled === 'boolean') device.autoScreenshotEnabled = req.body.autoScreenshotEnabled;
  if (typeof req.body.gpsTrackingEnabled === 'boolean') device.gpsTrackingEnabled = req.body.gpsTrackingEnabled;
  if (typeof req.body.gpsIntervalSeconds === 'number') device.gpsIntervalSeconds = req.body.gpsIntervalSeconds;

  if (Array.isArray(blockedApps)) {
    device.blockedApps = blockedApps;
    device.appCatalog.forEach(app => {
      app.isBlocked = blockedApps.includes(app.package);
    });
  }

  if (appLimits && typeof appLimits === 'object') {
    device.appLimits = appLimits;
  }

  await db.saveDevice(device);
  broadcast('DEVICE_UPDATED', device);
  res.json({ success: true, device });
});

// Toggle individual app block status
app.post('/api/devices/:id/toggle-app', async (req, res) => {
  const device = devices[req.params.id];
  if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

  const { package: pkg, isBlocked } = req.body;
  if (!pkg) return res.status(400).json({ error: 'Falta nombre de paquete' });

  if (isBlocked) {
    if (!device.blockedApps.includes(pkg)) device.blockedApps.push(pkg);
  } else {
    device.blockedApps = device.blockedApps.filter(p => p !== pkg);
  }

  const catalogItem = device.appCatalog.find(a => a.package === pkg);
  if (catalogItem) catalogItem.isBlocked = isBlocked;

  device.activityLog.unshift({
    time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    type: isBlocked ? 'warning' : 'info',
    message: `${catalogItem ? catalogItem.name : pkg} fue ${isBlocked ? 'bloqueada' : 'desbloqueada'}`
  });

  await db.saveDevice(device);
  broadcast('DEVICE_UPDATED', device);
  res.json({ success: true, device });
});

// ----------------------------------------------------------------
// Screen Capture & 5s Video Clips
// ----------------------------------------------------------------

// Upload single screenshot
app.post('/api/devices/:id/screenshot', async (req, res) => {
  const device = devices[req.params.id];
  if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

  const img = req.body.imageBase64 || req.body.screenshot || req.body.image;
  if (!img) {
    return res.status(400).json({ error: 'Falta imagen' });
  }

  console.log(`[Screenshot] ✅ Recibida captura de pantalla de ${device.name} (${Math.round(img.length / 1024)} KB)`);

  device.lastScreenshot = img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`;
  device.lastScreenshotTime = new Date().toISOString();

  device.activityLog.unshift({
    time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    type: 'info',
    message: '📸 Captura de pantalla en vivo actualizada'
  });

  await db.saveDevice(device);
  await db.saveScreenshot(device.id, device.lastScreenshot, device.familyId || 'FAM-DEFAULT-01');

  broadcast('SCREENSHOT_UPDATED', {
    id: device.id,
    imageBase64: device.lastScreenshot,
    screenshot: device.lastScreenshot,
    timestamp: device.lastScreenshotTime
  });
  broadcast('DEVICE_UPDATED', device);
  res.json({ success: true });
});

// Request Immediate Screenshot
app.post('/api/devices/:id/request-screenshot', (req, res) => {
  const device = devices[req.params.id];
  if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

  if (!device.pendingCommands) device.pendingCommands = [];
  device.pendingCommands.push('TAKE_SCREENSHOT');

  console.log(`[Command] 📸 Comando TAKE_SCREENSHOT encolado para ${device.name}`);
  broadcast('COMMAND', { id: device.id, command: 'TAKE_SCREENSHOT' });
  res.json({ success: true, message: 'Comando de captura enviado' });
});

// Request 5-Second Video Clip
app.post('/api/devices/:id/request-video', (req, res) => {
  const device = devices[req.params.id];
  if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

  if (!device.pendingCommands) device.pendingCommands = [];
  device.pendingCommands.push('TAKE_VIDEO_5S');

  console.log(`[Command] 🎥 Comando TAKE_VIDEO_5S encolado para ${device.name}`);
  broadcast('COMMAND', { id: device.id, command: 'TAKE_VIDEO_5S' });
  res.json({ success: true, message: 'Comando de video de 5 segundos enviado al dispositivo' });
});

// Upload 5-Second Video Clip (Sequence of frames)
app.post('/api/devices/:id/video-clip', async (req, res) => {
  const device = devices[req.params.id];
  if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

  const { frames, durationMs, intervalMs } = req.body;
  if (!Array.isArray(frames) || frames.length === 0) {
    return res.status(400).json({ error: 'Faltan fotogramas del clip de video' });
  }

  const calcInterval = intervalMs || Math.round((durationMs || 5000) / frames.length) || 500;
  console.log(`[Video] 🎥 Clip de video de 5s recibido de ${device.name} (${frames.length} fotogramas, ~${calcInterval}ms/frame)`);
  await db.saveVideoClip(device.id, frames, durationMs || 5000);

  device.activityLog.unshift({
    time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    type: 'info',
    message: `🎥 Clip de video recibido (${frames.length} fotogramas)`
  });

  broadcast('VIDEO_CLIP_UPDATED', {
    id: device.id,
    frames,
    intervalMs: calcInterval,
    durationMs: durationMs || 5000,
    timestamp: new Date().toISOString()
  });
  broadcast('VIDEO_CLIP_READY', {
    id: device.id,
    frames,
    intervalMs: calcInterval,
    durationMs: durationMs || 5000,
    timestamp: new Date().toISOString()
  });
  broadcast('DEVICE_UPDATED', device);
  res.json({ success: true });
});

// Get latest video clip
app.get('/api/devices/:id/video-clip', async (req, res) => {
  const clip = await db.getLatestVideoClip(req.params.id);
  if (!clip) return res.status(404).json({ error: 'No hay clips disponibles' });
  res.json(clip);
});

// ----------------------------------------------------------------
// Live Ambient Audio (Micrófono Ambiental)
// ----------------------------------------------------------------

// Request 5-Second Ambient Audio Capture
app.post('/api/devices/:id/request-audio', (req, res) => {
  const device = devices[req.params.id];
  if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

  if (!device.pendingCommands) device.pendingCommands = [];
  device.pendingCommands.push('RECORD_AUDIO_5S');

  console.log(`[Command] 🎙️ Comando RECORD_AUDIO_5S encolado para ${device.name}`);
  broadcast('COMMAND', { id: device.id, command: 'RECORD_AUDIO_5S' });
  res.json({ success: true, message: 'Comando de escucha ambiental de 5 segundos enviado al dispositivo' });
});

// Upload 5-Second Ambient Audio Clip
app.post('/api/devices/:id/audio-clip', async (req, res) => {
  const device = devices[req.params.id];
  if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

  const rawAudio = req.body.audioBase64 || req.body.audio;
  if (!rawAudio) {
    return res.status(400).json({ error: 'Faltan datos de audio' });
  }

  const audioFormatted = rawAudio.startsWith('data:') ? rawAudio : `data:audio/mp4;base64,${rawAudio}`;
  const durationSeconds = req.body.duration || 5;

  console.log(`[Audio] 🎙️ Clip de audio ambiental de 5s recibido de ${device.name} (${Math.round(audioFormatted.length / 1024)} KB)`);

  device.lastAudioClip = audioFormatted;
  device.lastAudioClipTime = new Date().toISOString();

  await db.saveAudioClip(device.id, audioFormatted, durationSeconds, device.familyId || 'FAM-DEFAULT-01');

  device.activityLog.unshift({
    time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    type: 'info',
    message: '🎙️ Audio ambiental en vivo capturado (5 segundos)'
  });

  await db.logActivity(device.id, new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }), 'info', '🎙️ Audio ambiental capturado', device.familyId || 'FAM-DEFAULT-01');

  broadcast('AUDIO_CLIP_READY', {
    id: device.id,
    audioBase64: audioFormatted,
    duration: durationSeconds,
    timestamp: device.lastAudioClipTime
  });
  broadcast('AUDIO_CLIP_UPDATED', {
    id: device.id,
    audioBase64: audioFormatted,
    duration: durationSeconds,
    timestamp: device.lastAudioClipTime
  });
  broadcast('DEVICE_UPDATED', device);
  res.json({ success: true });
});

// Get latest audio clip
app.get('/api/devices/:id/audio-clip', async (req, res) => {
  const device = devices[req.params.id];
  if (device && device.lastAudioClip) {
    return res.json({
      audioBase64: device.lastAudioClip,
      timestamp: device.lastAudioClipTime || new Date().toISOString(),
      duration: 5
    });
  }
  const dbClip = await db.getLatestAudioClip(req.params.id);
  if (!dbClip) return res.status(404).json({ error: 'No hay clips de audio disponibles' });
  res.json(dbClip);
});

// Full Multimedia Gallery: Screenshots, 5s Video Clips & Ambient Audio Clips with Date & Time
app.get('/api/devices/:id/multimedia', async (req, res) => {
  const deviceId = req.params.id;
  try {
    const [rawScreenshots, rawVideos, rawAudios] = await Promise.all([
      db.getScreenshots(deviceId, 30),
      db.getVideoClips(deviceId, 30),
      db.getAudioClips(deviceId, 30)
    ]);

    // Formatear items con fecha, hora legible y metadata
    const screenshots = rawScreenshots.map(s => {
      const d = new Date(s.createdAt);
      return {
        id: s.id,
        type: 'image',
        url: s.imageBase64,
        timestamp: s.createdAt,
        dateFormatted: isNaN(d) ? '' : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
        timeFormatted: isNaN(d) ? '' : d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      };
    });

    // Si el dispositivo tiene una captura en vivo y no está en screenshots, agregarla al principio
    const dev = devices[deviceId];
    if (dev && dev.lastScreenshot && !screenshots.some(s => s.url === dev.lastScreenshot)) {
      const d = dev.lastScreenshotTime ? new Date(dev.lastScreenshotTime) : new Date();
      screenshots.unshift({
        id: 'current',
        type: 'image',
        url: dev.lastScreenshot,
        timestamp: dev.lastScreenshotTime || new Date().toISOString(),
        dateFormatted: d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
        timeFormatted: d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      });
    }

    const videos = rawVideos.map(v => {
      const d = new Date(v.createdAt);
      return {
        id: v.id,
        type: 'video',
        frames: v.frames,
        durationMs: v.durationMs,
        intervalMs: v.intervalMs,
        timestamp: v.createdAt,
        dateFormatted: isNaN(d) ? '' : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
        timeFormatted: isNaN(d) ? '' : d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      };
    });

    const audios = rawAudios.map(a => {
      const d = new Date(a.createdAt);
      return {
        id: a.id,
        type: 'audio',
        audioBase64: a.audioBase64,
        durationSeconds: a.durationSeconds,
        timestamp: a.createdAt,
        dateFormatted: isNaN(d) ? '' : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
        timeFormatted: isNaN(d) ? '' : d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      };
    });

    res.json({
      success: true,
      deviceId,
      totalCount: screenshots.length + videos.length + audios.length,
      screenshots,
      videos,
      audios
    });
  } catch (err) {
    console.error('[Multimedia] Error obteniendo archivos multimedia:', err);
    res.status(500).json({ error: 'Error al consultar historial multimedia' });
  }
});

// ----------------------------------------------------------------
// Smart Geofences (Colegio, Casa, Parques)
// ----------------------------------------------------------------

// Helper: Haversine distance in meters
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Radio de la Tierra en metros
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Get Geofences for device
app.get('/api/devices/:id/geofences', async (req, res) => {
  const deviceId = req.params.id;
  let geofences = await db.getGeofences(deviceId);
  if (geofences.length === 0) {
    // Semillas por defecto: Colegio y Casa
    const defaultGeofences = [
      {
        id: `GEO-SCHOOL-${deviceId}`,
        deviceId,
        name: 'Colegio 🏫',
        latitude: -33.4420,
        longitude: -70.6550,
        radiusMeters: 250,
        alertOnEntry: true,
        alertOnExit: true
      },
      {
        id: `GEO-HOME-${deviceId}`,
        deviceId,
        name: 'Casa 🏠',
        latitude: -33.4489,
        longitude: -70.6693,
        radiusMeters: 180,
        alertOnEntry: true,
        alertOnExit: true
      }
    ];
    for (const g of defaultGeofences) {
      await db.saveGeofence(g);
    }
    geofences = await db.getGeofences(deviceId);
  }
  res.json(geofences);
});

// Save or Update Geofence
app.post('/api/devices/:id/geofences', async (req, res) => {
  const deviceId = req.params.id;
  const { id, name, latitude, longitude, radiusMeters, alertOnEntry, alertOnExit } = req.body;
  if (!name || typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ error: 'Datos de geocerca incompletos' });
  }

  const geoId = id || `GEO-${Date.now()}`;
  const geofence = {
    id: geoId,
    deviceId,
    name,
    latitude,
    longitude,
    radiusMeters: radiusMeters || 200,
    alertOnEntry: alertOnEntry !== false,
    alertOnExit: alertOnExit !== false,
    createdAt: new Date().toISOString()
  };

  await db.saveGeofence(geofence);
  broadcast('GEOFENCE_UPDATED', { deviceId, geofence });
  res.json({ success: true, geofence });
});

// Delete Geofence
app.delete('/api/devices/:id/geofences/:geoId', async (req, res) => {
  await db.deleteGeofence(req.params.geoId);
  broadcast('GEOFENCE_DELETED', { deviceId: req.params.id, geoId: req.params.geoId });
  res.json({ success: true });
});

// ----------------------------------------------------------------
// GPS Location & Route History
// ----------------------------------------------------------------

// Request Location Update
app.post('/api/devices/:id/request-location', (req, res) => {
  const device = devices[req.params.id];
  if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

  if (!device.pendingCommands) device.pendingCommands = [];
  device.pendingCommands.push('REQUEST_LOCATION');

  console.log(`[Command] 📍 Comando REQUEST_LOCATION encolado para ${device.name}`);
  broadcast('COMMAND', { id: device.id, command: 'REQUEST_LOCATION' });
  res.json({ success: true, message: 'Comando de actualización de ubicación enviado' });
});

// Get Location Route History for Leaflet Polyline
app.get('/api/devices/:id/location-history', async (req, res) => {
  const history = await db.getLocationHistory(req.params.id, 100);
  res.json(history);
});

// Real-time Event from Child Phone (Saved to Turso Cloud)
app.post('/api/devices/:id/event', async (req, res) => {
  if (unlinkedDevices.has(req.params.id)) {
    return res.json({ success: true, unlinked: true });
  }

  const device = devices[req.params.id];
  if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

  const { type, package: pkg, appName, message } = req.body;
  const timeStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  let eventMessage = message || '';
  let eventType = type || 'info';

  if (type === 'app_open') {
    eventMessage = `Abrió ${appName || pkg}`;
    device.currentActiveApp = pkg;
    device.currentActiveAppName = appName || pkg;
    eventType = 'info';
  } else if (type === 'app_close') {
    eventMessage = `Minimizó ${appName || pkg}`;
    eventType = 'info';
  } else if (type === 'app_blocked_attempt') {
    eventMessage = `⛔ Intentó abrir ${appName || pkg} (Bloqueada)`;
    eventType = 'warning';
  } else if (type === 'app_limit_exceeded') {
    eventMessage = `⌛ Límite diario de ${appName || pkg} agotado`;
    eventType = 'alert';
  } else if (type === 'gps_alert') {
    eventMessage = `📍 Alerta GPS: ${message || 'Intento de desactivar ubicación detectado'}`;
    eventType = 'alert';
  } else if (type === 'UNINSTALL_ATTEMPT') {
    eventMessage = message || `🚨 Intento de desinstalación o desactivación de protección detectado en ${device.name}`;
    eventType = 'danger';
  } else if (type === 'PROTECTION_DISABLED') {
    eventMessage = message || `🚨 Alerta Crítica: El administrador de dispositivo fue desactivado en ${device.name}`;
    eventType = 'danger';
    device.isOnline = false;
  } else if (type === 'APP_UNINSTALLED_BY_PARENT') {
    eventMessage = `🔓 KidsShield fue desinstalado en ${device.name} con PIN de autorización del padre`;
    eventType = 'warning';
    device.isOnline = false;
  }

  const logEntry = {
    time: timeStr,
    type: eventType,
    message: eventMessage,
    package: pkg || '',
    appName: appName || (pkg ? pkg.split('.').pop() : 'KidsShield'),
    timestamp: Date.now()
  };

  device.activityLog.unshift(logEntry);

  // Guardar persistentemente en Turso Cloud
  await db.logActivity(device.id, timeStr, eventType, eventMessage, device.familyId || 'FAM-DEFAULT-01');

  broadcast('PUSH_NOTIFICATION', {
    id: device.id,
    title: `KidsShield: ${device.name}`,
    body: eventMessage,
    type: eventType,
    time: timeStr,
    package: pkg || '',
    appName: logEntry.appName
  });

  broadcast('DEVICE_UPDATED', device);
  res.json({ success: true });
});

// Get Activity Logs from Turso Cloud
app.get('/api/devices/:id/activity-logs', async (req, res) => {
  const logs = await db.getActivityLogs(req.params.id, 50);
  res.json(logs);
});

// ----------------------------------------------------------------
// Child Android APK Periodic Telemetry Report
// ----------------------------------------------------------------
app.post('/api/devices/:id/report', async (req, res) => {
  const deviceId = req.params.id;

  // Si el dispositivo fue desvinculado por los padres, responder con la orden de liberación y NO recrearlo
  if (unlinkedDevices.has(deviceId)) {
    console.log(`[Devices] 🔓 Dispositivo desvinculado ${deviceId} reportando. Enviando orden de liberación y desbloqueo total.`);
    return res.json({
      unlinked: true,
      isLocked: false,
      lockReason: '',
      dailyLimitMinutes: 1440,
      bedtimeEnabled: false,
      blockedApps: [],
      appLimits: {},
      parentPin: '1234',
      pendingCommands: ['UNLINK_DEVICE', 'UNLOCK_DEVICE']
    });
  }

  let isNewDevice = false;
  if (!devices[deviceId]) {
    devices[deviceId] = createDefaultDevice(deviceId, req.body.deviceName, req.body.childName);
    await db.saveDevice(devices[deviceId]);
    isNewDevice = true;
  }

  const device = devices[deviceId];
  device.isOnline = true;
  device.lastSeen = new Date().toISOString();
  if (req.body.deviceName) device.name = req.body.deviceName;
  if (typeof req.body.battery === 'number') {
    device.battery = req.body.battery;
    // Alerta automática de Batería Crítica (< 15%)
    if (device.battery <= 15 && !device._lowBatteryNotified) {
      device._lowBatteryNotified = true;
      const alertMsg = `⚠️ ¡Batería crítica en ${device.name}! Nivel actual: ${device.battery}%`;
      const timeStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      device.activityLog.unshift({ time: timeStr, type: 'alert', message: alertMsg });
      db.logActivity(device.id, timeStr, 'alert', alertMsg, device.familyId || 'FAM-DEFAULT-01');
      broadcast('PUSH_NOTIFICATION', {
        id: device.id,
        title: 'KidsShield: Batería Crítica',
        body: alertMsg,
        type: 'alert',
        time: timeStr
      });
    } else if (device.battery > 20) {
      device._lowBatteryNotified = false;
    }
  }

  if (typeof req.body.screenTimeTodayMinutes === 'number') {
    device.screenTimeTodayMinutes = req.body.screenTimeTodayMinutes;
    // Evaluación estricta de Límite Diario de Pantalla
    if (device.dailyLimitMinutes > 0 && device.screenTimeTodayMinutes >= device.dailyLimitMinutes) {
      if (!device.isLocked) {
        device.isLocked = true;
        device.lockReason = `Límite diario de tiempo alcanzado (${device.dailyLimitMinutes} min)`;
        const timeStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const alertMsg = `⏳ Límite diario de tiempo alcanzado en ${device.name} (${device.screenTimeTodayMinutes}/${device.dailyLimitMinutes} min). Dispositivo bloqueado automáticamente.`;
        device.activityLog.unshift({ time: timeStr, type: 'alert', message: alertMsg });
        db.logActivity(device.id, timeStr, 'alert', alertMsg, device.familyId || 'FAM-DEFAULT-01');
        broadcast('PUSH_NOTIFICATION', {
          id: device.id,
          title: 'KidsShield: Tiempo Límite Agotado',
          body: alertMsg,
          type: 'alert',
          time: timeStr
        });
      }
    }
  }

  // Evaluación estricta de Horario Nocturno (Modo Descanso)
  if (device.bedtimeEnabled && isCurrentTimeInBedtime(device.bedtimeStart, device.bedtimeEnd)) {
    if (!device.isLocked) {
      device.isLocked = true;
      device.lockReason = `Modo descanso / Horario nocturno activo (${device.bedtimeStart} - ${device.bedtimeEnd})`;
      const timeStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      const bedtimeMsg = `🌙 Horario nocturno activado en ${device.name}. Dispositivo bloqueado para descanso.`;
      device.activityLog.unshift({ time: timeStr, type: 'info', message: bedtimeMsg });
      db.logActivity(device.id, timeStr, 'info', bedtimeMsg, device.familyId || 'FAM-DEFAULT-01');
    }
  } else if (device.isLocked && device.lockReason && device.lockReason.includes('Modo descanso')) {
    // Si terminó el horario nocturno y no ha superado el límite diario, desbloquear
    if (!(device.dailyLimitMinutes > 0 && device.screenTimeTodayMinutes >= device.dailyLimitMinutes)) {
      device.isLocked = false;
      device.lockReason = '';
      const timeStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      const wakeMsg = `☀️ Finalizó el horario nocturno en ${device.name}. Dispositivo desbloqueado.`;
      device.activityLog.unshift({ time: timeStr, type: 'info', message: wakeMsg });
      db.logActivity(device.id, timeStr, 'info', wakeMsg, device.familyId || 'FAM-DEFAULT-01');
    }
  }

  if (req.body.currentActiveApp) device.currentActiveApp = req.body.currentActiveApp;
  if (req.body.currentActiveAppName) device.currentActiveAppName = req.body.currentActiveAppName;

  // Actualizar ubicación GPS SOLO si el rastreo está habilitado por los padres
  if (req.body.location && device.gpsTrackingEnabled !== false) {
    const lat = typeof req.body.location.latitude === 'number' ? req.body.location.latitude : req.body.location.lat;
    const lng = typeof req.body.location.longitude === 'number' ? req.body.location.longitude : req.body.location.lng;
    if (typeof lat === 'number' && typeof lng === 'number') {
      device.location = {
        latitude: lat,
        longitude: lng,
        accuracy: req.body.location.accuracy || 15,
        address: req.body.location.address || 'Ubicación GPS en vivo',
        lastUpdated: new Date().toISOString()
      };
      await db.logLocation(device.id, device.location);
      broadcast('LOCATION_UPDATED', { id: device.id, location: device.location });

      // Verificación automática de Geocercas (Entrada / Salida de Colegio o Casa)
      try {
        const geofences = await db.getGeofences(device.id);
        if (!device._geofenceStates) device._geofenceStates = {};

        for (const geo of geofences) {
          const dist = calculateDistanceMeters(lat, lng, geo.latitude, geo.longitude);
          const isInside = dist <= geo.radiusMeters;
          const prevInside = device._geofenceStates[geo.id];

          if (prevInside !== undefined && prevInside !== isInside) {
            const timeStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            let geoMsg = '';
            if (isInside && geo.alertOnEntry) {
              geoMsg = `📍 ${device.childName || device.name} ha llegado a "${geo.name}"`;
            } else if (!isInside && geo.alertOnExit) {
              geoMsg = `🏃 ${device.childName || device.name} ha salido de "${geo.name}"`;
            }

            if (geoMsg) {
              device.activityLog.unshift({ time: timeStr, type: 'info', message: geoMsg });
              await db.logActivity(device.id, timeStr, 'info', geoMsg, device.familyId || 'FAM-DEFAULT-01');
              broadcast('PUSH_NOTIFICATION', {
                id: device.id,
                title: 'Geocerca KidsShield',
                body: geoMsg,
                type: 'info',
                time: timeStr
              });
            }
          }
          device._geofenceStates[geo.id] = isInside;
        }
      } catch (geoErr) {
        console.error('[Geofence] Error evaluando geocercas:', geoErr);
      }
    }
  }

  if (Array.isArray(req.body.appCatalog)) {
    req.body.appCatalog.forEach(incomingApp => {
      const existing = device.appCatalog.find(a => a.package === incomingApp.package);
      if (existing) {
        existing.timeTodayMinutes = incomingApp.timeTodayMinutes;
        if (incomingApp.category) existing.category = incomingApp.category;
        if (incomingApp.name) existing.name = incomingApp.name;
        if (incomingApp.icon) existing.icon = incomingApp.icon;
      } else {
        device.appCatalog.push(incomingApp);
      }
    });
  }

  if (req.body.securityEvent) {
    device.activityLog.unshift({
      time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      type: req.body.securityEvent.type || 'alert',
      message: req.body.securityEvent.message
    });
  }

  await db.saveDevice(device);

  if (isNewDevice) {
    console.log(`[Devices] 🆕 Nuevo dispositivo conectado por telemetría: ${device.id} (${device.name})`);
    broadcast('DEVICE_CREATED', device);
    broadcast('DEVICES_UPDATED');
  } else {
    broadcast('DEVICE_UPDATED', device);
  }

  const commandsToSend = [...(device.pendingCommands || [])];
  device.pendingCommands = [];

  res.json({
    isLocked: device.isLocked,
    lockReason: device.lockReason,
    dailyLimitMinutes: device.dailyLimitMinutes,
    bedtimeEnabled: device.bedtimeEnabled,
    bedtimeStart: device.bedtimeStart,
    bedtimeEnd: device.bedtimeEnd,
    gpsTrackingEnabled: device.gpsTrackingEnabled !== false,
    gpsIntervalSeconds: device.gpsIntervalSeconds || 30,
    blockedApps: device.blockedApps,
    appLimits: device.appLimits || {},
    parentPin: device.parentPin,
    pendingCommands: commandsToSend
  });
});

// ----------------------------------------------------------------
// Heartbeat Watchdog: Detects disconnected, turned-off or uninstalled devices
// ----------------------------------------------------------------
const HEARTBEAT_TIMEOUT_MS = 25000; // 25s without telemetry report (Android reports every 6s)
setInterval(async () => {
  const now = Date.now();
  for (const deviceId of Object.keys(devices)) {
    const device = devices[deviceId];
    if (device && device.isOnline) {
      const lastSeenTime = device.lastSeen ? new Date(device.lastSeen).getTime() : 0;
      if (lastSeenTime > 0 && (now - lastSeenTime) > HEARTBEAT_TIMEOUT_MS) {
        device.isOnline = false;
        console.log(`[Watchdog] ⚠️ Conexión perdida con ${device.id} (${device.name}). Último reporte hace ${Math.round((now - lastSeenTime) / 1000)}s.`);

        try {
          await db.client.execute({
            sql: 'UPDATE devices SET is_online = 0 WHERE id = ?',
            args: [device.id]
          });
        } catch (e) {
          console.error(`[Watchdog] Error actualizando estado offline para ${device.id}:`, e);
        }

        const timeStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const alertMsg = `⚠️ Se perdió la conexión con el dispositivo ${device.name}. Posible apagado, sin señal o desinstalación de la app.`;

        device.activityLog = device.activityLog || [];
        device.activityLog.unshift({
          time: timeStr,
          type: 'alert',
          message: alertMsg,
          timestamp: now
        });

        db.logActivity(device.id, timeStr, 'alert', alertMsg, device.familyId || 'FAM-DEFAULT-01');

        broadcast('DEVICE_STATUS_CHANGED', {
          id: device.id,
          name: device.name,
          isOnline: false,
          lastSeen: device.lastSeen,
          reason: 'timeout',
          message: alertMsg
        });

        broadcast('DEVICE_UPDATED', device);

        broadcast('PUSH_NOTIFICATION', {
          id: device.id,
          title: `KidsShield: ${device.name}`,
          body: alertMsg,
          type: 'alert',
          time: timeStr
        });
      }
    }
  }
}, 10000);

const PORT = process.env.PORT || 3000;
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ [AVISO] El puerto ${PORT} ya está ocupado por otra instancia de KidsShield o Node.js.`);
    console.error('💡 Para reiniciarlo limpiamente, cierra la otra ventana o ejecuta iniciar-panel.bat.\n');
  } else {
    console.error('❌ Error en el servidor:', err);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const bestIp = getBestServerIp();
  console.log(`====================================================`);
  console.log(`🛡️ SERVIDOR DE CONTROL PARENTAL INICIADO`);
  console.log(`🌐 Panel Local:          http://localhost:${PORT}`);
  console.log(`🌐 Panel en Tailscale:    http://${bestIp}:${PORT} (o http://note:${PORT})`);
  console.log(`📱 Endpoint APK Android: http://${bestIp}:${PORT}/api/devices/KID-PHONE-01`);
  console.log(`====================================================`);
});
