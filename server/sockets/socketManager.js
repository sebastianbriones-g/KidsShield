const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');

let wss = null;
let devicesCache = {};
let dbClient = null;

// Mapas de aislamiento por familia y dispositivo
const familySockets = new Map(); // familyId -> Set<WebSocket>
const deviceSockets = new Map(); // deviceId -> WebSocket
const socketMeta = new WeakMap(); // ws -> { type, familyId, deviceId }

function init(server, devices, db) {
  wss = new WebSocket.Server({ server });
  devicesCache = devices;
  dbClient = db;

  wss.on('connection', (ws) => {
    // Configuración inicial de socket anónimo
    socketMeta.set(ws, { authenticated: false, type: 'unknown' });

    ws.send(JSON.stringify({
      type: 'CONNECTED',
      payload: { message: 'Conectado al servidor KidsShield. Esperando autenticación.' }
    }));

    ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg);

        // Heartbeat PING/PONG
        if (data.type === 'PING') {
          return ws.send(JSON.stringify({ type: 'PONG' }));
        }

        // 1. Autenticación de Panel de Padres
        if (data.type === 'AUTH_PARENT') {
          const { token } = data;
          if (!token) return;

          try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const familyId = decoded.familyId || 'FAM-DEFAULT-01';

            socketMeta.set(ws, {
              authenticated: true,
              type: 'parent',
              familyId,
              userId: decoded.id
            });

            if (!familySockets.has(familyId)) {
              familySockets.set(familyId, new Set());
            }
            familySockets.get(familyId).add(ws);

            console.log(`[WS] 👨‍💼 Padre autenticado para familia: ${familyId} (Usuario: ${decoded.name || decoded.email})`);
            ws.send(JSON.stringify({
              type: 'AUTH_SUCCESS',
              payload: { familyId, role: 'parent' }
            }));
          } catch (jwtErr) {
            console.warn('[WS] Token de padre inválido en handshake:', jwtErr.message);
            ws.send(JSON.stringify({ type: 'AUTH_ERROR', error: 'Token inválido' }));
          }
          return;
        }

        // 2. Autenticación de App Móvil del Menor
        if (data.type === 'AUTH_DEVICE') {
          const { deviceId, familyId } = data;
          if (!deviceId) return;

          const assignedFamilyId = familyId || (devicesCache[deviceId] ? devicesCache[deviceId].familyId : 'FAM-DEFAULT-01');

          socketMeta.set(ws, {
            authenticated: true,
            type: 'device',
            deviceId,
            familyId: assignedFamilyId
          });

          deviceSockets.set(deviceId, ws);

          if (devicesCache[deviceId]) {
            markDeviceOnline(devicesCache[deviceId]);
          }

          console.log(`[WS] 📱 Dispositivo Android autenticado en tiempo real: ${deviceId} (Familia: ${assignedFamilyId})`);
          ws.send(JSON.stringify({
            type: 'AUTH_SUCCESS',
            payload: { deviceId, familyId: assignedFamilyId, role: 'device' }
          }));
          return;
        }

        // 3. Telemetría o confirmación de comandos desde el dispositivo
        const meta = socketMeta.get(ws);
        if (meta && meta.type === 'device' && meta.deviceId) {
          const dev = devicesCache[meta.deviceId];
          if (dev) {
            markDeviceOnline(dev);
          }
        }
      } catch (e) {
        console.error('[WS] Error procesando mensaje WebSocket:', e.message);
      }
    });

    ws.on('close', () => {
      const meta = socketMeta.get(ws);
      if (!meta) return;

      if (meta.type === 'parent' && meta.familyId) {
        const famSet = familySockets.get(meta.familyId);
        if (famSet) {
          famSet.delete(ws);
          if (famSet.size === 0) familySockets.delete(meta.familyId);
        }
      } else if (meta.type === 'device' && meta.deviceId) {
        if (deviceSockets.get(meta.deviceId) === ws) {
          deviceSockets.delete(meta.deviceId);
          const dev = devicesCache[meta.deviceId];
          if (dev) {
            dev.isOnline = false;
            broadcastToFamily(dev.familyId || meta.familyId, 'DEVICE_STATUS_CHANGED', {
              id: dev.id,
              name: dev.name,
              isOnline: false,
              lastSeen: dev.lastSeen,
              message: `⚠️ Conexión perdida con ${dev.name || dev.id}.`
            });
          }
        }
      }
    });

    ws.on('error', (err) => {
      console.warn('[WS] Error en socket:', err.message);
    });
  });

  console.log('[WS] Gestor modular de WebSockets inicializado con aislamiento multi-inquilino');
}

// Envía un evento exclusivamente a los clientes (padres) de una familia específica
function broadcastToFamily(familyId, type, payload) {
  if (!familyId) {
    // Si no se indica familia, emitir globalmente con precaución
    return broadcast(type, payload);
  }

  const clients = familySockets.get(familyId);
  if (!clients || clients.size === 0) return;

  const data = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

// Envía un comando instantáneo directamente a la app Android del menor
function sendToDevice(deviceId, type, payload) {
  const ws = deviceSockets.get(deviceId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload, timestamp: new Date().toISOString() }));
    console.log(`[WS] ⚡ Comando instantáneo enviado al dispositivo ${deviceId}: ${type}`);
    return true;
  }
  return false;
}

// Emisión global (usada para compatibilidad o anuncios generales de servidor)
function broadcast(type, payload) {
  if (!wss) return;
  const data = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// Marca un dispositivo como conectado y emite el evento solo a su familia
function markDeviceOnline(device) {
  if (!device) return;
  const now = new Date().toISOString();
  const wasOffline = !device.isOnline;
  device.isOnline = true;
  device.lastSeen = now;

  if (wasOffline) {
    console.log(`[Watchdog] 🟢 Dispositivo ${device.id} (${device.name}) reconectado.`);
    if (dbClient && dbClient.client) {
      try {
        dbClient.client.execute({
          sql: 'UPDATE devices SET is_online = 1, last_seen = ? WHERE id = ?',
          args: [now, device.id]
        }).catch(err => console.error('[DB] Error actualizando is_online:', err));
      } catch (e) {}
    }

    const famId = device.familyId || 'FAM-DEFAULT-01';
    broadcastToFamily(famId, 'DEVICE_STATUS_CHANGED', {
      id: device.id,
      name: device.name,
      isOnline: true,
      lastSeen: now,
      message: `🟢 Dispositivo ${device.name} conectado.`
    });
    broadcastToFamily(famId, 'DEVICE_UPDATED', device);
  }
}

module.exports = {
  init,
  broadcastToFamily,
  sendToDevice,
  broadcast,
  markDeviceOnline,
  isDeviceConnected: (deviceId) => {
    const ws = deviceSockets.get(deviceId);
    return Boolean(ws && ws.readyState === WebSocket.OPEN);
  }
};
