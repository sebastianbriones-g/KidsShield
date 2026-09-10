package com.kidsguard.parentalcontrol;

import android.app.AppOpsManager;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.Manifest;
import android.content.pm.PackageManager;
import android.provider.Settings;
import android.text.InputType;
import android.text.TextUtils;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
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

import android.location.LocationManager;
import android.os.PowerManager;
import android.widget.TextView;

import org.json.JSONObject;

public class MainActivity extends AppCompatActivity {

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

                    Toast.makeText(this, "✅ ¡Vinculado con éxito con el panel de padres!", Toast.LENGTH_LONG).show();
                } catch (Exception e) {
                    // Texto plano o formato alternativo
                    if (contents.startsWith("http")) {
                        inputServerUrl.setText(contents);
                        ParentalConfig.getInstance(this).setServerUrl(contents);
                        Toast.makeText(this, "URL de servidor configurada", Toast.LENGTH_SHORT).show();
                    } else {
                        inputDeviceId.setText(contents);
                        ParentalConfig.getInstance(this).setDeviceId(contents);
                        Toast.makeText(this, "ID de dispositivo configurado", Toast.LENGTH_SHORT).show();
                    }
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
        checkPermissionsState();
        bindListeners();
        requestRuntimePermissionsIfNeeded();
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
        checkPermissionsState();
    }

    private void initViews() {
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

        ParentalConfig config = ParentalConfig.getInstance(this);
        inputServerUrl.setText(config.getServerUrl());
        inputDeviceId.setText(config.getDeviceId());
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

    private void checkPermissionsState() {
        int grantedCount = 0;
        int totalPermissions = 6;

        // 1. Usage Stats
        boolean hasUsage = hasUsageStatsPermission();
        if (hasUsage) {
            grantedCount++;
            btnGrantUsageAccess.setText("✓ Concedido");
            btnGrantUsageAccess.setBackgroundColor(0xFF10B981);
            btnGrantUsageAccess.setEnabled(false);
        } else {
            btnGrantUsageAccess.setText("Conceder Acceso a Uso");
            btnGrantUsageAccess.setBackgroundColor(0xFF6366F1);
            btnGrantUsageAccess.setEnabled(true);
        }

        // 2. Accessibility
        boolean hasA11y = isAccessibilityServiceEnabled();
        if (hasA11y) {
            grantedCount++;
            btnGrantAccessibility.setText("✓ Concedido");
            btnGrantAccessibility.setBackgroundColor(0xFF10B981);
            btnGrantAccessibility.setEnabled(false);
        } else {
            btnGrantAccessibility.setText("Activar Accesibilidad");
            btnGrantAccessibility.setBackgroundColor(0xFF6366F1);
            btnGrantAccessibility.setEnabled(true);
        }

        // 3. Overlay
        boolean hasOverlay = (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this));
        if (hasOverlay) {
            grantedCount++;
            btnGrantOverlay.setText("✓ Concedido");
            btnGrantOverlay.setBackgroundColor(0xFF10B981);
            btnGrantOverlay.setEnabled(false);
        } else {
            btnGrantOverlay.setText("Habilitar Superposición");
            btnGrantOverlay.setBackgroundColor(0xFF6366F1);
            btnGrantOverlay.setEnabled(true);
        }

        // 4. Location GPS
        boolean hasGps = isGpsEnabled();
        if (btnGrantLocation != null) {
            if (hasGps) {
                grantedCount++;
                btnGrantLocation.setText("✓ Concedido (GPS Satelital Activo)");
                btnGrantLocation.setBackgroundColor(0xFF10B981);
                btnGrantLocation.setEnabled(false);
            } else {
                btnGrantLocation.setText("Activar Ubicación GPS Continua");
                btnGrantLocation.setBackgroundColor(0xFF6366F1);
                btnGrantLocation.setEnabled(true);
            }
        }

        // 5. Device Admin
        boolean hasAdmin = devicePolicyManager.isAdminActive(adminComponent);
        if (hasAdmin) {
            grantedCount++;
            btnGrantDeviceAdmin.setText("✓ Concedido");
            btnGrantDeviceAdmin.setBackgroundColor(0xFF10B981);
            btnGrantDeviceAdmin.setEnabled(false);
        } else {
            btnGrantDeviceAdmin.setText("Activar Administrador");
            btnGrantDeviceAdmin.setBackgroundColor(0xFF6366F1);
            btnGrantDeviceAdmin.setEnabled(true);
        }

        // 6. Battery Optimization
        boolean hasBattery = hasBatteryOptExemption();
        if (btnGrantBatteryOpt != null) {
            if (hasBattery) {
                grantedCount++;
                btnGrantBatteryOpt.setText("✓ Concedido (Sin Restricciones)");
                btnGrantBatteryOpt.setBackgroundColor(0xFF10B981);
                btnGrantBatteryOpt.setEnabled(false);
            } else {
                btnGrantBatteryOpt.setText("Permitir Ejecución Permanente");
                btnGrantBatteryOpt.setBackgroundColor(0xFF6366F1);
                btnGrantBatteryOpt.setEnabled(true);
            }
        }

        // Update Summary Card
        if (tvPermissionsSummaryCount != null) {
            if (grantedCount == totalPermissions) {
                tvPermissionsSummaryCount.setText("🎉 ¡Excelente! Los " + totalPermissions + " permisos requeridos están completamente activos.");
                tvPermissionsSummaryCount.setTextColor(0xFF34D399);
            } else {
                tvPermissionsSummaryCount.setText("⚠️ " + grantedCount + " de " + totalPermissions + " permisos activos. Faltan " + (totalPermissions - grantedCount) + " para proteger el equipo.");
                tvPermissionsSummaryCount.setTextColor(0xFFFBBF24);
            }
        }

        if (btnGrantNextMissingPermission != null) {
            if (grantedCount == totalPermissions) {
                btnGrantNextMissingPermission.setText("✓ ¡Todos los Permisos Listos! Iniciar Protección");
                btnGrantNextMissingPermission.setBackgroundColor(0xFF10B981);
            } else {
                String nextName = getNextMissingPermissionTitle();
                btnGrantNextMissingPermission.setText("🚀 Otorgar Siguiente Permiso: " + nextName);
                btnGrantNextMissingPermission.setBackgroundColor(0xFF4F46E5);
            }
        }
    }

    private String getNextMissingPermissionTitle() {
        if (!hasUsageStatsPermission()) return "1. Datos de Uso";
        if (!isAccessibilityServiceEnabled()) return "2. Accesibilidad";
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) return "3. Superposición";
        if (!isGpsEnabled()) return "4. Ubicación GPS";
        if (!devicePolicyManager.isAdminActive(adminComponent)) return "5. Administrador";
        if (!hasBatteryOptExemption()) return "6. Batería";
        return "Todos Listos";
    }

    private void grantNextMissingPermission() {
        ParentalConfig.getInstance(this).grantAdminBypass(10);

        if (!hasUsageStatsPermission()) {
            startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));
            return;
        }
        if (!isAccessibilityServiceEnabled()) {
            startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()));
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
        if (!devicePolicyManager.isAdminActive(adminComponent)) {
            Intent intent = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN);
            intent.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent);
            intent.putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, "Requerido para evitar la desinstalación no autorizada de KidsShield.");
            startActivity(intent);
            return;
        }
        if (!hasBatteryOptExemption()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                        Uri.parse("package:" + getPackageName()));
                startActivity(intent);
            }
            return;
        }

        Toast.makeText(this, "✓ ¡Todos los permisos están activos! Pulsa 'Iniciar Monitoreo'.", Toast.LENGTH_SHORT).show();
    }

    private void bindListeners() {
        // 0. QR Scan Pairing
        // Botón del Asistente Global: Otorgar Siguiente Permiso Faltante
        if (btnGrantNextMissingPermission != null) {
            btnGrantNextMissingPermission.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    grantNextMissingPermission();
                }
            });
        }

        if (btnScanQrPairing != null) {
            btnScanQrPairing.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
                            checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                        requestPermissions(new String[]{Manifest.permission.CAMERA}, 102);
                        return;
                    }
                    ScanOptions options = new ScanOptions();
                    options.setPrompt("Apunta la cámara al código QR en el panel de padres");
                    options.setBeepEnabled(true);
                    options.setOrientationLocked(false);
                    barcodeLauncher.launch(options);
                }
            });
        }

        // 1. Usage Stats intent
        btnGrantUsageAccess.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                ParentalConfig.getInstance(MainActivity.this).grantAdminBypass(10);
                Intent intent = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
                startActivity(intent);
            }
        });

        // 2. Accessibility intent
        btnGrantAccessibility.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                ParentalConfig.getInstance(MainActivity.this).grantAdminBypass(10);
                Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
                startActivity(intent);
            }
        });

        // 3. Overlay intent
        btnGrantOverlay.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                ParentalConfig.getInstance(MainActivity.this).grantAdminBypass(10);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                            Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                }
            }
        });

        // 4. Location GPS intent
        if (btnGrantLocation != null) {
            btnGrantLocation.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
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
                }
            });
        }

        // 5. Device Admin intent
        btnGrantDeviceAdmin.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                ParentalConfig.getInstance(MainActivity.this).grantAdminBypass(10);
                Intent intent = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN);
                intent.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent);
                intent.putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                        "Requerido para evitar la desinstalación no autorizada de KidsShield.");
                startActivity(intent);
            }
        });

        // 6. Battery Optimization intent
        if (btnGrantBatteryOpt != null) {
            btnGrantBatteryOpt.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    ParentalConfig.getInstance(MainActivity.this).grantAdminBypass(10);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                                Uri.parse("package:" + getPackageName()));
                        startActivity(intent);
                    }
                }
            });
        }

        // Start Protection
        btnStartProtection.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                ParentalConfig config = ParentalConfig.getInstance(MainActivity.this);
                config.setServerUrl(inputServerUrl.getText().toString().trim());
                config.setDeviceId(inputDeviceId.getText().toString().trim());
                config.setProtectionActive(true);
                config.setAdminBypassUntil(0L); // Activar protección inmediatamente

                // Start background monitor service
                Intent serviceIntent = new Intent(MainActivity.this, UsageMonitorService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(serviceIntent);
                } else {
                    startService(serviceIntent);
                }

                Toast.makeText(MainActivity.this, "¡Protección KidsShield iniciada correctamente!", Toast.LENGTH_LONG).show();
                finish();
            }
        });

        // Uninstall App with Parent PIN Protection
        if (btnUninstallApp != null) {
            btnUninstallApp.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    AlertDialog.Builder builder = new AlertDialog.Builder(MainActivity.this);
                    builder.setTitle("Desinstalar KidsShield");
                    builder.setMessage("Ingresa el PIN de seguridad de padres para autorizar la desinstalación:");

                    final EditText inputPin = new EditText(MainActivity.this);
                    inputPin.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
                    inputPin.setHint("••••");
                    builder.setView(inputPin);

                    builder.setPositiveButton("Desinstalar", (dialog, which) -> {
                        String enteredPin = inputPin.getText().toString().trim();
                        ParentalConfig cfg = ParentalConfig.getInstance(MainActivity.this);
                        if (enteredPin.equals(cfg.getParentPin())) {
                            SyncClient.sendEvent(MainActivity.this, "APP_UNINSTALLED_BY_PARENT", getPackageName(), "KidsShield",
                                    "🔓 Desinstalación autorizada por el padre mediante PIN correcto.");
                            try {
                                devicePolicyManager.removeActiveAdmin(adminComponent);
                            } catch (Exception ignored) {}
                            stopService(new Intent(MainActivity.this, UsageMonitorService.class));
                            Intent uninstallIntent = new Intent(Intent.ACTION_DELETE);
                            uninstallIntent.setData(Uri.parse("package:" + getPackageName()));
                            startActivity(uninstallIntent);
                            finish();
                        } else {
                            Toast.makeText(MainActivity.this, "⛔ PIN Incorrecto. Desinstalación denegada.", Toast.LENGTH_LONG).show();
                        }
                    });

                    builder.setNegativeButton("Cancelar", null);
                    builder.show();
                }
            });
        }
    }

    private boolean hasUsageStatsPermission() {
        AppOpsManager appOps = (AppOpsManager) getSystemService(Context.APP_OPS_SERVICE);
        if (appOps == null) return false;
        int mode = appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS,
                android.os.Process.myUid(), getPackageName());
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    private boolean isAccessibilityServiceEnabled() {
        String expectedService = getPackageName() + "/" + AppBlockerAccessibilityService.class.getName();
        String enabledServices = Settings.Secure.getString(getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);

        if (enabledServices == null) return false;

        TextUtils.SimpleStringSplitter colonSplitter = new TextUtils.SimpleStringSplitter(':');
        colonSplitter.setString(enabledServices);

        while (colonSplitter.hasNext()) {
            String service = colonSplitter.next();
            if (service.equalsIgnoreCase(expectedService) || service.contains(AppBlockerAccessibilityService.class.getSimpleName())) {
                return true;
            }
        }
        return false;
    }
}
