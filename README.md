# Prototipo: gestión de citas e historias clínicas para consultorios pequeños

Prototipo funcional de la actividad 4 de Proyecto de Software. Es una aplicación web con
una API en Node/Express, base de datos PostgreSQL y una interfaz en React. Todos los datos
que trae son inventados.

## Qué hace

- Agenda de citas sin cruces de horario (crear, reprogramar, cancelar, confirmar, marcar atendida o ausencia).
- Cada cambio en una cita queda guardado, con quién lo hizo y la fecha anterior si se reprogramó.
- Registro de pacientes. No deja guardar a nadie sin la autorización de tratamiento de datos.
- Historia clínica que no se edita: las correcciones crean una entrada nueva y la anterior se conserva.
- Dos perfiles: la auxiliar maneja citas y pacientes; solo el profesional ve historias, bitácora y copias.
- Bitácora de accesos (quién abrió qué historia, inicios de sesión, fallos de contraseña).
- Recordatorios por correo 24 horas antes de la cita, con hasta 3 intentos si el correo falla.
- Copias de seguridad (una cada noche y otra cuando se pida) y restauración desde la pantalla o por consola.

## Qué necesita

- Node.js 18 o superior
- PostgreSQL 14 o superior

## Instalación en local

1. Crear la base de datos. En `psql`:

   ```sql
   CREATE USER citas WITH PASSWORD 'citas123';
   CREATE DATABASE consultorio OWNER citas;
   ```

2. Backend:

   ```bash
   cd backend
   cp .env.example .env      # en Windows: copy .env.example .env
   npm install
   npm run crear-bd          # crea las tablas y carga los datos de prueba
   npm start
   ```

   La API queda en http://localhost:4000

3. Frontend (en otra terminal):

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

   Abrir http://localhost:5173

## Usuarios de prueba

| Perfil | Correo | Contraseña |
|---|---|---|
| Profesional | profesional@consultorio.test | Profesional123 |
| Auxiliar | auxiliar@consultorio.test | Auxiliar123 |

## Pruebas automáticas

Usan una base aparte para no tocar los datos de la app:

```sql
CREATE DATABASE consultorio_test OWNER citas;
```

```bash
cd backend
npm test
```

Son 21 pruebas (cruces de horario, reprogramaciones, permisos, bitácora, versiones de la
historia, recordatorios y restauración de copias).

## Copias de seguridad por consola

```bash
npm run respaldo                          # crea una copia en backend/backups
npm run restaurar -- respaldo-XXXX.json   # restaura esa copia
```

## Despliegue

- Backend y base de datos en Render (servicio web con PostgreSQL). Variables: `DATABASE_URL`,
  `DATABASE_SSL=true`, `JWT_SECRET`, `FRONTEND_URL` (la dirección del frontend). Comando de inicio: `npm start`.
  Después de crear la base hay que correr una vez `npm run crear-bd` desde la consola de Render.
- Frontend en Vercel, carpeta `frontend`, con la variable `VITE_API_URL` apuntando al backend.

## Lo que no hace todavía

- Los recordatorios salen en modo simulado (se escriben en la consola del servidor) mientras no se llenen
  las variables `SMTP_*` del `.env`.
- Las copias se guardan en una carpeta del servidor. En un hosting con disco temporal (como el plan
  gratis de Render) se pierden al reiniciar, así que en producción real habría que mandarlas a un
  almacenamiento externo.
- No hay cifrado de los campos clínicos en la base ni recuperación de contraseña.
- Es un solo profesional con una sola agenda; no maneja varios consultorios.
