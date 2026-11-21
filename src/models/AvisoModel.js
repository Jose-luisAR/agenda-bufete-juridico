// Avisos de la campana (DFR 5.5).
const { todos, uno, ejecutar } = require('../database/connection');

const AvisoModel = {
  // Crea un aviso para un usuario; pantalla y referencia sirven para abrir lo relacionado al darle clic
  crear: (usuarioId, texto, pantalla = null, referencia = null) =>
    ejecutar('INSERT INTO avisos (usuario_id, texto, pantalla, referencia) VALUES (?, ?, ?, ?)', usuarioId, texto, pantalla, referencia),

  // Últimos 30 avisos del usuario, primero los no leídos
  deUsuario: (usuarioId) => todos('SELECT * FROM avisos WHERE usuario_id = ? ORDER BY leido, creado_en DESC LIMIT 30', usuarioId),
  // Número que aparece en la campana
  noLeidos: (usuarioId) => uno('SELECT COUNT(*) AS n FROM avisos WHERE usuario_id = ? AND leido = 0', usuarioId).n,
  // Marca un aviso como leído
  marcarLeido: (id, usuarioId) => ejecutar('UPDATE avisos SET leido = 1 WHERE id = ? AND usuario_id = ?', id, usuarioId),
};

module.exports = AvisoModel;
