# Backend (FastAPI)

## Variables de entorno

### `SECRET_KEY` — **obligatoria en producción**

Clave con la que se firman los tokens de sesión (JWT).

> **Sin esta variable el backend NO arranca en producción, a propósito.** Es preferible un fallo
> ruidoso en el despliegue a quedarse funcionando con una clave conocida: quien tenga la clave puede
> firmarse un token para **cualquier usuario, incluido un superadmin**, sin saber su contraseña.

Generar una clave nueva:

```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

Y definirla en las variables del servicio (Railway → Variables). **Nunca en el código**: el
repositorio y su historial son legibles por cualquiera con acceso.

Al cambiar la clave **se invalidan todas las sesiones abiertas**: todo el mundo tendrá que volver a
iniciar sesión una vez, incluidas las APK ya repartidas. Es el momento de hacerlo coincidir con el
reparto de una versión nueva.

En **desarrollo local** (sin `DATABASE_URL`), si no se define se genera una clave temporal distinta en
cada arranque. Es seguro, pero obliga a volver a iniciar sesión cada vez que se reinicia el backend.

### Otras variables

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Postgres en producción. Si no está, se usa SQLite local (`app.db`). También es lo que marca "esto es producción". |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Credenciales FCM para notificaciones push (API v1). |
| `FIREBASE_PROJECT_ID` | Proyecto de Firebase (si no viene en la service account). |
| `FCM_SERVER_KEY` | Modo legacy de FCM (alternativa al anterior). |
| SMTP (`HOST`/`USER`/`PASSWORD`) | Envío de correo (censo y recordatorios). También `RESEND_API_KEY`/`RESEND_FROM` como alternativa. |
| `FRONTEND_BASE_URL` | Base pública de la web (p. ej. `https://mi-app`). La usa la página de compartición `/e/{id}` para redirigir tras mostrar los metadatos Open Graph. |
| `ENABLE_REMINDER_SCHEDULER` | `1` (por defecto) arranca el planificador de recordatorios; ponlo a `0` para desactivarlo. |
| `REMINDER_TZ_OFFSET_MINUTES` | Desfase entre la hora local de los eventos (España) y UTC del servidor. Por defecto `120` (CEST, verano); usar `60` en invierno. Ajusta cuándo se disparan los recordatorios. |

## Recordatorios (opt-in)

Un hilo daemon (`_reminder_scheduler_loop`) despierta cada 5 minutos para:

- **Recordatorios de evento**: solo los que el usuario activó (tabla `event_reminders`). Nunca se
  envían automáticamente a quien no los pidió. Se entregan por push y/o correo según elija el usuario.
- **Recordatorio semanal de disponibilidad**: solo a quien hizo opt-in (`users.availability_reminder_opt_in`),
  los lunes a las 9:00 locales, y solo si no ha marcado disponibilidad esa semana.

> Nota de zona horaria: la app guarda fechas/horas como texto local. La comparación usa
> `utcnow + REMINDER_TZ_OFFSET_MINUTES`. Un desfase mal configurado adelanta o atrasa los avisos.
> La deduplicación del recordatorio semanal es en memoria; un reinicio del servicio en la ventana de
> envío podría reenviar. Es asumible dado que es semanal y opt-in.

## Eventos

- Los eventos expirados (`date < hoy`) se borran automáticamente en `cleanup_expired_data` (junto con
  sus respuestas), para mantener la base de datos ligera. La contabilidad/finanzas de eventos se lleva
  en una aplicación aparte.
- Los **adjuntos** de evento (`events.attachments`, JSON de `{name, url}`) son solo por enlace: Railway
  tiene almacenamiento efímero, así que no se guardan ficheros en disco.

## Seguridad

- **Contraseñas**: se guardan con Argon2 (`passlib`), nunca en claro.
- **Fuerza bruta**: `/login` bloquea tras **8 intentos fallidos por correo en 5 minutos** (429).

  El contador vive en la **base de datos** (`login_attempts`), no en memoria. Un primer intento en
  memoria con clave IP+correo **no funcionó en el despliegue real**: detrás del proxy,
  `request.client.host` no es una IP de cliente estable, así que la clave cambiaba en cada petición y
  no acumulaba nunca (comprobado en producción: 25 intentos seguidos sin bloqueo). En base de datos
  funciona también con varias réplicas y sobrevive a los reinicios.

  Se cuenta **por correo, no por IP**, para frenar también a quien rote de IP. **Contrapartida
  asumida**: alguien podría dejar una cuenta bloqueada unos minutos machacándola. Es un mal mucho
  menor que permitir adivinar contraseñas sin límite, y la ventana es corta (5 min). Un login
  correcto limpia el contador.
- **Autoridad**: la puede gestionar un admin se decide en un único sitio (`org_service.can_manage_unit`):
  su estructura y todas las que dependen de ella. No se deduce del dominio del email.

## Arranque local

```bash
cd backend
.venv/Scripts/python.exe -m uvicorn main:app --reload
```

En Windows puede hacer falta `PYTHONIOENCODING=utf-8` para que no falle al imprimir emojis en consola.

## Migraciones

No hay Alembic: el esquema se verifica y completa en cada arranque de forma **aditiva e idempotente**
(`ensure_legacy_schema_compatibility` y `ensure_org_hierarchy_schema_compatibility`).

> Cuidado al añadir columnas: `ALTER TABLE ADD COLUMN` **no crea el índice** aunque el modelo lo
> declare con `index=True` (eso solo aplica al crear la tabla). Los índices de columnas añadidas por
> migración hay que crearlos explícitamente con `CREATE INDEX IF NOT EXISTS`.
