@echo off
cd /d "%~dp0"
echo Instalando el proyecto, espera unos minutos...
echo === VERSIONES === > instalacion.log
node -v >> instalacion.log 2>&1
call npm -v >> instalacion.log 2>&1
git --version >> instalacion.log 2>&1
echo === NPM INSTALL === >> instalacion.log
call npm install >> instalacion.log 2>&1
echo === NPM TEST === >> instalacion.log
call npm test >> instalacion.log 2>&1
echo === FIN === >> instalacion.log
echo Listo. Puedes cerrar esta ventana.
timeout /t 5 >nul
