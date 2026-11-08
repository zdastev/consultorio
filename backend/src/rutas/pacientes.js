const express = require('express');
const pool = require('../db');
const { registrar } = require('../bitacora');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const r = await pool.query(
      `SELECT id, documento, nombre, telefono, email, fecha_nacimiento, autoriza_datos
       FROM pacientes
       WHERE $1 = '' OR nombre ILIKE '%' || $1 || '%' OR documento LIKE $1 || '%'
       ORDER BY nombre
       LIMIT 100`,
      [q]
    );
    res.json(r.rows);
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const r = await pool.query('SELECT * FROM pacientes WHERE id = $1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Paciente no encontrado' });
    res.json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { documento, nombre, telefono, email, fecha_nacimiento, autoriza_datos } = req.body;

    if (!documento || !nombre) {
      return res.status(400).json({ error: 'El documento y el nombre son obligatorios' });
    }
    // sin autorización no se pueden guardar datos personales
    if (autoriza_datos !== true) {
      return res.status(400).json({ error: 'El paciente debe autorizar el tratamiento de sus datos' });
    }

    const r = await pool.query(
      `INSERT INTO pacientes (documento, nombre, telefono, email, fecha_nacimiento, autoriza_datos)
       VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING *`,
      [documento.trim(), nombre.trim(), telefono || null, email || null, fecha_nacimiento || null]
    );
    await registrar(req, 'crea_paciente', r.rows[0].id);
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un paciente con ese documento' });
    }
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { nombre, telefono, email, fecha_nacimiento } = req.body;
    const r = await pool.query(
      `UPDATE pacientes SET nombre = COALESCE($1, nombre), telefono = $2, email = $3,
              fecha_nacimiento = $4
       WHERE id = $5 RETURNING *`,
      [nombre || null, telefono || null, email || null, fecha_nacimiento || null, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Paciente no encontrado' });
    await registrar(req, 'edita_paciente', r.rows[0].id);
    res.json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
