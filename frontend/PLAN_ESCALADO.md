# PLAN ESCALADO: Rediseño para Eventos Públicos y Escalado Estatal

## CONTEXTO EJECUTIVO

**Proyecto**: Disponibilidad App - Gestor de disponibilidades, eventos y recursos  
**Estado actual**: Aplicación interna para militantes con APK Android (Capacitor)  
**Objetivo**: Transformar a plataforma pública escalable + notificaciones + iCalendar export  
**Duración**: 4 semanas (MVP en 6 fases parallelizables)  
**Status documento**: Ready for Implementation en sesión IA futura  

## SEGUIMIENTO DE EJECUCIÓN

- [x] 2026-07-16: Rama de implementación creada (`public-events-phase1`).
- [x] 2026-07-16: Fase 1 backend iniciada y aplicada en modelos + compatibilidad de esquema.
- [x] 2026-07-16: Fase 3 backend iniciada con endpoints `guest-policies` CRUD y `POST /events/{id}/responses/guest`.
- [x] 2026-07-16: `GET /events` actualizado con filtro `visibility` y lógica guest/auth por visibilidad.
- [x] 2026-07-16: `GET /calendar/export.ics` implementado (`backend/services/calendar_service.py` + endpoint), probado manualmente contra `app.db` local (evento público con location/URL/organizer, folding RFC5545, validación de `visibility`).
- [x] 2026-07-16: `POST /auth/refresh` ya existía implementado en `backend/main.py` (Fase 5 backend), coherente con `authAPI.refresh()` en `frontend/src/api/api.js`.
- [x] 2026-07-16: Fase 2 implementada: `App.jsx` con routing dual (`/` → `PublicHome` sin sesión, `/login` separado, `/eventos/:id` → `EventDetail` público), `PublicHome.jsx`, `EventDetail.jsx` y `GuestEventResponse.jsx` nuevos, `EventsSection.jsx` con filtro de visibilidad + badges + export `.ics`, `Dashboard.jsx` con botón de export. Probado end-to-end con Playwright headless (backend local + frontend dev): visitante ve eventos públicos y responde sin cuenta (persistido en `guest_responses` con `guest_identifier` UUID de cliente), militante ve panel con filtros Todos/Públicos/Internos funcionando. Sin errores de consola.
- [x] 2026-07-16: Backend de soporte añadido para Fase 2: `GET /events/{id}/public` (detalle sin auth, distinto del `GET /events/{id}` de admin), helper `_serialize_event_with_counts` para no duplicar la serialización entre `/events` y el nuevo endpoint.
- [x] 2026-07-16: Fase 4 completada: `recipient_type` (guest/authenticated) en el payload FCM, filtro de frescura de tokens (>30d inactivos no reciben push), `_notify_guest_tokens_for_event()` para avisar a invitados suscritos cuando un evento es público, registro de push para invitados dentro de la APK (`mobileNotifications.js` ya no exige sesión, re-registra en cada cambio de auth).
- [x] 2026-07-16: Fase 5 completada: `ensureTokenValid()` (refresco silencioso si quedan <24h de token) integrado en `useSessionUser` con revalidación en foco/visibilitychange, y `SessionExpiredModal` — ya no hay redirect forzado y silencioso al expirar de verdad, se muestra el modal y el usuario decide cuándo volver a loguearse.
- [x] 2026-07-16: Bugs encontrados y corregidos durante la implementación de Fase 4/5 (no estaban en el checklist original, pero bloqueaban que el plan funcionase de verdad):
  - `PUT /events/{id}` (edición de evento) no persistía ninguno de los campos de Fase 1 (`visibility`, `event_type`, `location`, `external_url`, `metadata`, `is_recurring`, `recurrence_rule`) — un admin no podía cambiar un evento de interno a público. Corregido, con aviso a invitados si el evento pasa a público por primera vez en una edición.
  - El panel de admin (`AdminEvents.jsx`) no tenía ningún campo de formulario para `visibility`/`event_type`/`location`/`external_url` — ningún admin real podía crear un evento público desde la UI, solo vía API directa. Añadidos selects/inputs en creación y edición, más badge de visibilidad en el listado.
  - Race de navegación en `SessionExpiredModal`: el `navigate("/login")` competía con el propio guard de rutas de `App.jsx` (que aún veía `hasSession=true` un instante) y rebotaba a `/dashboard` → `/`. Resuelto con recarga completa a `/` tras limpiar el token, que evita la carrera por completo.
- [ ] 2026-07-16: Fase 6 (federación) aparcada a propósito: es diseño especulativo sin instancia secundaria real; se retoma cuando haya una segunda instancia que replicar.

**Verificación de Fase 4/5**: backend local + frontend dev con Playwright headless. Confirmado: creación de evento público desde el panel admin (badge visible), edición persiste `location` tras recargar, modal "Sesión expirada" aparece cuando el token y su refresco fallan de verdad (sin redirect silencioso), refresco silencioso rota el token en foco cuando quedan <24h de vida. Sin errores de consola atribuibles a este trabajo (dos warnings de React sobre una prop `compact` son preexistentes, de un componente no tocado en esta sesión). El envío real de push FCM no se verificó (requiere credenciales de Firebase de producción y un dispositivo físico/APK), solo la lógica de selección de destinatarios y el payload.

**Desviación documentada (Fase 2, 2026-07-16)**: no se creó una ruta `/eventos/:id/responder` separada — `GuestEventResponse` se embebe directamente en `EventDetail` (`/eventos/:id`), evitando una ruta redundante para el mismo formulario. `Dashboard.jsx` no se renombró a `MilitantDashboard.jsx` (cambio cosmético sin valor funcional que solo generaba churn de imports); se le añadió el botón de export sin tocar el nombre de archivo. No se implementó "notificaciones recientes" en el dashboard: requiere un endpoint de historial de notificaciones que no existe (es Fase 4, no Fase 2).

## DECISIONES ARQUITECTÓNICAS CONFIRMADAS

1. **Guest Response Model**: Nombre opcional (sin email obligatorio); core es iCalendar export
2. **iCalendar Export**: Según rol - públicos para visitantes, públicos+internos para militantes
3. **Login Persistente (APK)**: Sin re-login frecuente, solo logout manual; Home inicial es Inicio (no Login)
4. **Notificaciones**: Rol influye en TIPO recibido (guest→públicos, militante→ambos)
5. **GuestPolicies**: Tabla separada para controlar funcionalidades por dominio
6. **Escalabilidad**: Modelo híbrido central + regional (diseño sin romper, federación futura)
7. **Downtime BD**: Aceptable <5 min; maintenance window permitido

---

## FASES DE IMPLEMENTACIÓN

### FASE 1: Arquitectura de Datos (Semana 1)
**Archivos**: backend/models.py, backend/database.py

#### Cambios Event Model
\\\python
# Nuevos campos en Event
visibility = Column(String, default="internal")  # Enum: public, internal, private
event_type = Column(String, default="participativo")  # Enum: informativo, participativo
location = Column(String, nullable=True)
external_url = Column(String, nullable=True)
metadata = Column(String, nullable=True)  # JSON
is_recurring = Column(Boolean, default=False)
recurrence_rule = Column(String, nullable=True)  # iCalendar RRULE
updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
deleted_at = Column(DateTime, nullable=True)  # Soft delete
\\\

#### Nuevas tablas
\\\sql
CREATE TABLE guest_responses (
    id INTEGER PRIMARY KEY,
    event_id INTEGER NOT NULL,
    guest_name VARCHAR,
    guest_email VARCHAR,
    answer VARCHAR,  -- si, no, abstain, saved
    companions INTEGER DEFAULT 0,
    guest_identifier VARCHAR,  -- hash para deduplicar
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, guest_identifier)
);

CREATE TABLE guest_policies (
    id INTEGER PRIMARY KEY,
    domain_tag VARCHAR UNIQUE,
    guest_responses_enabled BOOLEAN DEFAULT 1,
    guest_surveys_enabled BOOLEAN DEFAULT 0,
    guest_census_enabled BOOLEAN DEFAULT 0,
    guest_notifications_enabled BOOLEAN DEFAULT 1,
    max_guest_responses_per_event INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE instance_logs (
    id INTEGER PRIMARY KEY,
    action VARCHAR,
    entity_type VARCHAR,
    entity_id VARCHAR,
    instance_origin VARCHAR DEFAULT 'central',
    payload TEXT,  -- JSON
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
\\\

#### Extender DeviceToken
- user_id: Nullable (NULL para guests)
- device_identifier: str (para deduplicar guests)
- user_role: str (guest|user|admin|superadmin)
- domain_tag: str (nullable)
- is_active: bool
- last_used: datetime

**Criterios de aceptación**:
- [x] BD migrada (<5 min downtime) *(migración aditiva idempotente en arranque backend)*
- [x] Índices en (event.visibility), (guest_responses.event_id), (device_tokens.device_identifier)
- [x] Backward compatibility: queries antiguas OK *(sin errores de análisis en backend)*

---

### FASE 2: Frontend Layout Rediseño (Semana 1-2)
**Archivos primarios**: frontend/src/App.jsx, frontend/src/pages/*, frontend/src/components/*

#### Nuevo sistema de rutas
\\\
Públicas (sin auth):
  / → PublicHome (lista eventos públicos)
  /eventos/:id → EventDetail (detalle público)
  /eventos/:id/responder → GuestResponseFlow
  /login → LoginPage

Autenticadas (con auth):
  /dashboard → MilitantDashboard
  /eventos → EventsSection (públicos + internos)
  /calendario → AvailabilityCalendar
  /admin/* → AdminPanel
  /configuracion → SettingsPage (logout, export iCalendar)
\\\

#### Componentes nuevos
- **PublicHome.jsx**: Listado eventos públicos, filtros, sin requerir login
- **GuestEventResponse.jsx**: Modal nombre + respuesta + companions (opcional)
- **Modificar EventsSection.jsx**: +filtro visibility, badges (Público|Interno), botón export .ics
- **Modificar Dashboard.jsx** → **MilitantDashboard.jsx**: +botón logout, +export iCalendar, +notificaciones recientes

#### Sesión Persistente (APK)
\\\jsx
// App.jsx: Init detector
useEffect(() => {
  const initSessionFromStorage = async () => {
    const token = await getTokenFromStorage();  // Capacitor Preferences + fallback
    if (token && validateToken(token)) {
      setIsLoggedIn(true);
    }
  };
  initSessionFromStorage();
}, []);

// Render condicional
return isLoggedIn ? <AuthenticatedLayout /> : <PublicLayout />;
\\\

**Criterios de aceptación**:
- [x] "/" muestra PublicHome sin login
- [x] Eventos públicos visibles en PublicHome
- [x] Post-login: Dashboard militante visible
- [x] Logout funciona y limpia storage APK (ya existente, sin cambios)
- [ ] APK: No re-login si token válido tras reinicio (lógica ya existente en `api.js`/`useSessionUser`; pendiente de probar en build APK real, no verificable desde web)

---

### FASE 3: Backend APIs y Servicios (Semana 2-3)
**Archivos**: backend/main.py, backend/services/* (nuevos), backend/models.py

#### Nuevos endpoints

**GET /events (mejorado)**
\\\
Query params: visibility=public,internal&limit=50&offset=0

Lógica acceso:
  - Sin auth: solo visibility=public
  - User autenticado: public + internal(dominio usuario)
  - Admin/Superadmin: según permisos
\\\

**POST /events/{id}/responses/guest (SIN AUTH)**
\\\
POST /events/:id/responses/guest
Body: {guest_name?, answer, companions?}
Return: {status, export_token}

Valida: GuestPolicy.guest_responses_enabled para dominio
Guardar guest_identifier deduplicación
\\\

**GET /calendar/export.ics**
\\\
GET /calendar/export.ics?visibility=public,internal
Return: .ics RFC 5545 file download

Incluye: VEVENT con UID único, SUMMARY, DTSTART, LOCATION, ORGANIZER
Militante ve: públicos + internos (según rol) · Visitante sin sesión: solo públicos
\\\

> **Desviación documentada (2026-07-16)**: el plan original nombraba el query param
> `event_type` y marcaba el endpoint como "CON AUTH". Se implementó como:
> - Param renombrado a `visibility` (public/internal/private) para no chocar con
>   `Event.event_type` (informativo/participativo), que es un campo distinto.
> - Auth opcional (igual que `GET /events`): sin sesión se fuerza `visibility=public`
>   para cumplir la Decisión Arquitectónica #2 ("públicos para visitantes,
>   públicos+internos para militantes"), en vez de bloquear el export a visitantes.
> - Reutiliza el mismo helper `_visible_events_for_user()` que `GET /events`
>   (extraído en esta sesión) para no duplicar la lógica de permisos.

**GET/POST /admin/guest-policies (SUPERADMIN)**
\\\
GET /admin/guest-policies?domain_tag=madrid
POST /admin/guest-policies {domain_tag, guest_responses_enabled, ...}
PUT /admin/guest-policies/{id}
DELETE /admin/guest-policies/{id}
\\\

#### Servicios nuevos
- **calendar_service.py**: generate_ics(events, user) → RFC 5545
- **notification_service.py**: get_notification_recipients(), send_notifications()
- **audit_service.py**: log_action() → InstanceLog

**Criterios de aceptación**:
- [x] GET /events devuelve públicos (sin auth), públicos+internos (con auth)
- [x] POST /events/{id}/responses/guest OK sin auth
- [x] GET /calendar/export.ics devuelve .ics válido (probado localmente; pendiente validación real en Apple Calendar, Google Calendar, Outlook con evento en producción)
- [x] .ics file: VEVENT con UID único, SUMMARY, DTSTART, LOCATION, ORGANIZER
- [x] GuestPolicies CRUD OK (superadmin)

---

### FASE 4: Notificaciones Unificadas (Semana 3)
**Archivos**: backend/services/notification_service.py, backend/main.py

#### Lógica
- Evento public → push a guests + autenticados (si enabled)
- Evento internal → push solo autenticados del dominio
- Diferenciar recipient_type en payload (guest vs authenticated)

#### Cambios
- POST /device-tokens/register: Aceptar user_role=guest sin user_id
- Extender POST /admin/notifications/send: scope all|colectivo|users
- Trigger en POST /events: Llamar send_notifications() automático

**Criterios de aceptación**:
- [x] FCM push llega a device_token (guest y autenticado) — lógica de envío y payload verificada; entrega real no probada (requiere Firebase de producción + dispositivo)
- [x] Guest recibe notificación si evento público (`_notify_guest_tokens_for_event`, disparado en creación y en edición-a-público)
- [x] Militante recibe notificación si evento público o interno de su dominio (sin cambios de comportamiento, ya existía)
- [x] Device tokens inactivos (>30d) no reciben notificaciones (`_device_token_freshness_filter`, aplicado a ambos caminos)

---

### FASE 5: Sesión Persistente APK (Semana 2-3)
**Archivos**: frontend/src/api/api.js, backend/main.py

#### Validar api.js
- getToken() → Capacitor Preferences + fallback localStorage
- setToken() → escribe ambas
- clearToken() → borra ambas
- Cache en memoria

#### Agregar ensureTokenValid()
\\\javascript
export async function ensureTokenValid() {
  const token = await getToken();
  if (!token) return false;
  
  const payload = JSON.parse(atob(token.split('.')[1]));
  const expiresAt = new Date(payload.exp * 1000);
  
  // Si < 24h para expirar, auto-refresh
  if (hoursUntilExpiry(expiresAt) < 24) {
    return await refreshToken();
  }
  return true;
}
\\\

#### Backend: POST /auth/refresh
\\\python
@app.post("/auth/refresh")
async def refresh_token(credentials: HTTPAuthorizationCredentials):
    user = verify_and_get_user(credentials.credentials, db)
    new_token = create_access_token(user.id)
    return {"token": new_token}
\\\

**Criterios de aceptación**:
- [x] Token guardado en Capacitor Preferences (APK) — ya existente
- [x] No muestra login form si token válido — ya existente
- [x] Auto-refresh silencioso si <24h expiración (`ensureTokenValid()`, verificado con Playwright: token rotado tras evento de foco)
- [x] Si expira: Modal "Sesión expirada" (no redirect forzado) — verificado con Playwright
- [x] Logout limpia Preferences — ya existente

---

### FASE 6: Arquitectura Federada - Fundación (Semana 3-4)
**Archivos**: backend/middleware.py (nuevo), backend/services/audit_service.py (nuevo)

#### Cambios (NO implementar replicación real, solo diseño)

Agregar campos opcionales (no usados en MVP):
- Event.instance_origin = "central" (default)
- Event.region_tag = NULL
- DomainPolicy.region_tag = NULL

Crear:
- InstanceContextMiddleware: Detecta instancia actual
- Todos cambios registran en InstanceLog (para auditoría futura)

**Notas**: Estructura permite agregar región-tag sin breaking changes. Replicación es posterior.

**Criterios de aceptación**:
- [ ] InstanceLog poblado (auditoría de eventos, responses, policies)
- [ ] instance_origin = "central" por defecto
- [ ] Schema permite region_tag sin breaking changes

---

## ARCHIVOS CRÍTICOS A MODIFICAR (RESUMEN)

| Fase | Archivo | Cambios resumidos | Estado |
|------|---------|------------------|--------|
| 1 | backend/models.py | Event (+visibility, event_type, location, metadata, deleted_at); GuestResponse, GuestPolicy, InstanceLog; DeviceToken | ✅ |
| 1 | backend/database.py / main.py | Migración aditiva idempotente en arranque, índices | ✅ |
| 2 | frontend/src/App.jsx | Enrutamiento dual público/auth, init sesión persistente, init push (guest+auth) | ✅ |
| 2 | frontend/src/pages/PublicHome.jsx | NUEVA | ✅ |
| 2 | frontend/src/pages/EventDetail.jsx | NUEVA (detalle público, embebe GuestEventResponse) | ✅ |
| 2 | frontend/src/components/GuestEventResponse.jsx | NUEVA | ✅ |
| 2 | frontend/src/components/EventsSection.jsx | +filtro visibility, +badges, +export .ics | ✅ |
| 2 | frontend/src/pages/Dashboard.jsx | +export .ics, +SessionExpiredModal (no se renombró a MilitantDashboard, ver desviación) | ✅ |
| 2 | frontend/src/components/AdminEvents.jsx | NO estaba en el plan original: +campos visibility/event_type/location/external_url (gap encontrado) | ✅ |
| 3 | backend/main.py | GET /events (mejorado), GET /events/{id}/public (nuevo, no estaba en el plan), POST /events/{id}/responses/guest, GET /calendar/export.ics, /admin/guest-policies, POST /auth/refresh (ya existía) | ✅ |
| 3 | backend/services/calendar_service.py | NUEVA | ✅ |
| 4 | backend/main.py | _notify_guest_tokens_for_event, _device_token_freshness_filter, recipient_type en payload FCM | ✅ |
| 4 | frontend/src/services/mobileNotifications.js | Registro de push sin exigir sesión (guests), re-registro en cambio de auth | ✅ |
| 5 | frontend/src/api/api.js | +ensureTokenValid() | ✅ |
| 5 | frontend/src/hooks/useSessionUser.js | sessionExpired + revalidación en foco (en vez de redirect silencioso) | ✅ |
| 5 | frontend/src/components/SessionExpiredModal.jsx | NUEVA | ✅ |
| 6 | backend/middleware.py | NUEVA | ⏸️ Aparcada |
| 6 | backend/services/audit_service.py | NUEVA | ⏸️ Aparcada |

---

## CÓMO USAR ESTE DOCUMENTO

1. **En próxima sesión IA**: Cargar este archivo PLAN_ESCALADO.md como contexto
2. **Copiar sección de fase** que quieras implementar
3. **Ejecutar fase independientemente** (no necesita otras)
4. **Validar criterios de aceptación** al terminar
5. **Documentar cambios** si hay desviación necesaria

---

*Fin del Plan - Documento generado como prompt para futuras instancias IA*

