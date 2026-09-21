package com.kidsguard.parentalcontrol.models;

import android.content.Context;
import android.content.SharedPreferences;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

public class ParentalConfig {

    private static final String PREF_NAME = "kids_shield_config";
    private static ParentalConfig instance;
    private final SharedPreferences prefs;

    private ParentalConfig(Context context) {
        this.prefs = context.getApplicationContext().getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
    }

    public static synchronized ParentalConfig getInstance(Context context) {
        if (instance == null) {
            instance = new ParentalConfig(context);
        }
        return instance;
    }

    public String getDeviceId() {
        return prefs.getString("device_id", "");
    }

    public void setDeviceId(String id) {
        prefs.edit().putString("device_id", id != null ? id.trim() : "").apply();
    }

    public boolean isDeviceLinked() {
        String id = getDeviceId();
        return id != null && !id.trim().isEmpty();
    }

    public String getChildName() {
        return prefs.getString("child_name", "Mi Dispositivo");
    }

    public void setChildName(String name) {
        prefs.edit().putString("child_name", name != null ? name.trim() : "").apply();
    }

    public String getServerUrl() {
        return prefs.getString("server_url", "http://10.0.2.2:3000");
    }

    public void setServerUrl(String url) {
        prefs.edit().putString("server_url", url).apply();
    }

    public String getParentPin() {
        return prefs.getString("parent_pin", "1234");
    }

    public void setParentPin(String pin) {
        prefs.edit().putString("parent_pin", pin).apply();
    }

    public boolean isDeviceLocked() {
        return prefs.getBoolean("is_locked", false);
    }

    public void setDeviceLocked(boolean locked) {
        prefs.edit().putBoolean("is_locked", locked).apply();
    }

    public boolean isProtectionActive() {
        return prefs.getBoolean("protection_active", true);
    }

    public void setProtectionActive(boolean active) {
        prefs.edit().putBoolean("protection_active", active).apply();
    }

    public long getAdminBypassUntil() {
        return prefs.getLong("admin_bypass_until", 0L);
    }

    public void setAdminBypassUntil(long timestamp) {
        prefs.edit().putLong("admin_bypass_until", timestamp).apply();
    }

    public void grantAdminBypass(int minutes) {
        setAdminBypassUntil(System.currentTimeMillis() + (long) minutes * 60 * 1000);
    }

    public boolean isProtectionEnforced() {
        if (!isProtectionActive()) return false;
        long bypassUntil = getAdminBypassUntil();
        if (bypassUntil > 0 && System.currentTimeMillis() < bypassUntil) {
            return false;
        }
        return true;
    }

    public String getLockReason() {
        return prefs.getString("lock_reason", "Bloqueado por tus padres");
    }

    public void setLockReason(String reason) {
        prefs.edit().putString("lock_reason", reason).apply();
    }

    public int getDailyLimitMinutes() {
        return prefs.getInt("daily_limit_minutes", 120);
    }

    public void setDailyLimitMinutes(int minutes) {
        prefs.edit().putInt("daily_limit_minutes", minutes).apply();
    }

    public boolean isBedtimeEnabled() {
        return prefs.getBoolean("bedtime_enabled", true);
    }

    public void setBedtimeEnabled(boolean enabled) {
        prefs.edit().putBoolean("bedtime_enabled", enabled).apply();
    }

    public String getBedtimeStart() {
        return prefs.getString("bedtime_start", "21:30");
    }

    public void setBedtimeStart(String start) {
        prefs.edit().putString("bedtime_start", start).apply();
    }

    public String getBedtimeEnd() {
        return prefs.getString("bedtime_end", "07:00");
    }

    public void setBedtimeEnd(String end) {
        prefs.edit().putString("bedtime_end", end).apply();
    }

    public int getGpsIntervalSeconds() {
        return prefs.getInt("gps_interval_seconds", 600);
    }

    public void setGpsIntervalSeconds(int seconds) {
        prefs.edit().putInt("gps_interval_seconds", seconds > 0 ? seconds : 600).apply();
    }

    public boolean isGpsTrackingEnabled() {
        return prefs.getBoolean("gps_tracking_enabled", true);
    }

    public void setGpsTrackingEnabled(boolean enabled) {
        prefs.edit().putBoolean("gps_tracking_enabled", enabled).apply();
    }

    public Set<String> getBlockedApps() {
        Set<String> set = prefs.getStringSet("blocked_apps", null);
        Set<String> result = new HashSet<>();
        if (set != null) {
            for (String s : set) {
                if (s != null && !s.trim().isEmpty()) {
                    result.add(s.trim().toLowerCase(Locale.ROOT));
                }
            }
        }
        String csv = prefs.getString("blocked_apps_csv", "");
        if (!csv.isEmpty()) {
            String[] parts = csv.split(",");
            for (String p : parts) {
                if (p != null && !p.trim().isEmpty()) {
                    result.add(p.trim().toLowerCase(Locale.ROOT));
                }
            }
        }
        return result;
    }

    public void setBlockedApps(Set<String> apps) {
        Set<String> cleanSet = new HashSet<>();
        StringBuilder sb = new StringBuilder();
        if (apps != null) {
            for (String s : apps) {
                if (s != null && !s.trim().isEmpty()) {
                    String clean = s.trim().toLowerCase(Locale.ROOT);
                    cleanSet.add(clean);
                    if (sb.length() > 0) sb.append(",");
                    sb.append(clean);
                }
            }
        }
        prefs.edit()
            .putStringSet("blocked_apps", cleanSet)
            .putString("blocked_apps_csv", sb.toString())
            .apply();
        android.util.Log.i("KidsShield_Config", "Lista de apps bloqueadas actualizada (" + cleanSet.size() + "): " + sb.toString());
    }

    public boolean isAppBlocked(String packageName) {
        if (packageName == null || packageName.trim().isEmpty()) return false;
        String clean = packageName.trim().toLowerCase(Locale.ROOT);
        Set<String> blocked = getBlockedApps();
        boolean isBlocked = blocked.contains(clean);
        if (isBlocked) {
            android.util.Log.i("KidsShield_Config", "App " + packageName + " detectada como BLOQUEADA");
        }
        return isBlocked;
    }

    public String getAppLimitsJson() {
        return prefs.getString("app_limits", "{}");
    }

    public void setAppLimitsJson(String json) {
        prefs.edit().putString("app_limits", json != null ? json : "{}").apply();
    }

    public int getAppLimitMinutes(String packageName) {
        if (packageName == null) return 0;
        try {
            org.json.JSONObject obj = new org.json.JSONObject(getAppLimitsJson());
            return obj.optInt(packageName, 0);
        } catch (Exception e) {
            return 0;
        }
    }

    public boolean isCurrentTimeInBedtime() {
        if (!isBedtimeEnabled()) return false;
        try {
            Calendar now = Calendar.getInstance();
            int currentMins = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);

            String[] startParts = getBedtimeStart().split(":");
            int startMins = Integer.parseInt(startParts[0]) * 60 + Integer.parseInt(startParts[1]);

            String[] endParts = getBedtimeEnd().split(":");
            int endMins = Integer.parseInt(endParts[0]) * 60 + Integer.parseInt(endParts[1]);

            if (startMins < endMins) {
                return currentMins >= startMins && currentMins < endMins;
            } else {
                // Crosses midnight (e.g. 21:30 to 07:00)
                return currentMins >= startMins || currentMins < endMins;
            }
        } catch (Exception e) {
            return false;
        }
    }

    public boolean isLivePaused() {
        return prefs.getBoolean("is_live_paused", false);
    }

    public void setLivePaused(boolean paused) {
        prefs.edit().putBoolean("is_live_paused", paused).apply();
    }

    public boolean isAutoScreenshotEnabled() {
        return prefs.getBoolean("auto_screenshot_enabled", false);
    }

    public void setAutoScreenshotEnabled(boolean enabled) {
        prefs.edit().putBoolean("auto_screenshot_enabled", enabled).apply();
    }

    public boolean isTextMonitoringEnabled() {
        return prefs.getBoolean("text_monitoring_enabled", true);
    }

    public void setTextMonitoringEnabled(boolean enabled) {
        prefs.edit().putBoolean("text_monitoring_enabled", enabled).apply();
    }

    public boolean isScreenshotMonitoringEnabled() {
        return prefs.getBoolean("screenshot_monitoring_enabled", true);
    }

    public void setScreenshotMonitoringEnabled(boolean enabled) {
        prefs.edit().putBoolean("screenshot_monitoring_enabled", enabled).apply();
    }

    public boolean isVideoMonitoringEnabled() {
        return prefs.getBoolean("video_monitoring_enabled", true);
    }

    public void setVideoMonitoringEnabled(boolean enabled) {
        prefs.edit().putBoolean("video_monitoring_enabled", enabled).apply();
    }

    public boolean isAudioMonitoringEnabled() {
        return prefs.getBoolean("audio_monitoring_enabled", true);
    }

    public void setAudioMonitoringEnabled(boolean enabled) {
        prefs.edit().putBoolean("audio_monitoring_enabled", enabled).apply();
    }

    public void releaseAndUnlink() {
        prefs.edit()
            .putString("device_id", "")
            .putBoolean("is_locked", false)
            .putString("lock_reason", "")
            .putBoolean("protection_active", false)
            .putInt("daily_limit_minutes", 1440)
            .putBoolean("bedtime_enabled", false)
            .putStringSet("blocked_apps", new HashSet<String>())
            .putString("blocked_apps_csv", "")
            .putString("app_limits", "{}")
            .putLong("admin_bypass_until", 0L)
            .apply();
    }
}

