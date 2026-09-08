package com.kidsguard.parentalcontrol;

import android.app.AppOpsManager;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.text.TextUtils;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import com.kidsguard.parentalcontrol.models.ParentalConfig;
import com.kidsguard.parentalcontrol.receivers.DeviceAdminReceiver;
import com.kidsguard.parentalcontrol.services.AppBlockerAccessibilityService;
import com.kidsguard.parentalcontrol.services.UsageMonitorService;

public class MainActivity extends AppCompatActivity {

    private Button btnGrantUsageAccess;
    private Button btnGrantAccessibility;
    private Button btnGrantOverlay;
    private Button btnGrantDeviceAdmin;
    private Button btnStartProtection;
    private EditText inputServerUrl;
    private EditText inputDeviceId;

    private DevicePolicyManager devicePolicyManager;
    private ComponentName adminComponent;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        devicePolicyManager = (DevicePolicyManager) getSystemService(Context.DEVICE_POLICY_SERVICE);
        adminComponent = new ComponentName(this, DeviceAdminReceiver.class);

        initViews();
        checkPermissionsState();
        bindListeners();
    }

    @Override
    protected void onResume() {
        super.onResume();
        checkPermissionsState();
    }

    private void initViews() {
        btnGrantUsageAccess = findViewById(R.id.btnGrantUsageAccess);
        btnGrantAccessibility = findViewById(R.id.btnGrantAccessibility);
        btnGrantOverlay = findViewById(R.id.btnGrantOverlay);
        btnGrantDeviceAdmin = findViewById(R.id.btnGrantDeviceAdmin);
        btnStartProtection = findViewById(R.id.btnStartProtection);
        inputServerUrl = findViewById(R.id.inputServerUrl);
        inputDeviceId = findViewById(R.id.inputDeviceId);

        ParentalConfig config = ParentalConfig.getInstance(this);
        inputServerUrl.setText(config.getServerUrl());
        inputDeviceId.setText(config.getDeviceId());
    }

    private void checkPermissionsState() {
        // 1. Usage Stats
        if (hasUsageStatsPermission()) {
            btnGrantUsageAccess.setText("✓ Concedido");
            btnGrantUsageAccess.setBackgroundColor(0xFF10B981);
            btnGrantUsageAccess.setEnabled(false);
        }

        // 2. Accessibility
        if (isAccessibilityServiceEnabled()) {
            btnGrantAccessibility.setText("✓ Concedido");
            btnGrantAccessibility.setBackgroundColor(0xFF10B981);
            btnGrantAccessibility.setEnabled(false);
        }

        // 3. Overlay
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this)) {
            btnGrantOverlay.setText("✓ Concedido");
            btnGrantOverlay.setBackgroundColor(0xFF10B981);
            btnGrantOverlay.setEnabled(false);
        }

        // 4. Device Admin
        if (devicePolicyManager.isAdminActive(adminComponent)) {
            btnGrantDeviceAdmin.setText("✓ Concedido");
            btnGrantDeviceAdmin.setBackgroundColor(0xFF10B981);
            btnGrantDeviceAdmin.setEnabled(false);
        }
    }

    private void bindListeners() {
        // 1. Usage Stats intent
        btnGrantUsageAccess.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Intent intent = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
                startActivity(intent);
            }
        });

        // 2. Accessibility intent
        btnGrantAccessibility.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
                startActivity(intent);
            }
        });

        // 3. Overlay intent
        btnGrantOverlay.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                            Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                }
            }
        });

        // 4. Device Admin intent
        btnGrantDeviceAdmin.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Intent intent = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN);
                intent.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent);
                intent.putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                        "Requerido para evitar la desinstalación no autorizada de KidsShield.");
                startActivity(intent);
            }
        });

        // Start Protection
        btnStartProtection.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                ParentalConfig config = ParentalConfig.getInstance(MainActivity.this);
                config.setServerUrl(inputServerUrl.getText().toString().trim());
                config.setDeviceId(inputDeviceId.getText().toString().trim());

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
