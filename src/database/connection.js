// Acceso a la base de datos SQLite. Es el único archivo que sabe qué motor
// se usa (DFR, Reusabilidad: separar el acceso a datos del resto del sistema).
// Usa el SQLite que ya viene integrado en Node.js/Electron (node:sqlite),
// así no hay que instalar ni compilar ninguna librería nativa en Windows.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// Conexión única a la base de datos (se abre una sola vez al iniciar el sistema)
let db = null;

// Abre (o crea) el archivo agenda.db, activa las llaves foráneas y aplica las migraciones pendientes
function abrir(rutaArchivo) {
  if (db) return db;
  fs.mkdirSync(path.dirname(rutaArchivo), { recursive: true });
  db = new DatabaseSync(rutaArchivo);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrar();
  return db;
}

// Ejecuta una función dentro de una transacción: se guarda todo o nada
// (DFR, Confiabilidad: "guardar cada operación completa o no guardarla").
function transaccion(fn) {
  obtener().exec('BEGIN');
  try {
    const resultado = fn();
    db.exec('COMMIT');
    return resultado;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

// Ejecuta en orden los archivos de src/database/migrations que aún no se aplican.
function migrar() {
  db.exec('CREATE TABLE IF NOT EXISTS migraciones (nombre TEXT PRIMARY KEY, aplicada_en TEXT NOT NULL)');
  const carpeta = path.join(__dirname, 'migrations');
  const aplicadas = new Set(db.prepare('SELECT nombre FROM migraciones').all().map((m) => m.nombre));
  const archivos = fs.readdirSync(carpeta).filter((f) => f.endsWith('.sql')).sort();
  for (const archivo of archivos) {
    if (aplicadas.has(archivo)) continue;
    const sql = fs.readFileSync(path.join(carpeta, archivo), 'utf8');
    transaccion(() => {
      db.exec(sql);
      db.prepare("INSERT INTO migraciones (nombre, aplicada_en) VALUES (?, datetime('now','localtime'))").run(archivo);
    });
  }
}

// Devuelve la conexión abierta
function obtener() {
  if (!db) throw new Error('La base de datos no está abierta');
  return db;
}

// Cierra la base de datos al salir del sistema
function cerrar() {
  if (db) db.close();
  db = null;
}

// Atajos para los modelos. Los parámetros van separados del SQL (evita la inyección de código).
// Si se pasa un objeto con parámetros con nombre (:campo), solo se usan los campos que
// aparecen en el SQL; los que falten se guardan como NULL.
function parametros(sql, p) {
  if (p.length !== 1 || p[0] === null || typeof p[0] !== 'object') return p;
  const nombres = new Set([...sql.matchAll(/:([A-Za-z_]\w*)/g)].map((m) => m[1]));
  const limpio = {};
  for (const n of nombres) limpio[n] = p[0][n] === undefined || p[0][n] === '' ? null : p[0][n];
  return [limpio];
}
// todos() devuelve varias filas, uno() una sola fila y ejecutar() sirve para INSERT, UPDATE y DELETE
const todos = (sql, ...p) => obtener().prepare(sql).all(...parametros(sql, p));
const uno = (sql, ...p) => obtener().prepare(sql).get(...parametros(sql, p)) || null;
const ejecutar = (sql, ...p) => obtener().prepare(sql).run(...parametros(sql, p));

module.exports = { abrir, obtener, cerrar, transaccion, todos, uno, ejecutar };
