// Uso:
//   npm run respaldo                         -> crea un respaldo
//   npm run restaurar -- respaldo-XXXX.json  -> restaura ese respaldo
require('dotenv').config();
const pool = require('../src/db');
const { crearRespaldo, restaurarRespaldo, listarRespaldos } = require('../src/respaldo');

async function main() {
  const [accion, nombre] = process.argv.slice(2);

  if (accion === 'crear') {
    const r = await crearRespaldo();
    console.log('Respaldo creado:', r.nombre);
    console.log(r.registros);
  } else if (accion === 'restaurar') {
    if (!nombre) {
      console.log('Falta el nombre del respaldo. Los que hay son:');
      listarRespaldos().forEach((f) => console.log(' -', f.nombre));
      return;
    }
    const r = await restaurarRespaldo(nombre);
    console.log('Respaldo restaurado:', r.nombre);
    console.log(r.registros);
  } else {
    console.log('Use "crear" o "restaurar"');
  }
}

main()
  .catch((e) => {
    console.error('Error:', e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
