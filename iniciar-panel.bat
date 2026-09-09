@echo off
title KidsShield - Panel de Control Parental
echo ================================================================
echo   KidsShield - Sistema de Control Parental y Proteccion Digital
echo ================================================================
echo.
echo Panel Local:          http://localhost:3000
echo Panel en Tailscale:    http://100.74.204.90:3000 (o http://note:3000)
echo.

cd /d "%~dp0server"

if not exist "node_modules\" (
    echo [KidsShield] Instalando dependencias necesarias con npm...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Hubo un problema instalando las dependencias.
        pause
        exit /b 1
    )
)

echo Iniciando servidor en 0.0.0.0:3000 (accesible via Tailscale)...
echo.
start http://localhost:3000
node index.js

pause
