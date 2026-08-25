from fastapi import FastAPI, Depends, HTTPException, Body, Query, Request, Response
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, inspect, or_, text
from sqlalchemy.exc import IntegrityError
from jose import jwt, JWTError
from passlib.context import CryptContext
from datetime import datetime, timedelta

import hashlib
import html
import json
import logging
import os
import secrets
import threading
import urllib.error
import urllib.request

import models
from models import (
    User,
    Availability,
    Event,
    EventResponse,
    EventCompanion,
    EventAvailabilitySlot,
    GuestEventAvailabilitySlot,
    GuestResponse,
    GuestPolicy,
    Survey,
    SurveyField,
    SurveyResponse,
    DeviceToken,
    NotificationDispatch,
    InstanceLog,
)
from database import SessionLocal, engine
from services.calendar_service import generate_ics
from services import org_service

# Log estructurado para poder diagnosticar fallos de envío push y de login sin
# reproducirlos: en Railway estos mensajes quedan en la consola del servicio.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("disponibilidad")


# =========================================================
# CREAR TABLAS
# =========================================================
print("🔧 Migrando esquema...")
models.Base.metadata.create_all(bind=engine)


def ensure_legacy_schema_compatibility():
    try:
        inspector = inspect(engine)
        table_names = set(inspector.get_table_names())

        if "events" in table_names:
            event_columns = {column["name"] for column in inspector.get_columns("events")}
            if "allowed_domain" not in event_columns:
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE events ADD COLUMN allowed_domain VARCHAR"))
                print("✅ Columna events.allowed_domain añadida para compatibilidad")
            with engine.begin() as conn:
                if "visibility" not in event_columns:
                    conn.execute(text("ALTER TABLE events ADD COLUMN visibility VARCHAR DEFAULT 'internal'"))
                    print("✅ Columna events.visibility añadida")
                if "event_type" not in event_columns:
                    conn.execute(text("ALTER TABLE events ADD COLUMN event_type VARCHAR DEFAULT 'participativo'"))
                    print("✅ Columna events.event_type añadida")
                if "location" not in event_columns:
                    conn.execute(text("ALTER TABLE events ADD COLUMN location VARCHAR"))
                    print("✅ Columna events.location añadida")
                if "external_url" not in event_columns:
                    conn.execute(text("ALTER TABLE events ADD COLUMN external_url VARCHAR"))
                    print("✅ Columna events.external_url añadida")
                if "metadata" not in event_columns:
                    conn.execute(text("ALTER TABLE events ADD COLUMN metadata VARCHAR"))
                    print("✅ Columna events.metadata añadida")
                if "is_recurring" not in event_columns:
                    conn.execute(text("ALTER TABLE events ADD COLUMN is_recurring INTEGER DEFAULT 0"))
                    print("✅ Columna events.is_recurring añadida")
                if "recurrence_rule" not in event_columns:
                    conn.execute(text("ALTER TABLE events ADD COLUMN recurrence_rule VARCHAR"))
                    print("✅ Columna events.recurrence_rule añadida")
                if "updated_at" not in event_columns:
                    conn.execute(text("ALTER TABLE events ADD COLUMN updated_at VARCHAR"))
                    print("✅ Columna events.updated_at añadida")
                if "deleted_at" not in event_columns:
                    conn.execute(text("ALTER TABLE events ADD COLUMN deleted_at VARCHAR"))
                    print("✅ Columna events.deleted_at añadida")
                if "attachments" not in event_columns:
                    conn.execute(text("ALTER TABLE events ADD COLUMN attachments VARCHAR"))
                    print("✅ Columna events.attachments añadida")
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_events_visibility ON events(visibility)"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_events_date ON events(date)"))

        if "domain_policies" in table_names:
            policy_columns = {column["name"] for column in inspector.get_columns("domain_policies")}
            with engine.begin() as conn:
                if "users_enabled" not in policy_columns:
                    conn.execute(text("ALTER TABLE domain_policies ADD COLUMN users_enabled INTEGER DEFAULT 1"))
                    print("✅ Columna domain_policies.users_enabled añadida para compatibilidad")
                if "domain_policies_enabled" not in policy_columns:
                    conn.execute(text("ALTER TABLE domain_policies ADD COLUMN domain_policies_enabled INTEGER DEFAULT 0"))
                    print("✅ Columna domain_policies.domain_policies_enabled añadida para compatibilidad")
                if "census_enabled" not in policy_columns:
                    conn.execute(text("ALTER TABLE domain_policies ADD COLUMN census_enabled INTEGER DEFAULT 0"))
                    print("✅ Columna domain_policies.census_enabled añadida para compatibilidad")
                if "surveys_enabled" not in policy_columns:
                    conn.execute(text("ALTER TABLE domain_policies ADD COLUMN surveys_enabled INTEGER DEFAULT 0"))
                    print("✅ Columna domain_policies.surveys_enabled añadida para compatibilidad")
                if "notifications_enabled" not in policy_columns:
                    conn.execute(text("ALTER TABLE domain_policies ADD COLUMN notifications_enabled INTEGER DEFAULT 0"))
                    print("✅ Columna domain_policies.notifications_enabled añadida para compatibilidad")

        if "users" in table_names:
            user_columns = {column["name"] for column in inspector.get_columns("users")}
            with engine.begin() as conn:
                if "group_tag" not in user_columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN group_tag VARCHAR"))
                    print("✅ Columna users.group_tag añadida para compatibilidad")
                if "reminder_email" not in user_columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN reminder_email VARCHAR"))
                    print("✅ Columna users.reminder_email añadida")
                if "availability_reminder_opt_in" not in user_columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN availability_reminder_opt_in INTEGER DEFAULT 0"))
                    print("✅ Columna users.availability_reminder_opt_in añadida")

        if "device_tokens" in table_names:
            device_token_columns = {column["name"] for column in inspector.get_columns("device_tokens")}
            with engine.begin() as conn:
                if "device_identifier" not in device_token_columns:
                    conn.execute(text("ALTER TABLE device_tokens ADD COLUMN device_identifier VARCHAR"))
                    print("✅ Columna device_tokens.device_identifier añadida")
                if "user_role" not in device_token_columns:
                    conn.execute(text("ALTER TABLE device_tokens ADD COLUMN user_role VARCHAR DEFAULT 'user'"))
                    print("✅ Columna device_tokens.user_role añadida")
                if "domain_tag" not in device_token_columns:
                    conn.execute(text("ALTER TABLE device_tokens ADD COLUMN domain_tag VARCHAR"))
                    print("✅ Columna device_tokens.domain_tag añadida")
                if "last_used" not in device_token_columns:
                    conn.execute(text("ALTER TABLE device_tokens ADD COLUMN last_used VARCHAR"))
                    print("✅ Columna device_tokens.last_used añadida")
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_device_tokens_device_identifier ON device_tokens(device_identifier)"))

        # Deduplicar y reforzar unicidad (event_id, user_id) en respuestas y acompañantes.
        # Se hace de forma aditiva e idempotente: no borra datos legítimos (solo duplicados
        # históricos, quedándose con el registro más antiguo por usuario/evento) y no requiere
        # pasos manuales, para que el usuario no perciba ningún cambio.
        if "event_responses" in table_names:
            with engine.begin() as conn:
                conn.execute(text(
                    "DELETE FROM event_responses WHERE id NOT IN "
                    "(SELECT MIN(id) FROM event_responses GROUP BY event_id, user_id)"
                ))
                conn.execute(text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ux_event_responses_event_user "
                    "ON event_responses(event_id, user_id)"
                ))
            print("✅ Índice único event_responses(event_id, user_id) verificado")

        if "event_companions" in table_names:
            with engine.begin() as conn:
                conn.execute(text(
                    "DELETE FROM event_companions WHERE id NOT IN "
                    "(SELECT MIN(id) FROM event_companions GROUP BY event_id, user_id)"
                ))
                conn.execute(text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ux_event_companions_event_user "
                    "ON event_companions(event_id, user_id)"
                ))
            print("✅ Índice único event_companions(event_id, user_id) verificado")

        if "guest_responses" in table_names:
            with engine.begin() as conn:
                conn.execute(text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ux_guest_responses_event_guest "
                    "ON guest_responses(event_id, guest_identifier)"
                ))
                conn.execute(text(
                    "CREATE INDEX IF NOT EXISTS ix_guest_responses_event_id "
                    "ON guest_responses(event_id)"
                ))
            print("✅ Índices guest_responses verificados")
    except Exception as exc:
        print(f"⚠️ No se pudo verificar compatibilidad de esquema: {exc}")


def cleanup_removed_finance_artifacts():
    """Elimina de la base de datos lo que quedó huérfano al retirar el panel de
    Métricas/finanzas por evento (la contabilidad se lleva en otra aplicación):
    la tabla `event_finances` y la columna `events.archived_at`. Idempotente:
    si ya no existen, no hace nada."""
    try:
        inspector = inspect(engine)
        table_names = set(inspector.get_table_names())

        if "event_finances" in table_names:
            with engine.begin() as conn:
                conn.execute(text("DROP TABLE event_finances"))
            print("🗑️ Tabla event_finances eliminada (finanzas retiradas del producto)")

        if "events" in table_names:
            event_columns = {column["name"] for column in inspector.get_columns("events")}
            if "archived_at" in event_columns:
                with engine.begin() as conn:
                    # El índice que se creó sobre la columna debe caer primero,
                    # o el DROP COLUMN falla (SQLite) al quedar huérfano.
                    conn.execute(text("DROP INDEX IF EXISTS ix_events_archived_at"))
                    conn.execute(text("ALTER TABLE events DROP COLUMN archived_at"))
                print("🗑️ Columna events.archived_at eliminada")
    except Exception as exc:
        print(f"⚠️ No se pudo limpiar artefactos de finanzas retiradas: {exc}")


ensure_legacy_schema_compatibility()
cleanup_removed_finance_artifacts()
org_service.ensure_org_hierarchy_schema_compatibility(engine, SessionLocal)


def bootstrap_initial_admin():
    """Crea el primer superadmin si la BD está vacía y las variables
    INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD están definidas.

    Este mecanismo está pensado para el primer arranque en un servidor nuevo:
    define las variables, despliega, entra a la app, y luego elimínalas del
    panel de entorno para no dejar la contraseña expuesta.

    Si el usuario ya existe (re-despliegue, reinicio) no hace nada.
    """
    initial_email = os.getenv("INITIAL_ADMIN_EMAIL", "").strip().lower()
    initial_password = os.getenv("INITIAL_ADMIN_PASSWORD", "").strip()

    if not initial_email or not initial_password:
        return  # Variables no definidas: modo normal

    from passlib.context import CryptContext as _CC
    _pwd = _CC(schemes=["argon2"], deprecated="auto")

    db = SessionLocal()
    try:
        existing = db.query(models.User).filter(models.User.email == initial_email).first()
        if existing:
            # Actualizar la contraseña por si cambió la variable de entorno.
            # Así un redeploy con INITIAL_ADMIN_PASSWORD nuevo siempre sincroniza.
            existing.hashed_password = _pwd.hash(initial_password)
            db.commit()
            print(f"ℹ️  Bootstrap: contraseña del superadmin '{initial_email}' actualizada.")
            return

        # Asegurar que existe la unidad raíz (la crea si falta)
        root_unit = org_service.get_root_unit(db)
        if root_unit is None:
            root_unit = org_service.ensure_colectivo_for_domain(db, initial_email.split("@")[-1])

        admin = models.User(
            email=initial_email,
            full_name="Administrador",
            hashed_password=_pwd.hash(initial_password),
            role="superadmin",
            org_unit_id=root_unit.id if root_unit else None,
        )
        db.add(admin)
        db.commit()
        print(f"✅ Bootstrap: superadmin '{initial_email}' creado. Elimina las variables "
              "INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD del servidor después de entrar.")
    except Exception as exc:
        db.rollback()
        print(f"⚠️  Bootstrap fallido: {exc}")
    finally:
        db.close()


bootstrap_initial_admin()


# =========================================================
# CONFIG JWT
# =========================================================
# La clave de firma NUNCA debe estar en el código: quien lea el repositorio (o
# su historial) podría firmarse un token para cualquier usuario, incluido un
# superadmin, sin conocer ninguna contraseña. Se lee del entorno.
#
# En producción se exige definirla: es preferible que el arranque falle de forma
# ruidosa a quedarse funcionando con una clave conocida.
SECRET_KEY = os.getenv("SECRET_KEY", "").strip()
_IS_PRODUCTION = bool(os.getenv("DATABASE_URL"))

if not SECRET_KEY:
    if _IS_PRODUCTION:
        raise RuntimeError(
            "Falta la variable de entorno SECRET_KEY. Define una clave aleatoria "
            "(p. ej. `python -c \"import secrets; print(secrets.token_urlsafe(64))\"`) "
            "en las variables del servicio antes de desplegar."
        )
    # Desarrollo local: clave efímera distinta en cada arranque. Obliga a
    # volver a iniciar sesión al reiniciar, pero evita cualquier valor por
    # defecto inseguro que pudiera acabar en producción por descuido.
    SECRET_KEY = secrets.token_urlsafe(64)
    print("⚠️ SECRET_KEY no definida: usando una clave temporal (solo desarrollo local).")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 días

auth_scheme = HTTPBearer(auto_error=False)
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


# =========================================================
# FRENO A LA FUERZA BRUTA EN EL LOGIN
# =========================================================
# La API es pública (la usa la APK repartida): sin esto se pueden probar
# contraseñas de forma ilimitada contra el correo de un militante.
#
# El contador vive en la BASE DE DATOS, no en memoria. Un primer intento en
# memoria y con clave IP+email NO funcionó en el despliegue real: detrás del
# proxy no hay una IP de cliente estable, así que la clave cambiaba en cada
# petición y no acumulaba nunca (verificado: 25 intentos sin bloqueo).
#
# Se cuenta por EMAIL, no por IP: así también frena a un atacante que rote de
# IP. Contrapartida asumida: alguien podría dejar una cuenta bloqueada unos
# minutos machacándola. Es un mal mucho menor que permitir adivinar contraseñas
# sin límite, y la ventana es corta.
_LOGIN_MAX_FAILURES = 8
_LOGIN_WINDOW = timedelta(minutes=5)


def _client_ip(request: Request) -> str:
    """IP real del cliente. Tras un proxy, request.client.host es el proxy."""
    forwarded = (request.headers.get("x-forwarded-for") or "").strip()
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request and request.client else "no-ip"


def _ensure_login_allowed(db: Session, email: str):
    cutoff = (datetime.utcnow() - _LOGIN_WINDOW).isoformat()
    failures = (
        db.query(models.LoginAttempt)
        .filter(
            models.LoginAttempt.email == email,
            models.LoginAttempt.created_at > cutoff,
        )
        .count()
    )
    if failures >= _LOGIN_MAX_FAILURES:
        raise HTTPException(429, "Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.")


def _record_login_failure(db: Session, email: str, request: Request):
    ip = _client_ip(request)
    db.add(models.LoginAttempt(
        email=email,
        ip=ip,
        created_at=datetime.utcnow().isoformat(),
    ))
    db.commit()
    logger.info("Login fallido para email=%s ip=%s", email, ip)


def _clear_login_failures(db: Session, email: str):
    db.query(models.LoginAttempt).filter(models.LoginAttempt.email == email).delete(
        synchronize_session=False)
    db.commit()


# =========================================================
# APP
# =========================================================
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# BD DEPENDENCY
# =========================================================
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# =========================================================
# UTILS
# =========================================================
def create_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def verify_password(password, hashed):
    return pwd_context.verify(password, hashed)


def hash_password(password):
    return pwd_context.hash(password)


def get_user_from_token(token: str | None, db: Session):
    if not token:
        raise HTTPException(401, "Token inválido")

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")

        if user_id is None:
            raise HTTPException(401, "Token inválido")

        user = db.query(User).filter(User.id == int(user_id)).first()
        if not user:
            raise HTTPException(404, "Usuario no encontrado")

        return user

    except JWTError:
        raise HTTPException(401, "Invalid or expired token")


def _normalize_group_tag(tag: str) -> str:
    return " ".join((tag or "").strip().lower().split())


def _parse_group_tags(raw_value: str | None) -> list[str]:
    if not raw_value:
        return []

    parsed = []
    seen = set()
    for part in str(raw_value).split(","):
        normalized = _normalize_group_tag(part)
        if normalized and normalized not in seen:
            seen.add(normalized)
            parsed.append(normalized)
    return parsed


def _serialize_group_tags(tags: list[str]) -> str | None:
    return ",".join(tags) if tags else None


def require_admin(user: User):
    if user.role not in ["admin", "superadmin"]:
        raise HTTPException(403, "No autorizado")


def require_superadmin(user: User):
    if user.role != "superadmin":
        raise HTTPException(403, "Solo superadmin")


# =========================================================
# LIMPIEZA AUTOMÁTICA CENTRALIZADA
# =========================================================
_last_cleanup_at: datetime | None = None
# Los eventos caducados solo se borran por día (no hay urgencia de minutos) y
# no hay tantos: basta con pasar una vez a la semana.
_CLEANUP_MIN_INTERVAL_SECONDS = 7 * 24 * 3600


def maybe_cleanup_expired_data(db: Session):
    """Ejecuta la limpieza como mucho una vez por semana.

    Se engancha al mismo heartbeat que ya despierta el planificador de
    limpieza (_cleanup_loop), así que no añade ningún hilo ni wake-up
    nuevo: solo una consulta de más en un tick que de todas formas ya se
    estaba ejecutando.
    """
    global _last_cleanup_at
    now = datetime.utcnow()
    if _last_cleanup_at is not None and (now - _last_cleanup_at).total_seconds() < _CLEANUP_MIN_INTERVAL_SECONDS:
        return
    _last_cleanup_at = now
    try:
        cleanup_expired_data(db)
    except Exception as exc:
        print(f"⚠️ Limpieza de datos caducados fallida: {exc}")


def cleanup_expired_data(db: Session):
    today = datetime.utcnow().date()
    today_str = today.strftime("%Y-%m-%d")

    # --- Eventos expirados ---
    expired_events = db.query(Event).filter(Event.date < today_str).all()
    expired_event_ids = [e.id for e in expired_events]

    if expired_event_ids:
        db.query(EventResponse)\
          .filter(EventResponse.event_id.in_(expired_event_ids))\
          .delete(synchronize_session=False)

        db.query(EventAvailabilitySlot)\
          .filter(EventAvailabilitySlot.event_id.in_(expired_event_ids))\
          .delete(synchronize_session=False)

        db.query(GuestEventAvailabilitySlot)\
          .filter(GuestEventAvailabilitySlot.event_id.in_(expired_event_ids))\
          .delete(synchronize_session=False)

        db.query(Event)\
          .filter(Event.id.in_(expired_event_ids))\
          .delete(synchronize_session=False)

    # --- Disponibilidades antiguas ---
    availability_limit = (today - timedelta(days=14)).strftime("%Y-%m-%d")
    db.query(Availability)\
      .filter(Availability.date < availability_limit)\
      .delete(synchronize_session=False)

    # --- Intentos de acceso fallidos ya caducados ---
    # Solo importan durante la ventana del freno; el resto es ruido acumulado.
    attempts_limit = (datetime.utcnow() - timedelta(days=1)).isoformat()
    db.query(models.LoginAttempt)\
      .filter(models.LoginAttempt.created_at < attempts_limit)\
      .delete(synchronize_session=False)

    db.commit()



# =========================================================
# MODELOS Pydantic
# =========================================================
from pydantic import BaseModel

class Register(BaseModel):
    email: str
    full_name: str
    password: str


class AdminUserCreate(BaseModel):
    email: str
    full_name: str
    password: str
    group_tag: str | None = None
    group_tags: list[str] | None = None
    org_unit_id: int | None = None


class AdminUserGroupTagUpdate(BaseModel):
    group_tag: str | None = None


class AdminUserOrgUnitUpdate(BaseModel):
    org_unit_id: int


class AdminUserGroupTagAdd(BaseModel):
    tag: str

class Login(BaseModel):
    email: str
    password: str


class ChangePassword(BaseModel):
    current_password: str
    new_password: str
    confirm_new_password: str


class EventCreate(BaseModel):
    title: str
    description: str | None = None
    date: str
    start_time: str | None = None
    allowed_domain: str | None = None

    visibility: str = "internal"
    event_type: str = "participativo"

    location: str | None = None
    external_url: str | None = None
    attachments: list[dict] | None = None
    metadata: dict | None = None

    is_recurring: bool = False
    recurrence_rule: str | None = None

    org_unit_id: int | None = None
    distribution_mode: str | None = None
    target_unit_ids: list[int] | None = None


class EventResponseCreate(BaseModel):
    answer: str
    justification: str | None = None




class EventAvailabilitySlotCreate(BaseModel):
    hour: int


class EventCompanionUpdate(BaseModel):
    count: int











class SurveyFieldCreate(BaseModel):
    label: str
    field_type: str = "text"
    required: bool = True
    order_index: int = 0
    options: list[str] | None = None


class SurveyCreate(BaseModel):
    title: str
    description: str | None = None
    fields: list[SurveyFieldCreate]


class SurveyUpdate(BaseModel):
    title: str
    description: str | None = None
    is_active: bool | None = None
    # Solo se aplican si la encuesta aún no tiene respuestas (para no romper el
    # mapeo de respuestas ya guardadas por id de campo).
    fields: list[SurveyFieldCreate] | None = None

class DomainPolicyCreate(BaseModel):
    domain: str | None = None
    target_type: str = "domain"  # domain | tag | unit
    org_unit_id: int | None = None  # unidad del organigrama (preferente)
    events_enabled: bool = True
    availabilities_enabled: bool = True
    spaces_enabled: bool = True
    users_enabled: bool = True
    domain_policies_enabled: bool = False
    census_enabled: bool = False
    surveys_enabled: bool = False
    notifications_enabled: bool = False


class GuestPolicyCreate(BaseModel):
    domain_tag: str
    guest_responses_enabled: bool = True
    guest_surveys_enabled: bool = False
    guest_census_enabled: bool = False
    guest_notifications_enabled: bool = True
    max_guest_responses_per_event: int | None = None


class GuestResponseCreate(BaseModel):
    guest_name: str | None = None
    guest_email: str | None = None
    answer: str = "saved"
    companions: int = 0
    guest_identifier: str | None = None


class GuestEventAvailabilitySlotCreate(BaseModel):
    hour: int
    guest_identifier: str
    guest_name: str | None = None


class GuestEventAvailabilityIdentify(BaseModel):
    guest_identifier: str

class SpaceCreate(BaseModel):
    name: str
    description: str | None

class SpaceReservationCreate(BaseModel):
    space_id: int
    date: str
    start_time: str | None
    end_time: str | None
    reason: str | None


# ---- Organigrama / estructura ----
class OrgUnitCreate(BaseModel):
    name: str
    level_type_id: int
    parent_id: int | None = None


class OrgUnitRename(BaseModel):
    name: str


class OrgUnitMove(BaseModel):
    new_parent_id: int


class OrgAssignmentCreate(BaseModel):
    user_id: int
    scope: str = "subtree"  # subtree (toda la rama) | unit_only (solo esta unidad)


class OrgTerritoryCreate(BaseModel):
    territory_type: str  # ciudad | provincia | comunidad_autonoma
    territory_id: int


class GeoCityCreate(BaseModel):
    name: str
    province_id: int


# =========================================================
# AUTH
# =========================================================
@app.post("/register")
def register(data: Register, db: Session = Depends(get_db)):
    # Solo se permite registrar cuando aún no existe ningún superadmin.
    # En cuanto se crea el primero, este endpoint vuelve a quedar cerrado.
    has_superadmin = db.query(models.User).filter(models.User.role == "superadmin").first()
    if has_superadmin:
        raise HTTPException(403, "Registro público deshabilitado. Contacta con el administrador.")

    email = (data.email or "").strip().lower()
    full_name = (data.full_name or "").strip()
    password = (data.password or "").strip()

    if not email or "@" not in email:
        raise HTTPException(400, "Email inválido")
    if not full_name:
        raise HTTPException(400, "Nombre obligatorio")
    if not password:
        raise HTTPException(400, "Contraseña obligatoria")

    if db.query(models.User).filter(models.User.email == email).first():
        raise HTTPException(400, "Email ya registrado")

    root_unit = org_service.get_root_unit(db)
    if root_unit is None:
        root_unit = org_service.ensure_colectivo_for_domain(db, email.split("@")[-1])

    user = models.User(
        email=email,
        full_name=full_name,
        hashed_password=hash_password(password),
        role="superadmin",
        org_unit_id=root_unit.id if root_unit else None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "email": user.email, "role": user.role}


@app.post("/login")
def login(data: Login, request: Request, db: Session = Depends(get_db)):
    email = (data.email or "").strip().lower()
    _ensure_login_allowed(db, email)

    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(data.password, user.hashed_password):
        _record_login_failure(db, email, request)
        raise HTTPException(400, "Credenciales incorrectas")

    _clear_login_failures(db, email)
    token = create_token({"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer"}


@app.post("/auth/refresh")
def refresh_auth_token(
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    user = get_user_from_token(cred.credentials if cred else None, db)
    token = create_token({"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer"}


@app.get("/me")
def me(
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    user = get_user_from_token(cred.credentials, db)
    domain = user.email.split("@")[-1].lower() if "@" in user.email else ""
    tags = set(_parse_group_tags(user.group_tag))
    # Su unidad real manda sobre el dominio del email: un usuario puede haberse
    # movido en el organigrama sin que su email lo refleje.
    unit = user.org_unit_id

    events_enabled = _is_feature_enabled(db, domain, "events", user.role, tags, unit_id=unit)
    availabilities_enabled = _is_feature_enabled(db, domain, "availabilities", user.role, tags, unit_id=unit)
    spaces_enabled = _is_feature_enabled(db, domain, "spaces", user.role, tags, unit_id=unit)
    users_enabled = _is_feature_enabled(db, domain, "users", user.role, tags, unit_id=unit)

    # Modulos de superadmin delegables solo para admins (no para users estandar)
    can_receive_super_modules = user.role in ["admin", "superadmin"]
    domain_policies_enabled = can_receive_super_modules and _is_feature_enabled(db, domain, "domain_policies", user.role, tags, unit_id=unit)
    census_enabled = can_receive_super_modules and _is_feature_enabled(db, domain, "census", user.role, tags, unit_id=unit)
    surveys_enabled = can_receive_super_modules and _is_feature_enabled(db, domain, "surveys", user.role, tags, unit_id=unit)
    notifications_enabled = can_receive_super_modules and _is_feature_enabled(db, domain, "notifications", user.role, tags, unit_id=unit)

    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "domain": domain,
        "org_unit_id": user.org_unit_id,
        "events_enabled": events_enabled,
        "availabilities_enabled": availabilities_enabled,
        "spaces_enabled": spaces_enabled,
        "users_enabled": users_enabled,
        "domain_policies_enabled": domain_policies_enabled,
        "census_enabled": census_enabled,
        "surveys_enabled": surveys_enabled,
        "notifications_enabled": notifications_enabled,
    }


# =========================================================
# ORGANIGRAMA / ESTRUCTURA ORGANIZATIVA
# =========================================================
from models import (
    OrgLevelType,
    OrgUnit,
    AdminAssignment,
    OrgUnitTerritory,
    AutonomousCommunity,
    Province,
    City,
)


def _require_org_admin(admin: User):
    """Gestionar el organigrama requiere admin (la autoridad concreta sobre
    cada unidad se comprueba con can_manage_unit en cada operación)."""
    require_admin(admin)


@app.get("/me/org-scope")
def my_org_scope(
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    """Ámbito organizativo del usuario: su unidad hogar, sus asignaciones y el
    árbol que puede administrar. Base del selector de ámbito del frontend."""
    user = get_user_from_token(cred.credentials, db)

    home_unit = db.query(OrgUnit).get(user.org_unit_id) if user.org_unit_id else None
    roots = org_service.authorized_root_units(db, user) if user.role in ["admin", "superadmin"] else []

    # Árbol autorizado (subárbol de cada raíz de autoridad).
    authorized_units = []
    if user.role in ["admin", "superadmin"]:
        subtree_ids = org_service.authorized_subtree_unit_ids(db, user)
        if subtree_ids is None:  # superadmin: todo
            units = db.query(OrgUnit).order_by(OrgUnit.path).all()
        else:
            units = db.query(OrgUnit).filter(OrgUnit.id.in_(subtree_ids)).order_by(OrgUnit.path).all() if subtree_ids else []
        authorized_units = [org_service.serialize_unit(db, u, include_counts=True) for u in units]

    return {
        "home_unit": org_service.serialize_unit(db, home_unit) if home_unit else None,
        "assignments": [org_service.serialize_unit(db, u) for u in roots],
        "authorized_tree": authorized_units,
    }


@app.get("/admin/org/level-types")
def org_level_types(
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    _require_org_admin(admin)
    types = db.query(OrgLevelType).order_by(OrgLevelType.sort_order).all()
    return [
        {
            "id": t.id, "code": t.code, "label": t.label,
            "is_leaf": bool(t.is_leaf), "is_root_only": bool(t.is_root_only),
            "allowed_child_type_ids": org_service.allowed_child_type_ids(db, t.id),
        }
        for t in types
    ]


@app.get("/admin/org/tree")
def org_tree(
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    """Árbol que el admin puede administrar (subárbol autorizado; todo si es
    superadmin). Incluye unidades inactivas para poder reactivarlas."""
    admin = get_user_from_token(cred.credentials, db)
    _require_org_admin(admin)

    subtree_ids = org_service.authorized_subtree_unit_ids(db, admin)
    if subtree_ids is None:
        units = db.query(OrgUnit).order_by(OrgUnit.path).all()
    elif subtree_ids:
        units = db.query(OrgUnit).filter(OrgUnit.id.in_(subtree_ids)).order_by(OrgUnit.path).all()
    else:
        units = []
    # Conteos en bloque: 2 consultas para todo el árbol en vez de 2 por unidad.
    counts = org_service.bulk_unit_counts(db, [u.id for u in units])
    return [org_service.serialize_unit(db, u, include_counts=True, counts=counts) for u in units]


@app.get("/admin/org/aggregate")
def org_aggregate(
    unit_id: int | None = Query(None),
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    """Vista agregada por defecto: recuentos por unidad hija directa, sin datos
    personales. Si se indica unit_id, agrega bajo esa unidad (previa autoridad);
    si no, bajo las raíces de autoridad del admin."""
    admin = get_user_from_token(cred.credentials, db)
    _require_org_admin(admin)

    if unit_id is not None:
        if not org_service.can_manage_unit(db, admin, unit_id):
            raise HTTPException(403, "No autorizado sobre esa unidad")
        parents = [db.query(OrgUnit).get(unit_id)]
    else:
        parents = org_service.authorized_root_units(db, admin)

    result = []
    for parent in parents:
        if not parent:
            continue
        children = db.query(OrgUnit).filter(OrgUnit.parent_id == parent.id).order_by(OrgUnit.name).all()
        result.append({
            "unit": org_service.serialize_unit(db, parent, include_counts=True),
            "children": [org_service.serialize_unit(db, c, include_counts=True) for c in children],
        })
    return result


@app.post("/admin/org/units")
def org_create_unit(
    data: OrgUnitCreate,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    _require_org_admin(admin)

    # Autoridad: debe poder gestionar el padre (o ser superadmin para la raíz).
    if data.parent_id is None:
        require_superadmin(admin)
    elif not org_service.can_manage_unit(db, admin, data.parent_id):
        raise HTTPException(403, "No autorizado sobre esa unidad superior")

    try:
        unit = org_service.create_unit(db, data.level_type_id, data.parent_id, data.name)
        db.commit()
        db.refresh(unit)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(400, str(exc))
    return org_service.serialize_unit(db, unit, include_counts=True)


@app.put("/admin/org/units/{unit_id}")
def org_rename_unit(
    unit_id: int,
    data: OrgUnitRename,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    _require_org_admin(admin)
    if not org_service.can_manage_unit(db, admin, unit_id):
        raise HTTPException(403, "No autorizado sobre esa unidad")
    unit = db.query(OrgUnit).get(unit_id)
    if not unit:
        raise HTTPException(404, "Unidad no encontrada")
    unit.name = data.name.strip()
    unit.updated_at = datetime.utcnow().isoformat()
    db.commit()
    db.refresh(unit)
    return org_service.serialize_unit(db, unit, include_counts=True)


@app.post("/admin/org/units/{unit_id}/move")
def org_move_unit(
    unit_id: int,
    data: OrgUnitMove,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    _require_org_admin(admin)
    if not org_service.can_manage_unit(db, admin, unit_id) or not org_service.can_manage_unit(db, admin, data.new_parent_id):
        raise HTTPException(403, "No autorizado sobre esas unidades")
    unit = db.query(OrgUnit).get(unit_id)
    new_parent = db.query(OrgUnit).get(data.new_parent_id)
    if not unit or not new_parent:
        raise HTTPException(404, "Unidad no encontrada")
    if unit.parent_id is None:
        raise HTTPException(400, "No se puede mover la unidad raíz")
    try:
        org_service.reparent_unit(db, unit, new_parent)
        db.commit()
        db.refresh(unit)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(400, str(exc))
    return org_service.serialize_unit(db, unit, include_counts=True)


@app.post("/admin/org/units/{unit_id}/deactivate")
def org_deactivate_unit(
    unit_id: int,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    _require_org_admin(admin)
    if not org_service.can_manage_unit(db, admin, unit_id):
        raise HTTPException(403, "No autorizado sobre esa unidad")
    unit = db.query(OrgUnit).get(unit_id)
    if not unit:
        raise HTTPException(404, "Unidad no encontrada")
    if unit.parent_id is None:
        raise HTTPException(400, "No se puede desactivar la unidad raíz")
    org_service.deactivate_unit(db, unit)
    db.commit()
    return {"ok": True}


@app.post("/admin/org/units/{unit_id}/reactivate")
def org_reactivate_unit(
    unit_id: int,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    _require_org_admin(admin)
    if not org_service.can_manage_unit(db, admin, unit_id):
        raise HTTPException(403, "No autorizado sobre esa unidad")
    unit = db.query(OrgUnit).get(unit_id)
    if not unit:
        raise HTTPException(404, "Unidad no encontrada")
    org_service.reactivate_unit(db, unit)
    db.commit()
    return {"ok": True}


@app.delete("/admin/org/units/{unit_id}")
def org_delete_unit(
    unit_id: int,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    """Elimina definitivamente una unidad sin dependientes. Sus personas y
    contenidos suben a la unidad superior (no se pierde nada)."""
    admin = get_user_from_token(cred.credentials, db)
    _require_org_admin(admin)
    if not org_service.can_manage_unit(db, admin, unit_id):
        raise HTTPException(403, "No autorizado sobre esa unidad")

    unit = db.query(OrgUnit).get(unit_id)
    if not unit:
        raise HTTPException(404, "Unidad no encontrada")
    if unit.parent_id is None:
        raise HTTPException(400, "No se puede eliminar la estructura raíz")

    children = db.query(OrgUnit).filter(OrgUnit.parent_id == unit_id).count()
    if children:
        raise HTTPException(400, "Elimina o mueve primero las unidades que dependen de esta")

    result = org_service.delete_unit(db, unit)
    db.commit()
    return {"ok": True, **result}


@app.get("/admin/org/units/{unit_id}/admins")
def org_list_unit_admins(
    unit_id: int,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    _require_org_admin(admin)
    if not org_service.can_manage_unit(db, admin, unit_id):
        raise HTTPException(403, "No autorizado sobre esa unidad")
    assignments = db.query(AdminAssignment).filter(
        AdminAssignment.org_unit_id == unit_id,
        AdminAssignment.is_active == 1,
    ).all()
    result = []
    for a in assignments:
        u = db.query(User).get(a.user_id)
        if u:
            result.append({
                "assignment_id": a.id, "user_id": u.id, "email": u.email,
                "full_name": u.full_name, "scope": a.scope or "subtree",
            })
    return result


@app.post("/admin/org/units/{unit_id}/admins")
def org_grant_admin(
    unit_id: int,
    data: OrgAssignmentCreate,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    _require_org_admin(admin)
    if not org_service.can_manage_unit(db, admin, unit_id):
        raise HTTPException(403, "No autorizado sobre esa unidad")
    unit = db.query(OrgUnit).get(unit_id)
    target = db.query(User).get(data.user_id)
    if not unit or not target:
        raise HTTPException(404, "Unidad o usuario no encontrado")

    scope = (data.scope or "subtree").strip().lower()
    if scope not in ("subtree", "unit_only"):
        raise HTTPException(400, "scope inválido: usa subtree o unit_only")

    existing = db.query(AdminAssignment).filter(
        AdminAssignment.user_id == target.id,
        AdminAssignment.org_unit_id == unit_id,
    ).first()
    if existing:
        existing.is_active = 1
        existing.scope = scope
    else:
        db.add(AdminAssignment(
            user_id=target.id, org_unit_id=unit_id, granted_by=admin.id,
            scope=scope, created_at=datetime.utcnow().isoformat(), is_active=1,
        ))
    # Otorgar autoridad implica al menos rol admin.
    if target.role == "user":
        target.role = "admin"
    db.commit()
    return {"ok": True}


@app.delete("/admin/org/assignments/{assignment_id}")
def org_revoke_admin(
    assignment_id: int,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    _require_org_admin(admin)
    assignment = db.query(AdminAssignment).get(assignment_id)
    if not assignment:
        raise HTTPException(404, "Asignación no encontrada")
    if not org_service.can_manage_unit(db, admin, assignment.org_unit_id):
        raise HTTPException(403, "No autorizado sobre esa unidad")
    assignment.is_active = 0
    db.commit()
    return {"ok": True}


@app.get("/admin/org/units/{unit_id}/territories")
def org_list_territories(
    unit_id: int,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    _require_org_admin(admin)
    if not org_service.can_manage_unit(db, admin, unit_id):
        raise HTTPException(403, "No autorizado sobre esa unidad")
    rows = db.query(OrgUnitTerritory).filter(OrgUnitTerritory.org_unit_id == unit_id).all()
    result = []
    for r in rows:
        label = None
        if r.territory_type == "provincia":
            p = db.query(Province).get(r.territory_id)
            label = p.name if p else None
        elif r.territory_type == "comunidad_autonoma":
            c = db.query(AutonomousCommunity).get(r.territory_id)
            label = c.name if c else None
        elif r.territory_type == "ciudad":
            c = db.query(City).get(r.territory_id)
            label = c.name if c else None
        result.append({"id": r.id, "territory_type": r.territory_type, "territory_id": r.territory_id, "label": label})
    return result


@app.post("/admin/org/units/{unit_id}/territories")
def org_add_territory(
    unit_id: int,
    data: OrgTerritoryCreate,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    _require_org_admin(admin)
    if not org_service.can_manage_unit(db, admin, unit_id):
        raise HTTPException(403, "No autorizado sobre esa unidad")
    if data.territory_type not in ["ciudad", "provincia", "comunidad_autonoma"]:
        raise HTTPException(400, "territory_type inválido")
    existing = db.query(OrgUnitTerritory).filter(
        OrgUnitTerritory.org_unit_id == unit_id,
        OrgUnitTerritory.territory_type == data.territory_type,
        OrgUnitTerritory.territory_id == data.territory_id,
    ).first()
    if not existing:
        db.add(OrgUnitTerritory(
            org_unit_id=unit_id, territory_type=data.territory_type, territory_id=data.territory_id,
        ))
        db.commit()
    return {"ok": True}


@app.delete("/admin/org/territories/{territory_row_id}")
def org_delete_territory(
    territory_row_id: int,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    _require_org_admin(admin)
    row = db.query(OrgUnitTerritory).get(territory_row_id)
    if not row:
        raise HTTPException(404, "No encontrado")
    if not org_service.can_manage_unit(db, admin, row.org_unit_id):
        raise HTTPException(403, "No autorizado sobre esa unidad")
    db.delete(row)
    db.commit()
    return {"ok": True}


# ---- Geografía (pickers) ----
@app.get("/geo/provinces")
def geo_provinces(db: Session = Depends(get_db)):
    """Lista pública, fija y completa de provincias de España. NO refleja qué
    unidades existen: es geografía estática para el filtro del visitante."""
    provinces = db.query(Province).order_by(Province.name).all()
    return [
        {"id": p.id, "name": p.name, "community": p.community.name if p.community else None}
        for p in provinces
    ]


@app.get("/admin/geo/communities")
def geo_communities(
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    _require_org_admin(admin)
    rows = db.query(AutonomousCommunity).order_by(AutonomousCommunity.name).all()
    return [{"id": c.id, "name": c.name} for c in rows]


@app.get("/admin/geo/cities")
def geo_cities(
    province_id: int = Query(...),
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    _require_org_admin(admin)
    rows = db.query(City).filter(City.province_id == province_id).order_by(City.name).all()
    return [{"id": c.id, "name": c.name} for c in rows]


@app.post("/admin/geo/cities")
def geo_create_city(
    data: GeoCityCreate,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    _require_org_admin(admin)
    existing = db.query(City).filter(City.name == data.name.strip(), City.province_id == data.province_id).first()
    if existing:
        return {"id": existing.id, "name": existing.name}
    city = City(name=data.name.strip(), province_id=data.province_id)
    db.add(city)
    db.commit()
    db.refresh(city)
    return {"id": city.id, "name": city.name}


@app.get("/admin/users")
def admin_list_users(
    unit_id: int | None = Query(None),
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    require_admin(admin)

    if not _is_feature_enabled(db, _get_domain(admin.email), "users", admin.role, set(_parse_group_tags(admin.group_tag)), unit_id=admin.org_unit_id):
        raise HTTPException(403, "Gestión de usuarios deshabilitada para tu dominio")

    # Si se pide una unidad concreta: verificar autoridad y auditar el acceso
    # cuando quien consulta es un nivel ancestro (no la unidad propia asignada).
    if unit_id is not None:
        if not org_service.can_manage_unit(db, admin, unit_id):
            raise HTTPException(403, "No autorizado sobre esa estructura")
        if org_service.requires_drill_down_log(db, admin, unit_id):
            org_service.log_drill_down(db, admin, unit_id, "users")
        # Incluye la estructura elegida y todas las que dependen de ella.
        subtree_ids = org_service.subtree_unit_ids(db, unit_id)
        users = (
            db.query(User)
            .filter(User.org_unit_id.in_(subtree_ids))
            .order_by(func.lower(User.email))
            .all()
        ) if subtree_ids else []
    else:
        # Resolver el ámbito en SQL en vez de comprobar permisos usuario a
        # usuario: antes esto disparaba ~3 consultas por usuario listado.
        scope_ids = org_service.authorized_subtree_unit_ids(db, admin)
        query = db.query(User)
        if scope_ids is not None:
            query = query.filter(User.org_unit_id.in_(scope_ids)) if scope_ids else query.filter(False)
        users = query.order_by(func.lower(User.email)).all()

    unit_names = {u.id: u.name for u in db.query(OrgUnit).all()}

    return [
        {
            "id": u.id,
            "full_name": u.full_name,
            "email": u.email,
            "role": u.role,
            "group_tag": u.group_tag,
            "group_tags": _parse_group_tags(u.group_tag),
            "org_unit_id": u.org_unit_id,
            "org_unit_name": unit_names.get(u.org_unit_id),
        }
        for u in users
    ]


@app.post("/admin/users")
def admin_create_user(
    data: AdminUserCreate,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    require_admin(admin)

    if not _is_feature_enabled(db, _get_domain(admin.email), "users", admin.role, set(_parse_group_tags(admin.group_tag)), unit_id=admin.org_unit_id):
        raise HTTPException(403, "Gestión de usuarios deshabilitada para tu dominio")

    email = data.email.strip().lower()
    full_name = data.full_name.strip()
    password = data.password.strip()

    if not email or "@" not in email:
        raise HTTPException(400, "Email inválido")
    if not full_name:
        raise HTTPException(400, "Nombre obligatorio")
    if not password:
        raise HTTPException(400, "Contraseña obligatoria")

    if db.query(User).filter(User.email == email).first():
        raise HTTPException(400, "Email ya registrado")

    # El alcance ya NO se deduce del email: el usuario se crea en la estructura
    # indicada, que debe estar dentro de la autoridad del admin (la suya propia
    # o cualquiera que dependa de ella). El dominio del email es irrelevante.
    target_unit_id = data.org_unit_id if data.org_unit_id is not None else admin.org_unit_id
    if target_unit_id is None and admin.role == "superadmin":
        root = org_service.get_root_unit(db)
        target_unit_id = root.id if root else None
    if target_unit_id is None:
        raise HTTPException(400, "Indica la estructura a la que pertenece el usuario")
    if not org_service.can_manage_unit(db, admin, target_unit_id):
        raise HTTPException(403, "No autorizado sobre esa estructura")

    initial_tags = []
    if data.group_tags:
        initial_tags = [_normalize_group_tag(tag) for tag in data.group_tags if _normalize_group_tag(tag)]
    elif data.group_tag:
        normalized = _normalize_group_tag(data.group_tag)
        if normalized:
            initial_tags = [normalized]

    deduped_initial_tags = []
    seen_initial_tags = set()
    for tag in initial_tags:
        if tag not in seen_initial_tags:
            seen_initial_tags.add(tag)
            deduped_initial_tags.append(tag)

    user = User(
        email=email,
        full_name=full_name,
        hashed_password=hash_password(password),
        role="user",
        group_tag=_serialize_group_tags(deduped_initial_tags),
        org_unit_id=target_unit_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "group_tag": user.group_tag,
        "group_tags": _parse_group_tags(user.group_tag),
        "org_unit_id": user.org_unit_id,
    }


@app.put("/admin/users/{user_id}/org-unit")
def admin_update_user_org_unit(
    user_id: int,
    data: AdminUserOrgUnitUpdate,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    """Mueve a un usuario a otra estructura. Exige autoridad sobre la estructura
    de origen y la de destino (la propia del admin o cualquiera inferior)."""
    admin = get_user_from_token(cred.credentials, db)
    require_admin(admin)

    if not _is_feature_enabled(db, _get_domain(admin.email), "users", admin.role,
                               set(_parse_group_tags(admin.group_tag)), unit_id=admin.org_unit_id):
        raise HTTPException(403, "Gestión de usuarios deshabilitada para tu estructura")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")

    if not _can_admin_manage_user(admin, user, db):
        raise HTTPException(403, "No autorizado sobre ese usuario")
    if not org_service.can_manage_unit(db, admin, data.org_unit_id):
        raise HTTPException(403, "No autorizado sobre la estructura de destino")

    unit = db.query(OrgUnit).get(data.org_unit_id)
    if not unit:
        raise HTTPException(404, "Estructura no encontrada")

    user.org_unit_id = unit.id

    # Si es admin, su autoridad acompaña al usuario a su nueva estructura.
    if user.role == "admin":
        db.query(AdminAssignment).filter(
            AdminAssignment.user_id == user.id
        ).update({AdminAssignment.is_active: 0}, synchronize_session=False)
        existing = db.query(AdminAssignment).filter(
            AdminAssignment.user_id == user.id,
            AdminAssignment.org_unit_id == unit.id,
        ).first()
        if existing:
            existing.is_active = 1
        else:
            db.add(AdminAssignment(
                user_id=user.id, org_unit_id=unit.id, granted_by=admin.id,
                created_at=datetime.utcnow().isoformat(), is_active=1,
            ))

    db.commit()
    db.refresh(user)
    return {"id": user.id, "org_unit_id": user.org_unit_id, "org_unit_name": unit.name}


@app.put("/admin/users/{user_id}/group-tag")
def admin_update_user_group_tag(
    user_id: int,
    data: AdminUserGroupTagUpdate,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    require_admin(admin)

    if not _is_feature_enabled(db, _get_domain(admin.email), "users", admin.role, set(_parse_group_tags(admin.group_tag)), unit_id=admin.org_unit_id):
        raise HTTPException(403, "Gestión de usuarios deshabilitada para tu dominio")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")

    if user.role == "superadmin" and admin.role != "superadmin":
        raise HTTPException(403, "No autorizado para modificar superadmin")

    if admin.role != "superadmin" and not _same_domain_or_superadmin(admin, user, db):
        raise HTTPException(403, "No puedes administrar usuarios de otro dominio")

    group_tag = _normalize_group_tag(data.group_tag or "")
    user.group_tag = _serialize_group_tags([group_tag]) if group_tag else None
    db.commit()

    return {
        "id": user.id,
        "group_tag": user.group_tag,
        "group_tags": _parse_group_tags(user.group_tag),
    }


@app.post("/admin/users/{user_id}/group-tags")
def admin_add_user_group_tag(
    user_id: int,
    data: AdminUserGroupTagAdd,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    require_admin(admin)

    if not _is_feature_enabled(db, _get_domain(admin.email), "users", admin.role, set(_parse_group_tags(admin.group_tag)), unit_id=admin.org_unit_id):
        raise HTTPException(403, "Gestión de usuarios deshabilitada para tu dominio")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")

    if user.role == "superadmin" and admin.role != "superadmin":
        raise HTTPException(403, "No autorizado para modificar superadmin")

    if admin.role != "superadmin" and not _same_domain_or_superadmin(admin, user, db):
        raise HTTPException(403, "No puedes administrar usuarios de otro dominio")

    new_tag = _normalize_group_tag(data.tag)
    if not new_tag:
        raise HTTPException(400, "La etiqueta no puede estar vacía")

    current_tags = _parse_group_tags(user.group_tag)
    if new_tag not in current_tags:
        current_tags.append(new_tag)
        user.group_tag = _serialize_group_tags(current_tags)
        db.commit()

    return {
        "id": user.id,
        "group_tag": user.group_tag,
        "group_tags": _parse_group_tags(user.group_tag),
    }


@app.delete("/admin/users/{user_id}/group-tags/{tag}")
def admin_remove_user_group_tag(
    user_id: int,
    tag: str,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    require_admin(admin)

    if not _is_feature_enabled(db, _get_domain(admin.email), "users", admin.role, set(_parse_group_tags(admin.group_tag)), unit_id=admin.org_unit_id):
        raise HTTPException(403, "Gestión de usuarios deshabilitada para tu dominio")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")

    if user.role == "superadmin" and admin.role != "superadmin":
        raise HTTPException(403, "No autorizado para modificar superadmin")

    if admin.role != "superadmin" and not _same_domain_or_superadmin(admin, user, db):
        raise HTTPException(403, "No puedes administrar usuarios de otro dominio")

    target_tag = _normalize_group_tag(tag)
    remaining_tags = [value for value in _parse_group_tags(user.group_tag) if value != target_tag]
    user.group_tag = _serialize_group_tags(remaining_tags)
    db.commit()

    return {
        "id": user.id,
        "group_tag": user.group_tag,
        "group_tags": _parse_group_tags(user.group_tag),
    }


@app.delete("/admin/users/{user_id}")
def admin_delete_user(
    user_id: int,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    require_superadmin(admin)

    if admin.id == user_id:
        raise HTTPException(400, "No puedes eliminarte a ti mismo")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")

    event_ids = [event.id for event in db.query(Event).filter(Event.created_by == user_id).all()]
    if event_ids:
        db.query(EventCompanion).filter(EventCompanion.event_id.in_(event_ids)).delete(synchronize_session=False)
        db.query(EventResponse).filter(EventResponse.event_id.in_(event_ids)).delete(synchronize_session=False)
        db.query(Event).filter(Event.id.in_(event_ids)).delete(synchronize_session=False)

    space_ids = [space.id for space in db.query(models.Space).filter(models.Space.created_by == user_id).all()]
    if space_ids:
        db.query(models.SpaceReservation).filter(models.SpaceReservation.space_id.in_(space_ids)).delete(synchronize_session=False)
        db.query(models.Space).filter(models.Space.id.in_(space_ids)).delete(synchronize_session=False)

    db.query(EventResponse).filter(EventResponse.user_id == user_id).delete(synchronize_session=False)
    db.query(EventCompanion).filter(EventCompanion.user_id == user_id).delete(synchronize_session=False)
    db.query(Availability).filter(Availability.user_id == user_id).delete(synchronize_session=False)
    db.query(models.SpaceReservation).filter(models.SpaceReservation.user_id == user_id).delete(synchronize_session=False)

    # Limpiar referencias que apuntan al usuario para no violar claves foráneas
    # (Postgres las exige; en SQLite local pasaba desapercibido). Incluye las
    # nuevas del organigrama (admin_assignments) y otras preexistentes.
    db.query(AdminAssignment).filter(AdminAssignment.user_id == user_id).delete(synchronize_session=False)
    db.query(AdminAssignment).filter(AdminAssignment.granted_by == user_id).update(
        {AdminAssignment.granted_by: None}, synchronize_session=False)
    db.query(models.DeviceToken).filter(models.DeviceToken.user_id == user_id).delete(synchronize_session=False)
    db.query(models.GuestPolicy).filter(models.GuestPolicy.updated_by == user_id).update(
        {models.GuestPolicy.updated_by: None}, synchronize_session=False)
    # created_by es NOT NULL: se reasigna al superadmin que borra para conservar
    # el historial en vez de romper la FK o perder los registros.
    db.query(models.Survey).filter(models.Survey.created_by == user_id).update(
        {models.Survey.created_by: admin.id}, synchronize_session=False)
    db.query(models.NotificationDispatch).filter(models.NotificationDispatch.created_by == user_id).update(
        {models.NotificationDispatch.created_by: admin.id}, synchronize_session=False)

    db.delete(user)
    db.commit()

    return {"ok": True}


@app.post("/admin/remove_admin/{user_id}")
def remove_admin(
    user_id: int,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    require_admin(admin)

    if not _is_feature_enabled(db, _get_domain(admin.email), "users", admin.role, set(_parse_group_tags(admin.group_tag)), unit_id=admin.org_unit_id):
        raise HTTPException(403, "Gestión de usuarios deshabilitada para tu dominio")

    if admin.id == user_id:
        raise HTTPException(400, "No puedes quitarte el rol a ti mismo")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")

    if user.role == "superadmin" and admin.role != "superadmin":
        raise HTTPException(403, "No autorizado para modificar superadmin")

    if admin.role != "superadmin" and not _same_domain_or_superadmin(admin, user, db):
        raise HTTPException(403, "No puedes administrar usuarios de otro dominio")

    user.role = "user"
    # Al dejar de ser admin, se retira su autoridad sobre unidades del organigrama.
    db.query(AdminAssignment).filter(
        AdminAssignment.user_id == user.id
    ).update({AdminAssignment.is_active: 0})
    db.commit()

    return {"ok": True}


@app.post("/admin/make_admin/{user_id}")
def make_admin(
    user_id: int,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    require_admin(admin)

    if not _is_feature_enabled(db, _get_domain(admin.email), "users", admin.role, set(_parse_group_tags(admin.group_tag)), unit_id=admin.org_unit_id):
        raise HTTPException(403, "Gestión de usuarios deshabilitada para tu dominio")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")

    if user.role == "superadmin" and admin.role != "superadmin":
        raise HTTPException(403, "No autorizado para modificar superadmin")

    if admin.role != "superadmin" and not _same_domain_or_superadmin(admin, user, db):
        raise HTTPException(403, "No puedes administrar usuarios de otro dominio")

    user.role = "admin"

    # Otorgar autoridad sobre su propia unidad. Sin esto, el nuevo motor de
    # permisos (basado en AdminAssignment) dejaría al admin sin ninguna unidad
    # que gestionar: no podría ni listar ni crear usuarios de su colectivo.
    unit_id = user.org_unit_id
    if unit_id is None:
        colectivo = org_service.ensure_colectivo_for_domain(db, _get_domain(user.email))
        unit_id = colectivo.id if colectivo else None
        user.org_unit_id = unit_id
    if unit_id is not None:
        existing = db.query(AdminAssignment).filter(
            AdminAssignment.user_id == user.id,
            AdminAssignment.org_unit_id == unit_id,
        ).first()
        if existing:
            existing.is_active = 1
        else:
            db.add(AdminAssignment(
                user_id=user.id, org_unit_id=unit_id, granted_by=admin.id,
                created_at=datetime.utcnow().isoformat(), is_active=1,
            ))

    db.commit()

    return {"ok": True}


@app.get("/admin/domain-policies")
def admin_list_domain_policies(
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    _require_superadmin_module_access(admin, db, "domain_policies")

    all_policies = db.query(models.DomainPolicy).all()
    if admin.role == "superadmin":
        policies = all_policies
    else:
        policies = [
            policy
            for policy in all_policies
            if _can_admin_manage_policy_target(admin, policy.domain, db)
        ]

    return [_domain_policy_to_dict(p, db) for p in policies]


@app.post("/admin/domain-policies")
def create_domain_policy(
    data: DomainPolicyCreate,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    _require_superadmin_module_access(admin, db, "domain_policies")

    # Preferente: política sobre una unidad del organigrama (se hereda hacia
    # abajo salvo que una unidad inferior tenga la suya propia).
    if data.org_unit_id is not None:
        if not org_service.can_manage_unit(db, admin, data.org_unit_id):
            raise HTTPException(403, "No autorizado sobre esa unidad")
        unit = db.query(OrgUnit).get(data.org_unit_id)
        if not unit:
            raise HTTPException(404, "Unidad no encontrada")
        storage_key = f"unit:{data.org_unit_id}"
    else:
        normalized_target_type = (data.target_type or "domain").strip().lower()
        if normalized_target_type not in ["domain", "tag"]:
            raise HTTPException(400, "target_type invalido: usa domain o tag")

        target_value = (data.domain or "").strip()
        if not target_value:
            raise HTTPException(400, "Indica la unidad destino")

        storage_key = _policy_storage_key(normalized_target_type, target_value)
        if not storage_key:
            raise HTTPException(400, "Dominio/etiqueta invalido")

        if admin.role != "superadmin" and not _can_admin_manage_policy_target(admin, storage_key, db):
            raise HTTPException(403, "No puedes crear politicas para este dominio/etiqueta")

    if db.query(models.DomainPolicy).filter(models.DomainPolicy.domain == storage_key).first():
        raise HTTPException(400, "Ya existe una política para ese ámbito")

    policy = models.DomainPolicy(
        domain=storage_key,
        org_unit_id=data.org_unit_id,
        events_enabled=1 if data.events_enabled else 0,
        availabilities_enabled=1 if data.availabilities_enabled else 0,
        spaces_enabled=1 if data.spaces_enabled else 0,
        users_enabled=1 if data.users_enabled else 0,
        domain_policies_enabled=1 if data.domain_policies_enabled else 0,
        census_enabled=1 if data.census_enabled else 0,
        surveys_enabled=1 if data.surveys_enabled else 0,
        notifications_enabled=1 if data.notifications_enabled else 0,
    )
    db.add(policy)
    db.commit()
    db.refresh(policy)

    return _domain_policy_to_dict(policy, db)


@app.put("/admin/domain-policies/{policy_id}")
def update_domain_policy(
    policy_id: int,
    data: DomainPolicyCreate,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    _require_superadmin_module_access(admin, db, "domain_policies")

    policy = db.query(models.DomainPolicy).filter(models.DomainPolicy.id == policy_id).first()
    if not policy:
        raise HTTPException(404, "Politica no encontrada")

    if admin.role != "superadmin" and not _can_admin_manage_policy_target(admin, policy.domain, db):
        raise HTTPException(403, "No puedes editar esta politica")

    if data.org_unit_id is not None:
        if not org_service.can_manage_unit(db, admin, data.org_unit_id):
            raise HTTPException(403, "No autorizado sobre esa unidad")
        new_storage_key = f"unit:{data.org_unit_id}"
        new_unit_id = data.org_unit_id
    else:
        normalized_target_type = (data.target_type or "domain").strip().lower()
        if normalized_target_type not in ["domain", "tag"]:
            raise HTTPException(400, "target_type invalido: usa domain o tag")

        target_value = (data.domain or "").strip()
        if not target_value:
            raise HTTPException(400, "Indica la unidad destino")

        new_storage_key = _policy_storage_key(normalized_target_type, target_value)
        if not new_storage_key:
            raise HTTPException(400, "Dominio/etiqueta invalido")

        if admin.role != "superadmin" and not _can_admin_manage_policy_target(admin, new_storage_key, db):
            raise HTTPException(403, "No puedes mover esta politica a ese dominio/etiqueta")
        new_unit_id = None

    if policy.domain != new_storage_key and db.query(models.DomainPolicy).filter(models.DomainPolicy.domain == new_storage_key).first():
        raise HTTPException(400, "Ya existe una política para ese ámbito")

    policy.domain = new_storage_key
    policy.org_unit_id = new_unit_id
    policy.events_enabled = 1 if data.events_enabled else 0
    policy.availabilities_enabled = 1 if data.availabilities_enabled else 0
    policy.spaces_enabled = 1 if data.spaces_enabled else 0
    policy.users_enabled = 1 if data.users_enabled else 0
    policy.domain_policies_enabled = 1 if data.domain_policies_enabled else 0
    policy.census_enabled = 1 if data.census_enabled else 0
    policy.surveys_enabled = 1 if data.surveys_enabled else 0
    policy.notifications_enabled = 1 if data.notifications_enabled else 0
    db.commit()

    return _domain_policy_to_dict(policy, db)


@app.delete("/admin/domain-policies/{policy_id}")
def delete_domain_policy(
    policy_id: int,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    _require_superadmin_module_access(admin, db, "domain_policies")

    policy = db.query(models.DomainPolicy).filter(models.DomainPolicy.id == policy_id).first()
    if not policy:
        raise HTTPException(404, "Politica no encontrada")

    if admin.role != "superadmin" and not _can_admin_manage_policy_target(admin, policy.domain, db):
        raise HTTPException(403, "No puedes eliminar esta politica")

    db.delete(policy)
    db.commit()

    return {"ok": True}


@app.get("/admin/guest-policies")
def admin_list_guest_policies(
    domain_tag: str | None = None,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    _require_superadmin_module_access(admin, db, "domain_policies")

    query = db.query(models.GuestPolicy)
    if domain_tag:
        query = query.filter(models.GuestPolicy.domain_tag == domain_tag.strip().lower())

    policies = query.order_by(models.GuestPolicy.domain_tag.asc()).all()
    return [_guest_policy_to_dict(policy) for policy in policies]


@app.post("/admin/guest-policies")
def admin_create_guest_policy(
    data: GuestPolicyCreate,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    _require_superadmin_module_access(admin, db, "domain_policies")

    normalized_domain_tag = (data.domain_tag or "").strip().lower()
    if not normalized_domain_tag:
        raise HTTPException(400, "domain_tag obligatorio")

    existing = db.query(models.GuestPolicy).filter(models.GuestPolicy.domain_tag == normalized_domain_tag).first()
    if existing:
        raise HTTPException(400, "Ya existe una guest policy para ese domain_tag")

    now_iso = datetime.utcnow().isoformat()
    policy = models.GuestPolicy(
        domain_tag=normalized_domain_tag,
        guest_responses_enabled=1 if data.guest_responses_enabled else 0,
        guest_surveys_enabled=1 if data.guest_surveys_enabled else 0,
        guest_census_enabled=1 if data.guest_census_enabled else 0,
        guest_notifications_enabled=1 if data.guest_notifications_enabled else 0,
        max_guest_responses_per_event=data.max_guest_responses_per_event,
        created_at=now_iso,
        updated_at=now_iso,
        updated_by=admin.id,
    )
    db.add(policy)
    db.commit()
    db.refresh(policy)
    return _guest_policy_to_dict(policy)


@app.put("/admin/guest-policies/{policy_id}")
def admin_update_guest_policy(
    policy_id: int,
    data: GuestPolicyCreate,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    _require_superadmin_module_access(admin, db, "domain_policies")

    policy = db.query(models.GuestPolicy).filter(models.GuestPolicy.id == policy_id).first()
    if not policy:
        raise HTTPException(404, "Guest policy no encontrada")

    normalized_domain_tag = (data.domain_tag or "").strip().lower()
    if not normalized_domain_tag:
        raise HTTPException(400, "domain_tag obligatorio")

    conflict = (
        db.query(models.GuestPolicy)
        .filter(models.GuestPolicy.domain_tag == normalized_domain_tag, models.GuestPolicy.id != policy_id)
        .first()
    )
    if conflict:
        raise HTTPException(400, "Ya existe una guest policy para ese domain_tag")

    policy.domain_tag = normalized_domain_tag
    policy.guest_responses_enabled = 1 if data.guest_responses_enabled else 0
    policy.guest_surveys_enabled = 1 if data.guest_surveys_enabled else 0
    policy.guest_census_enabled = 1 if data.guest_census_enabled else 0
    policy.guest_notifications_enabled = 1 if data.guest_notifications_enabled else 0
    policy.max_guest_responses_per_event = data.max_guest_responses_per_event
    policy.updated_at = datetime.utcnow().isoformat()
    policy.updated_by = admin.id
    db.commit()
    db.refresh(policy)
    return _guest_policy_to_dict(policy)


@app.delete("/admin/guest-policies/{policy_id}")
def admin_delete_guest_policy(
    policy_id: int,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    _require_superadmin_module_access(admin, db, "domain_policies")

    policy = db.query(models.GuestPolicy).filter(models.GuestPolicy.id == policy_id).first()
    if not policy:
        raise HTTPException(404, "Guest policy no encontrada")

    db.delete(policy)
    db.commit()
    return {"ok": True}


# =========================================================
# EVENTOS
# =========================================================
@app.post("/events")
def create_event(
    data: EventCreate,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    require_admin(admin)

    if not _is_feature_enabled(db, _get_domain(admin.email), "events", admin.role, set(_parse_group_tags(admin.group_tag)), unit_id=admin.org_unit_id):
        raise HTTPException(403, "Eventos deshabilitados para tu dominio")

    allowed_domain = data.allowed_domain.strip().lower() if data.allowed_domain else None
    if allowed_domain in ["todos", "all"]:
        allowed_domain = None

    visibility = (data.visibility or "internal").strip().lower()
    if visibility not in ["public", "internal", "private"]:
        raise HTTPException(400, "visibility inválida: usa public, internal o private")

    # Un evento "interno" nunca debe quedar abierto a todos los dominios por
    # defecto: sin colectivo explícito, se acota al propio dominio del admin
    # creador. Solo superadmin puede dejarlo sin acotar (alcance central).
    if visibility == "internal" and not allowed_domain and admin.role != "superadmin":
        allowed_domain = _get_domain(admin.email)

    event_type = (data.event_type or "participativo").strip().lower()
    if event_type not in ["informativo", "participativo", "disponibilidad"]:
        raise HTTPException(400, "event_type inválido: usa informativo, participativo o disponibilidad")

    # Organigrama: resolver unidad propietaria y modo de distribución.
    try:
        owning_unit_id = org_service.resolve_owning_unit(db, admin, data.org_unit_id)
        distribution_mode = org_service.validate_distribution(
            db, admin, owning_unit_id, data.distribution_mode or "unit_only", data.target_unit_ids
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    ev = Event(
        title=data.title,
        description=data.description,
        date=data.date,
        start_time=data.start_time,
        allowed_domain=allowed_domain,
        visibility=visibility,
        event_type=event_type,
        location=(data.location or None),
        external_url=(data.external_url or None),
        attachments=_clean_attachments(data.attachments),
        metadata_json=json.dumps(data.metadata) if data.metadata else None,
        is_recurring=1 if data.is_recurring else 0,
        recurrence_rule=(data.recurrence_rule or None),
        org_unit_id=owning_unit_id,
        distribution_mode=distribution_mode,
        updated_at=datetime.utcnow().isoformat(),
        created_by=admin.id
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)

    if distribution_mode == "custom":
        org_service.set_content_distribution_targets(db, "event", ev.id, data.target_unit_ids)
        db.commit()

    try:
        notif_title = f"Nuevo evento: {ev.title}"
        notif_body = f"Publicado para {ev.date}" + (f" · {ev.start_time}" if ev.start_time else "")

        target_user_ids = _event_target_user_ids(db, ev.allowed_domain)
        _notify_users_by_ids(db, target_user_ids, notif_title, notif_body, data={"recipient_type": "authenticated"})

        # Decisión #4 del plan: los visitantes (guests) solo se enteran de eventos públicos.
        _notify_guest_tokens_for_event(db, ev, notif_title, notif_body)
    except Exception as exc:
        print(f"⚠️ No se pudo enviar notificación automática de evento: {exc}")

    return {
        "id": ev.id,
        "title": ev.title,
        "description": ev.description,
        "date": ev.date,
        "start_time": ev.start_time,
        "allowed_domain": ev.allowed_domain,
        "visibility": ev.visibility,
        "event_type": ev.event_type,
        "location": ev.location,
        "external_url": ev.external_url,
        "metadata": json.loads(ev.metadata_json) if ev.metadata_json else None,
        "is_recurring": bool(ev.is_recurring),
        "recurrence_rule": ev.recurrence_rule,
        "org_unit_id": ev.org_unit_id,
        "distribution_mode": ev.distribution_mode,
        "created_by": ev.created_by,
    }


def _parse_requested_visibilities(visibility: str | None) -> set[str] | None:
    if not visibility:
        return None

    requested = {
        value.strip().lower()
        for value in visibility.split(",")
        if value.strip()
    }
    invalid = requested - {"public", "internal", "private"}
    if invalid:
        raise HTTPException(400, "visibility inválida: usa public, internal o private")
    return requested


def _visible_events_for_user(
    events: list[Event],
    user: User | None,
    user_domain: str | None,
    requested_visibilities: set[str] | None,
    db: Session | None = None,
    province_id: int | None = None,
) -> list[Event]:
    """Visibilidad de eventos:
    - private: solo creador/superadmin.
    - internal: territorial — solo usuarios dentro del alcance del evento
      (subárbol de la unidad propietaria, según su modo de distribución).
    - public: visible por todos (visitantes y autenticados). Para visitantes
      puede filtrarse opcionalmente por provincia.
    """
    viewer_unit = None
    if db is not None and user is not None and user.org_unit_id is not None:
        viewer_unit = db.query(models.OrgUnit).get(user.org_unit_id)

    filtered = []

    for e in events:
        e_visibility = (e.visibility or "internal").strip().lower()

        if requested_visibilities is not None and e_visibility not in requested_visibilities:
            continue

        # ---- Visitante sin sesión ----
        if user is None:
            if e_visibility != "public":
                continue
            if province_id is not None and db is not None:
                if not org_service.event_matches_province(db, e, province_id):
                    continue
            filtered.append(e)
            continue

        # ---- Usuario autenticado ----
        if user.role == "superadmin":
            filtered.append(e)
            continue

        if e_visibility == "private":
            if e.created_by == user.id:
                filtered.append(e)
            continue

        if e_visibility == "public":
            # Público: visible por cualquiera con sesión.
            filtered.append(e)
            continue

        # internal: territorial por alcance
        if db is not None and e.org_unit_id is not None:
            if viewer_unit is not None and org_service.unit_in_reach(
                db, viewer_unit, e.org_unit_id, e.distribution_mode or "unit_only", "event", e.id
            ):
                filtered.append(e)
            continue

        # Fallback legacy por dominio (evento sin unidad todavía).
        if e.allowed_domain:
            if e.allowed_domain.strip().lower() != user_domain:
                continue
        filtered.append(e)

    return filtered


def _empty_counts() -> dict:
    return {
        "yes": 0, "no": 0, "companions": 0, "guest_yes": 0, "guest_no": 0, "guest_companions": 0,
        "availability_responders": 0, "guest_availability_responders": 0,
    }


def _bulk_event_counts(db: Session, event_ids: list[int]) -> dict[int, dict]:
    """Conteos de todos los eventos en 3 consultas agregadas, en vez de ~6 por
    evento. Con 40 eventos eso eran 240 viajes a la base de datos."""
    counts = {eid: _empty_counts() for eid in event_ids}
    if not event_ids:
        return counts

    # Militantes: sí/no por evento
    rows = (
        db.query(EventResponse.event_id, func.lower(EventResponse.answer), func.count())
        .filter(EventResponse.event_id.in_(event_ids))
        .group_by(EventResponse.event_id, func.lower(EventResponse.answer))
        .all()
    )
    for eid, answer, n in rows:
        if eid not in counts:
            continue
        if answer in ("yes", "si"):
            counts[eid]["yes"] += n
        elif answer == "no":
            counts[eid]["no"] += n

    # Militantes: acompañantes por evento
    rows = (
        db.query(EventCompanion.event_id, func.coalesce(func.sum(EventCompanion.count), 0))
        .filter(EventCompanion.event_id.in_(event_ids))
        .group_by(EventCompanion.event_id)
        .all()
    )
    for eid, total in rows:
        if eid in counts:
            counts[eid]["companions"] = int(total or 0)

    # Visitantes: sí/no y acompañantes por evento
    rows = (
        db.query(
            GuestResponse.event_id,
            func.lower(GuestResponse.answer),
            func.count(),
            func.coalesce(func.sum(GuestResponse.companions), 0),
        )
        .filter(GuestResponse.event_id.in_(event_ids))
        .group_by(GuestResponse.event_id, func.lower(GuestResponse.answer))
        .all()
    )
    for eid, answer, n, comp in rows:
        if eid not in counts:
            continue
        if answer in ("yes", "si"):
            counts[eid]["guest_yes"] += n
            counts[eid]["guest_companions"] += int(comp or 0)
        elif answer == "no":
            counts[eid]["guest_no"] += n

    # Militantes: nº de personas distintas que han marcado alguna franja (eventos "disponibilidad")
    rows = (
        db.query(EventAvailabilitySlot.event_id, func.count(func.distinct(EventAvailabilitySlot.user_id)))
        .filter(EventAvailabilitySlot.event_id.in_(event_ids))
        .group_by(EventAvailabilitySlot.event_id)
        .all()
    )
    for eid, n in rows:
        if eid in counts:
            counts[eid]["availability_responders"] = int(n or 0)

    # Visitantes: nº de personas distintas que han marcado alguna franja
    rows = (
        db.query(GuestEventAvailabilitySlot.event_id, func.count(func.distinct(GuestEventAvailabilitySlot.guest_identifier)))
        .filter(GuestEventAvailabilitySlot.event_id.in_(event_ids))
        .group_by(GuestEventAvailabilitySlot.event_id)
        .all()
    )
    for eid, n in rows:
        if eid in counts:
            counts[eid]["guest_availability_responders"] = int(n or 0)

    return counts


def _parse_attachments(raw) -> list:
    """Lista [{name, url}] a partir del JSON guardado. Tolerante a datos viejos."""
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return []
    if not isinstance(data, list):
        return []
    out = []
    for item in data:
        if isinstance(item, dict) and item.get("url"):
            out.append({"name": str(item.get("name") or item["url"])[:200], "url": str(item["url"])[:1000]})
    return out


def _clean_attachments(items) -> str | None:
    """Normaliza la lista de adjuntos entrante y la serializa a JSON (o None)."""
    if not items:
        return None
    cleaned = []
    for item in items:
        if not isinstance(item, dict):
            continue
        url = str(item.get("url") or "").strip()
        if not url:
            continue
        # Solo enlaces http(s) para evitar esquemas peligrosos.
        if not (url.startswith("http://") or url.startswith("https://")):
            continue
        name = str(item.get("name") or url).strip()[:200]
        cleaned.append({"name": name, "url": url[:1000]})
    return json.dumps(cleaned) if cleaned else None


def _serialize_event_with_counts(db: Session, e: Event, counts: dict | None = None) -> dict:
    # `counts` precalculado por _bulk_event_counts al serializar listas. Si no
    # viene (endpoints de un solo evento), se calcula para ese evento.
    if counts is None:
        counts = _bulk_event_counts(db, [e.id])[e.id]

    yes_count = counts["yes"]
    no_count = counts["no"]
    companions_total = counts["companions"]
    attendees_total = yes_count + companions_total

    # Visitantes sin cuenta: se contabilizan aparte de los militantes.
    guest_yes_count = counts["guest_yes"]
    guest_no_count = counts["guest_no"]
    guest_companions_total = counts["guest_companions"]
    guest_attendees_total = guest_yes_count + guest_companions_total

    return {
        "id": e.id,
        "title": e.title,
        "description": e.description,
        "date": e.date,
        "start_time": e.start_time,
        # `Event` no tiene `end_time` en el modelo actual; mantenemos el campo para compatibilidad.
        "end_time": None,
        "allowed_domain": e.allowed_domain,
        "visibility": e.visibility,
        "event_type": e.event_type,
        "location": e.location,
        "external_url": e.external_url,
        "attachments": _parse_attachments(e.attachments),
        "metadata": json.loads(e.metadata_json) if e.metadata_json else None,
        "is_recurring": bool(e.is_recurring),
        "recurrence_rule": e.recurrence_rule,
        "org_unit_id": e.org_unit_id,
        "distribution_mode": e.distribution_mode,
        # Militantes
        "yes_count": yes_count,
        "no_count": no_count,
        "companions_total": companions_total,
        "attendees_total": attendees_total,
        # Visitantes sin cuenta (diferenciados)
        "guest_yes_count": guest_yes_count,
        "guest_no_count": guest_no_count,
        "guest_companions_total": guest_companions_total,
        "guest_attendees_total": guest_attendees_total,
        # Suma de ambos
        "attendees_grand_total": attendees_total + guest_attendees_total,
        # Eventos "disponibilidad": nº de personas distintas que han marcado alguna franja
        "availability_responder_count": counts["availability_responders"],
        "guest_availability_responder_count": counts["guest_availability_responders"],
    }


@app.get("/events")
def list_events(
    visibility: str | None = Query(None),
    province_id: int | None = Query(None),
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    user = None
    if cred and cred.credentials:
        try:
            user = get_user_from_token(cred.credentials, db)
        except HTTPException:
            user = None

    user_domain = _get_domain(user.email) if user else None

    if user and not _is_feature_enabled(db, user_domain, "events", user.role, set(_parse_group_tags(user.group_tag)), unit_id=user.org_unit_id):
        raise HTTPException(403, "Eventos deshabilitados para tu dominio")

    events = db.query(Event).all()
    requested_visibilities = _parse_requested_visibilities(visibility)
    filtered = _visible_events_for_user(events, user, user_domain, requested_visibilities, db=db, province_id=province_id)

    # Conteos de todos los eventos en bloque: 3 consultas en vez de ~6 por evento.
    counts = _bulk_event_counts(db, [e.id for e in filtered])
    return [_serialize_event_with_counts(db, e, counts.get(e.id)) for e in filtered]


@app.get("/events/{event_id}/public")
def get_event_public(
    event_id: int,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    """Detalle de evento accesible sin sesión (solo públicos) o con sesión
    (públicos + internos/privados según el mismo criterio de GET /events).
    Distinto del GET /events/{event_id} de administración, que exige rol admin."""
    user = None
    if cred and cred.credentials:
        try:
            user = get_user_from_token(cred.credentials, db)
        except HTTPException:
            user = None

    user_domain = _get_domain(user.email) if user else None

    ev = db.query(Event).filter(Event.id == event_id).first()
    if not ev or not _visible_events_for_user([ev], user, user_domain, None, db=db):
        raise HTTPException(404, "Evento no encontrado")

    return _serialize_event_with_counts(db, ev)


@app.get("/e/{event_id}", response_class=HTMLResponse)
def event_share_page(event_id: int, db: Session = Depends(get_db)):
    """Página de compartición para redes (WhatsApp, redes sociales). Devuelve
    HTML con metadatos Open Graph para que el enlace muestre título/descripción,
    y redirige a la app. Solo eventos públicos: no desvela nada interno."""
    frontend_base = os.getenv("FRONTEND_BASE_URL", "").strip().rstrip("/")
    target = f"{frontend_base}/eventos/{event_id}" if frontend_base else f"/eventos/{event_id}"

    ev = db.query(Event).filter(Event.id == event_id).first()
    is_public = ev and (ev.visibility or "internal").strip().lower() == "public" and not ev.deleted_at
    if not is_public:
        # No revelamos existencia de eventos no públicos: redirección simple.
        return HTMLResponse(
            f'<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url={html.escape(target)}">'
            f'<a href="{html.escape(target)}">Ir al evento</a>'
        )

    title = html.escape(ev.title or "Evento")
    desc_parts = []
    if ev.date:
        desc_parts.append(ev.date + (f" {ev.start_time[:5]}" if ev.start_time else ""))
    if ev.location:
        desc_parts.append(ev.location)
    if ev.description:
        desc_parts.append(ev.description[:160])
    description = html.escape(" · ".join(desc_parts) or "Próximo evento")
    target_esc = html.escape(target)

    return HTMLResponse(
        f'<!doctype html><html lang="es"><head><meta charset="utf-8">'
        f'<meta name="viewport" content="width=device-width, initial-scale=1">'
        f'<title>{title}</title>'
        f'<meta property="og:type" content="website">'
        f'<meta property="og:title" content="{title}">'
        f'<meta property="og:description" content="{description}">'
        f'<meta name="description" content="{description}">'
        f'<meta name="twitter:card" content="summary">'
        f'<meta http-equiv="refresh" content="0;url={target_esc}">'
        f'</head><body><p><a href="{target_esc}">Ver el evento</a></p></body></html>'
    )


@app.get("/events/{event_id}")
def get_event(
    event_id: int,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    require_admin(admin)

    ev = db.query(Event).filter(Event.id == event_id).first()
    if not ev:
        raise HTTPException(404, "Evento no encontrado")

    _ensure_event_domain_access(admin, ev, db)

    return {
        "id": ev.id,
        "title": ev.title,
        "description": ev.description,
        "date": ev.date,
        "start_time": ev.start_time,
        # `Event` no tiene `end_time` en el modelo actual; mantenemos el campo para compatibilidad.
        "end_time": None,
        "allowed_domain": ev.allowed_domain,
        "visibility": ev.visibility,
        "event_type": ev.event_type,
        "location": ev.location,
        "external_url": ev.external_url,
        "attachments": _parse_attachments(ev.attachments),
        "metadata": json.loads(ev.metadata_json) if ev.metadata_json else None,
        "is_recurring": bool(ev.is_recurring),
        "recurrence_rule": ev.recurrence_rule,
        "org_unit_id": ev.org_unit_id,
        "distribution_mode": ev.distribution_mode,
    }


# =========================================================
# CALENDARIO (export iCalendar)
# =========================================================
@app.get("/calendar/export.ics")
def export_calendar_ics(
    visibility: str | None = Query(None),
    province_id: int | None = Query(None),
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    user = None
    if cred and cred.credentials:
        try:
            user = get_user_from_token(cred.credentials, db)
        except HTTPException:
            user = None

    user_domain = _get_domain(user.email) if user else None
    requested_visibilities = _parse_requested_visibilities(visibility)

    if user is None:
        # Visitantes sin sesión solo exportan eventos públicos, sin importar el filtro pedido.
        requested_visibilities = {"public"}

    events = db.query(Event).all()
    visible_events = _visible_events_for_user(events, user, user_domain, requested_visibilities, db=db, province_id=province_id)

    creator_ids = {e.created_by for e in visible_events if e.created_by}
    creators = {}
    if creator_ids:
        for creator in db.query(User).filter(User.id.in_(creator_ids)).all():
            creators[creator.id] = creator

    event_dicts = []
    for e in visible_events:
        creator = creators.get(e.created_by)
        event_dicts.append({
            "id": e.id,
            "title": e.title,
            "description": e.description,
            "date": e.date,
            "start_time": e.start_time,
            "location": e.location,
            "external_url": e.external_url,
            "visibility": e.visibility,
            "organizer_email": creator.email if creator else None,
            "organizer_name": creator.full_name if creator else None,
            "updated_at": e.updated_at,
        })

    calendar_name = "Eventos públicos" if user is None else "Mis eventos"
    ics_content = generate_ics(event_dicts, calendar_name=calendar_name)

    return Response(
        content=ics_content,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=eventos.ics"},
    )


@app.get("/events/{event_id}/calendar.ics")
def export_event_ics(
    event_id: int,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    """Exporta un único evento como .ics. Mismo criterio de visibilidad que
    GET /events/{event_id}/public: sin sesión solo eventos públicos."""
    user = None
    if cred and cred.credentials:
        try:
            user = get_user_from_token(cred.credentials, db)
        except HTTPException:
            user = None

    user_domain = _get_domain(user.email) if user else None

    ev = db.query(Event).filter(Event.id == event_id).first()
    if not ev or not _visible_events_for_user([ev], user, user_domain, None, db=db):
        raise HTTPException(404, "Evento no encontrado")

    creator = db.query(User).filter(User.id == ev.created_by).first() if ev.created_by else None

    event_dict = {
        "id": ev.id,
        "title": ev.title,
        "description": ev.description,
        "date": ev.date,
        "start_time": ev.start_time,
        "location": ev.location,
        "external_url": ev.external_url,
        "visibility": ev.visibility,
        "organizer_email": creator.email if creator else None,
        "organizer_name": creator.full_name if creator else None,
        "updated_at": ev.updated_at,
    }

    ics_content = generate_ics([event_dict], calendar_name=ev.title)

    return Response(
        content=ics_content,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename=evento-{ev.id}.ics"},
    )


@app.get("/events/{event_id}/responses")
def event_responses(
    event_id: int,
    domain: str | None = None,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    user = get_user_from_token(cred.credentials, db)

    ev = db.query(Event).filter(Event.id == event_id).first()
    if not ev:
        raise HTTPException(404, "Evento no encontrado")

    _ensure_event_domain_access(user, ev, db)

    user_domain = _get_domain(user.email)

    if ev.allowed_domain and user.role != "superadmin":
        event_domain = ev.allowed_domain.strip().lower()
        if event_domain != user_domain:
            raise HTTPException(403, "No autorizado para ver respuestas de otro dominio")

    resp = (
        db.query(EventResponse, User)
        .join(User, EventResponse.user_id == User.id)
        .filter(EventResponse.event_id == event_id)
        .all()
    )

    results = []
    for r, u in resp:
        responder_domain = _get_domain(u.email)
        if domain and responder_domain != domain.strip().lower():
            continue

        # Quién puede ver a quién lo decide la estructura, no el dominio del email.
        if user.role == "superadmin":
            pass
        elif user.role == "admin":
            if not _can_admin_manage_user(user, u, db):
                continue
        else:
            if u.org_unit_id != user.org_unit_id:
                continue

        companion_count = (
            db.query(EventCompanion.count)
            .filter(
                EventCompanion.event_id == event_id,
                EventCompanion.user_id == u.id,
            )
            .scalar()
        ) or 0

        display_domain = u.email.split("@")[-1].strip() if "@" in u.email else ""

        results.append({
            "user_id": u.id,
            "user_full_name": u.full_name,
            "user_domain": display_domain,
            "answer": r.answer,
            "justification": r.justification,
            "companions_count": companion_count,
        })

    return results


@app.get("/events/{event_id}/guest-responses")
def event_guest_responses(
    event_id: int,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    """Respuestas de visitantes sin cuenta a un evento público. Se sirven aparte
    de las de militantes para que el admin las vea diferenciadas."""
    admin = get_user_from_token(cred.credentials, db)
    require_admin(admin)

    ev = db.query(Event).filter(Event.id == event_id).first()
    if not ev:
        raise HTTPException(404, "Evento no encontrado")

    _ensure_event_domain_access(admin, ev, db)

    rows = (
        db.query(GuestResponse)
        .filter(GuestResponse.event_id == event_id)
        .order_by(GuestResponse.created_at)
        .all()
    )

    return [
        {
            "id": g.id,
            "guest_name": g.guest_name,
            "answer": g.answer,
            "companions": g.companions or 0,
            "created_at": g.created_at,
        }
        for g in rows
    ]


@app.post("/events/{event_id}/responses")
def respond_event(
    event_id: int,
    data: EventResponseCreate,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    user = get_user_from_token(cred.credentials, db)

    raw_answer = str(data.answer).strip().lower()
    if raw_answer in ["si", "sí", "yes"]:
        normalized_answer = "si"
    elif raw_answer == "no":
        normalized_answer = "no"
    else:
        raise HTTPException(400, "answer inválida (usa 'si' o 'no')")

    existing = (
        db.query(EventResponse)
        .filter(
            EventResponse.event_id == event_id,
            EventResponse.user_id == user.id
        )
        .first()
    )

    # El militante puede cambiar su respuesta mientras el evento siga activo:
    # si ya respondió, se actualiza en lugar de rechazar.
    if existing:
        existing.answer = normalized_answer
        existing.justification = data.justification
        db.commit()
        return {"ok": True, "updated": True}

    db.add(EventResponse(
        event_id=event_id,
        user_id=user.id,
        answer=normalized_answer,
        justification=data.justification
    ))
    try:
        db.commit()
    except IntegrityError:
        # Carrera: otra petición creó la respuesta a la vez. Actualizamos.
        db.rollback()
        existing = (
            db.query(EventResponse)
            .filter(
                EventResponse.event_id == event_id,
                EventResponse.user_id == user.id
            )
            .first()
        )
        if existing:
            existing.answer = normalized_answer
            existing.justification = data.justification
            db.commit()
            return {"ok": True, "updated": True}
        raise HTTPException(400, "No se pudo registrar la respuesta")

    return {"ok": True, "updated": False}


@app.post("/events/{event_id}/responses/guest")
def respond_event_guest(
    event_id: int,
    data: GuestResponseCreate,
    request: Request,
    db: Session = Depends(get_db)
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Evento no encontrado")

    event_visibility = (event.visibility or "internal").strip().lower()
    if event_visibility != "public":
        raise HTTPException(403, "Solo los eventos públicos aceptan respuestas de visitantes")

    domain_tag = _resolve_guest_domain_tag_from_event(event)
    policy = db.query(GuestPolicy).filter(GuestPolicy.domain_tag == domain_tag).first()
    if policy and not bool(policy.guest_responses_enabled):
        raise HTTPException(403, "Respuestas de visitantes deshabilitadas para este dominio")

    raw_answer = (data.answer or "saved").strip().lower()
    if raw_answer in ["si", "sí", "yes"]:
        normalized_answer = "si"
    elif raw_answer in ["abstain", "abstener", "abstencion", "abstención"]:
        normalized_answer = "abstain"
    elif raw_answer in ["saved", "guardar", "recordar"]:
        normalized_answer = "saved"
    else:
        raise HTTPException(400, "answer inválida (usa si, abstain o saved)")

    companions = int(data.companions or 0)
    if companions < 0:
        raise HTTPException(400, "companions no puede ser negativo")
    if companions > 20:
        raise HTTPException(400, "Máximo 20 acompañantes")

    if policy and policy.max_guest_responses_per_event is not None:
        current_count = db.query(GuestResponse).filter(GuestResponse.event_id == event_id).count()
        if current_count >= int(policy.max_guest_responses_per_event):
            raise HTTPException(403, "Límite de respuestas de visitantes alcanzado")

    guest_identifier_raw = (data.guest_identifier or "").strip()
    if not guest_identifier_raw:
        ip_part = request.client.host if request.client and request.client.host else "no-ip"
        name_part = (data.guest_name or "anon").strip().lower()
        email_part = (data.guest_email or "").strip().lower()
        guest_identifier_raw = f"{ip_part}|{name_part}|{email_part}|{event_id}"

    guest_identifier = hashlib.sha256(guest_identifier_raw.encode("utf-8")).hexdigest()

    existing = (
        db.query(GuestResponse)
        .filter(GuestResponse.event_id == event_id, GuestResponse.guest_identifier == guest_identifier)
        .first()
    )

    now_iso = datetime.utcnow().isoformat()
    if existing:
        existing.guest_name = data.guest_name
        existing.guest_email = data.guest_email
        existing.answer = normalized_answer
        existing.companions = companions
        existing.updated_at = now_iso
        db.commit()
        db.refresh(existing)
        return {
            "ok": True,
            "id": existing.id,
            "event_id": existing.event_id,
            "updated": True,
            "export_token": None,
        }

    guest_response = GuestResponse(
        event_id=event_id,
        guest_name=data.guest_name,
        guest_email=data.guest_email,
        answer=normalized_answer,
        companions=companions,
        guest_identifier=guest_identifier,
        created_at=now_iso,
        updated_at=now_iso,
    )
    db.add(guest_response)
    db.commit()
    db.refresh(guest_response)

    return {
        "ok": True,
        "id": guest_response.id,
        "event_id": guest_response.event_id,
        "updated": False,
        "export_token": None,
    }


def _require_disponibilidad_event(event: Event) -> None:
    if (event.event_type or "").strip().lower() != "disponibilidad":
        raise HTTPException(400, "Este evento no admite disponibilidad horaria")


def _require_event_not_past(event: Event) -> None:
    today_str = datetime.utcnow().date().strftime("%Y-%m-%d")
    if event.date < today_str:
        raise HTTPException(410, "No puedes marcar disponibilidad para un evento ya pasado")


def _require_valid_availability_hour(hour: int) -> int:
    if hour < 8 or hour > 23:
        raise HTTPException(400, "hour debe ser un entero entre 8 y 23")
    return hour


@app.get("/events/{event_id}/availability/my")
def my_event_availability(
    event_id: int,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    user = get_user_from_token(cred.credentials, db)

    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Evento no encontrado")
    _require_disponibilidad_event(event)

    rows = (
        db.query(EventAvailabilitySlot)
        .filter(EventAvailabilitySlot.event_id == event_id, EventAvailabilitySlot.user_id == user.id)
        .all()
    )
    return [{"id": s.id, "hour": s.hour} for s in rows]


@app.post("/events/{event_id}/availability/my")
def create_my_event_availability(
    event_id: int,
    data: EventAvailabilitySlotCreate,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    user = get_user_from_token(cred.credentials, db)

    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Evento no encontrado")
    _require_disponibilidad_event(event)
    _require_event_not_past(event)
    hour = _require_valid_availability_hour(data.hour)

    existing = (
        db.query(EventAvailabilitySlot)
        .filter(
            EventAvailabilitySlot.event_id == event_id,
            EventAvailabilitySlot.user_id == user.id,
            EventAvailabilitySlot.hour == hour,
        )
        .first()
    )
    if existing:
        return {"id": existing.id, "hour": existing.hour}

    slot = EventAvailabilitySlot(
        event_id=event_id,
        user_id=user.id,
        hour=hour,
        created_at=datetime.utcnow().isoformat(),
    )
    db.add(slot)
    try:
        db.commit()
    except IntegrityError:
        # Carrera: otra petición creó la franja a la vez.
        db.rollback()
        existing = (
            db.query(EventAvailabilitySlot)
            .filter(
                EventAvailabilitySlot.event_id == event_id,
                EventAvailabilitySlot.user_id == user.id,
                EventAvailabilitySlot.hour == hour,
            )
            .first()
        )
        if existing:
            return {"id": existing.id, "hour": existing.hour}
        raise HTTPException(400, "No se pudo registrar la franja")

    db.refresh(slot)
    return {"id": slot.id, "hour": slot.hour}


@app.delete("/events/{event_id}/availability/my/{slot_id}")
def delete_my_event_availability(
    event_id: int,
    slot_id: int,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    user = get_user_from_token(cred.credentials, db)

    slot = (
        db.query(EventAvailabilitySlot)
        .filter(
            EventAvailabilitySlot.id == slot_id,
            EventAvailabilitySlot.event_id == event_id,
            EventAvailabilitySlot.user_id == user.id,
        )
        .first()
    )
    if not slot:
        raise HTTPException(404, "Franja no encontrada")

    db.delete(slot)
    db.commit()
    return {"ok": True}


@app.get("/events/{event_id}/availability/guest")
def guest_event_availability(
    event_id: int,
    guest_identifier: str = Query(...),
    db: Session = Depends(get_db)
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Evento no encontrado")

    event_visibility = (event.visibility or "internal").strip().lower()
    if event_visibility != "public":
        raise HTTPException(403, "Solo los eventos públicos aceptan respuestas de visitantes")
    _require_disponibilidad_event(event)

    guest_identifier_hash = hashlib.sha256((guest_identifier or "").strip().encode("utf-8")).hexdigest()
    rows = (
        db.query(GuestEventAvailabilitySlot)
        .filter(
            GuestEventAvailabilitySlot.event_id == event_id,
            GuestEventAvailabilitySlot.guest_identifier == guest_identifier_hash,
        )
        .all()
    )
    return [{"id": s.id, "hour": s.hour} for s in rows]


@app.post("/events/{event_id}/availability/guest")
def create_guest_event_availability(
    event_id: int,
    data: GuestEventAvailabilitySlotCreate,
    db: Session = Depends(get_db)
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Evento no encontrado")

    event_visibility = (event.visibility or "internal").strip().lower()
    if event_visibility != "public":
        raise HTTPException(403, "Solo los eventos públicos aceptan respuestas de visitantes")
    _require_disponibilidad_event(event)
    _require_event_not_past(event)
    hour = _require_valid_availability_hour(data.hour)

    domain_tag = _resolve_guest_domain_tag_from_event(event)
    policy = db.query(GuestPolicy).filter(GuestPolicy.domain_tag == domain_tag).first()
    if policy and not bool(policy.guest_responses_enabled):
        raise HTTPException(403, "Respuestas de visitantes deshabilitadas para este dominio")

    guest_identifier_raw = (data.guest_identifier or "").strip()
    if not guest_identifier_raw:
        raise HTTPException(400, "guest_identifier requerido")
    guest_identifier = hashlib.sha256(guest_identifier_raw.encode("utf-8")).hexdigest()

    existing = (
        db.query(GuestEventAvailabilitySlot)
        .filter(
            GuestEventAvailabilitySlot.event_id == event_id,
            GuestEventAvailabilitySlot.guest_identifier == guest_identifier,
            GuestEventAvailabilitySlot.hour == hour,
        )
        .first()
    )
    if existing:
        existing.guest_name = data.guest_name
        db.commit()
        return {"id": existing.id, "hour": existing.hour}

    slot = GuestEventAvailabilitySlot(
        event_id=event_id,
        guest_identifier=guest_identifier,
        guest_name=data.guest_name,
        hour=hour,
        created_at=datetime.utcnow().isoformat(),
    )
    db.add(slot)
    try:
        db.commit()
    except IntegrityError:
        # Carrera: otra petición creó la franja a la vez.
        db.rollback()
        existing = (
            db.query(GuestEventAvailabilitySlot)
            .filter(
                GuestEventAvailabilitySlot.event_id == event_id,
                GuestEventAvailabilitySlot.guest_identifier == guest_identifier,
                GuestEventAvailabilitySlot.hour == hour,
            )
            .first()
        )
        if existing:
            return {"id": existing.id, "hour": existing.hour}
        raise HTTPException(400, "No se pudo registrar la franja")

    db.refresh(slot)
    return {"id": slot.id, "hour": slot.hour}


@app.delete("/events/{event_id}/availability/guest/{slot_id}")
def delete_guest_event_availability(
    event_id: int,
    slot_id: int,
    data: GuestEventAvailabilityIdentify,
    db: Session = Depends(get_db)
):
    guest_identifier = hashlib.sha256((data.guest_identifier or "").strip().encode("utf-8")).hexdigest()

    slot = (
        db.query(GuestEventAvailabilitySlot)
        .filter(
            GuestEventAvailabilitySlot.id == slot_id,
            GuestEventAvailabilitySlot.event_id == event_id,
            GuestEventAvailabilitySlot.guest_identifier == guest_identifier,
        )
        .first()
    )
    if not slot:
        raise HTTPException(404, "Franja no encontrada")

    db.delete(slot)
    db.commit()
    return {"ok": True}


@app.get("/events/{event_id}/availability")
def event_availability(
    event_id: int,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    """Vista admin: franjas marcadas por militantes en un evento 'disponibilidad'."""
    admin = get_user_from_token(cred.credentials, db)
    require_admin(admin)

    ev = db.query(Event).filter(Event.id == event_id).first()
    if not ev:
        raise HTTPException(404, "Evento no encontrado")

    _ensure_event_domain_access(admin, ev, db)

    rows = (
        db.query(EventAvailabilitySlot, User)
        .join(User, User.id == EventAvailabilitySlot.user_id)
        .filter(EventAvailabilitySlot.event_id == event_id)
        .all()
    )

    by_user = {}
    for slot, user in rows:
        entry = by_user.setdefault(user.id, {
            "user_id": user.id,
            "user_full_name": user.full_name,
            "user_domain": _get_domain(user.email),
            "hours": [],
        })
        entry["hours"].append(slot.hour)

    results = list(by_user.values())
    for entry in results:
        entry["hours"].sort()
    return results


@app.get("/events/{event_id}/guest-availability")
def event_guest_availability(
    event_id: int,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    """Vista admin: franjas marcadas por visitantes sin cuenta en un evento
    público 'disponibilidad'. Se sirven aparte de las de militantes."""
    admin = get_user_from_token(cred.credentials, db)
    require_admin(admin)

    ev = db.query(Event).filter(Event.id == event_id).first()
    if not ev:
        raise HTTPException(404, "Evento no encontrado")

    _ensure_event_domain_access(admin, ev, db)

    rows = (
        db.query(GuestEventAvailabilitySlot)
        .filter(GuestEventAvailabilitySlot.event_id == event_id)
        .all()
    )

    by_guest = {}
    for slot in rows:
        entry = by_guest.setdefault(slot.guest_identifier, {
            "guest_name": slot.guest_name,
            "hours": [],
        })
        entry["hours"].append(slot.hour)

    results = list(by_guest.values())
    for entry in results:
        entry["hours"].sort()
    return results


@app.get("/my-event-responses")
def my_event_responses(
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    user = get_user_from_token(cred.credentials, db)

    return [
        {
            "event_id": r.event_id,
            "answer": r.answer,
            "justification": r.justification,
        }
        for r in db.query(EventResponse)
                   .filter(EventResponse.user_id == user.id)
                   .all()
    ]


@app.get("/my-event-companions")
def my_event_companions(
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    user = get_user_from_token(cred.credentials, db)

    items = (
        db.query(EventCompanion)
        .filter(EventCompanion.user_id == user.id)
        .all()
    )

    return [
        {
            "event_id": item.event_id,
            "count": int(item.count or 0),
        }
        for item in items
    ]


@app.put("/events/{event_id}/companions/my")
def update_my_event_companions(
    event_id: int,
    data: EventCompanionUpdate,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    user = get_user_from_token(cred.credentials, db)

    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Evento no encontrado")

    _ensure_event_domain_access(user, event, db)

    if data.count < 0:
        raise HTTPException(400, "El número de acompañantes no puede ser negativo")
    if data.count > 20:
        raise HTTPException(400, "Máximo 20 acompañantes por usuario y evento")

    response = (
        db.query(EventResponse)
        .filter(
            EventResponse.event_id == event_id,
            EventResponse.user_id == user.id,
            func.lower(EventResponse.answer).in_(["si", "yes"]),
        )
        .first()
    )

    if not response:
        raise HTTPException(400, "Debes votar 'Sí' antes de añadir acompañantes")

    item = (
        db.query(EventCompanion)
        .filter(
            EventCompanion.event_id == event_id,
            EventCompanion.user_id == user.id,
        )
        .first()
    )

    if data.count == 0:
        if item:
            db.delete(item)
            db.commit()
        return {"ok": True, "event_id": event_id, "count": 0}

    if item:
        item.count = data.count
    else:
        item = EventCompanion(event_id=event_id, user_id=user.id, count=data.count)
        db.add(item)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(400, "Ya se han guardado acompañantes para este evento, recarga e inténtalo de nuevo")

    return {"ok": True, "event_id": event_id, "count": int(item.count)}


# =========================================================
# ENCUESTAS
# =========================================================

SURVEY_FIELD_TYPES = {"text", "textarea", "number", "select"}


def _survey_field_to_dict(field: SurveyField) -> dict:
    return {
        "id": field.id,
        "label": field.label,
        "field_type": field.field_type,
        "required": bool(field.required),
        "order_index": field.order_index,
        "options": json.loads(field.options) if field.options else [],
    }


def _survey_to_dict(survey: Survey, include_count: bool = False) -> dict:
    data = {
        "id": survey.id,
        "title": survey.title,
        "description": survey.description,
        "url_token": survey.url_token,
        "is_active": bool(survey.is_active),
        "created_at": survey.created_at,
        "created_by": survey.created_by,
        "fields": [_survey_field_to_dict(field) for field in survey.fields],
    }
    if include_count:
        data["responses_count"] = len(survey.responses)
    return data


def _validate_survey_fields(fields: list[SurveyFieldCreate]):
    if not fields:
        raise HTTPException(400, "Debes añadir al menos un campo")

    for field in fields:
        if not field.label or not field.label.strip():
            raise HTTPException(400, "Todos los campos deben tener etiqueta")
        if field.field_type not in SURVEY_FIELD_TYPES:
            raise HTTPException(400, f"Tipo de campo inválido: {field.field_type}")


@app.get("/admin/surveys")
def admin_list_surveys(
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    if not cred or not cred.credentials:
        raise HTTPException(401, "Token inválido")

    admin = get_user_from_token(cred.credentials, db)
    _require_superadmin_module_access(admin, db, "surveys")

    surveys = db.query(Survey).order_by(Survey.id.desc()).all()
    return [_survey_to_dict(survey, include_count=True) for survey in surveys]


@app.post("/admin/surveys")
def admin_create_survey(
    data: SurveyCreate,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    if not cred or not cred.credentials:
        raise HTTPException(401, "Token inválido")

    admin = get_user_from_token(cred.credentials, db)
    _require_superadmin_module_access(admin, db, "surveys")

    title = (data.title or "").strip()
    if not title:
        raise HTTPException(400, "El título de la encuesta es obligatorio")

    _validate_survey_fields(data.fields)

    survey = Survey(
        title=title,
        description=(data.description or "").strip() or None,
        url_token=secrets.token_urlsafe(16),
        created_by=admin.id,
        is_active=1,
        created_at=datetime.utcnow().isoformat(),
    )
    db.add(survey)
    db.flush()

    for idx, field in enumerate(data.fields):
        options = None
        if field.field_type == "select" and field.options:
            options = json.dumps([opt.strip() for opt in field.options if opt and opt.strip()])

        db.add(SurveyField(
            survey_id=survey.id,
            label=field.label.strip(),
            field_type=field.field_type,
            required=1 if field.required else 0,
            order_index=field.order_index if field.order_index is not None else idx,
            options=options,
        ))

    db.commit()
    db.refresh(survey)
    return _survey_to_dict(survey, include_count=True)


@app.post("/admin/surveys/{survey_id}/regenerate-token")
def admin_regenerate_survey_token(
    survey_id: int,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    if not cred or not cred.credentials:
        raise HTTPException(401, "Token inválido")

    admin = get_user_from_token(cred.credentials, db)
    _require_superadmin_module_access(admin, db, "surveys")

    survey = db.query(Survey).filter(Survey.id == survey_id).first()
    if not survey:
        raise HTTPException(404, "Encuesta no encontrada")

    survey.url_token = secrets.token_urlsafe(16)
    db.commit()
    return {"url_token": survey.url_token}


@app.put("/admin/surveys/{survey_id}")
def admin_update_survey(
    survey_id: int,
    data: SurveyUpdate,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    if not cred or not cred.credentials:
        raise HTTPException(401, "Token inválido")

    admin = get_user_from_token(cred.credentials, db)
    _require_superadmin_module_access(admin, db, "surveys")

    survey = db.query(Survey).filter(Survey.id == survey_id).first()
    if not survey:
        raise HTTPException(404, "Encuesta no encontrada")

    title = (data.title or "").strip()
    if not title:
        raise HTTPException(400, "El título de la encuesta es obligatorio")

    survey.title = title
    survey.description = (data.description or "").strip() or None
    if data.is_active is not None:
        survey.is_active = 1 if data.is_active else 0

    # Los campos solo se pueden reemplazar si la encuesta no tiene respuestas:
    # cambiarlos con respuestas guardadas rompería el mapeo por id de campo.
    if data.fields is not None:
        has_responses = (
            db.query(SurveyResponse).filter(SurveyResponse.survey_id == survey.id).first()
            is not None
        )
        if has_responses:
            raise HTTPException(400, "No se pueden editar los campos de una encuesta que ya tiene respuestas")

        _validate_survey_fields(data.fields)
        # Borrar campos antiguos y crear los nuevos.
        db.query(SurveyField).filter(SurveyField.survey_id == survey.id).delete(synchronize_session=False)
        for idx, field in enumerate(data.fields):
            options = None
            if field.field_type == "select" and field.options:
                options = json.dumps([opt.strip() for opt in field.options if opt and opt.strip()])
            db.add(SurveyField(
                survey_id=survey.id,
                label=field.label.strip(),
                field_type=field.field_type,
                required=1 if field.required else 0,
                order_index=field.order_index if field.order_index is not None else idx,
                options=options,
            ))

    db.commit()
    db.refresh(survey)
    return _survey_to_dict(survey, include_count=True)


@app.delete("/admin/surveys/{survey_id}")
def admin_delete_survey(
    survey_id: int,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    if not cred or not cred.credentials:
        raise HTTPException(401, "Token inválido")

    admin = get_user_from_token(cred.credentials, db)
    _require_superadmin_module_access(admin, db, "surveys")

    survey = db.query(Survey).filter(Survey.id == survey_id).first()
    if not survey:
        raise HTTPException(404, "Encuesta no encontrada")

    # El modelo Survey tiene cascade all/delete-orphan sobre fields y responses.
    db.delete(survey)
    db.commit()
    return {"ok": True}


@app.get("/admin/surveys/{survey_id}/responses")
def admin_survey_responses(
    survey_id: int,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    if not cred or not cred.credentials:
        raise HTTPException(401, "Token inválido")

    admin = get_user_from_token(cred.credentials, db)
    _require_superadmin_module_access(admin, db, "surveys")

    survey = db.query(Survey).filter(Survey.id == survey_id).first()
    if not survey:
        raise HTTPException(404, "Encuesta no encontrada")

    responses = (
        db.query(SurveyResponse)
        .filter(SurveyResponse.survey_id == survey.id)
        .order_by(SurveyResponse.id.desc())
        .all()
    )

    parsed_responses = []
    for response in responses:
        try:
            answers = json.loads(response.answers)
        except Exception:
            answers = {}

        parsed_responses.append({
            "id": response.id,
            "submitted_at": response.submitted_at,
            "answers": answers,
        })

    return {
        "survey": _survey_to_dict(survey, include_count=True),
        "responses": parsed_responses,
    }


@app.get("/encuesta/{token}/fields")
def public_get_survey_fields(token: str, db: Session = Depends(get_db)):
    survey = db.query(Survey).filter(Survey.url_token == token, Survey.is_active == 1).first()
    if not survey:
        raise HTTPException(404, "Encuesta no encontrada")

    return {
        "id": survey.id,
        "title": survey.title,
        "description": survey.description,
        "fields": [_survey_field_to_dict(field) for field in survey.fields],
    }


@app.post("/encuesta/{token}")
def public_submit_survey(
    token: str,
    data: dict = Body(...),
    db: Session = Depends(get_db)
):
    survey = db.query(Survey).filter(Survey.url_token == token, Survey.is_active == 1).first()
    if not survey:
        raise HTTPException(404, "Encuesta no encontrada")

    fields = sorted(survey.fields, key=lambda field: field.order_index)
    cleaned_answers: dict[str, str] = {}

    for field in fields:
        key = str(field.id)
        raw_value = data.get(key, "")
        value = "" if raw_value is None else str(raw_value).strip()

        if bool(field.required) and not value:
            raise HTTPException(400, f'El campo "{field.label}" es obligatorio')

        if field.field_type == "select" and value:
            options = json.loads(field.options) if field.options else []
            if value not in options:
                raise HTTPException(400, f'Valor inválido para el campo "{field.label}"')

        cleaned_answers[key] = value

    response = SurveyResponse(
        survey_id=survey.id,
        answers=json.dumps(cleaned_answers, ensure_ascii=False),
        submitted_at=datetime.utcnow().isoformat(),
    )
    db.add(response)
    db.commit()
    return {"ok": True}


# =========================================================
# ESPACIOS Y RESERVAS
# =========================================================

def _get_domain(email: str):
    if not email or "@" not in email:
        return ""
    return email.split("@")[-1].strip().lower()


def _policy_storage_key(target_type: str, target_value: str) -> str:
    normalized_target_type = (target_type or "domain").strip().lower()
    if normalized_target_type == "tag":
        return f"tag:{_normalize_group_tag(target_value)}"
    return (target_value or "").strip().lower()


def _policy_target_from_storage(storage_key: str) -> tuple[str, str]:
    key = (storage_key or "").strip().lower()
    if key.startswith("tag:"):
        return "tag", _normalize_group_tag(key.split(":", 1)[1])
    if key.startswith("unit:"):
        return "unit", key.split(":", 1)[1]
    return "domain", key


def _matches_policy_target(storage_key: str, domain: str, tags: set[str]) -> bool:
    target_type, target_value = _policy_target_from_storage(storage_key)
    if target_type == "tag":
        return target_value in tags
    if target_type == "unit":
        # Las políticas por unidad no se resuelven por dominio: las aplica la
        # cascada del organigrama (feature_decision_for_unit).
        return False
    return target_value == (domain or "").strip().lower()


def _get_applicable_policies(db: Session, domain: str, tags: set[str] | None = None):
    normalized_domain = (domain or "").strip().lower()
    normalized_tags = set(tags or set())
    # Las políticas se cargan una sola vez por petición (antes se releía la tabla
    # entera en cada comprobación de módulo).
    return [
        policy
        for policy in org_service.all_policies(db)
        if _matches_policy_target(policy.domain, normalized_domain, normalized_tags)
    ]


def _is_feature_enabled(db: Session, domain: str, feature: str, role: str = "user",
                        tags: set[str] | None = None, unit_id: int | None = None):
    # Módulos eliminados en la distribución para comités externos: census y
    # notifications requieren infraestructura adicional (correo/FCM) que estos
    # comités no configuran. Nunca se habilitan, ni siquiera para superadmin.
    if feature in {"census", "notifications"}:
        return False
    if role == "superadmin":
        return True

    # 1) Organigrama: gana la política de la unidad más específica, heredando de
    #    sus superiores si no tiene propia. Si no se indica la unidad, se deduce
    #    del dominio (su colectivo equivalente) para no romper las llamadas que
    #    todavía razonan en términos de dominio.
    resolved_unit_id = unit_id if unit_id is not None else org_service.unit_id_for_legacy_domain(db, domain)
    decision = org_service.feature_decision_for_unit(db, resolved_unit_id, feature)
    if decision is not None:
        return decision

    # 2) Criterio antiguo por dominio/etiqueta (políticas aún sin unidad).
    applicable = _get_applicable_policies(db, domain, tags)
    if not applicable:
        # Defaults when no policy is defined, by role
        if role == "admin":
            return feature in {"events", "availabilities", "users"}
        # user role
        return feature in {"events", "availabilities"}

    feature_map = {
        "events": "events_enabled",
        "availabilities": "availabilities_enabled",
        "spaces": "spaces_enabled",
        "users": "users_enabled",
        "domain_policies": "domain_policies_enabled",
        "census": "census_enabled",
        "surveys": "surveys_enabled",
        "notifications": "notifications_enabled",
    }
    column_name = feature_map.get(feature)
    if not column_name:
        return True

    # Si hay políticas aplicables, habilita si al menos una política habilita el feature.
    return any(bool(getattr(policy, column_name, 0)) for policy in applicable)


def _domain_policy_to_dict(policy: models.DomainPolicy, db: Session | None = None) -> dict:
    target_type, target_value = _policy_target_from_storage(policy.domain)
    unit_name = None
    if db is not None and policy.org_unit_id is not None:
        unit = db.query(OrgUnit).get(policy.org_unit_id)
        unit_name = unit.name if unit else None
    return {
        "id": policy.id,
        "domain": target_value,
        "target_type": target_type,
        "org_unit_id": policy.org_unit_id,
        "org_unit_name": unit_name,
        "events_enabled": bool(policy.events_enabled),
        "availabilities_enabled": bool(policy.availabilities_enabled),
        "spaces_enabled": bool(policy.spaces_enabled),
        "users_enabled": bool(policy.users_enabled),
        "domain_policies_enabled": bool(policy.domain_policies_enabled),
        "census_enabled": bool(getattr(policy, "census_enabled", 0)),
        "surveys_enabled": bool(getattr(policy, "surveys_enabled", 0)),
        "notifications_enabled": bool(getattr(policy, "notifications_enabled", 0)),
    }


def _guest_policy_to_dict(policy: models.GuestPolicy) -> dict:
    return {
        "id": policy.id,
        "domain_tag": policy.domain_tag,
        "guest_responses_enabled": bool(policy.guest_responses_enabled),
        "guest_surveys_enabled": bool(policy.guest_surveys_enabled),
        "guest_census_enabled": bool(policy.guest_census_enabled),
        "guest_notifications_enabled": bool(policy.guest_notifications_enabled),
        "max_guest_responses_per_event": policy.max_guest_responses_per_event,
        "created_at": policy.created_at,
        "updated_at": policy.updated_at,
        "updated_by": policy.updated_by,
    }


def _resolve_guest_domain_tag_from_event(event: Event) -> str:
    if event.allowed_domain:
        return event.allowed_domain.strip().lower()
    return "public"


def _can_admin_manage_policy_target(admin: User, storage_key: str, db: Session) -> bool:
    if admin.role == "superadmin":
        return True

    target_type, target_value = _policy_target_from_storage(storage_key)
    if target_type == "domain":
        return _can_admin_manage_domain(admin, target_value, db)
    if target_type == "unit":
        try:
            return org_service.can_manage_unit(db, admin, int(target_value))
        except (TypeError, ValueError):
            return False

    admin_tags = set(_parse_group_tags(admin.group_tag))
    return target_value in admin_tags


def _require_superadmin_module_access(user: User, db: Session, module_name: str):
    if user.role == "superadmin":
        return
    if user.role != "admin":
        raise HTTPException(403, "No autorizado")

    user_domain = _get_domain(user.email)
    user_tags = set(_parse_group_tags(user.group_tag))
    if not _is_feature_enabled(db, user_domain, module_name, user.role, user_tags, unit_id=user.org_unit_id):
        raise HTTPException(403, "No autorizado para este modulo")


def _same_domain_or_superadmin(user: User, target_user: User, db: Session | None = None):
    return _can_admin_manage_user(user, target_user, db)


def _can_admin_manage_domain(admin: User, target_domain: str, db: Session) -> bool:
    """Autoridad sobre un dominio. Ahora delega en el organigrama: la autoridad
    de un admin es el subárbol de sus unidades asignadas (que incluye su propio
    colectivo tras el backfill). Sustituye el antiguo hack de delegación por
    prefijos mágicos en group_tag."""
    if admin.role == "superadmin":
        return True
    if db is None:
        return _get_domain(admin.email) == (target_domain or "").strip().lower()
    return org_service.can_manage_legacy_domain(db, admin, target_domain)


def _can_admin_manage_user(admin: User, target_user: User, db: Session | None = None) -> bool:
    """Autoridad sobre un usuario, vía su unidad organizativa (subárbol)."""
    if admin.role == "superadmin":
        return True
    if db is None:
        return _get_domain(admin.email) == _get_domain(target_user.email)
    # Si el usuario destino ya tiene unidad, decide el organigrama.
    if target_user.org_unit_id is not None:
        return org_service.can_manage_user(db, admin, target_user)
    # Sin unidad (dato heredado): fallback por dominio del email.
    return org_service.can_manage_legacy_domain(db, admin, _get_domain(target_user.email))



def _ensure_event_domain_access(user: User, event: Event, db: Session | None = None):
    if user.role == "superadmin":
        return

    # Preferir el organigrama: autoridad = subárbol de la unidad del admin.
    if db is not None and event.org_unit_id is not None:
        if not org_service.can_manage_unit(db, user, event.org_unit_id):
            raise HTTPException(403, "No autorizado para operar eventos de otra unidad")
        return

    # Fallback legacy (evento sin unidad todavía): criterio por dominio.
    if event.allowed_domain:
        event_domain = event.allowed_domain.strip().lower()
        user_domain = _get_domain(user.email)
        if user.role == "admin" and db is not None:
            if not _can_admin_manage_domain(user, event_domain, db):
                raise HTTPException(403, "No autorizado para operar eventos de otro dominio")
            return
        if event_domain != user_domain:
            raise HTTPException(403, "No autorizado para operar eventos de otro dominio")


@app.get("/spaces")
def list_spaces(
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    user = None
    if cred and cred.credentials:
        try:
            user = get_user_from_token(cred.credentials, db)
        except HTTPException:
            user = None

    if user and not _is_feature_enabled(db, _get_domain(user.email), "spaces", user.role, set(_parse_group_tags(user.group_tag)), unit_id=user.org_unit_id):
        raise HTTPException(403, "Funcionalidad de espacios deshabilitada para tu dominio")

    return [
        {
            "id": s.id,
            "name": s.name,
            "description": s.description,
        }
        for s in db.query(models.Space).all()
    ]


@app.post("/spaces")
def create_space(
    data: SpaceCreate,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    require_admin(admin)

    if not _is_feature_enabled(db, _get_domain(admin.email), "spaces", admin.role, set(_parse_group_tags(admin.group_tag)), unit_id=admin.org_unit_id):
        raise HTTPException(403, "Funcionalidad de espacios deshabilitada para tu dominio")

    if db.query(models.Space).filter(models.Space.name == data.name).first():
        raise HTTPException(400, "Ya existe un espacio con ese nombre")

    s = models.Space(
        name=data.name,
        description=data.description,
        created_by=admin.id
    )
    db.add(s)
    db.commit()
    db.refresh(s)

    return {
        "id": s.id,
        "name": s.name,
        "description": s.description,
    }


@app.delete("/spaces/{space_id}")
def delete_space(
    space_id: int,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    require_admin(admin)

    if not _is_feature_enabled(db, _get_domain(admin.email), "spaces", admin.role, set(_parse_group_tags(admin.group_tag)), unit_id=admin.org_unit_id):
        raise HTTPException(403, "Funcionalidad de espacios deshabilitada para tu dominio")

    s = db.query(models.Space).filter(models.Space.id == space_id).first()
    if not s:
        raise HTTPException(404, "Espacio no encontrado")
    
    # Validar que admin solo puede eliminar espacios creados en su dominio
    if admin.role != "superadmin":
        creator_domain = _get_domain(s.creator.email) if s.creator else ""
        if not _can_admin_manage_domain(admin, creator_domain, db):
            raise HTTPException(403, "No puedes eliminar espacios de otro dominio")

    db.query(models.SpaceReservation).filter(models.SpaceReservation.space_id == space_id).delete()
    db.delete(s)
    db.commit()

    return {"ok": True}


@app.get("/reservations")
def list_reservations(
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    user = get_user_from_token(cred.credentials, db)
    user_domain = _get_domain(user.email)

    if not _is_feature_enabled(db, user_domain, "spaces", user.role, set(_parse_group_tags(user.group_tag)), unit_id=user.org_unit_id):
        raise HTTPException(403, "Funcionalidad de espacios deshabilitada para tu dominio")

    all_reservations = db.query(models.SpaceReservation).join(models.Space).join(models.User).all()

    output = []
    for r in all_reservations:
        creator_domain = _get_domain(r.user.email)

        if user.role != "superadmin" and creator_domain != user_domain:
            continue

        show_reason = creator_domain == user_domain

        output.append({
            "id": r.id,
            "space_id": r.space_id,
            "space_name": r.space.name,
            "creator_name": r.user.full_name,
            "creator_email": r.user.email,
            "date": r.date,
            "start_time": r.start_time,
            "end_time": r.end_time,
            "reason": r.reason if show_reason else None,
            "visible_reason": show_reason,
        })

    return output


@app.post("/reservations")
def create_reservation(
    data: SpaceReservationCreate,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    user = get_user_from_token(cred.credentials, db)

    space = db.query(models.Space).filter(models.Space.id == data.space_id).first()
    if not space:
        raise HTTPException(404, "Espacio no encontrado")

    raw_start = (data.start_time or "").strip()
    raw_end = (data.end_time or "").strip()

    def parse_time(value):
        if value is None or str(value).strip() == "":
            return None
        t = str(value).strip()

        if len(t) == 4 and t[1] == ":":
            t = "0" + t
        if len(t) == 5 and t.count(":") == 1:
            t = t + ":00"

        from datetime import datetime
        try:
            return datetime.strptime(t, "%H:%M:%S").time()
        except ValueError:
            raise HTTPException(400, "Formato de time inválido, use HH:MM o HH:MM:SS")

    start_dt = parse_time(raw_start) or parse_time("00:00")
    end_dt = parse_time(raw_end) or parse_time("23:59")

    if start_dt >= end_dt:
        raise HTTPException(400, "start_time debe ser anterior a end_time")

    start_time = start_dt.strftime("%H:%M:%S")
    end_time = end_dt.strftime("%H:%M:%S")

    # Validar conflictos de reservas en el mismo espacio y fecha
    conflicting = db.query(models.SpaceReservation).filter(
        models.SpaceReservation.space_id == data.space_id,
        models.SpaceReservation.date == data.date
    ).all()

    # Helper function to check if two time ranges overlap
    def times_overlap(start1, end1, start2, end2):
        # Convert to datetime objects for comparison
        from datetime import datetime as dt
        s1 = dt.strptime(start1, "%H:%M:%S")
        e1 = dt.strptime(end1, "%H:%M:%S")
        s2 = dt.strptime(start2, "%H:%M:%S")
        e2 = dt.strptime(end2, "%H:%M:%S")
        return s1 < e2 and s2 < e1

    for existing in conflicting:
        if times_overlap(start_time, end_time, existing.start_time, existing.end_time):
            raise HTTPException(409, f"Conflicto: Ya existe una reserva en {existing.space.name} de {existing.start_time} a {existing.end_time} en esta fecha")

    # No forzar validación de colisiones en sprint inicial, se asume allowed.
    r = models.SpaceReservation(
        space_id=data.space_id,
        user_id=user.id,
        date=data.date,
        start_time=start_time,
        end_time=end_time,
        reason=data.reason,
    )
    db.add(r)
    db.commit()
    db.refresh(r)

    return {
        "id": r.id,
        "space_id": r.space_id,
        "date": r.date,
        "start_time": r.start_time,
        "end_time": r.end_time,
        "reason": r.reason,
    }


@app.delete("/reservations/{reservation_id}")
def delete_reservation(
    reservation_id: int,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    user = get_user_from_token(cred.credentials, db)

    r = db.query(models.SpaceReservation).filter(models.SpaceReservation.id == reservation_id).first()
    if not r:
        raise HTTPException(404, "Reserva no encontrada")

    # User own reservations, admin/superadmin of creator's domain, or superadmin
    if r.user_id == user.id:
        # Own reservation
        pass
    elif user.role == "superadmin":
        # Superadmin can delete any
        pass
    elif user.role == "admin":
        # Admin can only delete reservations from users in their domain
        creator_domain = _get_domain(r.user.email)
        if not _can_admin_manage_domain(user, creator_domain, db):
            raise HTTPException(403, "No puedes eliminar reservas de otro dominio")
    else:
        # Regular user can only delete their own
        raise HTTPException(403, "No autorizado")

    db.delete(r)
    db.commit()
    return {"ok": True}


@app.get("/admin/reservations")
def admin_list_reservations(
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    require_admin(admin)

    if not _is_feature_enabled(db, _get_domain(admin.email), "spaces", admin.role, set(_parse_group_tags(admin.group_tag)), unit_id=admin.org_unit_id):
        raise HTTPException(403, "Funcionalidad de espacios deshabilitada para tu dominio")

    all_items = db.query(models.SpaceReservation).join(models.Space).join(models.User).all()

    if admin.role == "superadmin":
        items = all_items
    else:
        admin_domain = _get_domain(admin.email)
        items = [r for r in all_items if _get_domain(r.user.email) == admin_domain]

    return [
        {
            "id": r.id,
            "space_id": r.space_id,
            "space_name": r.space.name,
            "user_id": r.user_id,
            "user_name": r.user.full_name,
            "user_email": r.user.email,
            "date": r.date,
            "start_time": r.start_time,
            "end_time": r.end_time,
            "reason": r.reason,
        }
        for r in items
    ]

@app.put("/auth/change-password")
def change_password(
    data: ChangePassword,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    user = get_user_from_token(cred.credentials, db)

    # Validar que las nuevas contrasenas coincidan
    if data.new_password != data.confirm_new_password:
        raise HTTPException(400, "Las nuevas contrasenias no coinciden")

    # Validar contrasena actual
    if not verify_password(data.current_password, user.hashed_password):
        raise HTTPException(400, "Contrasena actual incorrecta")

    # Validar que sea diferente
    if data.current_password == data.new_password:
        raise HTTPException(400, "La nueva contrasena debe ser diferente a la actual")

    # Validar longitud minima
    if len(data.new_password) < 6:
        raise HTTPException(400, "La nueva contrasena debe tener al menos 6 caracteres")

    # Actualizar contrasena
    user.hashed_password = hash_password(data.new_password)
    db.commit()

    return {"ok": True, "message": "Contrasena actualizada correctamente"}

@app.put("/events/{event_id}")
def edit_event(
    event_id: int,
    data: EventCreate,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    require_admin(admin)

    if not _is_feature_enabled(db, _get_domain(admin.email), "events", admin.role, set(_parse_group_tags(admin.group_tag)), unit_id=admin.org_unit_id):
        raise HTTPException(403, "Eventos deshabilitados para tu dominio")

    ev = db.query(Event).filter(Event.id == event_id).first()
    if not ev:
        raise HTTPException(404, "Evento no encontrado")

    _ensure_event_domain_access(admin, ev, db)

    # Solo creador o superadmin puede editar
    if admin.role != "superadmin" and ev.created_by != admin.id:
        raise HTTPException(403, "Solo el creador puede editar este evento")

    allowed_domain = data.allowed_domain.strip().lower() if data.allowed_domain else None
    if allowed_domain in ["todos", "all"]:
        allowed_domain = None

    visibility = (data.visibility or ev.visibility or "internal").strip().lower()
    if visibility not in ["public", "internal", "private"]:
        raise HTTPException(400, "visibility inválida: usa public, internal o private")

    # Misma regla que en la creación: "interno" sin colectivo explícito se
    # acota al dominio del admin que edita, nunca queda abierto a todos.
    if visibility == "internal" and not allowed_domain and admin.role != "superadmin":
        allowed_domain = _get_domain(admin.email)

    event_type = (data.event_type or ev.event_type or "participativo").strip().lower()
    if event_type not in ["informativo", "participativo", "disponibilidad"]:
        raise HTTPException(400, "event_type inválido: usa informativo, participativo o disponibilidad")

    was_public = (ev.visibility or "internal").strip().lower() == "public"

    # Organigrama: si se envía unidad/modo, revalidar; si no, conservar los actuales.
    if data.org_unit_id is not None or data.distribution_mode is not None:
        try:
            owning_unit_id = org_service.resolve_owning_unit(
                db, admin, data.org_unit_id if data.org_unit_id is not None else ev.org_unit_id
            )
            distribution_mode = org_service.validate_distribution(
                db, admin, owning_unit_id,
                data.distribution_mode or ev.distribution_mode or "unit_only",
                data.target_unit_ids,
            )
            ev.org_unit_id = owning_unit_id
            ev.distribution_mode = distribution_mode
            if distribution_mode == "custom" and data.target_unit_ids is not None:
                org_service.set_content_distribution_targets(db, "event", ev.id, data.target_unit_ids)
        except ValueError as exc:
            raise HTTPException(400, str(exc))

    ev.title = data.title
    ev.description = data.description
    ev.date = data.date
    ev.start_time = data.start_time
    ev.allowed_domain = allowed_domain
    ev.visibility = visibility
    ev.event_type = event_type
    ev.location = data.location or None
    ev.external_url = data.external_url or None
    if data.attachments is not None:
        ev.attachments = _clean_attachments(data.attachments)
    ev.metadata_json = json.dumps(data.metadata) if data.metadata else None
    ev.is_recurring = 1 if data.is_recurring else 0
    ev.recurrence_rule = data.recurrence_rule or None
    ev.updated_at = datetime.utcnow().isoformat()
    db.commit()
    db.refresh(ev)

    # Si el evento pasa a ser público por primera vez, avisamos a los guests
    # suscritos (igual que en la creación); si ya era público no repetimos
    # el aviso en cada edición menor para no saturar a nadie.
    if visibility == "public" and not was_public:
        try:
            _notify_guest_tokens_for_event(
                db,
                ev,
                f"Nuevo evento público: {ev.title}",
                f"Publicado para {ev.date}" + (f" · {ev.start_time}" if ev.start_time else ""),
            )
        except Exception as exc:
            print(f"⚠️ No se pudo notificar a invitados tras editar evento: {exc}")

    return {
        "id": ev.id,
        "title": ev.title,
        "description": ev.description,
        "date": ev.date,
        "start_time": ev.start_time,
        "allowed_domain": ev.allowed_domain,
        "visibility": ev.visibility,
        "event_type": ev.event_type,
        "location": ev.location,
        "external_url": ev.external_url,
        "metadata": json.loads(ev.metadata_json) if ev.metadata_json else None,
        "is_recurring": bool(ev.is_recurring),
        "recurrence_rule": ev.recurrence_rule,
        "org_unit_id": ev.org_unit_id,
        "distribution_mode": ev.distribution_mode,
        "created_by": ev.created_by,
    }




# =========================================================





# =========================================================
# PLANIFICADOR EN SEGUNDO PLANO (limpieza de datos caducados)
# =========================================================
# Hilo daemon minimalista: solo ejecuta la limpieza de eventos y
# disponibilidades expiradas, sin ninguna conexion externa.
# Intervalo: 900 s (15 min). Respeta el throttle interno de
# maybe_cleanup_expired_data (minimo 10 min entre limpiezas reales).
_scheduler_started = False


def _cleanup_loop(interval_seconds=900):
    stop = threading.Event()
    while not stop.wait(interval_seconds):
        db = SessionLocal()
        try:
            maybe_cleanup_expired_data(db)
        except Exception:
            logger.exception("Error en el planificador de limpieza")
        finally:
            db.close()


def _start_cleanup_scheduler():
    global _scheduler_started
    if _scheduler_started:
        return
    if os.getenv("ENABLE_CLEANUP_SCHEDULER", "1").strip() not in ("1", "true", "True"):
        logger.info("Planificador de limpieza deshabilitado por entorno")
        return
    _scheduler_started = True
    threading.Thread(target=_cleanup_loop, daemon=True).start()
    logger.info("Planificador de limpieza iniciado")


_start_cleanup_scheduler()


# =========================================================

