// Crea las tablas y, si la base está vacía, carga datos de prueba (todos inventados).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('../src/db');

async function crearTablas() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await pool.query(sql);
}

async function cargarDatosDePrueba() {
  const hay = await pool.query('SELECT COUNT(*)::int AS n FROM usuarios');
  if (hay.rows[0].n > 0) return false;

  await pool.query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES
     ('Dra. Laura Mejía', 'profesional@consultorio.test', $1, 'profesional'),
     ('Camila Ortiz', 'auxiliar@consultorio.test', $2, 'auxiliar')`,
    [await bcrypt.hash('Profesional123', 10), await bcrypt.hash('Auxiliar123', 10)]
  );

  await pool.query(
    `INSERT INTO pacientes (documento, nombre, telefono, email, fecha_nacimiento, autoriza_datos) VALUES
     ('1000000001', 'Andrés Felipe Gómez', '3001112233', 'andres.gomez@correo.test', '1990-04-12', TRUE),
     ('1000000002', 'María Fernanda Ruiz', '3004445566', 'maria.ruiz@correo.test', '1985-11-03', TRUE),
     ('1000000003', 'Carlos Eduardo Pardo', '3007778899', NULL, '1972-07-25', TRUE),
     ('1000000004', 'Sofía Alejandra Vargas', '3012223344', 'sofia.vargas@correo.test', '2001-01-30', TRUE),
     ('1000000005', 'Jorge Iván Castaño', '3025556677', 'jorge.castano@correo.test', '1968-09-09', TRUE)`
  );

  // unas citas para mañana y pasado mañana
  const dia = (dias, hora, min) => {
    const f = new Date();
    f.setDate(f.getDate() + dias);
    f.setHours(hora, min, 0, 0);
    return f;
  };
  const citas = [
    [1, dia(1, 9, 0), 'Control general'],
    [2, dia(1, 9, 30), 'Dolor de muela'],
    [3, dia(1, 11, 0), 'Limpieza'],
    [4, dia(2, 8, 30), 'Revisión'],
    [5, dia(2, 10, 0), 'Control de tratamiento'],
  ];
  for (const [pacienteId, fecha, motivo] of citas) {
    const c = await pool.query(
      `INSERT INTO citas (paciente_id, fecha_hora, motivo, creado_por) VALUES ($1, $2, $3, 2) RETURNING id`,
      [pacienteId, fecha, motivo]
    );
    await pool.query(
      `INSERT INTO citas_historial (cita_id, estado_nuevo, fecha_nueva, usuario_id) VALUES ($1, 'programada', $2, 2)`,
      [c.rows[0].id, fecha]
    );
    await pool.query(`INSERT INTO recordatorios (cita_id, enviar_en) VALUES ($1, $2)`, [
      c.rows[0].id,
      new Date(fecha.getTime() - 24 * 3600 * 1000),
    ]);
  }

  await pool.query(
    `INSERT INTO historia_entradas (paciente_id, tipo, contenido, autor_id) VALUES
     (1, 'motivo', 'Consulta por sensibilidad al frío en molar inferior derecho.', 1),
     (1, 'antecedente', 'Sin alergias conocidas. Última limpieza hace un año.', 1),
     (2, 'motivo', 'Control semestral.', 1)`
  );
  return true;
}

async function crearBD({ conDatos = true } = {}) {
  await crearTablas();
  if (conDatos) return cargarDatosDePrueba();
  return false;
}

module.exports = { crearBD };

// si se corre directamente: npm run crear-bd
if (require.main === module) {
  crearBD()
    .then((cargo) => {
      console.log(cargo ? 'Tablas creadas y datos de prueba cargados' : 'Tablas listas (ya había datos, no se tocaron)');
      return pool.end();
    })
    .catch((e) => {
      console.error('No se pudo crear la base:', e.message);
      process.exit(1);
    });
}
