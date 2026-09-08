@echo off
title KidsShield - Panel de Control Parental
echo ================================================================
echo   KidsShield - Sistema de Control Parental y Proteccion Digital
echo ================================================================
echo.
echo Iniciando el servidor backend en http://localhost:3000...
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

echo Iniciando el servidor backend en http://localhost:3000...
echo.
start http://localhost:3000
node index.js

pause
