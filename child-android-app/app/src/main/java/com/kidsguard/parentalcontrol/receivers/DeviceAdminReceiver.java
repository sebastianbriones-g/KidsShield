package com.kidsguard.parentalcontrol.receivers;

import android.content.Context;
import android.content.Intent;
import android.widget.Toast;

public class DeviceAdminReceiver extends android.app.admin.DeviceAdminReceiver {

    @Override
    public void onEnabled(Context context, Intent intent) {
        super.onEnabled(context, intent);
        Toast.makeText(context, "Protección contra desinstalación activada", Toast.LENGTH_LONG).show();
    }

    @Override
    public CharSequence onDisableRequested(Context context, Intent intent) {
        return "ADVERTENCIA: Si desactivas KidsShield, tus padres recibirán una alerta inmediata y el teléfono quedará bloqueado.";
    }

    @Override
    public void onDisabled(Context context, Intent intent) {
        super.onDisabled(context, intent);
        Toast.makeText(context, "Protección de administrador desactivada", Toast.LENGTH_SHORT).show();
    }
}
