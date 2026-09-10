@echo off
title KidsShield - Panel de Control Parental
echo ================================================================
echo   KidsShield - Sistema de Control Parental y Proteccion Digital
echo ================================================================
echo.

:: Liberar puerto 3000 si estaba ocupado previamente
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr :3000 ^| findstr LISTENING') do (
    echo [KidsShield] Liberando puerto 3000 ocupado por proceso PID %%a
    taskkill /F /PID %%a >nul 2>&1
)

:: Habilitar reenvio de Tailscale si esta disponible
where tailscale >nul 2>&1
if not errorlevel 1 (
    echo [Tailscale] Activando tunel seguro en Tailscale...
    tailscale serve --bg --tcp 3000 127.0.0.1:3000 >nul 2>&1
    echo [Tailscale] Enlace Tailscale: http://100.74.204.90:3000 (o http://note:3000)
)

cd /d "%~dp0server"

if not exist node_modules (
    echo [KidsShield] Instalando dependencias de Node.js con npm...
    call npm install
)

echo.
echo ================================================================
echo   Panel Local:      http://localhost:3000
echo   Panel Tailscale:  http://100.74.204.90:3000 (o http://note:3000)
echo ================================================================
echo.
start http://localhost:3000
node index.js

pause
