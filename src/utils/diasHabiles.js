// Cálculo único de días hábiles y semáforo de urgencia (DFR, Reusabilidad).
// Lo comparten el Radar, la Agenda, el Panel de Control y los expedientes.

// Convierte un Date en texto "AAAA-MM-DD" (así se guardan las fechas en la base de datos)
const clave = (f) => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;

// Un día es hábil si no es sábado, domingo ni día inhábil registrado
function esHabil(fecha, inhabiles = new Set()) {
  const dia = fecha.getDay(); // 0 = domingo, 6 = sábado
  return dia !== 0 && dia !== 6 && !inhabiles.has(clave(fecha));
}

// El plazo empieza a contar el día hábil siguiente a la notificación.
function calcularVencimiento(fechaNotificacion, diasHabiles, inhabiles = new Set()) {
  const f = new Date(fechaNotificacion.getFullYear(), fechaNotificacion.getMonth(), fechaNotificacion.getDate());
  let contados = 0;
  while (contados < diasHabiles) {
    f.setDate(f.getDate() + 1);
    if (esHabil(f, inhabiles)) contados++;
  }
  return f;
}

// Cuenta los días hábiles que hay después de "desde" y hasta "hasta"
function diasHabilesEntre(desde, hasta, inhabiles = new Set()) {
  const f = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  const fin = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
  let n = 0;
  while (f < fin) {
    f.setDate(f.getDate() + 1);
    if (esHabil(f, inhabiles)) n++;
  }
  return n;
}

// Días hábiles que faltan para el vencimiento; -1 si ya venció.
function diasRestantes(hoy, vencimiento, inhabiles = new Set()) {
  const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const v = new Date(vencimiento.getFullYear(), vencimiento.getMonth(), vencimiento.getDate());
  if (v < h) return -1;
  return diasHabilesEntre(h, v, inhabiles);
}

// DFR 4.7: Urgente (vencido o 0 a 2 días hábiles), Próximo (3 a 7), En tiempo (más de 7).
function semaforo(dias) {
  if (dias <= 2) return { color: 'rojo', etiqueta: 'Urgente' };
  if (dias <= 7) return { color: 'naranja', etiqueta: 'Próximo' };
  return { color: 'verde', etiqueta: 'En tiempo' };
}

// Texto de "Faltan": Hoy, n días o Vencido.
function textoFaltan(dias) {
  if (dias < 0) return 'Vencido';
  if (dias === 0) return 'Hoy';
  return dias === 1 ? '1 día' : `${dias} días`;
}

module.exports = { esHabil, calcularVencimiento, diasHabilesEntre, diasRestantes, semaforo, textoFaltan, clave };
