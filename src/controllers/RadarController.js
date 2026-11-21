// Radar de vencimientos: plazos y días inhábiles (DFR 4.1 a 4.10).
const PlazoModel = require('../models/PlazoModel');
const AsuntoModel = require('../models/AsuntoModel');
const Auth = require('./AuthController');
const { calcularVencimiento, diasRestantes, semaforo, textoFaltan, clave } = require('../utils/diasHabiles');
const { hoy, aFecha, mostrar, conjuntoInhabiles } = require('../utils/fechas');
const { validar, exigir, limpiar, ErrorDeUsuario } = require('../utils/validaciones');
const { transaccion } = require('../database/connection');

// Conjunto con todos los días inhábiles registrados (para no contarlos como días hábiles)
const inhabiles = () => conjuntoInhabiles(PlazoModel.inhabiles());

// A cada plazo le agrega cuántos días hábiles faltan, el texto "Hoy / n días / Vencido" y su prioridad (semáforo)
function enriquecer(plazos) {
  const inh = inhabiles();
  const h = aFecha(hoy());
  return plazos.map((p) => {
    if (p.estado !== 'Pendiente') return { ...p, faltan: '', prioridad: null };
    const dias = diasRestantes(h, aFecha(p.fecha_vencimiento), inh);
    return { ...p, dias, faltan: textoFaltan(dias), prioridad: semaforo(dias) };
  });
}

// DFR 4.6 Calcular fecha de vencimiento: suma días hábiles a la fecha de notificación sin contar fines de semana ni inhábiles
function calcularFecha(fechaNotificacion, dias) {
  return clave(calcularVencimiento(aFecha(fechaNotificacion), Number(dias), inhabiles()));
}

// Cuando se registra o elimina un día inhábil, se vuelven a calcular los vencimientos de los plazos pendientes
function recalcularPendientes() {
  let cambiados = 0;
  for (const p of PlazoModel.pendientes()) {
    if (p.fecha_exacta || !p.dias_habiles) continue;
    const nueva = calcularFecha(p.fecha_notificacion, p.dias_habiles);
    if (nueva !== p.fecha_vencimiento) { PlazoModel.actualizarVencimiento(p.id, nueva); cambiados++; }
  }
  return cambiados;
}

// Revisa los datos de un plazo: se llena el número de días hábiles o la fecha exacta, no los dos
function validarPlazo(d) {
  exigir(
    validar.obligatorio(d.actuacion_pendiente, 'Actuación pendiente'),
    validar.fecha(d.fecha_notificacion, 'fecha de notificación'),
    validar.obligatorio(d.responsable_id, 'Responsable'),
  );
  const conDias = d.dias_habiles !== undefined && d.dias_habiles !== null && String(d.dias_habiles) !== '';
  const conFecha = !!d.fecha_vencimiento;
  if (conDias === conFecha) throw new ErrorDeUsuario('Llene los días hábiles del plazo o la fecha exacta de vencimiento, no los dos.');
  if (conDias) {
    if (!/^\d+$/.test(String(d.dias_habiles)) || Number(d.dias_habiles) < 1) throw new ErrorDeUsuario('Los días hábiles deben ser un número entero mayor que cero.');
    d.dias_habiles = Number(d.dias_habiles);
    d.fecha_vencimiento = calcularFecha(d.fecha_notificacion, d.dias_habiles);
    d.fecha_exacta = 0;
  } else {
    exigir(validar.fecha(d.fecha_vencimiento, 'fecha de vencimiento'));
    d.dias_habiles = null;
    d.fecha_exacta = 1;
  }
}

const RadarController = {
  enriquecer,

  // DFR 4.8 Consultar radar: plazos pendientes ordenados por urgencia y el resumen Urgente / Próximos / En tiempo
  listar({ prioridad = '', responsableId = '', asuntoId = '' } = {}) {
    Auth.exigirSesion();
    const todos = enriquecer(PlazoModel.pendientes({ responsableId, asuntoId }));
    const resumen = { Urgente: 0, Próximo: 0, 'En tiempo': 0 };
    todos.forEach((p) => { resumen[p.prioridad.etiqueta]++; });
    return { resumen, plazos: prioridad ? todos.filter((p) => p.prioridad.etiqueta === prioridad) : todos };
  },

  // Calcula la fecha de vencimiento para mostrarla en la ventana antes de guardar
  calcular(fechaNotificacion, dias) {
    Auth.exigirSesion();
    exigir(validar.fecha(fechaNotificacion, 'fecha de notificación'));
    if (!/^\d+$/.test(String(dias)) || Number(dias) < 1) return null;
    return calcularFecha(fechaNotificacion, dias);
  },

  // DFR 4.4 Registrar plazos
  registrar(datos) {
    const s = Auth.exigirSesion();
    const d = limpiar(datos);
    const asunto = AsuntoModel.buscarPorId(d.asunto_id);
    if (!asunto || asunto.estado !== 'En trámite') throw new ErrorDeUsuario('Solo se registran plazos en expedientes En trámite.');
    validarPlazo(d);
    d.registrado_por = s.id;
    PlazoModel.crear(d);
    return `El plazo se registró; vence el ${mostrar(d.fecha_vencimiento)}.`;
  },

  // DFR 4.5 Modificar plazos
  modificar(id, datos) {
    Auth.exigirRol('Abogado');
    const actual = PlazoModel.buscarPorId(id);
    if (!actual || actual.estado !== 'Pendiente') throw new ErrorDeUsuario('No se pueden modificar plazos atendidos.');
    const d = limpiar(datos);
    validarPlazo(d);
    PlazoModel.modificar(id, d);
    return `El plazo se modificó; vence el ${mostrar(d.fecha_vencimiento)}.`;
  },

  // DFR 4.9 Marcar plazo como atendido (a tiempo o fuera de tiempo), con archivo de soporte opcional
  atender(id, { fecha_atendido, archivo } = {}) {
    const s = Auth.exigirSesion();
    const p = PlazoModel.buscarPorId(id);
    if (!p || p.estado !== 'Pendiente') throw new ErrorDeUsuario('El plazo ya fue atendido.');
    exigir(validar.fecha(fecha_atendido, 'fecha en que se atendió'));
    if (fecha_atendido > hoy()) throw new ErrorDeUsuario('La fecha en que se atendió no puede ser posterior a hoy.');
    transaccion(() => {
      let docId = null;
      if (archivo) docId = require('./ExpedienteController').guardarArchivo(p.asunto_id, archivo, 'Acuse', `Soporte: ${p.actuacion_pendiente}`, s);
      PlazoModel.atender(id, fecha_atendido > p.fecha_vencimiento ? 'Atendido fuera de tiempo' : 'Atendido', fecha_atendido, docId);
    });
    return 'El plazo se marcó como atendido.';
  },

  // DFR 4.2 Consultar días inhábiles de un año
  inhabiles(anio) {
    Auth.exigirSesion();
    return PlazoModel.inhabilesDelAnio(anio || new Date().getFullYear());
  },

  // DFR 4.1 Registrar días inhábiles o periodos (por ejemplo vacaciones del tribunal)
  registrarInhabil(datos) {
    Auth.exigirRol('Abogado');
    const d = limpiar(datos);
    exigir(validar.fecha(d.fecha_inicio, 'fecha de inicio'), validar.obligatorio(d.descripcion, 'Descripción'));
    if (d.fecha_fin) {
      exigir(validar.fecha(d.fecha_fin, 'fecha de fin'));
      if (d.fecha_fin < d.fecha_inicio) throw new ErrorDeUsuario('La fecha de fin no puede ser anterior a la fecha de inicio.');
    }
    PlazoModel.crearInhabil(d);
    const n = recalcularPendientes();
    return 'Los días inhábiles se registraron exitosamente.' + (n ? ` Se actualizó la fecha de vencimiento de ${n} plazos.` : '');
  },

  // DFR 4.3 Eliminar días inhábiles (los oficiales de la ley no se pueden eliminar)
  eliminarInhabil(id) {
    Auth.exigirRol('Abogado');
    PlazoModel.eliminarInhabil(id);
    const n = recalcularPendientes();
    return 'El día inhábil se eliminó.' + (n ? ` Se actualizó la fecha de vencimiento de ${n} plazos.` : '');
  },

  // DFR 4.10 Plazos urgentes del usuario: el Abogado ve todos y el Pasante solo los suyos
  urgentesDe(usuario) {
    const filtros = usuario.rol === 'Abogado' ? {} : { responsableId: usuario.id };
    return enriquecer(PlazoModel.pendientes(filtros)).filter((p) => p.prioridad.etiqueta === 'Urgente');
  },
};

module.exports = RadarController;
