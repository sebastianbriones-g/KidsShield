package com.kidsguard.parentalcontrol;

import android.Manifest;
import android.app.AppOpsManager;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.InputType;
import android.text.TextUtils;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;

import com.journeyapps.barcodescanner.ScanContract;
import com.journeyapps.barcodescanner.ScanOptions;
import com.kidsguard.parentalcontrol.models.ParentalConfig;
import com.kidsguard.parentalcontrol.network.SyncClient;
import com.kidsguard.parentalcontrol.receivers.DeviceAdminReceiver;
import com.kidsguard.parentalcontrol.services.AppBlockerAccessibilityService;
import com.kidsguard.parentalcontrol.services.UsageMonitorService;

import org.json.JSONObject;

public class MainActivity extends AppCompatActivity {

    // Views: Layout Containers
    private LinearLayout layoutSetupWizard;
    private LinearLayout layoutKidDashboard;

    // Views: Setup Wizard
    private TextView tvPermissionsSummaryCount;
    private Button btnGrantNextMissingPermission;
    private Button btnGrantUsageAccess;
    private Button btnGrantAccessibility;
    private Button btnGrantOverlay;
    private Button btnGrantLocation;
    private Button btnGrantDeviceAdmin;
    private Button btnGrantBatteryOpt;
    private Button btnScanQrPairing;
    private Button btnStartProtection;
    private Button btnUninstallApp;
    private EditText inputServerUrl;
    private EditText inputDeviceId;

    // Views: Kid Dashboard
    private Button btnParentSettings;
    private TextView tvKidGreeting;
    private TextView tvKidScreenTimeRemaining;
    private ProgressBar pbKidScreenTime;
    private TextView tvKidScreenTime;
    private TextView tvKidBedtimeStatus;
    private Button btnKidSyncNow;

    private DevicePolicyManager devicePolicyManager;
    private ComponentName adminComponent;

    private final ActivityResultLauncher<ScanOptions> barcodeLauncher = registerForActivityResult(
            new ScanContract(),
            result -> {
                if (result.getContents() == null) {
                    Toast.makeText(this, "Escaneo cancelado", Toast.LENGTH_SHORT).show();
                    return;
                }
                String contents = result.getContents().trim();
                try {
                    JSONObject obj = new JSONObject(contents);
                    String sUrl = obj.optString("serverUrl");
                    String dId = obj.optString("deviceId");
                    String pin = obj.optString("pin");
                    String childName = obj.optString("childName", "");

                    ParentalConfig config = ParentalConfig.getInstance(this);

                    if (!TextUtils.isEmpty(sUrl)) {
                        inputServerUrl.setText(sUrl);
                        config.setServerUrl(sUrl);
                    }
                    if (!TextUtils.isEmpty(dId)) {
                        inputDeviceId.setText(dId);
                        config.setDeviceId(dId);
                    }
                    if (!TextUtils.isEmpty(pin)) {
                        config.setParentPin(pin);
                    }
                    if (!TextUtils.isEmpty(childName)) {
                        config.setChildName(childName);
                    }

                    Toast.makeText(this, "✅ ¡Dispositivo vinculado exitosamente!", Toast.LENGTH_LONG).show();

                    // Si ya tiene los permisos, iniciar de una vez
                    if (hasEssentialPermissions()) {
                        startProtectionService();
                    } else {
                        Toast.makeText(this, "🛡️ Por favor otorga los permisos faltantes para completar la protección.", Toast.LENGTH_LONG).show();
                        updateUiState();
                    }
                } catch (Exception e) {
                    // Si el código escaneado es una URL o ID directo
                    if (contents.startsWith("http")) {
                        inputServerUrl.setText(contents);
                        ParentalConfig.getInstance(this).setServerUrl(contents);
                        Toast.makeText(this, "URL de servidor configurada", Toast.LENGTH_SHORT).show();
                    } else {
                        inputDeviceId.setText(contents);
                        ParentalConfig.getInstance(this).setDeviceId(contents);
                        Toast.makeText(this, "ID de dispositivo configurado", Toast.LENGTH_SHORT).show();
                    }
                    updateUiState();
                }
            }
    );

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        devicePolicyManager = (DevicePolicyManager) getSystemService(Context.DEVICE_POLICY_SERVICE);
        adminComponent = new ComponentName(this, DeviceAdminReceiver.class);

        initViews();
        bindListeners();
        requestRuntimePermissionsIfNeeded();
        updateUiState();
    }

    private void requestRuntimePermissionsIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            java.util.List<String> permsNeeded = new java.util.ArrayList<>();
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                permsNeeded.add(Manifest.permission.ACCESS_FINE_LOCATION);
                permsNeeded.add(Manifest.permission.ACCESS_COARSE_LOCATION);
            }
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                permsNeeded.add(Manifest.permission.RECORD_AUDIO);
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    permsNeeded.add(Manifest.permission.POST_NOTIFICATIONS);
                }
            }
            if (!permsNeeded.isEmpty()) {
                requestPermissions(permsNeeded.toArray(new String[0]), 101);
            }
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        ParentalConfig config = ParentalConfig.getInstance(this);
        if (!config.isProtectionActive()) {
            config.grantAdminBypass(15);
        }
        updateUiState();
    }

    private void initViews() {
        layoutSetupWizard = findViewById(R.id.layoutSetupWizard);
        layoutKidDashboard = findViewById(R.id.layoutKidDashboard);

        // Setup Wizard views
        tvPermissionsSummaryCount = findViewById(R.id.tvPermissionsSummaryCount);
        btnGrantNextMissingPermission = findViewById(R.id.btnGrantNextMissingPermission);
        btnGrantUsageAccess = findViewById(R.id.btnGrantUsageAccess);
        btnGrantAccessibility = findViewById(R.id.btnGrantAccessibility);
        btnGrantOverlay = findViewById(R.id.btnGrantOverlay);
        btnGrantLocation = findViewById(R.id.btnGrantLocation);
        btnGrantDeviceAdmin = findViewById(R.id.btnGrantDeviceAdmin);
        btnGrantBatteryOpt = findViewById(R.id.btnGrantBatteryOpt);
        btnScanQrPairing = findViewById(R.id.btnScanQrPairing);
        btnStartProtection = findViewById(R.id.btnStartProtection);
        btnUninstallApp = findViewById(R.id.btnUninstallApp);
        inputServerUrl = findViewById(R.id.inputServerUrl);
        inputDeviceId = findViewById(R.id.inputDeviceId);

        // Kid Dashboard views
        btnParentSettings = findViewById(R.id.btnParentSettings);
        tvKidGreeting = findViewById(R.id.tvKidGreeting);
        tvKidScreenTimeRemaining = findViewById(R.id.tvKidScreenTimeRemaining);
        pbKidScreenTime = findViewById(R.id.pbKidScreenTime);
        tvKidScreenTime = findViewById(R.id.tvKidScreenTime);
        tvKidBedtimeStatus = findViewById(R.id.tvKidBedtimeStatus);
        btnKidSyncNow = findViewById(R.id.btnKidSyncNow);

        ParentalConfig config = ParentalConfig.getInstance(this);
        if (inputServerUrl != null) {
            String sUrl = config.getServerUrl();
            if (!TextUtils.isEmpty(sUrl)) inputServerUrl.setText(sUrl);
        }
        if (inputDeviceId != null) {
            String dId = config.getDeviceId();
            if (!TextUtils.isEmpty(dId)) inputDeviceId.setText(dId);
        }
    }

    private void updateUiState() {
        ParentalConfig config = ParentalConfig.getInstance(this);
        boolean isLinkedAndActive = config.isProtectionActive() && config.isDeviceLinked();

        if (isLinkedAndActive) {
            if (layoutKidDashboard != null) layoutKidDashboard.setVisibility(View.VISIBLE);
            if (layoutSetupWizard != null) layoutSetupWizard.setVisibility(View.GONE);
            updateKidDashboardData();
        } else {
            if (layoutKidDashboard != null) layoutKidDashboard.setVisibility(View.GONE);
            if (layoutSetupWizard != null) layoutSetupWizard.setVisibility(View.VISIBLE);
            checkPermissionsState();
        }
    }

    private void updateKidDashboardData() {
        ParentalConfig config = ParentalConfig.getInstance(this);
        String childName = config.getChildName();
        if (TextUtils.isEmpty(childName)) childName = "Hijo";

        if (tvKidGreeting != null) {
            tvKidGreeting.setText("👋 ¡Hola " + childName + "!");
        }

        int usedMinutes = UsageMonitorService.getTodayUsageMinutes(this, null);
        int dailyLimit = config.getDailyLimitMinutes();
        if (dailyLimit <= 0) dailyLimit = 1440;

        int remaining = Math.max(0, dailyLimit - usedMinutes);
        if (dailyLimit >= 1440) {
            if (tvKidScreenTimeRemaining != null) tvKidScreenTimeRemaining.setText("Sin límite hoy");
            if (tvKidScreenTime != null) tvKidScreenTime.setText(usedMinutes + " min de pantalla hoy");
            if (pbKidScreenTime != null) pbKidScreenTime.setProgress(0);
        } else {
            if (tvKidScreenTimeRemaining != null) tvKidScreenTimeRemaining.setText(remaining + " min restantes");
            if (tvKidScreenTime != null) tvKidScreenTime.setText(usedMinutes + " min usados de " + dailyLimit + " min");
            int pct = Math.min(100, (int) ((usedMinutes / (float) dailyLimit) * 100));
            if (pbKidScreenTime != null) pbKidScreenTime.setProgress(pct);
        }

        if (tvKidBedtimeStatus != null) {
            if (config.isBedtimeEnabled()) {
                tvKidBedtimeStatus.setText("Hora de dormir: de " + config.getBedtimeStart() + " a " + config.getBedtimeEnd());
            } else {
                tvKidBedtimeStatus.setText("Modo descanso no programado");
            }
        }
    }

    private boolean isGpsEnabled() {
        LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        boolean hasPerm = (Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
                checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED);
        boolean isEnabled = (lm != null && lm.isProviderEnabled(LocationManager.GPS_PROVIDER));
        return hasPerm && isEnabled;
    }

    private boolean hasBatteryOptExemption() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            return pm != null && pm.isIgnoringBatteryOptimizations(getPackageName());
        }
        return true;
    }

    private boolean hasUsageStatsPermission() {
        AppOpsManager appOps = (AppOpsManager) getSystemService(Context.APP_OPS_SERVICE);
        if (appOps == null) return false;
        int mode = appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS,
                android.os.Process.myUid(), getPackageName());
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    private boolean isAccessibilityServiceEnabled() {
        if (AppBlockerAccessibilityService.isServiceRunning()) return true;
        try {
            int accessibilityEnabled = Settings.Secure.getInt(
                    getContentResolver(),
                    Settings.Secure.ACCESSIBILITY_ENABLED);
            if (accessibilityEnabled == 1) {
                String settingValue = Settings.Secure.getString(
                        getContentResolver(),
                        Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
                if (settingValue != null && settingValue.contains(getPackageName())) {
                    return true;
                }
            }
        } catch (Exception ignored) {}
        return false;
    }

    private boolean isDeviceAdminActive() {
        return devicePolicyManager != null && devicePolicyManager.isAdminActive(adminComponent);
    }

    private boolean hasEssentialPermissions() {
        return hasUsageStatsPermission() && isAccessibilityServiceEnabled();
    }

    private void checkPermissionsState() {
        int grantedCount = 0;
        int totalPermissions = 6;

        // 1. Usage Stats
        boolean hasUsage = hasUsageStatsPermission();
        if (hasUsage) {
            grantedCount++;
            if (btnGrantUsageAccess != null) {
                btnGrantUsageAccess.setText("✓ Concedido");
                btnGrantUsageAccess.setBackgroundColor(0xFF10B981);
                btnGrantUsageAccess.setEnabled(false);
            }
        } else {
            if (btnGrantUsageAccess != null) {
                btnGrantUsageAccess.setText("Conceder Acceso a Uso");
                btnGrantUsageAccess.setBackgroundColor(0xFF6366F1);
                btnGrantUsageAccess.setEnabled(true);
            }
        }

        // 2. Accessibility
        boolean hasA11y = isAccessibilityServiceEnabled();
        if (hasA11y) {
            grantedCount++;
            if (btnGrantAccessibility != null) {
                btnGrantAccessibility.setText("✓ Concedido");
                btnGrantAccessibility.setBackgroundColor(0xFF10B981);
                btnGrantAccessibility.setEnabled(false);
            }
        } else {
            if (btnGrantAccessibility != null) {
                btnGrantAccessibility.setText("Activar Accesibilidad");
                btnGrantAccessibility.setBackgroundColor(0xFF6366F1);
                btnGrantAccessibility.setEnabled(true);
            }
        }

        // 3. Overlay
        boolean hasOverlay = (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this));
        if (hasOverlay) {
            grantedCount++;
            if (btnGrantOverlay != null) {
                btnGrantOverlay.setText("✓ Concedido");
                btnGrantOverlay.setBackgroundColor(0xFF10B981);
                btnGrantOverlay.setEnabled(false);
            }
        } else {
            if (btnGrantOverlay != null) {
                btnGrantOverlay.setText("Permitir Superposición");
                btnGrantOverlay.setBackgroundColor(0xFF6366F1);
                btnGrantOverlay.setEnabled(true);
            }
        }

        // 4. Location GPS
        boolean hasGps = isGpsEnabled();
        if (hasGps) {
            grantedCount++;
            if (btnGrantLocation != null) {
                btnGrantLocation.setText("✓ Concedido");
                btnGrantLocation.setBackgroundColor(0xFF10B981);
                btnGrantLocation.setEnabled(false);
            }
        } else {
            if (btnGrantLocation != null) {
                btnGrantLocation.setText("Conceder Ubicación");
                btnGrantLocation.setBackgroundColor(0xFF6366F1);
                btnGrantLocation.setEnabled(true);
            }
        }

        // 5. Device Admin
        boolean hasAdmin = isDeviceAdminActive();
        if (hasAdmin) {
            grantedCount++;
            if (btnGrantDeviceAdmin != null) {
                btnGrantDeviceAdmin.setText("✓ Concedido");
                btnGrantDeviceAdmin.setBackgroundColor(0xFF10B981);
                btnGrantDeviceAdmin.setEnabled(false);
            }
        } else {
            if (btnGrantDeviceAdmin != null) {
                btnGrantDeviceAdmin.setText("Activar Administrador");
                btnGrantDeviceAdmin.setBackgroundColor(0xFF6366F1);
                btnGrantDeviceAdmin.setEnabled(true);
            }
        }

        // 6. Battery Opt
        boolean hasBattery = hasBatteryOptExemption();
        if (hasBattery) {
            grantedCount++;
            if (btnGrantBatteryOpt != null) {
                btnGrantBatteryOpt.setText("✓ Concedido");
                btnGrantBatteryOpt.setBackgroundColor(0xFF10B981);
                btnGrantBatteryOpt.setEnabled(false);
            }
        } else {
            if (btnGrantBatteryOpt != null) {
                btnGrantBatteryOpt.setText("Desactivar Optimización");
                btnGrantBatteryOpt.setBackgroundColor(0xFF6366F1);
                btnGrantBatteryOpt.setEnabled(true);
            }
        }

        // Resumen
        if (tvPermissionsSummaryCount != null) {
            if (grantedCount == totalPermissions) {
                tvPermissionsSummaryCount.setText("✅ ¡Todos los permisos están activos! (" + grantedCount + "/" + totalPermissions + ")");
                tvPermissionsSummaryCount.setTextColor(0xFF34D399);
                if (btnGrantNextMissingPermission != null) {
                    btnGrantNextMissingPermission.setText("✓ Todos los permisos concedidos");
                    btnGrantNextMissingPermission.setBackgroundColor(0xFF10B981);
                    btnGrantNextMissingPermission.setEnabled(false);
                }
            } else {
                tvPermissionsSummaryCount.setText("Progreso: " + grantedCount + " de " + totalPermissions + " permisos activos");
                tvPermissionsSummaryCount.setTextColor(0xFFA5B4FC);
                if (btnGrantNextMissingPermission != null) {
                    btnGrantNextMissingPermission.setText("🚀 Otorgar Siguiente Permiso Faltante");
                    btnGrantNextMissingPermission.setBackgroundColor(0xFF4F46E5);
                    btnGrantNextMissingPermission.setEnabled(true);
                }
            }
        }
    }

    private void grantNextMissingPermission() {
        ParentalConfig.getInstance(this).grantAdminBypass(15);
        if (!hasUsageStatsPermission()) {
            startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));
            return;
        }
        if (!isAccessibilityServiceEnabled()) {
            startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getPackageName()));
            startActivity(intent);
            return;
        }
        if (!isGpsEnabled()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
                    checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                }, 101);
            } else {
                startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS));
            }
            return;
        }
        if (!isDeviceAdminActive()) {
            Intent intent = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN);
            intent.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent);
            intent.putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                    "Requerido para evitar la desinstalación no autorizada de KidsShield.");
            startActivity(intent);
            return;
        }
        if (!hasBatteryOptExemption()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                        Uri.parse("package:" + getPackageName()));
                startActivity(intent);
            }
        }
    }

    private void startProtectionService() {
        ParentalConfig config = ParentalConfig.getInstance(this);
        config.setProtectionActive(true);
        config.setAdminBypassUntil(0L);

        Intent serviceIntent = new Intent(this, UsageMonitorService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent);
        } else {
            startService(serviceIntent);
        }

        SyncClient.sendReport(this, 100, 0, getPackageName(), null, null);
        Toast.makeText(this, "¡Protección KidsShield iniciada correctamente!", Toast.LENGTH_LONG).show();
        updateUiState();
    }

    private void showParentPinDialog(final Runnable onPinSuccess) {
        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        builder.setTitle("Ajustes de Padres");
        builder.setMessage("Ingresa el PIN parental de seguridad para continuar:");

        final EditText inputPin = new EditText(this);
        inputPin.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        inputPin.setHint("••••");
        builder.setView(inputPin);

        builder.setPositiveButton("Ingresar", (dialog, which) -> {
            String enteredPin = inputPin.getText().toString().trim();
            ParentalConfig cfg = ParentalConfig.getInstance(this);
            if (enteredPin.equals(cfg.getParentPin())) {
                onPinSuccess.run();
            } else {
                Toast.makeText(this, "⛔ PIN Incorrecto.", Toast.LENGTH_LONG).show();
            }
        });

        builder.setNegativeButton("Cancelar", null);
        builder.show();
    }

    private void showParentSettingsMenu() {
        showParentPinDialog(() -> {
            String[] options = {
                    "🛠️ Ver Permisos y Re-vincular QR",
                    "🔓 Desvincular este Dispositivo",
                    "🗑️ Desinstalar KidsShield"
            };

            new AlertDialog.Builder(this)
                    .setTitle("Administración Parental")
                    .setItems(options, (dialog, which) -> {
                        ParentalConfig cfg = ParentalConfig.getInstance(this);
                        if (which == 0) {
                            // Abrir asistente
                            cfg.grantAdminBypass(15);
                            if (layoutKidDashboard != null) layoutKidDashboard.setVisibility(View.GONE);
                            if (layoutSetupWizard != null) layoutSetupWizard.setVisibility(View.VISIBLE);
                            checkPermissionsState();
                        } else if (which == 1) {
                            // Desvincular
                            cfg.releaseAndUnlink();
                            stopService(new Intent(this, UsageMonitorService.class));
                            Toast.makeText(this, "✅ Dispositivo desvinculado.", Toast.LENGTH_SHORT).show();
                            updateUiState();
                        } else if (which == 2) {
                            // Desinstalar
                            try {
                                devicePolicyManager.removeActiveAdmin(adminComponent);
                            } catch (Exception ignored) {}
                            stopService(new Intent(this, UsageMonitorService.class));
                            Intent uninstallIntent = new Intent(Intent.ACTION_DELETE);
                            uninstallIntent.setData(Uri.parse("package:" + getPackageName()));
                            startActivity(uninstallIntent);
                            finish();
                        }
                    })
                    .setNegativeButton("Cerrar", null)
                    .show();
        });
    }

    private void bindListeners() {
        if (btnGrantNextMissingPermission != null) {
            btnGrantNextMissingPermission.setOnClickListener(v -> grantNextMissingPermission());
        }

        if (btnScanQrPairing != null) {
            btnScanQrPairing.setOnClickListener(v -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
                        checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{Manifest.permission.CAMERA}, 102);
                    return;
                }
                ScanOptions options = new ScanOptions();
                options.setPrompt("Apunta la cámara al código QR en el panel web");
                options.setBeepEnabled(true);
                options.setOrientationLocked(false);
                barcodeLauncher.launch(options);
            });
        }

        if (btnGrantUsageAccess != null) {
            btnGrantUsageAccess.setOnClickListener(v -> {
                ParentalConfig.getInstance(MainActivity.this).grantAdminBypass(10);
                startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));
            });
        }

        if (btnGrantAccessibility != null) {
            btnGrantAccessibility.setOnClickListener(v -> {
                ParentalConfig.getInstance(MainActivity.this).grantAdminBypass(10);
                startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
            });
        }

        if (btnGrantOverlay != null) {
            btnGrantOverlay.setOnClickListener(v -> {
                ParentalConfig.getInstance(MainActivity.this).grantAdminBypass(10);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                            Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                }
            });
        }

        if (btnGrantLocation != null) {
            btnGrantLocation.setOnClickListener(v -> {
                ParentalConfig.getInstance(MainActivity.this).grantAdminBypass(10);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
                        checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION
                    }, 101);
                } else {
                    startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS));
                }
            });
        }

        if (btnGrantDeviceAdmin != null) {
            btnGrantDeviceAdmin.setOnClickListener(v -> {
                ParentalConfig.getInstance(MainActivity.this).grantAdminBypass(10);
                Intent intent = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN);
                intent.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent);
                intent.putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                        "Requerido para evitar la desinstalación no autorizada de KidsShield.");
                startActivity(intent);
            });
        }

        if (btnGrantBatteryOpt != null) {
            btnGrantBatteryOpt.setOnClickListener(v -> {
                ParentalConfig.getInstance(MainActivity.this).grantAdminBypass(10);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                            Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                }
            });
        }

        // Start Protection Button (Setup Wizard)
        if (btnStartProtection != null) {
            btnStartProtection.setOnClickListener(v -> {
                ParentalConfig config = ParentalConfig.getInstance(MainActivity.this);
                String sUrl = inputServerUrl != null ? inputServerUrl.getText().toString().trim() : "";
                String dId = inputDeviceId != null ? inputDeviceId.getText().toString().trim() : "";

                if (TextUtils.isEmpty(dId)) {
                    new AlertDialog.Builder(MainActivity.this)
                            .setTitle("Código de Dispositivo Requerido")
                            .setMessage("Para vincular el teléfono, escanea el código QR que se muestra en el panel de padres en tu PC o ingresa un código de dispositivo válido.")
                            .setPositiveButton("Escanear QR Ahora", (dialog, which) -> {
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
                                        checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                                    requestPermissions(new String[]{Manifest.permission.CAMERA}, 102);
                                    return;
                                }
                                ScanOptions options = new ScanOptions();
                                options.setPrompt("Apunta la cámara al código QR en el panel web");
                                options.setBeepEnabled(true);
                                options.setOrientationLocked(false);
                                barcodeLauncher.launch(options);
                            })
                            .setNegativeButton("Cancelar", null)
                            .show();
                    return;
                }

                if (!TextUtils.isEmpty(sUrl)) {
                    config.setServerUrl(sUrl);
                }
                config.setDeviceId(dId);
                startProtectionService();
            });
        }

        // Uninstall button
        if (btnUninstallApp != null) {
            btnUninstallApp.setOnClickListener(v -> showParentPinDialog(() -> {
                try {
                    devicePolicyManager.removeActiveAdmin(adminComponent);
                } catch (Exception ignored) {}
                stopService(new Intent(this, UsageMonitorService.class));
                Intent uninstallIntent = new Intent(Intent.ACTION_DELETE);
                uninstallIntent.setData(Uri.parse("package:" + getPackageName()));
                startActivity(uninstallIntent);
                finish();
            }));
        }

        // Kid Dashboard: Parent Settings Button
        if (btnParentSettings != null) {
            btnParentSettings.setOnClickListener(v -> showParentSettingsMenu());
        }

        // Kid Dashboard: Sync Now Button
        if (btnKidSyncNow != null) {
            btnKidSyncNow.setOnClickListener(v -> {
                Toast.makeText(MainActivity.this, "🔄 Sincronizando con el servidor...", Toast.LENGTH_SHORT).show();
                SyncClient.sendReport(MainActivity.this, 100, 0, getPackageName(), null, new SyncClient.SyncCallback() {
                    @Override
                    public void onSuccess() {
                        runOnUiThread(() -> {
                            Toast.makeText(MainActivity.this, "✅ Sincronizado correctamente", Toast.LENGTH_SHORT).show();
                            updateKidDashboardData();
                        });
                    }

                    @Override
                    public void onError(String error) {
                        runOnUiThread(() -> Toast.makeText(MainActivity.this, "⚠️ Servidor no alcanzable en este momento", Toast.LENGTH_SHORT).show());
                    }
                });
            });
        }
    }
}
