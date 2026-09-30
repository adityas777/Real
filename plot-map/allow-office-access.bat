@echo off
rem ============================================================================
rem  Build91 Admin - ONE-TIME: let other office computers reach the admin.
rem  Opens port 8731 in Windows Firewall for the office network only
rem  (remote address = local subnet; Private/Domain networks, never Public).
rem  Needs administrator rights - it asks for them itself.
rem ============================================================================
setlocal
net session >nul 2>&1
if errorlevel 1 (
  echo Asking for administrator rights...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

set "RULE=Build91 Admin (port 8731)"
netsh advfirewall firewall delete rule name="%RULE%" >nul 2>&1
netsh advfirewall firewall add rule name="%RULE%" dir=in action=allow protocol=TCP localport=8731 remoteip=localsubnet profile=private,domain
if errorlevel 1 (
  echo.
  echo  [!] Could not add the firewall rule.
) else (
  echo.
  echo  Done. Other computers on the office network can now open the admin.
  echo  If they still can't: Windows Settings - Network - make sure this network
  echo  is set to "Private" ^(not "Public"^).
)
echo.
pause
