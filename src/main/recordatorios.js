// Notificaciones de Windows mientras el sistema está abierto o minimizado.
// Cubre dos requerimientos del DFR:
//   3.6 Recordar actividades: 24 horas antes y 1 hora antes de cada actividad.
//   4.10 Avisar vencimientos: plazos urgentes, una vez al día a partir de las 9:00.
// Al hacer clic en una notificación se abre la pantalla relacionada.
const { Notification, BrowserWindow } = require('electron');
const Auth = require('../controllers/AuthController');
const AgendaModel = require('../models/AgendaModel');
const Radar = require('../controllers/RadarController');
const { hoy, mostrar } = require('../utils/fechas');

// Aquí se guardan las notificaciones ya enviadas para no repetirlas.
// Ejemplo de claves: "act-12-24h", "act-12-1h", "plazo-5-2026-11-20"
const enviadas = new Set();

// Muestra una notificación de Windows. Si el usuario le da clic,
// se trae la ventana al frente y se le pide a la vista que abra "destino".
function notificar(titulo, cuerpo, destino) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title: titulo, body: cuerpo });
  n.on('click', () => {
    const ventana = BrowserWindow.getAllWindows()[0];
    if (!ventana) return;
    if (ventana.isMinimized()) ventana.restore();
    ventana.show();
    ventana.focus();
    if (destino) ventana.webContents.send('navegar', destino);
  });
  n.show();
}

// Minutos que faltan para una actividad (fecha "AAAA-MM-DD" y hora "HH:MM")
const minutosPara = (fecha, hora) => (new Date(`${fecha}T${hora}:00`) - new Date()) / 60000;

// Recordatorios de actividades del usuario que tiene la sesión abierta
function revisarActividades(usuario) {
  const manana = new Date(Date.now() + 25 * 3600000).toISOString().slice(0, 10);
  const actividades = AgendaModel.entreFechas(hoy(), manana, { responsableId: usuario.id })
    .filter((t) => t.estado === 'Programada');

  actividades.forEach((t) => {
    const faltan = minutosPara(t.fecha, t.hora_inicio);
    const texto = `${t.tipo}: ${t.titulo}, ${mostrar(t.fecha)} a las ${t.hora_inicio} en ${t.lugar}`;
    // Aviso de 1 hora antes
    if (faltan > 0 && faltan <= 60 && !enviadas.has(`act-${t.id}-1h`)) {
      enviadas.add(`act-${t.id}-1h`);
      enviadas.add(`act-${t.id}-24h`); // si ya falta menos de 1 hora, el de 24 horas ya no tiene caso
      notificar('Actividad en 1 hora', texto, { pantalla: 'agenda', id: t.id });
    // Aviso de 24 horas antes
    } else if (faltan > 60 && faltan <= 24 * 60 && !enviadas.has(`act-${t.id}-24h`)) {
      enviadas.add(`act-${t.id}-24h`);
      notificar('Actividad próxima', texto, { pantalla: 'agenda', id: t.id });
    }
  });
}

// Avisos de plazos urgentes (vencidos o que vencen en 0 a 2 días hábiles).
// Cada plazo se avisa una vez por día. Si ya se había avisado antes,
// el aviso del día siguiente sale a partir de las 9:00.
function revisarPlazos(usuario, alIniciar = false) {
  const dia = hoy();
  const despuesDeLas9 = new Date().getHours() >= 9;
  Radar.urgentesDe(usuario).forEach((p) => {
    const clave = `plazo-${p.id}-${dia}`;
    const yaSeAviso = [...enviadas].some((k) => k.startsWith(`plazo-${p.id}-`));
    if (enviadas.has(clave)) return;
    if (!alIniciar && yaSeAviso && !despuesDeLas9) return;
    enviadas.add(clave);
    const cuando = p.dias <= 0 ? 'hoy' : `en ${p.dias} días`;
    notificar('Plazo urgente', `Vence ${cuando}: ${p.actuacion_pendiente}, expediente ${p.expediente}`,
      { pantalla: 'radar', id: p.id });
  });
}

// Se llama cada minuto. Si nadie ha iniciado sesión no hace nada.
function revisar() {
  const usuario = Auth.sesionActual();
  if (!usuario || usuario.debe_cambiar_contrasena) return;
  try {
    revisarActividades(usuario);
    revisarPlazos(usuario);
  } catch (e) {
    console.error('Recordatorios', e);
  }
}

function iniciarRecordatorios() {
  setInterval(revisar, 60 * 1000);
}

module.exports = { iniciarRecordatorios, revisarPlazos, notificar };
