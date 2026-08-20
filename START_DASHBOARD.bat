@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 is required. Download it from https://nodejs.org/
  pause
  exit /b 1
)

if not exist ".env.local" copy ".env.example" ".env.local" >nul

if not exist "node_modules" (
  echo Installing dashboard packages. This only happens on the first run...
  call npm install
  if errorlevel 1 goto :error
)

echo Starting Aquaivolt at http://localhost:3000
start "Aquaivolt Server" cmd /k "cd /d ""%~dp0"" && npm run dev"
timeout /t 8 /nobreak >nul
start "" "http://localhost:3000"
exit /b 0

:error
echo Setup failed. Check the internet connection and try again.
pause
exit /b 1
