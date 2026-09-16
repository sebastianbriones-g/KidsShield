require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const os = require('os');
const db = require('./db');
const socketManager = require('./sockets/socketManager');
const authRoutes = require('./routes/authRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const createDeviceRouter = require('./routes/deviceRoutes');
const createReportRouter = require('./routes/reportRoutes');

const app = express();
const server = http.createServer(app);

// Middlewares globales
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../parent-dashboard')));

// Logging middleware para rutas API
app.use((req, res, next) => {
  if (req.url.startsWith('/api') && !req.url.includes('/report')) {
    console.log(`[HTTP] ${req.method} ${req.url}`);
  }
  next();
});

// Cache en memoria sincronizada con Turso / SQLite
const devices = {};
const unlinkedDevices = new Set();

// Plantilla de dispositivo por defecto
function createDefaultDevice(id, name, childName, avatar = '📱', deviceType = 'celular') {
  return {
    id,
    name: name || 'Esperando conexión...',
    childName: childName || (id === 'KID-PHONE-01' ? 'Seba' : 'Hijo'),
    avatar: avatar || '👦',
    deviceType: (deviceType === 'tablet') ? 'tablet' : 'celular',
    hasConnected: false,
    model: '',
    manufacturer: '',
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
      return currentMinutes >= startTotal || currentMinutes < endTotal;
    }
  } catch (e) {
    return false;
  }
}

// Determinar la mejor IP de red (Tailscale o LAN)
function getBestServerIp() {
  const nets = os.networkInterfaces();
  // 1. Prioridad: Tailscale
  for (const name of Object.keys(nets)) {
    if (name.toLowerCase().includes('tailscale')) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) return net.address;
      }
    }
  }
  // 2. Prioridad: Wi-Fi / Ethernet
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '100.74.204.90';
}

// Inicializar base de datos y cargar dispositivos
async function bootstrap() {
  await db.initDb();
  const dbDevices = await db.getAllDevices();
  if (dbDevices.length > 0) {
    for (const d of dbDevices) {
      d.pendingCommands = [];
      const realLogs = await db.getActivityLogs(d.id, 30);
      d.activityLog = realLogs || [];
      if (d.id === 'KID-PHONE-01' && (!d.childName || d.childName === 'Hijo' || d.childName === 'Mateo' || d.childName === 'Hijo 1')) {
        d.childName = 'Seba';
        db.saveDevice(d).catch(() => {});
      }
      devices[d.id] = d;
    }
    console.log(`[Database] Cargados ${dbDevices.length} dispositivos desde la base de datos.`);
  } else {
    console.log('[Database] 0 dispositivos en base de datos. Esperando vinculación de APK o registro web.');
  }

  // Inicializar servidor de WebSockets con aislamiento por familia
  socketManager.init(server, devices, db);
}
bootstrap();

// Montaje de Rutas Modulares
app.use('/api/auth', authRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/devices', createDeviceRouter({
  devices,
  unlinkedDevices,
  createDefaultDevice,
  isCurrentTimeInBedtime,
  getBestServerIp
}));
app.use('/api/reports', createReportRouter({ devices }));

// Heartbeat Watchdog: Detecta dispositivos desconectados por timeout (> 60s sin telemetría)
const HEARTBEAT_TIMEOUT_MS = 60000;
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

        const famId = device.familyId || 'FAM-DEFAULT-01';
        db.logActivity(device.id, timeStr, 'alert', alertMsg, famId).catch(() => {});

        socketManager.broadcastToFamily(famId, 'DEVICE_STATUS_CHANGED', {
          id: device.id,
          name: device.name,
          isOnline: false,
          lastSeen: device.lastSeen,
          reason: 'timeout',
          message: alertMsg
        });

        socketManager.broadcastToFamily(famId, 'DEVICE_UPDATED', device);

        socketManager.broadcastToFamily(famId, 'PUSH_NOTIFICATION', {
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
  console.log(`🛡️ SERVIDOR DE CONTROL PARENTAL MODULAR INICIADO`);
  console.log(`🌐 Panel Local:          http://localhost:${PORT}`);
  console.log(`🌐 Panel en Tailscale:    http://${bestIp}:${PORT} (o http://note:${PORT})`);
  console.log(`📱 Endpoint APK Android: http://${bestIp}:${PORT}/api/devices/KID-PHONE-01`);
  console.log(`====================================================`);
});
