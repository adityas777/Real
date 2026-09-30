@echo off
rem ============================================================================
rem  Build91 Admin - double-click to start the admin + the internet link and get
rem  every project's links in "Build91 LINKS.txt" on the Desktop.
rem  Everything runs in the background; stop it with stop-admin.bat.
rem  The work is done by start-admin.ps1 (same folder). Guide: deploy\office\README.md
rem ============================================================================
title Build91 Admin
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-admin.ps1"
