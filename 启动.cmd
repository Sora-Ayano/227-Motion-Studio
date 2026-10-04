@echo off
setlocal
chcp 65001 >nul
set "STUDIO_POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
"%STUDIO_POWERSHELL%" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0tools\start-studio.ps1" %*
set "STUDIO_EXIT=%ERRORLEVEL%"
if not "%STUDIO_EXIT%"=="0" pause
exit /b %STUDIO_EXIT%
