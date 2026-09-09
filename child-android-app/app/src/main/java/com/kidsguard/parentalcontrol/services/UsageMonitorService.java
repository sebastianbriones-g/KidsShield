package com.kidsguard.parentalcontrol.services;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.kidsguard.parentalcontrol.models.ParentalConfig;
import com.kidsguard.parentalcontrol.network.SyncClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class UsageMonitorService extends Service {

    private static final String TAG = "KidsShield_Monitor";
    private static final String CHANNEL_ID = "kids_shield_channel";
    private static final int NOTIF_ID = 1001;
    private static java.lang.ref.WeakReference<UsageMonitorService> instanceRef;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable monitorRunnable;
    private final int SYNC_INTERVAL_MS = 6000; // Cada 6 segundos para respuesta casi en tiempo real
    private int syncCycleCount = 0;

    public static void triggerImmediateSync() {
        UsageMonitorService service = instanceRef != null ? instanceRef.get() : null;
        if (service != null) {
            service.handler.post(new Runnable() {
                @Override
                public void run() {
                    try {
                        service.collectAndSyncMetrics();
                    } catch (Exception e) {
                        Log.e(TAG, "Error en sincronización inmediata: " + e.getMessage());
                    }
                }
            });
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instanceRef = new java.lang.ref.WeakReference<>(this);
        createNotificationChannel();
        startForeground(NOTIF_ID, buildForegroundNotification());
        startPeriodicSync();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "KidsShield Protection Service",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Monitorea el uso de apps y protege este dispositivo.");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildForegroundNotification() {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("KidsShield Activo")
                .setContentText("El control parental y la ubicación están activos.")
                .setSmallIcon(android.R.drawable.ic_lock_lock)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    private void startPeriodicSync() {
        monitorRunnable = new Runnable() {
            @Override
            public void run() {
                try {
                    collectAndSyncMetrics();
                } catch (Exception e) {
                    Log.e(TAG, "Error en ciclo de monitoreo: " + e.getMessage());
                }
                handler.postDelayed(this, SYNC_INTERVAL_MS);
            }
        };
        handler.post(monitorRunnable);
    }

    private void collectAndSyncMetrics() {
        syncCycleCount++;
        int battery = getBatteryLevel();
        long startTime = getStartOfDayMillis();
        long endTime = System.currentTimeMillis();

        UsageStatsManager usm = (UsageStatsManager) getSystemService(Context.USAGE_STATS_SERVICE);
        int totalScreenTimeMinutes = 0;
        Map<String, Integer> usageMap = new HashMap<>();

        // 1. Obtener tiempo de uso acumulado hoy
        if (usm != null) {
            List<UsageStats> stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, startTime, endTime);
            if (stats != null && !stats.isEmpty()) {
                for (UsageStats u : stats) {
                    long totalTimeInForeground = u.getTotalTimeInForeground();
                    if (totalTimeInForeground > 0) {
                        int minutes = (int) (totalTimeInForeground / (1000 * 60));
                        usageMap.put(u.getPackageName(), minutes);
                        if (minutes > 0) {
                            totalScreenTimeMinutes += minutes;
                        }
                    }
                }
            }
        }

        // 2. Detección exhaustiva de TODAS las apps instaladas (Juegos, Redes, Videos, etc.)
        PackageManager pm = getPackageManager();
        JSONArray appCatalog = new JSONArray();
        List<ApplicationInfo> installedApps = pm.getInstalledApplications(PackageManager.GET_META_DATA);
        Set<String> processedPackages = new HashSet<>();

        for (ApplicationInfo ai : installedApps) {
            String pkg = ai.packageName;
            if (processedPackages.contains(pkg)) continue;

            // Filtrar apps que no tienen interfaz de usuario a menos que sean apps conocidas
            boolean hasLauncher = pm.getLaunchIntentForPackage(pkg) != null;
            boolean isThirdParty = (ai.flags & ApplicationInfo.FLAG_SYSTEM) == 0;
            boolean isKnownEssentialApp = pkg.contains("youtube") || pkg.contains("chrome") 
                    || pkg.contains("whatsapp") || pkg.contains("instagram") || pkg.contains("tiktok")
                    || pkg.contains("netflix") || pkg.contains("spotify") || pkg.contains("roblox")
                    || pkg.contains("clash") || pkg.contains("brawl") || pkg.contains("freefire");

            if (!hasLauncher && !isThirdParty && !isKnownEssentialApp) {
                continue;
            }

            processedPackages.add(pkg);

            try {
                String appName = pm.getApplicationLabel(ai).toString();
                int timeToday = usageMap.containsKey(pkg) ? usageMap.get(pkg) : 0;

                // Clasificación inteligente de Categoría e Ícono
                String category = "Aplicaciones";
                String icon = "📱";

                String lowerPkg = pkg.toLowerCase();
                String lowerName = appName.toLowerCase();

                // Categoría Juegos
                boolean isGame = false;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    isGame = (ai.category == ApplicationInfo.CATEGORY_GAME);
                }
                if (!isGame) {
                    isGame = (ai.flags & ApplicationInfo.FLAG_IS_GAME) != 0
                            || lowerPkg.contains("game") || lowerPkg.contains("juego")
                            || lowerPkg.contains("roblox") || lowerPkg.contains("minecraft")
                            || lowerPkg.contains("supercell") || lowerPkg.contains("brawl")
                            || lowerPkg.contains("clash") || lowerPkg.contains("fortnite")
                            || lowerPkg.contains("pokemon") || lowerPkg.contains("freefire")
                            || lowerPkg.contains("pubg") || lowerPkg.contains("subway")
                            || lowerPkg.contains("candy") || lowerPkg.contains("king.")
                            || lowerPkg.contains("ea.") || lowerPkg.contains("gameloft");
                }

                if (isGame) {
                    category = "Juegos";
                    icon = "🎮";
                } else if (lowerPkg.contains("whatsapp") || lowerPkg.contains("instagram")
                        || lowerPkg.contains("tiktok") || lowerPkg.contains("facebook")
                        || lowerPkg.contains("messenger") || lowerPkg.contains("snapchat")
                        || lowerPkg.contains("telegram") || lowerPkg.contains("discord")
                        || lowerPkg.contains("twitter") || lowerPkg.contains("x.corp")
                        || lowerPkg.contains("reddit")) {
                    category = "Redes Sociales";
                    icon = "💬";
                } else if (lowerPkg.contains("youtube") || lowerPkg.contains("netflix")
                        || lowerPkg.contains("disney") || lowerPkg.contains("primevideo")
                        || lowerPkg.contains("twitch") || lowerPkg.contains("spotify")
                        || lowerPkg.contains("crunchyroll") || lowerPkg.contains("hbo")
                        || lowerPkg.contains("music") || lowerPkg.contains("video")) {
                    category = "Streaming y Videos";
                    icon = "🎬";
                } else if (lowerPkg.contains("chrome") || lowerPkg.contains("firefox")
                        || lowerPkg.contains("opera") || lowerPkg.contains("edge")
                        || lowerPkg.contains("browser")) {
                    category = "Navegación Web";
                    icon = "🌐";
                }

                JSONObject appObj = new JSONObject();
                appObj.put("package", pkg);
                appObj.put("name", appName);
                appObj.put("timeTodayMinutes", timeToday);
                appObj.put("icon", icon);
                appObj.put("category", category);
                appCatalog.put(appObj);
            } catch (Exception ignored) {
            }
        }

        ParentalConfig config = ParentalConfig.getInstance(this);

        // Check daily limit
        if (totalScreenTimeMinutes >= config.getDailyLimitMinutes()) {
            config.setDeviceLocked(true);
            config.setLockReason("Límite diario de tiempo de pantalla alcanzado (" + config.getDailyLimitMinutes() + " min).");
        }

        // Supervisión activa de GPS permanente
        LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        boolean isGpsEnabled = (lm != null && lm.isProviderEnabled(LocationManager.GPS_PROVIDER));
        if (!isGpsEnabled && config.isProtectionEnforced()) {
            Log.w(TAG, "GPS desactivado detectado. Emitiendo alerta...");
            SyncClient.sendEvent(this, "gps_alert", "system.gps", "Servicio GPS", "⚠️ El GPS ha sido apagado en el teléfono del menor.");
        }

        // Get Location
        JSONObject locationObj = getDeviceLocation();

        // Sync with parent server
        SyncClient.sendReport(this, battery, totalScreenTimeMinutes, "", appCatalog, locationObj, null);

        // Captura de pantalla: SOLO si el padre lo tiene configurado expresamente y no está pausado
        if (config.isAutoScreenshotEnabled() && !config.isLivePaused()) {
            AppBlockerAccessibilityService a11y = AppBlockerAccessibilityService.getInstance();
            if (a11y != null) {
                a11y.captureScreenshot();
            }
        }
    }

    public static int getTodayUsageMinutes(Context context, String packageName) {
        if (packageName == null) return 0;
        try {
            UsageStatsManager usm = (UsageStatsManager) context.getSystemService(Context.USAGE_STATS_SERVICE);
            if (usm == null) return 0;

            Calendar cal = Calendar.getInstance();
            cal.set(Calendar.HOUR_OF_DAY, 0);
            cal.set(Calendar.MINUTE, 0);
            cal.set(Calendar.SECOND, 0);
            cal.set(Calendar.MILLISECOND, 0);
            long startTime = cal.getTimeInMillis();
            long endTime = System.currentTimeMillis();

            List<UsageStats> stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, startTime, endTime);
            if (stats != null) {
                for (UsageStats u : stats) {
                    if (packageName.equals(u.getPackageName())) {
                        return (int) (u.getTotalTimeInForeground() / (1000 * 60));
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return 0;
    }

    private JSONObject getDeviceLocation() {
        try {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
                    && ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                return null;
            }

            LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            if (lm == null) return null;

            Location bestLocation = null;
            List<String> providers = lm.getProviders(true);
            for (String provider : providers) {
                try {
                    Location l = lm.getLastKnownLocation(provider);
                    if (l == null) continue;
                    if (bestLocation == null || l.getAccuracy() < bestLocation.getAccuracy()) {
                        bestLocation = l;
                    }
                } catch (SecurityException ignored) {
                }
            }

            if (bestLocation != null) {
                JSONObject locObj = new JSONObject();
                locObj.put("lat", bestLocation.getLatitude());
                locObj.put("latitude", bestLocation.getLatitude());
                locObj.put("lng", bestLocation.getLongitude());
                locObj.put("longitude", bestLocation.getLongitude());
                locObj.put("accuracy", Math.round(bestLocation.getAccuracy()));
                locObj.put("address", "Ubicación satelital del dispositivo");
                return locObj;
            }
        } catch (Exception e) {
            Log.w(TAG, "No se pudo obtener coordenadas GPS: " + e.getMessage());
        }
        return null;
    }

    private int getBatteryLevel() {
        Intent batteryIntent = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (batteryIntent == null) return 100;
        int level = batteryIntent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = batteryIntent.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
        if (level == -1 || scale == -1) return 100;
        return (int) (((float) level / (float) scale) * 100.0f);
    }

    private long getStartOfDayMillis() {
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.HOUR_OF_DAY, 0);
        cal.set(Calendar.MINUTE, 0);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        return cal.getTimeInMillis();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        instanceRef = null;
        handler.removeCallbacks(monitorRunnable);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
