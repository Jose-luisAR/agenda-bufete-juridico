// Modelo de asuntos/expedientes, documentos y actuaciones (DFR 2.7 a 2.15).
const { todos, uno, ejecutar } = require('../database/connection');
const { NOMBRE } = require('./ClienteModel');

// Subconsulta que junta los nombres de los clientes de un asunto en un solo texto
const CLIENTES = `(SELECT GROUP_CONCAT(${NOMBRE}, ', ') FROM asunto_clientes ac JOIN clientes c ON c.id = ac.cliente_id
  WHERE ac.asunto_id = a.id)`;
// Nombre del abogado y del pasante asignados al asunto
const RESPONSABLE = "(SELECT nombre || ' ' || apellido_paterno FROM usuarios WHERE id = a.abogado_id)";
const PASANTE = "(SELECT nombre || ' ' || apellido_paterno FROM usuarios WHERE id = a.pasante_id)";

const AsuntoModel = {
  CLIENTES,

  // Siguiente folio interno del año: AS-2026-0001, AS-2026-0002, ...
  siguienteFolio(anio) {
    const r = uno("SELECT COUNT(*) AS n FROM asuntos WHERE folio LIKE ?", `AS-${anio}-%`);
    return `AS-${anio}-${String(r.n + 1).padStart(4, '0')}`;
  },

  // Lista de expedientes con filtros de texto, tipo de asunto, estado y responsable
  listar({ texto = '', tipoAsunto = '', estado = '', abogadoId = '', pasanteId = '' } = {}) {
    return todos(`SELECT a.*, ${CLIENTES} AS clientes, ${RESPONSABLE} AS responsable, ${PASANTE} AS pasante
      FROM asuntos a
      WHERE (? = '' OR a.folio LIKE '%' || ? || '%' OR IFNULL(a.numero_expediente,'') LIKE '%' || ? || '%' OR ${CLIENTES} LIKE '%' || ? || '%')
        AND (? = '' OR a.tipo_asunto = ?)
        AND (CASE WHEN ? = '' THEN a.estado <> 'Concluido' ELSE a.estado = ? END)
        AND (? = '' OR a.abogado_id = ?)
        AND (? = '' OR a.pasante_id = ?)
      ORDER BY a.creado_en DESC, a.id DESC`,
    texto, texto, texto, texto, tipoAsunto, tipoAsunto, estado, estado,
    String(abogadoId), String(abogadoId), String(pasanteId), String(pasanteId));
  },

  // Expedientes que no están concluidos
  activos: () => todos(`SELECT a.id, a.folio, a.numero_expediente, a.tipo_asunto, ${CLIENTES} AS clientes, a.estado
    FROM asuntos a WHERE a.estado <> 'Concluido' ORDER BY a.creado_en DESC`),

  // Un expediente con sus clientes y responsables
  buscarPorId: (id) => uno(`SELECT a.*, ${CLIENTES} AS clientes, ${RESPONSABLE} AS responsable, ${PASANTE} AS pasante,
      (SELECT tipo || ': ' || titulo || ' · ' || fecha || ' ' || hora_inicio FROM actividades
        WHERE asunto_id = a.id AND estado = 'Programada' AND fecha >= date('now','localtime')
        ORDER BY fecha, hora_inicio LIMIT 1) AS proxima_actividad
    FROM asuntos a WHERE a.id = ?`, id),

  // Clientes de un expediente (un asunto puede tener varios clientes)
  clientesDe: (id) => todos(`SELECT c.*, ${NOMBRE} AS nombre_completo FROM asunto_clientes ac
    JOIN clientes c ON c.id = ac.cliente_id WHERE ac.asunto_id = ?`, id),

  // Asuntos de un cliente (para su ficha)
  asuntosDeCliente: (clienteId) => todos(`SELECT a.id, a.folio, a.numero_expediente, a.tipo_asunto, a.estado, a.juzgado
    FROM asunto_clientes ac JOIN asuntos a ON a.id = ac.asunto_id WHERE ac.cliente_id = ? ORDER BY a.creado_en DESC`, clienteId),

  // Guarda el asunto y lo relaciona con sus clientes en la tabla asunto_clientes
  crear(a, clienteIds) {
    const id = ejecutar(`INSERT INTO asuntos (folio, tipo_asunto, materia, descripcion, contraparte, abogado_id, pasante_id)
      VALUES (:folio, :tipo_asunto, :materia, :descripcion, :contraparte, :abogado_id, :pasante_id)`, a).lastInsertRowid;
    for (const c of clienteIds) ejecutar('INSERT INTO asunto_clientes (asunto_id, cliente_id) VALUES (?, ?)', id, c);
    return id;
  },

  // Actualiza los datos generales del asunto
  modificar(id, a) {
    ejecutar(`UPDATE asuntos SET tipo_asunto = :tipo_asunto, materia = :materia, descripcion = :descripcion,
      contraparte = :contraparte, abogado_id = :abogado_id, pasante_id = :pasante_id WHERE id = :id`, { ...a, id });
  },

  // Revisa que el número de expediente no se repita en el mismo juzgado
  numeroEnUso: (numero, juzgado, excluirId) =>
    !!uno('SELECT id FROM asuntos WHERE numero_expediente = ? AND juzgado = ? AND id <> ?', numero, juzgado, excluirId),

  // Guarda número de expediente, juzgado y fecha de presentación, y pasa el asunto a En trámite
  registrarJuzgado(id, d) {
    ejecutar(`UPDATE asuntos SET numero_expediente = ?, juzgado = ?, fecha_presentacion = ?, estado = 'En trámite'
      WHERE id = ?`, d.numero_expediente, d.juzgado, d.fecha_presentacion, id);
  },

  // Marca el asunto como Concluido con su fecha, motivo y resultado
  concluir(id, d) {
    ejecutar(`UPDATE asuntos SET estado = 'Concluido', fecha_conclusion = ?, motivo_conclusion = ?, observaciones_conclusion = ?
      WHERE id = ?`, d.fecha_conclusion, d.motivo_conclusion, d.observaciones || null, id);
  },

  // Cuenta plazos y actividades pendientes (si hay, no se deja concluir)
  pendientesParaConcluir: (id) => uno(`SELECT
      (SELECT COUNT(*) FROM documentos WHERE asunto_id = ? AND estado = 'Pendiente') AS documentos,
      (SELECT COUNT(*) FROM plazos WHERE asunto_id = ? AND estado = 'Pendiente') AS plazos`, id, id),

  // Documentos de un expediente con el nombre de quien los subió
  documentos: (asuntoId) => todos(`SELECT d.*, u.nombre || ' ' || u.apellido_paterno AS subido_por_nombre
    FROM documentos d JOIN usuarios u ON u.id = d.subido_por WHERE d.asunto_id = ? ORDER BY d.creado_en DESC, d.id DESC`, asuntoId),

  // Un documento por su id
  documento: (id) => uno('SELECT * FROM documentos WHERE id = ?', id),

  // Documentos que esperan la autorización del Abogado (para el Panel)
  documentosPendientes: () => todos(`SELECT d.id, d.nombre_archivo, d.tipo_documento, d.creado_en, a.id AS asunto_id,
      IFNULL(a.numero_expediente, a.folio) AS expediente, u.nombre || ' ' || u.apellido_paterno AS subido_por_nombre
    FROM documentos d JOIN asuntos a ON a.id = d.asunto_id JOIN usuarios u ON u.id = d.subido_por
    WHERE d.estado = 'Pendiente' ORDER BY d.creado_en`),

  // Registra un documento nuevo (el archivo ya se copió a la carpeta del expediente)
  crearDocumento(d) {
    return ejecutar(`INSERT INTO documentos (asunto_id, nombre_archivo, ruta, tipo_documento, descripcion, estado, subido_por)
      VALUES (:asunto_id, :nombre_archivo, :ruta, :tipo_documento, :descripcion, :estado, :subido_por)`, d).lastInsertRowid;
  },

  // Autoriza o rechaza un documento y guarda quién lo revisó
  revisarDocumento(id, estado, usuarioId, motivo = null) {
    ejecutar(`UPDATE documentos SET estado = ?, motivo_rechazo = ?, revisado_por = ?, revisado_en = datetime('now','localtime')
      WHERE id = ?`, estado, motivo, usuarioId, id);
  },

  // Historial de actuaciones del expediente, de la más reciente a la más antigua
  actuaciones: (asuntoId) => todos(`SELECT t.*, u.nombre || ' ' || u.apellido_paterno AS registrado_por_nombre,
      d.nombre_archivo FROM actuaciones t JOIN usuarios u ON u.id = t.registrado_por
      LEFT JOIN documentos d ON d.id = t.documento_id WHERE t.asunto_id = ? ORDER BY t.fecha DESC, t.id DESC`, asuntoId),

  // Registra una actuación nueva
  crearActuacion(t) {
    return ejecutar(`INSERT INTO actuaciones (asunto_id, fecha, tipo, descripcion, documento_id, registrado_por)
      VALUES (:asunto_id, :fecha, :tipo, :descripcion, :documento_id, :registrado_por)`, t).lastInsertRowid;
  },

  // Número de expedientes activos (indicador del Panel)
  contarActivos: (abogadoId = null, pasanteId = null) => uno(`SELECT COUNT(*) AS n FROM asuntos
    WHERE estado <> 'Concluido' AND (? IS NULL OR abogado_id = ?) AND (? IS NULL OR pasante_id = ?)`,
  abogadoId, abogadoId, pasanteId, pasanteId).n,
};

module.exports = AsuntoModel;
