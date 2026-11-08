import { useEffect, useState } from 'react';
import { api, formatoFecha } from '../api.js';

const TIPOS = {
  motivo: 'Motivo de consulta',
  antecedente: 'Antecedente',
  evolucion: 'Evolución',
  orden: 'Orden',
};

export default function Historia({ pacienteInicial }) {
  const [pacientes, setPacientes] = useState([]);
  const [pacienteId, setPacienteId] = useState(pacienteInicial || '');
  const [historia, setHistoria] = useState(null);
  const [verAnteriores, setVerAnteriores] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const [nuevaEntrada, setNuevaEntrada] = useState({ tipo: 'evolucion', contenido: '' });
  const [corrigiendo, setCorrigiendo] = useState(null);
  const [textoCorreccion, setTextoCorreccion] = useState('');

  useEffect(() => {
    api('/api/pacientes').then(setPacientes).catch((e) => setError(e.message));
  }, []);

  async function cargar(id) {
    setError('');
    try {
      setHistoria(await api(`/api/historia/${id}`));
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    if (pacienteId) cargar(pacienteId);
    else setHistoria(null);
  }, [pacienteId]);

  async function agregar(e) {
    e.preventDefault();
    setError('');
    setAviso('');
    try {
      await api(`/api/historia/${pacienteId}`, { method: 'POST', body: nuevaEntrada });
      setNuevaEntrada({ ...nuevaEntrada, contenido: '' });
      setAviso('Entrada guardada');
      cargar(pacienteId);
    } catch (err) {
      setError(err.message);
    }
  }

  async function corregir(entrada) {
    setError('');
    setAviso('');
    try {
      await api(`/api/historia/entradas/${entrada.id}/corregir`, { method: 'POST', body: { contenido: textoCorreccion } });
      setCorrigiendo(null);
      setAviso('Corrección guardada. La versión anterior se conserva en el historial.');
      cargar(pacienteId);
    } catch (err) {
      setError(err.message);
    }
  }

  const entradas = historia ? historia.entradas.filter((e) => verAnteriores || e.vigente) : [];

  return (
    <div>
      <h2>Historias clínicas</h2>

      <label className="buscador">
        Paciente
        <select value={pacienteId} onChange={(e) => setPacienteId(e.target.value)}>
          <option value="">Elija un paciente</option>
          {pacientes.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre} ({p.documento})</option>
          ))}
        </select>
      </label>

      {error && <p className="error" role="alert">{error}</p>}
      {aviso && <p className="aviso" role="status">{aviso}</p>}

      {historia && (
        <>
          <p className="suave">
            Historia de <strong>{historia.paciente.nombre}</strong>, documento {historia.paciente.documento}. Este acceso quedó
            registrado en la bitácora.
          </p>

          <label className="casilla">
            <input type="checkbox" checked={verAnteriores} onChange={(e) => setVerAnteriores(e.target.checked)} />
            Mostrar también las versiones reemplazadas por una corrección
          </label>

          <ul className="entradas">
            {entradas.length === 0 && <li className="vacio">Esta historia todavía no tiene entradas.</li>}
            {entradas.map((e) => (
              <li key={e.id} className={e.vigente ? 'entrada' : 'entrada reemplazada'}>
                <div className="entrada-cab">
                  <strong>{TIPOS[e.tipo]}</strong>
                  <span className="suave pequeno">
                    {formatoFecha(e.creado_en)} · {e.autor}
                    {e.reemplaza_a && ' · corrige una entrada anterior'}
                    {!e.vigente && ' · reemplazada'}
                  </span>
                </div>
                <p>{e.contenido}</p>
                {e.vigente && corrigiendo !== e.id && (
                  <button className="enlace" onClick={() => { setCorrigiendo(e.id); setTextoCorreccion(e.contenido); }}>
                    Corregir
                  </button>
                )}
                {corrigiendo === e.id && (
                  <div className="cita-extra">
                    <textarea rows="3" value={textoCorreccion} onChange={(ev) => setTextoCorreccion(ev.target.value)} />
                    <button className="primario" onClick={() => corregir(e)}>Guardar corrección</button>
                    <button className="enlace" onClick={() => setCorrigiendo(null)}>Dejar como está</button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          <form className="formulario" onSubmit={agregar}>
            <h3>Agregar una entrada</h3>
            <label>
              Tipo
              <select value={nuevaEntrada.tipo} onChange={(e) => setNuevaEntrada({ ...nuevaEntrada, tipo: e.target.value })}>
                {Object.entries(TIPOS).map(([clave, texto]) => (
                  <option key={clave} value={clave}>{texto}</option>
                ))}
              </select>
            </label>
            <label>
              Contenido
              <textarea rows="4" value={nuevaEntrada.contenido} onChange={(e) => setNuevaEntrada({ ...nuevaEntrada, contenido: e.target.value })} required />
            </label>
            <button className="primario">Guardar entrada</button>
          </form>
        </>
      )}
    </div>
  );
}
