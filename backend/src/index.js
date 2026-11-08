const app = require('./app');
const { iniciarRecordatorios } = require('./recordatorios');
const { iniciarRespaldoDiario } = require('./respaldo');

const puerto = process.env.PORT || 4000;

app.listen(puerto, () => {
  console.log(`API escuchando en el puerto ${puerto}`);
  iniciarRecordatorios();
  iniciarRespaldoDiario();
});
