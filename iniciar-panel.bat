@echo off
title KidsShield - Panel de Control Parental
echo ================================================================
echo   KidsShield - Sistema de Control Parental y Proteccion Digital
echo ================================================================
echo.

for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr :3000 ^| findstr LISTENING') do (
    echo [KidsShield] Liberando puerto 3000 ocupado por proceso PID %%a
    taskkill /F /PID %%a >nul 2>&1
)

cd /d "%~dp0server"

if not exist node_modules (
    echo [KidsShield] Instalando dependencias de Node.js con npm...
    call npm install
)

echo.
echo ================================================================
echo   Iniciando KidsShield en http://localhost:3000
echo ================================================================
echo.
start http://localhost:3000
node index.js

pause
