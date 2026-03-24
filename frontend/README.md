# Disponibilidad App (Frontend)

Aplicación web para gestión de disponibilidades, eventos y reservas con control por roles y dominio.

## Stack

- React + Vite
- Mantine UI
- API REST (FastAPI)

## Flujo funcional

### Roles

- `user`: usa calendario de disponibilidad, vota eventos y reserva espacios (según políticas de dominio).
- `admin`: puede gestionar usuarios/eventos/espacios dentro de su ámbito permitido.
- `superadmin`: acceso total y gestión de políticas por dominio.

### Multiplicidad de roles

- Se permiten múltiples `admin`.
- Se permiten múltiples `superadmin`.

### Reglas de dominio

- El filtrado por dominio en administración aplica especialmente a eventos con `allowed_domain`.
- Un `admin` no puede ver ni operar eventos asignados a otro dominio.
- `superadmin` no tiene restricción de dominio.

### Voto de eventos (único por usuario/evento)

- Cada evento solo se puede votar una vez por usuario.
- El frontend carga los IDs ya votados con `GET /events/my-responses` y deshabilita botones desde el render inicial.
- Si el backend responde que el evento ya fue votado, el frontend marca ese evento como votado en ese momento para impedir reintentos en la sesión actual.

### Disponibilidades (calendario usuario/admin)

- El calendario de usuario usa actualización optimista al marcar/desmarcar franjas.
- Se optimizó lookup por celda con una estructura en memoria para reducir búsquedas repetidas.
- El calendario admin se refresca automáticamente de forma periódica y al recuperar foco para reflejar cambios recientes de usuarios.

## Endpoints usados por frontend

- Auth: `POST /login`, `POST /register`, `GET /me`
- Eventos usuario: `GET /events`, `POST /events/{id}/responses`, `GET /events/my-responses`
- Disponibilidad usuario: `GET /availability/my`, `POST /availability/my`, `DELETE /availability/my/{id}`
- Admin: `GET /admin/users`, `POST /admin/make_admin/{id}`, `POST /admin/remove_admin/{id}`
- Admin eventos: `POST /events`, `DELETE /events/{id}`, `GET /events/{id}`, `GET /events/{id}/responses`
- Admin disponibilidad: `GET /admin/availability`
- Espacios/reservas: `GET/POST/DELETE /spaces`, `GET/POST/DELETE /reservations`, `GET /admin/reservations`
- Políticas dominio (superadmin): `GET/POST/PUT/DELETE /admin/domain-policies`

## Notas de mantenimiento

- Cualquier cambio funcional debe reflejarse en este README.
- Si cambian reglas de permisos, actualizar simultáneamente la sección de roles y dominio.
