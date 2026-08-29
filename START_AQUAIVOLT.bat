@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title AQUAIVOLT local dashboard

echo.
echo ============================================================
echo   AQUAIVOLT - Wastewater to Optimized Energy
echo   Local dashboard launcher
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed on this laptop.
  echo.
  echo 1. A browser window will open at the official Node.js download page.
  echo 2. Install Node.js 22 LTS using the default options.
  echo 3. Close this window, open a new Command Prompt, then run this file again.
  start "" "https://nodejs.org/en/download"
  pause
  exit /b 1
)

for /f %%v in ('node -p "process.versions.node.split('.')[0]"') do set "NODE_MAJOR=%%v"
if %NODE_MAJOR% LSS 22 (
  echo This project needs Node.js 22 LTS or newer. The installed major version is %NODE_MAJOR%.
  echo Please install Node.js 22 LTS from the official download page, then run this file again.
  start "" "https://nodejs.org/en/download"
  pause
  exit /b 1
)

if not exist ".env.local" (
  copy /Y ".env.example" ".env.local" >nul
  echo First-time local settings were created.
  echo Notepad will open now. You may keep the supplied login values.
  echo Leave OPENAI_API_KEY blank unless you want optional OpenAI-enhanced Copilot answers.
  echo Save the file and close Notepad to continue.
  echo.
  notepad.exe "%CD%\.env.local"
)

if not exist "node_modules\.bin\next.cmd" (
  echo Installing or repairing application packages. This happens on the first run and can take a few minutes...
  echo The installer will retry temporary internet interruptions automatically.
  call npm install --no-audit --no-fund --fetch-retries=5 --fetch-retry-mintimeout=2000 --fetch-retry-maxtimeout=120000
  if errorlevel 1 (
    echo.
    echo Package installation did not finish. Check that the laptop is connected to the internet, then run this file again.
    pause
    exit /b 1
  )
)

if not exist "node_modules\.bin\next.cmd" (
  echo.
  echo The installation is incomplete because the Next.js command is missing.
  echo Run the repair steps in CLIENT_QUICK_START.md, then start this file again.
  pause
  exit /b 1
)

echo.
echo Starting the local AQUAIVOLT dashboard...
echo Keep the new server window open while using the application.
start "AQUAIVOLT local server - keep open" cmd /k "cd /d ""%CD%"" && npm run dev"

echo Waiting for the dashboard to start...
timeout /t 8 /nobreak >nul
start "" "http://localhost:3000"
echo The browser should now open at http://localhost:3000
echo.
echo Local login details:
echo   Administrator: admin / doris@777
echo   User:          user / doris@777
echo.
exit /b 0
