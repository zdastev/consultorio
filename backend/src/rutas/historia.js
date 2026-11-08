const express = require('express');
const pool = require('../db');
const { soloRol } = require('../auth');
const { registrar } = require('../bitacora');

const router = express.Router();

// la historia clínica solo la ve y la escribe el profesional
router.use(soloRol('profesional'));

const TIPOS = ['motivo', 'antecedente', 'evolucion', 'orden'];

router.get('/:pacienteId', async (req, res, next) => {
  try {
    const p = await pool.query('SELECT id, documento, nombre, fecha_nacimiento FROM pacientes WHERE id = $1', [
      req.params.pacienteId,
    ]);
    if (p.rows.length === 0) return res.status(404).json({ error: 'Paciente no encontrado' });

    const entradas = await pool.query(
      `SELECT h.id, h.tipo, h.contenido, h.reemplaza_a, h.creado_en, u.nombre AS autor,
              NOT EXISTS (SELECT 1 FROM historia_entradas x WHERE x.reemplaza_a = h.id) AS vigente
       FROM historia_entradas h JOIN usuarios u ON u.id = h.autor_id
       WHERE h.paciente_id = $1
       ORDER BY h.creado_en, h.id`,
      [req.params.pacienteId]
    );

    // cada vez que alguien abre una historia queda anotado
    await registrar(req, 'consulta_historia', p.rows[0].id);
    res.json({ paciente: p.rows[0], entradas: entradas.rows });
  } catch (e) {
    next(e);
  }
});

router.post('/:pacienteId', async (req, res, next) => {
  try {
    const { tipo, contenido } = req.body;
    if (!TIPOS.includes(tipo)) return res.status(400).json({ error: 'Tipo de entrada no válido' });
    if (!contenido || !contenido.trim()) return res.status(400).json({ error: 'El contenido no puede estar vacío' });

    const p = await pool.query('SELECT id FROM pacientes WHERE id = $1', [req.params.pacienteId]);
    if (p.rows.length === 0) return res.status(404).json({ error: 'Paciente no encontrado' });

    const r = await pool.query(
      `INSERT INTO historia_entradas (paciente_id, tipo, contenido, autor_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.pacienteId, tipo, contenido.trim(), req.usuario.id]
    );
    await registrar(req, 'crea_entrada_historia', p.rows[0].id, `entrada ${r.rows[0].id}`);
    res.status(201).json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

// corregir = crear una entrada nueva que reemplaza a la anterior
router.post('/entradas/:id/corregir', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { contenido } = req.body;
    if (!contenido || !contenido.trim()) return res.status(400).json({ error: 'El contenido no puede estar vacío' });

    await client.query('BEGIN');
    const r = await client.query('SELECT * FROM historia_entradas WHERE id = $1 FOR UPDATE', [req.params.id]);
    const original = r.rows[0];
    if (!original) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Entrada no encontrada' });
    }

    const yaCorregida = await client.query('SELECT 1 FROM historia_entradas WHERE reemplaza_a = $1', [original.id]);
    if (yaCorregida.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Esa entrada ya fue corregida, corrija la versión más reciente' });
    }

    const nueva = await client.query(
      `INSERT INTO historia_entradas (paciente_id, tipo, contenido, autor_id, reemplaza_a)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [original.paciente_id, original.tipo, contenido.trim(), req.usuario.id, original.id]
    );
    await registrar(req, 'corrige_entrada_historia', original.paciente_id, `entrada ${original.id} -> ${nueva.rows[0].id}`, client);

    await client.query('COMMIT');
    res.status(201).json(nueva.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    next(e);
  } finally {
    client.release();
  }
});

module.exports = router;
