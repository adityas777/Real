# Build91 Admin - start the admin + the internet link, and list every project's links.
# Run by start-admin.bat (double-click that, or the "Build91 - Start Admin" desktop shortcut).
# Everything runs HIDDEN in the background; stop it with stop-admin.bat.
# Keep this file plain ASCII: Windows PowerShell 5.1 misreads UTF-8 without a BOM.

$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Here
$Port = 8731
$Host.UI.RawUI.WindowTitle = 'Build91 Admin'

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }
function Fail($text) {
    Say ''
    Say "  [!] $text" Red
    Say ''
    Read-Host '  Press Enter to close'
    exit 1
}
function PortOpen {
    try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', $Port); $c.Close(); return $true } catch { return $false }
}
function UrlWorks($url) {
    try { $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 8; return ($r.StatusCode -eq 200) } catch { return $false }
}

Say ''
Say '  Build91 Admin - starting, please wait...' Cyan
Say ''

# ---- 1. Python and the two libraries the admin needs --------------------------
$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) { Fail 'Python is not installed. Ask IT to install Python 3 (with "Add python.exe to PATH").' }
& python -c "import boto3, PIL" 2>$null
if ($LASTEXITCODE -ne 0) {
    Say '  Installing the libraries the admin needs (one time only)...'
    & python -m pip install --user boto3 pillow
    & python -c "import boto3, PIL" 2>$null
    if ($LASTEXITCODE -ne 0) { Fail 'Could not install boto3 / Pillow. Check the internet connection and try again.' }
}

# ---- 2. The admin server (server.py) ------------------------------------------
if (PortOpen) {
    Say '  Admin server: already running.' Green
} else {
    Say '  Admin server: starting...'
    Start-Process -FilePath $py.Source -ArgumentList 'server.py', "$Port" -WorkingDirectory $Here -WindowStyle Hidden `
        -RedirectStandardOutput "$Here\server.log" -RedirectStandardError "$Here\server.err.log"
    for ($i = 0; $i -lt 60 -and -not (PortOpen); $i++) { Start-Sleep -Milliseconds 500 }
    if (-not (PortOpen)) { Fail 'The admin server did not start. (Details for IT: plot-map\server.err.log)' }
    Say '  Admin server: running.' Green
}

# ---- 3. The internet link (Cloudflare quick tunnel) -----------------------------
# A free quick tunnel: its address is random and CHANGES every time it is started.
$cf = Join-Path $Here 'cloudflared.exe'
$tunnelLog = Join-Path $Here 'tunnel.log'
$tunnel = $null
if (Test-Path $cf) {
    if ((Get-Process cloudflared -ErrorAction SilentlyContinue) -and (Test-Path $tunnelLog)) {
        $m = Select-String -Path $tunnelLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -Last 1
        if ($m -and (UrlWorks ($m.Matches[0].Value + '/'))) { $tunnel = $m.Matches[0].Value; Say '  Internet link: already running.' Green }
    }
    if (-not $tunnel) {
        Say '  Internet link: starting (up to a minute)...'
        Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
        # A FRESH log file for this run: a leftover address from an earlier run was once handed
        # out as the link (2026-09-30, a dead address). If the old file can't be deleted, use a new name.
        Remove-Item $tunnelLog -ErrorAction SilentlyContinue
        if (Test-Path $tunnelLog) { $tunnelLog = Join-Path $Here ('tunnel-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log') }
        Start-Process -FilePath $cf -ArgumentList 'tunnel', '--url', "http://localhost:$Port" -WorkingDirectory $Here -WindowStyle Hidden `
            -RedirectStandardOutput "$Here\tunnel.out.log" -RedirectStandardError $tunnelLog
        # Only accept an address that really answers: always the LATEST one in the log, re-read
        # every round, for up to about 2 minutes.
        $candidate = $null
        for ($i = 0; $i -lt 40 -and -not $tunnel; $i++) {
            Start-Sleep -Seconds 3
            $m = Select-String -Path $tunnelLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -Last 1
            if ($m) { $candidate = $m.Matches[0].Value; if (UrlWorks ($candidate + '/')) { $tunnel = $candidate } }
        }
        if (-not $tunnel -and $candidate) { $tunnel = $candidate; Say '  Internet link: started but not answering yet - wait a minute before using it.' Yellow }
        if ($tunnel) {
            Say '  Internet link: running.' Green
        } else {
            Say '  Internet link: could not start (no internet?). Local links still work.' Yellow
        }
    }
} else {
    Say '  Internet link: cloudflared.exe is missing, so only local links are listed.' Yellow
}

# ---- 4. Office IP and the list of projects -------------------------------------
$ip = (Get-NetIPConfiguration -ErrorAction SilentlyContinue |
    Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up' } |
    Select-Object -First 1).IPv4Address.IPAddress
$projects = Get-ChildItem -Path (Join-Path $Here 'projects') -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notmatch '^(\.|Backup$)' -and ((Test-Path (Join-Path $_.FullName 'plots.svg')) -or (Test-Path (Join-Path $_.FullName 'tour.json'))) } |
    Sort-Object Name | ForEach-Object { $_.Name }

# ---- 5. Write the links file and open it -----------------------------------------
$L = New-Object System.Collections.Generic.List[string]
$L.Add('BUILD91 LINKS  -  made ' + (Get-Date -Format 'dd MMM yyyy, hh:mm tt'))
$L.Add('==========================================================================')
$L.Add('')
$L.Add('HOW TO USE')
$L.Add('  * CLIENT links = what a customer sees. Safe to send to clients.')
$L.Add('  * ADMIN links  = the editing screen. Do NOT send to clients: anyone with an')
$L.Add('    admin internet link can change or delete the project.')
$L.Add('  * The INTERNET links change every time the admin is started (after a restart')
$L.Add('    of the computer, etc.). Always copy fresh ones from this file.')
$L.Add('  * "This computer" links only work on this computer.')
$L.Add('    "Office network" links work on other computers in the office.')
$L.Add('')
if (-not $tunnel) { $L.Add('  (No internet links this time - the internet link did not start.)'); $L.Add('') }
foreach ($p in $projects) {
    $L.Add('--------------------------------------------------------------------------')
    $L.Add("PROJECT: $p")
    $L.Add('  CLIENT link')
    if ($tunnel) { $L.Add("     Internet        : $tunnel/?project=$p") }
    if ($ip)     { $L.Add("     Office network  : http://${ip}:$Port/?project=$p") }
    $L.Add("     This computer   : http://localhost:$Port/?project=$p")
    $L.Add('  ADMIN link (for our team only)')
    if ($tunnel) { $L.Add("     Internet        : $tunnel/?admin=1&project=$p") }
    if ($ip)     { $L.Add("     Office network  : http://${ip}:$Port/?admin=1&project=$p") }
    $L.Add("     This computer   : http://localhost:$Port/?admin=1&project=$p")
    $L.Add('')
}
$L.Add('==========================================================================')
$L.Add('To stop everything: double-click "Build91 - Stop Admin" on the Desktop.')

$desktop = [Environment]::GetFolderPath('Desktop')
$linksFile = Join-Path $desktop 'Build91 LINKS.txt'
Set-Content -Path $linksFile -Value $L -Encoding UTF8
Copy-Item $linksFile (Join-Path $Here 'LINKS.txt') -Force -ErrorAction SilentlyContinue

# ---- 6. Desktop shortcuts (made once) ---------------------------------------------
$ws = New-Object -ComObject WScript.Shell
foreach ($s in @(@('Build91 - Start Admin', 'start-admin.bat'), @('Build91 - Stop Admin', 'stop-admin.bat'))) {
    $lnk = Join-Path $desktop ($s[0] + '.lnk')
    if (-not (Test-Path $lnk) -and (Test-Path (Join-Path $Here $s[1]))) {
        $sc = $ws.CreateShortcut($lnk); $sc.TargetPath = (Join-Path $Here $s[1]); $sc.WorkingDirectory = $Here; $sc.Save()
    }
}

Say ''
Say '  All set! The links are in "Build91 LINKS.txt" on the Desktop (opening it now).' Green
Say '  The admin keeps running in the background - you can close this window.' Green
Say ''
Start-Process notepad.exe -ArgumentList "`"$linksFile`""
Start-Sleep -Seconds 4
