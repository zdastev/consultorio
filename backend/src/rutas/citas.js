const express = require('express');
const pool = require('../db');
const { registrar } = require('../bitacora');
const { crearRecordatorio, cancelarPendientes } = require('../recordatorios');

const router = express.Router();

const ESTADOS_ACTIVOS = ['programada', 'confirmada', 'reprogramada'];

// a qué estados se puede pasar desde cada uno
// ('reprogramada' no está porque eso se hace con su propia ruta)
const TRANSICIONES = {
  programada: ['confirmada', 'cancelada', 'atendida', 'no_asistio'],
  reprogramada: ['confirmada', 'cancelada', 'atendida', 'no_asistio'],
  confirmada: ['cancelada', 'atendida', 'no_asistio'],
  cancelada: [],
  atendida: [],
  no_asistio: [],
};

async function hayCruce(client, fechaHora, duracion, excluirId = 0) {
  const r = await client.query(
    `SELECT id FROM citas
     WHERE estado = ANY($4) AND id <> $3
       AND fecha_hora < $1::timestamptz + make_interval(mins => $2)
       AND fecha_hora + make_interval(mins => duracion_min) > $1::timestamptz
     LIMIT 1`,
    [fechaHora, duracion, excluirId, ESTADOS_ACTIVOS]
  );
  return r.rows.length > 0;
}

function fechaValida(texto) {
  const f = new Date(texto);
  return texto && !isNaN(f.getTime()) ? f : null;
}

router.get('/', async (req, res, next) => {
  try {
    // por defecto muestra desde hoy hasta dentro de 30 días
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const desde = fechaValida(req.query.desde) || hoy;
    const hasta = fechaValida(req.query.hasta) || new Date(desde.getTime() + 30 * 24 * 3600 * 1000);

    const r = await pool.query(
      `SELECT c.id, c.fecha_hora, c.duracion_min, c.estado, c.motivo,
              p.id AS paciente_id, p.nombre AS paciente, p.telefono,
              (SELECT estado FROM recordatorios WHERE cita_id = c.id ORDER BY id DESC LIMIT 1) AS recordatorio
       FROM citas c JOIN pacientes p ON p.id = c.paciente_id
       WHERE c.fecha_hora >= $1 AND c.fecha_hora < $2
       ORDER BY c.fecha_hora`,
      [desde, hasta]
    );
    res.json(r.rows);
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { paciente_id, fecha_hora, motivo } = req.body;
    const duracion = Number(req.body.duracion_min || 30);

    const fecha = fechaValida(fecha_hora);
    if (!paciente_id || !fecha) {
      return res.status(400).json({ error: 'Falta el paciente o la fecha de la cita no es válida' });
    }
    if (fecha <= new Date()) {
      return res.status(400).json({ error: 'No se puede agendar una cita en el pasado' });
    }
    if (!Number.isInteger(duracion) || duracion < 10 || duracion > 240) {
      return res.status(400).json({ error: 'La duración debe estar entre 10 y 240 minutos' });
    }

    await client.query('BEGIN');
    // un solo profesional: bloqueamos la agenda para que dos personas
    // no puedan tomar el mismo horario al mismo tiempo
    await client.query('SELECT pg_advisory_xact_lock(1)');

    const paciente = await client.query('SELECT id FROM pacientes WHERE id = $1', [paciente_id]);
    if (paciente.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    if (await hayCruce(client, fecha, duracion)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Ese horario se cruza con otra cita' });
    }

    const cita = await client.query(
      `INSERT INTO citas (paciente_id, fecha_hora, duracion_min, motivo, creado_por)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [paciente_id, fecha, duracion, motivo || null, req.usuario.id]
    );
    await client.query(
      `INSERT INTO citas_historial (cita_id, estado_nuevo, fecha_nueva, usuario_id)
       VALUES ($1, 'programada', $2, $3)`,
      [cita.rows[0].id, fecha, req.usuario.id]
    );
    await crearRecordatorio(client, cita.rows[0].id, fecha);
    await registrar(req, 'crea_cita', paciente_id, `cita ${cita.rows[0].id}`, client);

    await client.query('COMMIT');
    res.status(201).json(cita.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    next(e);
  } finally {
    client.release();
  }
});

// cambiar el estado: confirmar, cancelar, marcar atendida o no asistió
router.patch('/:id/estado', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { estado, nota } = req.body;
    if (!Object.keys(TRANSICIONES).includes(estado)) {
      return res.status(400).json({ error: 'Estado no válido' });
    }

    await client.query('BEGIN');
    const r = await client.query('SELECT * FROM citas WHERE id = $1 FOR UPDATE', [req.params.id]);
    const cita = r.rows[0];
    if (!cita) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    if (!TRANSICIONES[cita.estado].includes(estado)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Una cita ${cita.estado} no puede pasar a ${estado}` });
    }

    await client.query('UPDATE citas SET estado = $1 WHERE id = $2', [estado, cita.id]);
    await client.query(
      `INSERT INTO citas_historial (cita_id, estado_anterior, estado_nuevo, fecha_anterior, fecha_nueva, nota, usuario_id)
       VALUES ($1, $2, $3, $4, $4, $5, $6)`,
      [cita.id, cita.estado, estado, cita.fecha_hora, nota || null, req.usuario.id]
    );
    // si ya no va a pasar, el recordatorio sobra
    if (!ESTADOS_ACTIVOS.includes(estado)) await cancelarPendientes(client, cita.id);
    await registrar(req, 'estado_cita', cita.paciente_id, `cita ${cita.id}: ${cita.estado} -> ${estado}`, client);

    await client.query('COMMIT');
    res.json({ id: cita.id, estado });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    next(e);
  } finally {
    client.release();
  }
});

router.patch('/:id/reprogramar', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const fecha = fechaValida(req.body.fecha_hora);
    if (!fecha || fecha <= new Date()) {
      return res.status(400).json({ error: 'Escriba una fecha futura válida' });
    }

    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(1)');

    const r = await client.query('SELECT * FROM citas WHERE id = $1 FOR UPDATE', [req.params.id]);
    const cita = r.rows[0];
    if (!cita) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cita no encontrada' });
    }
    if (!ESTADOS_ACTIVOS.includes(cita.estado)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `No se puede reprogramar una cita ${cita.estado}` });
    }
    if (await hayCruce(client, fecha, cita.duracion_min, cita.id)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Ese horario se cruza con otra cita' });
    }

    await client.query(`UPDATE citas SET fecha_hora = $1, estado = 'reprogramada' WHERE id = $2`, [fecha, cita.id]);
    await client.query(
      `INSERT INTO citas_historial (cita_id, estado_anterior, estado_nuevo, fecha_anterior, fecha_nueva, nota, usuario_id)
       VALUES ($1, $2, 'reprogramada', $3, $4, $5, $6)`,
      [cita.id, cita.estado, cita.fecha_hora, fecha, req.body.nota || null, req.usuario.id]
    );
    // el recordatorio viejo ya no sirve, se crea uno con la fecha nueva
    await cancelarPendientes(client, cita.id);
    await crearRecordatorio(client, cita.id, fecha);
    await registrar(req, 'reprograma_cita', cita.paciente_id, `cita ${cita.id}`, client);

    await client.query('COMMIT');
    res.json({ id: cita.id, estado: 'reprogramada', fecha_hora: fecha });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    next(e);
  } finally {
    client.release();
  }
});

router.get('/:id/historial', async (req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT h.*, u.nombre AS usuario
       FROM citas_historial h LEFT JOIN usuarios u ON u.id = h.usuario_id
       WHERE h.cita_id = $1 ORDER BY h.id`,
      [req.params.id]
    );
    res.json(r.rows);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
