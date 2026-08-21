@echo off
setlocal
cd /d "%~dp0"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\start-aquaivolt.ps1" -AiOnly %*
if errorlevel 1 (
  echo.
  echo The AI workflow could not run. Read the message above, then try again.
  pause
  exit /b 1
)

echo.
echo Completed. Open run-evidence\latest_run.json to inspect the proof.
pause
exit /b 0
