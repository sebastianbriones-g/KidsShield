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

        TextView textLockTitle = findViewById(R.id.textLockTitle);
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

        String appName = getIntent().getStringExtra("BLOCKED_APP_NAME");
        boolean isDevLocked = config.isDeviceLocked();

        if (textLockTitle != null) {
            textLockTitle.setText(isDevLocked ? "🔒 Dispositivo Bloqueado" : "🔒 Aplicación Bloqueada");
        }

        if (textLockMessage != null) {
            if (isDevLocked && appName != null && !appName.isEmpty()) {
                textLockMessage.setText(reason + "\n\nNo es posible abrir " + appName + " mientras el teléfono esté bloqueado.");
            } else if (reason != null && !reason.isEmpty()) {
                textLockMessage.setText(reason);
            }
        }

        // El botón para volver al escritorio siempre está disponible para regresar a la pantalla de inicio
        btnGoHome.setVisibility(View.VISIBLE);

        btnUnlockWithPin.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                verifyAndUnlock();
            }
        });

        btnGoHome.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                goHome();
            }
        });
    }

    private void goHome() {
        Intent homeIntent = new Intent(Intent.ACTION_MAIN);
        homeIntent.addCategory(Intent.CATEGORY_HOME);
        homeIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(homeIntent);
        finish();
    }

    private void verifyAndUnlock() {
        String enteredPin = inputParentPin.getText().toString().trim();
        ParentalConfig config = ParentalConfig.getInstance(this);

        if (enteredPin.equals(config.getParentPin())) {
            Toast.makeText(this, "✅ Acceso parental concedido (15 min de desbloqueo)", Toast.LENGTH_SHORT).show();
            config.setDeviceLocked(false);
            config.grantAdminBypass(15);
            com.kidsguard.parentalcontrol.network.SyncClient.sendEvent(this, "PARENT_PIN_UNLOCK", getPackageName(), "KidsShield",
                    "🔓 Dispositivo desbloqueado mediante PIN parental.");
            finish();
        } else {
            Toast.makeText(this, "PIN incorrecto. Intenta de nuevo.", Toast.LENGTH_SHORT).show();
            inputParentPin.setText("");
        }
    }

    @Override
    public void onBackPressed() {
        goHome();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (currentInstance != null && currentInstance.get() == this) {
            currentInstance = null;
        }
    }
}
