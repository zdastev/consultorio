const cron = require('node-cron');
const nodemailer = require('nodemailer');
const pool = require('./db');

const HORAS_ANTES = Number(process.env.HORAS_RECORDATORIO || 24);
const MAX_INTENTOS = 3;
const MINUTOS_ENTRE_INTENTOS = 5;

// ---- envío del correo ----

async function enviarPorCorreo({ para, asunto, texto }) {
  // sin SMTP configurado solo lo mostramos en consola (modo simulado)
  if (!process.env.SMTP_HOST) {
    console.log(`[recordatorio simulado] para ${para}: ${asunto}`);
    return;
  }
  const transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporte.sendMail({ from: process.env.SMTP_FROM, to: para, subject: asunto, text: texto });
}

let enviar = enviarPorCorreo;
// los tests lo usan para simular que el correo falla
function cambiarEnvio(fn) {
  enviar = fn || enviarPorCorreo;
}

// ---- manejo de los registros ----

async function crearRecordatorio(client, citaId, fechaHora) {
  const cita = new Date(fechaHora);
  if (cita <= new Date()) return;

  let cuando = new Date(cita.getTime() - HORAS_ANTES * 60 * 60 * 1000);
  // si la cita queda muy cerca, que salga de una vez
  if (cuando < new Date()) cuando = new Date();

  await client.query('INSERT INTO recordatorios (cita_id, enviar_en) VALUES ($1, $2)', [citaId, cuando]);
}

async function cancelarPendientes(client, citaId) {
  await client.query(
    `UPDATE recordatorios SET estado = 'cancelado' WHERE cita_id = $1 AND estado = 'pendiente'`,
    [citaId]
  );
}

// ---- proceso que corre cada minuto ----

async function enviarPendientes() {
  const pendientes = await pool.query(
    `SELECT r.id, r.intentos, c.fecha_hora, p.nombre, p.email
     FROM recordatorios r
     JOIN citas c ON c.id = r.cita_id
     JOIN pacientes p ON p.id = c.paciente_id
     WHERE r.estado = 'pendiente' AND r.enviar_en <= NOW()
       AND c.estado IN ('programada', 'confirmada', 'reprogramada')
     ORDER BY r.enviar_en
     LIMIT 20`
  );

  for (const r of pendientes.rows) {
    if (!r.email) {
      await pool.query(
        `UPDATE recordatorios SET estado = 'fallido', error = 'El paciente no tiene correo' WHERE id = $1`,
        [r.id]
      );
      continue;
    }

    const fecha = new Date(r.fecha_hora).toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      dateStyle: 'full',
      timeStyle: 'short',
    });

    try {
      await enviar({
        para: r.email,
        asunto: 'Recordatorio de su cita',
        texto: `Hola ${r.nombre}, le recordamos que tiene una cita el ${fecha}. Si no puede asistir, por favor avísenos con tiempo.`,
      });
      await pool.query(`UPDATE recordatorios SET estado = 'enviado', enviado_en = NOW() WHERE id = $1`, [r.id]);
    } catch (e) {
      const intentos = r.intentos + 1;
      if (intentos >= MAX_INTENTOS) {
        await pool.query(
          `UPDATE recordatorios SET estado = 'fallido', intentos = $2, error = $3 WHERE id = $1`,
          [r.id, intentos, String(e.message).slice(0, 250)]
        );
      } else {
        // se deja pendiente y se vuelve a intentar en unos minutos
        await pool.query(
          `UPDATE recordatorios
           SET intentos = $2, error = $3, enviar_en = NOW() + make_interval(mins => $4)
           WHERE id = $1`,
          [r.id, intentos, String(e.message).slice(0, 250), MINUTOS_ENTRE_INTENTOS]
        );
      }
    }
  }
}

function iniciarRecordatorios() {
  cron.schedule('* * * * *', () => {
    enviarPendientes().catch((e) => console.error('Error enviando recordatorios:', e.message));
  });
}

module.exports = { crearRecordatorio, cancelarPendientes, enviarPendientes, iniciarRecordatorios, cambiarEnvio };
