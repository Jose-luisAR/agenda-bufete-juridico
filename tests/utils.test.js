// Pruebas unitarias de las utilerías compartidas. Ejecutar con: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { validar } = require('../src/utils/validaciones');
const { calcularVencimiento, semaforo, clave } = require('../src/utils/diasHabiles');

test('valida teléfono de 10 dígitos', () => {
  assert.equal(validar.telefono('7341061643'), null);
  assert.ok(validar.telefono('73410'));
});

test('valida correo electrónico', () => {
  assert.equal(validar.correo('abogado@despacho.com'), null);
  assert.ok(validar.correo('abogado@'));
});

test('contraseña con 8 caracteres, letras y números', () => {
  assert.equal(validar.contrasena('Basurto2026'), null);
  assert.ok(validar.contrasena('solotexto'));
  assert.ok(validar.contrasena('1234567'));
});

test('el vencimiento salta fines de semana', () => {
  // Notificación el viernes 23/10/2026, plazo de 3 días hábiles -> miércoles 28/10/2026
  const v = calcularVencimiento(new Date(2026, 9, 23), 3);
  assert.equal(clave(v), '2026-10-28');
});

test('el vencimiento salta días inhábiles', () => {
  // Lunes 16/11/2026 es inhábil -> el plazo de 1 día desde el viernes 13 vence el martes 17
  const v = calcularVencimiento(new Date(2026, 10, 13), 1, new Set(['2026-11-16']));
  assert.equal(clave(v), '2026-11-17');
});

test('ejemplo del DFR 4.6: 8 días desde el viernes 2/10/2026 vence el 14/10/2026', () => {
  assert.equal(clave(calcularVencimiento(new Date(2026, 9, 2), 8)), '2026-10-14');
});

test('semáforo de urgencia', () => {
  assert.equal(semaforo(-1).etiqueta, 'Urgente');
  assert.equal(semaforo(7).etiqueta, 'Próximo');
  assert.equal(semaforo(8).etiqueta, 'En tiempo');
  assert.equal(semaforo(1).etiqueta, 'Urgente');
  assert.equal(semaforo(4).etiqueta, 'Próximo');
  assert.equal(semaforo(10).etiqueta, 'En tiempo');
});
