-- Esquema del prototipo. Se puede correr varias veces sin problema.

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol VARCHAR(20) NOT NULL CHECK (rol IN ('profesional', 'auxiliar'))
);

CREATE TABLE IF NOT EXISTS pacientes (
  id SERIAL PRIMARY KEY,
  documento VARCHAR(20) NOT NULL UNIQUE,
  nombre VARCHAR(120) NOT NULL,
  telefono VARCHAR(20),
  email VARCHAR(120),
  fecha_nacimiento DATE,
  -- autorización de tratamiento de datos (Ley 1581 de 2012)
  autoriza_datos BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS citas (
  id SERIAL PRIMARY KEY,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id),
  fecha_hora TIMESTAMPTZ NOT NULL,
  duracion_min INTEGER NOT NULL DEFAULT 30 CHECK (duracion_min > 0),
  estado VARCHAR(20) NOT NULL DEFAULT 'programada'
    CHECK (estado IN ('programada','confirmada','reprogramada','cancelada','atendida','no_asistio')),
  motivo VARCHAR(200),
  creado_por INTEGER REFERENCES usuarios(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- cada cambio de estado o de fecha de una cita queda guardado acá
CREATE TABLE IF NOT EXISTS citas_historial (
  id SERIAL PRIMARY KEY,
  cita_id INTEGER NOT NULL REFERENCES citas(id),
  estado_anterior VARCHAR(20),
  estado_nuevo VARCHAR(20) NOT NULL,
  fecha_anterior TIMESTAMPTZ,
  fecha_nueva TIMESTAMPTZ,
  nota VARCHAR(200),
  usuario_id INTEGER REFERENCES usuarios(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- La historia clínica nunca se edita. Si hay un error se crea una entrada
-- nueva que "reemplaza_a" la anterior, y la anterior se queda como estaba.
CREATE TABLE IF NOT EXISTS historia_entradas (
  id SERIAL PRIMARY KEY,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id),
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('motivo','antecedente','evolucion','orden')),
  contenido TEXT NOT NULL,
  autor_id INTEGER NOT NULL REFERENCES usuarios(id),
  reemplaza_a INTEGER REFERENCES historia_entradas(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION bloquear_cambios_historia() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La historia clínica no se puede modificar ni borrar, cree una corrección';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS historia_sin_cambios ON historia_entradas;
CREATE TRIGGER historia_sin_cambios
  BEFORE UPDATE OR DELETE ON historia_entradas
  FOR EACH ROW EXECUTE FUNCTION bloquear_cambios_historia();

CREATE TABLE IF NOT EXISTS bitacora (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id),
  accion VARCHAR(40) NOT NULL,
  paciente_id INTEGER,
  detalle VARCHAR(250),
  ip VARCHAR(60),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recordatorios (
  id SERIAL PRIMARY KEY,
  cita_id INTEGER NOT NULL REFERENCES citas(id),
  enviar_en TIMESTAMPTZ NOT NULL,
  estado VARCHAR(15) NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','enviado','fallido','cancelado')),
  intentos INTEGER NOT NULL DEFAULT 0,
  enviado_en TIMESTAMPTZ,
  error VARCHAR(250)
);

CREATE INDEX IF NOT EXISTS idx_citas_fecha ON citas(fecha_hora);
CREATE INDEX IF NOT EXISTS idx_historia_paciente ON historia_entradas(paciente_id);
CREATE INDEX IF NOT EXISTS idx_recordatorios_pendientes ON recordatorios(estado, enviar_en);
