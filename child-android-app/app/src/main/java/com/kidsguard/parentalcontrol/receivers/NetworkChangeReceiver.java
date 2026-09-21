package com.kidsguard.parentalcontrol.receivers;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.util.Log;

import com.kidsguard.parentalcontrol.database.OfflineQueueManager;

/**
 * Receptor de difusión para cambios de conectividad de red.
 * Al recuperar la conexión a Internet, dispara el vaciado de datos acumulados en SQLite.
 */
public class NetworkChangeReceiver extends BroadcastReceiver {

    private static final String TAG = "KidsShield_NetReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;

        String action = intent.getAction();
        if (ConnectivityManager.CONNECTIVITY_ACTION.equals(action) || "android.net.conn.CONNECTIVITY_CHANGE".equals(action)) {
            boolean isOnline = OfflineQueueManager.isNetworkAvailable(context);
            if (isOnline) {
                int pending = OfflineQueueManager.getPendingCount(context);
                Log.i(TAG, "📶 Cambio de red detectado: Online (" + pending + " elementos pendientes en SQLite)");
                if (pending > 0) {
                    OfflineQueueManager.flushQueue(context);
                }
            } else {
                Log.i(TAG, "📵 Conexión a red perdida. Modo SQLite offline activado.");
            }
        }
    }
}
