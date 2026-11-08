const express = require('express');
const { soloRol } = require('../auth');
const { registrar } = require('../bitacora');
const { crearRespaldo, listarRespaldos, restaurarRespaldo } = require('../respaldo');

const router = express.Router();

router.use(soloRol('profesional'));

router.get('/', (req, res) => {
  res.json(listarRespaldos());
});

router.post('/', async (req, res, next) => {
  try {
    const r = await crearRespaldo();
    await registrar(req, 'crea_respaldo', null, r.nombre);
    res.status(201).json(r);
  } catch (e) {
    next(e);
  }
});

router.post('/:nombre/restaurar', async (req, res, next) => {
  try {
    const r = await restaurarRespaldo(req.params.nombre);
    // la bitácora quedó con lo que traía el respaldo, anotamos la restauración al final
    await registrar(req, 'restaura_respaldo', null, r.nombre);
    res.json(r);
  } catch (e) {
    if (/no válido|No existe|incompleto/.test(e.message)) {
      return res.status(400).json({ error: e.message });
    }
    next(e);
  }
});

module.exports = router;
