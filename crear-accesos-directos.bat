@echo off
cd /d "%~dp0"
echo Creando accesos directos en el escritorio...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
 "$p = (Get-Location).Path; $esc = [Environment]::GetFolderPath('Desktop'); $sh = New-Object -ComObject WScript.Shell;" ^
 "$a = $sh.CreateShortcut((Join-Path $esc 'Agenda de Bufete Juridico.lnk')); $a.TargetPath = (Join-Path $p 'iniciar.bat'); $a.WorkingDirectory = $p; $a.IconLocation = (Join-Path $p 'build\icon.ico'); $a.WindowStyle = 7; $a.Description = 'Abrir Agenda de Bufete Juridico'; $a.Save();" ^
 "$c = $sh.CreateShortcut((Join-Path $esc 'Proyecto - Agenda de Bufete Juridico.lnk')); $c.TargetPath = $p; $c.Description = 'Carpeta del proyecto'; $c.Save();" ^
 "Write-Host ('Listo. Accesos creados en: ' + $esc)"
echo.
pause
