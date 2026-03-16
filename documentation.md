## Aplicación de disponibilidades – Documentación funcional y técnica

### 1. Contexto y objetivo

Aplicación para una asociación sin ánimo de lucro en la que las personas usuarias:

- **Marcan su disponibilidad semanal** en un calendario por franjas horarias (clic para marcar, nuevo clic para desmarcar).
- **Indican si asistirán o no a eventos concretos**, con tres estados de interés:
  - **Sí**.
  - **No**.
  - **Justificación de inasistencia** (texto libre asociado a la respuesta “no”).
- **No pueden votar más de una vez por evento**.

Las personas administradoras, además:

- **Gestionan usuarios** (asignar / retirar rol de admin).
- **Gestionan eventos** (crear, listar, ver detalle, eliminar, consultar respuestas).
- **Visualizan disponibilidades**:
  - Vista de **todas las disponibilidades**.
  - Vista tipo calendario con **semana actual y siguiente**.
  - **Resumen de franjas más votadas** (mejor coincidencia).
  - **Filtros por dominio de email** (lo que va después de `@`) para identificar disponibilidades locales.

La aplicación se compone de dos carpetas:

- `backend`: API REST en FastAPI + SQLAlchemy, con JWT para autenticación.
- `frontend`: SPA en React (Vite) con componentes Mantine y algo de Chakra UI.

El objetivo de este documento es **centralizar toda la definición funcional, el mapeo con el código existente, las carencias detectadas y el plan de mejora**. Este fichero debe ser el punto único de verdad y se irá actualizando a lo largo del proyecto.

---

### 2. Arquitectura general

- **Backend**
  - Framework: **FastAPI** (`backend/main.py`).
  - ORM: **SQLAlchemy** (`backend/models.py`, `backend/database.py`).
  - BD:
    - **PostgreSQL en Railway** cuando existe `DATABASE_URL`.
    - **SQLite local** (`sqlite:///./app.db`) en desarrollo.
  - Autenticación:
    - **JWT** con `jose.jwt`.
    - Hash de contraseñas con **passlib + argon2**.
  - Exposición de la API:
    - FastAPI expone por defecto documentación Swagger en `/docs` y `/openapi.json`.
  - Políticas CORS:
    - Orígenes permitidos: `*`.
    - Credenciales deshabilitadas (`allow_credentials=False`).

- **Frontend**
  - Framework: **React** con **react-router-dom** (`frontend/src/App.jsx`).
  - UI:
    - **Mantine** en las pantallas principales (`Login`, `Register`, `Dashboard`, `AdminDashboard` y componentes de administración).
  - API client:
    - Archivo central `frontend/src/api/api.js`:
      - Envuelve `fetch` con manejo de token, cabeceras JSON y errores.
      - Gestiona `localStorage` del token.
      - Expone `authAPI.login` y `authAPI.register` para autenticación.
    - Archivo `frontend/src/api/adminApi.js` para funcionalidades de administración.
  - Rutas principales (`frontend/src/App.jsx`):
    - `/` → `Login`.
    - `/register` → alta de nuevo usuario.
    - `/dashboard` → panel de usuario (disponibilidad + eventos).
    - `/admin` → panel de administración.
    - `/admin/event/:id` → detalle de respuestas de un evento concreto.

---

### 3. Modelo de datos (backend/models.py)

- **Usuario (`User`)**
  - `id`: entero, PK.
  - `email`: string, único, obligatorio.
  - `full_name`: string, obligatorio.
  - `hashed_password`: string, obligatorio.
  - `role`: string, por defecto `"user"`; puede ser `"admin"`.
  - Relaciones:
    - `availabilities`: lista de disponibilidades del usuario.
    - `events_created`: eventos creados por el usuario.
    - `responses`: respuestas a eventos (votos).

- **Disponibilidad (`Availability`)**
  - `id`: entero, PK.
  - `user_id`: FK a `users.id`.
  - `date`: string, formato `YYYY-MM-DD` (recomendable normalizar/validar).
  - `start_time`: string, hora de inicio (ej. `08:00:00`).
  - `end_time`: string, hora de fin (ej. `09:00:00`).

- **Evento (`Event`)**
  - `id`: entero, PK.
  - `title`: string, obligatorio.
  - `description`: string, opcional.
  - `date`: string, obligatorio (fecha del evento).
  - `start_time`: string opcional (hora inicio).
  - `created_by`: FK a `users.id`.
  - Relaciones:
    - `creator`: usuario que creó el evento.
    - `responses`: lista de respuestas (`EventResponse`) asociadas.

- **Respuesta a Evento (`EventResponse`)**
  - `id`: entero, PK.
  - `event_id`: FK a `events.id`.
  - `user_id`: FK a `users.id`.
  - `answer`: string, obligatorio (valores esperados: `"si"` / `"no"`; en código se aceptan también `"yes"`).
  - `justification`: string opcional.

---

### 4. Endpoints y correspondencia funcional

#### 4.1 Autenticación y usuarios

**Modelos Pydantic relevantes (en `backend/main.py`):**

- `Register`: `email`, `full_name`, `password`.
- `Login`: `email`, `password`.

**Endpoints:**

- **POST `/register`**
  - Crea un usuario estándar (`role="user"`).
  - Lógica:
    - Comprueba si ya existe `email`.
    - Hashea la contraseña con `hash_password`.
  - Respuesta: `{ "ok": true }` o error 400 si email duplicado.
  - **Uso front actual**:
    - Existe una pantalla `Register` (`frontend/src/pages/Register.jsx`), que llama a `authAPI.register` ya implementado en `frontend/src/api/api.js`.
    - Desde `Login.jsx` se ofrece un botón “Crear cuenta nueva” que navega a `/register`.

- **POST `/login`**
  - Autentica usuario por `email` y `password`.
  - Si es correcto, genera JWT con `sub = user.id`.
  - Respuesta: `{ "access_token", "token_type": "bearer" }`.
  - **Uso front**:
    - `Login.jsx` llama a `authAPI.login`, que:
      - Hace `POST /login`.
      - Guarda el token en `localStorage`.
      - Redirige a `/dashboard`.

- **GET `/me`**
  - Requiere cabecera `Authorization: Bearer <token>`.
  - Devuelve datos básicos del usuario autenticado:
    - `id`, `email`, `full_name`, `role`.
  - **Uso front**:
    - `Dashboard.jsx` y `AdminDashboard.jsx` usan `userAPI.me()`:
      - Redirigen a `/` si el token no es válido.
      - Comprueban el rol para permitir o denegar acceso al panel admin.

#### 4.2 Administración de roles y usuarios

- **POST `/admin/become_admin`**
  - Permite convertir en admin al usuario autenticado **solo si aún no existe ningún admin**.
  - Lógica:
    - Verifica token.
    - Busca si ya hay algún usuario con `role="admin"`.
    - Si no hay, asigna `role="admin"` al usuario actual.
  - Pensado como **endpoint “secreto” de bootstrap** (expuesto en `adminAPI.becomeAdmin()`).

- **GET `/admin/users`**
  - Solo accesible para usuarios con `role="admin"`.
  - Lista todos los usuarios con: `id`, `full_name`, `email`, `role`.
  - **Uso front**:
    - `AdminUsers.jsx`:
      - Lista en una tabla todos los usuarios.
      - Permite hacer admin y quitar admin.

- **POST `/admin/make_admin/{user_id}`**
  - Requiere que el caller sea admin.
  - Cambia el rol del usuario dado a `"admin"`.

- **POST `/admin/remove_admin/{user_id}`**
  - Requiere admin.
  - No permite quitarse el rol a sí mismo.
  - Cambia el rol del usuario a `"user"`.

#### 4.3 Gestión de eventos

**Modelo Pydantic:**

- `EventCreate`: `title`, `description?`, `date`, `start_time?`, `end_time?`.

**Endpoints:**

- **POST `/events`**
  - Crea un nuevo evento.
  - Solo para usuarios admin.
  - Guarda: título, descripción, fecha, `start_time` y `created_by`.
  - Respuesta: el objeto `Event` recién creado.
  - **Uso front**:
    - `AdminEvents.jsx` (función `createEvent`):
      - Envía `title`, `description`, `date` y, opcionalmente, `start_time` a partir del campo de hora de inicio en el formulario.
      - Tras crear recarga la lista.

- **GET `/events`**
  - Lista todos los eventos sin filtrado.
  - Respuesta: array de objetos con:
    - `id`, `title`, `description`, `date`, `start_time`.
    - `yes_count`, `no_count`: número de respuestas “sí” / “no” para ese evento (derivadas de `EventResponse`).
  - **Uso front**:
    - `EventsSection.jsx` carga lista para usuarios (ignora los campos de resumen).
    - `AdminEvents.jsx` usa `yes_count` y `no_count` para mostrar un resumen rápido de votos.

- **GET `/events/{event_id}`**
  - Solo admins.
  - Devuelve datos de un evento concreto.
  - **Uso front**:
    - `AdminEventResponses.jsx` lo utiliza para mostrar el título del evento en la cabecera.

- **DELETE `/events/{event_id}`**
  - Solo admins.
  - Elimina primero las respuestas asociadas (`EventResponse`) y luego el evento.
  - **Uso front**:
    - `AdminEvents.jsx` en `deleteEvent(id)` recarga después la lista.

#### 4.4 Respuestas a eventos (votaciones)

**Modelo Pydantic:**

- `EventResponseCreate`: `answer`, `justification?`.

**Endpoints:**

- **GET `/events/{event_id}/responses`**
  - Solo admins.
  - Devuelve las respuestas a un evento, unidas con el usuario:
    - `user_full_name`, `answer`, `justification`.
  - **Uso front**:
    - `AdminEventResponses.jsx`:
      - Muestra listado de respuestas.
      - Calcula resumen de votos (sí/no) con `resumirVotos`.

- **POST `/events/{event_id}/responses`**
  - Permite a un usuario votar sobre un evento.
  - Lógica:
    - Verifica usuario desde token.
    - Comprueba si ya existe una respuesta (`EventResponse`) para ese `event_id` + `user_id`.
    - Si existe, responde 400 `"Ya has votado en este evento"` → **garantiza la restricción de no votar dos veces**.
    - Si no existe, crea registro con `answer` y `justification`.
  - **Uso front**:
    - `EventsSection.jsx`:
      - Carga inicialmente `eventsAPI.myResponses()` para marcar qué eventos ya están votados.
      - En `respond(id, answer)`:
        - Si ya votó (`votedEvents.has(id)`), no hace nada.
        - Lee justificación de un `TextInput` por DOM (`document.getElementById`).
        - Envia `answer` (`"si"` o `"no"`) y `justification`.
        - Marca el evento como votado en el estado local.

- **GET `/events/my-responses`**
  - Devuelve la lista de `event_id` de los eventos sobre los que el usuario actual ya ha votado.
  - **Uso front**:
    - `EventsSection.jsx`:
      - Al montar, carga estos IDs y construye un `Set` para desactivar botones y mostrar “Ya has votado”.

#### 4.5 Gestión de disponibilidades

**Modelo Pydantic:**

- `AvailabilityCreate`: `date`, `start_time`, `end_time`.

**Endpoints (usuario estándar):**

- **GET `/availability/my`**
  - Devuelve todas las disponibilidades del usuario actual.
  - **Uso front**:
    - `WeekCalendar.jsx`:
      - Carga al montar todas las disponibilidades en `availabilities`.
      - La tabla del calendario genera las celdas solo para:
        - Semana actual o semana siguiente (según `offsetWeeks`).
      - La función `isAvailable(date, hour)` comprueba, para cada franja, si hay alguna disponibilidad que cubra esa hora y ese día.

- **POST `/availability/my`**
  - Crea una nueva disponibilidad para el usuario:
    - Guarda `date`, `start_time`, `end_time`.
  - **Uso front**:
    - `WeekCalendar.jsx`, en `toggleCell(date, hour)`:
      - Si no existe aún disponibilidad que cubra esa hora, crea una entrada nueva:
        - Construye un registro temporal con `id` `tmp_...`.
        - Hace `availabilityAPI.create(...)`.
        - Sustituye el temporal por el objeto real devuelto por la API.

- **DELETE `/availability/my/{avail_id}`**
  - Elimina una disponibilidad del usuario actual.
  - Solo si el `Availability` pertenece a ese usuario.
  - **Uso front**:
    - `WeekCalendar.jsx`:
      - Si ya existía disponibilidad para esa franja, elimina optimistamente del estado y luego llama a `availabilityAPI.delete(id)`.
      - En caso de error, recarga desde servidor con `loadAvailability()`.

**Endpoints (admin):**

- **GET `/admin/availability`**
  - Solo admins.
  - Responsabilidades:
    - Llama a `cleanup_expired_data(db)`:
      - Elimina eventos con `Event.date < hoy` y sus `EventResponse`.
    - Elimina disponibilidades demasiado antiguas:
      - Borra `Availability` con `date < hoy - 14 días`.
    - Devuelve todas las disponibilidades restantes con:
      - `id`, `user` (nombre), `email`, `date`, `start_time`, `end_time`.
  - **Uso front**:
    - `AdminAvailabilitiesCalendar.jsx`.

---

#### 4.6 Gestión de espacios y reservas

**Modelos Pydantic:**

- `SpaceCreate`: `name`, `description?`.
- `SpaceReservationCreate`: `space_id`, `date`, `start_time?`, `end_time?`, `reason?`.

**Endpoints (usuario estándar):**

- **GET `/spaces`**
  - Lista todos los espacios disponibles.
  - **Uso front**:
    - `SpaceReservations.jsx` carga para poblar select.

- **GET `/reservations`**
  - Devuelve todas las reservas de espacios (de todos los usuarios).
  - Para cada reserva incluye:
    - `id`, `space_id`, `space_name`, `creator_name`, `creator_email`, `date`, `start_time`, `end_time`, `reason`, `visible_reason`.
  - `reason` solo se muestra si el dominio (@...) del creador coincide con el dominio del usuario solicitante.
  - **Uso front**:
    - `SpaceReservations.jsx` muestra tabla con motivo condicional.

- **POST `/reservations`**
  - Crea reserva para usuario autenticado.
  - Si `start_time` no está presente, se usa `00:00:00`.
  - Si `end_time` no está presente, se usa `23:59:59`.
  - Valida `start_time < end_time`.
  - **Uso front**:
    - `SpaceReservations.jsx` formulario de creación.

**Endpoints (admin):**

- **GET `/admin/reservations`**
  - Lista todas las reservas con datos completos (motivo visible siempre).
  - **Uso front**: pendiente de incorporación (próximos sprints si se requiere). 

- **GET `/spaces`**
  - Lista todos los espacios (mismo endpoint que usuario).

- **POST `/spaces`**
  - Crea un nuevo espacio (admin).
  - **Uso front**:
    - `AdminSpaces.jsx` formulario de creación.

- **DELETE `/spaces/{space_id}`**
  - Elimina espacio y sus reservas asociadas (admin).
  - **Uso front**:
    - `AdminSpaces.jsx`.


    - `AdminAvailabilitiesCalendar.jsx`:
      - Construye un mapa `cellMap` de `date-hour → [usuarios]`.
      - Permite filtrar por dominio de email.
      - Ofrece:
        - Vista por semanas (actual / siguiente) controlada por `weekOffset`.
        - Identificación de las **mejores franjas** (mayor número de personas disponibles).
        - Un modal con la lista de usuarios para una franja concreta al hacer clic.

---

### 5. Requisitos funcionales consolidados (desde descripción + código)

#### 5.1 Usuario estándar

- **Autenticación**
  - Puede iniciar sesión con `email` y `password`.
  - Puede registrarse (función disponible en backend y en pantalla dedicada, aunque la llamada API está incompleta en frontend).
  - El token JWT se usa para todas las llamadas autenticadas.

- **Disponibilidad semanal**
  - Vista de calendario semanal:
    - Horas de 08:00 a 22:00 (15 franjas) en `WeekCalendar.jsx`.
    - Días lunes a domingo, calculados desde la semana actual (`offsetWeeks=0`) o la siguiente (`offsetWeeks=1`).
  - Interacción:
    - Clic sobre celda:
      - Si no hay disponibilidad en esa franja → se crea (marcar disponibilidad).
      - Si ya hay disponibilidad → se elimina (desmarcar).
    - El comportamiento es acorde a “pulsar y volver a pulsar” para marcar/desmarcar.

- **Participación en eventos**
  - Lista de eventos visibles con:
    - Título, fecha, rango horario, descripción.
  - Para cada evento:
    - Puede responder **“Sí”** o **“No”**.
    - Puede asociar una **justificación** (texto libre) a la respuesta, típicamente cuando responde “No”.
    - **No puede votar más de una vez**:
      - El backend lo impide por lógica de duplicidad.
      - El frontend además desactiva botones y muestra mensaje informativo.

#### 5.2 Administración

- **Gestión de usuarios**
  - Ver lista de todos los usuarios.
  - Asignar/quitar rol admin a otros usuarios (no a sí mismo).
  - Endpoint de bootstrap `become_admin` para crear el primer admin.

- **Gestión de eventos**
  - Crear eventos con:
    - Título (obligatorio).
    - Descripción (opcional).
    - Fecha (obligatoria).
    - Horas de inicio/fin (actualmente opcionales y no configurables desde UI, se envían como `null`).
  - Eliminar eventos.
  - Ver resumen de respuestas por evento:
    - Vista de detalle con listado de votantes y sus respuestas/justificaciones.
    - Resumen numérico de “Sí/No” por evento.
  - (Esperado) Ver un **resumen rápido de votos** directamente en el listado de eventos (parcialmente implementado en `AdminEvents.jsx`, ver carencias).

- **Visualización de disponibilidades globales**
  - Calendario semanal tipo heatmap:
    - Muestra el número de personas disponibles por franja y día.
    - Destaca las **mejores coincidencias** (mayor número de personas).
  - Filtro por dominio de email:
    - Posibilidad de escribir un texto (ej. `gmail.com` o un dominio corporativo) y filtrar usuarios cuyo email lo contenga en la parte de dominio.
  - Cambio de semana:
    - Permite navegar entre semana anterior / actual / siguiente (lógica actual limita/deshabilita ciertos botones).

---

### 6. Carencias, incoherencias y puntos a mejorar (Sprint 1)

Esta sección recoge **desajustes entre la intención funcional y la implementación actual**, así como **issues técnicos o de UX**. El primer sprint se centrará en corregirlos, estabilizar lo que ya existe y cerrar huecos de definición.

#### 6.1 Frontend – Registro de usuarios

- `Register.jsx` llama a `authAPI.register(email, fullName, password)`, pero:
  - En `frontend/src/api/api.js` no existe `authAPI.register`.
  - El backend sí dispone de `POST /register`.
- **Impacto**:
  - La pantalla de registro no funciona.
- **Acciones propuestas**:
  - Implementar `authAPI.register` en `api.js` alineado con el modelo `Register` del backend.
  - Añadir navegación desde `Login` hacia `Register` (link “Crear cuenta”).
  - Unificar UI (ver 6.4) para que `Register` use Mantine o el stack visual elegido.

#### 6.2 Frontend – Resumen de votos en listado de eventos admin

- En `AdminEvents.jsx`:
  - Se espera que cada evento pueda incluir `ev.answers` y se llama a `contarSiNo(ev.answers)` para mostrar un resumen Sí/No.
  - El endpoint `GET /events` (backend) **no añade** respuestas ni resumen; solo devuelve datos básicos del evento.
- **Impacto**:
  - El resumen de votos en el listado de eventos no se muestra o se muestra incorrectamente (según cómo llegue el JSON).
- **Opciones de solución** (a decidir en detalle en Sprint 1):
  - **Opción A (recomendada)**:
    - Ampliar el endpoint `GET /events` para que devuelva, para cada evento, un pequeño resumen:
      - p.ej. `yes_count`, `no_count` (calculados en servidor).
    - Adaptar `AdminEvents.jsx` para usar esos campos.
  - **Opción B**:
    - Crear un endpoint específico `/admin/events-with-summary` para el panel admin.
    - Mantener `/events` ligero para usuario estándar.

#### 6.3 Backend – Validación de datos y tipos

- Fechas y horas se manejan como `str` (`date`, `start_time`, `end_time`) tanto en modelos Pydantic como en SQLAlchemy.
  - Sería deseable:
    - Validar formatos (`YYYY-MM-DD`, `HH:MM:SS`).
    - Valorar si migrar a tipos `Date` / `Time` / `DateTime` en BD.
- `EventResponse.answer`:
  - El backend acepta cualquier string (no hay validación explícita de enumeración).
  - El frontend envía `"si"` o `"no"`, pero algunas utilidades de conteo también consideran `"yes"`.
- **Acciones propuestas (Sprint 1/2)**:
  - Añadir validaciones Pydantic (regex o tipos) para fechas/horas.
  - Definir de forma explícita el dominio de valores válidos para `answer`:
    - p.ej. `Enum("si", "no")`.
  - Normalizar la lógica de conteo de votos a estos valores.

#### 6.4 Inconsistencia en librerías de UI en frontend

- El frontend usa:
  - **Mantine** en la mayoría de pantallas.
  - **Chakra UI** sólo en `Register.jsx`.
- **Impacto**:
  - Inconsistencia visual y de diseño.
  - Más dependencias y complejidad de estilos.
- **Acción propuesta**:
  - Unificar librería UI (preferiblemente Mantine, ya que es la dominante).
  - Reescribir `Register.jsx` en Mantine o, alternativamente, migrar el resto, pero debe quedar homogéneo.

#### 6.5 Seguridad y configuración

- `SECRET_KEY` está hardcodeado en `backend/main.py`:
  - **Riesgo** de seguridad en despliegues reales.
- CORS está abierto a `allow_origins=["*"]`:
  - Aceptable en desarrollo, pero a revisar para producción.
- `become_admin`:
  - Es un endpoint de bootstrap, pero sigue estando accesible; una vez existe un admin ya no concede privilegios, pero conviene documentar su uso y quizás protegerlo más.
- **Acciones propuestas**:
  - Mover `SECRET_KEY` y otros parámetros sensibles a variables de entorno.
  - Documentar y restringir CORS en producción.
  - Documentar claramente en este `documentation.md` el procedimiento de creación del primer admin.

#### 6.6 UX y feedback de errores

- Varias pantallas usan `alert()` para mensajes de error (login, creación de eventos, etc.).
- No hay mensajes amigables al usuario ni feedback inline.
- **Acciones propuestas**:
  - Sustituir `alert` por componentes de notificación de la librería UI (Mantine).
  - Añadir mensajes de validación de formularios (campos obligatorios, formato de email, etc.).
- **Bug corregido en calendario de disponibilidad**:
  - `WeekCalendar.jsx` volvió a la tabla semanal clásica con 7 días y 15 franjas horarias.
  - Anterior vista "card per day" fue eliminada por problema de filtrado nativo de días.
  - `toggleCell` ahora es optimista: actualiza el estado local de inmediato y gestiona revert on error.

- **Bug corregido en formulario de eventos admin**:
  - `AdminEvents.jsx` usa `DatePicker` de Mantine en vez de `type="date"` (evita flechas extrañas y hace usable la selección de mes/día).
  - Fecha se guarda en formato ISO `YYYY-MM-DD`.
---

### 7. Plan de actualización y mejora

#### 7.1 Sprint 1 – Estabilización y cierre de huecos

Objetivo: **arreglar la funcionalidad actual y cubrir los casos no definidos correctamente** sin introducir grandes cambios estructurales.

- **Funcionalidades básicas**
  - Implementar `authAPI.register` y conectar correctamente la pantalla de registro con `/register`.
  - Añadir navegación desde login a pantalla de registro (y viceversa si se desea).
  - Verificar que la lógica de “no votar dos veces” funciona correctamente en todos los casos (manejo de errores HTTP 400 en `EventsSection`).

- **Eventos y resúmenes**
  - Definir y acordar el formato de resumen de votos a exponer en la API.
  - Implementar en backend (ampliar `/events` o crear endpoint específico admin).
  - Ajustar `AdminEvents.jsx` para usar el resumen del backend (en lugar de depender de `ev.answers` inexistente).

- **Consistencia de UI**
  - Unificar UI en frontend (primera aproximación):
    - Migrar `Register.jsx` a Mantine.
    - Eliminar dependencia de Chakra si no queda ningún uso.

- **Robustez y validaciones mínimas**
  - Añadir validaciones básicas en formularios:
    - Título y fecha obligatorios al crear evento.
    - Email y contraseña no vacíos en login/registro.
  - Revisar y corregir posibles errores de front derivados de respuestas de API (p.ej. manejo de errores de red).

- **Documentación y Swagger**
  - Verificar que la documentación automática de FastAPI (Swagger en `/docs`) refleja todos los endpoints actuales.
  - Añadir/ajustar descripciones de modelos y endpoints si fuera necesario para claridad.
  - Actualizar este `documentation.md` con cualquier cambio de contrato.

#### 7.2 Sprints posteriores – Evolutivos (alto nivel)

Los siguientes sprints se centrarán en **nuevas funcionalidades** (definición detallada pendiente), entre ellas:

- **Reserva de espacios** (módulo nuevo a definir):
  - Asociar disponibilidades y eventos a espacios físicos/virtuales.
  - Evitar solapamientos de reservas por espacio.
  - Permitir a admins gestionar espacios y capacidad.

- **Mejoras analíticas y de reporting**
  - Informes más avanzados sobre participación en eventos.
  - Estadísticas por semana/mes, por dominio, por tipo de evento, etc.

- **Calidad de vida y UX**
  - Mejoras visuales en el calendario (resaltado de hoy, tooltips, etc.).
  - Recordatorios o notificaciones (email / push, según alcance del proyecto).

- **Bugfix de calendario de disponibilidad**
  - `WeekCalendar.jsx` usa ahora columna `Hora` sticky y `z-index` alto para evitar solaparse con días cuando se desliza.
  - Se implementó un mapa `pendingKeys` para gestionar clics rápido y evitar la condición de carrera de toggle rápido.

- **Bugfix de selección de fecha en eventos y reservas**
  - `AdminEvents.jsx` y `SpaceReservations.jsx` usan ahora `DatePicker` de Mantine como calendario integrado, con navegación de meses.

Cada sprint deberá:

- Mantener este `documentation.md` actualizado.
- Incluir una sección de “Cambios de contrato de API” cuando se modifiquen endpoints.
- Documentar claramente los nuevos casos de uso cubiertos.

---

### 8. Notas de mantenimiento

- **Migraciones de BD**:
  - Actualmente las tablas se crean con `models.Base.metadata.create_all(bind=engine)` en el arranque.
  - Para cambios futuros de esquema es recomendable introducir una herramienta de migraciones (p.ej. Alembic) y documentar los pasos aquí.

- **Entornos y configuración**:
  - Variables relevantes:
    - `DATABASE_URL` para conexión a Railway (PostgreSQL).
    - Futuras: `SECRET_KEY`, configuración CORS, etc.
  - Mantener en este documento una lista actualizada de las variables de entorno necesarias.

- **Convenciones de código y estilo**:
  - Frontend:
    - Preferir una sola librería de componentes (Mantine).
    - Estándar de manejo de errores y notificaciones.
  - Backend:
    - Mantener endpoints documentados con docstrings y/o descripciones de FastAPI.
    - Asegurar consistencia en nombres de rutas, parámetros y modelos Pydantic.

Este documento debe revisarse y ampliarse en cada cambio relevante de la aplicación, de forma que refleje siempre el estado actual del sistema y el roadmap acordado.

