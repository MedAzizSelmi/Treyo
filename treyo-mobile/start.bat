@echo off
REM Start Expo and force Metro to advertise the Wi-Fi IP to the phone.
REM
REM If your PC has BOTH Ethernet and Wi-Fi connected at the same time,
REM Expo's auto-detect will sometimes pick the Ethernet IP and the phone
REM (which is on Wi-Fi) can't reach the bundler. We set the hostname
REM explicitly to dodge that.
REM
REM How to use:
REM   1) Run `ipconfig` and find your Wi-Fi IPv4 address.
REM   2) Update the value below if it changed.
REM   3) Double-click this file or run it from a terminal.

set REACT_NATIVE_PACKAGER_HOSTNAME=192.168.100.68
set EXPO_PACKAGER_PROXY_URL=http://%REACT_NATIVE_PACKAGER_HOSTNAME%:8081

echo.
echo === Starting Expo on %REACT_NATIVE_PACKAGER_HOSTNAME% ===
echo.

npx expo start --clear --lan
