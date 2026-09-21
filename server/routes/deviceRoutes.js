const express = require('express');
const QRCode = require('qrcode');
const db = require('../db');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const socketManager = require('../sockets/socketManager');

// Helper: Haversine distance in meters
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Radio de la Tierra en metros
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

module.exports = function createDeviceRouter({
  devices,
  unlinkedDevices,
  createDefaultDevice,
  isCurrentTimeInBedtime,
  getBestServerIp
}) {
  const router = express.Router();

  // 1. Listar dispositivos: Aislado por familia
  router.get('/', optionalAuth, (req, res) => {
    const all = Object.values(devices);
    // Si el usuario está autenticado, solo devolver dispositivos de su familia
    if (req.user && req.user.familyId) {
      const filtered = all.filter(d => (d.familyId || 'FAM-DEFAULT-01') === req.user.familyId);
      return res.json(filtered);
    }
    // Si no está autenticado, no exponer dispositivos privados
    res.json([]);
  });

  // 2. Crear nuevo perfil de dispositivo
  router.post('/', authenticateToken, async (req, res) => {
    const { name, childName, avatar } = req.body;
    const familyId = req.user.familyId;

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
    const devType = (req.body.deviceType === 'tablet') ? 'tablet' : 'celular';
    const initialName = req.body.name || `Esperando conexión (${devType === 'tablet' ? 'Tablet' : 'Celular'})...`;

    const newDevice = createDefaultDevice(id, initialName, childName || `Hijo ${count}`, avatar || '👦', devType);
    newDevice.familyId = familyId;
    newDevice.hasConnected = false;
    unlinkedDevices.delete(id);
    devices[id] = newDevice;
    await db.saveDevice(newDevice);

    console.log(`[Devices] ➕ Nuevo dispositivo registrado: ${newDevice.id} (${newDevice.childName}, familia: ${familyId})`);
    socketManager.broadcastToFamily(familyId, 'DEVICE_CREATED', newDevice);
    res.json({ success: true, device: newDevice });
  });

  // 3. Desvincular y liberar dispositivo
  router.delete('/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const device = devices[id];
    if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

    // Verificación de pertenencia de familia
    if (device.familyId && req.user.familyId && device.familyId !== req.user.familyId) {
      return res.status(403).json({ error: 'No tienes permiso para gestionar este dispositivo' });
    }

    const devName = device.name || id;
    const familyId = device.familyId || req.user.familyId;
    unlinkedDevices.add(id);

    // Enviar orden inmediata de liberación a la app Android si está conectada por WebSocket
    socketManager.sendToDevice(id, 'UNLINK_DEVICE', { unlinked: true });
    socketManager.sendToDevice(id, 'UNLOCK_DEVICE', { unlinked: true });

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
    socketManager.broadcastToFamily(familyId, 'DEVICE_DELETED', { id, name: devName, unlinked: true });
    socketManager.broadcastToFamily(familyId, 'DEVICE_UNLINKED', { id, name: devName, unlinked: true });
    res.json({ success: true, message: `Dispositivo ${devName} desvinculado y liberado correctamente` });
  });

  // 4. Estado de un dispositivo específico
  router.get('/:id', optionalAuth, (req, res) => {
    const device = devices[req.params.id];
    if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });
    res.json(device);
  });

  // 5. Pairing Info para QR
  router.get('/:id/pairing-info', async (req, res) => {
    const device = devices[req.params.id];
    const deviceId = req.params.id || 'KID-PHONE-01';
    const deviceName = device ? device.name : `Dispositivo (${deviceId})`;
    const parentPin = device ? (device.parentPin || '1234') : '1234';

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

  // 6. Imagen QR directa
  router.get('/:id/qr.png', async (req, res) => {
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

  // 7. Configuración de políticas y directivas
  router.post('/:id/config', optionalAuth, async (req, res) => {
    const device = devices[req.params.id];
    if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

    const { name, childName, avatar, isLocked, lockReason, dailyLimitMinutes, bedtimeEnabled, bedtimeStart, bedtimeEnd, blockedApps, appLimits, parentPin } = req.body;
    const famId = device.familyId || 'FAM-DEFAULT-01';

    if (name) device.name = name;
    if (childName) device.childName = childName;
    if (avatar) device.avatar = avatar;

    if (typeof isLocked === 'boolean') {
      device.isLocked = isLocked;
      if (isLocked) {
        if (lockReason) device.lockReason = lockReason;
      } else {
        device.lockReason = '';
        if (typeof dailyLimitMinutes !== 'number' && (device.screenTimeTodayMinutes || 0) >= (device.dailyLimitMinutes || 120)) {
          device.dailyLimitMinutes = Math.max((device.dailyLimitMinutes || 120) + 15, (device.screenTimeTodayMinutes || 0) + 15);
        }
      }
      if (!device.pendingCommands) device.pendingCommands = [];
      const cmd = isLocked ? 'LOCK_DEVICE' : 'UNLOCK_DEVICE';
      device.pendingCommands.push(cmd);
      // Entrega instantánea por WebSocket si está conectado
      socketManager.sendToDevice(device.id, cmd, { isLocked, reason: device.lockReason });

      device.activityLog.unshift({
        time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        type: isLocked ? 'lock' : 'unlock',
        message: isLocked ? `Dispositivo bloqueado remotamente: "${device.lockReason || 'Bloqueo parental'}"` : 'Dispositivo desbloqueado por los padres'
      });
      socketManager.broadcastToFamily(famId, 'COMMAND', { id: device.id, command: cmd, isLocked });
      socketManager.broadcastToFamily(famId, 'LOCK_STATE_CHANGED', { id: device.id, isLocked });
    }

    if (typeof dailyLimitMinutes === 'number') {
      device.dailyLimitMinutes = dailyLimitMinutes;
      if (device.isLocked && (device.screenTimeTodayMinutes < device.dailyLimitMinutes || device.dailyLimitMinutes === 0)) {
        device.isLocked = false;
        device.lockReason = '';
        if (!device.pendingCommands) device.pendingCommands = [];
        device.pendingCommands.push('UNLOCK_DEVICE');
        socketManager.sendToDevice(device.id, 'UNLOCK_DEVICE', { isLocked: false });

        const timeStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const unlockMsg = `🔓 Límite de tiempo ampliado a ${device.dailyLimitMinutes} min. Dispositivo desbloqueado automáticamente.`;
        device.activityLog.unshift({ time: timeStr, type: 'unlock', message: unlockMsg });
        db.logActivity(device.id, timeStr, 'unlock', unlockMsg, famId).catch(() => {});
        socketManager.broadcastToFamily(famId, 'COMMAND', { id: device.id, command: 'UNLOCK_DEVICE', isLocked: false });
        socketManager.broadcastToFamily(famId, 'LOCK_STATE_CHANGED', { id: device.id, isLocked: false });
      }
    }

    if (typeof bedtimeEnabled === 'boolean') device.bedtimeEnabled = bedtimeEnabled;
    if (bedtimeStart) device.bedtimeStart = bedtimeStart;
    if (bedtimeEnd) device.bedtimeEnd = bedtimeEnd;

    // Evaluación inmediata y reactiva de Horario Nocturno
    const inBedtimeNow = device.bedtimeEnabled && isCurrentTimeInBedtime(device.bedtimeStart, device.bedtimeEnd);
    if (device.bedtimeEnabled && inBedtimeNow) {
      if (!device.isLocked) {
        device.isLocked = true;
        device.lockReason = `Modo descanso / Horario nocturno activo (${device.bedtimeStart} - ${device.bedtimeEnd})`;
        if (!device.pendingCommands) device.pendingCommands = [];
        device.pendingCommands.push('LOCK_DEVICE');
        socketManager.sendToDevice(device.id, 'LOCK_DEVICE', { isLocked: true, reason: device.lockReason });

        const timeStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const bedtimeMsg = `🌙 Horario nocturno activado en ${device.name}. Dispositivo bloqueado para descanso.`;
        device.activityLog.unshift({ time: timeStr, type: 'lock', message: bedtimeMsg });
        db.logActivity(device.id, timeStr, 'lock', bedtimeMsg, famId).catch(() => {});

        socketManager.broadcastToFamily(famId, 'COMMAND', { id: device.id, command: 'LOCK_DEVICE', isLocked: true });
        socketManager.broadcastToFamily(famId, 'LOCK_STATE_CHANGED', { id: device.id, isLocked: true });
      }
    } else if (device.isLocked && device.lockReason && device.lockReason.includes('Modo descanso')) {
      if (!(device.dailyLimitMinutes > 0 && device.screenTimeTodayMinutes >= device.dailyLimitMinutes)) {
        device.isLocked = false;
        device.lockReason = '';
        if (!device.pendingCommands) device.pendingCommands = [];
        device.pendingCommands.push('UNLOCK_DEVICE');
        socketManager.sendToDevice(device.id, 'UNLOCK_DEVICE', { isLocked: false });

        const timeStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const wakeMsg = `☀️ Finalizó el horario nocturno en ${device.name}. Dispositivo desbloqueado.`;
        device.activityLog.unshift({ time: timeStr, type: 'unlock', message: wakeMsg });
        db.logActivity(device.id, timeStr, 'unlock', wakeMsg, famId).catch(() => {});

        socketManager.broadcastToFamily(famId, 'COMMAND', { id: device.id, command: 'UNLOCK_DEVICE', isLocked: false });
        socketManager.broadcastToFamily(famId, 'LOCK_STATE_CHANGED', { id: device.id, isLocked: false });
      }
    }

    if (parentPin) device.parentPin = parentPin;
    if (typeof req.body.isLivePaused === 'boolean') device.isLivePaused = req.body.isLivePaused;
    if (typeof req.body.autoScreenshotEnabled === 'boolean') device.autoScreenshotEnabled = req.body.autoScreenshotEnabled;
    if (typeof req.body.gpsTrackingEnabled === 'boolean') device.gpsTrackingEnabled = req.body.gpsTrackingEnabled;
    if (typeof req.body.gpsIntervalSeconds === 'number') device.gpsIntervalSeconds = req.body.gpsIntervalSeconds;
    if (typeof req.body.audioClipDurationSeconds === 'number') device.audioClipDurationSeconds = req.body.audioClipDurationSeconds;
    if (typeof req.body.videoClipDurationSeconds === 'number') device.videoClipDurationSeconds = req.body.videoClipDurationSeconds;

    // Banderas de módulos de detección y supervisión
    if (typeof req.body.textMonitoringEnabled === 'boolean') device.textMonitoringEnabled = req.body.textMonitoringEnabled;
    if (typeof req.body.screenshotMonitoringEnabled === 'boolean') {
      device.screenshotMonitoringEnabled = req.body.screenshotMonitoringEnabled;
      if (!req.body.screenshotMonitoringEnabled) device.autoScreenshotEnabled = false;
    }
    if (typeof req.body.videoMonitoringEnabled === 'boolean') device.videoMonitoringEnabled = req.body.videoMonitoringEnabled;
    if (typeof req.body.audioMonitoringEnabled === 'boolean') device.audioMonitoringEnabled = req.body.audioMonitoringEnabled;

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
    socketManager.broadcastToFamily(famId, 'DEVICE_UPDATED', device);
    res.json({ success: true, device });
  });

  // 8. Renombrar dispositivo / hijo
  router.post('/:id/rename', optionalAuth, async (req, res) => {
    const device = devices[req.params.id];
    if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

    const { childName, name, avatar, deviceType } = req.body;
    if (childName && childName.trim()) device.childName = childName.trim();
    if (name && name.trim()) device.name = name.trim();
    if (avatar) device.avatar = avatar;
    if (deviceType && (deviceType === 'tablet' || deviceType === 'celular')) device.deviceType = deviceType;

    await db.saveDevice(device);
    const famId = device.familyId || 'FAM-DEFAULT-01';
    socketManager.broadcastToFamily(famId, 'DEVICE_UPDATED', device);
    res.json({ success: true, device });
  });

  // 9. Bloqueo de aplicaciones individuales
  router.post('/:id/toggle-app', optionalAuth, async (req, res) => {
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

    const cmd = isBlocked ? `BLOCK_APP:${pkg}` : `UNBLOCK_APP:${pkg}`;
    if (!device.pendingCommands) device.pendingCommands = [];
    device.pendingCommands.push(cmd);
    socketManager.sendToDevice(device.id, cmd, { package: pkg, isBlocked });

    await db.saveDevice(device);
    const famId = device.familyId || 'FAM-DEFAULT-01';
    socketManager.broadcastToFamily(famId, 'COMMAND', { id: device.id, command: cmd });
    socketManager.broadcastToFamily(famId, 'DEVICE_UPDATED', device);
    res.json({ success: true, device });
  });

  // 10. Bloqueo rápido de pantalla
  router.post('/:id/toggle-lock', optionalAuth, async (req, res) => {
    const device = devices[req.params.id];
    if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

    const isLocked = typeof req.body.isLocked === 'boolean' ? req.body.isLocked : !device.isLocked;
    device.isLocked = isLocked;
    device.lockReason = isLocked ? (req.body.lockReason || 'Bloqueo inmediato solicitado por los padres') : '';

    if (typeof req.body.dailyLimitMinutes === 'number') {
      device.dailyLimitMinutes = req.body.dailyLimitMinutes;
    } else if (!isLocked && (device.screenTimeTodayMinutes || 0) >= (device.dailyLimitMinutes || 120)) {
      device.dailyLimitMinutes = Math.max((device.dailyLimitMinutes || 120) + 15, (device.screenTimeTodayMinutes || 0) + 15);
    }

    const cmd = isLocked ? 'LOCK_DEVICE' : 'UNLOCK_DEVICE';
    if (!device.pendingCommands) device.pendingCommands = [];
    device.pendingCommands.push(cmd);
    socketManager.sendToDevice(device.id, cmd, { isLocked, reason: device.lockReason });

    const timeStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const logMsg = isLocked ? `🔒 Dispositivo bloqueado remotamente: "${device.lockReason}"` : '🔓 Dispositivo desbloqueado por los padres';

    device.activityLog = device.activityLog || [];
    device.activityLog.unshift({
      time: timeStr,
      type: isLocked ? 'lock' : 'unlock',
      message: logMsg
    });

    const famId = device.familyId || 'FAM-DEFAULT-01';
    await db.saveDevice(device);
    await db.logActivity(device.id, timeStr, isLocked ? 'lock' : 'unlock', logMsg, famId);

    socketManager.broadcastToFamily(famId, 'COMMAND', { id: device.id, command: cmd, isLocked });
    socketManager.broadcastToFamily(famId, 'LOCK_STATE_CHANGED', { id: device.id, isLocked: device.isLocked });
    socketManager.broadcastToFamily(famId, 'DEVICE_UPDATED', device);

    console.log(`[Lock] ${isLocked ? '🔒 Bloqueado' : '🔓 Desbloqueado'} dispositivo ${device.id} (${device.name})`);
    res.json({ success: true, isLocked: device.isLocked, device });
  });

  // 11. Subida de captura de pantalla
  router.post('/:id/screenshot', async (req, res) => {
    const device = devices[req.params.id];
    if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

    if (device.screenshotMonitoringEnabled === false) {
      return res.json({ success: true, ignored: true, message: 'Capturas de pantalla desactivadas en configuración' });
    }

    const img = req.body.imageBase64 || req.body.screenshot || req.body.image;
    if (!img) return res.status(400).json({ error: 'Falta imagen' });

    socketManager.markDeviceOnline(device);
    device.lastScreenshot = img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`;
    device.lastScreenshotTime = new Date().toISOString();

    device.activityLog.unshift({
      time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      type: 'info',
      message: '📸 Captura de pantalla en vivo actualizada'
    });

    const famId = device.familyId || 'FAM-DEFAULT-01';
    await db.saveDevice(device);
    await db.saveScreenshot(device.id, device.lastScreenshot, famId);

    socketManager.broadcastToFamily(famId, 'SCREENSHOT_UPDATED', {
      id: device.id,
      imageBase64: device.lastScreenshot,
      screenshot: device.lastScreenshot,
      timestamp: device.lastScreenshotTime
    });
    socketManager.broadcastToFamily(famId, 'MULTIMEDIA_UPDATED', { id: device.id, type: 'image', timestamp: device.lastScreenshotTime });
    socketManager.broadcastToFamily(famId, 'DEVICE_UPDATED', device);
    res.json({ success: true });
  });

  // 12. Solicitar captura de pantalla inmediata
  router.post('/:id/request-screenshot', (req, res) => {
    const device = devices[req.params.id];
    if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

    if (device.screenshotMonitoringEnabled === false) {
      return res.status(403).json({ error: 'Las capturas de pantalla están desactivadas para este dispositivo en Ajustes' });
    }

    if (!device.pendingCommands) device.pendingCommands = [];
    device.pendingCommands.push('TAKE_SCREENSHOT');

    const sent = socketManager.sendToDevice(device.id, 'TAKE_SCREENSHOT');
    const famId = device.familyId || 'FAM-DEFAULT-01';
    socketManager.broadcastToFamily(famId, 'COMMAND', { id: device.id, command: 'TAKE_SCREENSHOT' });
    res.json({ success: true, message: 'Comando de captura enviado', instantWs: sent });
  });

  // 13. Solicitar Video Clip
  router.post('/:id/request-video', (req, res) => {
    const device = devices[req.params.id];
    if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

    if (device.videoMonitoringEnabled === false) {
      return res.status(403).json({ error: 'La supervisión de video está desactivada para este dispositivo en Ajustes' });
    }

    const sec = req.body.duration || device.videoClipDurationSeconds || 5;
    const command = `TAKE_VIDEO_${sec}S`;
    if (!device.pendingCommands) device.pendingCommands = [];
    device.pendingCommands.push(command);

    const sent = socketManager.sendToDevice(device.id, command, { duration: sec });
    const famId = device.familyId || 'FAM-DEFAULT-01';
    socketManager.broadcastToFamily(famId, 'COMMAND', { id: device.id, command, duration: sec });
    res.json({ success: true, message: `Comando de video de ${sec} segundos enviado`, instantWs: sent });
  });

  // 14. Subir y consultar Video Clip
  router.post('/:id/video-clip', async (req, res) => {
    const device = devices[req.params.id];
    if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

    if (device.videoMonitoringEnabled === false) {
      return res.json({ success: true, ignored: true, message: 'Supervisión de video desactivada en configuración' });
    }

    const { frames, durationMs, intervalMs } = req.body;
    if (!Array.isArray(frames) || frames.length === 0) {
      return res.status(400).json({ error: 'Faltan fotogramas del clip de video' });
    }

    socketManager.markDeviceOnline(device);
    const calcInterval = intervalMs || Math.round((durationMs || 5000) / frames.length) || 500;
    await db.saveVideoClip(device.id, frames, durationMs || 5000);

    device.activityLog.unshift({
      time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      type: 'info',
      message: `🎥 Clip de video recibido (${frames.length} fotogramas)`
    });

    const famId = device.familyId || 'FAM-DEFAULT-01';
    const payload = {
      id: device.id,
      frames,
      intervalMs: calcInterval,
      durationMs: durationMs || 5000,
      timestamp: new Date().toISOString()
    };
    socketManager.broadcastToFamily(famId, 'VIDEO_CLIP_UPDATED', payload);
    socketManager.broadcastToFamily(famId, 'VIDEO_CLIP_READY', payload);
    socketManager.broadcastToFamily(famId, 'MULTIMEDIA_UPDATED', { id: device.id, type: 'video', timestamp: new Date().toISOString() });
    socketManager.broadcastToFamily(famId, 'DEVICE_UPDATED', device);
    res.json({ success: true });
  });

  router.get('/:id/video-clip', async (req, res) => {
    const clip = await db.getLatestVideoClip(req.params.id);
    if (!clip) return res.status(404).json({ error: 'No hay clips disponibles' });
    res.json(clip);
  });

  // 15. Solicitar y subir Audio Clip
  router.post('/:id/request-audio', (req, res) => {
    const device = devices[req.params.id];
    if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

    if (device.audioMonitoringEnabled === false) {
      return res.status(403).json({ error: 'La supervisión de audio está desactivada para este dispositivo en Ajustes' });
    }

    const sec = req.body.duration || device.audioClipDurationSeconds || 5;
    const command = `RECORD_AUDIO_${sec}S`;
    if (!device.pendingCommands) device.pendingCommands = [];
    device.pendingCommands.push(command);

    const sent = socketManager.sendToDevice(device.id, command, { duration: sec });
    const famId = device.familyId || 'FAM-DEFAULT-01';
    socketManager.broadcastToFamily(famId, 'COMMAND', { id: device.id, command, duration: sec });
    res.json({ success: true, message: `Comando de audio de ${sec} segundos enviado`, instantWs: sent });
  });

  router.post('/:id/audio-clip', async (req, res) => {
    const device = devices[req.params.id];
    if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

    if (device.audioMonitoringEnabled === false) {
      return res.json({ success: true, ignored: true, message: 'Supervisión de audio desactivada en configuración' });
    }

    const rawAudio = req.body.audioBase64 || req.body.audio;
    if (!rawAudio) return res.status(400).json({ error: 'Faltan datos de audio' });

    socketManager.markDeviceOnline(device);
    const audioFormatted = rawAudio.startsWith('data:') ? rawAudio : `data:audio/mp4;base64,${rawAudio}`;
    const durationSeconds = req.body.duration || 5;

    device.lastAudioClip = audioFormatted;
    device.lastAudioClipTime = new Date().toISOString();

    const famId = device.familyId || 'FAM-DEFAULT-01';
    await db.saveAudioClip(device.id, audioFormatted, durationSeconds, famId);

    const timeStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    device.activityLog.unshift({
      time: timeStr,
      type: 'info',
      message: '🎙️ Audio ambiental en vivo capturado (5 segundos)'
    });
    await db.logActivity(device.id, timeStr, 'info', '🎙️ Audio ambiental capturado', famId);

    const payload = {
      id: device.id,
      audioBase64: audioFormatted,
      duration: durationSeconds,
      timestamp: device.lastAudioClipTime
    };
    socketManager.broadcastToFamily(famId, 'AUDIO_CLIP_READY', payload);
    socketManager.broadcastToFamily(famId, 'AUDIO_CLIP_UPDATED', payload);
    socketManager.broadcastToFamily(famId, 'MULTIMEDIA_UPDATED', { id: device.id, type: 'audio', timestamp: device.lastAudioClipTime });
    socketManager.broadcastToFamily(famId, 'DEVICE_UPDATED', device);
    res.json({ success: true });
  });

  router.get('/:id/audio-clip', async (req, res) => {
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

  // 16. Galería Multimedia Completa
  router.get('/:id/multimedia', async (req, res) => {
    const deviceId = req.params.id;
    try {
      const [rawScreenshots, rawVideos, rawAudios] = await Promise.all([
        db.getScreenshots(deviceId, 30),
        db.getVideoClips(deviceId, 30),
        db.getAudioClips(deviceId, 30)
      ]);

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

  // Eliminar archivo multimedia individual
  router.delete('/:id/multimedia/:mediaId', async (req, res) => {
    const { id, mediaId } = req.params;
    const device = devices[id];
    if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

    try {
      await db.deleteMultimediaItem(id, mediaId);
      if (mediaId === 'current' || (device.lastScreenshot && device.lastScreenshot.includes(mediaId))) {
        device.lastScreenshot = null;
        device.lastScreenshotTime = null;
      }
      const famId = device.familyId || 'FAM-DEFAULT-01';
      socketManager.broadcastToFamily(famId, 'MULTIMEDIA_UPDATED', { id: device.id });
      res.json({ success: true, message: 'Archivo multimedia eliminado' });
    } catch (e) {
      console.error('[Multimedia] Error eliminando archivo:', e);
      res.status(500).json({ error: 'Error al eliminar archivo multimedia' });
    }
  });

  // 17. Geocercas
  router.get('/:id/geofences', async (req, res) => {
    const geofences = await db.getGeofences(req.params.id);
    res.json(geofences || []);
  });

  router.post('/:id/geofences', async (req, res) => {
    const deviceId = req.params.id;
    const { id, name, icon, latitude, longitude, radiusMeters, alertOnEntry, alertOnExit } = req.body;
    if (!name || typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({ error: 'Datos de geocerca incompletos' });
    }

    const geoId = id || `GEO-${Date.now()}`;
    const geofence = {
      id: geoId,
      deviceId,
      name,
      icon: icon || '📍',
      latitude,
      longitude,
      radiusMeters: radiusMeters || 200,
      alertOnEntry: alertOnEntry !== false,
      alertOnExit: alertOnExit !== false,
      createdAt: new Date().toISOString()
    };

    await db.saveGeofence(geofence);
    const famId = devices[deviceId]?.familyId || 'FAM-DEFAULT-01';
    socketManager.broadcastToFamily(famId, 'GEOFENCE_UPDATED', { deviceId, geofence });
    res.json({ success: true, geofence });
  });

  router.delete('/:id/geofences/:geoId', async (req, res) => {
    await db.deleteGeofence(req.params.geoId);
    const famId = devices[req.params.id]?.familyId || 'FAM-DEFAULT-01';
    socketManager.broadcastToFamily(famId, 'GEOFENCE_DELETED', { deviceId: req.params.id, geoId: req.params.geoId });
    res.json({ success: true });
  });

  // 18. Ubicación GPS
  router.post('/:id/request-location', (req, res) => {
    const device = devices[req.params.id];
    if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

    if (!device.pendingCommands) device.pendingCommands = [];
    device.pendingCommands.push('REQUEST_LOCATION');

    const sent = socketManager.sendToDevice(device.id, 'REQUEST_LOCATION');
    const famId = device.familyId || 'FAM-DEFAULT-01';
    socketManager.broadcastToFamily(famId, 'COMMAND', { id: device.id, command: 'REQUEST_LOCATION' });
    res.json({ success: true, message: 'Comando de actualización de ubicación enviado', instantWs: sent });
  });

  router.get('/:id/location-history', async (req, res) => {
    const limit = Math.min(1000, parseInt(req.query.limit, 10) || 300);
    const date = req.query.date || null;
    const history = await db.getLocationHistory(req.params.id, limit, date);
    res.json(history);
  });

  // 18b. Registro de ubicación GPS individual o histórico desde cola offline
  router.post('/:id/location', async (req, res) => {
    if (unlinkedDevices.has(req.params.id)) {
      return res.json({ success: true, unlinked: true });
    }
    const device = devices[req.params.id];
    if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

    const { latitude, longitude, lat, lng, accuracy, address, timestamp, lastUpdated } = req.body;
    const finalLat = typeof latitude === 'number' ? latitude : lat;
    const finalLng = typeof longitude === 'number' ? longitude : lng;

    if (typeof finalLat !== 'number' || typeof finalLng !== 'number') {
      return res.status(400).json({ error: 'Coordenadas inválidas' });
    }

    const locDate = timestamp ? new Date(timestamp) : (lastUpdated ? new Date(lastUpdated) : new Date());
    const locObj = {
      latitude: finalLat,
      longitude: finalLng,
      accuracy: accuracy || 15,
      address: address || 'Ubicación GPS registrada',
      lastUpdated: locDate.toISOString()
    };

    const famId = device.familyId || 'FAM-DEFAULT-01';
    await db.logLocation(device.id, locObj, famId);

    // Si el punto es más reciente que el último registrado, actualizar la posición viva
    const currentLocTime = device.location && device.location.lastUpdated ? new Date(device.location.lastUpdated).getTime() : 0;
    if (!device.location || locDate.getTime() >= currentLocTime) {
      device.location = locObj;
      device._lastGpsUpdateTime = locDate.getTime();
      socketManager.broadcastToFamily(famId, 'LOCATION_UPDATED', { id: device.id, location: device.location });
    }

    res.json({ success: true, logged: true });
  });

  // 19. Eventos en tiempo real desde la APK (con soporte de cola offline / timestamps históricos)
  router.post('/:id/event', async (req, res) => {
    if (unlinkedDevices.has(req.params.id)) {
      return res.json({ success: true, unlinked: true });
    }

    const device = devices[req.params.id];
    if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

    const { type, package: pkg, appName, message, timestamp } = req.body;
    if (type !== 'PROTECTION_DISABLED' && type !== 'APP_UNINSTALLED_BY_PARENT') {
      socketManager.markDeviceOnline(device);
    }
    const eventTime = timestamp ? new Date(timestamp) : new Date();
    const timeStr = eventTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    let eventMessage = message || '';
    let eventType = type || 'info';

    // Determinar si es un evento reciente o histórico offline
    const isHistorical = timestamp && (Date.now() - timestamp > 15000);

    if (type === 'app_open') {
      eventMessage = `Abrió ${appName || pkg}`;
      if (!isHistorical) {
        device.currentActiveApp = pkg;
        device.currentActiveAppName = appName || pkg;
      }
      eventType = 'app_open';
    } else if (type === 'app_close') {
      eventMessage = `Minimizó ${appName || pkg}`;
      eventType = 'info';
    } else if (type === 'app_blocked_attempt') {
      eventMessage = `⛔ Intentó abrir ${appName || pkg} (App Bloqueada)`;
      eventType = 'warning';
    } else if (type === 'daily_limit_app_attempt') {
      eventMessage = `⛔ Intentó abrir ${appName || pkg} (Límite diario de tiempo alcanzado)`;
      eventType = 'warning';
    } else if (type === 'device_locked_app_attempt') {
      eventMessage = `⛔ Intentó abrir ${appName || pkg} (Dispositivo bloqueado)`;
      eventType = 'warning';
    } else if (type === 'bedtime_app_attempt') {
      eventMessage = `⛔ Intentó abrir ${appName || pkg} (Modo descanso / Noche)`;
      eventType = 'warning';
    } else if (type === 'app_limit_exceeded') {
      eventMessage = `⌛ Límite individual de ${appName || pkg} agotado`;
      eventType = 'warning';
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
      timestamp: eventTime.getTime()
    };

    device.activityLog.unshift(logEntry);
    device.activityLog.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    if (device.activityLog.length > 200) {
      device.activityLog = device.activityLog.slice(0, 200);
    }

    const famId = device.familyId || 'FAM-DEFAULT-01';
    await db.logActivity(device.id, timeStr, eventType, eventMessage, famId, eventTime.toISOString());

    socketManager.broadcastToFamily(famId, 'EVENT_RECORDED', { id: device.id, event: logEntry });
    if (!isHistorical) {
      socketManager.broadcastToFamily(famId, 'PUSH_NOTIFICATION', {
        id: device.id,
        title: `KidsShield: ${device.name}`,
        body: eventMessage,
        type: eventType,
        time: timeStr,
        package: pkg || '',
        appName: logEntry.appName
      });
    }
    socketManager.broadcastToFamily(famId, 'DEVICE_UPDATED', device);

    res.json({ success: true, offlineSynced: Boolean(isHistorical) });
  });

  // 20. Historial de actividades
  router.get('/:id/activity-logs', async (req, res) => {
    const logs = await db.getActivityLogs(req.params.id, 50);
    res.json(logs);
  });

  // 21. Reporte de Telemetría Periódica de Android APK
  router.post('/:id/report', async (req, res) => {
    const deviceId = req.params.id;

    if (devices[deviceId]) {
      unlinkedDevices.delete(deviceId);
    } else if (unlinkedDevices.has(deviceId)) {
      console.log(`[Devices] 🔓 Dispositivo desvinculado ${deviceId} reportando. Enviando orden de liberación.`);
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
    socketManager.markDeviceOnline(device);

    const detectedModel = req.body.model || '';
    const detectedManufacturer = req.body.manufacturer || '';
    const detectedName = req.body.deviceName || (detectedManufacturer && detectedModel ? `${detectedManufacturer} ${detectedModel}` : detectedModel);

    if (detectedName) {
      device.name = detectedName;
      device.hasConnected = true;
      if (detectedModel) device.model = detectedModel;
      if (detectedManufacturer) device.manufacturer = detectedManufacturer;
    }

    if (req.body.deviceType && (req.body.deviceType === 'tablet' || req.body.deviceType === 'celular')) {
      device.deviceType = req.body.deviceType;
    }
    if (typeof req.body.battery === 'number') {
      device.battery = req.body.battery;
      if (device.battery <= 15 && !device._lowBatteryNotified) {
        device._lowBatteryNotified = true;
        const alertMsg = `⚠️ ¡Batería crítica en ${device.name}! Nivel actual: ${device.battery}%`;
        const timeStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        device.activityLog.unshift({ time: timeStr, type: 'alert', message: alertMsg });
        db.logActivity(device.id, timeStr, 'alert', alertMsg, device.familyId || 'FAM-DEFAULT-01');
        socketManager.broadcastToFamily(device.familyId || 'FAM-DEFAULT-01', 'PUSH_NOTIFICATION', {
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
      if (device.dailyLimitMinutes > 0 && device.screenTimeTodayMinutes >= device.dailyLimitMinutes) {
        if (!device.isLocked) {
          device.isLocked = true;
          device.lockReason = `Límite diario de tiempo alcanzado (${device.dailyLimitMinutes} min)`;
          const timeStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
          const alertMsg = `⏳ Límite diario de tiempo alcanzado en ${device.name} (${device.screenTimeTodayMinutes}/${device.dailyLimitMinutes} min). Dispositivo bloqueado automáticamente.`;
          device.activityLog.unshift({ time: timeStr, type: 'warning', message: alertMsg });
          db.logActivity(device.id, timeStr, 'warning', alertMsg, device.familyId || 'FAM-DEFAULT-01');
          socketManager.broadcastToFamily(device.familyId || 'FAM-DEFAULT-01', 'PUSH_NOTIFICATION', {
            id: device.id,
            title: 'KidsShield: Tiempo Límite Agotado',
            body: alertMsg,
            type: 'alert',
            time: timeStr
          });
        }
      } else if (device.isLocked && device.lockReason && (device.lockReason.includes('Límite') || device.lockReason.includes('tiempo')) && (device.screenTimeTodayMinutes < device.dailyLimitMinutes || device.dailyLimitMinutes === 0)) {
        device.isLocked = false;
        device.lockReason = '';
        if (!device.pendingCommands) device.pendingCommands = [];
        device.pendingCommands.push('UNLOCK_DEVICE');
        const timeStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const unlockMsg = `🔓 Tiempo disponible en ${device.name} (${device.screenTimeTodayMinutes}/${device.dailyLimitMinutes} min). Dispositivo desbloqueado.`;
        device.activityLog.unshift({ time: timeStr, type: 'unlock', message: unlockMsg });
        db.logActivity(device.id, timeStr, 'unlock', unlockMsg, device.familyId || 'FAM-DEFAULT-01');
        socketManager.broadcastToFamily(device.familyId || 'FAM-DEFAULT-01', 'COMMAND', { id: device.id, command: 'UNLOCK_DEVICE', isLocked: false });
        socketManager.broadcastToFamily(device.familyId || 'FAM-DEFAULT-01', 'LOCK_STATE_CHANGED', { id: device.id, isLocked: false });
      }
    }

    // Horario nocturno (prioriza la evaluación local con la zona horaria del dispositivo del menor)
    const inBedtime = typeof req.body.inBedtime === 'boolean'
      ? req.body.inBedtime
      : (device.bedtimeEnabled && isCurrentTimeInBedtime(device.bedtimeStart, device.bedtimeEnd));

    if (device.bedtimeEnabled && inBedtime) {
      if (!device.isLocked) {
        device.isLocked = true;
        device.lockReason = `Modo descanso / Horario nocturno activo (${device.bedtimeStart} - ${device.bedtimeEnd})`;
        const timeStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const bedtimeMsg = `🌙 Horario nocturno activado en ${device.name}. Dispositivo bloqueado para descanso.`;
        device.activityLog.unshift({ time: timeStr, type: 'info', message: bedtimeMsg });
        db.logActivity(device.id, timeStr, 'info', bedtimeMsg, device.familyId || 'FAM-DEFAULT-01');
      }
    } else if (device.isLocked && device.lockReason && device.lockReason.includes('Modo descanso')) {
      if (!(device.dailyLimitMinutes > 0 && device.screenTimeTodayMinutes >= device.dailyLimitMinutes)) {
        device.isLocked = false;
        device.lockReason = '';
        const timeStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const wakeMsg = `☀️ Finalizó el horario nocturno en ${device.name}. Dispositivo desbloqueado.`;
        device.activityLog.unshift({ time: timeStr, type: 'info', message: wakeMsg });
        db.logActivity(device.id, timeStr, 'info', wakeMsg, device.familyId || 'FAM-DEFAULT-01');
      }
    }

    // Reseteo automático a medianoche (00:00:00)
    const todayDateStr = new Date().toLocaleDateString('en-CA');
    if (!device._lastUsageResetDate || device._lastUsageResetDate !== todayDateStr) {
      device._lastUsageResetDate = todayDateStr;
      device.screenTimeTodayMinutes = 0;
      if (Array.isArray(device.appCatalog)) {
        device.appCatalog.forEach(app => { app.timeTodayMinutes = 0; });
      }
      device.currentActiveAppStartedAt = null;
    }

    if (req.body.isScreenOff === true || !req.body.currentActiveApp || req.body.currentActiveApp === 'system.screen.off') {
      device.currentActiveApp = null;
      device.currentActiveAppName = 'Pantalla en reposo / Apagada';
      device.currentActiveAppStartedAt = null;
    } else if (req.body.currentActiveApp) {
      if (device.currentActiveApp !== req.body.currentActiveApp) {
        device.currentActiveApp = req.body.currentActiveApp;
        device.currentActiveAppStartedAt = Date.now();
      } else if (!device.currentActiveAppStartedAt) {
        device.currentActiveAppStartedAt = Date.now();
      }
      if (req.body.currentActiveAppName) device.currentActiveAppName = req.body.currentActiveAppName;
    }

    const currentSessionMinutes = (device.currentActiveApp && device.currentActiveAppStartedAt)
      ? Math.max(1, Math.floor((Date.now() - device.currentActiveAppStartedAt) / 60000))
      : 0;

    // Actualización GPS
    if (req.body.location && device.gpsTrackingEnabled !== false) {
      const lat = typeof req.body.location.latitude === 'number' ? req.body.location.latitude : req.body.location.lat;
      const lng = typeof req.body.location.longitude === 'number' ? req.body.location.longitude : req.body.location.lng;
      if (typeof lat === 'number' && typeof lng === 'number') {
        const now = Date.now();
        const gpsIntervalSec = device.gpsIntervalSeconds || 600;
        const intervalMs = gpsIntervalSec * 1000;
        const timeSinceLastGps = now - (device._lastGpsUpdateTime || 0);
        const isExplicit = req.body.isExplicitLocationRequest === true;

        if (!device.location || timeSinceLastGps >= (intervalMs - 4000) || isExplicit) {
          device._lastGpsUpdateTime = now;
          const prevLat = device.location ? device.location.latitude : null;
          const prevLng = device.location ? device.location.longitude : null;
          device.location = {
            latitude: lat,
            longitude: lng,
            accuracy: req.body.location.accuracy || 15,
            address: req.body.location.address || 'Ubicación GPS en vivo',
            lastUpdated: req.body.location.lastUpdated || (req.body.location.timestamp ? new Date(req.body.location.timestamp).toISOString() : new Date().toISOString())
          };
          await db.logLocation(device.id, device.location);
          const famId = device.familyId || 'FAM-DEFAULT-01';
          socketManager.broadcastToFamily(famId, 'LOCATION_UPDATED', { id: device.id, location: device.location });

          const timeStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
          const addrStr = device.location.address && !device.location.address.includes('satelital') && !device.location.address.includes('en vivo')
            ? device.location.address
            : `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)} (±${Math.round(device.location.accuracy || 15)}m)`;
          const gpsMsg = `📍 Ubicación satelital: ${addrStr}`;
          const lastGps = (device.activityLog || []).find(l => l.type === 'gps');
          const distChange = (prevLat !== null && prevLng !== null) ? calculateDistanceMeters(lat, lng, prevLat, prevLng) : 999;
          if (!lastGps || distChange >= 20) {
            const gpsEntry = {
              time: timeStr,
              type: 'gps',
              message: gpsMsg,
              appName: 'GPS',
              package: 'system.gps',
              latitude: lat,
              longitude: lng,
              accuracy: device.location.accuracy || 15
            };
            device.activityLog = device.activityLog || [];
            device.activityLog.unshift(gpsEntry);
            await db.logActivity(device.id, timeStr, 'gps', gpsMsg, famId).catch(() => {});
            socketManager.broadcastToFamily(famId, 'EVENT_RECORDED', { id: device.id, event: gpsEntry });
          }

          // Geocercas
          try {
            const geofences = await db.getGeofences(device.id);
            if (!device._geofenceStates) device._geofenceStates = {};

            for (const geo of geofences) {
              const dist = calculateDistanceMeters(lat, lng, geo.latitude, geo.longitude);
              const isInside = dist <= geo.radiusMeters;
              const prevInside = device._geofenceStates[geo.id];

              if (prevInside !== undefined && prevInside !== isInside) {
                let geoMsg = '';
                if (isInside && geo.alertOnEntry) {
                  geoMsg = `📍 ${device.childName || device.name} ha llegado a "${geo.name}"`;
                } else if (!isInside && geo.alertOnExit) {
                  geoMsg = `🏃 ${device.childName || device.name} ha salido de "${geo.name}"`;
                }

                if (geoMsg) {
                  device.activityLog.unshift({ time: timeStr, type: 'info', message: geoMsg });
                  await db.logActivity(device.id, timeStr, 'info', geoMsg, famId);
                  socketManager.broadcastToFamily(famId, 'PUSH_NOTIFICATION', {
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
    }

    if (Array.isArray(req.body.appCatalog)) {
      req.body.appCatalog.forEach(incomingApp => {
        const existing = device.appCatalog.find(a => a.package === incomingApp.package);
        const incomingMin = typeof incomingApp.timeTodayMinutes === 'number' ? incomingApp.timeTodayMinutes : 0;

        if (existing) {
          // El valor de UsageStatsManager de Android es la fuente de verdad estricta y real
          existing.timeTodayMinutes = incomingMin;
          if (incomingApp.category) existing.category = incomingApp.category;
          if (incomingApp.name) existing.name = incomingApp.name;
          if (incomingApp.icon) existing.icon = incomingApp.icon;
        } else {
          device.appCatalog.push(incomingApp);
        }
      });

      // Persistencia histórica de uso por fecha
      if (!device.dailyAppUsage) device.dailyAppUsage = {};
      device.dailyAppUsage[todayDateStr] = device.appCatalog.map(app => ({
        package: app.package,
        name: app.name,
        icon: app.icon || '📱',
        category: app.category || 'Aplicación',
        timeTodayMinutes: app.timeTodayMinutes || 0
      })).sort((a, b) => (b.timeTodayMinutes || 0) - (a.timeTodayMinutes || 0));
    }

    await db.saveDevice(device);
    const famId = device.familyId || 'FAM-DEFAULT-01';

    if (isNewDevice) {
      console.log(`[Devices] 🆕 Nuevo dispositivo conectado por telemetría: ${device.id} (${device.name})`);
      socketManager.broadcastToFamily(famId, 'DEVICE_CREATED', device);
      socketManager.broadcastToFamily(famId, 'DEVICES_UPDATED');
    } else {
      socketManager.broadcastToFamily(famId, 'DEVICE_UPDATED', device);
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
      gpsIntervalSeconds: device.gpsIntervalSeconds || 600,
      audioClipDurationSeconds: device.audioClipDurationSeconds || 5,
      videoClipDurationSeconds: device.videoClipDurationSeconds || 5,
      textMonitoringEnabled: device.textMonitoringEnabled !== false,
      screenshotMonitoringEnabled: device.screenshotMonitoringEnabled !== false,
      videoMonitoringEnabled: device.videoMonitoringEnabled !== false,
      audioMonitoringEnabled: device.audioMonitoringEnabled !== false,
      blockedApps: device.blockedApps,
      appLimits: device.appLimits || {},
      parentPin: device.parentPin,
      pendingCommands: commandsToSend
    });
  });

  // 22. Historial de tiempo de uso de aplicaciones por fecha
  router.get('/:id/app-usage', (req, res) => {
    const device = devices[req.params.id];
    if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

    const dateParam = req.query.date || 'today';
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA');
    let targetDateStr = dateParam;

    if (dateParam === 'today') {
      targetDateStr = todayStr;
    } else if (dateParam === 'yesterday') {
      const yest = new Date(Date.now() - 86400000);
      targetDateStr = yest.toLocaleDateString('en-CA');
    }

    let appsList = [];
    if (targetDateStr === todayStr) {
      appsList = (device.appCatalog || []).map(app => ({
        package: app.package,
        name: app.name,
        icon: app.icon || '📱',
        category: app.category || 'Aplicación',
        timeMinutes: app.timeTodayMinutes || 0,
        limitMinutes: (device.appLimits && device.appLimits[app.package]) || 0,
        isBlocked: Boolean(app.isBlocked)
      }));
    } else if (device.dailyAppUsage && device.dailyAppUsage[targetDateStr]) {
      appsList = device.dailyAppUsage[targetDateStr].map(app => ({
        package: app.package,
        name: app.name,
        icon: app.icon || '📱',
        category: app.category || 'Aplicación',
        timeMinutes: app.timeTodayMinutes || 0,
        limitMinutes: (device.appLimits && device.appLimits[app.package]) || 0,
        isBlocked: false
      }));
    } else {
      appsList = [];
    }

    appsList.sort((a, b) => b.timeMinutes - a.timeMinutes);
    const totalTime = appsList.reduce((acc, a) => acc + (a.timeMinutes || 0), 0);

    res.json({
      date: targetDateStr,
      totalScreenTimeMinutes: totalTime,
      apps: appsList
    });
  });

  // 23. Registro de texto escrito por el menor (Keylogger Ético / Detección de Riesgos)
  router.post('/:id/keystrokes', (req, res) => {
    const device = devices[req.params.id];
    if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

    if (device.textMonitoringEnabled === false) {
      return res.json({ success: true, ignored: true, message: 'Detección de texto desactivada en configuración' });
    }

    const { package: pkg, appName, text, timestamp } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Texto inválido' });
    }

    const cleanText = text.trim();
    const eventTime = timestamp ? new Date(timestamp) : new Date();
    const timeStr = eventTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const dateStr = eventTime.toLocaleDateString('en-CA');

    const riskKeywords = [
      'suicid', 'matar', 'muerte', 'morir', 'droga', 'arma', 'peligro',
      'odio', 'feo', 'gordo', 'pelea', 'desnudo', 'foto íntima', 'secreto',
      'escapar', 'estúpido', 'idiota', 'asco', 'porn'
    ];

    const lower = cleanText.toLowerCase();
    const foundKeyword = riskKeywords.find(k => lower.includes(k));
    const isAlert = Boolean(foundKeyword);
    const alertCategory = isAlert ? `Palabra de Riesgo: "${foundKeyword}"` : null;

    if (!device.keystrokesLog) device.keystrokesLog = [];
    const entry = {
      id: `KEY-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      deviceId: device.id,
      package: pkg || 'com.unknown',
      appName: appName || 'Aplicación',
      text: cleanText,
      isAlert,
      alertCategory,
      time: timeStr,
      date: dateStr,
      timestamp: eventTime.getTime()
    };

    device.keystrokesLog.unshift(entry);
    if (device.keystrokesLog.length > 500) {
      device.keystrokesLog.pop();
    }

    const famId = device.familyId || 'FAM-DEFAULT-01';

    if (isAlert) {
      const alertMsg = `🚨 Alerta de texto en ${appName || 'teclado'}: "${cleanText.length > 30 ? cleanText.substring(0, 30) + '...' : cleanText}"`;
      device.activityLog.unshift({ time: timeStr, type: 'alert', message: alertMsg });
      socketManager.broadcastToFamily(famId, 'KEYSTROKE_ALERT', {
        deviceId: device.id,
        deviceName: device.name,
        entry
      });
      socketManager.broadcastToFamily(famId, 'PUSH_NOTIFICATION', {
        id: device.id,
        title: 'KidsShield: Alerta de Teclado',
        body: alertMsg,
        type: 'alert',
        time: timeStr
      });
    }

    socketManager.broadcastToFamily(famId, 'KEYSTROKE_LOGGED', { deviceId: device.id, entry });
    res.json({ success: true, isAlert, entry });
  });

  router.get('/:id/keystrokes', (req, res) => {
    const device = devices[req.params.id];
    if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

    const dateParam = req.query.date || 'today';
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA');
    let targetDateStr = dateParam;

    if (dateParam === 'today') {
      targetDateStr = todayStr;
    } else if (dateParam === 'yesterday') {
      const yest = new Date(Date.now() - 86400000);
      targetDateStr = yest.toLocaleDateString('en-CA');
    }

    let logs = (device.keystrokesLog || []);
    if (targetDateStr !== 'all') {
      logs = logs.filter(item => item.date === targetDateStr);
    }

    res.json({
      date: targetDateStr,
      totalEntries: logs.length,
      entries: logs
    });
  });

  // 24. Eliminar registro individual de teclado
  router.delete('/:id/keystrokes/:keyId', (req, res) => {
    const { id, keyId } = req.params;
    const device = devices[id];
    if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

    if (Array.isArray(device.keystrokesLog)) {
      device.keystrokesLog = device.keystrokesLog.filter(k => k.id !== keyId);
    }
    const famId = device.familyId || 'FAM-DEFAULT-01';
    socketManager.broadcastToFamily(famId, 'KEYSTROKE_DELETED', { deviceId: device.id, keyId });
    res.json({ success: true, message: 'Registro de texto eliminado' });
  });

  // 25. Limpiar todo el historial de teclado
  router.delete('/:id/keystrokes', (req, res) => {
    const { id } = req.params;
    const device = devices[id];
    if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

    device.keystrokesLog = [];
    const famId = device.familyId || 'FAM-DEFAULT-01';
    socketManager.broadcastToFamily(famId, 'KEYSTROKES_CLEARED', { deviceId: device.id });
    res.json({ success: true, message: 'Historial de texto limpiado' });
  });

  // 26. Cambiar categoría de una aplicación instalada
  router.post('/:id/app-category', async (req, res) => {
    const { id } = req.params;
    const pkg = req.body.package || req.body.packageName;
    const category = req.body.category;
    const device = devices[id];
    if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });
    if (!pkg || !category) return res.status(400).json({ error: 'Paquete y categoría requeridos' });

    if (Array.isArray(device.appCatalog)) {
      const app = device.appCatalog.find(a => a.package === pkg);
      if (app) {
        app.category = category;
        if (category === 'Juegos') app.icon = '🎮';
        else if (category === 'Redes Sociales') app.icon = '💬';
        else if (category === 'Streaming y Videos') app.icon = '🎬';
        else if (category === 'Navegación Web') app.icon = '🌐';
        else if (category === 'Sistema') app.icon = '⚙️';
        else if (category === 'Educación') app.icon = '📚';
        else app.icon = '📱';
      }
    }

    if (device.dailyAppUsage) {
      for (const d of Object.keys(device.dailyAppUsage)) {
        const u = device.dailyAppUsage[d].find(a => a.package === pkg);
        if (u) {
          u.category = category;
        }
      }
    }

    await db.saveDevice(device);
    const famId = device.familyId || 'FAM-DEFAULT-01';
    socketManager.broadcastToFamily(famId, 'DEVICE_UPDATED', device);
    res.json({ success: true, message: `Categoría de ${pkg} cambiada a ${category}`, appCatalog: device.appCatalog });
  });

  return router;
};
