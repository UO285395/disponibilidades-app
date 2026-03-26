# Disponibilidad App (Frontend)

Aplicación web para gestión de disponibilidades, eventos y reservas con control por roles y dominio.

## Stack

- React + Vite
- Mantine UI
- API REST (FastAPI)

## Versiones de entorno

- Node.js: 20.19.0
- Vite: 7.2.2

Nota: Vite 7 requiere Node 20.19+ o 22.12+. Mantener estas versiones alineadas en `package.json`, `package-lock.json`, `.node-version` y `.tool-versions` para evitar fallos en despliegue.

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

## App móvil Android (APK)

Esta rama incluye integración con Capacitor en:

- `capacitor.config.json`
- `android/`

### Requisitos locales

- Node.js 20.19+
- Android Studio
- JDK 17
- Android SDK instalado desde Android Studio

### Flujo para generar APK

Desde `frontend/`:

1. `npm install`
2. `npm run build:mobile`
3. `npm run cap:open`
4. En Android Studio: `Build > Build APK(s)`

El APK se genera en:

- `frontend/android/app/build/outputs/apk/debug/app-debug.apk`

### Flujo para release (Play Store)

- En Android Studio, usar `Build > Generate Signed Bundle / APK` y generar `.aab` firmado.
- Configurar `versionCode` y `versionName` en `frontend/android/app/build.gradle`.

---

## Plan de implementación: Features mobile (Sprints)

Hoja de ruta para el desarrollo de características específicas para la experiencia nativa en Android.

### Sprint 1: Sesión Local Persistente (Capacitor Preferences)

**Objetivo**: Eliminar re-login al reiniciar la aplicación. El usuario abre la app y accede directamente si su token aún es válido.

**Alcance**:
- Migrar almacenamiento de token desde `localStorage` a `Capacitor Preferences` (almacenamiento seguro nativo).
- Implementar auto-login en `App.jsx` al iniciar: validar token, refrescar si está próximo a expirar.
- Permitir logout manual (limpiar preferencias).

**Tareas técnicas**:
1. Instalar `@capacitor/preferences` en `frontend/package.json`.
2. Refactorizar `frontend/src/api/api.js`: reemplazar `getToken()`, `setToken()`, `clearToken()` para usar `Preferences` en lugar de `localStorage`.
3. Crear `frontend/src/services/tokenService.js` con lógica:
   - `storeToken(token)` – guarda en Capacitor Preferences.
   - `retrieveToken()` – obtiene y valida expiración (JWT payload).
   - `refreshTokenIfNeeded()` – si quedan < 24h para expirar, hacer refresh.
   - `clearToken()` – elimina al logout.
4. Modificar `App.jsx`: agregar efecto de inicialización que llame a `retrieveToken()` y auto-complete login si es válido.
5. Actualizar pantallas de Login/Register para reflejar auto-login en caso de token disponible.
6. **Backend** (opcional pero recomendado): Añadir endpoint `POST /refresh` para renovar tokens (aceptar token expirado con claim de refresh).

**Criterios de aceptación**:
- [ ] No se muestra login form al reiniciar si token is válido.
- [ ] Token almacenado está cifrado en dispositivo (uso nativo Capacitor).
- [ ] Logout funciona correctamente.
- [ ] Si token está por expirar (< 24h), se auto-refresca antes de usarlo.

**Estimación**: 1-2 días.

---

### Sprint 2: Logo/Branding personalizado para Android

**Objetivo**: Reemplazar íconos y splash screen default por branding personalizado (logo, colores, nombre).

**Alcance**:
- Actualizar launcher icon (múltiples resoluciones: mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi).
- Reemplazar splash screen con versión branded.
- Validar que manifest y build.gradle reflejen nombre/etiqueta correctos.

**Tareas técnicas**:
1. Preparar assets:
   - `logo.png` 512x512 (para splash).
   - `icon.png` 192x192 (para launcher, será escalado automáticamente).
2. Generar imágenes para densidades múltiples usando Android Asset Studio o herramienta equivalente.
3. Reemplazar archivos en `frontend/android/app/src/main/res/`:
   - `mipmap-mdpi/ic_launcher.png`, `mipmap-hdpi/ic_launcher.png`, etc.
   - `drawable/splash.png`.
4. Verificar `frontend/android/app/src/main/AndroidManifest.xml`:
   - `android:label="@string/app_name"` → confirmar que `app_name` en `values/strings.xml` es correcto.
5. Verificar colores en `frontend/android/app/src/main/res/values/colors.xml` si aplica (splash background, etc.).
6. Reconstruir APK: `npm run build:mobile` → Android Studio > Build > Build APK(s).

**Criterios de aceptación**:
- [ ] Launcher icon muestra logo personalizado en home screen.
- [ ] Splash screen al iniciar app muestra branding.
- [ ] Nombre de app en home screen es correcto.
- [ ] APK generado y testeable sin errores de recursos.

**Estimación**: 0.5-1 día.

---

### Sprint 3: Notificaciones Push (FCM + backend)

**Objetivo**: Notificar a usuarios sobre nuevos eventos y permitir broadcast manual por admin (por dominio o usuarios específicos).

**Alcance**:
- Integración con Firebase Cloud Messaging (FCM) en Android.
- Backend: almacenar device tokens por usuario, exponer endpoints de notificación.
- Frontend mobile: registrarse con FCM en startup, recibir y mostrar notificaciones.
- Admin: panel para enviar notificaciones manuales o automáticamente al crear eventos.

**Tareas técnicas**:

**Backend**:
1. Crear modelo `DeviceToken(user_id, token, platform, domain, created_at, updated_at)` en `backend/models.py`.
2. Endpoints:
   - `POST /device-tokens/register` – recibe FCM token desde cliente, lo guarda (prevent duplicates by user+platform).
   - `POST /admin/notifications/send` – superadmin/admin envía notificación:
     - `scope` (all, domain, users_list)
     - `title`, `body`
     - `user_ids` (si scope=users_list)
   - Endpoint interno `POST /notifications/send-fcm` – auxiliar para enviar vía FCM API.
3. Modificar crear evento (`POST /events`): al crear, auto-enviar notificación a usuarios del dominio permitido o a todos.
4. Integrar con FCM API (usar `firebase-admin` SDK en Python):
   - Crear `backend/firebase_config.json` con credenciales.
   - Setup: `admin.initialize_app()` con credenciales.

**Frontend Mobile**:
1. Instalar `@capacitor-firebase/messaging` o `@capacitor/push-notifications`.
2. En `App.jsx` (o nuevo `services/notificationService.js`):
   - Al iniciar, solicitar permiso de notificaciones.
   - Registrar FCM token con backend (`POST /device-tokens/register`).
   - Listener para mensajes FCM: mostrar notificación nativa.
3. Crear componente simple para notificaciones recibidas (banner o toast con título/body).

**Frontend Web** (opcional pero útil):
- Panel admin en Dashboard: formulario para enviar notificaciones manuales (scope, users, title, body).
- Endpoint: `POST /admin/notifications/send` con datos del formulario.

**Criterios de aceptación**:
- [ ] App registra FCM token al iniciar.
- [ ] Al crear evento, usuarios reciben notificación push en Android.
- [ ] Admin puede enviar notificaciones manuales por scope (general, dominio, usuarios).
- [ ] Notificaciones aparecen en panel de notificaciones de Android (tap abre app).
- [ ] No hay duplicados de tokens; registro se actualiza si token cambia.

**Estimación**: 3-5 días (incluye testing en dispositivo real y debug FCM).

---

## Notas de desarrollo

- **Distribución APK**: Actualmente manual (generar APK, distribuir a usuarios vía email o drive). Sin OTA (Capgo/EAS).
- **Próximos pasos post-Sprint 3**: Considerar OTA updates para futuras versiones sin redistribuir APK.
- **Testing mobile**: Usar Android Emulator o dispositivo físico con USB debugging para validar.
- **Versionado**: Incrementar `versionCode` (numérico) y `versionName` semántico en `frontend/android/app/build.gradle` para cada release.
