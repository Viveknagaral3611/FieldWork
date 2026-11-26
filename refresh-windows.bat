@echo off
cd /d "%~dp0"
node --disable-warning=ExperimentalWarning src/refresh.mjs
