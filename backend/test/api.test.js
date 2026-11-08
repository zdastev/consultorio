// Pruebas del prototipo. Usan una base aparte (consultorio_test) para no tocar los datos reales.
// Correr con: npm test
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://citas:citas123@localhost:5432/consultorio_test';
process.env.JWT_SECRET = 'secreto-de-pruebas';
process.env.RESPALDOS_DIR = require('path').join(require('os').tmpdir(), 'respaldos-prueba');

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const pool = require('../src/db');
const app = require('../src/app');
const { crearBD } = require('../scripts/crearBD');
const { enviarPendientes, cambiarEnvio } = require('../src/recordatorios');

let server, base;
let tokenProfesional, tokenAuxiliar;

async function api(metodo, ruta, cuerpo, token) {
  const r = await fetch(base + ruta, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  let datos = null;
  try {
    datos = await r.json();
  } catch (e) {}
  return { status: r.status, datos };
}

// fecha futura, dias desde hoy a la hora indicada
function futuro(dias, hora = 9, min = 0) {
  const f = new Date();
  f.setDate(f.getDate() + dias);
  f.setHours(hora, min, 0, 0);
  return f.toISOString();
}

before(async () => {
  await crearBD({ conDatos: false });
  await pool.query(
    `TRUNCATE usuarios, pacientes, citas, citas_historial, historia_entradas, bitacora, recordatorios RESTART IDENTITY CASCADE`
  );
  await crearBD(); // carga los datos de prueba

  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;

  tokenProfesional = (await api('POST', '/api/auth/login', { email: 'profesional@consultorio.test', password: 'Profesional123' })).datos.token;
  tokenAuxiliar = (await api('POST', '/api/auth/login', { email: 'auxiliar@consultorio.test', password: 'Auxiliar123' })).datos.token;
});

after(async () => {
  cambiarEnvio();
  server.close();
  await pool.end();
});

// ---------- Citas ----------

test('CP-01 crear una cita en un horario libre', async () => {
  const r = await api('POST', '/api/citas', { paciente_id: 1, fecha_hora: futuro(10, 9, 0), motivo: 'Prueba' }, tokenAuxiliar);
  assert.equal(r.status, 201);
  assert.equal(r.datos.estado, 'programada');
});

test('CP-02 rechazar una cita que se cruza con otra', async () => {
  // la anterior es de 9:00 a 9:30, esta empieza 9:15
  const r = await api('POST', '/api/citas', { paciente_id: 2, fecha_hora: futuro(10, 9, 15) }, tokenAuxiliar);
  assert.equal(r.status, 409);
  assert.match(r.datos.error, /cruza/);
});

test('CP-02b una cita justo después de otra sí se puede', async () => {
  const r = await api('POST', '/api/citas', { paciente_id: 2, fecha_hora: futuro(10, 9, 30) }, tokenAuxiliar);
  assert.equal(r.status, 201);
});

test('CP-03 rechazar una cita en el pasado', async () => {
  const r = await api('POST', '/api/citas', { paciente_id: 1, fecha_hora: futuro(-1, 9, 0) }, tokenAuxiliar);
  assert.equal(r.status, 400);
});

test('CP-04 reprogramar guarda la fecha anterior en el historial', async () => {
  const c = await api('POST', '/api/citas', { paciente_id: 3, fecha_hora: futuro(11, 9, 0) }, tokenAuxiliar);
  const nuevaFecha = futuro(12, 14, 0);
  const r = await api('PATCH', `/api/citas/${c.datos.id}/reprogramar`, { fecha_hora: nuevaFecha, nota: 'Pidió cambio' }, tokenAuxiliar);
  assert.equal(r.status, 200);
  assert.equal(r.datos.estado, 'reprogramada');

  const h = await api('GET', `/api/citas/${c.datos.id}/historial`, null, tokenAuxiliar);
  const ultimo = h.datos[h.datos.length - 1];
  assert.equal(ultimo.estado_nuevo, 'reprogramada');
  assert.equal(new Date(ultimo.fecha_anterior).toISOString(), c.datos.fecha_hora);
  assert.equal(new Date(ultimo.fecha_nueva).toISOString(), nuevaFecha);
});

test('CP-05 no se puede reprogramar a un horario ocupado', async () => {
  const c = await api('POST', '/api/citas', { paciente_id: 4, fecha_hora: futuro(13, 9, 0) }, tokenAuxiliar);
  const r = await api('PATCH', `/api/citas/${c.datos.id}/reprogramar`, { fecha_hora: futuro(10, 9, 0) }, tokenAuxiliar);
  assert.equal(r.status, 409);
});

test('CP-06 cancelar una cita cancela su recordatorio y la cierra', async () => {
  const c = await api('POST', '/api/citas', { paciente_id: 4, fecha_hora: futuro(14, 9, 0) }, tokenAuxiliar);
  const r = await api('PATCH', `/api/citas/${c.datos.id}/estado`, { estado: 'cancelada', nota: 'No puede asistir' }, tokenAuxiliar);
  assert.equal(r.status, 200);

  const rec = await pool.query('SELECT estado FROM recordatorios WHERE cita_id = $1', [c.datos.id]);
  assert.deepEqual(rec.rows.map((x) => x.estado), ['cancelado']);

  const otra = await api('PATCH', `/api/citas/${c.datos.id}/reprogramar`, { fecha_hora: futuro(15, 9, 0) }, tokenAuxiliar);
  assert.equal(otra.status, 409);
  const otra2 = await api('PATCH', `/api/citas/${c.datos.id}/estado`, { estado: 'confirmada' }, tokenAuxiliar);
  assert.equal(otra2.status, 409);
});

test('CP-07 marcar una ausencia queda en el historial de la cita', async () => {
  const c = await api('POST', '/api/citas', { paciente_id: 5, fecha_hora: futuro(16, 9, 0) }, tokenAuxiliar);
  await api('PATCH', `/api/citas/${c.datos.id}/estado`, { estado: 'confirmada' }, tokenAuxiliar);
  const r = await api('PATCH', `/api/citas/${c.datos.id}/estado`, { estado: 'no_asistio' }, tokenAuxiliar);
  assert.equal(r.status, 200);

  const h = await api('GET', `/api/citas/${c.datos.id}/historial`, null, tokenAuxiliar);
  assert.deepEqual(h.datos.map((x) => x.estado_nuevo), ['programada', 'confirmada', 'no_asistio']);
});

test('CP-07b dos citas pedidas al mismo tiempo para el mismo horario: solo una se crea', async () => {
  const fecha = futuro(17, 10, 0);
  const [a, b] = await Promise.all([
    api('POST', '/api/citas', { paciente_id: 1, fecha_hora: fecha }, tokenAuxiliar),
    api('POST', '/api/citas', { paciente_id: 2, fecha_hora: fecha }, tokenProfesional),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [201, 409]);
});

// ---------- Seguridad ----------

test('CP-08 sin sesión no se puede entrar a ninguna ruta', async () => {
  assert.equal((await api('GET', '/api/pacientes')).status, 401);
  assert.equal((await api('GET', '/api/citas')).status, 401);
  assert.equal((await api('GET', '/api/historia/1')).status, 401);
  assert.equal((await api('GET', '/api/pacientes', null, 'token-inventado')).status, 401);
});

test('CP-09 la auxiliar no puede ver historias, bitácora ni respaldos', async () => {
  assert.equal((await api('GET', '/api/historia/1', null, tokenAuxiliar)).status, 403);
  assert.equal((await api('POST', '/api/historia/1', { tipo: 'evolucion', contenido: 'x' }, tokenAuxiliar)).status, 403);
  assert.equal((await api('GET', '/api/bitacora', null, tokenAuxiliar)).status, 403);
  assert.equal((await api('POST', '/api/respaldos', null, tokenAuxiliar)).status, 403);
});

test('CP-10 cada consulta a una historia queda en la bitácora', async () => {
  const r = await api('GET', '/api/historia/1', null, tokenProfesional);
  assert.equal(r.status, 200);

  const b = await api('GET', '/api/bitacora?paciente_id=1', null, tokenProfesional);
  const consulta = b.datos.find((x) => x.accion === 'consulta_historia');
  assert.ok(consulta, 'no apareció la consulta en la bitácora');
  assert.equal(consulta.usuario, 'Dra. Laura Mejía');
});

test('CP-11 un login fallido queda en la bitácora', async () => {
  const r = await api('POST', '/api/auth/login', { email: 'profesional@consultorio.test', password: 'mala' });
  assert.equal(r.status, 401);
  const b = await api('GET', '/api/bitacora', null, tokenProfesional);
  assert.ok(b.datos.some((x) => x.accion === 'login_fallido'));
});

test('CP-12 corregir una entrada no borra la original', async () => {
  const nueva = await api('POST', '/api/historia/2', { tipo: 'evolucion', contenido: 'Se aplicó anestesia en la zona 36' }, tokenProfesional);
  assert.equal(nueva.status, 201);

  const corr = await api('POST', `/api/historia/entradas/${nueva.datos.id}/corregir`, { contenido: 'Se aplicó anestesia en la zona 46' }, tokenProfesional);
  assert.equal(corr.status, 201);
  assert.equal(corr.datos.reemplaza_a, nueva.datos.id);

  const h = await api('GET', '/api/historia/2', null, tokenProfesional);
  const original = h.datos.entradas.find((e) => e.id === nueva.datos.id);
  const actual = h.datos.entradas.find((e) => e.id === corr.datos.id);
  assert.equal(original.contenido, 'Se aplicó anestesia en la zona 36');
  assert.equal(original.vigente, false);
  assert.equal(actual.vigente, true);

  // la original ya tiene corrección, no se puede volver a corregir
  const otra = await api('POST', `/api/historia/entradas/${nueva.datos.id}/corregir`, { contenido: 'otra' }, tokenProfesional);
  assert.equal(otra.status, 409);
});

test('CP-13 la base de datos rechaza modificar o borrar la historia clínica', async () => {
  await assert.rejects(pool.query(`UPDATE historia_entradas SET contenido = 'cambiado' WHERE id = 1`), /no se puede modificar/);
  await assert.rejects(pool.query(`DELETE FROM historia_entradas WHERE id = 1`), /no se puede modificar/);
});

test('CP-14 no se crea un paciente sin autorización de datos', async () => {
  const r = await api('POST', '/api/pacientes', { documento: '999', nombre: 'Prueba', autoriza_datos: false }, tokenAuxiliar);
  assert.equal(r.status, 400);
  const ok = await api('POST', '/api/pacientes', { documento: '999', nombre: 'Prueba', autoriza_datos: true }, tokenAuxiliar);
  assert.equal(ok.status, 201);
  const repetido = await api('POST', '/api/pacientes', { documento: '999', nombre: 'Otra', autoriza_datos: true }, tokenAuxiliar);
  assert.equal(repetido.status, 409);
});

// ---------- Recordatorios ----------

test('CP-15 el recordatorio se envía cuando llega su hora', async () => {
  const enviados = [];
  cambiarEnvio(async (m) => enviados.push(m));

  const c = await api('POST', '/api/citas', { paciente_id: 1, fecha_hora: futuro(20, 9, 0) }, tokenAuxiliar);
  const antes = await pool.query('SELECT estado, enviar_en FROM recordatorios WHERE cita_id = $1', [c.datos.id]);
  assert.equal(antes.rows[0].estado, 'pendiente');
  // todavía falta tiempo, no debe salir
  await enviarPendientes();
  assert.equal((await pool.query('SELECT estado FROM recordatorios WHERE cita_id = $1', [c.datos.id])).rows[0].estado, 'pendiente');

  // adelantamos la hora de envío para simular que ya llegó
  await pool.query(`UPDATE recordatorios SET enviar_en = NOW() - INTERVAL '1 minute' WHERE cita_id = $1`, [c.datos.id]);
  await enviarPendientes();
  const despues = await pool.query('SELECT estado, enviado_en FROM recordatorios WHERE cita_id = $1', [c.datos.id]);
  assert.equal(despues.rows[0].estado, 'enviado');
  assert.ok(enviados.some((m) => m.para === 'andres.gomez@correo.test'));
  cambiarEnvio();
});

test('CP-16 si el correo falla se reintenta y al tercer intento queda como fallido', async () => {
  cambiarEnvio(async () => {
    throw new Error('Servidor de correo no responde');
  });
  const c = await api('POST', '/api/citas', { paciente_id: 2, fecha_hora: futuro(21, 9, 0) }, tokenAuxiliar);

  for (let i = 1; i <= 3; i++) {
    await pool.query(`UPDATE recordatorios SET enviar_en = NOW() - INTERVAL '1 minute' WHERE cita_id = $1`, [c.datos.id]);
    await enviarPendientes();
    const r = (await pool.query('SELECT estado, intentos FROM recordatorios WHERE cita_id = $1', [c.datos.id])).rows[0];
    assert.equal(r.intentos, i);
    assert.equal(r.estado, i < 3 ? 'pendiente' : 'fallido');
  }
  cambiarEnvio();
});

test('CP-16b un paciente sin correo deja el recordatorio como fallido', async () => {
  cambiarEnvio(async () => {});
  const c = await api('POST', '/api/citas', { paciente_id: 3, fecha_hora: futuro(22, 9, 0) }, tokenAuxiliar);
  await pool.query(`UPDATE recordatorios SET enviar_en = NOW() - INTERVAL '1 minute' WHERE cita_id = $1`, [c.datos.id]);
  await enviarPendientes();
  const r = (await pool.query('SELECT estado, error FROM recordatorios WHERE cita_id = $1', [c.datos.id])).rows[0];
  assert.equal(r.estado, 'fallido');
  assert.match(r.error, /correo/);
  cambiarEnvio();
});

// ---------- Respaldos ----------

test('CP-17 restaurar un respaldo devuelve los datos como estaban', async () => {
  const contar = async () => ({
    pacientes: (await pool.query('SELECT COUNT(*)::int n FROM pacientes')).rows[0].n,
    citas: (await pool.query('SELECT COUNT(*)::int n FROM citas')).rows[0].n,
    historia: (await pool.query('SELECT COUNT(*)::int n FROM historia_entradas')).rows[0].n,
  });
  const antes = await contar();
  const fechaNac = (await pool.query('SELECT fecha_nacimiento FROM pacientes WHERE id = 1')).rows[0].fecha_nacimiento;

  const resp = await api('POST', '/api/respaldos', null, tokenProfesional);
  assert.equal(resp.status, 201);

  // simulamos un desastre: se pierde información y se agrega basura
  await pool.query('TRUNCATE historia_entradas, citas_historial, recordatorios, citas CASCADE');
  await pool.query(`INSERT INTO pacientes (documento, nombre) VALUES ('0000', 'Dato basura')`);
  assert.notDeepEqual(await contar(), antes);

  const rest = await api('POST', `/api/respaldos/${resp.datos.nombre}/restaurar`, null, tokenProfesional);
  assert.equal(rest.status, 200);

  assert.deepEqual(await contar(), antes);
  assert.equal((await pool.query(`SELECT COUNT(*)::int n FROM pacientes WHERE documento = '0000'`)).rows[0].n, 0);
  assert.equal((await pool.query('SELECT fecha_nacimiento FROM pacientes WHERE id = 1')).rows[0].fecha_nacimiento, fechaNac);

  // después de restaurar se puede seguir trabajando (las secuencias quedaron bien)
  const nueva = await api('POST', '/api/historia/1', { tipo: 'evolucion', contenido: 'Entrada posterior a la restauración' }, tokenProfesional);
  assert.equal(nueva.status, 201);
  // y la restauración quedó anotada
  const b = await api('GET', '/api/bitacora', null, tokenProfesional);
  assert.ok(b.datos.some((x) => x.accion === 'restaura_respaldo'));
});

test('CP-18 no se aceptan nombres de respaldo raros ni inexistentes', async () => {
  assert.equal((await api('POST', '/api/respaldos/..%2F..%2Fetc%2Fpasswd/restaurar', null, tokenProfesional)).status, 400);
  assert.equal((await api('POST', '/api/respaldos/respaldo-no-existe.json/restaurar', null, tokenProfesional)).status, 400);
});
