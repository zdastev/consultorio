import { useState } from 'react';
import { api, guardarSesion } from '../api.js';

export default function Login({ alEntrar }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const datos = await api('/api/auth/login', { method: 'POST', body: { email, password } });
      guardarSesion(datos);
      alEntrar(datos);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="login">
      <form onSubmit={entrar} className="login-caja">
        <h1>Consultorio</h1>
        <p className="suave">Citas e historias clínicas. Prototipo académico con datos ficticios.</p>

        <label>
          Correo
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label>
          Contraseña
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>

        {error && <p className="error" role="alert">{error}</p>}
        <button className="primario" disabled={cargando}>{cargando ? 'Entrando...' : 'Entrar'}</button>

        <p className="suave pequeno">
          Cuentas de prueba:<br />
          profesional@consultorio.test / Profesional123<br />
          auxiliar@consultorio.test / Auxiliar123
        </p>
      </form>
    </div>
  );
}
