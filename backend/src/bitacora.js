const pool = require('./db');

// guarda quién hizo qué. Se le puede pasar un client si va dentro de una transacción
async function registrar(req, accion, pacienteId = null, detalle = null, client = pool) {
  const usuarioId = req.usuario ? req.usuario.id : null;
  await client.query(
    `INSERT INTO bitacora (usuario_id, accion, paciente_id, detalle, ip)
     VALUES ($1, $2, $3, $4, $5)`,
    [usuarioId, accion, pacienteId, detalle, req.ip]
  );
}

module.exports = { registrar };
