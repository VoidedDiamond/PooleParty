@echo off
rem Double-click after editing config\dock.txt or adding photos to the wallpapers folder.
cd /d "%~dp0"
set "GITBASH=%ProgramFiles%\Git\bin\bash.exe"
if not exist "%GITBASH%" set "GITBASH=%ProgramFiles(x86)%\Git\bin\bash.exe"
if not exist "%GITBASH%" set "GITBASH=%LOCALAPPDATA%\Programs\Git\bin\bash.exe"
if not exist "%GITBASH%" (
  echo Git for Windows is needed: https://git-scm.com/download/win
  pause
  exit /b 1
)
"%GITBASH%" ./4_launcher.sh --update-dock
echo.
pause
