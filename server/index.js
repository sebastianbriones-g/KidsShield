const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../parent-dashboard')));

// In-memory state (can be saved to disk)
const devices = {
  'KID-PHONE-01': {
    id: 'KID-PHONE-01',
    name: 'Teléfono de Mateo (Galaxy A34)',
    childName: 'Mateo',
    avatar: '👦',
    isOnline: true,
    battery: 78,
    lastSeen: new Date().toISOString(),
    isLocked: false,
    lockReason: 'Bloqueado por padres',
    parentPin: '1234',
    screenTimeTodayMinutes: 135,
    dailyLimitMinutes: 120, // 2 horas
    bedtimeEnabled: true,
    bedtimeStart: '21:30',
    bedtimeEnd: '07:00',
    currentActiveApp: 'com.zhiliaoapp.musically', // TikTok
    currentActiveAppName: 'TikTok',
    blockedApps: [
      'com.roblox.client',
      'com.instagram.android'
    ],
    appCatalog: [
      { package: 'com.zhiliaoapp.musically', name: 'TikTok', category: 'Redes Sociales', icon: '📱', timeTodayMinutes: 65, isBlocked: false },
      { package: 'com.google.android.youtube', name: 'YouTube', category: 'Videos', icon: '▶️', timeTodayMinutes: 40, isBlocked: false },
      { package: 'com.whatsapp', name: 'WhatsApp', category: 'Mensajería', icon: '💬', timeTodayMinutes: 20, isBlocked: false },
      { package: 'com.roblox.client', name: 'Roblox', category: 'Juegos', icon: '🎮', timeTodayMinutes: 0, isBlocked: true },
      { package: 'com.instagram.android', name: 'Instagram', category: 'Redes Sociales', icon: '📸', timeTodayMinutes: 0, isBlocked: true },
      { package: 'com.duolingo', name: 'Duolingo', category: 'Educación', icon: '🦉', timeTodayMinutes: 10, isBlocked: false },
      { package: 'com.android.chrome', name: 'Google Chrome', category: 'Navegador', icon: '🌐', timeTodayMinutes: 0, isBlocked: false }
    ],
    activityLog: [
      { time: '22:15', type: 'warning', message: 'Mateo intentó abrir Roblox (Bloqueado)' },
      { time: '21:45', type: 'info', message: 'Tiempo total de pantalla superó las 2 horas' },
      { time: '20:10', type: 'alert', message: 'TikTok usado por más de 60 minutos continuos' },
      { time: '18:30', type: 'success', message: 'Mateo completó 10 min en Duolingo' }
    ]
  }
};

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
  ws.send(JSON.stringify({ type: 'INIT_STATE', payload: devices }));

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

// API Endpoints
// List all devices
app.get('/api/devices', (req, res) => {
  res.json(Object.values(devices));
});

// Get specific device status
app.get('/api/devices/:id', (req, res) => {
  const device = devices[req.params.id];
  if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });
  res.json(device);
});

// Update device configuration (Remote actions from parent dashboard)
app.post('/api/devices/:id/config', (req, res) => {
  const device = devices[req.params.id];
  if (!device) return res.status(404).json({ error: 'Dispositivo no encontrado' });

  const { isLocked, lockReason, dailyLimitMinutes, bedtimeEnabled, bedtimeStart, bedtimeEnd, blockedApps, parentPin } = req.body;

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

  if (Array.isArray(blockedApps)) {
    device.blockedApps = blockedApps;
    device.appCatalog.forEach(app => {
      app.isBlocked = blockedApps.includes(app.package);
    });
  }

  broadcast('DEVICE_UPDATED', device);
  res.json({ success: true, device });
});

// Toggle individual app block status
app.post('/api/devices/:id/toggle-app', (req, res) => {
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

  broadcast('DEVICE_UPDATED', device);
  res.json({ success: true, device });
});

// Endpoint used by Child Android APK: Periodic telemetry & status report
app.post('/api/devices/:id/report', (req, res) => {
  const deviceId = req.params.id;
  if (!devices[deviceId]) {
    // Auto-register new child phone if needed
    devices[deviceId] = {
      id: deviceId,
      name: req.body.deviceName || 'Dispositivo Hijo',
      childName: req.body.childName || 'Hijo',
      avatar: '📱',
      isOnline: true,
      battery: req.body.battery || 100,
      lastSeen: new Date().toISOString(),
      isLocked: false,
      lockReason: '',
      parentPin: '1234',
      screenTimeTodayMinutes: req.body.screenTimeTodayMinutes || 0,
      dailyLimitMinutes: 120,
      bedtimeEnabled: true,
      bedtimeStart: '21:30',
      bedtimeEnd: '07:00',
      currentActiveApp: req.body.currentActiveApp || '',
      currentActiveAppName: req.body.currentActiveAppName || '',
      blockedApps: [],
      appCatalog: req.body.appCatalog || [],
      activityLog: [{ time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }), type: 'success', message: 'Dispositivo registrado e iniciado' }]
    };
  }

  const device = devices[deviceId];
  device.isOnline = true;
  device.lastSeen = new Date().toISOString();
  if (typeof req.body.battery === 'number') device.battery = req.body.battery;
  if (typeof req.body.screenTimeTodayMinutes === 'number') device.screenTimeTodayMinutes = req.body.screenTimeTodayMinutes;
  if (req.body.currentActiveApp) device.currentActiveApp = req.body.currentActiveApp;
  if (req.body.currentActiveAppName) device.currentActiveAppName = req.body.currentActiveAppName;
  if (Array.isArray(req.body.appCatalog)) {
    req.body.appCatalog.forEach(incomingApp => {
      const existing = device.appCatalog.find(a => a.package === incomingApp.package);
      if (existing) {
        existing.timeTodayMinutes = incomingApp.timeTodayMinutes;
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

  broadcast('DEVICE_UPDATED', device);

  // Return current commands to child phone
  res.json({
    isLocked: device.isLocked,
    lockReason: device.lockReason,
    dailyLimitMinutes: device.dailyLimitMinutes,
    bedtimeEnabled: device.bedtimeEnabled,
    bedtimeStart: device.bedtimeStart,
    bedtimeEnd: device.bedtimeEnd,
    blockedApps: device.blockedApps,
    parentPin: device.parentPin
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🛡️ SERVIDOR DE CONTROL PARENTAL INICIADO`);
  console.log(`🌐 Panel de Padres: http://localhost:${PORT}`);
  console.log(`📱 Endpoint APK Android: http://localhost:${PORT}/api/devices/KID-PHONE-01`);
  console.log(`====================================================`);
});
