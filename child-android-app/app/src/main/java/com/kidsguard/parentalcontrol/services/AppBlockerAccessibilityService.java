package com.kidsguard.parentalcontrol.services;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.ColorSpace;
import android.hardware.HardwareBuffer;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;
import android.view.Display;
import android.view.accessibility.AccessibilityEvent;

import com.kidsguard.parentalcontrol.models.ParentalConfig;
import com.kidsguard.parentalcontrol.network.SyncClient;
import com.kidsguard.parentalcontrol.ui.LockOverlayActivity;

import java.io.ByteArrayOutputStream;
import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class AppBlockerAccessibilityService extends AccessibilityService {

    private static final String TAG = "KidsShield_A11y";
    private static WeakReference<AppBlockerAccessibilityService> instanceRef;

    private String lastBlockedPackage = "";
    private long lastBlockTimestamp = 0;
    private String currentActivePackage = "";
    private long lastScreenshotTime = 0;
    private boolean isRecordingVideoClip = false;

    // Packages to never block (system launcher, dialer for emergency, our own app)
    private static final Set<String> SYSTEM_WHITELIST = new HashSet<>(Arrays.asList(
            "com.kidsguard.parentalcontrol",
            "com.android.systemui",
            "com.google.android.dialer",
            "com.android.dialer",
            "com.samsung.android.dialer",
            "com.sec.android.app.launcher",
            "com.google.android.apps.nexuslauncher",
            "com.mi.android.globallauncher",
            "com.miui.home"
    ));

    public static AppBlockerAccessibilityService getInstance() {
        return instanceRef != null ? instanceRef.get() : null;
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instanceRef = new WeakReference<>(this);
        Log.i(TAG, "Servicio de accesibilidad KidsShield conectado");
    }

    @Override
    public void onDestroy() {
        instanceRef = null;
        super.onDestroy();
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getPackageName() == null) return;

        int eventType = event.getEventType();
        if (eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            String packageName = event.getPackageName().toString();

            ParentalConfig config = ParentalConfig.getInstance(this);

            if ("com.android.settings".equals(packageName) || "com.miui.securitycenter".equals(packageName)) {
                // Si la protección no está activada o el padre está en ventana de bypass/configuración, permitir libre acceso
                if (!config.isProtectionEnforced()) {
                    return;
                }

                // Verificar si el usuario está en una acción de desinstalación o borrado forzado
                CharSequence text = event.getText() != null ? event.getText().toString() : "";
                CharSequence desc = event.getContentDescription() != null ? event.getContentDescription().toString() : "";
                String combined = (text + " " + desc).toLowerCase();

                boolean isUninstallOrWipe = combined.contains("desinstalar") || combined.contains("uninstall")
                        || combined.contains("forzar detenci") || combined.contains("force stop")
                        || combined.contains("borrar datos") || combined.contains("eliminar datos")
                        || combined.contains("clear data") || combined.contains("desactivar administrador")
                        || combined.contains("desactivar esta app") || combined.contains("deactivate");

                boolean mentionsOurApp = combined.contains("kidsshield") || combined.contains("kidsguard")
                        || combined.contains(getPackageName().toLowerCase());

                // No bloquear pantallas de concesión de permisos o de servicios de accesibilidad
                boolean isPermissionFlow = combined.contains("accesibilidad") || combined.contains("accessibility")
                        || combined.contains("permitir") || combined.contains("apps descargadas")
                        || combined.contains("servicios descargados") || combined.contains("installed services");

                if (isUninstallOrWipe && mentionsOurApp && !isPermissionFlow) {
                    Log.i(TAG, "Intento de desinstalación o revocación en Ajustes detectado. Bloqueando...");
                    performGlobalAction(GLOBAL_ACTION_HOME);
                    Intent lockIntent = new Intent(this, LockOverlayActivity.class);
                    lockIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    lockIntent.putExtra("BLOCK_REASON", "Para desinstalar o modificar KidsShield, ingresa el PIN de padres en la app.");
                    lockIntent.putExtra("BLOCKED_PACKAGE", packageName);
                    startActivity(lockIntent);
                    return;
                }
                return;
            }

            if (SYSTEM_WHITELIST.contains(packageName)) {
                return;
            }

            PackageManager pm = getPackageManager();
            String appName = packageName;
            try {
                ApplicationInfo ai = pm.getApplicationInfo(packageName, 0);
                appName = pm.getApplicationLabel(ai).toString();
            } catch (Exception ignored) {
            }

            // Real-time Event: User switched to a new application
            if (!packageName.equals(currentActivePackage)) {
                currentActivePackage = packageName;
                Log.i(TAG, "App activa detectada: " + appName + " (" + packageName + ")");
                SyncClient.sendEvent(this, "app_open", packageName, appName, "Abrió " + appName);
            }

            boolean shouldBlock = false;
            String blockReason = "";
            String eventTypeToReport = "";

            if (config.isDeviceLocked()) {
                shouldBlock = true;
                blockReason = config.getLockReason();
                eventTypeToReport = "app_blocked_attempt";
            } else if (config.isCurrentTimeInBedtime()) {
                shouldBlock = true;
                blockReason = "Modo descanso activo (" + config.getBedtimeStart() + " a " + config.getBedtimeEnd() + ").";
                eventTypeToReport = "app_blocked_attempt";
            } else if (config.isAppBlocked(packageName)) {
                shouldBlock = true;
                blockReason = "Esta aplicación ha sido bloqueada por tus padres.";
                eventTypeToReport = "app_blocked_attempt";
            } else {
                // Check individual app time limit
                int limitMins = config.getAppLimitMinutes(packageName);
                if (limitMins > 0) {
                    int usedMins = UsageMonitorService.getTodayUsageMinutes(this, packageName);
                    if (usedMins >= limitMins) {
                        shouldBlock = true;
                        blockReason = "Has alcanzado el límite diario de " + limitMins + " min para " + appName + ".";
                        eventTypeToReport = "app_limit_exceeded";
                    }
                }
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

                // Report block event to server
                if (!eventTypeToReport.isEmpty()) {
                    SyncClient.sendEvent(this, eventTypeToReport, packageName, appName, blockReason);
                }

                // Send user to home screen immediately
                performGlobalAction(GLOBAL_ACTION_HOME);

                // Launch Fullscreen Lock Activity
                Intent lockIntent = new Intent(this, LockOverlayActivity.class);
                lockIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                lockIntent.putExtra("BLOCK_REASON", blockReason);
                lockIntent.putExtra("BLOCKED_PACKAGE", packageName);
                startActivity(lockIntent);
            }
        }
    }

    /**
     * Native screen capture via Accessibility Service (available in Android 11 / API 30+)
     */
    public void captureScreenshot() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            Log.w(TAG, "Captura de pantalla requiere Android 11 o superior.");
            return;
        }

        long now = System.currentTimeMillis();
        if (now - lastScreenshotTime < 1000) {
            return;
        }
        lastScreenshotTime = now;

        try {
            takeScreenshot(Display.DEFAULT_DISPLAY, getMainExecutor(), new TakeScreenshotCallback() {
                @Override
                public void onSuccess(ScreenshotResult screenshotResult) {
                    HardwareBuffer buffer = screenshotResult.getHardwareBuffer();
                    ColorSpace colorSpace = screenshotResult.getColorSpace();
                    try {
                        Bitmap bitmap = Bitmap.wrapHardwareBuffer(buffer, colorSpace);
                        if (bitmap != null) {
                            Bitmap copy = bitmap.copy(Bitmap.Config.ARGB_8888, false);
                            if (copy != null) {
                                int width = copy.getWidth();
                                int height = copy.getHeight();
                                float scale = Math.min(1.0f, 480.0f / (float) width);
                                int targetW = Math.max(1, Math.round(width * scale));
                                int targetH = Math.max(1, Math.round(height * scale));

                                Bitmap scaled = Bitmap.createScaledBitmap(copy, targetW, targetH, true);
                                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                                scaled.compress(Bitmap.CompressFormat.JPEG, 70, baos);
                                byte[] imageBytes = baos.toByteArray();

                                String base64Image = "data:image/jpeg;base64," + Base64.encodeToString(imageBytes, Base64.NO_WRAP);
                                Log.i(TAG, "Captura de pantalla tomada con éxito (" + imageBytes.length + " bytes). Enviando al servidor...");
                                SyncClient.uploadScreenshot(AppBlockerAccessibilityService.this, base64Image);
                            } else {
                                Log.w(TAG, "No se pudo crear copia software del bitmap");
                            }
                        } else {
                            Log.w(TAG, "wrapHardwareBuffer retornó null");
                        }
                    } catch (Exception e) {
                        Log.e(TAG, "Error procesando captura de pantalla: " + e.getMessage(), e);
                    } finally {
                        if (buffer != null) {
                            try {
                                buffer.close();
                            } catch (Exception ignored) {}
                        }
                    }
                }

                @Override
                public void onFailure(int errorCode) {
                    Log.w(TAG, "Error en takeScreenshot de accesibilidad. Código: " + errorCode);
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "Excepción solicitando captura de pantalla: " + e.getMessage());
        }
    }

    /**
     * Native 5-second video clip capture (sequential frames burst via Accessibility API)
     */
    public void captureVideoClip5s() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            Log.w(TAG, "Grabación de video requiere Android 11+");
            return;
        }
        if (isRecordingVideoClip) {
            Log.w(TAG, "Ya hay una grabación de clip en curso");
            return;
        }
        isRecordingVideoClip = true;

        final List<String> capturedFrames = new ArrayList<>();
        final Handler handler = new Handler(Looper.getMainLooper());
        final int totalFrames = 10;
        final int intervalMs = 500;

        Log.i(TAG, "Iniciando captura de video por 5 segundos (10 fotogramas cada 500ms)...");

        for (int i = 0; i < totalFrames; i++) {
            final int frameIndex = i;
            handler.postDelayed(new Runnable() {
                @Override
                public void run() {
                    try {
                        takeScreenshot(Display.DEFAULT_DISPLAY, getMainExecutor(), new TakeScreenshotCallback() {
                            @Override
                            public void onSuccess(ScreenshotResult screenshotResult) {
                                HardwareBuffer buffer = screenshotResult.getHardwareBuffer();
                                ColorSpace colorSpace = screenshotResult.getColorSpace();
                                try {
                                    Bitmap bitmap = Bitmap.wrapHardwareBuffer(buffer, colorSpace);
                                    if (bitmap != null) {
                                        Bitmap copy = bitmap.copy(Bitmap.Config.ARGB_8888, false);
                                        if (copy != null) {
                                            int width = copy.getWidth();
                                            int height = copy.getHeight();
                                            float scale = Math.min(1.0f, 380.0f / (float) width);
                                            int targetW = Math.max(1, Math.round(width * scale));
                                            int targetH = Math.max(1, Math.round(height * scale));

                                            Bitmap scaled = Bitmap.createScaledBitmap(copy, targetW, targetH, true);
                                            ByteArrayOutputStream baos = new ByteArrayOutputStream();
                                            scaled.compress(Bitmap.CompressFormat.JPEG, 55, baos);
                                            byte[] bytes = baos.toByteArray();
                                            String base64 = "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP);
                                            synchronized (capturedFrames) {
                                                capturedFrames.add(base64);
                                            }
                                        }
                                    }
                                } catch (Exception e) {
                                    Log.e(TAG, "Error frame video " + frameIndex + ": " + e.getMessage());
                                } finally {
                                    if (buffer != null) {
                                        try { buffer.close(); } catch (Exception ignored) {}
                                    }
                                    if (frameIndex == totalFrames - 1) {
                                        finishVideoRecording(capturedFrames, intervalMs);
                                    }
                                }
                            }

                            @Override
                            public void onFailure(int errorCode) {
                                Log.w(TAG, "Fallo fotograma " + frameIndex + ", code: " + errorCode);
                                if (frameIndex == totalFrames - 1) {
                                    finishVideoRecording(capturedFrames, intervalMs);
                                }
                            }
                        });
                    } catch (Exception e) {
                        Log.e(TAG, "Error ejecutando frame " + frameIndex + ": " + e.getMessage());
                        if (frameIndex == totalFrames - 1) {
                            finishVideoRecording(capturedFrames, intervalMs);
                        }
                    }
                }
            }, (long) i * intervalMs);
        }
    }

    private void finishVideoRecording(List<String> capturedFrames, int intervalMs) {
        isRecordingVideoClip = false;
        synchronized (capturedFrames) {
            if (!capturedFrames.isEmpty()) {
                Log.i(TAG, "Subiendo ráfaga de video de 5s con " + capturedFrames.size() + " fotogramas");
                SyncClient.uploadVideoClip(this, new ArrayList<>(capturedFrames), intervalMs);
            } else {
                Log.w(TAG, "No se capturó ningún fotograma para el video clip");
            }
        }
    }

    @Override
    public void onInterrupt() {
        Log.w(TAG, "Servicio de accesibilidad interrumpido");
    }
}
