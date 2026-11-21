// Prueba de flujo completo de los módulos 1 a 5 contra una base de datos temporal.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
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
const Panel = require('../src/controllers/PanelController');
const Respaldo = require('../src/controllers/RespaldoController');
const { hoy } = require('../src/utils/fechas');

const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'agenda-flujo-'));
rutas.fijarBase(carpeta);
db.abrir(rutas.baseDatos());
test.after(() => { db.cerrar(); fs.rmSync(carpeta, { recursive: true, force: true }); });

const manana = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };
const cliente = { tipo_persona: 'Física', nombre: 'María', apellido_paterno: 'López', telefono: '7771234567',
  calle_numero: 'Morelos 12', colonia: 'Centro', municipio: 'Jojutla', estado_republica: 'Morelos', codigo_postal: '62900' };

test('flujo: usuarios, clientes, expediente, plazos, agenda y panel', () => {
  Auth.crearPrimerAbogado({ nombre: 'Andrea', apellido_paterno: 'Basurto', correo: 'andrea@despacho.mx', telefono: '7340000000',
    contrasena: 'Despacho2026', confirmacion: 'Despacho2026' });
  Auth.iniciarSesion('andrea@despacho.mx', 'Despacho2026', 'Abogado');

  Usuarios.registrar({ nombre: 'Luis', apellido_paterno: 'Aguilar', correo: 'luis@despacho.mx', telefono: '7341111111',
    rol: 'Pasante', contrasena: 'Pasante2026', confirmacion: 'Pasante2026' });
  const pasante = Usuarios.listar({ rol: 'Pasante' })[0];
  assert.throws(() => Usuarios.modificar(1, { nombre: 'Andrea', apellido_paterno: 'Basurto', correo: 'andrea@despacho.mx',
    telefono: '7340000000', rol: 'Pasante' }), /al menos un Abogado/);

  // Cliente registrado por el Abogado queda Confirmado; duplicado pide confirmación
  assert.match(Clientes.registrar(cliente).mensaje, /exitosamente/);
  assert.ok(Clientes.registrar(cliente).confirmar);
  assert.throws(() => Clientes.registrar({ ...cliente, telefono: '123' }), /10 dígitos/);
  const c = Clientes.listar()[0];
  assert.equal(c.estado, 'Confirmado');

  // Asunto con folio AS-AAAA-0001
  const msg = Expedientes.registrar({ clientes: [c.id], tipo_asunto: 'Divorcio voluntario', materia: 'Familiar',
    descripcion: 'Divorcio de común acuerdo', abogado_id: 1, pasante_id: pasante.id });
  assert.match(msg, new RegExp(`AS-${new Date().getFullYear()}-0001`));
  const a = Expedientes.listar()[0];
  assert.equal(a.estado, 'En preparación');
  assert.throws(() => Radar.registrar({ asunto_id: a.id, actuacion_pendiente: 'X', fecha_notificacion: hoy(), dias_habiles: 3, responsable_id: 1 }), /En trámite/);

  Expedientes.registrarJuzgado(a.id, { numero_expediente: '245/2026', juzgado: 'Juzgado Familiar de Jojutla', fecha_presentacion: hoy() });
  assert.equal(Expedientes.consultar(a.id).asunto.estado, 'En trámite');

  // Plazos y radar
  assert.match(Radar.registrar({ asunto_id: a.id, actuacion_pendiente: 'Ratificar convenio', fecha_notificacion: hoy(),
    dias_habiles: 1, responsable_id: pasante.id }), /vence el/);
  assert.throws(() => Radar.registrar({ asunto_id: a.id, actuacion_pendiente: 'X', fecha_notificacion: hoy(), dias_habiles: 2,
    fecha_vencimiento: hoy(), responsable_id: 1 }), /no los dos/);
  const radar = Radar.listar();
  assert.equal(radar.resumen.Urgente, 1);
  assert.equal(radar.plazos[0].prioridad.etiqueta, 'Urgente');

  // Concluir con plazo pendiente no se permite
  assert.throws(() => Expedientes.concluir(a.id, { fecha_conclusion: hoy(), motivo_conclusion: 'Convenio' }), /plazos sin atender/);
  Radar.atender(radar.plazos[0].id, { fecha_atendido: hoy() });

  // Agenda: actividad, choque de horario y vencimientos
  assert.match(Agenda.registrar({ tipo: 'Audiencia', titulo: 'Ratificación', fecha: manana(), hora_inicio: '10:00', lugar: 'Juzgado',
    asunto_id: a.id, responsable_id: pasante.id }).mensaje, /exitosamente/);
  assert.ok(Agenda.registrar({ tipo: 'Audiencia', titulo: 'Otra', fecha: manana(), hora_inicio: '10:00', lugar: 'Juzgado',
    asunto_id: a.id, responsable_id: pasante.id }).confirmar);
  assert.equal(Agenda.rango(manana(), manana()).actividades.length, 1);

  // Panel del Abogado
  const p = Panel.resumen();
  assert.equal(p.indicadores.length, 4);
  assert.match(p.avisoRespaldo, /7 días/);

  // Respaldo manual
  assert.match(Respaldo.manual(carpeta), /exitosamente/);

  // El Pasante no puede confirmar clientes ni concluir expedientes
  Auth.cerrarSesion();
  Auth.iniciarSesion('luis@despacho.mx', 'Pasante2026', 'Pasante');
  assert.throws(() => Clientes.confirmar(c.id), /permiso/);
  assert.throws(() => Expedientes.concluir(a.id, { fecha_conclusion: hoy(), motivo_conclusion: 'Convenio' }), /permiso/);
  Clientes.registrar({ ...cliente, nombre: 'Pedro', apellido_paterno: 'Ruiz' });
  assert.equal(Clientes.listar({ texto: 'Pedro' })[0].estado, 'Por confirmar');
  assert.ok(Panel.avisos().noLeidos >= 1);
});
