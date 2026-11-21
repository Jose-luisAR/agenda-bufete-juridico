// Expedientes: asuntos, juzgado, documentos, actuaciones y conclusión (DFR 2.7 a 2.15).
const fs = require('fs');
const path = require('path');
const AsuntoModel = require('../models/AsuntoModel');
const PlazoModel = require('../models/PlazoModel');
const AvisoModel = require('../models/AvisoModel');
const UsuarioModel = require('../models/UsuarioModel');
const BitacoraModel = require('../models/BitacoraModel');
const Auth = require('./AuthController');
const rutas = require('../utils/rutas');
const { hoy } = require('../utils/fechas');
const { validar, exigir, limpiar, ErrorDeUsuario } = require('../utils/validaciones');
const { transaccion } = require('../database/connection');

const TIPOS_ASUNTO = ['Divorcio voluntario', 'Pensión alimenticia', 'Rectificación de acta',
  'Juicio sucesorio intestamentario', 'Cobro de pagaré', 'Otro'];
const EXTENSIONES = ['.pdf', '.docx', '.jpg', '.jpeg', '.png'];
const MAX_BYTES = 20 * 1024 * 1024;

// Revisa los datos obligatorios de un asunto (clientes, tipo, materia, descripción y abogado)
function validarAsunto(d) {
  exigir(
    validar.opcion(d.tipo_asunto, TIPOS_ASUNTO, 'el tipo de asunto'),
    validar.opcion(d.materia, ['Familiar', 'Civil', 'Mercantil'], 'la materia'),
    validar.obligatorio(d.descripcion, 'Descripción del asunto'),
    validar.obligatorio(d.abogado_id, 'Abogado responsable'),
  );
}

// Un expediente concluido ya no se puede modificar, solo consultar
function exigirAbierto(asunto) {
  if (!asunto) throw new ErrorDeUsuario('El expediente no existe.');
  if (asunto.estado === 'Concluido') throw new ErrorDeUsuario('El expediente está concluido: solo se puede consultar.');
}

const ExpedienteController = {
  TIPOS_ASUNTO,

  // DFR 2.8 Consultar expedientes con filtros
  listar(filtros = {}) {
    const s = Auth.exigirSesion();
    // El panel del Pasante abre "sus expedientes asignados"
    if (filtros.mios && s.rol === 'Pasante') filtros.pasanteId = s.id;
    return AsuntoModel.listar(filtros);
  },

  // Expedientes En preparación o En trámite (para los selectores de agenda y radar)
  activos() {
    Auth.exigirSesion();
    return AsuntoModel.activos();
  },

  // Detalle completo de un expediente: clientes, documentos, actuaciones, actividades y plazos
  consultar(id) {
    Auth.exigirSesion();
    const asunto = AsuntoModel.buscarPorId(id);
    if (!asunto) throw new ErrorDeUsuario('No se encontró el expediente.');
    return {
      asunto,
      clientes: AsuntoModel.clientesDe(id),
      documentos: AsuntoModel.documentos(id),
      actuaciones: AsuntoModel.actuaciones(id),
      plazos: require('./RadarController').enriquecer(PlazoModel.deAsunto(id)),
    };
  },

  // DFR 2.7 Registrar asuntos: se crea con folio AS-AAAA-NNNN y estado En preparación
  registrar(datos) {
    const s = Auth.exigirSesion();
    const d = limpiar(datos);
    const clientes = (d.clientes || []).map(Number).filter(Boolean);
    if (!clientes.length) throw new ErrorDeUsuario('Elija al menos un cliente confirmado.');
    validarAsunto(d);
    const folio = transaccion(() => {
      const f = AsuntoModel.siguienteFolio(new Date().getFullYear());
      AsuntoModel.crear({ ...d, folio: f, pasante_id: d.pasante_id || null }, clientes);
      return f;
    });
    BitacoraModel.registrar(s.id, 'Registro de asunto', folio);
    return `El asunto se registró con el folio ${folio}.`;
  },

  // DFR 2.9 Modificar asuntos
  modificar(id, datos) {
    Auth.exigirRol('Abogado');
    exigirAbierto(AsuntoModel.buscarPorId(id));
    const d = limpiar(datos);
    validarAsunto(d);
    AsuntoModel.modificar(id, { ...d, pasante_id: d.pasante_id || null });
    return 'Los datos del asunto se modificaron exitosamente.';
  },

  // DFR 2.10 Al presentar la demanda se capturan el número de expediente y el juzgado; el asunto pasa a En trámite
  registrarJuzgado(id, datos) {
    Auth.exigirSesion();
    const a = AsuntoModel.buscarPorId(id);
    exigirAbierto(a);
    const d = limpiar(datos);
    exigir(
      validar.obligatorio(d.numero_expediente, 'Número de expediente'),
      validar.obligatorio(d.juzgado, 'Juzgado'),
      validar.fecha(d.fecha_presentacion, 'fecha de presentación'),
    );
    if (d.fecha_presentacion > hoy()) throw new ErrorDeUsuario('La fecha de presentación no puede ser posterior a hoy.');
    if (AsuntoModel.numeroEnUso(d.numero_expediente, d.juzgado, id)) {
      throw new ErrorDeUsuario('Ese número de expediente ya está registrado en el juzgado seleccionado.');
    }
    AsuntoModel.registrarJuzgado(id, d);
    return 'El número de expediente se registró exitosamente.';
  },

  // Copia el archivo elegido a la carpeta de documentos del expediente (máximo 20 MB, solo PDF, Word o imagen)
  guardarArchivo(asuntoId, rutaOrigen, tipo, descripcion, s) {
    const ext = path.extname(rutaOrigen).toLowerCase();
    if (!EXTENSIONES.includes(ext)) throw new ErrorDeUsuario('Solo se aceptan archivos PDF, Word (.docx), JPG o PNG.');
    if (fs.statSync(rutaOrigen).size > MAX_BYTES) throw new ErrorDeUsuario('El archivo pesa más de 20 MB.');
    const nombre = path.basename(rutaOrigen);
    const destino = path.join(rutas.documentos(asuntoId), `${Date.now()}_${nombre}`);
    fs.copyFileSync(rutaOrigen, destino);
    // Se guarda la ruta relativa a la carpeta de datos, así el respaldo sirve en otro equipo
    return AsuntoModel.crearDocumento({
      asunto_id: asuntoId, nombre_archivo: nombre, ruta: path.relative(rutas.base(), destino), tipo_documento: tipo, descripcion,
      estado: s.rol === 'Abogado' ? 'Autorizado' : 'Pendiente', subido_por: s.id,
    });
  },

  // DFR 2.11 Subir documentos. Si lo sube el Abogado queda Autorizado; si lo sube un Pasante queda Pendiente de revisión
  subirDocumento(asuntoId, { ruta, tipo_documento, descripcion } = {}) {
    const s = Auth.exigirSesion();
    exigirAbierto(AsuntoModel.buscarPorId(asuntoId));
    if (!ruta) throw new ErrorDeUsuario('Elija el archivo que desea subir.');
    exigir(validar.opcion(tipo_documento, ['Evidencia', 'Escrito', 'Acuse', 'Resolución'], 'el tipo de documento'));
    ExpedienteController.guardarArchivo(asuntoId, ruta, tipo_documento, descripcion || null, s);
    if (s.rol === 'Pasante') {
      UsuarioModel.abogadosActivos().forEach((a) => AvisoModel.crear(a.id, `Documento por autorizar: ${path.basename(ruta)}`, 'expediente', asuntoId));
    }
    return 'El documento se subió exitosamente.';
  },

  // DFR 2.12 El Abogado autoriza un documento subido por un Pasante
  autorizarDocumento(id) {
    const s = Auth.exigirRol('Abogado');
    const d = AsuntoModel.documento(id);
    if (!d || d.estado !== 'Pendiente') throw new ErrorDeUsuario('El documento ya fue revisado.');
    AsuntoModel.revisarDocumento(id, 'Autorizado', s.id);
    AvisoModel.crear(d.subido_por, `Se autorizó ${d.nombre_archivo}`, 'expediente', d.asunto_id);
    BitacoraModel.registrar(s.id, 'Autorización de documento', d.nombre_archivo);
    return 'El documento se autorizó.';
  },

  // DFR 2.13 El Abogado rechaza un documento y escribe el motivo; se avisa a quien lo subió
  rechazarDocumento(id, motivo) {
    const s = Auth.exigirRol('Abogado');
    if (!motivo || !motivo.trim()) throw new ErrorDeUsuario('Escriba el motivo del rechazo.');
    const d = AsuntoModel.documento(id);
    if (!d || d.estado !== 'Pendiente') throw new ErrorDeUsuario('El documento ya fue revisado.');
    AsuntoModel.revisarDocumento(id, 'Rechazado', s.id, motivo.trim());
    AvisoModel.crear(d.subido_por, `Se rechazó ${d.nombre_archivo}: ${motivo.trim()}`, 'expediente', d.asunto_id);
    BitacoraModel.registrar(s.id, 'Rechazo de documento', `${d.nombre_archivo}: ${motivo.trim()}`);
    return 'El documento se rechazó.';
  },

  // Ruta del archivo en el equipo para abrirlo con el programa que corresponda
  rutaDocumento(id) {
    Auth.exigirSesion();
    const d = AsuntoModel.documento(id);
    const ruta = d ? path.join(rutas.base(), d.ruta) : '';
    if (!d || !fs.existsSync(ruta)) throw new ErrorDeUsuario('No se encontró el archivo del documento.');
    return ruta;
  },

  // DFR 2.14 Registrar actuaciones: lo que va pasando en el juicio (acuerdos, audiencias, notificaciones)
  registrarActuacion(asuntoId, datos) {
    const s = Auth.exigirSesion();
    const a = AsuntoModel.buscarPorId(asuntoId);
    if (!a || a.estado !== 'En trámite') throw new ErrorDeUsuario('Solo se pueden registrar actuaciones en expedientes En trámite.');
    const d = limpiar(datos);
    exigir(
      validar.fecha(d.fecha, 'fecha de la actuación'),
      validar.opcion(d.tipo, ['Notificación', 'Acuerdo', 'Audiencia celebrada', 'Sentencia', 'Otra'], 'el tipo de actuación'),
      validar.obligatorio(d.descripcion, 'Descripción'),
    );
    if (d.fecha > hoy()) throw new ErrorDeUsuario('La fecha de la actuación no puede ser posterior a hoy.');
    transaccion(() => {
      const docId = d.archivo ? ExpedienteController.guardarArchivo(asuntoId, d.archivo, 'Resolución', d.descripcion, s) : null;
      AsuntoModel.crearActuacion({ ...d, asunto_id: asuntoId, documento_id: docId, registrado_por: s.id });
    });
    return 'La actuación se registró exitosamente.';
  },

  // DFR 2.15 Concluir expedientes: no se permite si quedan plazos o actividades pendientes
  concluir(id, datos) {
    const s = Auth.exigirRol('Abogado');
    const a = AsuntoModel.buscarPorId(id);
    exigirAbierto(a);
    const d = limpiar(datos);
    exigir(
      validar.fecha(d.fecha_conclusion, 'fecha de conclusión'),
      validar.opcion(d.motivo_conclusion, ['Sentencia', 'Convenio', 'Desistimiento', 'Otro'], 'el motivo'),
    );
    const p = AsuntoModel.pendientesParaConcluir(id);
    if (p.documentos || p.plazos) {
      throw new ErrorDeUsuario(`No se puede concluir: hay ${p.documentos} documentos pendientes y ${p.plazos} plazos sin atender.`);
    }
    AsuntoModel.concluir(id, d);
    BitacoraModel.registrar(s.id, 'Conclusión de expediente', a.numero_expediente || a.folio);
    return 'El expediente se concluyó exitosamente.';
  },
};

module.exports = ExpedienteController;
