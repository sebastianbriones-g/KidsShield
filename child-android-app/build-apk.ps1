# Script de compilación automática para KidsShield APK
$ErrorActionPreference = "Stop"

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "🛡️ COMPILADOR DE APK - KIDSSHIELD" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

# 1. Configurar JDK 17
$JavaPath = "C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot"
if (Test-Path $JavaPath) {
    $env:JAVA_HOME = $JavaPath
    $env:PATH = "$JavaPath\bin;$env:PATH"
    Write-Host "✓ Java 17 detectado: $JavaPath" -ForegroundColor Green
} else {
    Write-Host "⚠️ Buscando Java en PATH..." -ForegroundColor Yellow
}

Write-Host "Versión de Java activa:" -ForegroundColor Gray
java -version

Write-Host "`nPara compilar con Android Studio:" -ForegroundColor Cyan
Write-Host "1. Abre Android Studio -> File -> Open" -ForegroundColor White
Write-Host "2. Selecciona la carpeta: $PSScriptRoot" -ForegroundColor White
Write-Host "3. Menú Build -> Build Bundle(s) / APK(s) -> Build APK(s)" -ForegroundColor White
Write-Host "4. El archivo APK resultante se generará en app\build\outputs\apk\debug\app-debug.apk" -ForegroundColor White
