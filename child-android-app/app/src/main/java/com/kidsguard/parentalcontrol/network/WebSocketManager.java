package com.kidsguard.parentalcontrol.network;

import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.kidsguard.parentalcontrol.models.ParentalConfig;
import com.kidsguard.parentalcontrol.services.AppBlockerAccessibilityService;
import com.kidsguard.parentalcontrol.services.UsageMonitorService;
import com.kidsguard.parentalcontrol.ui.LockOverlayActivity;
import com.kidsguard.parentalcontrol.utils.AudioCaptureHelper;

import org.json.JSONObject;

import java.util.Set;
import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

public class WebSocketManager {

    private static final String TAG = "KidsShield_WS";
    private static WebSocketManager instance;

    private final Context context;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private OkHttpClient client;
    private WebSocket webSocket;
    private boolean isConnected = false;
    private boolean shouldReconnect = true;
    private int reconnectAttempts = 0;

    private WebSocketManager(Context context) {
        this.context = context.getApplicationContext();
        initClient();
    }

    public static synchronized WebSocketManager getInstance(Context context) {
        if (instance == null) {
            instance = new WebSocketManager(context);
        }
        return instance;
    }

    private void initClient() {
        client = new OkHttpClient.Builder()
                .readTimeout(0, TimeUnit.MILLISECONDS) // Sin timeout de lectura para WebSocket persistente
                .pingInterval(20, TimeUnit.SECONDS)   // Heartbeat ping/pong cada 20 segundos
                .retryOnConnectionFailure(true)
                .build();
    }

    public synchronized void connect() {
        ParentalConfig config = ParentalConfig.getInstance(context);
        String serverUrl = config.getServerUrl();
        if (serverUrl == null || serverUrl.trim().isEmpty()) {
            Log.w(TAG, "No hay URL de servidor configurada para conectar WebSocket");
            return;
        }

        if (isConnected && webSocket != null) {
            return;
        }

        shouldReconnect = true;
        String wsUrl = serverUrl.replace("http://", "ws://").replace("https://", "wss://");
        Log.i(TAG, "⚡ Conectando al canal de comandos instantáneos: " + wsUrl);

        Request request = new Request.Builder().url(wsUrl).build();
        webSocket = client.newWebSocket(request, new WebSocketListener() {
            @Override
            public void onOpen(WebSocket ws, Response response) {
                isConnected = true;
                reconnectAttempts = 0;
                Log.i(TAG, "🟢 Conectado exitosamente al WebSocket del servidor KidsShield");

                // Enviar autenticación del terminal móvil
                try {
                    JSONObject authMsg = new JSONObject();
                    authMsg.put("type", "AUTH_DEVICE");
                    authMsg.put("deviceId", config.getDeviceId());
                    ws.send(authMsg.toString());
                } catch (Exception e) {
                    Log.e(TAG, "Error enviando handshake AUTH_DEVICE", e);
                }
            }

            @Override
            public void onMessage(WebSocket ws, String text) {
                Log.d(TAG, "Mensaje WebSocket recibido: " + text);
                try {
                    JSONObject data = new JSONObject(text);
                    String type = data.optString("type", "");
                    JSONObject payload = data.optJSONObject("payload");

                    handleIncomingCommand(type, payload);
                } catch (Exception e) {
                    Log.e(TAG, "Error procesando mensaje WebSocket entrante", e);
                }
            }

            @Override
            public void onClosing(WebSocket ws, int code, String reason) {
                Log.i(TAG, "WebSocket cerrándose: " + reason);
                isConnected = false;
            }

            @Override
            public void onClosed(WebSocket ws, int code, String reason) {
                Log.i(TAG, "WebSocket cerrado: " + reason);
                isConnected = false;
                scheduleReconnect();
            }

            @Override
            public void onFailure(WebSocket ws, Throwable t, Response response) {
                Log.w(TAG, "Fallo en conexión WebSocket: " + t.getMessage());
                isConnected = false;
                scheduleReconnect();
            }
        });
    }

    private void handleIncomingCommand(String type, JSONObject payload) {
        ParentalConfig config = ParentalConfig.getInstance(context);

        if ("LOCK_DEVICE".equalsIgnoreCase(type) || ("COMMAND".equalsIgnoreCase(type) && "LOCK_DEVICE".equalsIgnoreCase(payload != null ? payload.optString("command") : ""))) {
            String reason = payload != null ? payload.optString("reason", "Dispositivo bloqueado remotamente por los padres.") : "Dispositivo bloqueado remotamente por los padres.";
            Log.i(TAG, "⚡ [INSTANTÁNEO] Bloqueando dispositivo por orden WebSocket: " + reason);

            config.setDeviceLocked(true);
            config.setLockReason(reason);

            AppBlockerAccessibilityService a11y = AppBlockerAccessibilityService.getInstance();
            if (a11y != null) {
                a11y.kickCurrentAppIfLocked(reason);
            }

            mainHandler.post(() -> {
                try {
                    Intent lockIntent = new Intent(context, LockOverlayActivity.class);
                    lockIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    lockIntent.putExtra("BLOCK_REASON", reason);
                    lockIntent.putExtra("IS_DEVICE_LOCKED", true);
                    context.startActivity(lockIntent);
                } catch (Exception e) {
                    Log.e(TAG, "Error lanzando LockOverlayActivity", e);
                }
            });

        } else if ("UNLOCK_DEVICE".equalsIgnoreCase(type) || ("COMMAND".equalsIgnoreCase(type) && "UNLOCK_DEVICE".equalsIgnoreCase(payload != null ? payload.optString("command") : ""))) {
            Log.i(TAG, "⚡ [INSTANTÁNEO] Desbloqueando dispositivo por orden WebSocket");
            config.setDeviceLocked(false);
            config.setLockReason("");
            mainHandler.post(LockOverlayActivity::dismissIfOpen);

        } else if ("UNLINK_DEVICE".equalsIgnoreCase(type)) {
            Log.i(TAG, "⚡ [INSTANTÁNEO] Desvinculando dispositivo por orden WebSocket");
            SyncClient.handleUnlinkAndRelease(context);

        } else if ("TAKE_SCREENSHOT".equalsIgnoreCase(type) || ("COMMAND".equalsIgnoreCase(type) && "TAKE_SCREENSHOT".equalsIgnoreCase(payload != null ? payload.optString("command") : ""))) {
            Log.i(TAG, "⚡ [INSTANTÁNEO] Capturando pantalla por orden WebSocket");
            AppBlockerAccessibilityService a11y = AppBlockerAccessibilityService.getInstance();
            if (a11y != null) {
                a11y.captureScreenshot();
            } else {
                Log.w(TAG, "Servicio de accesibilidad inactivo para captura");
            }

        } else if (type.startsWith("TAKE_VIDEO") || ("COMMAND".equalsIgnoreCase(type) && payload != null && payload.optString("command", "").startsWith("TAKE_VIDEO"))) {
            int duration = payload != null ? payload.optInt("duration", 5) : 5;
            Log.i(TAG, "⚡ [INSTANTÁNEO] Iniciando clip de video (" + duration + "s)");
            AppBlockerAccessibilityService a11y = AppBlockerAccessibilityService.getInstance();
            if (a11y != null) {
                a11y.captureVideoClip(duration);
            }

        } else if (type.startsWith("RECORD_AUDIO") || ("COMMAND".equalsIgnoreCase(type) && payload != null && payload.optString("command", "").startsWith("RECORD_AUDIO"))) {
            int duration = payload != null ? payload.optInt("duration", 5) : 5;
            Log.i(TAG, "⚡ [INSTANTÁNEO] Grabando audio ambiental (" + duration + "s)");
            AudioCaptureHelper.captureAndUploadAudio(context, duration);

        } else if ("REQUEST_LOCATION".equalsIgnoreCase(type) || ("COMMAND".equalsIgnoreCase(type) && "REQUEST_LOCATION".equalsIgnoreCase(payload != null ? payload.optString("command") : ""))) {
            Log.i(TAG, "⚡ [INSTANTÁNEO] Solicitud inmediata de ubicación satelital GPS");
            UsageMonitorService.triggerImmediateSync();

        } else if (type.startsWith("BLOCK_APP:") || (payload != null && payload.optString("command", "").startsWith("BLOCK_APP:"))) {
            String fullCmd = type.startsWith("BLOCK_APP:") ? type : payload.optString("command", "");
            String pkg = fullCmd.substring("BLOCK_APP:".length()).trim();
            Set<String> blocked = config.getBlockedApps();
            blocked.add(pkg);
            config.setBlockedApps(blocked);
            Log.i(TAG, "⚡ [INSTANTÁNEO] Aplicación bloqueada: " + pkg);

        } else if (type.startsWith("UNBLOCK_APP:") || (payload != null && payload.optString("command", "").startsWith("UNBLOCK_APP:"))) {
            String fullCmd = type.startsWith("UNBLOCK_APP:") ? type : payload.optString("command", "");
            String pkg = fullCmd.substring("UNBLOCK_APP:".length()).trim();
            Set<String> blocked = config.getBlockedApps();
            blocked.remove(pkg.toLowerCase(java.util.Locale.ROOT));
            config.setBlockedApps(blocked);
            Log.i(TAG, "⚡ [INSTANTÁNEO] Aplicación desbloqueada: " + pkg);
        }
    }

    private void scheduleReconnect() {
        if (!shouldReconnect) return;

        reconnectAttempts++;
        long delaySeconds = Math.min(30, (long) Math.pow(2, Math.min(reconnectAttempts, 5)));
        Log.i(TAG, "Reconectando WebSocket en " + delaySeconds + " segundos (Intento " + reconnectAttempts + ")...");

        mainHandler.postDelayed(() -> {
            if (shouldReconnect && !isConnected) {
                connect();
            }
        }, delaySeconds * 1000);
    }

    public synchronized void disconnect() {
        shouldReconnect = false;
        if (webSocket != null) {
            webSocket.close(1000, "Desconectado por el usuario o servicio");
            webSocket = null;
        }
        isConnected = false;
    }

    public boolean isConnected() {
        return isConnected;
    }
}
