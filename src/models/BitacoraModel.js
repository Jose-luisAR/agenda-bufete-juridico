// Registro de acciones críticas en la bitácora de auditoría.
const db = require('../database/connection');

const BitacoraModel = {
  // Guarda quién hizo qué y cuándo. La tabla no permite modificar ni borrar registros
  registrar(usuarioId, accion, detalle = null) {
    db.obtener()
      .prepare('INSERT INTO bitacora (usuario_id, accion, detalle) VALUES (?, ?, ?)')
      .run(usuarioId, accion, detalle);
  },
};

module.exports = BitacoraModel;
