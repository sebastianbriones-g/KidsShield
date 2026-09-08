package com.kidsguard.parentalcontrol.services;

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
import android.os.BatteryManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.kidsguard.parentalcontrol.models.ParentalConfig;
import com.kidsguard.parentalcontrol.network.SyncClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.List;

public class UsageMonitorService extends Service {

    private static final String TAG = "KidsShield_Monitor";
    private static final String CHANNEL_ID = "kids_shield_channel";
    private static final int NOTIF_ID = 1001;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable monitorRunnable;
    private final int SYNC_INTERVAL_MS = 30000; // Cada 30 segundos

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        startForeground(NOTIF_ID, buildForegroundNotification("Protección activa"));

        setupMonitoringLoop();
    }

    private void setupMonitoringLoop() {
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
        int battery = getBatteryLevel();
        long startTime = getStartOfDayMillis();
        long endTime = System.currentTimeMillis();

        UsageStatsManager usm = (UsageStatsManager) getSystemService(Context.USAGE_STATS_SERVICE);
        int totalScreenTimeMinutes = 0;
        JSONArray appCatalog = new JSONArray();
        PackageManager pm = getPackageManager();

        if (usm != null) {
            List<UsageStats> stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, startTime, endTime);
            if (stats != null && !stats.isEmpty()) {
                for (UsageStats u : stats) {
                    long totalTimeInForeground = u.getTotalTimeInForeground();
                    if (totalTimeInForeground > 60000) { // Mayor a 1 minuto
                        int minutes = (int) (totalTimeInForeground / (1000 * 60));
                        totalScreenTimeMinutes += minutes;

                        try {
                            ApplicationInfo ai = pm.getApplicationInfo(u.getPackageName(), 0);
                            String appName = pm.getApplicationLabel(ai).toString();

                            JSONObject appObj = new JSONObject();
                            appObj.put("package", u.getPackageName());
                            appObj.put("name", appName);
                            appObj.put("timeTodayMinutes", minutes);
                            appObj.put("icon", "📱");
                            appObj.put("category", "Aplicaciones");
                            appCatalog.put(appObj);
                        } catch (Exception ignored) {
                        }
                    }
                }
            }
        }

        ParentalConfig config = ParentalConfig.getInstance(this);

        // Check daily limit
        if (totalScreenTimeMinutes >= config.getDailyLimitMinutes()) {
            config.setDeviceLocked(true);
            config.setLockReason("Límite diario de tiempo de pantalla alcanzado (" + config.getDailyLimitMinutes() + " min).");
        }

        // Sync with parent server
        SyncClient.sendReport(this, battery, totalScreenTimeMinutes, "", appCatalog, null);
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

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "KidsShield Servicio de Protección",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Monitorea el bienestar digital del dispositivo");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private Notification buildForegroundNotification(String text) {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("KidsShield Protección Activa")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_lock_lock)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(monitorRunnable);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
