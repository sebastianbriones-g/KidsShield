package com.kidsguard.parentalcontrol.network;

import android.content.Context;
import android.util.Log;
import android.widget.Toast;

import com.kidsguard.parentalcontrol.models.ParentalConfig;
import com.kidsguard.parentalcontrol.services.AppBlockerAccessibilityService;
import com.kidsguard.parentalcontrol.services.UsageMonitorService;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;

public class SyncClient {

    private static final String TAG = "KidsShield_Sync";

    public static void handleUnlinkAndRelease(final Context context) {
        Log.i(TAG, "🔓 [LIBERACIÓN] Dispositivo desvinculado por los padres. Liberando teléfono y cancelando bloqueos...");
        try {
            ParentalConfig config = ParentalConfig.getInstance(context);
            config.releaseAndUnlink();
            com.kidsguard.parentalcontrol.ui.LockOverlayActivity.dismissIfOpen();

            new android.os.Handler(android.os.Looper.getMainLooper()).post(new Runnable() {
                @Override
                public void run() {
                    Toast.makeText(context, "✅ Dispositivo desvinculado por los padres. El teléfono ha quedado completamente libre.", Toast.LENGTH_LONG).show();
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "Error liberando dispositivo al desvincular", e);
        }
    }

    public interface SyncCallback {
        void onSuccess();
        void onError(String error);
    }

    public static void sendReport(
            final Context context,
            final int batteryLevel,
            final int screenTimeTodayMinutes,
            final String activePackageName,
            final JSONArray appCatalogArray,
            final SyncCallback callback
    ) {
        sendReport(context, batteryLevel, screenTimeTodayMinutes, activePackageName, appCatalogArray, null, callback);
    }

    public static void sendReport(
            final Context context,
            final int batteryLevel,
            final int screenTimeTodayMinutes,
            final String activePackageName,
            final JSONArray appCatalogArray,
            final JSONObject locationObj,
            final SyncCallback callback
    ) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    ParentalConfig config = ParentalConfig.getInstance(context);
                    String endpoint = config.getServerUrl() + "/api/devices/" + config.getDeviceId() + "/report";
                    URL url = new URL(endpoint);

                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setRequestProperty("Content-Type", "application/json; utf-8");
                    conn.setRequestProperty("Accept", "application/json");
                    conn.setConnectTimeout(5000);
                    conn.setReadTimeout(5000);
                    conn.setDoOutput(true);

                    JSONObject body = new JSONObject();
                    body.put("battery", batteryLevel);
                    body.put("screenTimeTodayMinutes", screenTimeTodayMinutes);
                    body.put("currentActiveApp", activePackageName != null ? activePackageName : "");
                    if (appCatalogArray != null) {
                        body.put("appCatalog", appCatalogArray);
                    }
                    if (locationObj != null) {
                        body.put("location", locationObj);
                    }

                    try (OutputStream os = conn.getOutputStream()) {
                        byte[] input = body.toString().getBytes(StandardCharsets.UTF_8);
                        os.write(input, 0, input.length);
                    }

                    int responseCode = conn.getResponseCode();
                    if (responseCode == 200) {
                        BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
                        StringBuilder response = new StringBuilder();
                        String responseLine;
                        while ((responseLine = br.readLine()) != null) {
                            response.append(responseLine.trim());
                        }

                        JSONObject resJson = new JSONObject(response.toString());

                        // Si el servidor indica que el dispositivo fue desvinculado, liberar de inmediato
                        if (resJson.optBoolean("unlinked", false)) {
                            handleUnlinkAndRelease(context);
                            if (callback != null) callback.onSuccess();
                            conn.disconnect();
                            return;
                        }

                        // Update local policies based on parent server instructions
                        if (resJson.has("isLocked")) {
                            boolean locked = resJson.getBoolean("isLocked");
                            config.setDeviceLocked(locked);
                            if (!locked) {
                                com.kidsguard.parentalcontrol.ui.LockOverlayActivity.dismissIfOpen();
                            }
                        }
                        if (resJson.has("lockReason")) {
                            config.setLockReason(resJson.getString("lockReason"));
                        }
                        if (resJson.has("dailyLimitMinutes")) {
                            config.setDailyLimitMinutes(resJson.getInt("dailyLimitMinutes"));
                        }
                        if (resJson.has("bedtimeEnabled")) {
                            config.setBedtimeEnabled(resJson.getBoolean("bedtimeEnabled"));
                        }
                        if (resJson.has("bedtimeStart")) {
                            config.setBedtimeStart(resJson.getString("bedtimeStart"));
                        }
                        if (resJson.has("bedtimeEnd")) {
                            config.setBedtimeEnd(resJson.getString("bedtimeEnd"));
                        }
                        if (resJson.has("parentPin")) {
                            config.setParentPin(resJson.getString("parentPin"));
                        }
                        if (resJson.has("blockedApps")) {
                            JSONArray blockedArr = resJson.getJSONArray("blockedApps");
                            Set<String> blockedSet = new HashSet<>();
                            for (int i = 0; i < blockedArr.length(); i++) {
                                blockedSet.add(blockedArr.getString(i));
                            }
                            config.setBlockedApps(blockedSet);
                        }
                        if (resJson.has("appLimits")) {
                            config.setAppLimitsJson(resJson.getJSONObject("appLimits").toString());
                        }
                        if (resJson.has("pendingCommands")) {
                            JSONArray cmds = resJson.getJSONArray("pendingCommands");
                            for (int i = 0; i < cmds.length(); i++) {
                                String cmd = cmds.getString(i);
                                if ("UNLINK_DEVICE".equalsIgnoreCase(cmd) || "UNLOCK_DEVICE".equalsIgnoreCase(cmd)) {
                                    Log.i(TAG, "Comando recibido: " + cmd + " -> Liberando y desbloqueando teléfono");
                                    handleUnlinkAndRelease(context);
                                } else if ("TAKE_SCREENSHOT".equalsIgnoreCase(cmd)) {
                                    Log.i(TAG, "Comando recibido: TAKE_SCREENSHOT");
                                    AppBlockerAccessibilityService a11y = AppBlockerAccessibilityService.getInstance();
                                    if (a11y != null) {
                                        a11y.captureScreenshot();
                                    } else {
                                        Log.w(TAG, "No se puede capturar pantalla: servicio de accesibilidad inactivo");
                                    }
                                } else if ("REQUEST_LOCATION".equalsIgnoreCase(cmd)) {
                                    Log.i(TAG, "Comando recibido: REQUEST_LOCATION -> Actualizando GPS de inmediato");
                                    UsageMonitorService.triggerImmediateSync();
                                } else if ("TAKE_VIDEO_5S".equalsIgnoreCase(cmd)) {
                                    Log.i(TAG, "Comando recibido: TAKE_VIDEO_5S -> Iniciando captura de clip de 5 segundos");
                                    AppBlockerAccessibilityService a11y = AppBlockerAccessibilityService.getInstance();
                                    if (a11y != null) {
                                        a11y.captureVideoClip5s();
                                    } else {
                                        Log.w(TAG, "No se puede capturar video clip: servicio de accesibilidad inactivo");
                                    }
                                } else if ("RECORD_AUDIO_5S".equalsIgnoreCase(cmd)) {
                                    Log.i(TAG, "Comando recibido: RECORD_AUDIO_5S -> Iniciando escucha ambiental de 5 segundos");
                                    com.kidsguard.parentalcontrol.utils.AudioCaptureHelper.captureAndUploadAudio(context, 5);
                                }
                            }
                        }

                        if (callback != null) callback.onSuccess();
                    } else {
                        if (responseCode == 404) {
                            Log.i(TAG, "Dispositivo no encontrado (404) -> Liberando teléfono");
                            handleUnlinkAndRelease(context);
                        }
                        if (callback != null) callback.onError("HTTP " + responseCode);
                    }
                    conn.disconnect();
                } catch (Exception e) {
                    Log.w(TAG, "Error sincronizando con servidor: " + e.getMessage());
                    if (callback != null) callback.onError(e.getMessage());
                }
            }
        }).start();
    }

    public static void sendEvent(
            final Context context,
            final String eventType,
            final String packageName,
            final String appName,
            final String details
    ) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    ParentalConfig config = ParentalConfig.getInstance(context);
                    String endpoint = config.getServerUrl() + "/api/devices/" + config.getDeviceId() + "/event";
                    URL url = new URL(endpoint);

                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setRequestProperty("Content-Type", "application/json; utf-8");
                    conn.setRequestProperty("Accept", "application/json");
                    conn.setConnectTimeout(4000);
                    conn.setReadTimeout(4000);
                    conn.setDoOutput(true);

                    JSONObject body = new JSONObject();
                    body.put("type", eventType);
                    body.put("eventType", eventType);
                    body.put("package", packageName != null ? packageName : "");
                    body.put("packageName", packageName != null ? packageName : "");
                    body.put("appName", appName != null ? appName : "");
                    body.put("message", details != null ? details : "");
                    body.put("details", details != null ? details : "");

                    try (OutputStream os = conn.getOutputStream()) {
                        byte[] input = body.toString().getBytes(StandardCharsets.UTF_8);
                        os.write(input, 0, input.length);
                    }

                    int responseCode = conn.getResponseCode();
                    conn.disconnect();
                } catch (Exception e) {
                    Log.w(TAG, "Error enviando evento: " + e.getMessage());
                }
            }
        }).start();
    }

    public static void uploadScreenshot(final Context context, final String base64Image) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    ParentalConfig config = ParentalConfig.getInstance(context);
                    String endpoint = config.getServerUrl() + "/api/devices/" + config.getDeviceId() + "/screenshot";
                    URL url = new URL(endpoint);

                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setRequestProperty("Content-Type", "application/json; utf-8");
                    conn.setRequestProperty("Accept", "application/json");
                    conn.setConnectTimeout(10000);
                    conn.setReadTimeout(10000);
                    conn.setDoOutput(true);

                    JSONObject body = new JSONObject();
                    body.put("screenshot", base64Image);
                    body.put("imageBase64", base64Image);

                    try (OutputStream os = conn.getOutputStream()) {
                        byte[] input = body.toString().getBytes(StandardCharsets.UTF_8);
                        os.write(input, 0, input.length);
                    }

                    int responseCode = conn.getResponseCode();
                    if (responseCode == 200) {
                        Log.i(TAG, "Captura de pantalla subida exitosamente al servidor");
                    } else {
                        Log.w(TAG, "Fallo al subir captura de pantalla. Código HTTP: " + responseCode);
                    }
                    conn.disconnect();
                } catch (Exception e) {
                    Log.w(TAG, "Error subiendo captura de pantalla: " + e.getMessage());
                }
            }
        }).start();
    }

    public static void uploadVideoClip(final Context context, final java.util.List<String> frames, final int intervalMs) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    ParentalConfig config = ParentalConfig.getInstance(context);
                    String endpoint = config.getServerUrl() + "/api/devices/" + config.getDeviceId() + "/video-clip";
                    URL url = new URL(endpoint);

                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setRequestProperty("Content-Type", "application/json; utf-8");
                    conn.setRequestProperty("Accept", "application/json");
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(15000);
                    conn.setDoOutput(true);

                    JSONObject body = new JSONObject();
                    JSONArray framesArray = new JSONArray();
                    for (String f : frames) {
                        framesArray.put(f);
                    }
                    body.put("frames", framesArray);
                    body.put("intervalMs", intervalMs);

                    try (OutputStream os = conn.getOutputStream()) {
                        byte[] input = body.toString().getBytes(StandardCharsets.UTF_8);
                        os.write(input, 0, input.length);
                    }

                    int responseCode = conn.getResponseCode();
                    if (responseCode == 200) {
                        Log.i(TAG, "Clip de video de 5 segundos (" + frames.size() + " fotogramas) subido exitosamente");
                    } else {
                        Log.w(TAG, "Error al subir video clip. Código HTTP: " + responseCode);
                    }
                    conn.disconnect();
                } catch (Exception e) {
                    Log.w(TAG, "Excepción subiendo video clip: " + e.getMessage());
                }
            }
        }).start();
    }

    public static void uploadAudioClip(final Context context, final String base64Audio, final int durationSeconds) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    ParentalConfig config = ParentalConfig.getInstance(context);
                    String endpoint = config.getServerUrl() + "/api/devices/" + config.getDeviceId() + "/audio-clip";
                    URL url = new URL(endpoint);

                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setRequestProperty("Content-Type", "application/json; utf-8");
                    conn.setRequestProperty("Accept", "application/json");
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(15000);
                    conn.setDoOutput(true);

                    JSONObject body = new JSONObject();
                    body.put("audio", base64Audio);
                    body.put("audioBase64", base64Audio);
                    body.put("duration", durationSeconds);
                    body.put("timestamp", System.currentTimeMillis());

                    try (OutputStream os = conn.getOutputStream()) {
                        byte[] input = body.toString().getBytes(StandardCharsets.UTF_8);
                        os.write(input, 0, input.length);
                    }

                    int responseCode = conn.getResponseCode();
                    if (responseCode == 200) {
                        Log.i(TAG, "🎙️ Clip de audio ambiental de " + durationSeconds + "s subido exitosamente al servidor");
                    } else {
                        Log.w(TAG, "Error al subir audio clip. Código HTTP: " + responseCode);
                    }
                    conn.disconnect();
                } catch (Exception e) {
                    Log.w(TAG, "Excepción subiendo audio clip: " + e.getMessage());
                }
            }
        }).start();
    }
}
