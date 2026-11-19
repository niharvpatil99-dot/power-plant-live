@echo off
title Live Power Plant Performance Analysis & Monitoring System
color 0b
echo ================================================================
echo    LIVE POWER PLANT PERFORMANCE ANALYSIS & MONITORING SYSTEM
echo                 500 MW Satpura Unit #4
echo ================================================================
echo.
echo Starting Flask-SocketIO Web Server & Telemetry Engine...
cd /d "%~dp0backend"
start /b python app.py >nul 2>&1
timeout /t 3 >nul
echo.
echo Launching React Dashboard in Google Chrome...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" "http://localhost:5000"
echo.
echo System Running! Press any key to stop server...
pause >nul
taskkill /f /im python.exe >nul 2>&1
exit
