import { useEffect, useState } from 'react';
import { api, formatoFecha, formatoHora } from '../api.js';

const NOMBRE_ESTADO = {
  programada: 'Programada',
  confirmada: 'Confirmada',
  reprogramada: 'Reprogramada',
  cancelada: 'Cancelada',
  atendida: 'Atendida',
  no_asistio: 'No asistió',
};

const NOMBRE_RECORDATORIO = {
  pendiente: 'Recordatorio pendiente',
  enviado: 'Recordatorio enviado',
  fallido: 'Recordatorio fallido',
  cancelado: 'Recordatorio cancelado',
};

// convierte una fecha a lo que espera <input type="datetime-local">
function paraInput(fecha) {
  const f = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000);
  return f.toISOString().slice(0, 16);
}

// "lunes, 9 de noviembre de 2026" con la primera letra en mayúscula
function textoDia(fecha) {
  const t = fecha.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function inicioDelDia(fecha) {
  const f = new Date(fecha);
  f.setHours(0, 0, 0, 0);
  return f;
}

export default function Agenda() {
  const [dia, setDia] = useState(inicioDelDia(new Date()));
  const [citas, setCitas] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const [nueva, setNueva] = useState({ paciente_id: '', fecha_hora: '', duracion_min: 30, motivo: '' });
  const [reprogramando, setReprogramando] = useState(null); // id de la cita
  const [fechaNueva, setFechaNueva] = useState('');
  const [historiales, setHistoriales] = useState({}); // id de cita -> lista

  async function cargar() {
    const hasta = new Date(dia);
    hasta.setDate(hasta.getDate() + 1);
    try {
      const datos = await api(`/api/citas?desde=${dia.toISOString()}&hasta=${hasta.toISOString()}`);
      setCitas(datos);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    cargar();
  }, [dia]);

  useEffect(() => {
    api('/api/pacientes').then(setPacientes).catch((e) => setError(e.message));
  }, []);

  // cuando cambia el día, la fecha por defecto del formulario acompaña
  useEffect(() => {
    const f = new Date(dia);
    f.setHours(9, 0, 0, 0);
    setNueva((n) => ({ ...n, fecha_hora: paraInput(f) }));
  }, [dia]);

  function moverDia(cantidad) {
    const f = new Date(dia);
    f.setDate(f.getDate() + cantidad);
    setDia(f);
  }

  async function accion(fn, textoOk) {
    setError('');
    setAviso('');
    try {
      await fn();
      setAviso(textoOk);
      await cargar();
    } catch (e) {
      setError(e.message);
    }
  }

  function agendar(e) {
    e.preventDefault();
    accion(async () => {
      await api('/api/citas', {
        method: 'POST',
        body: {
          paciente_id: Number(nueva.paciente_id),
          fecha_hora: new Date(nueva.fecha_hora).toISOString(),
          duracion_min: Number(nueva.duracion_min),
          motivo: nueva.motivo,
        },
      });
      setNueva({ ...nueva, motivo: '' });
      // si la cita quedó en otro día, mostramos ese día
      setDia(inicioDelDia(new Date(nueva.fecha_hora)));
    }, 'Cita agendada');
  }

  function cambiarEstado(cita, estado, textoOk) {
    accion(() => api(`/api/citas/${cita.id}/estado`, { method: 'PATCH', body: { estado } }), textoOk);
  }

  function cancelar(cita) {
    if (!window.confirm(`¿Cancelar la cita de ${cita.paciente}?`)) return;
    cambiarEstado(cita, 'cancelada', 'Cita cancelada');
  }

  function reprogramar(cita) {
    accion(async () => {
      await api(`/api/citas/${cita.id}/reprogramar`, {
        method: 'PATCH',
        body: { fecha_hora: new Date(fechaNueva).toISOString() },
      });
      setReprogramando(null);
    }, 'Cita reprogramada');
  }

  async function verHistorial(cita) {
    if (historiales[cita.id]) {
      const copia = { ...historiales };
      delete copia[cita.id];
      setHistoriales(copia);
      return;
    }
    try {
      const h = await api(`/api/citas/${cita.id}/historial`);
      setHistoriales({ ...historiales, [cita.id]: h });
    } catch (e) {
      setError(e.message);
    }
  }

  const abierta = (c) => ['programada', 'confirmada', 'reprogramada'].includes(c.estado);

  return (
    <div>
      <h2>Agenda</h2>

      <div className="barra-dia">
        <button onClick={() => moverDia(-1)} aria-label="Día anterior">‹</button>
        <strong>{textoDia(dia)}</strong>
        <button onClick={() => moverDia(1)} aria-label="Día siguiente">›</button>
        <button className="enlace" onClick={() => setDia(inicioDelDia(new Date()))}>Ir a hoy</button>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {aviso && <p className="aviso" role="status">{aviso}</p>}

      <ul className="lista-citas">
        {citas.length === 0 && <li className="vacio">No hay citas este día. Use el formulario de abajo para agendar una.</li>}
        {citas.map((c) => (
          <li key={c.id} className={`cita estado-${c.estado}`}>
            <div className="cita-hora">
              {formatoHora(c.fecha_hora)}
              <small>{c.duracion_min} min</small>
            </div>
            <div className="cita-datos">
              <strong>{c.paciente}</strong>
              <span>{c.motivo || 'Sin motivo registrado'}</span>
              <span className="suave pequeno">
                {c.recordatorio ? NOMBRE_RECORDATORIO[c.recordatorio] : 'Sin recordatorio'}
              </span>
            </div>
            <div className="cita-estado">
              <span className={`etiqueta e-${c.estado}`}>{NOMBRE_ESTADO[c.estado]}</span>
            </div>
            <div className="cita-acciones">
              {abierta(c) && c.estado !== 'confirmada' && (
                <button onClick={() => cambiarEstado(c, 'confirmada', 'Cita confirmada')}>Confirmar</button>
              )}
              {abierta(c) && (
                <>
                  <button onClick={() => { setReprogramando(c.id); setFechaNueva(paraInput(new Date(c.fecha_hora))); }}>Reprogramar</button>
                  <button onClick={() => cambiarEstado(c, 'atendida', 'Cita marcada como atendida')}>Atendida</button>
                  <button onClick={() => cambiarEstado(c, 'no_asistio', 'Ausencia registrada')}>No asistió</button>
                  <button className="peligro" onClick={() => cancelar(c)}>Cancelar</button>
                </>
              )}
              <button className="enlace" onClick={() => verHistorial(c)}>
                {historiales[c.id] ? 'Ocultar cambios' : 'Ver cambios'}
              </button>
            </div>

            {reprogramando === c.id && (
              <div className="cita-extra">
                <label>
                  Nueva fecha y hora
                  <input type="datetime-local" value={fechaNueva} onChange={(e) => setFechaNueva(e.target.value)} />
                </label>
                <button className="primario" onClick={() => reprogramar(c)}>Guardar nueva fecha</button>
                <button className="enlace" onClick={() => setReprogramando(null)}>Dejar como está</button>
              </div>
            )}

            {historiales[c.id] && (
              <ul className="cita-extra cambios">
                {historiales[c.id].map((h) => (
                  <li key={h.id}>
                    {formatoFecha(h.creado_en)}: {h.estado_anterior ? `${NOMBRE_ESTADO[h.estado_anterior]} → ` : ''}
                    {NOMBRE_ESTADO[h.estado_nuevo]}
                    {h.estado_nuevo === 'reprogramada' && h.fecha_anterior && ` (antes ${formatoFecha(h.fecha_anterior)})`}
                    {h.usuario && ` · ${h.usuario}`}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <form className="formulario" onSubmit={agendar}>
        <h3>Agendar una cita</h3>
        <div className="fila">
          <label>
            Paciente
            <select value={nueva.paciente_id} onChange={(e) => setNueva({ ...nueva, paciente_id: e.target.value })} required>
              <option value="">Elija un paciente</option>
              {pacientes.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre} ({p.documento})</option>
              ))}
            </select>
          </label>
          <label>
            Fecha y hora
            <input type="datetime-local" value={nueva.fecha_hora} onChange={(e) => setNueva({ ...nueva, fecha_hora: e.target.value })} required />
          </label>
          <label>
            Duración (min)
            <input type="number" min="10" max="240" step="5" value={nueva.duracion_min} onChange={(e) => setNueva({ ...nueva, duracion_min: e.target.value })} />
          </label>
        </div>
        <label>
          Motivo
          <input type="text" maxLength="200" value={nueva.motivo} onChange={(e) => setNueva({ ...nueva, motivo: e.target.value })} />
        </label>
        <button className="primario">Agendar cita</button>
      </form>
    </div>
  );
}
