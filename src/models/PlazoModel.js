// Modelo de plazos y días inhábiles (DFR 4.1 a 4.9).
const { todos, uno, ejecutar } = require('../database/connection');
const { CLIENTES } = require('./AsuntoModel');

// Consulta base de plazos con el expediente, los clientes y el responsable
const SELECT = `SELECT p.*, IFNULL(a.numero_expediente, a.folio) AS expediente, a.tipo_asunto, ${CLIENTES} AS clientes,
    u.nombre || ' ' || u.apellido_paterno AS responsable
  FROM plazos p JOIN asuntos a ON a.id = p.asunto_id JOIN usuarios u ON u.id = p.responsable_id`;

const PlazoModel = {
  // Plazos pendientes, opcionalmente de un responsable o de un expediente
  pendientes: ({ responsableId = '', asuntoId = '' } = {}) => todos(`${SELECT}
    WHERE p.estado = 'Pendiente' AND (? = '' OR p.responsable_id = ?) AND (? = '' OR p.asunto_id = ?)
    ORDER BY p.fecha_vencimiento, p.id`, String(responsableId), String(responsableId), String(asuntoId), String(asuntoId)),

  // Todos los plazos de un expediente
  deAsunto: (asuntoId) => todos(`${SELECT} WHERE p.asunto_id = ? ORDER BY p.estado <> 'Pendiente', p.fecha_vencimiento`, asuntoId),

  // Un plazo por su id
  buscarPorId: (id) => uno(`${SELECT} WHERE p.id = ?`, id),

  // Plazos que vencen entre dos fechas (aparecen en la agenda como Vencimiento)
  entreFechas: (desde, hasta) => todos(`${SELECT}
    WHERE p.estado = 'Pendiente' AND p.fecha_vencimiento BETWEEN ? AND ? ORDER BY p.fecha_vencimiento`, desde, hasta),

  // Inserta un plazo nuevo
  crear(p) {
    return ejecutar(`INSERT INTO plazos (asunto_id, actuacion_pendiente, fecha_notificacion, dias_habiles, fecha_vencimiento,
        fecha_exacta, responsable_id, notas, registrado_por)
      VALUES (:asunto_id, :actuacion_pendiente, :fecha_notificacion, :dias_habiles, :fecha_vencimiento, :fecha_exacta,
        :responsable_id, :notas, :registrado_por)`, p).lastInsertRowid;
  },

  // Actualiza un plazo
  modificar(id, p) {
    ejecutar(`UPDATE plazos SET actuacion_pendiente = :actuacion_pendiente, fecha_notificacion = :fecha_notificacion,
      dias_habiles = :dias_habiles, fecha_vencimiento = :fecha_vencimiento, fecha_exacta = :fecha_exacta,
      responsable_id = :responsable_id, notas = :notas WHERE id = :id`, { ...p, id });
  },

  // Marca el plazo como Atendido o Atendido fuera de tiempo
  atender: (id, estado, fecha, documentoId) => ejecutar(`UPDATE plazos SET estado = ?, fecha_atendido = ?,
    documento_soporte_id = ? WHERE id = ?`, estado, fecha, documentoId, id),

  // Cambia la fecha de vencimiento (cuando se recalcula por un día inhábil nuevo)
  actualizarVencimiento: (id, fecha) => ejecutar('UPDATE plazos SET fecha_vencimiento = ? WHERE id = ?', fecha, id),

  // Todos los días inhábiles
  inhabiles: () => todos('SELECT * FROM dias_inhabiles ORDER BY fecha_inicio'),
  // Días inhábiles de un año (para la pestaña Días inhábiles)
  inhabilesDelAnio: (anio) => todos(`SELECT * FROM dias_inhabiles
    WHERE substr(fecha_inicio,1,4) = ? OR substr(IFNULL(fecha_fin, fecha_inicio),1,4) = ? ORDER BY fecha_inicio`, String(anio), String(anio)),
  // Un día inhábil por su id
  inhabil: (id) => uno('SELECT * FROM dias_inhabiles WHERE id = ?', id),
  // Registra un día o periodo inhábil
  crearInhabil: (d) => ejecutar(`INSERT INTO dias_inhabiles (fecha_inicio, fecha_fin, descripcion)
    VALUES (:fecha_inicio, :fecha_fin, :descripcion)`, d).lastInsertRowid,
  // Elimina un día inhábil
  eliminarInhabil: (id) => ejecutar('DELETE FROM dias_inhabiles WHERE id = ?', id),
};

module.exports = PlazoModel;
