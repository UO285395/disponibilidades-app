
Políticas de dominio:

- Superadmin puede crear/editar/borrar políticas.
- Flags impactan tabs y endpoints según rol/dominio.

---

## 11) Censo y envío de email (estado deploy-ready)

### Endpoints del módulo de censo

- Admin (solo superadmin):
  - `GET /admin/census`
  - `PUT /admin/census`
  - `POST /admin/census/regenerate-token`
  - `POST /admin/census/test-email`
- Público (sin login):
  - `GET /censo/{token}/fields`
  - `POST /censo/{token}`

### Reglas implementadas

- Los endpoints admin de censo devuelven `401` limpio si falta token.
- La ruta pública de censo no requiere autenticación.
- El submit público responde rápido porque el envío email se lanza en hilo background.
- El backend acepta variables en MAYÚSCULAS y, por compatibilidad Railway, también en minúsculas.
- El backend soporta dos transportes para el email del censo:
  - `Resend` por HTTPS (**preferente en Railway**).
  - `SMTP` como fallback legacy.

### Configuración recomendada en Railway

#### Opción A — Resend (recomendada)

Variables:

- `CENSUS_EMAIL_PROVIDER=resend`
- `RESEND_API_KEY`
- `RESEND_FROM`
- `RESEND_API_URL` (opcional, default `https://api.resend.com/emails`)

Comportamiento implementado:

- El backend usa el SDK oficial de Resend para Python (`import resend`) cuando está disponible.
- Si el SDK falla por dependencia o error runtime, hace fallback automático a llamada HTTPS directa a la API de Resend.
- Si `CENSUS_EMAIL_PROVIDER=resend`, el backend usa siempre Resend.
- Si no se define `CENSUS_EMAIL_PROVIDER` pero existe `RESEND_API_KEY`, el backend autodetecta Resend.
- El CSV se adjunta en base64 al email enviado por API HTTPS.
- Los logs muestran:
  - `api_url`
  - `from`
  - si existe API key (`has_api_key`)
  - destinatario

Esta opción evita el problema observado con Railway: resolución correcta de Gmail pero `timeout` en `587/TLS` y `465/SSL`.

#### Opción B — SMTP (fallback legacy)

Usar preferentemente estas variables en MAYÚSCULAS:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM` (opcional, recomendado)
- `SMTP_USE_TLS` (`true` / `false`)
- `SMTP_USE_SSL` (`true` / `false`)
- `SMTP_FORCE_IPV4` (`true` / `false`, recomendado `true` en Railway)

Compatibilidad implementada:

- Si Railway quedó configurado con `smtp_host`, `smtp_user`, etc., el backend también las leerá.
- El backend puede forzar resolución IPv4 para SMTP (`SMTP_FORCE_IPV4=true`) para evitar fallos de conectividad IPv6 en cloud.
- Para Gmail, el backend intenta primero la configuración indicada y, si hay `timeout` o `network is unreachable`, prueba automáticamente el modo alternativo:
  - `587 + STARTTLS`
  - `465 + SSL`

### Logs diagnósticos SMTP que deben aparecer

Sin exponer secretos, backend registra:

- transporte seleccionado (`resend` / `smtp`)

Si se usa Resend:

- `api_url`
- `from`
- `has_api_key`
- respuesta HTTP resumida

Si se usa SMTP:

- `host`
- `port`
- modo `SSL/TLS`
- `from`
- si existe usuario/password (`has_user`, `has_password`)
- inicio de login SMTP
- éxito de login
- envío del mensaje
- error exacto del proveedor SMTP

### Checklist de diagnóstico rápido

1. Verificar que frontend admin llama `POST /admin/census/test-email` con token.
2. Verificar que frontend público usa:
   - `GET /censo/{token}/fields`
   - `POST /censo/{token}`
   ambos sin auth.
3. Confirmar que `API_URL` apunta al backend Railway correcto.
4. Revisar logs backend para el transporte real usado:
  - si es Resend: `api_url`, `from`, `has_api_key`, código HTTP
  - si es SMTP: host/port, `use_ssl`, `use_tls`, login correcto o error exacto.
5. Si no llega correo:
  - con Resend: comprobar `RESEND_API_KEY` y que `RESEND_FROM` esté verificado,
  - con SMTP: comprobar credenciales reales, puerto correcto y modo SSL/STARTTLS,
  - en Railway, preferir siempre Resend antes que SMTP.

### Errores comunes

- `405 Method Not Allowed`
  - Causa típica: frontend llama con método incorrecto a un endpoint de censo.
  - Verificar especialmente `POST /admin/census/test-email` y `PUT /admin/census`.

- `401 Token inválido`
  - Causa típica: botón admin sin token o sesión expirada.
  - Debe ocurrir solo en endpoints admin, nunca en `/censo/{token}` público.

- `503 Service Unavailable`
  - Causa típica: deploy caído, backend arrancando o frontend desincronizado con la versión desplegada.
  - Revisar salud del backend Railway y logs del deploy.

- `Failed to fetch`
  - Causa típica: backend no accesible, CORS, URL de API incorrecta o fallo de red entre frontend y backend.

- `Error enviando email por Resend: HTTP 401`
  - Causa típica: `RESEND_API_KEY` incorrecta o caducada.

- `Error enviando email por Resend: HTTP 403`
  - Causa típica: `RESEND_FROM` no verificado en la cuenta/proyecto de Resend.

- `Error enviando email de censo: [Errno 101] Network is unreachable`
  - Causa probable: el contenedor no tiene salida válida hacia la ruta SMTP resuelta (muy frecuente con resolución IPv6 en entornos cloud).
  - Fix aplicado en código:
    - resolución SMTP con preferencia/fuerza IPv4 mediante `SMTP_FORCE_IPV4=true`.
    - fallback automático entre `587/TLS` y `465/SSL` para Gmail.
  - Si persiste, la causa probable pasa a ser restricción de salida del proveedor o bloqueo de SMTP saliente.
  - Fix operativo recomendado: mover el transporte a Resend y dejar SMTP solo como fallback.


---

## 12) Sprint: Rediseño de calendario de disponibilidades para móvil

**Estado**: Implementado para todos los usuarios.

**Problema actual**: 

El calendario de disponibilidades (`WeekCalendar.jsx`) es una tabla 7 días x 16 horas que requiere scroll horizontal. En dispositivos móviles esto es incómodo y poco intuitivo. Se necesita una solución optimizada para pantallas pequeñas.

**Objetivo**: Rediseñar el calendario para que sea naturalmente escalable a móvil con scroll vertical, manteniendo toda la funcionalidad.

**Implementación actual**:

- Usuarios estándar, admin y superadmin: usan minicalendarios verticales por día.
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

---

## 13) Nuevas funcionalidades (acompañantes y censo)

### 13.1 Acompañantes por evento

**Estado**: En integración (backend y dashboard usuario implementados).

**Objetivo funcional**:

---

## 14) Consistencia de eventos, sesión móvil y build APK (2026-07-07)

Cambios conservadores aplicados sobre `mobile/adaptacion-capacitor` para corregir estados inconsistentes al borrar eventos, reducir llamadas `/me` duplicadas en el arranque móvil y dejar la APK lista para regenerar con versión incrementada. Sin cambios de contrato de API (mismos endpoints y payloads).

### Backend

- `backend/models.py`: `EventResponse` y `EventCompanion` ahora declaran `UniqueConstraint(event_id, user_id)` y `ondelete="CASCADE"` en sus FKs; `Event.responses`/`Event.companions` usan `cascade="all, delete-orphan"`. Esto es metadata de SQLAlchemy (aplica tal cual a bases de datos nuevas creadas con `create_all`).
- `backend/main.py`: `ensure_legacy_schema_compatibility()` (la misma rutina que ya añadía columnas legacy con `ALTER TABLE` en cada arranque) ahora además, de forma aditiva e idempotente:
  1. Elimina duplicados históricos en `event_responses`/`event_companions` (conserva la fila de menor `id` por `event_id`+`user_id`).
  2. Crea `CREATE UNIQUE INDEX IF NOT EXISTS ux_event_responses_event_user` y `ux_event_companions_event_user`.
  - Se ejecuta automáticamente en el próximo arranque/deploy del backend (local SQLite y Railway Postgres), sin pasos manuales. Verificado localmente ejecutando el arranque dos veces seguidas (segunda vez no reporta cambios, confirmando idempotencia).
  - `respond_event` y `update_my_event_companions` capturan `IntegrityError` en el commit y devuelven 400 con mensaje claro en vez de un 500 si alguna vez se produce una carrera real.
  - Nota: no se retroaplica `ondelete=CASCADE` a nivel de motor en la base de datos ya existente (en SQLite requeriría reconstruir la tabla); no es necesario porque `delete_event()` ya borra explícitamente `EventCompanion`/`EventResponse` antes de borrar el `Event`, todo en una misma transacción.

### Frontend — eventos

- `EventsSection.jsx`: refresco silencioso al recuperar el foco de la pestaña/app (además del fetch inicial), y limpieza del evento en memoria con mensaje claro si `respond()`/`saveCompanions()` reciben un 404 (evento borrado por un admin).
- `AdminEvents.jsx`: confirmación antes de borrar un evento, estados de carga por acción (`creating`/`savingEdit`/`deletingId`) que deshabilitan los botones implicados y se restauran con `finally`, y el mismo refresco silencioso al recuperar el foco.
- `AdminEventResponses.jsx`: si el evento ya no existe o no es accesible (404/403), se muestra un mensaje claro en vez de quedarse en "(cargando...)" o fallar en silencio.

### Frontend — sesión y arranque móvil

- Nuevo hook `frontend/src/hooks/useSessionUser.js`: centraliza el flujo `GET /me` → si falla, `POST /auth/refresh` + reintento → si vuelve a fallar, limpia sesión y redirige una sola vez a login (con gate opcional de rol admin). Devuelve `{ user, ready }` para mostrar un estado breve "Comprobando sesión…".
- `Dashboard.jsx` y `AdminDashboard.jsx` usan ahora ese hook en vez de duplicar la lógica de bootstrap.
- Se detectaron y eliminaron llamadas `/me` duplicadas: `SpaceReservations.jsx` y `AdminUsers.jsx` llamaban a `userAPI.me()` por su cuenta (Mantine mantiene montados todos los `Tabs.Panel` habilitados, así que se ejecutaban en paralelo con el `/me` de la página contenedora). Ahora reciben el usuario ya cargado vía prop `currentUser`.
- `clearToken()` en `api.js` ahora es `async` y espera (`await`) el borrado en Capacitor Preferences antes de continuar, evitando que el token sobreviva en almacenamiento nativo si la app se cierra justo tras el logout.
- Eliminado `frontend/src/services/auth.js` (duplicado muerto de la lógica de token de `api.js`, sin ningún import en el proyecto).
- `Login.jsx` añade estado `submitting` para evitar doble envío del formulario.

### Rendimiento

- `WeekCalendar.jsx` y `MobileWeekCalendar.jsx`: los arrays `days`/`hours` usados para pintar la rejilla ahora están memoizados con `useMemo` (antes se recreaban en cada render, incluido cada actualización optimista de disponibilidad).

### Móvil / APK

- `frontend/android/app/build.gradle`: `versionCode` 1→2, `versionName` "1.0"→"1.1" (esta build incluye los cambios de este apartado).
- Pipeline de build confirmado correcto y sin cambios: `npm run build` → `npm run build:mobile` (`vite build && npx cap sync android`) → `npm run cap:open`. `@capacitor/preferences` y `@capacitor/push-notifications` ya estaban integrados correctamente (no solo instalados).

### Flujo para regenerar la APK con estos cambios

1. Backend: desplegar `backend/` (Railway) y confirmar en logs que la migración de arranque corre sin errores.
2. Frontend: `cd frontend && npm install`
3. `npm run build:mobile` (build web + `cap sync android`, copia los assets nuevos a Android)
4. `npm run cap:open` → Android Studio → `Build > Build APK(s)`
5. APK resultante: `frontend/android/app/build/outputs/apk/debug/app-debug.apk` (versión 1.1 / versionCode 2)


- Cada evento del dashboard de usuario incluye un botón para gestionar acompañantes.
- Los acompañantes se vinculan al par `usuario-evento`.
- El cálculo de asistentes incluye votos `sí` + acompañantes.

**Implementado actualmente**:

- Backend:
  - Modelo `EventCompanion` persistente.
  - `GET /my-event-companions` para recuperar acompañantes del usuario.
  - `PUT /events/{event_id}/companions/my` para crear/editar acompañantes.
  - `GET /events` devuelve `companions_total` y `attendees_total`.
  - Borrado en cascada lógica al eliminar evento o usuario.
- Frontend:
  - Botón "Acompañantes" en cada tarjeta de evento (`EventsSection`).
  - Modal para definir cantidad (0-20).
  - Visualización de asistentes totales por evento.

**Reglas aplicadas**:

- Solo se permiten acompañantes si el usuario votó `sí` en ese evento.
- Rango permitido: `0..20` acompañantes por usuario/evento.

**Pendiente para cierre de esta parte**:

- Pruebas funcionales en entorno desplegado.
- Ajuste de copy/UX en modal según feedback.

### 13.2 Censo por URL oculta y envío CSV por correo

**Estado**: Implementado en backend y frontend.

**Objetivo funcional**:

- Ruta de censo accesible solo por URL directa (sin acceso desde navegación frontend).
- Formulario dinámico configurable por superadmin.
- Envío por correo en CSV a una dirección configurable por superadmin.
- Respuestas del censo **no persistidas** en base de datos.

**Implementado actualmente**:

- Backend:
  - Modelos `CensusConfig` y `CensusField` (tablas `census_configs` y `census_fields`).
  - `GET /admin/census` — superadmin: obtener configuración actual.
  - `PUT /admin/census` — superadmin: crear o reemplazar configuración + campos.
  - `POST /admin/census/regenerate-token` — superadmin: generar nueva URL (token).
  - `GET /censo/{token}/fields` — público, sin auth: obtener campos del formulario.
  - `POST /censo/{token}` — público, sin auth: enviar respuestas; genera CSV en memoria y envía por email.
  - Email via `smtplib` (SMTP configurado por variables de entorno: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`). Si no están configuradas, la respuesta se registra en log pero no se envía.
- Frontend:
  - Tab "Censo" en panel de administración (solo visible para superadmin).
  - Componente `AdminCensus.jsx`: builder de campos, email destino, URL copiable, regenerar URL.
  - Página `CensusForm.jsx` en ruta pública `/censo/:token`: formulario dinámico, validación de obligatorios, mensaje de éxito.

**Variables de entorno requeridas en backend para envío de email**:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=correo@example.com
SMTP_PASSWORD=contraseña_o_app_password
```

**Tipos de campo soportados**: texto corto (`text`), texto largo (`textarea`), número (`number`), selección (`select` con opciones configurables).

**Pendiente para cierre**:

- Pruebas funcionales con SMTP real en entorno desplegado.
- Validación de que el token es suficientemente opaco para la seguridad requerida.

---

## 14) Planificación siguiente Sprint (Móvil: sesión persistente + notificaciones)

**Estado**: En implementación activa en rama móvil. Núcleo backend/frontend integrado; pendiente validación en dispositivo físico y configuración FCM en entorno.

### 14.1 Objetivo A: sesión persistente en app móvil

**Meta funcional**:

- Una vez iniciada sesión en el dispositivo, el usuario no debe autenticarse en cada apertura.
- La sesión debe mantenerse de forma segura y permitir cierre manual (logout).

**Alcance**:

- Persistencia de token con almacenamiento nativo móvil (Capacitor Preferences).
- Auto-login al arrancar la app si el token sigue siendo válido.
- Preparar refresco de token si se implementa endpoint de renovación.

**Tareas técnicas**:

1. Frontend móvil:
  - Instalar e integrar `@capacitor/preferences`.
  - Refactorizar `api.js` para lectura/escritura de token desde almacenamiento nativo.
  - Implementar bootstrap de sesión en `App.jsx`.
2. Backend (recomendado):
  - Añadir endpoint de refresh de token para renovar sesiones largas sin re-login.

**Criterios de aceptación**:

- [x] Reabrir app no muestra login si token válido (bootstrap desde almacenamiento nativo + redirección inicial).
- [x] Logout elimina sesión persistida.
- [x] Si token no válido, redirección a login sin bucles.

**Estimación**: 1-2 días.

### 14.2 Objetivo B: notificaciones push en móvil

**Meta funcional**:

- Notificar automáticamente cuando se publica un evento.
- Permitir al superadmin enviar notificaciones personalizadas:
  - a un usuario concreto,
  - por colectivo,
  - global a todos.

**Alcance**:

- Integración push en Android (FCM mediante Capacitor).
- Registro de tokens de dispositivo por usuario.
- Envío segmentado desde backend según alcance.
- UI de administración para componer y enviar notificaciones manuales.

**Tareas técnicas**:

1. Backend:
  - Crear modelo de tokens de dispositivo (`user_id`, `token`, `platform`, `active`, `updated_at`).
  - Endpoint de registro/actualización de token desde app móvil.
  - Endpoint admin para envío manual con `scope` (`user`, `colectivo`, `all`).
  - Trigger de envío automático al crear evento.
2. Frontend móvil:
  - Solicitud de permisos push y registro de token en login/arranque.
  - Listener para recepción de notificaciones.
3. Frontend admin:
  - Formulario de envío manual (título, cuerpo, alcance y destinatarios).

**Reglas funcionales**:

- Superadmin puede enviar a cualquier alcance (individual, colectivo, global).
- Si el alcance es colectivo, se resuelve por parte después de `@` del usuario.
- Evitar duplicados de token por usuario/dispositivo.

**Criterios de aceptación**:

- [x] Publicar evento dispara push al público objetivo (backend integrado).
- [x] Superadmin puede enviar push individual, por colectivo y global.
- [ ] La app recibe y muestra notificaciones en dispositivo Android real.
- [x] Registro de tokens robusto ante reinstalaciones/cambios de token.

**Estimación**: 3-5 días.

### 14.3 Orden de implementación recomendado

1. Sesión persistente (14.1).
2. Registro de tokens push en app + backend.
3. Notificación automática por creación de evento.
4. Panel superadmin para envíos manuales segmentados.
5. Pruebas en dispositivo físico + hardening de errores.

### 14.4 Cambios implementados en este sprint

Backend:

- Endpoint `POST /auth/refresh` para renovar token autenticado.
- Modelo `DeviceToken` para registrar tokens push por usuario/dispositivo.
- Endpoint `POST /device-tokens/register` para registro/actualización de token móvil.
- Endpoint `POST /admin/notifications/send` (solo superadmin) con alcance `all`, `colectivo` y `users`.
- Trigger de notificación automática al crear evento (`POST /events`).

Frontend:

- Persistencia de sesión móvil en `api.js` con soporte `Capacitor Preferences`.
- Bootstrap de sesión en `App.jsx` (auto-redirect a dashboard si hay sesión).
- Refresh automático de token en `Dashboard` y `AdminDashboard` cuando `/me` falla por expiración.
- Servicio móvil `mobileNotifications.js` para pedir permisos push y registrar token en backend.
- Nuevo panel superadmin `AdminNotifications.jsx` para envíos manuales segmentados.

Dependencias añadidas:

- `@capacitor/preferences`
- `@capacitor/push-notifications`

### 14.5 Checklist operativa (15 min) para dejar FCM funcionando

Objetivo: validar recepción real de notificaciones en Android y envío desde backend.

#### A) Configuración Firebase / Android Studio

1. En Firebase Console, crear proyecto (o usar uno existente).
2. Añadir app Android con `applicationId` igual al `appId` de Capacitor:
  - `com.uo285395.disponibilidad`
3. Descargar `google-services.json`.
4. Copiar `google-services.json` en:
  - `frontend/android/app/google-services.json`
5. Abrir `frontend/android` en Android Studio y sincronizar Gradle.
6. Ejecutar app en dispositivo físico (no solo emulador) con Google Play Services.

#### B) Configuración backend en Railway

1. Definir variable:
  - `FCM_SERVER_KEY=<legacy_server_key_de_firebase>`
2. (Opcional) definir:
  - `FCM_ENDPOINT=https://fcm.googleapis.com/fcm/send`
3. Redeploy del backend.
4. Verificar en logs que no aparezca:
  - `FCM_SERVER_KEY no configurada`

#### C) Configuración frontend móvil

1. Desde `frontend/`:
  - `npm install`
  - `npm run cap:sync`
2. Abrir Android Studio:
  - `npm run cap:open`
3. Instalar APK en dispositivo y abrir app.
4. Iniciar sesión con usuario válido para disparar registro de token.

#### D) Verificaciones funcionales (smoke test)

1. Token registrado:
  - Al abrir dashboard en móvil, backend recibe `POST /device-tokens/register`.
2. Notificación automática por evento:
  - Crear evento desde admin y verificar push en móvil.
3. Notificación manual superadmin:
  - En tab Notificaciones, probar `all`, `colectivo`, `users`.
4. Validar recepción en bandeja Android:
  - Con app en foreground y background.

#### E) Troubleshooting rápido

1. No llega ninguna push:
  - Revisar `FCM_SERVER_KEY` en Railway.
  - Confirmar que el móvil registró token (`/device-tokens/register`).
2. Llega a algunos usuarios pero no a otros:
  - Revisar alcance (`scope`) y colectivo enviado.
3. Error de permisos en móvil:
  - Revisar permiso de notificaciones del sistema Android para la app.
4. Token cambia tras reinstalar:
  - Esperado; el backend ya actualiza token por registro.

### 14.6 Guía corta para cada modificación (Railway + APK manual)

Usar este flujo siempre que se cambie backend, frontend o ambos.

#### 1) Cambios de backend (Railway)

1. Subir rama y desplegar en Railway.
2. Revisar variables de entorno nuevas/modificadas (por ejemplo `FCM_SERVER_KEY`).
3. Validar salud del backend tras deploy:
  - `/openapi.json` responde 200.
  - Endpoints nuevos responden sin 5xx.

#### 2) Cambios de frontend web

1. En `frontend/`, instalar dependencias:
  - En PowerShell de Windows usar `npm.cmd install`.
2. Generar build web:
  - `npm.cmd run build`
3. Verificar navegación básica en navegador (login, dashboard, admin).

#### 3) Cambios que afectan APK (Capacitor Android)

Regla: si cambias cualquier archivo de `frontend/src` o dependencias del frontend, hay que regenerar APK.

1. Compilar y sincronizar Android:
  - `npm.cmd run build:mobile`
  - `npm.cmd run cap:sync android`
2. Abrir Android Studio:
  - `npm.cmd run cap:open`
3. Generar APK firmado y distribuir manualmente a usuarios.

#### 4) Orden recomendado de publicación

1. Primero desplegar backend en Railway.
2. Después generar APK con el frontend actualizado.
3. Distribuir APK y ejecutar smoke test en móvil real.

#### 5) Conflicto de paquetes (resolución rápida)

Si falla `npm install` o aparece conflicto de dependencias:

1. Confirmar versión de Node compatible (`>=20.19.0`).
2. En Windows PowerShell usar `npm.cmd` (evita bloqueo de `npm.ps1`).
3. Limpiar e instalar de cero en `frontend/`:
  - borrar `node_modules`
  - borrar `package-lock.json` solo si el lock está corrupto o conflictivo
  - `npm.cmd install`
4. Verificar:
  - `npm.cmd run build`
  - `npm.cmd run cap:sync android`

Nota: en este sprint se actualizó el lockfile de frontend y se validó build web + sync Android tras la actualización.


Evaluar el uso de Leaflet es una librería open source para trabajar con mapas interactivos
➢ https://leafletjs.com
Para indicar la ubicacion de los eventos