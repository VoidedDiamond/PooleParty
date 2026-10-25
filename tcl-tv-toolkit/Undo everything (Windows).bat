@echo off
rem Double-click to undo everything the toolkit changed on the TV.
cd /d "%~dp0"
set "GITBASH=%ProgramFiles%\Git\bin\bash.exe"
if not exist "%GITBASH%" set "GITBASH=%ProgramFiles(x86)%\Git\bin\bash.exe"
if not exist "%GITBASH%" set "GITBASH=%LOCALAPPDATA%\Programs\Git\bin\bash.exe"
if not exist "%GITBASH%" (
  echo Git for Windows is needed: https://git-scm.com/download/win
  pause
  exit /b 1
)
"%GITBASH%" ./restore.sh
echo.
pause
