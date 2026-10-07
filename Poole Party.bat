@echo off
title Poole Party
cd /d "%~dp0"

if not exist "node_modules\@anthropic-ai\sdk" (
  echo Installing dependencies, this can take a minute...
  call npm install
  echo.
)

rem The TV page opens in Microsoft Edge when it's there: Edge has lifelike "Natural" voices for
rem the host. Other browsers on Windows only have robotic ones. Falls back to the default browser.
start "" /min powershell -NoProfile -Command "Start-Sleep -Seconds 3; try { Start-Process msedge 'http://localhost:3000/host' -ErrorAction Stop } catch { Start-Process 'http://localhost:3000/host' }"

echo.
echo Poole Party is starting - the TV screen will open in Microsoft Edge shortly.
echo Leave this window open while you play. Closing it ends the game.
echo.

call npm start
