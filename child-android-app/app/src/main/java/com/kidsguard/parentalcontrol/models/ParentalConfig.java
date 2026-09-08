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
        return prefs.getString("device_id", "KID-PHONE-01");
    }

    public void setDeviceId(String id) {
        prefs.edit().putString("device_id", id).apply();
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

    public Set<String> getBlockedApps() {
        return prefs.getStringSet("blocked_apps", new HashSet<String>());
    }

    public void setBlockedApps(Set<String> apps) {
        prefs.edit().putStringSet("blocked_apps", new HashSet<>(apps)).apply();
    }

    public boolean isAppBlocked(String packageName) {
        if (packageName == null) return false;
        Set<String> blocked = getBlockedApps();
        return blocked.contains(packageName);
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
}
