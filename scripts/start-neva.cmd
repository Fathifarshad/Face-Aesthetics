@echo off
rem Starts the NEVA app on this computer and opens it in the browser.
rem Keep this window open while you use the app; close it to stop the app.
title NEVA
cd /d "%~dp0.."
if not exist node_modules (
  echo First run: installing packages. This can take a few minutes...
  call npm install || goto :failed
  call npm run setup || goto :failed
)
echo Starting NEVA. The browser opens by itself. Close this window to stop the app.
call npm run dev -- --open
goto :eof

:failed
echo.
echo Setup did not finish. Check the messages above.
pause