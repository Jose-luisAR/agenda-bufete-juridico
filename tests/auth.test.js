// Prueba de integración: base de datos + controlador de autenticación.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('../src/database/connection');
const AuthController = require('../src/controllers/AuthController');

const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'agenda-test-'));
db.abrir(path.join(carpeta, 'prueba.db'));
test.after(() => { db.cerrar(); fs.rmSync(carpeta, { recursive: true, force: true }); });

const abogado = {
  nombre: 'Rodrigo', apellido_paterno: 'Casillas', apellido_materno: 'Beltrán',
  correo: 'abogado@despacho.com', telefono: '7341061643',
  contrasena: 'Basurto2026', confirmacion: 'Basurto2026',
};

test('sin usuarios se pide crear la primera cuenta de Abogado', () => {
  assert.equal(AuthController.hayUsuarios(), false);
});

test('rechaza contraseñas que no coinciden', () => {
  assert.throws(() => AuthController.crearPrimerAbogado({ ...abogado, confirmacion: 'Otra2026' }), /no coinciden/);
});

test('crea la primera cuenta de Abogado con la contraseña cifrada', () => {
  AuthController.crearPrimerAbogado(abogado);
  const fila = db.obtener().prepare('SELECT rol, contrasena_hash FROM usuarios').get();
  assert.equal(fila.rol, 'Abogado');
  assert.notEqual(fila.contrasena_hash, abogado.contrasena);
  assert.match(fila.contrasena_hash, /^\$2[aby]\$/); // formato bcrypt
});

test('no permite crear una segunda "primera cuenta"', () => {
  assert.throws(() => AuthController.crearPrimerAbogado(abogado), /Ya existe/);
});

test('inicia sesión y rechaza contraseña incorrecta', () => {
  assert.throws(() => AuthController.iniciarSesion(abogado.correo, 'Incorrecta1', 'Abogado'), /incorrectos/);
  assert.throws(() => AuthController.iniciarSesion(abogado.correo, abogado.contrasena, 'Pasante'), /incorrectos/);
  const u = AuthController.iniciarSesion('ABOGADO@despacho.com', abogado.contrasena, 'Abogado');
  assert.equal(u.rol, 'Abogado');
  assert.equal(u.contrasena_hash, undefined); // el hash nunca sale del modelo
});

test('la bitácora no se puede borrar ni modificar', () => {
  assert.ok(db.obtener().prepare('SELECT COUNT(*) n FROM bitacora').get().n >= 2);
  assert.throws(() => db.obtener().exec('DELETE FROM bitacora'), /no se puede borrar/);
  assert.throws(() => db.obtener().exec("UPDATE bitacora SET accion = 'x'"), /no se puede modificar/);
});
