@echo off
rem ============================================================================
rem  Build91 Admin - stop the admin server and the internet link.
rem  Only stops server.py and cloudflared (the internet link); nothing else.
rem  Wait until any Save upload has finished before stopping.
rem ============================================================================
title Build91 Admin - stopping
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name like 'python%%'\" | Where-Object { $_.CommandLine -like '*server.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"
echo.
echo  The Build91 admin and its internet link are stopped.
echo  To start again: double-click "Build91 - Start Admin" on the Desktop.
echo.
timeout /t 6 >nul
