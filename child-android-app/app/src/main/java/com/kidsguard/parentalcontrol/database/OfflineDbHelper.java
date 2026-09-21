package com.kidsguard.parentalcontrol.database;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.util.Log;

/**
 * Base de datos local SQLite para persistencia y encolado offline en KidsShield.
 * Almacena eventos de seguridad, pulsaciones de teclas y ubicaciones GPS cuando no hay conexión.
 */
public class OfflineDbHelper extends SQLiteOpenHelper {

    private static final String TAG = "KidsShield_OfflineDb";
    private static final String DATABASE_NAME = "kidsshield_offline.db";
    private static final int DATABASE_VERSION = 1;

    public static final String TABLE_OFFLINE_QUEUE = "offline_queue";
    public static final String COL_ID = "id";
    public static final String COL_TYPE = "type";           // 'EVENT', 'KEYSTROKE', 'LOCATION'
    public static final String COL_PAYLOAD = "payload";     // JSON con los datos y timestamp original
    public static final String COL_CREATED_AT = "created_at";
    public static final String COL_RETRY_COUNT = "retry_count";

    public static final int MAX_QUEUE_SIZE = 1000; // Límite de seguridad para no saturar memoria del teléfono

    private static OfflineDbHelper sInstance;

    public static synchronized OfflineDbHelper getInstance(Context context) {
        if (sInstance == null) {
            sInstance = new OfflineDbHelper(context.getApplicationContext());
        }
        return sInstance;
    }

    private OfflineDbHelper(Context context) {
        super(context, DATABASE_NAME, null, DATABASE_VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        try {
            String createTableSql = "CREATE TABLE IF NOT EXISTS " + TABLE_OFFLINE_QUEUE + " ("
                    + COL_ID + " INTEGER PRIMARY KEY AUTOINCREMENT, "
                    + COL_TYPE + " TEXT NOT NULL, "
                    + COL_PAYLOAD + " TEXT NOT NULL, "
                    + COL_CREATED_AT + " INTEGER NOT NULL, "
                    + COL_RETRY_COUNT + " INTEGER DEFAULT 0"
                    + ");";
            db.execSQL(createTableSql);

            // Índice para consultas rápidas por orden FIFO
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_offline_queue_id ON " + TABLE_OFFLINE_QUEUE + " (" + COL_ID + " ASC);");
            Log.i(TAG, "✅ Base de datos SQLite offline inicializada correctamente");
        } catch (Exception e) {
            Log.e(TAG, "Error creando tabla offline_queue", e);
        }
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        try {
            db.execSQL("DROP TABLE IF EXISTS " + TABLE_OFFLINE_QUEUE);
            onCreate(db);
        } catch (Exception e) {
            Log.e(TAG, "Error en upgrade de base de datos offline", e);
        }
    }

    /**
     * Limita el tamaño de la cola eliminando los registros más antiguos si se excede MAX_QUEUE_SIZE (FIFO).
     */
    public void pruneOldEntries(SQLiteDatabase db) {
        try {
            String pruneSql = "DELETE FROM " + TABLE_OFFLINE_QUEUE
                    + " WHERE " + COL_ID + " NOT IN ("
                    + "SELECT " + COL_ID + " FROM " + TABLE_OFFLINE_QUEUE
                    + " ORDER BY " + COL_ID + " DESC LIMIT " + MAX_QUEUE_SIZE
                    + ");";
            db.execSQL(pruneSql);
        } catch (Exception e) {
            Log.w(TAG, "Error podando registros antiguos de cola offline: " + e.getMessage());
        }
    }
}
