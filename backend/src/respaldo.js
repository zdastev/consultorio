const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const pool = require('./db');

const CARPETA = process.env.RESPALDOS_DIR || path.join(__dirname, '..', 'backups');

// el orden importa por las llaves foráneas
const TABLAS = ['usuarios', 'pacientes', 'citas', 'citas_historial', 'historia_entradas', 'bitacora', 'recordatorios'];

async function crearRespaldo() {
  fs.mkdirSync(CARPETA, { recursive: true });

  const contenido = { creado_en: new Date().toISOString(), tablas: {} };
  for (const tabla of TABLAS) {
    // le pedimos a postgres que arme el json para que las fechas queden exactas
    const r = await pool.query(`SELECT COALESCE(json_agg(t ORDER BY t.id), '[]'::json) AS filas FROM ${tabla} t`);
    contenido.tablas[tabla] = r.rows[0].filas;
  }

  const nombre = `respaldo-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(path.join(CARPETA, nombre), JSON.stringify(contenido));

  const resumen = {};
  for (const tabla of TABLAS) resumen[tabla] = contenido.tablas[tabla].length;
  return { nombre, registros: resumen };
}

function listarRespaldos() {
  if (!fs.existsSync(CARPETA)) return [];
  return fs
    .readdirSync(CARPETA)
    .filter((f) => /^respaldo-.*\.json$/.test(f))
    .map((f) => ({ nombre: f, tamano: fs.statSync(path.join(CARPETA, f)).size }))
    .sort((a, b) => b.nombre.localeCompare(a.nombre));
}

async function restaurarRespaldo(nombre) {
  if (!/^respaldo-[\w.-]+\.json$/.test(nombre)) throw new Error('Nombre de respaldo no válido');
  const ruta = path.join(CARPETA, nombre);
  if (!fs.existsSync(ruta)) throw new Error('No existe ese respaldo');

  const datos = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  for (const tabla of TABLAS) {
    if (!Array.isArray(datos.tablas && datos.tablas[tabla])) {
      throw new Error(`El respaldo está incompleto (falta ${tabla})`);
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`TRUNCATE ${TABLAS.join(', ')} RESTART IDENTITY CASCADE`);

    for (const tabla of TABLAS) {
      const filas = datos.tablas[tabla];
      if (filas.length === 0) continue;
      await client.query(`INSERT INTO ${tabla} SELECT * FROM json_populate_recordset(null::${tabla}, $1::json)`, [
        JSON.stringify(filas),
      ]);
      // las secuencias quedan en cero tras el truncate, las ponemos al día
      await client.query(
        `SELECT setval(pg_get_serial_sequence('${tabla}', 'id'), (SELECT MAX(id) FROM ${tabla}))`
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  const resumen = {};
  for (const tabla of TABLAS) resumen[tabla] = datos.tablas[tabla].length;
  return { nombre, registros: resumen };
}

// todos los días a las 2 de la mañana, y se dejan los últimos 14 respaldos
function iniciarRespaldoDiario() {
  cron.schedule('0 2 * * *', async () => {
    try {
      const r = await crearRespaldo();
      console.log('Respaldo automático creado:', r.nombre);
      listarRespaldos()
        .slice(14)
        .forEach((f) => fs.unlinkSync(path.join(CARPETA, f.nombre)));
    } catch (e) {
      console.error('Falló el respaldo automático:', e.message);
    }
  });
}

module.exports = { crearRespaldo, listarRespaldos, restaurarRespaldo, iniciarRespaldoDiario };
