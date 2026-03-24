## Disponibilidad App – Documentación funcional para IA (estado real)

Última actualización: 2026-03-24

Este documento es el **punto único de verdad funcional/técnico** para asistentes IA y equipo de desarrollo.
Describe lo que **está implementado hoy**, las **inconsistencias detectadas**, y la **estrategia de próximos sprints**.

---

## 1) Alcance del producto

Aplicación para gestionar:

- Disponibilidad horaria semanal de usuarios.
- Votación de eventos (sí/no, con justificación opcional).
- Gestión de usuarios/roles (admin/superadmin).
- Gestión de espacios y reservas.
- Políticas de dominio para habilitar/deshabilitar módulos.

Stack actual:

- Backend: FastAPI + SQLAlchemy (`backend/main.py`, `backend/models.py`).
- Frontend: React + Vite + Mantine (`frontend/src/**`).

---

## 2) Arquitectura y seguridad (estado actual)

### Backend

- Autenticación JWT con `sub=user.id`.
- Contraseñas con `passlib` (`argon2`).
- CORS abierto (`allow_origins=["*"]`, sin credenciales).
- Creación de tablas en arranque con `create_all`.

### Frontend

- Cliente API central en `frontend/src/api/api.js`.
- Rutas en `frontend/src/App.jsx`:
  - `/` login
  - `/register` registro
  - `/dashboard` panel usuario
  - `/admin` panel admin
  - `/admin/event/:id` respuestas de evento

### Riesgos vigentes

- `SECRET_KEY` hardcodeada en backend.
- No hay migraciones formales (Alembic) todavía.
- Validaciones de fecha/hora siguen mayoritariamente como `string`.

---

## 3) Modelo de datos (estado real)

Modelos en `backend/models.py`:

- `User`: `email` único, `role` (`user|admin|superadmin`), relaciones con disponibilidades/eventos/respuestas.
- `Availability`: `user_id`, `date`, `start_time`, `end_time`.
- `Event`: `title`, `description`, `date`, `start_time`, `allowed_domain` (nullable), `created_by`.
- `EventResponse`: `event_id`, `user_id`, `answer`, `justification`.
- `DomainPolicy`: `domain` único + flags `events_enabled`, `availabilities_enabled`, `spaces_enabled`.
- `Space`: `name` único, `description`, `created_by`.
- `SpaceReservation`: `space_id`, `user_id`, `date`, `start_time`, `end_time`, `reason`.

---

## 4) Reglas funcionales implementadas

### 4.1 Roles y dominios

- `require_admin` permite `admin` y `superadmin`.
- `superadmin` tiene bypass en flags de políticas de dominio.
- Se permiten múltiples `admin` y múltiples `superadmin`.
- Gestión de usuarios por dominio:
  - `admin` normal solo opera usuarios de su dominio.
  - `superadmin` sin restricción.

### 4.2 Eventos

- Creación (`POST /events`) para admin/superadmin, con `allowed_domain` opcional.
- Listado (`GET /events`) devuelve `yes_count` y `no_count`.
- Acceso por dominio:
  - Si evento tiene `allowed_domain`, solo coincide dominio del usuario o `superadmin`.
- Operaciones admin protegidas por dominio:
  - `GET /events/{id}`
  - `GET /events/{id}/responses`
  - `DELETE /events/{id}`
- Voto único por usuario/evento en backend:
  - `POST /events/{id}/responses` rechaza duplicados con 400 (`Ya has votado...`).
- Frontend (`EventsSection.jsx`) carga `GET /my-event-responses` y deshabilita botón desde inicio.
- Si backend devuelve “ya votado”, el frontend marca ese evento como votado en sesión actual.

Nota técnica:

- Se usa `/my-event-responses` para evitar colisión con la ruta dinámica `/events/{event_id}` que podía provocar que no se recuperaran correctamente los votos previos tras recargar o volver a iniciar sesión.

### 4.3 Disponibilidades

- Usuario:
  - `GET /availability/my`
  - `POST /availability/my`
  - `DELETE /availability/my/{id}`
- Calendario usuario (`WeekCalendar.jsx`):
  - Toggle por celda con actualización optimista.
  - Lookup optimizado por mapa (`availabilityByCell`) para reducir coste por render.
- Admin:
  - `GET /admin/availability`
  - `admin` y `superadmin` ven todas las disponibilidades (incluidas las propias).
- Calendario admin (`AdminAvailabilitiesCalendar.jsx`):
  - Refresco automático (intervalo + focus/visibility).
  - Filtro por dominio + “mejores franjas”.

### 4.4 Usuarios y roles

- `GET /admin/users`
- `POST /admin/make_admin/{id}`
- `POST /admin/remove_admin/{id}`
- `POST /admin/become_admin`
- `POST /admin/become_superadmin`

Notas:

- No hay endpoint explícito para “degradar superadmin a admin” (solo se puede poner a `user` con `remove_admin`).

### 4.5 Espacios y reservas

- Espacios:
  - `GET /spaces`
  - `POST /spaces`
  - `DELETE /spaces/{id}`
- Reservas:
  - `GET /reservations`
  - `POST /reservations`
  - `DELETE /reservations/{id}`
  - `GET /admin/reservations`
- Reglas:
  - En `GET /reservations`, usuario no-superadmin solo ve reservas de su dominio.
  - `reason` visible solo si coincide dominio (`visible_reason`).
  - `admin` puede cancelar cualquier reserva en frontend; usuario normal solo la suya.

### 4.6 Políticas de dominio

- Solo superadmin:
  - `GET /admin/domain-policies`
  - `POST /admin/domain-policies`
  - `PUT /admin/domain-policies/{id}`
  - `DELETE /admin/domain-policies/{id}`
- Flags aplican a módulos: eventos, disponibilidades, espacios.

---

## 5) Escaneo MVP (mínimo producto viable)

Criterio MVP: “flujo principal usable de extremo a extremo por módulo”.

### Resultado general

**Sí, existe un MVP funcional**, con observaciones no bloqueantes para producción.

### Estado por módulo

- **Eventos: FUNCIONAL (MVP OK)**
  - Crear/listar/votar/ver respuestas/eliminar.
  - Voto único backend + bloqueo UI.
  - Dominio aplicado en acceso/operaciones admin.
  - Observación: falta índice único DB para blindar duplicado en concurrencia extrema.

- **Disponibilidad: FUNCIONAL (MVP OK)**
  - Toggle semanal usuario + vista admin agregada por franja.
  - Reflejo en panel admin por refresco automático.
  - Observación: no hay validación estricta de formatos de fecha/hora en backend.

- **Usuarios/Roles: FUNCIONAL (MVP OK)**
  - Promoción/degradación y listado con filtro de dominio para admin normal.
  - Soporta múltiples admin/superadmin.
  - Observación: `become_admin/superadmin` sigue expuesto; conviene hardening.

- **Espacios/Reservas: FUNCIONAL (MVP OK)**
  - Crear/listar/eliminar espacio; crear/listar/cancelar reserva.
  - Filtrado por dominio y visibilidad de motivo implementados.
  - Observación: no hay control de solapamientos de reservas (funcionalidad pendiente).

- **Políticas de dominio: FUNCIONAL (MVP OK)**
  - CRUD desde superadmin y consumo en `/me` + checks de módulos.
  - Observación: falta trazabilidad/auditoría de cambios de políticas.

---

## 6) Inconsistencias históricas corregidas (ya resueltas)

- Restricción “solo 1 admin” y “solo 1 superadmin” eliminada.
- Conflictos de superadmin en módulo de espacios corregidos (propagación de rol en checks).
- Admin de un dominio ya no puede operar eventos de otro dominio por acceso directo a ID.
- Re-voto en frontend tras refresco/login ya no genera bucle de intento: evento se bloquea al detectar respuesta existente.
- Dashboard admin de disponibilidades: `admin` y `superadmin` ahora ven todos los votos de disponibilidad.
- Creación de eventos robustecida ante BDs legacy sin `events.allowed_domain`:
  - En arranque backend se añade automáticamente la columna faltante si no existe.

---

## 7) Deuda técnica y gaps actuales

Prioridad alta (P1):

1. Seguridad:
   - Mover `SECRET_KEY` a variable de entorno.
   - Restringir CORS por entorno.
2. Integridad de voto:
   - Añadir restricción única DB (`event_id`, `user_id`) en `EventResponse`.
3. Validaciones:
   - Endurecer Pydantic para fechas/horas (`date`, `time`) y normalización de `answer`.

Prioridad media (P2):

1. Reservas:
   - Validar solapamientos por espacio/fecha/franja.
2. UX:
   - Sustituir `alert()` por notificaciones homogéneas Mantine.
3. Performance backend:
   - Reducir `query().all()` + filtrado en Python en algunos endpoints admin.

Prioridad baja (P3):

1. Migraciones con Alembic.
2. Auditoría de acciones administrativas.
3. Métricas y observabilidad.

---

## 8) Estrategia recomendada por sprints

### Sprint A (hardening MVP)

Objetivo: pasar de MVP funcional a MVP robusto.

- Seguridad de secretos y CORS por entorno.
- Índice único de voto por evento/usuario.
- Validaciones estrictas de entrada (fechas/horas/answer).
- Normalización de errores API para UX consistente.

### Sprint B (consistencia funcional)

Objetivo: cerrar huecos funcionales principales.

- Solapamientos de reservas de espacios.
- Endpoints admin optimizados con filtros SQL por dominio.
- Mejoras de feedback en UI (notificaciones, loading/error states).

### Sprint C (operabilidad)

Objetivo: escalabilidad y mantenimiento.

- Introducir Alembic y versionado de esquema.
- Auditoría mínima de acciones críticas (roles, domain policies, borrados).
- Pruebas automáticas de regresión en flujos críticos (voto único, dominio, reservas).

---

## 9) Checklist de regresión mínima (obligatorio en cambios)

Eventos:

- Usuario vota una vez y no puede repetir tras login/logout/refresh.
- Admin de dominio A no puede ver/borrar evento de dominio B.
- Superadmin sí puede.

Disponibilidad:

- Toggle crea y elimina franja correctamente.
- Panel admin refleja cambios de usuario sin recarga manual.

Usuarios/roles:

- Se pueden tener múltiples admin y múltiples superadmin.
- Admin normal no gestiona usuarios de otro dominio.

Espacios/reservas:

- Crear y cancelar reserva funciona por permisos.
- Visibilidad de `reason` respeta `visible_reason`.

Políticas de dominio:

- Superadmin puede crear/editar/borrar políticas.
- Flags impactan tabs y endpoints según rol/dominio.

---

## 10) Norma de mantenimiento documental

- Cada cambio funcional o de permisos debe actualizar este archivo en el mismo PR/commit.
- Si cambia contrato de API, incluir sección “Cambio de contrato” en esta documentación.
- Si un módulo deja de ser MVP, marcar explícitamente su estado como `DEGRADADO` hasta corregir.
