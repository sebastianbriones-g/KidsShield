package com.kidsguard.parentalcontrol.services;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;

import com.kidsguard.parentalcontrol.models.ParentalConfig;
import com.kidsguard.parentalcontrol.ui.LockOverlayActivity;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

public class AppBlockerAccessibilityService extends AccessibilityService {

    private static final String TAG = "KidsShield_A11y";
    private String lastBlockedPackage = "";
    private long lastBlockTimestamp = 0;

    // Packages to never block (system launcher, dialer for 911/emergency, our own app)
    private static final Set<String> SYSTEM_WHITELIST = new HashSet<>(Arrays.asList(
            "com.kidsguard.parentalcontrol",
            "com.android.systemui",
            "com.android.settings",
            "com.google.android.dialer",
            "com.android.dialer",
            "com.samsung.android.dialer",
            "com.sec.android.app.launcher",
            "com.google.android.apps.nexuslauncher",
            "com.mi.android.globallauncher"
    ));

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getPackageName() == null) return;

        int eventType = event.getEventType();
        if (eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            String packageName = event.getPackageName().toString();

            if (SYSTEM_WHITELIST.contains(packageName)) {
                return;
            }

            ParentalConfig config = ParentalConfig.getInstance(this);

            boolean shouldBlock = false;
            String blockReason = "";

            if (config.isDeviceLocked()) {
                shouldBlock = true;
                blockReason = config.getLockReason();
            } else if (config.isCurrentTimeInBedtime()) {
                shouldBlock = true;
                blockReason = "Modo descanso activo (" + config.getBedtimeStart() + " a " + config.getBedtimeEnd() + ").";
            } else if (config.isAppBlocked(packageName)) {
                shouldBlock = true;
                blockReason = "Esta aplicación ha sido bloqueada por tus padres.";
            }

            if (shouldBlock) {
                long now = System.currentTimeMillis();
                // Prevent duplicate launches within 800ms
                if (packageName.equals(lastBlockedPackage) && (now - lastBlockTimestamp < 800)) {
                    return;
                }
                lastBlockedPackage = packageName;
                lastBlockTimestamp = now;

                Log.i(TAG, "Bloqueando aplicación: " + packageName + " Razón: " + blockReason);

                // Option 1: Send user to home screen immediately
                performGlobalAction(GLOBAL_ACTION_HOME);

                // Option 2: Launch Fullscreen Lock Activity
                Intent lockIntent = new Intent(this, LockOverlayActivity.class);
                lockIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                lockIntent.putExtra("BLOCK_REASON", blockReason);
                lockIntent.putExtra("BLOCKED_PACKAGE", packageName);
                startActivity(lockIntent);
            }
        }
    }

    @Override
    public void onInterrupt() {
        Log.w(TAG, "Servicio de accesibilidad interrumpido");
    }
}
