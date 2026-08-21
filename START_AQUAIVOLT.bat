@echo off
setlocal
cd /d "%~dp0"

echo.
echo ============================================================
echo   AQUAIVOLT AI BIOGAS COMMAND CENTER
echo   Full local demonstration: saved ML workflow + dashboard
echo ============================================================
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-aquaivolt.ps1" %*
if errorlevel 1 (
  echo.
  echo Aquaivolt could not start. Read the message above, then try again.
  pause
  exit /b 1
)

exit /b 0
