@echo off
setlocal
title StreamChat
cd /d "%~dp0"

where node.exe >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed or is missing from PATH.
  echo Install Node.js 24.12 or newer, then run this file again.
  goto :failed
)
where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo npm is not available. Reinstall Node.js with npm included.
  goto :failed
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo Installing dependencies. Internet access is required...
  call npm.cmd ci
  if errorlevel 1 goto :failed
)

echo Building StreamChat...
call npm.cmd run build
if errorlevel 1 goto :failed

echo Starting StreamChat...
call npm.cmd start
if errorlevel 1 goto :failed
exit /b 0

:failed
echo.
echo StreamChat could not start. See the error above.
pause
exit /b 1
