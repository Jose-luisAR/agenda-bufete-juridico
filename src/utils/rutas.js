// Carpetas de datos del sistema. El proceso principal fija la base al iniciar
// (en Windows: %APPDATA%\Agenda de Bufete Jurídico).
const path = require('path');
const fs = require('fs');

// Carpeta base; en pruebas se usa una carpeta temporal
let base = path.join(require('os').tmpdir(), 'agenda-bufete-juridico');

const rutas = {
  // La fija main.js al iniciar con la carpeta de datos de la aplicación
  fijarBase: (carpeta) => { base = carpeta; },
  base: () => base,
  // Archivo de la base de datos SQLite
  baseDatos: () => path.join(base, 'agenda.db'),
  // Carpeta de documentos de un expediente (documentos/<id del asunto>); se crea si no existe
  documentos: (asuntoId) => {
    const carpeta = path.join(base, 'documentos', String(asuntoId));
    fs.mkdirSync(carpeta, { recursive: true });
    return carpeta;
  },
  carpetaDocumentos: () => path.join(base, 'documentos'),
  // Carpeta de los respaldos automáticos
  respaldos: () => {
    const carpeta = path.join(base, 'Respaldos');
    fs.mkdirSync(carpeta, { recursive: true });
    return carpeta;
  },
};

module.exports = rutas;
