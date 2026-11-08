// Todas las llamadas al backend pasan por acá
const BASE = import.meta.env.VITE_API_URL || '';

export function guardarSesion(datos) {
  sessionStorage.setItem('sesion', JSON.stringify(datos));
}
export function leerSesion() {
  try {
    return JSON.parse(sessionStorage.getItem('sesion'));
  } catch (e) {
    return null;
  }
}
export function borrarSesion() {
  sessionStorage.removeItem('sesion');
}

export async function api(ruta, { method = 'GET', body } = {}) {
  const sesion = leerSesion();
  const respuesta = await fetch(BASE + ruta, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(sesion ? { Authorization: `Bearer ${sesion.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const datos = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
    // si el token venció, se saca al usuario
    if (respuesta.status === 401 && sesion) {
      borrarSesion();
      window.location.reload();
    }
    throw new Error(datos.error || 'Ocurrió un error, intente de nuevo');
  }
  return datos;
}

export function formatoFecha(iso) {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}
export function formatoHora(iso) {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}
