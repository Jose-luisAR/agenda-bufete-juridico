// Modelo de usuarios: solo consultas a la base de datos, sin reglas de pantalla.
const { todos, uno, ejecutar } = require('../database/connection');

// Columnas que sí se pueden mandar a la pantalla (sin la contraseña cifrada)
const COLUMNAS_PUBLICAS = `id, nombre, apellido_paterno, apellido_materno, correo, telefono, rol, estado,
  debe_cambiar_contrasena, creado_en`;

const UsuarioModel = {
  // Número total de usuarios
  contar: () => uno('SELECT COUNT(*) AS total FROM usuarios').total,

  // Incluye el hash porque lo necesita el inicio de sesión; nunca se envía a la vista
  buscarPorCorreo: (correo) => uno('SELECT * FROM usuarios WHERE correo = ?', correo),
  buscarConHash: (id) => uno('SELECT * FROM usuarios WHERE id = ?', id),
  // Usuario por id, sin contraseña
  buscarPorId: (id) => uno(`SELECT ${COLUMNAS_PUBLICAS} FROM usuarios WHERE id = ?`, id),

  // Lista de usuarios con filtros de texto, rol y estado
  listar({ texto = '', rol = '', estado = '' } = {}) {
    return todos(`SELECT ${COLUMNAS_PUBLICAS} FROM usuarios
      WHERE (? = '' OR nombre || ' ' || apellido_paterno || ' ' || IFNULL(apellido_materno,'') || ' ' || correo LIKE '%' || ? || '%')
        AND (? = '' OR rol = ?) AND (? = '' OR estado = ?)
      ORDER BY estado, nombre`, texto, texto, rol, rol, estado, estado);
  },

  // Usuarios activos (para elegir responsables)
  activos: () => todos(`SELECT ${COLUMNAS_PUBLICAS} FROM usuarios WHERE estado = 'Activo' ORDER BY nombre`),
  // Abogados activos (siempre debe quedar al menos uno)
  abogadosActivos: () => todos("SELECT id FROM usuarios WHERE rol = 'Abogado' AND estado = 'Activo'"),

  // Revisa que el correo no pertenezca a otro usuario
  correoEnUso: (correo, excluirId = 0) => !!uno('SELECT id FROM usuarios WHERE correo = ? AND id <> ?', correo, excluirId),

  // Inserta un usuario nuevo
  crear(u) {
    return ejecutar(`INSERT INTO usuarios (nombre, apellido_paterno, apellido_materno, correo, telefono, rol, contrasena_hash)
      VALUES (:nombre, :apellido_paterno, :apellido_materno, :correo, :telefono, :rol, :contrasena_hash)`, u).lastInsertRowid;
  },

  // Actualiza nombre, correo, teléfono y rol
  modificar(id, u) {
    ejecutar(`UPDATE usuarios SET nombre = ?, apellido_paterno = ?, apellido_materno = ?, correo = ?, telefono = ?, rol = ?
      WHERE id = ?`, u.nombre, u.apellido_paterno, u.apellido_materno, u.correo, u.telefono, u.rol, id);
  },

  // Activo o Inactivo
  cambiarEstado: (id, estado) => ejecutar('UPDATE usuarios SET estado = ? WHERE id = ?', estado, id),

  // Guarda la contraseña nueva; si es temporal, el usuario deberá cambiarla al entrar
  cambiarContrasena: (id, hash, temporal = false) =>
    ejecutar('UPDATE usuarios SET contrasena_hash = ?, debe_cambiar_contrasena = ? WHERE id = ?', hash, temporal ? 1 : 0, id),

  // Suma un intento fallido de inicio de sesión
  registrarIntentoFallido: (id) => ejecutar('UPDATE usuarios SET intentos_fallidos = intentos_fallidos + 1 WHERE id = ?', id),
  // Bloquea la cuenta hasta la hora indicada
  bloquear: (id, hasta) => ejecutar('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = ? WHERE id = ?', hasta, id),

  // Al entrar bien se borran los intentos fallidos y el bloqueo
  reiniciarIntentos: (id) => ejecutar('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?', id),

  // Actividades programadas y plazos pendientes de un usuario
  pendientes: (id) => uno(`SELECT
      (SELECT COUNT(*) FROM actividades WHERE responsable_id = ? AND estado = 'Programada') AS actividades,
      (SELECT COUNT(*) FROM plazos WHERE responsable_id = ? AND estado = 'Pendiente') AS plazos`, id, id),

  // Pasa las actividades y plazos pendientes de un usuario a otro (al darlo de baja)
  reasignarPendientes(deId, aId) {
    ejecutar("UPDATE actividades SET responsable_id = ? WHERE responsable_id = ? AND estado = 'Programada'", aId, deId);
    ejecutar("UPDATE plazos SET responsable_id = ? WHERE responsable_id = ? AND estado = 'Pendiente'", aId, deId);
  },
};

module.exports = UsuarioModel;
