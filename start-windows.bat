@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 LTS from https://nodejs.org first.
  pause
  exit /b 1
)
echo Starting Fieldwork. Open http://localhost:3000 in your browser.
echo Keep this window open for automatic daily updates.
node --disable-warning=ExperimentalWarning src/server.mjs
pause
