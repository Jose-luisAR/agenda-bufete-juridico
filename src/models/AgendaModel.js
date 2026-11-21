// Modelo de actividades de la agenda (DFR 3.1 a 3.5).
const { todos, uno, ejecutar } = require('../database/connection');
const { CLIENTES } = require('./AsuntoModel');

const SELECT = `SELECT t.*, u.nombre || ' ' || u.apellido_paterno AS responsable,
    IFNULL(a.numero_expediente, a.folio) AS expediente, ${CLIENTES} AS clientes
  FROM actividades t JOIN usuarios u ON u.id = t.responsable_id LEFT JOIN asuntos a ON a.id = t.asunto_id`;

const AgendaModel = {
  entreFechas: (desde, hasta, { tipo = '', responsableId = '' } = {}) => todos(`${SELECT}
    WHERE t.fecha BETWEEN ? AND ? AND t.estado <> 'Cancelada'
      AND (? = '' OR t.tipo = ?) AND (? = '' OR t.responsable_id = ?)
    ORDER BY t.fecha, t.hora_inicio`, desde, hasta, tipo, tipo, String(responsableId), String(responsableId)),

  delDia: (fecha, responsableId = null) => todos(`${SELECT}
    WHERE t.fecha = ? AND t.estado <> 'Cancelada' AND (? IS NULL OR t.responsable_id = ?)
    ORDER BY t.hora_inicio`, fecha, responsableId, responsableId),

  buscarPorId: (id) => uno(`${SELECT} WHERE t.id = ?`, id),

  choque: (responsableId, fecha, hora, excluirId = 0) => !!uno(`SELECT id FROM actividades
    WHERE responsable_id = ? AND fecha = ? AND hora_inicio = ? AND estado = 'Programada' AND id <> ?`,
  responsableId, fecha, hora, excluirId),

  crear(t) {
    return ejecutar(`INSERT INTO actividades (tipo, titulo, fecha, hora_inicio, hora_fin, lugar, asunto_id, responsable_id, notas, creado_por)
      VALUES (:tipo, :titulo, :fecha, :hora_inicio, :hora_fin, :lugar, :asunto_id, :responsable_id, :notas, :creado_por)`, t).lastInsertRowid;
  },

  modificar(id, t) {
    ejecutar(`UPDATE actividades SET tipo = :tipo, titulo = :titulo, fecha = :fecha, hora_inicio = :hora_inicio,
      hora_fin = :hora_fin, lugar = :lugar, asunto_id = :asunto_id, responsable_id = :responsable_id, notas = :notas
      WHERE id = :id`, { ...t, id });
  },

  cancelar: (id, motivo) => ejecutar("UPDATE actividades SET estado = 'Cancelada', motivo_cancelacion = ? WHERE id = ?", motivo, id),
  registrarResultado: (id, resultado) => ejecutar("UPDATE actividades SET estado = 'Realizada', resultado = ? WHERE id = ?", resultado, id),

  contarHoy: (fecha, tipo = null, responsableId = null) => uno(`SELECT COUNT(*) AS n FROM actividades
    WHERE fecha = ? AND estado <> 'Cancelada' AND (? IS NULL OR tipo = ?) AND (? IS NULL OR responsable_id = ?)`,
  fecha, tipo, tipo, responsableId, responsableId).n,
};

module.exports = AgendaModel;
