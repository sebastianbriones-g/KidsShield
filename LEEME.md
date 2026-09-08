# KidsShield — Sistema de Control Parental para Android

¡Bienvenido al proyecto **KidsShield**!

Este proyecto contiene la solución completa de control parental:
1. **`KidsShield-v1.0.0.apk` / `KidsShield-v1.0.0-release.apk`**: Archivo instalable compilado y firmado para el teléfono de tu hijo.
2. **`parent-dashboard/`**: Panel de control interactivo para padres con visualización de telemetría en tiempo real, bloqueo instantáneo y simulador.
3. **`server/`**: Servidor Node.js con API REST y WebSockets para la comunicación instantánea.
4. **`child-android-app/`**: Código fuente nativo de Android (Java 17, Android 14 SDK 34) con servicios en segundo plano (`AccessibilityService`, `UsageStatsManager`, `DeviceAdminReceiver`).

---

## 🚀 Cómo Iniciar el Panel de Padres

1. Haz doble clic en el archivo **`iniciar-panel.bat`** (o ejecuta `node index.js` dentro de la carpeta `server/`).
2. Se abrirá automáticamente tu navegador en:
   👉 **http://localhost:3000**

---

## 📲 Cómo Instalar la APK en el Teléfono del Hijo

1. Pasa el archivo **`KidsShield-v1.0.0.apk`** al teléfono de tu hijo (mediante cable USB, WhatsApp, Google Drive o descargándolo desde el panel web en el navegador del móvil).
2. Abre el archivo y autoriza **"Instalar desde esta fuente"**.
3. **Si aparece la alerta de Google Play Protect:**
   - **NO** presiones "Aceptar" ni "Entendido" (eso cancelaría la instalación).
   - Toca en **"Más detalles"** (o en la flechita ▾).
   - Selecciona **"Instalar de todas formas"**.
4. Abre la aplicación y activa los 4 permisos guiados:
   - **Acceso a Datos de Uso**: Mide el tiempo diario en juegos y redes sociales.
   - **Superposición (Draw over apps)**: Dibuja la pantalla de bloqueo cuando se cumple el tiempo límite.
   - **Servicio de Accesibilidad**: Detecta al instante si el niño abre una app prohibida (TikTok, Roblox, etc.) y la cierra inmediatamente.
   - **Administrador de Dispositivo**: Evita que el menor desinstale la app.

---

## 🔑 Desbloqueo de Emergencia Presencial
El PIN de seguridad configurado por defecto es:
**`1234`**
(Puedes cambiarlo en cualquier momento desde el botón "PIN" en el Panel de Control Web).

---

## 🛠️ Cómo Recompilar la APK en el Futuro

Si modificas el código de la app Android en `child-android-app/`:
```powershell
cd child-android-app
.\gradlew.bat assembleRelease
```
El nuevo APK se generará en:
`child-android-app\app\build\outputs\apk\release\app-release.apk`
