# Start Expo with one of three transport modes.
#
# Usage:
#   .\start.ps1            # LAN — phone & PC on same WiFi (default, fastest)
#   .\start.ps1 -Tunnel    # cloud tunnel via ngrok (works on locked-down WiFi)
#   .\start.ps1 -Usb       # USB cable via adb reverse (most reliable, bypasses WiFi entirely)

param(
    [switch]$Tunnel,
    [switch]$Usb
)

# ─── USB MODE ──────────────────────────────────────────────────
if ($Usb) {
    $adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
    if (-not (Test-Path $adb)) {
        Write-Host "adb.exe not found at $adb" -ForegroundColor Red
        Write-Host "Either install Android Studio platform-tools or use -Tunnel" -ForegroundColor Yellow
        exit 1
    }

    Write-Host ""
    Write-Host "=== USB mode — make sure your phone is plugged in via USB ===" -ForegroundColor Cyan
    Write-Host "    and 'USB debugging' is enabled in Developer options." -ForegroundColor Yellow
    Write-Host ""

    & $adb devices
    Write-Host ""
    Write-Host "Setting up adb reverse for ports 8081 (Metro) and 8085 (backend)..." -ForegroundColor Cyan
    & $adb reverse tcp:8081 tcp:8081
    & $adb reverse tcp:8085 tcp:8085

    # Tell Metro to advertise localhost — phone uses adb-reverse to reach it
    $env:REACT_NATIVE_PACKAGER_HOSTNAME = "localhost"

    Write-Host ""
    Write-Host "=== Starting Expo on localhost (USB) ===" -ForegroundColor Cyan
    Write-Host "  Open the project in Expo Go via 'press a' or scan QR." -ForegroundColor Yellow
    Write-Host ""

    npx expo start --clear --localhost
    return
}

# ─── TUNNEL MODE ───────────────────────────────────────────────
if ($Tunnel) {
    Write-Host ""
    Write-Host "=== Starting Expo in TUNNEL mode (works on any network) ===" -ForegroundColor Cyan
    Write-Host "  If you get 'remote gone away', ngrok is down — try:  npm run usb" -ForegroundColor Yellow
    Write-Host ""
    npx expo start --clear --tunnel
    return
}

# ─── LAN MODE (default) ────────────────────────────────────────
$wifi = Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi" -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "169.*" } |
    Select-Object -First 1 -ExpandProperty IPAddress

if (-not $wifi) {
    Write-Host "Could not detect a Wi-Fi IPv4 address. Falling back to manual value." -ForegroundColor Yellow
    $wifi = "192.168.100.68"
}

$env:REACT_NATIVE_PACKAGER_HOSTNAME = $wifi
$env:EXPO_PACKAGER_PROXY_URL = "http://${wifi}:8081"

Write-Host ""
Write-Host "=== Starting Expo on $wifi (LAN mode) ===" -ForegroundColor Cyan
Write-Host "  If 'Failed to download remote update' on phone — try:  npm run usb" -ForegroundColor Yellow
Write-Host ""

npx expo start --clear --lan
