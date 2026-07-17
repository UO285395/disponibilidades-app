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
| SMTP (`HOST`/`USER`/`PASSWORD`) | Envío de correo del censo. |

## Seguridad

- **Contraseñas**: se guardan con Argon2 (`passlib`), nunca en claro.
- **Fuerza bruta**: `/login` bloquea tras 8 intentos fallidos por IP+correo en 5 minutos. Es un freno
  en memoria: se reinicia con el proceso y no se comparte entre instancias, pero encarece mucho un
  ataque. Si algún día se escala a varias instancias, conviene moverlo a un almacén compartido.
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
