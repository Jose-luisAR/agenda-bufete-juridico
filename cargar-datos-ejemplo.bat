@echo off
cd /d "%~dp0"
echo Cargando datos de ejemplo... (la aplicacion debe estar cerrada)
echo.
call npm run datos-ejemplo
echo.
pause
