package com.kidsguard.parentalcontrol.utils;

import android.content.Context;
import android.media.MediaRecorder;
import android.os.Build;
import android.util.Base64;
import android.util.Log;

import com.kidsguard.parentalcontrol.network.SyncClient;

import java.io.File;
import java.io.FileInputStream;

public class AudioCaptureHelper {

    private static final String TAG = "KidsShield_Audio";
    private static volatile boolean isRecording = false;

    /**
     * Graba audio ambiente de forma silenciosa durante los segundos indicados
     * y lo sube en formato AAC/MP4 Base64 al servidor de los padres.
     */
    public static synchronized void captureAndUploadAudio(final Context context, final int durationSeconds) {
        if (isRecording) {
            Log.w(TAG, "Ya hay una grabación de audio ambiental en progreso.");
            return;
        }
        isRecording = true;

        new Thread(new Runnable() {
            @Override
            public void run() {
                MediaRecorder recorder = null;
                File tempFile = null;
                try {
                    File cacheDir = context.getCacheDir();
                    tempFile = new File(cacheDir, "ambient_audio_" + System.currentTimeMillis() + ".mp4");

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        recorder = new MediaRecorder(context);
                    } else {
                        recorder = new MediaRecorder();
                    }

                    recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
                    recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
                    recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
                    recorder.setAudioEncodingBitRate(64000); // 64 kbps mono AAC
                    recorder.setAudioSamplingRate(44100);    // 44.1 kHz
                    recorder.setOutputFile(tempFile.getAbsolutePath());

                    recorder.prepare();
                    recorder.start();
                    Log.i(TAG, "🎙️ Grabación de audio ambiente iniciada (" + durationSeconds + "s)...");

                    // Esperar la duración solicitada
                    int sleepMs = Math.max(1000, durationSeconds * 1000);
                    Thread.sleep(sleepMs);

                    try {
                        recorder.stop();
                    } catch (Exception stopErr) {
                        Log.w(TAG, "Aviso al detener MediaRecorder: " + stopErr.getMessage());
                    }
                    recorder.release();
                    recorder = null;

                    if (tempFile.exists() && tempFile.length() > 0) {
                        int fileLength = (int) tempFile.length();
                        byte[] buffer = new byte[fileLength];
                        try (FileInputStream fis = new FileInputStream(tempFile)) {
                            int readTotal = 0;
                            while (readTotal < fileLength) {
                                int r = fis.read(buffer, readTotal, fileLength - readTotal);
                                if (r == -1) break;
                                readTotal += r;
                            }
                        }

                        String base64Audio = Base64.encodeToString(buffer, Base64.NO_WRAP);
                        Log.i(TAG, "🎙️ Audio ambiente capturado (" + fileLength + " bytes). Subiendo al servidor...");
                        SyncClient.uploadAudioClip(context, base64Audio, durationSeconds);
                    } else {
                        Log.w(TAG, "Archivo de audio vacío o inexistente tras la grabación");
                        SyncClient.sendEvent(context, "audio_error", "audio", "Micrófono", "No se grabaron datos de audio");
                    }

                } catch (SecurityException secErr) {
                    Log.e(TAG, "Permiso de micrófono no concedido: " + secErr.getMessage());
                    SyncClient.sendEvent(context, "audio_permission_denied", "audio", "Micrófono", "Falta conceder permiso de micrófono en el teléfono");
                } catch (Exception err) {
                    Log.e(TAG, "Error durante la grabación de audio ambiental: " + err.getMessage(), err);
                    SyncClient.sendEvent(context, "audio_error", "audio", "Micrófono", "Error al capturar audio: " + err.getMessage());
                } finally {
                    if (recorder != null) {
                        try {
                            recorder.release();
                        } catch (Exception ignored) {}
                    }
                    if (tempFile != null && tempFile.exists()) {
                        tempFile.delete();
                    }
                    isRecording = false;
                }
            }
        }).start();
    }
}
