const express = require('express');
const pool = require('../db');
const { soloRol } = require('../auth');

const router = express.Router();

router.use(soloRol('profesional'));

router.get('/', async (req, res, next) => {
  try {
    const limite = Math.min(Number(req.query.limite) || 100, 500);
    const r = await pool.query(
      `SELECT b.id, b.accion, b.detalle, b.ip, b.creado_en, b.paciente_id,
              u.nombre AS usuario, p.nombre AS paciente
       FROM bitacora b
       LEFT JOIN usuarios u ON u.id = b.usuario_id
       LEFT JOIN pacientes p ON p.id = b.paciente_id
       WHERE ($1::int IS NULL OR b.paciente_id = $1)
       ORDER BY b.id DESC
       LIMIT $2`,
      [req.query.paciente_id || null, limite]
    );
    res.json(r.rows);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
