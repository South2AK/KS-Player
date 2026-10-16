@echo off
rem Startet KS Player (Entwicklungs-/Direktstart ohne Installation)
setlocal
set "NODE_DIR=%LOCALAPPDATA%\node-portable\node-v22.23.2-win-x64"
if exist "%NODE_DIR%\node.exe" set "PATH=%NODE_DIR%;%PATH%"
cd /d "%~dp0"
if not exist node_modules (
  echo Installiere Abhaengigkeiten ...
  call npm install --no-audit --no-fund
)
if not exist dist-electron\main.js call npm run build
if not exist dist\index.html call npm run build
start "" ".\node_modules\electron\dist\electron.exe" .
endlocal
