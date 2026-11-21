// Agenda y actividades (DFR 3.1 a 3.5). Los vencimientos de los plazos aparecen solos.
const AgendaModel = require('../models/AgendaModel');
const AsuntoModel = require('../models/AsuntoModel');
const PlazoModel = require('../models/PlazoModel');
const AvisoModel = require('../models/AvisoModel');
const UsuarioModel = require('../models/UsuarioModel');
const Auth = require('./AuthController');
const { hoy, ahora, mostrar } = require('../utils/fechas');
const { validar, exigir, limpiar, ErrorDeUsuario } = require('../utils/validaciones');
const { transaccion } = require('../database/connection');

// Tipos de actividad que se pueden registrar en la agenda
const TIPOS = ['Audiencia', 'Cita con cliente', 'Diligencia'];

// Revisa los datos de una actividad: campos obligatorios, fecha no pasada, horas correctas y expediente activo
function validarActividad(d) {
  exigir(
    validar.opcion(d.tipo, TIPOS, 'el tipo de actividad'),
    validar.obligatorio(d.titulo, 'Título'),
    validar.fecha(d.fecha),
    validar.hora(d.hora_inicio, 'hora de inicio'),
    d.hora_fin ? validar.hora(d.hora_fin, 'hora de término') : null,
    validar.obligatorio(d.lugar, 'Lugar'),
    validar.obligatorio(d.responsable_id, 'Responsable'),
  );
  if (d.fecha < hoy()) throw new ErrorDeUsuario('La fecha no puede ser anterior a hoy.');
  if (d.hora_fin && d.hora_fin <= d.hora_inicio) throw new ErrorDeUsuario('La hora de término debe ser posterior a la hora de inicio.');
  if (d.tipo !== 'Cita con cliente' && !d.asunto_id) throw new ErrorDeUsuario('Elija el expediente de la audiencia o diligencia.');
  if (d.asunto_id) {
    const a = AsuntoModel.buscarPorId(d.asunto_id);
    if (!a || a.estado === 'Concluido') throw new ErrorDeUsuario('Solo se pueden elegir expedientes En preparación o En trámite.');
  }
}

// Texto de la actividad que se usa en avisos: "Audiencia: título, fecha a las hora en lugar"
const texto = (d) => `${d.tipo}: ${d.titulo}, ${mostrar(d.fecha)} a las ${d.hora_inicio} en ${d.lugar}`;

const AgendaController = {
  TIPOS,

  // DFR 3.2 Consultar agenda: actividades y vencimientos de plazos entre dos fechas, con filtros
  rango(desde, hasta, filtros = {}) {
    Auth.exigirSesion();
    const actividades = AgendaModel.entreFechas(desde, hasta, filtros).map((t) => ({
      ...t, sin_resultado: t.estado === 'Programada' && `${t.fecha} ${t.hora_inicio}` < ahora(),
    }));
    const vencimientos = (!filtros.tipo || filtros.tipo === 'Vencimiento')
      ? PlazoModel.entreFechas(desde, hasta).filter((p) => !filtros.responsableId || String(p.responsable_id) === String(filtros.responsableId))
      : [];
    return { actividades: filtros.tipo === 'Vencimiento' ? [] : actividades, vencimientos };
  },

  // Detalle de una actividad para la ventana que se abre al darle clic
  detalle(id) {
    Auth.exigirSesion();
    const t = AgendaModel.buscarPorId(id);
    if (!t) throw new ErrorDeUsuario('La actividad no existe.');
    return t;
  },

  // DFR 3.1 Registrar actividades. Si el responsable ya tiene algo a esa hora se pregunta antes de guardar (forzar = true)
  registrar(datos, forzar = false) {
    const s = Auth.exigirRol('Abogado');
    const d = limpiar(datos);
    validarActividad(d);
    if (!forzar && AgendaModel.choque(d.responsable_id, d.fecha, d.hora_inicio)) {
      const r = UsuarioModel.buscarPorId(d.responsable_id);
      return { confirmar: `${r.nombre} ${r.apellido_paterno} ya tiene una actividad a esa hora. ¿Desea guardarla de todos modos?` };
    }
    AgendaModel.crear({ ...d, creado_por: s.id });
    if (Number(d.responsable_id) !== s.id) AvisoModel.crear(d.responsable_id, `Actividad asignada: ${texto(d)}`, 'agenda');
    return { mensaje: 'La actividad se registró exitosamente.' };
  },

  // DFR 3.3 Modificar actividades programadas
  modificar(id, datos, forzar = false) {
    Auth.exigirRol('Abogado');
    const actual = AgendaModel.buscarPorId(id);
    if (!actual || actual.estado !== 'Programada') throw new ErrorDeUsuario('No se pueden modificar actividades realizadas o canceladas.');
    const d = limpiar(datos);
    validarActividad(d);
    if (!forzar && AgendaModel.choque(d.responsable_id, d.fecha, d.hora_inicio, id)) {
      return { confirmar: 'El responsable ya tiene una actividad a esa hora. ¿Desea guardarla de todos modos?' };
    }
    AgendaModel.modificar(id, d);
    if (String(actual.responsable_id) !== String(d.responsable_id)) AvisoModel.crear(d.responsable_id, `Actividad asignada: ${texto(d)}`, 'agenda');
    return { mensaje: 'La actividad se modificó exitosamente.' };
  },

  // DFR 3.4 Cancelar actividades con motivo; se avisa al responsable
  cancelar(id, motivo) {
    Auth.exigirRol('Abogado');
    if (!motivo || !motivo.trim()) throw new ErrorDeUsuario('Escriba el motivo de la cancelación.');
    const t = AgendaModel.buscarPorId(id);
    if (!t || t.estado !== 'Programada') throw new ErrorDeUsuario('La actividad ya no está programada.');
    AgendaModel.cancelar(id, motivo.trim());
    AvisoModel.crear(t.responsable_id, `Se canceló ${t.titulo}: ${motivo.trim()}`, 'agenda');
    return 'La actividad se canceló.';
  },

  // DFR 3.5 Registrar el resultado de una actividad que ya pasó; si tiene expediente también se guarda como actuación
  registrarResultado(id, resultado) {
    const s = Auth.exigirSesion();
    if (!resultado || !resultado.trim()) throw new ErrorDeUsuario('Escriba el resultado de la actividad.');
    const t = AgendaModel.buscarPorId(id);
    if (!t || t.estado !== 'Programada') throw new ErrorDeUsuario('La actividad no está programada.');
    if (s.rol !== 'Abogado' && t.responsable_id !== s.id) throw new ErrorDeUsuario('Solo el responsable o un Abogado pueden registrar el resultado.');
    if (`${t.fecha} ${t.hora_inicio}` > ahora()) throw new ErrorDeUsuario('Solo se registra el resultado de actividades que ya pasaron.');
    transaccion(() => {
      AgendaModel.registrarResultado(id, resultado.trim());
      if (t.asunto_id) {
        AsuntoModel.crearActuacion({ asunto_id: t.asunto_id, fecha: t.fecha, tipo: t.tipo === 'Audiencia' ? 'Audiencia celebrada' : 'Otra',
          descripcion: `${t.titulo}: ${resultado.trim()}`, registrado_por: s.id });
      }
    });
    return 'El resultado se registró exitosamente.';
  },

  // Actividades de hoy para la ventana "Para hoy" al iniciar sesión (DFR 3.6)
  delDia(usuario) {
    return AgendaModel.delDia(hoy(), usuario.rol === 'Abogado' ? null : usuario.id);
  },
};

module.exports = AgendaController;
