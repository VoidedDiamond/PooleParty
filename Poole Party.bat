@echo off
title Poole Party
cd /d "%~dp0"

rem Node.js doesn't have to be installed: a portable copy in a "node" folder
rem here works too, and needs no admin rights. If there's neither, fetch one.
if exist "node\node.exe" goto use_local_node
where node >nul 2>nul
if not errorlevel 1 goto have_node
echo Node.js isn't installed, so downloading a portable copy into this folder.
echo No admin rights needed, and this only happens once...
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\get-node.ps1"
if not exist "node\node.exe" goto no_node
echo.
:use_local_node
set "PATH=%~dp0node;%PATH%"
:have_node

rem Checking for the newest dependency also reinstalls for anyone updating from an older copy.
if exist "node_modules\@anthropic-ai\sdk" goto start
echo Installing dependencies, this can take a minute...
call npm install
if errorlevel 1 goto install_failed
echo.
:start

rem The TV page opens in Microsoft Edge when it's there: Edge has lifelike "Natural" voices for
rem the host. Other browsers on Windows only have robotic ones. Falls back to the default browser.
start "" /min powershell -NoProfile -Command "Start-Sleep -Seconds 3; try { Start-Process msedge 'http://localhost:3000/host' -ErrorAction Stop } catch { Start-Process 'http://localhost:3000/host' }"

echo.
echo Poole Party is starting - the TV screen will open in Microsoft Edge shortly.
echo Leave this window open while you play. Closing it ends the game.
echo.

call npm start
goto :eof

:no_node
echo.
echo Couldn't set up Node.js automatically. To do it by hand:
echo   1. Go to https://nodejs.org/en/download and get the Windows "Standalone Binary (.zip)".
echo   2. Unzip it, rename the folder inside to "node", and move that folder here, so this file exists:
echo      %~dp0node\node.exe
echo   3. Run Poole Party again.
pause
exit /b 1

:install_failed
echo.
echo Installing dependencies failed - see the messages above. Check the internet connection and run Poole Party again.
pause
exit /b 1
