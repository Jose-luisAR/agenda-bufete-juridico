// Carga datos de ejemplo para ver las pantallas llenas (solo si la base está vacía).
// Uso: npm run datos-ejemplo            → usa la carpeta de datos de la app
//      node scripts/datos-ejemplo.js <carpeta>
const os = require('os');
const path = require('path');
const db = require('../src/database/connection');
const rutas = require('../src/utils/rutas');
const Auth = require('../src/controllers/AuthController');
const Usuarios = require('../src/controllers/UsuarioController');
const Clientes = require('../src/controllers/ClienteController');
const Expedientes = require('../src/controllers/ExpedienteController');
const Agenda = require('../src/controllers/AgendaController');
const Radar = require('../src/controllers/RadarController');
const { hoy } = require('../src/utils/fechas');


const porDefecto = process.platform === 'win32'
  ? path.join(process.env.APPDATA || os.homedir(), 'Agenda de Bufete Jurídico')
  : path.join(os.homedir(), '.config', 'Agenda de Bufete Jurídico');
rutas.fijarBase(process.argv[2] || porDefecto);
db.abrir(rutas.baseDatos());

const UsuarioModel = require('../src/models/UsuarioModel');
if (UsuarioModel.buscarPorCorreo('andrea@despacho.mx')) {
  console.log('Los datos de ejemplo ya estaban cargados.');
  process.exit(0);
}

const dia = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const CLAVE = 'Despacho2026';

// Si ya hay cuentas (por ejemplo la tuya), se agrega la Abogada de ejemplo sin tocar lo que existe
const andrea = { nombre: 'Andrea', apellido_paterno: 'Basurto', correo: 'andrea@despacho.mx', telefono: '7341000000', contrasena: CLAVE, confirmacion: CLAVE };
if (Auth.hayUsuarios()) UsuarioModel.crear({ ...andrea, rol: 'Abogado', contrasena_hash: Auth.hash(CLAVE) });
else Auth.crearPrimerAbogado(andrea);
Auth.iniciarSesion('andrea@despacho.mx', CLAVE, 'Abogado');
const yo = Auth.sesionActual();
const pasante = (u) => { if (!UsuarioModel.buscarPorCorreo(u.correo)) Usuarios.registrar({ ...u, rol: 'Pasante', contrasena: CLAVE, confirmacion: CLAVE }); };
pasante({ nombre: 'Luis', apellido_paterno: 'Aguilar', apellido_materno: 'Román', correo: 'luis@despacho.mx', telefono: '7341000001' });
pasante({ nombre: 'Yusleivy', apellido_paterno: 'Hernández', correo: 'yusleivy@despacho.mx', telefono: '7341000002' });

const domicilio = { calle_numero: 'Av. Morelos 120', colonia: 'Centro', municipio: 'Jojutla', estado_republica: 'Morelos', codigo_postal: '62900' };
[
  { tipo_persona: 'Física', nombre: 'María', apellido_paterno: 'López', apellido_materno: 'Ríos', telefono: '7771234567', correo: 'maria.lopez@correo.mx' },
  { tipo_persona: 'Física', nombre: 'Jorge', apellido_paterno: 'Méndez', apellido_materno: 'Salgado', telefono: '7772345678' },
  { tipo_persona: 'Moral', razon_social: 'Constructora Ruiz S.A. de C.V.', telefono: '7773456789', correo: 'contacto@ruiz.mx' },
  { tipo_persona: 'Física', nombre: 'Carmen', apellido_paterno: 'Ortiz', telefono: '7774567890' },
  { tipo_persona: 'Física', nombre: 'Roberto', apellido_paterno: 'Sánchez', apellido_materno: 'Vega', telefono: '7775678901' },
].forEach((c) => Clientes.registrar({ ...domicilio, ...c }, true));
const clientes = Clientes.listar().sort((a, b) => a.id - b.id).slice(-5);
const pasantes = ['luis@despacho.mx', 'yusleivy@despacho.mx'].map((c) => UsuarioModel.buscarPorCorreo(c));

const asuntos = [
  ['Divorcio voluntario', 'Familiar', '245/2026', 'Juzgado Primero Familiar de Jojutla'],
  ['Cobro de pagaré', 'Mercantil', '118/2026', 'Juzgado Civil de Primera Instancia'],
  ['Juicio sucesorio intestamentario', 'Civil', '1032/2026', 'Juzgado Civil de Primera Instancia'],
  ['Pensión alimenticia', 'Familiar', '310/2026', 'Juzgado Primero Familiar de Jojutla'],
  ['Rectificación de acta', 'Civil', null, null],
];
asuntos.forEach(([tipo, materia], i) => Expedientes.registrar({ clientes: [clientes[i].id], tipo_asunto: tipo, materia,
  descripcion: `${tipo} promovido por el despacho`, abogado_id: yo.id, pasante_id: pasantes[i % 2].id }));
const lista = Expedientes.listar().sort((a, b) => a.id - b.id).slice(-5);
asuntos.forEach(([, , num, juz], i) => { if (num) Expedientes.registrarJuzgado(lista[i].id, { numero_expediente: num, juzgado: juz, fecha_presentacion: dia(-20) }); });

// Plazos con distintas urgencias (fecha exacta para que el semáforo salga variado)
const habil = (n) => Radar.calcular(hoy(), n);
[
  [0, 'Ratificar convenio de divorcio', hoy()],
  [1, 'Contestar la demanda', habil(2)],
  [2, 'Ofrecer pruebas', habil(5)],
  [3, 'Desahogar vista', habil(6)],
  [1, 'Presentar alegatos', habil(12)],
  [2, 'Interponer amparo', habil(15)],
].forEach(([i, actuacion, fecha], k) => Radar.registrar({ asunto_id: lista[i].id, actuacion_pendiente: actuacion,
  fecha_notificacion: dia(-3), fecha_vencimiento: fecha, responsable_id: k % 2 ? yo.id : pasantes[0].id }));

[
  ['Audiencia', 'Audiencia de ratificación', 1, '10:00', 0, 'Juzgado Primero Familiar'],
  ['Cita con cliente', 'Revisión de documentos', 2, '12:30', null, 'Oficina del despacho'],
  ['Diligencia', 'Emplazamiento al demandado', 4, '09:00', 1, 'Domicilio del demandado'],
  ['Audiencia', 'Audiencia de conciliación', 8, '11:00', 2, 'Juzgado Civil de Primera Instancia'],
  ['Cita con cliente', 'Primera entrevista', 0, '17:00', null, 'Oficina del despacho'],
  ['Audiencia', 'Audiencia incidental', 13, '10:30', 3, 'Juzgado Primero Familiar'],
].forEach(([tipo, titulo, n, hora, i, lugar], k) => Agenda.registrar({ tipo, titulo, fecha: dia(n), hora_inicio: hora, lugar,
  asunto_id: i === null ? null : lista[i].id, responsable_id: k % 3 ? yo.id : pasantes[0].id }, true));

Auth.cerrarSesion();
db.cerrar();
console.log(`Datos de ejemplo cargados en ${rutas.base()}`);
console.log(`Abogado: andrea@despacho.mx · Pasantes: luis@despacho.mx, yusleivy@despacho.mx · Contraseña: ${CLAVE}`);
