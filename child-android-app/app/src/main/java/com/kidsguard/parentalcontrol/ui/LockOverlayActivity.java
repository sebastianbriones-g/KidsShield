package com.kidsguard.parentalcontrol.ui;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

import com.kidsguard.parentalcontrol.R;
import com.kidsguard.parentalcontrol.models.ParentalConfig;

public class LockOverlayActivity extends AppCompatActivity {

    private static java.lang.ref.WeakReference<LockOverlayActivity> currentInstance;

    public static void dismissIfOpen() {
        if (currentInstance != null) {
            LockOverlayActivity act = currentInstance.get();
            if (act != null && !act.isFinishing()) {
                act.finish();
            }
        }
    }

    private EditText inputParentPin;
    private TextView textLockMessage;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        currentInstance = new java.lang.ref.WeakReference<>(this);
        setContentView(R.layout.activity_lock_overlay);

        textLockMessage = findViewById(R.id.textLockMessage);
        inputParentPin = findViewById(R.id.inputParentPin);
        Button btnUnlockWithPin = findViewById(R.id.btnUnlockWithPin);
        Button btnGoHome = findViewById(R.id.btnGoHome);

        String reason = getIntent().getStringExtra("BLOCK_REASON");
        if (reason == null || reason.isEmpty()) {
            reason = getIntent().getStringExtra("reason");
        }
        ParentalConfig config = ParentalConfig.getInstance(this);
        if (reason == null || reason.isEmpty()) {
            reason = config.getLockReason();
        }
        if (reason != null && !reason.isEmpty()) {
            textLockMessage.setText(reason);
        }

        // Si el teléfono está bloqueado totalmente por los padres, ocultar salida al escritorio
        if (config.isDeviceLocked()) {
            btnGoHome.setVisibility(View.GONE);
        } else {
            btnGoHome.setVisibility(View.VISIBLE);
        }

        btnUnlockWithPin.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                verifyAndUnlock();
            }
        });

        btnGoHome.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                ParentalConfig cfg = ParentalConfig.getInstance(LockOverlayActivity.this);
                if (cfg.isDeviceLocked()) {
                    Toast.makeText(LockOverlayActivity.this, "El teléfono se encuentra bloqueado por tus padres.", Toast.LENGTH_SHORT).show();
                    return;
                }
                Intent homeIntent = new Intent(Intent.ACTION_MAIN);
                homeIntent.addCategory(Intent.CATEGORY_HOME);
                homeIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(homeIntent);
                finish();
            }
        });
    }

    private void verifyAndUnlock() {
        String enteredPin = inputParentPin.getText().toString().trim();
        ParentalConfig config = ParentalConfig.getInstance(this);

        if (enteredPin.equals(config.getParentPin())) {
            Toast.makeText(this, "✅ Acceso concedido (10 min de configuración)", Toast.LENGTH_SHORT).show();
            config.setDeviceLocked(false);
            config.grantAdminBypass(10);
            finish();
        } else {
            Toast.makeText(this, "PIN incorrecto. Intenta de nuevo.", Toast.LENGTH_SHORT).show();
            inputParentPin.setText("");
        }
    }

    // Prevent bypassing via back button when locked
    @Override
    public void onBackPressed() {
        ParentalConfig config = ParentalConfig.getInstance(this);
        if (config.isDeviceLocked()) {
            Toast.makeText(this, "El teléfono se encuentra bloqueado por tus padres.", Toast.LENGTH_SHORT).show();
            return;
        }
        Intent homeIntent = new Intent(Intent.ACTION_MAIN);
        homeIntent.addCategory(Intent.CATEGORY_HOME);
        homeIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(homeIntent);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (!hasFocus) {
            ParentalConfig config = ParentalConfig.getInstance(this);
            if (config.isDeviceLocked()) {
                // Reenforzar primer plano para evitar que otras aplicaciones o launchers se abran encima
                Intent lockIntent = new Intent(this, LockOverlayActivity.class);
                lockIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
                lockIntent.putExtra("BLOCK_REASON", config.getLockReason());
                startActivity(lockIntent);
            }
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (currentInstance != null && currentInstance.get() == this) {
            currentInstance = null;
        }
    }
}
