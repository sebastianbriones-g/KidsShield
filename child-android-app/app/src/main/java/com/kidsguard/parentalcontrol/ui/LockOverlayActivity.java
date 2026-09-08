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

    private EditText inputParentPin;
    private TextView textLockMessage;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_lock_overlay);

        textLockMessage = findViewById(R.id.textLockMessage);
        inputParentPin = findViewById(R.id.inputParentPin);
        Button btnUnlockWithPin = findViewById(R.id.btnUnlockWithPin);
        Button btnGoHome = findViewById(R.id.btnGoHome);

        String reason = getIntent().getStringExtra("BLOCK_REASON");
        if (reason != null && !reason.isEmpty()) {
            textLockMessage.setText(reason);
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

    // Prevent bypassing via back button
    @Override
    public void onBackPressed() {
        // Do not allow dismissing without parent PIN
        Intent homeIntent = new Intent(Intent.ACTION_MAIN);
        homeIntent.addCategory(Intent.CATEGORY_HOME);
        homeIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(homeIntent);
    }
}
