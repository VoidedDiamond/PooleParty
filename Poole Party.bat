@echo off
title Poole Party
cd /d "%~dp0"

if not exist "node_modules" (
  echo First run - installing dependencies, this can take a minute...
  call npm install
  echo.
)

start "" /min powershell -NoProfile -Command "Start-Sleep -Seconds 3; Start-Process 'http://localhost:3000/host'"

echo.
echo Poole Party is starting - the TV screen will open in your browser shortly.
echo Leave this window open while you play. Closing it ends the game.
echo.

call npm start
