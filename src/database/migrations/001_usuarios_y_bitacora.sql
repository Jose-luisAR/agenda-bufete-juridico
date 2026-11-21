-- Migración inicial: usuarios y bitácora de auditoría.
-- Las demás tablas (clientes, expedientes, documentos, actividades, plazos,
-- días inhábiles) se agregan en migraciones nuevas: 002_..., 003_..., etc.

CREATE TABLE usuarios (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre           TEXT    NOT NULL,
  apellido_paterno TEXT    NOT NULL,
  apellido_materno TEXT,
  correo           TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  telefono         TEXT    NOT NULL CHECK (length(telefono) = 10),
  rol              TEXT    NOT NULL CHECK (rol IN ('Abogado', 'Pasante')),
  contrasena_hash  TEXT    NOT NULL,
  estado           TEXT    NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Inactivo')),
  creado_en        TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Bitácora de acciones críticas: no se puede modificar ni borrar (DFR, Confiabilidad).
CREATE TABLE bitacora (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id  INTEGER REFERENCES usuarios(id),
  accion      TEXT    NOT NULL,
  detalle     TEXT,
  fecha       TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TRIGGER bitacora_sin_cambios BEFORE UPDATE ON bitacora
BEGIN
  SELECT RAISE(ABORT, 'La bitácora no se puede modificar');
END;

CREATE TRIGGER bitacora_sin_borrar BEFORE DELETE ON bitacora
BEGIN
  SELECT RAISE(ABORT, 'La bitácora no se puede borrar');
END;
