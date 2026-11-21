-- Migración 002: tablas de los módulos 2 a 5 del DFR.

-- Módulo 1 (complemento): bloqueo por intentos fallidos y contraseña temporal
ALTER TABLE usuarios ADD COLUMN intentos_fallidos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN bloqueado_hasta TEXT;
ALTER TABLE usuarios ADD COLUMN debe_cambiar_contrasena INTEGER NOT NULL DEFAULT 0;

-- Módulo 2. Clientes
CREATE TABLE clientes (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo_persona       TEXT NOT NULL CHECK (tipo_persona IN ('Física', 'Moral')),
  nombre             TEXT,
  apellido_paterno   TEXT,
  apellido_materno   TEXT,
  razon_social       TEXT,
  telefono           TEXT NOT NULL CHECK (length(telefono) = 10),
  correo             TEXT,
  calle_numero       TEXT NOT NULL,
  colonia            TEXT NOT NULL,
  municipio          TEXT NOT NULL,
  estado_republica   TEXT NOT NULL,
  codigo_postal      TEXT NOT NULL,
  curp_rfc           TEXT UNIQUE,
  observaciones      TEXT,
  estado             TEXT NOT NULL DEFAULT 'Por confirmar'
                     CHECK (estado IN ('Por confirmar', 'Confirmado', 'Devuelto')),
  observaciones_devolucion TEXT,
  registrado_por     INTEGER NOT NULL REFERENCES usuarios(id),
  creado_en          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Asunto = expediente del sistema
CREATE TABLE asuntos (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  folio              TEXT NOT NULL UNIQUE,                 -- AS-2026-0001
  tipo_asunto        TEXT NOT NULL CHECK (tipo_asunto IN ('Divorcio voluntario', 'Pensión alimenticia',
                       'Rectificación de acta', 'Juicio sucesorio intestamentario', 'Cobro de pagaré', 'Otro')),
  materia            TEXT NOT NULL CHECK (materia IN ('Familiar', 'Civil', 'Mercantil')),
  descripcion        TEXT NOT NULL,
  contraparte        TEXT,
  abogado_id         INTEGER NOT NULL REFERENCES usuarios(id),
  pasante_id         INTEGER REFERENCES usuarios(id),
  numero_expediente  TEXT,                                 -- 245/2026 (lo asigna el juzgado)
  juzgado            TEXT,
  fecha_presentacion TEXT,
  estado             TEXT NOT NULL DEFAULT 'En preparación'
                     CHECK (estado IN ('En preparación', 'En trámite', 'Concluido')),
  fecha_conclusion   TEXT,
  motivo_conclusion  TEXT CHECK (motivo_conclusion IN ('Sentencia', 'Convenio', 'Desistimiento', 'Otro')),
  observaciones_conclusion TEXT,
  creado_en          TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (numero_expediente, juzgado)
);

CREATE TABLE asunto_clientes (
  asunto_id  INTEGER NOT NULL REFERENCES asuntos(id),
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  PRIMARY KEY (asunto_id, cliente_id)
);

CREATE TABLE documentos (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  asunto_id        INTEGER NOT NULL REFERENCES asuntos(id),
  nombre_archivo   TEXT NOT NULL,
  ruta             TEXT NOT NULL,                          -- copia dentro de la carpeta del expediente
  tipo_documento   TEXT NOT NULL CHECK (tipo_documento IN ('Evidencia', 'Escrito', 'Acuse', 'Resolución')),
  descripcion      TEXT,
  estado           TEXT NOT NULL CHECK (estado IN ('Pendiente', 'Autorizado', 'Rechazado')),
  motivo_rechazo   TEXT,
  subido_por       INTEGER NOT NULL REFERENCES usuarios(id),
  revisado_por     INTEGER REFERENCES usuarios(id),
  revisado_en      TEXT,
  creado_en        TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Los documentos autorizados no se pueden borrar (DFR, Confiabilidad)
CREATE TRIGGER documentos_autorizados_sin_borrar BEFORE DELETE ON documentos
WHEN OLD.estado = 'Autorizado'
BEGIN
  SELECT RAISE(ABORT, 'Un documento autorizado no se puede borrar');
END;

CREATE TABLE actuaciones (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  asunto_id      INTEGER NOT NULL REFERENCES asuntos(id),
  fecha          TEXT NOT NULL,
  tipo           TEXT NOT NULL CHECK (tipo IN ('Notificación', 'Acuerdo', 'Audiencia celebrada', 'Sentencia', 'Otra')),
  descripcion    TEXT NOT NULL,
  documento_id   INTEGER REFERENCES documentos(id),
  registrado_por INTEGER NOT NULL REFERENCES usuarios(id),
  creado_en      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Módulo 3. Agenda
CREATE TABLE actividades (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo            TEXT NOT NULL CHECK (tipo IN ('Audiencia', 'Cita con cliente', 'Diligencia')),
  titulo          TEXT NOT NULL,
  fecha           TEXT NOT NULL,                           -- AAAA-MM-DD
  hora_inicio     TEXT NOT NULL,                           -- HH:MM
  hora_fin        TEXT,
  lugar           TEXT NOT NULL,
  asunto_id       INTEGER REFERENCES asuntos(id),
  responsable_id  INTEGER NOT NULL REFERENCES usuarios(id),
  notas           TEXT,
  estado          TEXT NOT NULL DEFAULT 'Programada' CHECK (estado IN ('Programada', 'Realizada', 'Cancelada')),
  resultado       TEXT,
  motivo_cancelacion TEXT,
  creado_por      INTEGER NOT NULL REFERENCES usuarios(id),
  creado_en       TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Módulo 4. Radar de vencimientos
CREATE TABLE dias_inhabiles (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha_inicio TEXT NOT NULL,
  fecha_fin    TEXT,
  descripcion  TEXT NOT NULL,
  oficial      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE plazos (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  asunto_id          INTEGER NOT NULL REFERENCES asuntos(id),
  actuacion_pendiente TEXT NOT NULL,
  fecha_notificacion TEXT NOT NULL,
  dias_habiles       INTEGER CHECK (dias_habiles IS NULL OR dias_habiles > 0),
  fecha_vencimiento  TEXT NOT NULL,
  fecha_exacta       INTEGER NOT NULL DEFAULT 0,           -- 1 si la fecha la señaló el juzgado
  responsable_id     INTEGER NOT NULL REFERENCES usuarios(id),
  notas              TEXT,
  estado             TEXT NOT NULL DEFAULT 'Pendiente'
                     CHECK (estado IN ('Pendiente', 'Atendido', 'Atendido fuera de tiempo')),
  fecha_atendido     TEXT,
  documento_soporte_id INTEGER REFERENCES documentos(id),
  registrado_por     INTEGER NOT NULL REFERENCES usuarios(id),
  creado_en          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Módulo 5. Avisos de la campana
CREATE TABLE avisos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  texto       TEXT NOT NULL,
  pantalla    TEXT,                                        -- a dónde lleva al hacer clic
  referencia  INTEGER,
  leido       INTEGER NOT NULL DEFAULT 0,
  creado_en   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE configuracion (
  clave TEXT PRIMARY KEY,
  valor TEXT
);

CREATE INDEX idx_plazos_estado ON plazos (estado, fecha_vencimiento);
CREATE INDEX idx_actividades_fecha ON actividades (fecha);
CREATE INDEX idx_documentos_asunto ON documentos (asunto_id, estado);
CREATE INDEX idx_avisos_usuario ON avisos (usuario_id, leido);

-- Días de descanso obligatorio (art. 74 LFT) 2026-2027; el Abogado agrega los del tribunal.
INSERT INTO dias_inhabiles (fecha_inicio, descripcion, oficial) VALUES
  ('2026-01-01', 'Año Nuevo', 1),
  ('2026-02-02', 'Día de la Constitución', 1),
  ('2026-03-16', 'Natalicio de Benito Juárez', 1),
  ('2026-05-01', 'Día del Trabajo', 1),
  ('2026-09-16', 'Día de la Independencia', 1),
  ('2026-11-16', 'Día de la Revolución', 1),
  ('2026-12-25', 'Navidad', 1),
  ('2027-01-01', 'Año Nuevo', 1),
  ('2027-02-01', 'Día de la Constitución', 1),
  ('2027-03-15', 'Natalicio de Benito Juárez', 1),
  ('2027-05-01', 'Día del Trabajo', 1),
  ('2027-09-16', 'Día de la Independencia', 1),
  ('2027-11-15', 'Día de la Revolución', 1),
  ('2027-12-25', 'Navidad', 1);
