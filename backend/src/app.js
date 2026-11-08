require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { requiereLogin } = require('./auth');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/salud', (req, res) => res.json({ ok: true }));

app.use('/api/auth', require('./rutas/auth'));

// todo lo que sigue necesita sesión
app.use('/api', requiereLogin);
app.use('/api/pacientes', require('./rutas/pacientes'));
app.use('/api/citas', require('./rutas/citas'));
app.use('/api/historia', require('./rutas/historia'));
app.use('/api/bitacora', require('./rutas/bitacora'));
app.use('/api/respaldos', require('./rutas/respaldos'));

// si algo falla y nadie lo atrapó
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = app;
