package com.kidsguard.parentalcontrol.network;

import android.content.Context;
import android.util.Log;

import com.kidsguard.parentalcontrol.models.ParentalConfig;

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
                    body.put("currentActiveApp", activePackageName);
                    if (appCatalogArray != null) {
                        body.put("appCatalog", appCatalogArray);
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

                        // Update local policies based on parent server instructions
                        if (resJson.has("isLocked")) {
                            config.setDeviceLocked(resJson.getBoolean("isLocked"));
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

                        if (callback != null) callback.onSuccess();
                    } else {
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
}
