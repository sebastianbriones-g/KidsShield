const express = require('express');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const mailer = require('../mailer');
const { JWT_SECRET, rateLimit, authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Verificación estricta y segura de Google ID Token (sin fallbacks inseguros que decodifiquen sin firma)
async function verifyGoogleCredential(credential) {
  if (!credential || typeof credential !== 'string') {
    throw new Error('Credencial de Google no proporcionada o inválida');
  }

  const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!googleRes.ok) {
    const errText = await googleRes.text();
    throw new Error(`Google rechazó la credencial (${googleRes.status}): ${errText}`);
  }

  const data = await googleRes.json();

  if (!data.email) {
    throw new Error('El token de Google no contiene una dirección de correo válida');
  }

  // Si hay un Client ID configurado en producción, verificar que la audiencia (aud) coincida
  const configuredClientId = process.env.GOOGLE_CLIENT_ID;
  if (configuredClientId && configuredClientId.includes('.apps.googleusercontent.com')) {
    if (data.aud !== configuredClientId) {
      console.warn(`[Auth] Advertencia: aud del token (${data.aud}) no coincide con GOOGLE_CLIENT_ID (${configuredClientId})`);
    }
  }

  return {
    email: data.email,
    name: data.name || data.given_name || 'Padre de Familia',
    picture: data.picture || '',
    sub: data.sub
  };
}

// Pre-validation endpoint: Check if an email is already registered
router.get('/check-email', rateLimit({ windowMs: 60000, max: 40 }), async (req, res) => {
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
router.post('/register', rateLimit({ windowMs: 300000, max: 10, message: 'Demasiados intentos de registro. Intenta en unos minutos.' }), async (req, res) => {
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
router.post('/login', rateLimit({ windowMs: 60000, max: 10, message: 'Demasiados intentos de inicio de sesión. Por favor espera un minuto.' }), async (req, res) => {
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
router.post('/forgot-password', async (req, res) => {
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
router.get('/verify-reset-token', async (req, res) => {
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
router.post('/reset-password', async (req, res) => {
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
router.get('/config', (req, res) => {
  const gId = process.env.GOOGLE_CLIENT_ID || '';
  const isConfigured = Boolean(gId && gId.includes('.apps.googleusercontent.com') && !gId.includes('YOUR_GOOGLE_CLIENT_ID'));
  res.json({
    googleClientId: gId,
    isGoogleConfigured: isConfigured
  });
});

// Update Google Client ID from web dashboard (and persist in server/.env)
router.post('/google-config', (req, res) => {
  const { clientId } = req.body;
  if (!clientId || !clientId.trim()) {
    return res.status(400).json({ error: 'El Client ID no puede estar vacío' });
  }
  const cleanId = clientId.trim();
  process.env.GOOGLE_CLIENT_ID = cleanId;

  try {
    const envPath = path.join(__dirname, '../.env');
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

// Login AND Register with Google credential (ID Token) con verificación segura
router.post('/google', async (req, res) => {
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
    console.error('[Auth] Error verificando Google token:', err.message);
    res.status(401).json({ error: 'Token de Google inválido o rechazado: ' + err.message });
  }
});

// Check current user session & subscription
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const sub = await db.getFamilySubscription(req.user.familyId);
    res.json({ authenticated: true, user: req.user, subscription: sub });
  } catch (e) {
    res.status(500).json({ error: 'Error al obtener sesión' });
  }
});

module.exports = router;
