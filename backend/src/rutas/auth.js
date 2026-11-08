const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { crearToken } = require('../auth');
const { registrar } = require('../bitacora');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Escriba el correo y la contraseña' });
    }

    const r = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email.trim().toLowerCase()]);
    const usuario = r.rows[0];
    const clave_ok = usuario && (await bcrypt.compare(password, usuario.password_hash));

    if (!clave_ok) {
      await registrar(req, 'login_fallido', null, `correo: ${email}`.slice(0, 250));
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }

    req.usuario = usuario;
    await registrar(req, 'login');

    res.json({
      token: crearToken(usuario),
      usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
