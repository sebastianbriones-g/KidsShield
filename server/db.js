require('dotenv').config();
const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');

const dbUrl = process.env.TURSO_DATABASE_URL || `file:${path.join(__dirname, 'kidsshield.db')}`;
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

console.log(`[Database] Inicializando cliente LibSQL/Turso... (Destino: ${dbUrl.startsWith('file:') ? 'SQLite local' : 'Nube Turso: ' + dbUrl})`);

const client = createClient({
  url: dbUrl,
  authToken: authToken
});

// Initialize database schema with full multi-family, multi-child and subscription support
async function initDb() {
  try {
    // 1. Families Table (Multi-tenant isolation)
    await client.execute(`
      CREATE TABLE IF NOT EXISTS families (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        invite_code TEXT UNIQUE,
        created_at TEXT NOT NULL
      );
    `);

    // 2. Users Table (Parents / Guardians)
    await client.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        family_id TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        name TEXT NOT NULL,
        avatar TEXT,
        role TEXT DEFAULT 'owner',
        google_id TEXT,
        created_at TEXT NOT NULL
      );
    `);

    // 3. Subscriptions Table (Monetization & Plans)
    await client.execute(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        family_id TEXT UNIQUE NOT NULL,
        plan TEXT DEFAULT 'pro', -- 'free', 'pro', 'family_total'
        status TEXT DEFAULT 'active',
        max_devices INTEGER DEFAULT 5,
        current_period_end TEXT,
        payment_provider TEXT DEFAULT 'trial',
        created_at TEXT NOT NULL
      );
    `);

    // 4. Children Profiles
    await client.execute(`
      CREATE TABLE IF NOT EXISTS children (
        id TEXT PRIMARY KEY,
        family_id TEXT NOT NULL,
        name TEXT NOT NULL,
        age INTEGER DEFAULT 12,
        avatar TEXT DEFAULT '👦',
        daily_limit_minutes INTEGER DEFAULT 120,
        bedtime_start TEXT DEFAULT '21:30',
        bedtime_end TEXT DEFAULT '07:00',
        created_at TEXT NOT NULL
      );
    `);

    // 5. Devices Table (Linked to Family and Child)
    await client.execute(`
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        family_id TEXT NOT NULL,
        child_id TEXT,
        name TEXT NOT NULL,
        child_name TEXT,
        avatar TEXT DEFAULT '📱',
        is_online INTEGER DEFAULT 0,
        battery INTEGER DEFAULT 100,
        last_seen TEXT,
        is_locked INTEGER DEFAULT 0,
        lock_reason TEXT,
        parent_pin TEXT DEFAULT '1234',
        screen_time_minutes INTEGER DEFAULT 0,
        daily_limit_minutes INTEGER DEFAULT 120,
        bedtime_enabled INTEGER DEFAULT 0,
        bedtime_start TEXT DEFAULT '21:30',
        bedtime_end TEXT DEFAULT '07:00',
        current_active_app TEXT,
        current_active_app_name TEXT,
        app_limits_json TEXT DEFAULT '{}',
        blocked_apps_json TEXT DEFAULT '[]',
        app_catalog_json TEXT DEFAULT '[]',
        last_screenshot TEXT,
        last_screenshot_time TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // 6. GPS Locations History
    await client.execute(`
      CREATE TABLE IF NOT EXISTS locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        family_id TEXT,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        accuracy REAL,
        address TEXT,
        created_at TEXT NOT NULL
      );
    `);

    // 7. Activity & Alert Logs
    await client.execute(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        family_id TEXT,
        time TEXT NOT NULL,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    // 8. 5-Second Video Clips
    await client.execute(`
      CREATE TABLE IF NOT EXISTS video_clips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        family_id TEXT,
        frames_json TEXT NOT NULL,
        duration_ms INTEGER DEFAULT 5000,
        created_at TEXT NOT NULL
      );
    `);

    // 9. Ambient Audio Clips (5s)
    await client.execute(`
      CREATE TABLE IF NOT EXISTS audio_clips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        family_id TEXT,
        audio_base64 TEXT NOT NULL,
        duration_seconds INTEGER DEFAULT 5,
        created_at TEXT NOT NULL
      );
    `);

    // 10. Smart Geofences (School, Home, etc.)
    await client.execute(`
      CREATE TABLE IF NOT EXISTS geofences (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        family_id TEXT,
        name TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        radius_meters REAL DEFAULT 200,
        alert_on_entry INTEGER DEFAULT 1,
        alert_on_exit INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      );
    `);

    // 11. Password Resets (Recovery Tokens)
    await client.execute(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires_at TEXT NOT NULL,
        used INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `);

    console.log('[Database] ✅ Tablas e índices verificados correctamente en Turso Cloud');

    // Inicializar familia y dispositivo por defecto si no existen para compatibilidad inmediata
    await seedDefaultFamilyAndDevice();
  } catch (err) {
    console.error('[Database] ❌ Error inicializando esquema en Turso:', err);
  }
}

// Seed default family, user and device (Redmi Note 12 Pro) if empty
async function seedDefaultFamilyAndDevice() {
  try {
    const defaultFamilyId = 'FAM-DEFAULT-01';
    const famCheck = await client.execute({
      sql: 'SELECT id FROM families WHERE id = ?',
      args: [defaultFamilyId]
    });

    const now = new Date().toISOString();

    if (famCheck.rows.length === 0) {
      console.log('[Database] 🚀 Creando Familia y Suscripción Pro por defecto en Turso...');
      await client.execute({
        sql: 'INSERT INTO families (id, name, invite_code, created_at) VALUES (?, ?, ?, ?)',
        args: [defaultFamilyId, 'Familia Briones', 'KS-BRIONES-2026', now]
      });

      // Suscripción Pro para la familia por defecto
      await client.execute({
        sql: 'INSERT INTO subscriptions (id, family_id, plan, status, max_devices, current_period_end, payment_provider, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: ['SUB-DEFAULT-01', defaultFamilyId, 'pro', 'active', 5, '2027-01-01T00:00:00Z', 'trial', now]
      });

      // Crear usuario Administrador Padre inicial con contraseña predeterminada (Admin1234)
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash('Admin1234', salt);
      await client.execute({
        sql: 'INSERT INTO users (id, family_id, email, password_hash, name, avatar, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: ['USR-ADMIN-01', defaultFamilyId, 'admin.padre@gmail.com', hash, 'Sebastián Briones (Padre)', '👨‍💼', 'owner', now]
      });

    }
    console.log('[Database] ✅ Verificación de estructura inicial completada (Sin dispositivos ficticios).');
  } catch (e) {
    console.error('[Database] Error en seed de familia y dispositivo:', e);
  }
}

// ----------------- User & Auth Methods -----------------

async function registerParent({ email, password, name, avatar, googleId }) {
  const familyId = 'FAM-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const userId = 'USR-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const subId = 'SUB-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const childId = 'CHD-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const now = new Date().toISOString();

  let passwordHash = null;
  if (password) {
    const salt = await bcrypt.genSalt(10);
    passwordHash = await bcrypt.hash(password, salt);
  }

  // Crear Familia
  await client.execute({
    sql: 'INSERT INTO families (id, name, invite_code, created_at) VALUES (?, ?, ?, ?)',
    args: [familyId, `Familia de ${name}`, 'KS-' + crypto.randomBytes(3).toString('hex').toUpperCase(), now]
  });

  // Crear Suscripción (Por defecto Plan Pro de Prueba gratuita 14 días)
  await client.execute({
    sql: 'INSERT INTO subscriptions (id, family_id, plan, status, max_devices, current_period_end, payment_provider, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    args: [subId, familyId, 'pro', 'trialing', 5, new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(), 'trial', now]
  });

  // Crear Usuario Padre
  await client.execute({
    sql: 'INSERT INTO users (id, family_id, email, password_hash, name, avatar, role, google_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    args: [userId, familyId, email.toLowerCase().trim(), passwordHash, name, avatar || '👨‍💼', 'owner', googleId || null, now]
  });

  // Crear Hijo por defecto
  await client.execute({
    sql: 'INSERT INTO children (id, family_id, name, age, avatar, daily_limit_minutes, bedtime_start, bedtime_end, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    args: [childId, familyId, 'Hijo/a', 12, '👦', 120, '21:30', '07:00', now]
  });

  return {
    userId,
    familyId,
    email: email.toLowerCase().trim(),
    name,
    avatar: avatar || '👨‍💼',
    plan: 'pro'
  };
}

async function getUserByEmail(email) {
  try {
    const rs = await client.execute({
      sql: 'SELECT * FROM users WHERE email = ?',
      args: [email.toLowerCase().trim()]
    });
    return rs.rows[0] || null;
  } catch (e) {
    console.error('[Database] Error buscando usuario por email:', e);
    return null;
  }
}

async function linkGoogleToUser(userId, googleId, picture) {
  try {
    await client.execute({
      sql: "UPDATE users SET google_id = COALESCE(google_id, ?), avatar = CASE WHEN avatar = '👨‍💼' OR avatar IS NULL THEN ? ELSE avatar END WHERE id = ?",
      args: [googleId || null, picture || '👨‍💼', userId]
    });
  } catch (e) {
    console.error('[Database] Error vinculando Google ID a usuario:', e);
  }
}

async function verifyPassword(plainPassword, passwordHash) {
  if (!plainPassword || !passwordHash) return false;
  return bcrypt.compare(plainPassword, passwordHash);
}

async function getFamilySubscription(familyId) {
  try {
    const rs = await client.execute({
      sql: 'SELECT * FROM subscriptions WHERE family_id = ?',
      args: [familyId]
    });
    if (rs.rows.length === 0) {
      return { plan: 'free', status: 'active', maxDevices: 1 };
    }
    const row = rs.rows[0];
    return {
      id: row.id,
      familyId: row.family_id,
      plan: row.plan,
      status: row.status,
      maxDevices: row.max_devices,
      currentPeriodEnd: row.current_period_end,
      paymentProvider: row.payment_provider
    };
  } catch (e) {
    console.error('[Database] Error leyendo suscripción:', e);
    return { plan: 'free', status: 'active', maxDevices: 1 };
  }
}

async function updateSubscriptionPlan(familyId, newPlan) {
  const maxDevices = newPlan === 'family_total' ? 10 : newPlan === 'pro' ? 5 : 1;
  const now = new Date().toISOString();
  await client.execute({
    sql: `
      UPDATE subscriptions
      SET plan = ?, max_devices = ?, status = 'active', current_period_end = ?
      WHERE family_id = ?
    `,
    args: [newPlan, maxDevices, new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(), familyId]
  });
  return { plan: newPlan, maxDevices };
}

// ----------------- Devices Methods (Multi-Tenant) -----------------

async function getAllDevices(familyId = null) {
  try {
    let sql = 'SELECT * FROM devices';
    const args = [];
    if (familyId) {
      sql += ' WHERE family_id = ?';
      args.push(familyId);
    }
    sql += ' ORDER BY updated_at DESC';

    const rs = await client.execute({ sql, args });
    return rs.rows.map(row => ({
      id: row.id,
      familyId: row.family_id,
      childId: row.child_id,
      name: row.name,
      childName: row.child_name,
      avatar: row.avatar || '📱',
      isOnline: Boolean(row.is_online),
      battery: row.battery,
      lastSeen: row.last_seen,
      isLocked: Boolean(row.is_locked),
      lockReason: row.lock_reason,
      parentPin: row.parent_pin,
      screenTimeTodayMinutes: row.screen_time_minutes,
      dailyLimitMinutes: row.daily_limit_minutes,
      bedtimeEnabled: Boolean(row.bedtime_enabled),
      bedtimeStart: row.bedtime_start,
      bedtimeEnd: row.bedtime_end,
      currentActiveApp: row.current_active_app,
      currentActiveAppName: row.current_active_app_name,
      appLimits: JSON.parse(row.app_limits_json || '{}'),
      blockedApps: JSON.parse(row.blocked_apps_json || '[]'),
      appCatalog: JSON.parse(row.app_catalog_json || '[]'),
      lastScreenshot: row.last_screenshot,
      lastScreenshotTime: row.last_screenshot_time
    }));
  } catch (e) {
    console.error('[Database] Error leyendo dispositivos:', e);
    return [];
  }
}

async function getDeviceById(id) {
  try {
    const rs = await client.execute({
      sql: 'SELECT * FROM devices WHERE id = ?',
      args: [id]
    });
    if (rs.rows.length === 0) return null;
    const row = rs.rows[0];
    return {
      id: row.id,
      familyId: row.family_id,
      childId: row.child_id,
      name: row.name,
      childName: row.child_name,
      avatar: row.avatar || '📱',
      isOnline: Boolean(row.is_online),
      battery: row.battery,
      lastSeen: row.last_seen,
      isLocked: Boolean(row.is_locked),
      lockReason: row.lock_reason,
      parentPin: row.parent_pin,
      screenTimeTodayMinutes: row.screen_time_minutes,
      dailyLimitMinutes: row.daily_limit_minutes,
      bedtimeEnabled: Boolean(row.bedtime_enabled),
      bedtimeStart: row.bedtime_start,
      bedtimeEnd: row.bedtime_end,
      currentActiveApp: row.current_active_app,
      currentActiveAppName: row.current_active_app_name,
      appLimits: JSON.parse(row.app_limits_json || '{}'),
      blockedApps: JSON.parse(row.blocked_apps_json || '[]'),
      appCatalog: JSON.parse(row.app_catalog_json || '[]'),
      lastScreenshot: row.last_screenshot,
      lastScreenshotTime: row.last_screenshot_time
    };
  } catch (e) {
    console.error(`[Database] Error leyendo dispositivo ${id}:`, e);
    return null;
  }
}

async function saveDevice(device) {
  try {
    const now = new Date().toISOString();
    const familyId = device.familyId || 'FAM-DEFAULT-01';

    await client.execute({
      sql: `
        INSERT INTO devices (
          id, family_id, child_id, name, child_name, avatar, is_online, battery, last_seen,
          is_locked, lock_reason, parent_pin, screen_time_minutes, daily_limit_minutes,
          bedtime_enabled, bedtime_start, bedtime_end, current_active_app, current_active_app_name,
          app_limits_json, blocked_apps_json, app_catalog_json, last_screenshot, last_screenshot_time,
          created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?
        )
        ON CONFLICT(id) DO UPDATE SET
          family_id = COALESCE(excluded.family_id, devices.family_id),
          child_id = COALESCE(excluded.child_id, devices.child_id),
          name = excluded.name,
          child_name = excluded.child_name,
          avatar = excluded.avatar,
          is_online = excluded.is_online,
          battery = excluded.battery,
          last_seen = excluded.last_seen,
          is_locked = excluded.is_locked,
          lock_reason = excluded.lock_reason,
          parent_pin = excluded.parent_pin,
          screen_time_minutes = excluded.screen_time_minutes,
          daily_limit_minutes = excluded.daily_limit_minutes,
          bedtime_enabled = excluded.bedtime_enabled,
          bedtime_start = excluded.bedtime_start,
          bedtime_end = excluded.bedtime_end,
          current_active_app = excluded.current_active_app,
          current_active_app_name = excluded.current_active_app_name,
          app_limits_json = excluded.app_limits_json,
          blocked_apps_json = excluded.blocked_apps_json,
          app_catalog_json = excluded.app_catalog_json,
          last_screenshot = COALESCE(excluded.last_screenshot, devices.last_screenshot),
          last_screenshot_time = COALESCE(excluded.last_screenshot_time, devices.last_screenshot_time),
          updated_at = excluded.updated_at;
      `,
      args: [
        device.id,
        familyId,
        device.childId || 'CHILD-01',
        device.name || 'Dispositivo',
        device.childName || 'Hijo',
        device.avatar || '📱',
        device.isOnline ? 1 : 0,
        device.battery ?? 100,
        device.lastSeen || now,
        device.isLocked ? 1 : 0,
        device.lockReason || '',
        device.parentPin || '1234',
        device.screenTimeTodayMinutes ?? 0,
        device.dailyLimitMinutes ?? 120,
        device.bedtimeEnabled ? 1 : 0,
        device.bedtimeStart || '21:30',
        device.bedtimeEnd || '07:00',
        device.currentActiveApp || '',
        device.currentActiveAppName || '',
        JSON.stringify(device.appLimits || {}),
        JSON.stringify(device.blockedApps || []),
        JSON.stringify(device.appCatalog || []),
        device.lastScreenshot || null,
        device.lastScreenshotTime || null,
        now,
        now
      ]
    });
  } catch (e) {
    console.error(`[Database] Error guardando dispositivo ${device.id}:`, e);
  }
}

// ----------------- Locations, Video Clips & Logs -----------------

async function logLocation(deviceId, location, familyId = 'FAM-DEFAULT-01') {
  try {
    await client.execute({
      sql: `INSERT INTO locations (device_id, family_id, latitude, longitude, accuracy, address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        deviceId,
        familyId,
        location.latitude,
        location.longitude,
        location.accuracy || 15,
        location.address || 'Ubicación GPS',
        location.lastUpdated || new Date().toISOString()
      ]
    });
  } catch (e) {
    console.error('[Database] Error guardando ubicación:', e);
  }
}

async function getLocationHistory(deviceId, limit = 50) {
  try {
    const rs = await client.execute({
      sql: `SELECT latitude, longitude, accuracy, address, created_at FROM locations WHERE device_id = ? ORDER BY id DESC LIMIT ?`,
      args: [deviceId, limit]
    });
    return rs.rows.map(r => ({
      latitude: r.latitude,
      longitude: r.longitude,
      accuracy: r.accuracy,
      address: r.address,
      timestamp: r.created_at
    })).reverse();
  } catch (e) {
    console.error('[Database] Error leyendo historial GPS:', e);
    return [];
  }
}

async function saveVideoClip(deviceId, frames, durationMs, familyId = 'FAM-DEFAULT-01') {
  try {
    const rs = await client.execute({
      sql: `INSERT INTO video_clips (device_id, family_id, frames_json, duration_ms, created_at) VALUES (?, ?, ?, ?, ?)`,
      args: [
        deviceId,
        familyId,
        JSON.stringify(frames || []),
        durationMs || 5000,
        new Date().toISOString()
      ]
    });
    return rs.lastInsertRowid;
  } catch (e) {
    console.error('[Database] Error guardando clip de video:', e);
    return null;
  }
}

async function getLatestVideoClip(deviceId) {
  try {
    const rs = await client.execute({
      sql: `SELECT id, frames_json, duration_ms, created_at FROM video_clips WHERE device_id = ? ORDER BY id DESC LIMIT 1`,
      args: [deviceId]
    });
    if (rs.rows.length === 0) return null;
    const row = rs.rows[0];
    const framesArr = JSON.parse(row.frames_json || '[]');
    return {
      id: row.id,
      frames: framesArr,
      durationMs: row.duration_ms,
      intervalMs: framesArr.length ? Math.round(row.duration_ms / framesArr.length) : 500,
      createdAt: row.created_at
    };
  } catch (e) {
    console.error('[Database] Error obteniendo clip de video:', e);
    return null;
  }
}

async function logActivity(deviceId, time, type, message, familyId = 'FAM-DEFAULT-01') {
  try {
    await client.execute({
      sql: `INSERT INTO activity_logs (device_id, family_id, time, type, message, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [deviceId, familyId, time, type, message, new Date().toISOString()]
    });
  } catch (e) {
    console.error('[Database] Error guardando registro de actividad:', e);
  }
}

async function getActivityLogs(deviceId, limit = 50) {
  try {
    const rs = await client.execute({
      sql: `SELECT time, type, message, created_at FROM activity_logs WHERE device_id = ? ORDER BY id DESC LIMIT ?`,
      args: [deviceId, limit]
    });
    return rs.rows.map(r => ({
      time: r.time,
      type: r.type,
      message: r.message,
      createdAt: r.created_at
    }));
  } catch (e) {
    console.error('[Database] Error leyendo registros de actividad:', e);
    return [];
  }
}

async function saveAudioClip(deviceId, audioBase64, durationSeconds = 5, familyId = 'FAM-DEFAULT-01') {
  try {
    const rs = await client.execute({
      sql: `INSERT INTO audio_clips (device_id, family_id, audio_base64, duration_seconds, created_at) VALUES (?, ?, ?, ?, ?)`,
      args: [deviceId, familyId, audioBase64, durationSeconds, new Date().toISOString()]
    });
    return rs.lastInsertRowid;
  } catch (e) {
    console.error('[Database] Error guardando clip de audio:', e);
    return null;
  }
}

async function getLatestAudioClip(deviceId) {
  try {
    const rs = await client.execute({
      sql: `SELECT id, audio_base64, duration_seconds, created_at FROM audio_clips WHERE device_id = ? ORDER BY id DESC LIMIT 1`,
      args: [deviceId]
    });
    if (rs.rows.length === 0) return null;
    const row = rs.rows[0];
    return {
      id: row.id,
      audioBase64: row.audio_base64,
      durationSeconds: row.duration_seconds,
      createdAt: row.created_at
    };
  } catch (e) {
    console.error('[Database] Error obteniendo clip de audio:', e);
    return null;
  }
}

async function saveGeofence(geofence) {
  try {
    await client.execute({
      sql: `INSERT OR REPLACE INTO geofences (id, device_id, family_id, name, latitude, longitude, radius_meters, alert_on_entry, alert_on_exit, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        geofence.id,
        geofence.deviceId || 'KID-PHONE-01',
        geofence.familyId || 'FAM-DEFAULT-01',
        geofence.name,
        geofence.latitude,
        geofence.longitude,
        geofence.radiusMeters || 200,
        geofence.alertOnEntry ? 1 : 0,
        geofence.alertOnExit ? 1 : 0,
        geofence.createdAt || new Date().toISOString()
      ]
    });
    return geofence;
  } catch (e) {
    console.error('[Database] Error guardando geocerca:', e);
    return null;
  }
}

async function getGeofences(deviceId) {
  try {
    const rs = await client.execute({
      sql: `SELECT id, device_id, family_id, name, latitude, longitude, radius_meters, alert_on_entry, alert_on_exit, created_at FROM geofences WHERE device_id = ?`,
      args: [deviceId]
    });
    return rs.rows.map(r => ({
      id: r.id,
      deviceId: r.device_id,
      familyId: r.family_id,
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      radiusMeters: r.radius_meters,
      alertOnEntry: r.alert_on_entry === 1,
      alertOnExit: r.alert_on_exit === 1,
      createdAt: r.created_at
    }));
  } catch (e) {
    console.error('[Database] Error leyendo geocercas:', e);
    return [];
  }
}

async function deleteGeofence(id) {
  try {
    await client.execute({
      sql: `DELETE FROM geofences WHERE id = ?`,
      args: [id]
    });
    return true;
  } catch (e) {
    console.error('[Database] Error borrando geocerca:', e);
    return false;
  }
}

// ----------------- Password Reset Recovery Methods -----------------

async function createPasswordReset(email) {
  const cleanEmail = email.toLowerCase().trim();
  const user = await getUserByEmail(cleanEmail);
  if (!user) {
    return null; // Correo no registrado
  }

  const token = crypto.randomBytes(32).toString('hex');
  const id = 'RST-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString(); // 1 hora de vigencia

  try {
    // Invalidar solicitudes anteriores pendientes para el mismo email
    await client.execute({
      sql: 'UPDATE password_resets SET used = 1 WHERE email = ? AND used = 0',
      args: [cleanEmail]
    });

    // Guardar nuevo token
    await client.execute({
      sql: 'INSERT INTO password_resets (id, email, token, expires_at, used, created_at) VALUES (?, ?, ?, ?, 0, ?)',
      args: [id, cleanEmail, token, expiresAt, now.toISOString()]
    });

    console.log(`[Database] 🔑 Token de recuperación creado para ${cleanEmail} (Válido hasta: ${expiresAt})`);
    return {
      token,
      expiresAt,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    };
  } catch (e) {
    console.error('[Database] Error creando token de recuperación:', e);
    throw e;
  }
}

async function verifyPasswordResetToken(token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token no proporcionado o inválido' };
  }

  try {
    const rs = await client.execute({
      sql: 'SELECT * FROM password_resets WHERE token = ?',
      args: [token.trim()]
    });

    if (rs.rows.length === 0) {
      return { valid: false, error: 'El enlace de recuperación es inválido o inexistente.' };
    }

    const resetRecord = rs.rows[0];

    if (resetRecord.used === 1) {
      return { valid: false, error: 'Este enlace de recuperación ya fue utilizado previamente.' };
    }

    const expiresAt = new Date(resetRecord.expires_at).getTime();
    if (expiresAt < Date.now()) {
      return { valid: false, error: 'El enlace de recuperación ha expirado (validez de 60 minutos).' };
    }

    const user = await getUserByEmail(resetRecord.email);
    return {
      valid: true,
      email: resetRecord.email,
      user: user ? { id: user.id, name: user.name, email: user.email } : null
    };
  } catch (e) {
    console.error('[Database] Error verificando token de recuperación:', e);
    return { valid: false, error: 'Error al verificar token en la base de datos' };
  }
}

async function resetPasswordWithToken(token, newPassword) {
  const verification = await verifyPasswordResetToken(token);
  if (!verification.valid) {
    return { success: false, error: verification.error };
  }

  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: 'La nueva contraseña debe tener al menos 8 caracteres.' };
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    // Actualizar contraseña del usuario
    await client.execute({
      sql: 'UPDATE users SET password_hash = ? WHERE email = ?',
      args: [passwordHash, verification.email]
    });

    // Marcar token como consumido
    await client.execute({
      sql: 'UPDATE password_resets SET used = 1 WHERE token = ?',
      args: [token.trim()]
    });

    console.log(`[Database] 🔒 Contraseña actualizada con éxito para el usuario ${verification.email}`);
    return {
      success: true,
      email: verification.email,
      user: verification.user
    };
  } catch (e) {
    console.error('[Database] Error restableciendo contraseña:', e);
    return { success: false, error: 'Error interno al actualizar la contraseña' };
  }
}

module.exports = {
  client,
  initDb,
  registerParent,
  getUserByEmail,
  linkGoogleToUser,
  verifyPassword,
  getFamilySubscription,
  updateSubscriptionPlan,
  getAllDevices,
  getDeviceById,
  saveDevice,
  logLocation,
  getLocationHistory,
  saveVideoClip,
  getLatestVideoClip,
  saveAudioClip,
  getLatestAudioClip,
  saveGeofence,
  getGeofences,
  deleteGeofence,
  logActivity,
  getActivityLogs,
  createPasswordReset,
  verifyPasswordResetToken,
  resetPasswordWithToken
};

