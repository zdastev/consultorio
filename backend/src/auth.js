const jwt = require('jsonwebtoken');

const SECRETO = process.env.JWT_SECRET || 'solo-para-desarrollo';

function crearToken(usuario) {
  return jwt.sign(
    { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
    SECRETO,
    { expiresIn: '8h' }
  );
}

// middleware: revisa que venga el token y deja el usuario en req.usuario
function requiereLogin(req, res, next) {
  const cabecera = req.headers.authorization || '';
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Debe iniciar sesión' });

  try {
    req.usuario = jwt.verify(token, SECRETO);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'La sesión expiró o no es válida' });
  }
}

// middleware: solo deja pasar a los roles indicados
function soloRol(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'No tiene permiso para esta acción' });
    }
    next();
  };
}

module.exports = { crearToken, requiereLogin, soloRol };
