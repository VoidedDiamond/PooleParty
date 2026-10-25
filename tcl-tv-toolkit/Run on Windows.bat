@echo off
rem Double-click this on Windows. Needs Git for Windows (for bash) and adb (Google platform-tools).
cd /d "%~dp0"
set "GITBASH=%ProgramFiles%\Git\bin\bash.exe"
if not exist "%GITBASH%" set "GITBASH=%ProgramFiles(x86)%\Git\bin\bash.exe"
if not exist "%GITBASH%" set "GITBASH=%LOCALAPPDATA%\Programs\Git\bin\bash.exe"
if not exist "%GITBASH%" (
  echo Git for Windows is needed to run these scripts: https://git-scm.com/download/win
  echo Install it, then double-click this file again.
  pause
  exit /b 1
)
if "%~1"=="" ( "%GITBASH%" ./run_all.sh ) else ( "%GITBASH%" %* )
echo.
pause
