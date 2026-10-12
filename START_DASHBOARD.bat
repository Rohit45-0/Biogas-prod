@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 LTS from https://nodejs.org/en/download and reopen this window.
  pause
  exit /b 1
)

node -e "const [major,minor]=process.versions.node.split('.').map(Number);if(major<22||(major===22&&minor<13))process.exit(1)"
if errorlevel 1 (
  echo Node.js 22.13 or newer is required. Node.js 24 LTS is recommended.
  goto :error
)

where pnpm.cmd >nul 2>nul
if errorlevel 1 (
  echo Install the package manager with: npm.cmd install --global pnpm@11.25.0
  echo Then reopen this window and try again.
  goto :error
)

if not exist ".env.local" (
  echo Complete the local settings steps in CLIENT_QUICK_START.md first.
  echo Create .env.local from .env.example and choose your own local passwords.
  goto :error
)

node --env-file=.env.local -e "for(const key of ['AQUA_SESSION_SECRET','AQUA_ADMIN_PASSWORD','AQUA_USER_PASSWORD']){if(!process.env[key]||process.env[key].startsWith('replace-with-')){console.error('Configure '+key+' in .env.local first.');process.exitCode=1;}}"
if errorlevel 1 goto :error

echo Checking the locked application packages...
call pnpm.cmd install --frozen-lockfile
if errorlevel 1 goto :error

echo Open http://localhost:3000 after the server says Ready.
echo Keep this window open. Press Ctrl+C here to stop the dashboard.
call pnpm.cmd dev --webpack --hostname 127.0.0.1 --port 3000
if errorlevel 1 goto :error
exit /b 0

:error
echo Review the message above and the troubleshooting section in CLIENT_QUICK_START.md.
pause
exit /b 1
