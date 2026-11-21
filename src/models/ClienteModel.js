// Modelo de clientes (DFR 2.1 a 2.6).
const { todos, uno, ejecutar } = require('../database/connection');

// Nombre que se muestra del cliente: razón social o nombre con apellidos
const NOMBRE = `CASE WHEN c.tipo_persona = 'Moral' THEN c.razon_social
  ELSE c.nombre || ' ' || c.apellido_paterno || IFNULL(' ' || c.apellido_materno, '') END`;

const ClienteModel = {
  NOMBRE,

  // Lista de clientes con búsqueda por nombre o número de expediente, filtros y paginación de 20 en 20
  listar({ texto = '', tipoAsunto = '', estado = '', limite = 20, desde = 0 } = {}) {
    return todos(`SELECT c.*, ${NOMBRE} AS nombre_completo,
        (SELECT GROUP_CONCAT(a.tipo_asunto, ', ') FROM asunto_clientes ac JOIN asuntos a ON a.id = ac.asunto_id
          WHERE ac.cliente_id = c.id) AS asuntos,
        u.nombre || ' ' || u.apellido_paterno AS registrado_por_nombre
      FROM clientes c JOIN usuarios u ON u.id = c.registrado_por
      WHERE (? = '' OR ${NOMBRE} LIKE '%' || ? || '%' OR EXISTS (
              SELECT 1 FROM asunto_clientes ac JOIN asuntos a ON a.id = ac.asunto_id
              WHERE ac.cliente_id = c.id AND (a.numero_expediente LIKE '%' || ? || '%' OR a.folio LIKE '%' || ? || '%')))
        AND (? = '' OR EXISTS (SELECT 1 FROM asunto_clientes ac JOIN asuntos a ON a.id = ac.asunto_id
              WHERE ac.cliente_id = c.id AND a.tipo_asunto = ?))
        AND (? = '' OR c.estado = ?)
      ORDER BY ${NOMBRE} COLLATE NOCASE
      LIMIT ? OFFSET ?`, texto, texto, texto, texto, tipoAsunto, tipoAsunto, estado, estado, limite, desde);
  },

  // Un cliente por su id
  buscarPorId: (id) => uno(`SELECT c.*, ${NOMBRE} AS nombre_completo FROM clientes c WHERE c.id = ?`, id),

  // Solo los clientes confirmados (los que se pueden usar en un asunto)
  confirmados: () => todos(`SELECT c.id, ${NOMBRE} AS nombre_completo FROM clientes c
    WHERE c.estado = 'Confirmado' ORDER BY nombre_completo COLLATE NOCASE`),

  // Clientes capturados por un Pasante que esperan revisión del Abogado
  porConfirmar: () => todos(`SELECT c.id, ${NOMBRE} AS nombre_completo, c.creado_en,
      u.nombre || ' ' || u.apellido_paterno AS registrado_por_nombre
    FROM clientes c JOIN usuarios u ON u.id = c.registrado_por
    WHERE c.estado = 'Por confirmar' ORDER BY c.creado_en`),

  // Revisa que la CURP o el RFC no estén ya registrados
  curpRfcEnUso: (valor, excluirId = 0) => !!uno('SELECT id FROM clientes WHERE curp_rfc = ? AND id <> ?', valor, excluirId),
  // Revisa si ya existe un cliente con el mismo nombre (para preguntar antes de guardar)
  mismoNombre: (nombre, excluirId = 0) => !!uno(`SELECT c.id FROM clientes c WHERE ${NOMBRE} = ? COLLATE NOCASE AND c.id <> ?`, nombre, excluirId),

  // Inserta un cliente nuevo
  crear(c) {
    return ejecutar(`INSERT INTO clientes (tipo_persona, nombre, apellido_paterno, apellido_materno, razon_social, telefono,
        correo, calle_numero, colonia, municipio, estado_republica, codigo_postal, curp_rfc, observaciones, estado, registrado_por)
      VALUES (:tipo_persona, :nombre, :apellido_paterno, :apellido_materno, :razon_social, :telefono, :correo, :calle_numero,
        :colonia, :municipio, :estado_republica, :codigo_postal, :curp_rfc, :observaciones, :estado, :registrado_por)`, c).lastInsertRowid;
  },

  // Actualiza los datos de un cliente
  modificar(id, c) {
    ejecutar(`UPDATE clientes SET tipo_persona = :tipo_persona, nombre = :nombre, apellido_paterno = :apellido_paterno,
        apellido_materno = :apellido_materno, razon_social = :razon_social, telefono = :telefono, correo = :correo,
        calle_numero = :calle_numero, colonia = :colonia, municipio = :municipio, estado_republica = :estado_republica,
        codigo_postal = :codigo_postal, curp_rfc = :curp_rfc, observaciones = :observaciones, estado = :estado
      WHERE id = :id`, { ...c, id });
  },

  // Cambia el estado: Por confirmar, Confirmado o Devuelto (con observaciones)
  cambiarEstado: (id, estado, observaciones = null) =>
    ejecutar('UPDATE clientes SET estado = ?, observaciones_devolucion = ? WHERE id = ?', estado, observaciones, id),

  // Revisa si el cliente tiene asuntos (si tiene, no se puede eliminar)
  tieneAsuntos: (id) => !!uno('SELECT 1 FROM asunto_clientes WHERE cliente_id = ?', id),
  // Borra un cliente sin asuntos
  eliminar: (id) => ejecutar('DELETE FROM clientes WHERE id = ?', id),
};

module.exports = ClienteModel;
