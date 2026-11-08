import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Respaldos() {
  const [lista, setLista] = useState([]);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  async function cargar() {
    try {
      setLista(await api('/api/respaldos'));
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function crear() {
    setError('');
    setAviso('');
    try {
      const r = await api('/api/respaldos', { method: 'POST' });
      setAviso(`Copia creada: ${r.nombre}`);
      cargar();
    } catch (e) {
      setError(e.message);
    }
  }

  async function restaurar(nombre) {
    const seguro = window.confirm(
      'Al restaurar, los datos actuales se reemplazan por los de esta copia. ¿Desea continuar?'
    );
    if (!seguro) return;
    setError('');
    setAviso('');
    try {
      const r = await api(`/api/respaldos/${nombre}/restaurar`, { method: 'POST' });
      setAviso(`Copia restaurada: ${r.registros.pacientes} pacientes, ${r.registros.citas} citas, ${r.registros.historia_entradas} entradas de historia.`);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div>
      <h2>Copias de seguridad</h2>
      <p className="suave">El sistema hace una copia cada noche a las 2:00 a. m. y conserva las últimas 14. También puede crear una ahora.</p>

      {error && <p className="error" role="alert">{error}</p>}
      {aviso && <p className="aviso" role="status">{aviso}</p>}

      <button className="primario" onClick={crear}>Crear copia ahora</button>

      <table className="tabla">
        <thead>
          <tr>
            <th>Archivo</th>
            <th>Tamaño</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lista.length === 0 && (
            <tr><td colSpan="3" className="vacio">Todavía no hay copias. Cree la primera con el botón de arriba.</td></tr>
          )}
          {lista.map((f) => (
            <tr key={f.nombre}>
              <td>{f.nombre}</td>
              <td>{Math.round(f.tamano / 1024)} KB</td>
              <td><button className="peligro" onClick={() => restaurar(f.nombre)}>Restaurar</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
