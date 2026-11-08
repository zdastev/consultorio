require('dotenv').config();
const { Pool, types } = require('pg');

// tipo 1082 = DATE, lo dejamos como texto 'YYYY-MM-DD'
types.setTypeParser(1082, (valor) => valor);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // en Render la base exige ssl, en local no
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

module.exports = pool;
