// Fechas del sistema en formato AAAA-MM-DD (base de datos) y DD/MM/AAAA (pantalla).
const { clave } = require('./diasHabiles');

// Fecha de hoy en formato AAAA-MM-DD
const hoy = () => clave(new Date());
// Convierte "AAAA-MM-DD" en un objeto Date (hora local)
const aFecha = (texto) => { const [a, m, d] = texto.split('-').map(Number); return new Date(a, m - 1, d); };
// Convierte "AAAA-MM-DD" en "DD/MM/AAAA" para mostrar en pantalla
const mostrar = (texto) => (texto ? texto.split('-').reverse().join('/') : '');
// Fecha y hora actuales como "AAAA-MM-DD HH:MM"
const ahora = () => {
  const d = new Date();
  return `${clave(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// Convierte los registros de días inhábiles (fechas o periodos) en un conjunto de días.
function conjuntoInhabiles(registros) {
  const set = new Set();
  for (const r of registros) {
    const ini = aFecha(r.fecha_inicio);
    const fin = r.fecha_fin ? aFecha(r.fecha_fin) : ini;
    for (const d = new Date(ini); d <= fin; d.setDate(d.getDate() + 1)) set.add(clave(d));
  }
  return set;
}

module.exports = { hoy, aFecha, mostrar, ahora, conjuntoInhabiles };
