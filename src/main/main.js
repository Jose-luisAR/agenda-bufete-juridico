// Proceso principal de Electron: crea la ventana, abre la base de datos
// y registra los controladores (la "C" de MVC) que atienden a las vistas.
const path = require('path');
const { app, BrowserWindow } = require('electron');
const db = require('../database/connection');
const rutas = require('../utils/rutas');
const { registrarRutas } = require('./ipc');
const { iniciarRecordatorios } = require('./recordatorios');

const MODO_DEV = process.argv.includes('--dev');

// Nombre de la app en las notificaciones de Windows
if (process.platform === 'win32') app.setAppUserModelId('mx.madil.agendabufete');

function crearVentana() {
  const ventana = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1280,
    minHeight: 700,
    title: 'Agenda de Bufete Jurídico',
    backgroundColor: '#F2F6FD',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // la vista no tiene acceso directo a Node
      nodeIntegration: false,
      sandbox: true,
    },
  });

  ventana.removeMenu();
  ventana.loadFile(path.join(__dirname, '..', 'views', 'login.html'));
  ventana.once('ready-to-show', () => { ventana.maximize(); ventana.show(); });
  if (MODO_DEV) ventana.webContents.openDevTools({ mode: 'detach' });
  return ventana;
}

app.whenReady().then(() => {
  // Datos del sistema en %APPDATA%\Agenda de Bufete Jurídico (base de datos, documentos y respaldos)
  rutas.fijarBase(app.getPath('userData'));
  db.abrir(rutas.baseDatos());
  registrarRutas();
  crearVentana();
  iniciarRecordatorios(); // revisa cada minuto si hay actividades o plazos que avisar
});

app.on('window-all-closed', () => {
  db.cerrar();
  app.quit();
});
