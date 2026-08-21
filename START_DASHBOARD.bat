@echo off
setlocal
cd /d "%~dp0"

echo Starting the Aquaivolt dashboard without the separate ML proof...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-aquaivolt.ps1" -DashboardOnly %*
if errorlevel 1 (
  echo.
  echo The dashboard could not start. Read the message above, then try again.
  pause
  exit /b 1
)

exit /b 0
