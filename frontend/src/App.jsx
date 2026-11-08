import { useState } from 'react';
import { leerSesion, borrarSesion } from './api.js';
import Login from './paginas/Login.jsx';
import Agenda from './paginas/Agenda.jsx';
import Pacientes from './paginas/Pacientes.jsx';
import Historia from './paginas/Historia.jsx';
import Bitacora from './paginas/Bitacora.jsx';
import Respaldos from './paginas/Respaldos.jsx';

export default function App() {
  const [sesion, setSesion] = useState(leerSesion());
  const [vista, setVista] = useState('agenda');
  const [pacienteHistoria, setPacienteHistoria] = useState(null);

  if (!sesion) return <Login alEntrar={setSesion} />;

  const esProfesional = sesion.usuario.rol === 'profesional';

  const menu = [
    ['agenda', 'Agenda'],
    ['pacientes', 'Pacientes'],
    ...(esProfesional
      ? [
          ['historia', 'Historias clínicas'],
          ['bitacora', 'Bitácora de accesos'],
          ['respaldos', 'Copias de seguridad'],
        ]
      : []),
  ];

  function salir() {
    borrarSesion();
    setSesion(null);
    setVista('agenda');
  }

  function abrirHistoria(id) {
    setPacienteHistoria(id);
    setVista('historia');
  }

  return (
    <div className="layout">
      <aside className="lateral">
        <h1 className="marca">Consultorio</h1>
        <nav>
          {menu.map(([clave, texto]) => (
            <button
              key={clave}
              className={vista === clave ? 'nav activo' : 'nav'}
              onClick={() => setVista(clave)}
            >
              {texto}
            </button>
          ))}
        </nav>
        <div className="usuario">
          <strong>{sesion.usuario.nombre}</strong>
          <span>{esProfesional ? 'Profesional' : 'Auxiliar administrativo'}</span>
          <button className="enlace" onClick={salir}>Cerrar sesión</button>
        </div>
      </aside>

      <main className="contenido">
        {vista === 'agenda' && <Agenda />}
        {vista === 'pacientes' && <Pacientes esProfesional={esProfesional} abrirHistoria={abrirHistoria} />}
        {vista === 'historia' && esProfesional && <Historia pacienteInicial={pacienteHistoria} />}
        {vista === 'bitacora' && esProfesional && <Bitacora />}
        {vista === 'respaldos' && esProfesional && <Respaldos />}
      </main>
    </div>
  );
}
