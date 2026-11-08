import { useEffect, useState } from 'react';
import { api, formatoFecha } from '../api.js';

const NOMBRE_ACCION = {
  login: 'Inició sesión',
  login_fallido: 'Intento de sesión fallido',
  consulta_historia: 'Consultó una historia clínica',
  crea_entrada_historia: 'Agregó una entrada a una historia',
  corrige_entrada_historia: 'Corrigió una entrada de una historia',
  crea_paciente: 'Registró un paciente',
  edita_paciente: 'Editó un paciente',
  crea_cita: 'Agendó una cita',
  estado_cita: 'Cambió el estado de una cita',
  reprograma_cita: 'Reprogramó una cita',
  crea_respaldo: 'Creó una copia de seguridad',
  restaura_respaldo: 'Restauró una copia de seguridad',
};

export default function Bitacora() {
  const [filas, setFilas] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/bitacora?limite=200').then(setFilas).catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <h2>Bitácora de accesos</h2>
      <p className="suave">Los últimos 200 movimientos del sistema, del más reciente al más antiguo.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <table className="tabla">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Usuario</th>
            <th>Acción</th>
            <th>Paciente</th>
            <th>Detalle</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id}>
              <td>{formatoFecha(f.creado_en)}</td>
              <td>{f.usuario || '-'}</td>
              <td>{NOMBRE_ACCION[f.accion] || f.accion}</td>
              <td>{f.paciente || '-'}</td>
              <td>{f.detalle || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
