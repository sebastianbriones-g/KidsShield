@echo off
title KidsShield - Panel de Control Parental
echo ================================================================
echo   KidsShield - Sistema de Control Parental y Proteccion Digital
echo ================================================================
echo.
echo Iniciando el servidor backend en http://localhost:3000...
echo.

cd /d "%~dp0server"
start http://localhost:3000
node index.js

pause
