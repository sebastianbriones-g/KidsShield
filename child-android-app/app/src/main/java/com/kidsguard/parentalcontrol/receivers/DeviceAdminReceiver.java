package com.kidsguard.parentalcontrol.receivers;

import android.content.Context;
import android.content.Intent;
import android.widget.Toast;

import com.kidsguard.parentalcontrol.network.SyncClient;

public class DeviceAdminReceiver extends android.app.admin.DeviceAdminReceiver {

    @Override
    public void onEnabled(Context context, Intent intent) {
        super.onEnabled(context, intent);
        Toast.makeText(context, "Protección contra desinstalación activada", Toast.LENGTH_LONG).show();
        SyncClient.sendEvent(context, "PROTECTION_ENABLED", context.getPackageName(), "KidsShield",
                "✅ Administrador del dispositivo activado con éxito.");
    }

    @Override
    public CharSequence onDisableRequested(Context context, Intent intent) {
        SyncClient.sendEvent(context, "UNINSTALL_ATTEMPT", context.getPackageName(), "KidsShield",
                "⚠️ Intento de desinstalación detectado: Se solicitó desactivar los permisos de Administrador.");
        return "ADVERTENCIA: Si desactivas KidsShield, tus padres recibirán una alerta inmediata de desinstalación.";
    }

    @Override
    public void onDisabled(Context context, Intent intent) {
        super.onDisabled(context, intent);
        Toast.makeText(context, "Protección de administrador desactivada", Toast.LENGTH_SHORT).show();
        SyncClient.sendEvent(context, "PROTECTION_DISABLED", context.getPackageName(), "KidsShield",
                "🚨 ALERTA: La protección de Administrador fue desactivada. Desinstalación inminente.");
    }
}

