
Políticas de dominio:

- Superadmin puede crear/editar/borrar políticas.
- Flags impactan tabs y endpoints según rol/dominio.

---

## 12) Sprint: Rediseño de calendario de disponibilidades para móvil

**Estado**: Implementado para usuario estándar. Admin y superadmin mantienen temporalmente el calendario tabular actual.

**Problema actual**: 

El calendario de disponibilidades (`WeekCalendar.jsx`) es una tabla 7 días x 16 horas que requiere scroll horizontal. En dispositivos móviles esto es incómodo y poco intuitivo. Se necesita una solución optimizada para pantallas pequeñas.

**Objetivo**: Rediseñar el calendario para que sea naturalmente escalable a móvil con scroll vertical, manteniendo toda la funcionalidad.

**Implementación actual**:

- Usuario estándar: usa minicalendarios verticales por día.
- Admin y superadmin en su dashboard de usuario: mantienen el calendario tabular existente.
- Las restricciones de días vencidos se conservan en el nuevo calendario.

### Opciones de diseño propuestas

#### **Opción A: Minicalendarios verticales por día (RECOMENDADA)**

**Descripción**: Un card por cada día de la semana, stacked verticalmente. Cada card contiene un grid 1 columna x 16 horas.

**Estructura**:

```
┌─────────────────────────┐
│ Lunes 25 de marzo       │
│ ───────────────────────  │
│ [08:00 - 09:00]         │ ← clickable
│ [09:00 - 10:00]         │ ← clickable
│ ... (16 horas)          │
└─────────────────────────┘

┌─────────────────────────┐
│ Martes 26 de marzo      │
│ ───────────────────────  │
│ [08:00 - 09:00]         │
│ ... (16 horas)          │
└─────────────────────────┘

... (5 cards más)
```

**Ventajas**:
- Scroll **vertical natural** en móvil (sin necesidad de scroll horizontal).
- Todos los días **visibles a la vez** en desktop (contexto completo).
- Cada día es un **bloque independiente** (fácil de escanear).
- **Responsive**: en desktop pueden ser 2-3 cards por fila, en móvil 1 card por fila.
- UI limpia y consistente con Mantine Card system.

**Implementación**:

- Reemplazar `<Table>` por grid CSS o `Grid` component de Mantine.
- Cada día en un `<Card>` con título (día + fecha).
- Dentro, una lista de clickable horas o pequeña tabla vertical.
- Responsive: `grid-template-columns: repeat(auto-fit, minmax(350px, 1fr))` en CSS.

---

#### Opción B: Accordion por día (alternativa compacta)

**Descripción**: Todos los días colapsados por defecto. Expandir el que necesites.

**Ventajas**:
- **Muy compacto** (importante para móvil).
- Usuario solo ve lo que necesita.

**Desventajas**:
- No ve contexto de otros días (hay que expandir cada uno).
- Requiere más clics.

---

#### Opción C: Tabs día por día (navegación)

**Descripción**: Un calendario visible a la vez, botones prev/next para navegar días.

**Ventajas**:
- **Simple y limpio**.
- No hay scroll.

**Desventajas**:
- No ve contexto de otros días.
- Navegación tediosa para planificar semana completa.

---

**Recomendación: OPCIÓN A** — Es la mejor relación entre UX en móvil y desktop. Opción B como alternativa si se quiere más compactidad.

### Requerimientos funcionales (Opción A)

1. **Componente nuevo**: `components/MobileWeekCalendar.jsx`
   - 7 cards (uno por día).
   - Cada card es scrolleable verticalmente (16 horas).
   - Misma lógica de toggleCell que WeekCalendar actual.
   - Mismo estado `availabilities` y `pendingKeys`.

2. **Responsive design**:
   - Desktop (>1024px): grid 3 cards/fila, o 2 si ancho es ajustado.
   - Tablet (768px-1024px): grid 2 cards/fila.
   - Móvil (<768px): 1 card/fila, full width.
   - Media queries en CSS o usar Mantine `Grid` con `xs`, `sm`, `md`, `lg` props.

3. **Navegación entre semanas**:
   - Mantener botones "Semana anterior / Siguiente" (igual que actual).
   - `offsetWeeks` sigue siendo prop.

4. **Indicadores visuales**:
   - Color verde claro para horas marcadas (igual que actual).
   - Color amarillo para pendiente (igual que actual).
   - Hoy: badge o borde diferencial en el card del día de hoy (opcional).

5. **Optimizations**:
   - `useMemo` para availabilityByCell (reutilizar del code actual).
   - Evitar re-renders innecesarios con `React.memo` en día individual si necesario.

### Cambios técnicos

**Frontend** (`src/components/`):

- Crear `MobileWeekCalendar.jsx` (copy intelligente desde `WeekCalendar.jsx`).
- Actualizar `Dashboard.jsx`: reemplazar `<WeekCalendar />` por `<MobileWeekCalendar />` o usar un condicional basado en viewport.
- Mantener `WeekCalendar.jsx` viejo como fallback o deprecado.

**CSS / Mantine**:

```jsx
<Container size="100%">
  <Grid cols={{ xs: 1, sm: 2, md: 3, lg: 3 }} spacing="md">
    {days.map((day) => (
      <Grid.Col key={day}>
        <Card shadow="sm" p="md">
          <Text fw={700}>{day.toLocaleDateString('es-ES', ...)}</Text>
          {/* Horas grid vertical */}
          <Stack spacing="xs">
            {hours.map((hour) => (
              <DayHourCell key={hour} ... />
            ))}
          </Stack>
        </Card>
      </Grid.Col>
    ))}
  </Grid>
</Container>
```

### Ejemplo de flujo

1. Usuario abre `/dashboard` en móvil.
2. Ve 1 card por fila (Lunes, Martes, ..., Domingo).
3. Scrollea **verticalmente** para ver todas las horas del día.
4. Cliquea un slot para togglear disponibilidad.
5. en desktop: ve 2-3 cards por fila sin scroll horizontal.
6. Botón "Semana anterior / Siguiente" funciona igual (offset weeks).

### Criterios de aceptación

- [ ] `MobileWeekCalendar` renderiza 7 cards (uno por día).
- [ ] Cada card contiene 16 horas (8-23) clickeables.
- [ ] En móvil (<768px) 1 card/fila, full width.
- [ ] En tablet 2 cards/fila.
- [ ] En desktop 3 cards/fila.
- [ ] Scroll horizontal DESAPARECE.
- [ ] Toggle de horas funciona igual que antes (optimistic update, backend sync).
- [ ] Navegación de semanas (botones prev/next) funciona.
- [ ] Performance: no hay lag en scroll o toggle.
- [ ] Checklist de regresión pasa: crear, eliminar, refresco, dominio filters OK.

### Estimación

- Análisis + prototipo: 1-2 horas.
- Implementar `MobileWeekCalendar.jsx`: 2-3 horas.
- Responsive design (CSS/Grid): 1 hora.
- Testing + ajustes: 1-2 horas.
- **Total: 6-8 horas**.

### Notas

- Considerar mantener `WeekCalendar.jsx` viejo como fallback para compatibilidad o deprecarlo con warning.
- Si hay commit viejo con minicalendario, revisar ese código como referencia (estructura, helpers útiles).
- Considerar agregar swipe gesture para navegar semanas en móvil (mejora UX, no bloqueante para MVP).
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
- Registro público deshabilitado: los usuarios se crean desde administración.
- Gestión de usuarios por dominio:
  - `admin` normal puede crear usuarios solo de su dominio.
  - `admin` normal no puede eliminar usuarios.
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
- `POST /admin/users`
- `DELETE /admin/users/{id}` (solo superadmin)
- `POST /admin/make_admin/{id}`
- `POST /admin/remove_admin/{id}`
- `POST /admin/become_admin`
- `POST /admin/become_superadmin`

Notas:

- `GET /admin/users` devuelve todos los usuarios ordenados por email.
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
- Flags aplican a módulos: eventos, disponibilidades, espacios y usuarios.
- Aplicación de flags por módulo:
  - Usuario: visibilidad de tabs en `Dashboard` + validación backend.
  - Admin: visibilidad de tabs en `AdminDashboard` + validación backend en endpoints admin de eventos/disponibilidades/espacios/usuarios.
  - Superadmin: bypass de flags (acceso completo).

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
  - CRUD desde superadmin, edición en UI, consumo en `/me` y checks de módulos/tabs por dominio.
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
- Integración bloque usuarios completada:
  - Se eliminó el registro público.
  - Creación de usuarios desde admin dashboard (restricción de dominio para admin).
  - Borrado de usuarios solo superadmin.
  - Visualización de todos los usuarios en admin dashboard.
- Integración políticas por tabs reforzada:
  - Se validan flags de dominio también en endpoints admin asociados a tabs (`/admin/availability`, `/admin/reservations`).

---

## 7) Deuda técnica y gaps actuales

**✅ Resueltos en última sesión**:

- Rango horario usuario: ampliado de 8-22 a 8-23 horas.
- Calendario de disponibilidades: bloqueo de votos en días pasados para usuario.
- Dashboard admin de disponibilidades: los días pasados se marcan como vencidos y no computan en la vista agregada.

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

### Sprint D (políticas de dominio granular)

Objetivo: control fino del acceso por dominio a módulos específicos.

- Ver sección "11) Sprint: Políticas de dominio (granular por módulo)" para requerimientos completos.
- Estimación: 5-8 horas.
- Prerequisito: Sprints A, B, C completados.

### Sprint E (UX móvil: rediseño de calendario de disponibilidades)

Objetivo: optimizar el calendario de disponibilidades para dispositivos móviles.

- Ver sección "12) Sprint: Rediseño de calendario para móvil" para requerimientos completos.
- Estimación: 6-8 horas.
- Prerequisito: Ninguno (independiente, puede hacerse en paralelo).

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
---

## 11) Sprint: Políticas de dominio (granular por módulo)

**Estado**: Implementado en backend y frontend. Pendiente únicamente validación funcional completa en entorno desplegado.

**Objetivo**: Permitir que el superadmin controle qué **usuarios de dominios específicos** ven exclusivamente determinadas **tabs del dashboard**.

### Caso de uso motivador

Existe un dominio "invitado" que solo debe ver la funcionalidad de **Eventos**, sin acceso a:
- Disponibilidades
- Espacios y reservas
- Panel de usuarios
- Políticas de dominio

Actualmente, las políticas de dominio (`DomainPolicy`) controlan módulos a nivel global (todos los admins lo ven si está habilitado). Se necesita **granularidad por dominio**: un dominio puede tener eventos habilitados pero disponibilidades deshabilitadas.

### Requerimientos funcionales

1. **Modelo de datos** (cambio en `DomainPolicy`):
   - Agregar 3 nuevas columnas booleanas:
     - `users_enabled` (DEFAULT=False para dominios invitado; DEFAULT=True para otros)
     - `domain_policies_enabled` (DEFAULT=False para no-superadmin)
     - (Opcional) `events_enabled`, `availabilities_enabled`, `spaces_enabled` ya existen; reforzar aplicación

2. **Control de acceso en frontend** (`AdminDashboard.jsx`):
   - Evaluar en `/me` endpoint si el usuario tiene cada módulo habilitado.
   - En sección de tabs, mostrar solo las que están habilitadas según su dominio.
   - Si administrador (no superadmin) de dominio "invitado": solo ve "Eventos", ocultar resto.
   - Superadmin siempre ve todo.

3. **Validación en backend** (endpoints admin):
   - `GET /admin/users`: solo si `users_enabled` para el dominio.
   - `GET /admin/availability`: solo si `availabilities_enabled`.
   - `GET /admin/reservations`: solo si `spaces_enabled`.
   - `POST /admin/domain-policies`: solo si superadmin (no aplicable por roles).
   - Devolver HTTP 403 si intenta acceder sin permiso.

4. **UI en superadmin para gestionar políticas** (`AdminDomainPolicies.jsx`):
   - Al crear/editar una `DomainPolicy`, permitir marcar quién accede a qué:
     - ✓ Eventos (siempre True para dominios normales, configurable)
     - ✓ Disponibilidades (default True, configurable)
     - ✓ Espacios (default True, configurable)
     - ✓ Usuarios (default False para invitado, True para otros)
   - Mostrar un formulario de checkboxes claros por módulo.
   - Indicar en la interfaz cuántos dominios usan cada configuración.

### Cambios técnicos

**Backend** (`models.py`):

```python
class DomainPolicy(Base):
    # ... existing fields ...
    users_enabled: bool = True
    domain_policies_enabled: bool = False  # Solo superadmin
    # events_enabled, availabilities_enabled, spaces_enabled ya existen
```

**Backend** (`main.py`):

- Refactorizar `_is_feature_enabled(db, domain, feature, role)` para incluir nuevos flags.
- Agregar checks en endpoints admin restringidos.
- Endpoint PUT actualizar flags.

**Frontend** (`api/api.js`):

- Actualizar `userAPI.me()` para devolver flags adicionales de `DomainPolicy`.

**Frontend** (`AdminDashboard.jsx`):

- Condición de visibilidad de tab basada en flags del usuario.

### Ejemplo de flujo

1. Superadmin crea policy para dominio "invitado":
   - events_enabled: **true**
   - availabilities_enabled: **false**
   - spaces_enabled: **false**
   - users_enabled: **false**

2. Admin del dominio "invitado" abre `/admin`:
   - Ve solo la tab "Eventos"
   - Botón "Volver al dashboard" disponible
   - Resto de tabs (Calendario, Espacios, Usuarios, Políticas) ocultas
   - Si intenta acceso directo a `GET /admin/users`, backend devuelve 403

3. Usuario normal del dominio "invitado" en `/dashboard`:
   - Ve solo la tab "Eventos"
   - No ve disponibilidades ni espacios
   - Los filtros de `GET /events`, `GET /availability/my` etc. validan deshde backend

### Criterios de aceptación

- [x] `DomainPolicy` tiene 5 flags (events, availabilities, spaces, users, domain_policies).
- [x] Superadmin UI permite editar cada flag por dominio.
- [x] Frontend oculta tabs según flags del usuario logueado.
- [x] Backend rechaza acceso 403 a endpoints no autorizados por dominio.
- [x] Ningún cambio de API incompatible: nuevos campos son opcionales (default).
- [ ] Checklist de regresión pasa: múltiples dominios, superadmin bypass, filtrados correctos.

### Estimación

- Backend: 2-3 horas (modelo, 5 endpoints, validaciones).
- Frontend: 2-3 horas (AdminDomainPolicies form, tabs condicionales, me() sync).
- Testing: 1-2 horas.
- **Total: 5-8 horas**.

**Prioridad recomendada**: Tras fijar hardening (Sprint A) y inconsistencias funcionales (Sprint B).