// Respaldos y restauración (DFR 1.11 a 1.13).
// El respaldo es una carpeta respaldo_AAAA-MM-DD_HHMM con la base de datos y los documentos.
const fs = require('fs');
const path = require('path');
const db = require('../database/connection');
const BitacoraModel = require('../models/BitacoraModel');
const Auth = require('./AuthController');
const rutas = require('../utils/rutas');
const { ErrorDeUsuario } = require('../utils/validaciones');
const { hoy: hoyLocal } = require('../utils/fechas');
const { clave } = require('../utils/diasHabiles');

const MAX_AUTOMATICOS = 7;

// Nombre de la carpeta del respaldo: respaldo_AAAA-MM-DD_HHMM
function nombreRespaldo() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `respaldo_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

// Copia la base de datos (VACUUM INTO) y la carpeta de documentos al destino elegido
function generarEn(carpetaDestino) {
  const destino = path.join(carpetaDestino, nombreRespaldo());
  fs.mkdirSync(destino, { recursive: true });
  const archivo = path.join(destino, 'agenda.db');
  db.obtener().prepare('VACUUM INTO ?').run(archivo);
  if (fs.existsSync(rutas.carpetaDocumentos())) {
    fs.cpSync(rutas.carpetaDocumentos(), path.join(destino, 'documentos'), { recursive: true });
  }
  return destino;
}

// Guarda en la tabla configuracion la fecha del último respaldo
const guardarConfig = (clave, valor) =>
  db.ejecutar('INSERT INTO configuracion (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor', clave, valor);

const RespaldoController = {
  // Fechas del último respaldo manual y automático para la pantalla de Respaldo
  estado() {
    Auth.exigirRol('Abogado');
    const leer = (c) => (db.uno('SELECT valor FROM configuracion WHERE clave = ?', c) || {}).valor || null;
    return {
      ultimoManual: leer('ultimo_respaldo_manual'),
      ultimoAutomatico: leer('ultimo_respaldo_automatico'),
      carpetaAutomaticos: rutas.respaldos(),
    };
  },

  // DFR 1.11 Respaldo manual en la carpeta que elija el Abogado (memoria USB o disco externo)
  manual(carpeta) {
    const s = Auth.exigirRol('Abogado');
    if (!carpeta) throw new ErrorDeUsuario('Elija la carpeta o unidad donde se guardará el respaldo.');
    let destino;
    try {
      destino = generarEn(carpeta);
    } catch (e) {
      throw new ErrorDeUsuario('No fue posible guardar el respaldo en la ubicación seleccionada.');
    }
    guardarConfig('ultimo_respaldo_manual', new Date().toISOString());
    BitacoraModel.registrar(s.id, 'Respaldo manual', destino);
    return `El respaldo se generó exitosamente en ${destino}.`;
  },

  // DFR 1.12 Respaldo automático: uno al día, al primer inicio de sesión del Abogado; se conservan los últimos 7
  automaticoDelDia() {
    const ultimo = db.uno("SELECT valor FROM configuracion WHERE clave = 'ultimo_respaldo_automatico'");
    if (ultimo && clave(new Date(ultimo.valor)) === hoyLocal()) return null; // fecha local, no UTC
    generarEn(rutas.respaldos());
    guardarConfig('ultimo_respaldo_automatico', new Date().toISOString());
    const carpetas = fs.readdirSync(rutas.respaldos()).filter((n) => n.startsWith('respaldo_')).sort();
    carpetas.slice(0, Math.max(0, carpetas.length - MAX_AUTOMATICOS))
      .forEach((n) => fs.rmSync(path.join(rutas.respaldos(), n), { recursive: true, force: true }));
    return true;
  },

  // DFR 1.13 Restaurar información: reemplaza la base de datos y los documentos por los del respaldo
  restaurar(carpetaRespaldo) {
    const s = Auth.exigirRol('Abogado');
    const archivo = path.join(carpetaRespaldo || '', 'agenda.db');
    if (!carpetaRespaldo || !fs.existsSync(archivo)) throw new ErrorDeUsuario('Elija una carpeta de respaldo válida (debe contener agenda.db).');
    generarEn(rutas.respaldos());
    BitacoraModel.registrar(s.id, 'Restauración de información', carpetaRespaldo);
    db.cerrar();
    for (const ext of ['', '-wal', '-shm']) fs.rmSync(rutas.baseDatos() + ext, { force: true });
    fs.copyFileSync(archivo, rutas.baseDatos());
    if (fs.existsSync(path.join(carpetaRespaldo, 'documentos'))) {
      fs.rmSync(rutas.carpetaDocumentos(), { recursive: true, force: true });
      fs.cpSync(path.join(carpetaRespaldo, 'documentos'), rutas.carpetaDocumentos(), { recursive: true });
    }
    db.abrir(rutas.baseDatos());
    Auth.cerrarSesion('Cierre de sesión por restauración');
    return 'La información se restauró. Inicie sesión de nuevo.';
  },
};

module.exports = RespaldoController;
