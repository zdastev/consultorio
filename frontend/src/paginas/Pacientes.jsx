import { useEffect, useState } from 'react';
import { api } from '../api.js';

const vacio = { documento: '', nombre: '', telefono: '', email: '', fecha_nacimiento: '', autoriza_datos: false };

export default function Pacientes({ esProfesional, abrirHistoria }) {
  const [lista, setLista] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [form, setForm] = useState(vacio);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  async function cargar() {
    try {
      setLista(await api(`/api/pacientes?q=${encodeURIComponent(busqueda)}`));
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    cargar();
  }, [busqueda]);

  async function guardar(e) {
    e.preventDefault();
    setError('');
    setAviso('');
    try {
      await api('/api/pacientes', { method: 'POST', body: form });
      setForm(vacio);
      setAviso('Paciente registrado');
      cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  const cambiar = (campo) => (e) => setForm({ ...form, [campo]: e.target.value });

  return (
    <div>
      <h2>Pacientes</h2>

      <label className="buscador">
        Buscar por nombre o documento
        <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      </label>

      {error && <p className="error" role="alert">{error}</p>}
      {aviso && <p className="aviso" role="status">{aviso}</p>}

      <table className="tabla">
        <thead>
          <tr>
            <th>Documento</th>
            <th>Nombre</th>
            <th>Teléfono</th>
            <th>Correo</th>
            {esProfesional && <th></th>}
          </tr>
        </thead>
        <tbody>
          {lista.length === 0 && (
            <tr><td colSpan="5" className="vacio">No hay pacientes con esa búsqueda.</td></tr>
          )}
          {lista.map((p) => (
            <tr key={p.id}>
              <td>{p.documento}</td>
              <td>{p.nombre}</td>
              <td>{p.telefono || '-'}</td>
              <td>{p.email || '-'}</td>
              {esProfesional && (
                <td><button onClick={() => abrirHistoria(p.id)}>Abrir historia</button></td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <form className="formulario" onSubmit={guardar}>
        <h3>Registrar un paciente</h3>
        <div className="fila">
          <label>
            Documento
            <input value={form.documento} onChange={cambiar('documento')} required />
          </label>
          <label>
            Nombre completo
            <input value={form.nombre} onChange={cambiar('nombre')} required />
          </label>
        </div>
        <div className="fila">
          <label>
            Teléfono
            <input value={form.telefono} onChange={cambiar('telefono')} />
          </label>
          <label>
            Correo (para los recordatorios)
            <input type="email" value={form.email} onChange={cambiar('email')} />
          </label>
          <label>
            Fecha de nacimiento
            <input type="date" value={form.fecha_nacimiento} onChange={cambiar('fecha_nacimiento')} />
          </label>
        </div>
        <label className="casilla">
          <input
            type="checkbox"
            checked={form.autoriza_datos}
            onChange={(e) => setForm({ ...form, autoriza_datos: e.target.checked })}
          />
          El paciente autoriza el tratamiento de sus datos personales (Ley 1581 de 2012)
        </label>
        <button className="primario">Registrar paciente</button>
      </form>
    </div>
  );
}
