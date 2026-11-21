// "Rutas" del sistema: cada nombre llama a un método de un controlador (la "C" de MVC).
// Las vistas llaman window.api.llamar('modulo.accion', ...argumentos) y reciben
// { ok: true, datos } o { ok: false, mensaje }.
const { ipcMain, dialog, shell, BrowserWindow } = require('electron');
const Auth = require('../controllers/AuthController');
const Usuarios = require('../controllers/UsuarioController');
const Clientes = require('../controllers/ClienteController');
const Expedientes = require('../controllers/ExpedienteController');
const Agenda = require('../controllers/AgendaController');
const Radar = require('../controllers/RadarController');
const Panel = require('../controllers/PanelController');
const Respaldo = require('../controllers/RespaldoController');
const Reportes = require('../controllers/ReporteController');
const { mostrar } = require('../utils/fechas');
const { revisarPlazos, notificar } = require('./recordatorios');

const ventana = () => BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];

// Al iniciar sesión: respaldo automático del día (DFR 1.12), notificación de plazos
// urgentes (DFR 4.10) y datos para la ventana "Para hoy" (DFR 3.6)
function alIniciarSesion(usuario) {
  try { if (usuario.rol === 'Abogado') Respaldo.automaticoDelDia(); } catch (e) { console.error('Respaldo automático', e); }
  revisarPlazos(usuario, true);
  return { usuario, urgentes: Radar.urgentesDe(usuario), actividadesHoy: Agenda.delDia(usuario) };
}

const RUTAS = {
  // Sesión
  'auth.hayUsuarios': () => Auth.hayUsuarios(),
  'auth.crearPrimerAbogado': (d) => Auth.crearPrimerAbogado(d),
  'auth.iniciarSesion': (correo, contrasena, tipo) => {
    const u = Auth.iniciarSesion(correo, contrasena, tipo);
    return u.debe_cambiar_contrasena ? { usuario: u } : alIniciarSesion(u);
  },
  'auth.cerrarSesion': (motivo) => Auth.cerrarSesion(motivo),
  'auth.sesionActual': () => Auth.sesionActual(),
  'auth.cambiarContrasena': (d) => Auth.cambiarContrasena(d),

  // Usuarios
  'usuarios.listar': (f) => Usuarios.listar(f),
  'usuarios.activos': () => Usuarios.activos(),
  'usuarios.registrar': (d) => Usuarios.registrar(d),
  'usuarios.modificar': (id, d) => Usuarios.modificar(id, d),
  'usuarios.darDeBaja': (id, a) => Usuarios.darDeBaja(id, a),
  'usuarios.reactivar': (id) => Usuarios.reactivar(id),
  'usuarios.restablecer': (id, d) => Usuarios.restablecerContrasena(id, d),
  'usuarios.pendientes': (id) => Usuarios.pendientes(id),

  // Clientes
  'clientes.listar': (f) => Clientes.listar(f),
  'clientes.consultar': (id) => Clientes.consultar(id),
  'clientes.confirmados': () => Clientes.confirmados(),
  'clientes.registrar': (d, forzar) => Clientes.registrar(d, forzar),
  'clientes.modificar': (id, d) => Clientes.modificar(id, d),
  'clientes.eliminar': (id) => Clientes.eliminar(id),
  'clientes.confirmar': (id) => Clientes.confirmar(id),
  'clientes.devolver': (id, obs) => Clientes.devolver(id, obs),

  // Expedientes
  'expedientes.listar': (f) => Expedientes.listar(f),
  'expedientes.activos': () => Expedientes.activos(),
  'expedientes.consultar': (id) => Expedientes.consultar(id),
  'expedientes.registrar': (d) => Expedientes.registrar(d),
  'expedientes.modificar': (id, d) => Expedientes.modificar(id, d),
  'expedientes.registrarJuzgado': (id, d) => Expedientes.registrarJuzgado(id, d),
  'expedientes.subirDocumento': (id, d) => Expedientes.subirDocumento(id, d),
  'expedientes.autorizarDocumento': (id) => Expedientes.autorizarDocumento(id),
  'expedientes.rechazarDocumento': (id, m) => Expedientes.rechazarDocumento(id, m),
  'expedientes.abrirDocumento': async (id) => {
    const error = await shell.openPath(Expedientes.rutaDocumento(id));
    if (error) throw Object.assign(new Error('No se pudo abrir el documento con el programa del equipo.'), { esDeUsuario: true });
    return true;
  },
  'expedientes.registrarActuacion': (id, d) => Expedientes.registrarActuacion(id, d),
  'expedientes.concluir': (id, d) => Expedientes.concluir(id, d),

  // Agenda
  'agenda.rango': (desde, hasta, f) => Agenda.rango(desde, hasta, f),
  'agenda.detalle': (id) => Agenda.detalle(id),
  'agenda.registrar': (d, forzar) => Agenda.registrar(d, forzar),
  'agenda.modificar': (id, d, forzar) => Agenda.modificar(id, d, forzar),
  'agenda.cancelar': (id, m) => Agenda.cancelar(id, m),
  'agenda.registrarResultado': (id, r) => Agenda.registrarResultado(id, r),

  // Radar
  'radar.listar': (f) => Radar.listar(f),
  'radar.calcular': (fecha, dias) => Radar.calcular(fecha, dias),
  'radar.registrar': (d) => Radar.registrar(d),
  'radar.modificar': (id, d) => Radar.modificar(id, d),
  'radar.atender': (id, d) => Radar.atender(id, d),
  'radar.inhabiles': (anio) => Radar.inhabiles(anio),
  'radar.registrarInhabil': (d) => Radar.registrarInhabil(d),
  'radar.eliminarInhabil': (id) => Radar.eliminarInhabil(id),

  // Panel y avisos
  'panel.resumen': () => Panel.resumen(),
  'panel.avisos': () => Panel.avisos(),
  'panel.marcarAvisoLeido': (id) => Panel.marcarAvisoLeido(id),

  // Respaldo y reportes
  'respaldo.estado': () => Respaldo.estado(),
  'respaldo.manual': (carpeta) => Respaldo.manual(carpeta),
  'respaldo.restaurar': (carpeta) => Respaldo.restaurar(carpeta),
  'reportes.generar': async (d) => {
    const r = await Reportes.generar(d);
    if (!r.necesitaRuta) return r;
    const ext = d.formato === 'PDF' ? 'pdf' : 'xlsx';
    const { canceled, filePath } = await dialog.showSaveDialog(ventana(), {
      title: 'Guardar reporte', defaultPath: `${d.tipo}.${ext}`, filters: [{ name: d.formato, extensions: [ext] }],
    });
    if (canceled) return { cancelado: true };
    const hecho = await Reportes.generar({ ...d, ruta: filePath });
    shell.openPath(filePath);
    return hecho;
  },

  // Utilidades del sistema operativo
  'sistema.elegirArchivo': async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(ventana(), {
      properties: ['openFile'], filters: [{ name: 'Documentos', extensions: ['pdf', 'docx', 'jpg', 'jpeg', 'png'] }],
    });
    return canceled ? null : filePaths[0];
  },
  'sistema.elegirCarpeta': async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(ventana(), { properties: ['openDirectory', 'createDirectory'] });
    return canceled ? null : filePaths[0];
  },
  'sistema.notificar': (titulo, cuerpo) => notificar(titulo, cuerpo),
  'sistema.fecha': (f) => mostrar(f),
};

function registrarRutas() {
  ipcMain.handle('api', async (_evento, ruta, args = []) => {
    const fn = RUTAS[ruta];
    if (!fn) return { ok: false, mensaje: `Ruta desconocida: ${ruta}` };
    try {
      return { ok: true, datos: await fn(...args) };
    } catch (error) {
      if (error.esDeUsuario) return { ok: false, mensaje: error.message };
      console.error(`[${ruta}]`, error);
      return { ok: false, mensaje: 'Ocurrió un error inesperado. Intenta de nuevo.' };
    }
  });
}

module.exports = { registrarRutas, RUTAS };
