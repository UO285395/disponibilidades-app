from fastapi import FastAPI, Depends, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import func, inspect, text
from jose import jwt, JWTError
from passlib.context import CryptContext
from datetime import datetime, timedelta

import base64
import csv
import io
import importlib
import json
import os
import secrets
import socket
import smtplib
import threading
import urllib.error
import urllib.request
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders

import models
from models import User, Availability, Event, EventResponse, EventCompanion, CensusConfig, CensusField
from database import SessionLocal, engine


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

        if "domain_policies" in table_names:
            policy_columns = {column["name"] for column in inspector.get_columns("domain_policies")}
            with engine.begin() as conn:
                if "users_enabled" not in policy_columns:
                    conn.execute(text("ALTER TABLE domain_policies ADD COLUMN users_enabled INTEGER DEFAULT 1"))
                    print("✅ Columna domain_policies.users_enabled añadida para compatibilidad")
                if "domain_policies_enabled" not in policy_columns:
                    conn.execute(text("ALTER TABLE domain_policies ADD COLUMN domain_policies_enabled INTEGER DEFAULT 0"))
                    print("✅ Columna domain_policies.domain_policies_enabled añadida para compatibilidad")
    except Exception as exc:
        print(f"⚠️ No se pudo verificar compatibilidad de esquema: {exc}")


ensure_legacy_schema_compatibility()


# =========================================================
# CONFIG JWT
# =========================================================
SECRET_KEY = "MI_CLAVE_SECRETA_SUPER_LARGA_123456"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 días

auth_scheme = HTTPBearer(auto_error=False)
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


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


def require_admin(user: User):
    if user.role not in ["admin", "superadmin"]:
        raise HTTPException(403, "No autorizado")


def require_superadmin(user: User):
    if user.role != "superadmin":
        raise HTTPException(403, "Solo superadmin")


# =========================================================
# LIMPIEZA AUTOMÁTICA CENTRALIZADA
# =========================================================
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

        db.query(Event)\
          .filter(Event.id.in_(expired_event_ids))\
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

class Login(BaseModel):
    email: str
    password: str

class AvailabilityCreate(BaseModel):
    date: str
    start_time: str
    end_time: str

class EventCreate(BaseModel):
    title: str
    description: str | None
    date: str
    start_time: str | None
    allowed_domain: str | None

class EventResponseCreate(BaseModel):
    answer: str
    justification: str | None


class EventCompanionUpdate(BaseModel):
    count: int

class CensusFieldCreate(BaseModel):
    label: str
    field_type: str = "text"
    required: bool = True
    order_index: int = 0
    options: list[str] | None = None

class CensusConfigCreate(BaseModel):
    email_to: str
    fields: list[CensusFieldCreate]


class CensusTestEmailRequest(BaseModel):
    email_to: str | None = None

class DomainPolicyCreate(BaseModel):
    domain: str
    events_enabled: bool = True
    availabilities_enabled: bool = True
    spaces_enabled: bool = True
    users_enabled: bool = True
    domain_policies_enabled: bool = False

class SpaceCreate(BaseModel):
    name: str
    description: str | None

class SpaceReservationCreate(BaseModel):
    space_id: int
    date: str
    start_time: str | None
    end_time: str | None
    reason: str | None


# =========================================================
# AUTH
# =========================================================
@app.post("/register")
def register(data: Register, db: Session = Depends(get_db)):
    raise HTTPException(403, "Registro público deshabilitado. Un administrador debe crear el usuario.")


@app.post("/login")
def login(data: Login, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(400, "Credenciales incorrectas")

    token = create_token({"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer"}


@app.get("/me")
def me(
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    user = get_user_from_token(cred.credentials, db)
    domain = user.email.split("@")[-1].lower() if "@" in user.email else ""

    policy = _get_domain_policy(db, domain)
    events_enabled = True
    availabilities_enabled = True
    spaces_enabled = True
    users_enabled = True
    domain_policies_enabled = False

    if user.role != "superadmin" and policy:
        events_enabled = bool(policy.events_enabled)
        availabilities_enabled = bool(policy.availabilities_enabled)
        spaces_enabled = bool(policy.spaces_enabled)
        users_enabled = bool(policy.users_enabled)
        domain_policies_enabled = bool(policy.domain_policies_enabled)

    if user.role == "superadmin":
        users_enabled = True
        domain_policies_enabled = True

    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "domain": domain,
        "events_enabled": events_enabled,
        "availabilities_enabled": availabilities_enabled,
        "spaces_enabled": spaces_enabled,
        "users_enabled": users_enabled,
        "domain_policies_enabled": domain_policies_enabled,
    }

@app.post("/admin/become_admin")
def become_admin(
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    user = get_user_from_token(cred.credentials, db)

    user.role = "admin"
    db.commit()

    return {"ok": True}


@app.post("/admin/become_superadmin")
def become_superadmin(
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    user = get_user_from_token(cred.credentials, db)

    user.role = "superadmin"
    db.commit()

    return {"ok": True}


@app.get("/admin/users")
def admin_list_users(
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    require_admin(admin)

    if not _is_feature_enabled(db, _get_domain(admin.email), "users", admin.role):
        raise HTTPException(403, "Gestión de usuarios deshabilitada para tu dominio")

    users = db.query(User).order_by(func.lower(User.email)).all()

    return [
        {
            "id": u.id,
            "full_name": u.full_name,
            "email": u.email,
            "role": u.role
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

    if not _is_feature_enabled(db, _get_domain(admin.email), "users", admin.role):
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

    if admin.role != "superadmin":
        admin_domain = _get_domain(admin.email)
        target_domain = _get_domain(email)
        if admin_domain != target_domain:
            raise HTTPException(403, "Solo puedes crear usuarios de tu dominio")

    user = User(
        email=email,
        full_name=full_name,
        hashed_password=hash_password(password),
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
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

    if not _is_feature_enabled(db, _get_domain(admin.email), "users", admin.role):
        raise HTTPException(403, "Gestión de usuarios deshabilitada para tu dominio")

    if admin.id == user_id:
        raise HTTPException(400, "No puedes quitarte el rol a ti mismo")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")

    if user.role == "superadmin" and admin.role != "superadmin":
        raise HTTPException(403, "No autorizado para modificar superadmin")

    if admin.role != "superadmin" and not _same_domain_or_superadmin(admin, user):
        raise HTTPException(403, "No puedes administrar usuarios de otro dominio")

    user.role = "user"
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

    if not _is_feature_enabled(db, _get_domain(admin.email), "users", admin.role):
        raise HTTPException(403, "Gestión de usuarios deshabilitada para tu dominio")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")

    if user.role == "superadmin" and admin.role != "superadmin":
        raise HTTPException(403, "No autorizado para modificar superadmin")

    if admin.role != "superadmin" and not _same_domain_or_superadmin(admin, user):
        raise HTTPException(403, "No puedes administrar usuarios de otro dominio")

    user.role = "admin"
    db.commit()

    return {"ok": True}


@app.get("/admin/domain-policies")
def admin_list_domain_policies(
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    require_superadmin(admin)

    return [
        {
            "id": p.id,
            "domain": p.domain,
            "events_enabled": bool(p.events_enabled),
            "availabilities_enabled": bool(p.availabilities_enabled),
            "spaces_enabled": bool(p.spaces_enabled),
            "users_enabled": bool(p.users_enabled),
            "domain_policies_enabled": bool(p.domain_policies_enabled),
        }
        for p in db.query(models.DomainPolicy).all()
    ]


@app.post("/admin/domain-policies")
def create_domain_policy(
    data: DomainPolicyCreate,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    require_superadmin(admin)

    domain = data.domain.strip().lower()
    if not domain:
        raise HTTPException(400, "Dominio inválido")

    if db.query(models.DomainPolicy).filter(models.DomainPolicy.domain == domain).first():
        raise HTTPException(400, "Política ya existe")

    policy = models.DomainPolicy(
        domain=domain,
        events_enabled=1 if data.events_enabled else 0,
        availabilities_enabled=1 if data.availabilities_enabled else 0,
        spaces_enabled=1 if data.spaces_enabled else 0,
        users_enabled=1 if data.users_enabled else 0,
        domain_policies_enabled=1 if data.domain_policies_enabled else 0,
    )
    db.add(policy)
    db.commit()
    db.refresh(policy)

    return {
        "id": policy.id,
        "domain": policy.domain,
        "events_enabled": bool(policy.events_enabled),
        "availabilities_enabled": bool(policy.availabilities_enabled),
        "spaces_enabled": bool(policy.spaces_enabled),
        "users_enabled": bool(policy.users_enabled),
        "domain_policies_enabled": bool(policy.domain_policies_enabled),
    }


@app.put("/admin/domain-policies/{policy_id}")
def update_domain_policy(
    policy_id: int,
    data: DomainPolicyCreate,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    require_superadmin(admin)

    policy = db.query(models.DomainPolicy).filter(models.DomainPolicy.id == policy_id).first()
    if not policy:
        raise HTTPException(404, "Política no encontrada")

    domain = data.domain.strip().lower()
    if not domain:
        raise HTTPException(400, "Dominio inválido")

    if policy.domain != domain and db.query(models.DomainPolicy).filter(models.DomainPolicy.domain == domain).first():
        raise HTTPException(400, "Política con ese dominio ya existe")

    policy.domain = domain
    policy.events_enabled = 1 if data.events_enabled else 0
    policy.availabilities_enabled = 1 if data.availabilities_enabled else 0
    policy.spaces_enabled = 1 if data.spaces_enabled else 0
    policy.users_enabled = 1 if data.users_enabled else 0
    policy.domain_policies_enabled = 1 if data.domain_policies_enabled else 0
    db.commit()

    return {
        "id": policy.id,
        "domain": policy.domain,
        "events_enabled": bool(policy.events_enabled),
        "availabilities_enabled": bool(policy.availabilities_enabled),
        "spaces_enabled": bool(policy.spaces_enabled),
        "users_enabled": bool(policy.users_enabled),
        "domain_policies_enabled": bool(policy.domain_policies_enabled),
    }


@app.delete("/admin/domain-policies/{policy_id}")
def delete_domain_policy(
    policy_id: int,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    require_superadmin(admin)

    policy = db.query(models.DomainPolicy).filter(models.DomainPolicy.id == policy_id).first()
    if not policy:
        raise HTTPException(404, "Política no encontrada")

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

    if not _is_feature_enabled(db, _get_domain(admin.email), "events", admin.role):
        raise HTTPException(403, "Eventos deshabilitados para tu dominio")

    allowed_domain = data.allowed_domain.strip().lower() if data.allowed_domain else None
    if allowed_domain in ["todos", "all"]:
        allowed_domain = None

    ev = Event(
        title=data.title,
        description=data.description,
        date=data.date,
        start_time=data.start_time,
        allowed_domain=allowed_domain,
        created_by=admin.id
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return {
        "id": ev.id,
        "title": ev.title,
        "description": ev.description,
        "date": ev.date,
        "start_time": ev.start_time,
        "allowed_domain": ev.allowed_domain,
        "created_by": ev.created_by,
    }


@app.get("/events")
def list_events(
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

    if user and not _is_feature_enabled(db, user_domain, "events", user.role):
        raise HTTPException(403, "Eventos deshabilitados para tu dominio")

    events = db.query(Event).all()

    filtered = []

    for e in events:
        if e.allowed_domain:
            if user is None:
                continue

            event_domain = e.allowed_domain.strip().lower()
            if user.role != "superadmin" and event_domain != user_domain:
                continue

        # Si el usuario es admin de dominio limpio, mantiene la misma lógica (superadmin no filtra).
        if user and user.role == "admin":
            if e.allowed_domain:
                event_domain = e.allowed_domain.strip().lower()
                if event_domain != user_domain:
                    continue

        filtered.append(e)

    result = []
    for e in filtered:
        yes_count = (
            db.query(EventResponse)
            .filter(
                EventResponse.event_id == e.id,
                func.lower(EventResponse.answer).in_(["yes", "si"]),
            )
            .count()
        )

        no_count = (
            db.query(EventResponse)
            .filter(
                EventResponse.event_id == e.id,
                func.lower(EventResponse.answer) == "no",
            )
            .count()
        )

        companions_total = (
            db.query(func.coalesce(func.sum(EventCompanion.count), 0))
            .filter(EventCompanion.event_id == e.id)
            .scalar()
        ) or 0

        attendees_total = yes_count + companions_total

        result.append(
            {
                "id": e.id,
                "title": e.title,
                "description": e.description,
                "date": e.date,
                "start_time": e.start_time,
                # `Event` no tiene `end_time` en el modelo actual; mantenemos el campo para compatibilidad.
                "end_time": None,
                "allowed_domain": e.allowed_domain,
                "yes_count": yes_count,
                "no_count": no_count,
                "companions_total": companions_total,
                "attendees_total": attendees_total,
            }
        )

    return result


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

    _ensure_event_domain_access(admin, ev)

    return {
        "id": ev.id,
        "title": ev.title,
        "description": ev.description,
        "date": ev.date,
        "start_time": ev.start_time,
        # `Event` no tiene `end_time` en el modelo actual; mantenemos el campo para compatibilidad.
        "end_time": None
    }


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

    _ensure_event_domain_access(user, ev)

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

        if user.role == "superadmin":
            pass
        elif user.role == "admin":
            if responder_domain != user_domain:
                continue
        else:
            if responder_domain != user_domain:
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


@app.post("/events/{event_id}/responses")
def respond_event(
    event_id: int,
    data: EventResponseCreate,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    user = get_user_from_token(cred.credentials, db)

    existing = (
        db.query(EventResponse)
        .filter(
            EventResponse.event_id == event_id,
            EventResponse.user_id == user.id
        )
        .first()
    )

    if existing:
        raise HTTPException(400, "Ya has votado en este evento")

    raw_answer = str(data.answer).strip().lower()
    if raw_answer in ["si", "sí", "yes"]:
        normalized_answer = "si"
    elif raw_answer == "no":
        normalized_answer = "no"
    else:
        raise HTTPException(400, "answer inválida (usa 'si' o 'no')")

    db.add(EventResponse(
        event_id=event_id,
        user_id=user.id,
        answer=normalized_answer,
        justification=data.justification
    ))
    db.commit()

    return {"ok": True}


@app.get("/my-event-responses")
def my_event_responses(
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    user = get_user_from_token(cred.credentials, db)

    return [
        r.event_id
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

    _ensure_event_domain_access(user, event)

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

    db.commit()

    return {"ok": True, "event_id": event_id, "count": int(item.count)}

@app.delete("/events/{event_id}")
def delete_event(
    event_id: int,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    require_admin(admin)

    ev = db.query(Event).filter(Event.id == event_id).first()
    if not ev:
        raise HTTPException(404, "Evento no encontrado")

    _ensure_event_domain_access(admin, ev)

    # borrar primero respuestas asociadas
    db.query(EventCompanion)\
            .filter(EventCompanion.event_id == event_id)\
            .delete(synchronize_session=False)

    db.query(EventResponse)\
      .filter(EventResponse.event_id == event_id)\
      .delete(synchronize_session=False)

    db.delete(ev)
    db.commit()

    return {"ok": True}


# =========================================================
# DISPONIBILIDADES
# =========================================================
@app.get("/availability/my")
def get_my_availability(
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    user = get_user_from_token(cred.credentials, db)
    if not _is_feature_enabled(db, _get_domain(user.email), "availabilities", user.role):
        raise HTTPException(403, "Disponibilidades deshabilitadas para tu dominio")
    return db.query(Availability).filter(Availability.user_id == user.id).all()


@app.post("/availability/my")
def create_my_availability(
    data: AvailabilityCreate,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    user = get_user_from_token(cred.credentials, db)
    if not _is_feature_enabled(db, _get_domain(user.email), "availabilities", user.role):
        raise HTTPException(403, "Disponibilidades deshabilitadas para tu dominio")

    today = datetime.utcnow().date()
    availability_date = datetime.strptime(data.date, "%Y-%m-%d").date()
    if availability_date < today:
        raise HTTPException(410, "No puedes votar disponibilidades en días pasados")

    a = Availability(
        user_id=user.id,
        date=data.date,
        start_time=data.start_time,
        end_time=data.end_time
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


@app.delete("/availability/my/{avail_id}")
def delete_availability(
    avail_id: int,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    user = get_user_from_token(cred.credentials, db)

    a = db.query(Availability)\
          .filter(Availability.id == avail_id,
                  Availability.user_id == user.id)\
          .first()

    if not a:
        raise HTTPException(404, "No encontrado")

    db.delete(a)
    db.commit()
    return {"ok": True}


@app.get("/admin/availability")
def admin_all_availability(
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    require_admin(admin)

    if not _is_feature_enabled(db, _get_domain(admin.email), "availabilities", admin.role):
        raise HTTPException(403, "Disponibilidades deshabilitadas para tu dominio")

    cleanup_expired_data(db)

    limit = (datetime.utcnow().date() - timedelta(days=14)).strftime("%Y-%m-%d")

    db.query(Availability)\
      .filter(Availability.date < limit)\
      .delete(synchronize_session=False)

    db.commit()

    items = db.query(Availability).all()

    return [
        {
            "id": a.id,
            "user": a.user.full_name,
            "email": a.user.email,
            "date": a.date,
            "start_time": a.start_time,
            "end_time": a.end_time,
        }
        for a in items
    ]


# =========================================================
# CENSO
# =========================================================

def _census_config_to_dict(config: CensusConfig) -> dict:
    return {
        "id": config.id,
        "email_to": config.email_to,
        "url_token": config.url_token,
        "fields": [
            {
                "id": f.id,
                "label": f.label,
                "field_type": f.field_type,
                "required": bool(f.required),
                "order_index": f.order_index,
                "options": json.loads(f.options) if f.options else [],
            }
            for f in config.fields
        ],
    }


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        value = os.getenv(name.lower())
    if value is None:
        return default
    return value.strip().lower() in ["1", "true", "yes", "on"]


def _env_str(name: str, default: str = "") -> str:
    value = os.getenv(name)
    if value is None:
        value = os.getenv(name.lower())
    if value is None:
        return default
    return str(value).strip()


def _smtp_resolve_debug(host: str, port: int):
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        debug = []
        for info in infos:
            family, _, _, _, sockaddr = info
            family_name = "IPv6" if family == socket.AF_INET6 else "IPv4" if family == socket.AF_INET else str(family)
            debug.append({
                "family": family_name,
                "address": sockaddr[0],
                "port": sockaddr[1],
            })
        return debug
    except Exception as exc:
        return [{"resolution_error": str(exc)}]


def _with_forced_ipv4_resolution(callback):
    original_getaddrinfo = socket.getaddrinfo

    def ipv4_only_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
        return original_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)

    socket.getaddrinfo = ipv4_only_getaddrinfo
    try:
        return callback()
    finally:
        socket.getaddrinfo = original_getaddrinfo


def _smtp_attempt_send(smtp_host: str, smtp_port: int, smtp_user: str, smtp_password: str, msg, use_ssl: bool, use_tls: bool):
    if use_ssl:
        print(f"ℹ️ Conectando por SMTP_SSL a {smtp_host}:{smtp_port}")
        with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=15) as server:
            print("ℹ️ SMTP login iniciado (SSL)")
            server.login(smtp_user, smtp_password)
            print("ℹ️ SMTP login correcto (SSL), enviando mensaje")
            server.send_message(msg)
        return

    print(f"ℹ️ Conectando por SMTP a {smtp_host}:{smtp_port}")
    with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
        server.ehlo()
        if use_tls:
            print("ℹ️ Iniciando STARTTLS")
            server.starttls()
            server.ehlo()
        print("ℹ️ SMTP login iniciado")
        server.login(smtp_user, smtp_password)
        print("ℹ️ SMTP login correcto, enviando mensaje")
        server.send_message(msg)


def _send_census_email_via_resend(email_to: str, csv_content: str):
    resend_api_key = _env_str("RESEND_API_KEY", "")
    resend_from = _env_str("RESEND_FROM", _env_str("SMTP_FROM", ""))
    resend_api_url = _env_str("RESEND_API_URL", "https://api.resend.com/emails")

    print(
        "ℹ️ RESEND config census:",
        {
            "api_url": resend_api_url or "<empty>",
            "from": resend_from or "<empty>",
            "has_api_key": bool(resend_api_key),
            "email_to": email_to,
        },
    )

    if not resend_api_key or not resend_from:
        msg = "Resend no configurado completamente (API_KEY/FROM)."
        print(f"⚠️ {msg}")
        return False, msg

    attachment_b64 = base64.b64encode(csv_content.encode("utf-8")).decode("ascii")

    resend_module = None
    try:
        resend_module = importlib.import_module("resend")
    except Exception:
        resend_module = None

    if resend_module is not None:
        try:
            resend_module.api_key = resend_api_key
            payload = {
                "from": resend_from,
                "to": [email_to],
                "subject": "Nueva respuesta de censo",
                "html": "<p>Adjunto se incluye una nueva respuesta del formulario de censo.</p>",
                "attachments": [
                    {
                        "filename": "respuesta_censo.csv",
                        "content": attachment_b64,
                    }
                ],
            }

            response = resend_module.Emails.send(payload)
            print(
                "✅ Email de censo enviado por Resend SDK",
                {
                    "response": str(response)[:500],
                },
            )
            return True, "ok"
        except Exception as exc:
            print(f"⚠️ Resend SDK falló, usando fallback HTTP: {exc}")

    payload = {
        "from": resend_from,
        "to": [email_to],
        "subject": "Nueva respuesta de censo",
        "text": "Adjunto se incluye una nueva respuesta del formulario de censo.",
        "attachments": [
            {
                "filename": "respuesta_censo.csv",
                "content": attachment_b64,
            }
        ],
    }

    request = urllib.request.Request(
        resend_api_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {resend_api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw_body = response.read().decode("utf-8", errors="replace")
            print(
                "✅ Email de censo enviado por Resend",
                {
                    "status": response.status,
                    "body": raw_body[:500] if raw_body else "<empty>",
                },
            )
            return True, "ok"
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        error = f"Error enviando email por Resend: HTTP {exc.code} - {error_body}"
        print(f"⚠️ {error}")
        return False, error
    except Exception as exc:
        error = f"Error enviando email por Resend: {exc}"
        print(f"⚠️ {error}")
        return False, error


def _send_census_email_via_smtp(email_to: str, csv_content: str):
    smtp_host = _env_str("SMTP_HOST", "")
    smtp_port_raw = _env_str("SMTP_PORT", "587")
    smtp_user = _env_str("SMTP_USER", "")
    smtp_password = _env_str("SMTP_PASSWORD", "")
    smtp_from = _env_str("SMTP_FROM", smtp_user)
    smtp_use_ssl = _env_bool("SMTP_USE_SSL", False)
    smtp_use_tls = _env_bool("SMTP_USE_TLS", True)
    smtp_force_ipv4 = _env_bool("SMTP_FORCE_IPV4", True)

    try:
        smtp_port = int(smtp_port_raw)
    except ValueError:
        msg = f"SMTP_PORT inválido: {smtp_port_raw}"
        print(f"⚠️ {msg}")
        return False, msg

    if smtp_use_ssl and smtp_use_tls:
        print("ℹ️ SMTP_USE_SSL y SMTP_USE_TLS activos a la vez; se prioriza SSL y se desactiva TLS.")
        smtp_use_tls = False

    print(
        "ℹ️ SMTP config census:",
        {
            "host": smtp_host or "<empty>",
            "port": smtp_port,
            "use_ssl": smtp_use_ssl,
            "use_tls": smtp_use_tls,
            "force_ipv4": smtp_force_ipv4,
            "from": smtp_from or "<empty>",
            "has_user": bool(smtp_user),
            "has_password": bool(smtp_password),
            "email_to": email_to,
        },
    )
    print("ℹ️ SMTP resolved addresses:", _smtp_resolve_debug(smtp_host, smtp_port))

    if not smtp_host or not smtp_user or not smtp_password:
        msg = "SMTP no configurado completamente (HOST/USER/PASSWORD)."
        print(f"⚠️ {msg} CSV no enviado a {email_to}.")
        return False, msg

    msg = MIMEMultipart()
    msg["From"] = smtp_from
    msg["To"] = email_to
    msg["Subject"] = "Nueva respuesta de censo"
    msg.attach(MIMEText("Adjunto se incluye una nueva respuesta del formulario de censo.", "plain"))

    attachment = MIMEBase("application", "octet-stream")
    attachment.set_payload(csv_content.encode("utf-8"))
    encoders.encode_base64(attachment)
    attachment.add_header(
        "Content-Disposition", "attachment", filename="respuesta_censo.csv"
    )
    msg.attach(attachment)

    attempts = [
        {
            "port": smtp_port,
            "use_ssl": smtp_use_ssl,
            "use_tls": smtp_use_tls,
            "label": "configured",
        }
    ]

    is_gmail = smtp_host.strip().lower() in {"smtp.gmail.com", "smtp.googlemail.com"}
    if is_gmail:
        if smtp_port != 465 or not smtp_use_ssl:
            attempts.append({"port": 465, "use_ssl": True, "use_tls": False, "label": "gmail-ssl-fallback"})
        if smtp_port != 587 or smtp_use_ssl or not smtp_use_tls:
            attempts.append({"port": 587, "use_ssl": False, "use_tls": True, "label": "gmail-starttls-fallback"})

    last_error = None
    for attempt in attempts:
        print("ℹ️ SMTP attempt:", attempt)

        def do_send():
            _smtp_attempt_send(
                smtp_host=smtp_host,
                smtp_port=attempt["port"],
                smtp_user=smtp_user,
                smtp_password=smtp_password,
                msg=msg,
                use_ssl=attempt["use_ssl"],
                use_tls=attempt["use_tls"],
            )

        try:
            if smtp_force_ipv4:
                _with_forced_ipv4_resolution(do_send)
            else:
                do_send()

            print(f"✅ Email de censo enviado a {email_to}")
            return True, "ok"
        except Exception as e:
            last_error = e
            print(f"⚠️ SMTP attempt failed ({attempt['label']}): {e}")

            error_text = str(e).lower()
            if "timed out" not in error_text and "network is unreachable" not in error_text:
                break

    error = f"Error enviando email de censo: {last_error}"
    print(f"⚠️ {error}")
    return False, error


def _send_census_email(email_to: str, csv_content: str):
    provider = _env_str("CENSUS_EMAIL_PROVIDER", "").strip().lower()
    resend_api_key = _env_str("RESEND_API_KEY", "")

    if provider in {"resend", "http", "api"}:
        print("ℹ️ Censo email transport seleccionado: resend")
        return _send_census_email_via_resend(email_to, csv_content)

    if provider == "smtp":
        print("ℹ️ Censo email transport seleccionado: smtp")
        return _send_census_email_via_smtp(email_to, csv_content)

    if resend_api_key:
        print("ℹ️ Censo email transport autodetectado: resend")
        return _send_census_email_via_resend(email_to, csv_content)

    print("ℹ️ Censo email transport por defecto: smtp")
    return _send_census_email_via_smtp(email_to, csv_content)


def _send_census_email_async(email_to: str, csv_content: str):
    ok, msg = _send_census_email(email_to, csv_content)
    if not ok:
        print(f"⚠️ Envío async fallido: {msg}")


@app.get("/admin/census")
def get_census_config(
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    if not cred or not cred.credentials:
        raise HTTPException(401, "Token inválido")

    admin = get_user_from_token(cred.credentials, db)
    require_superadmin(admin)

    config = db.query(CensusConfig).first()
    if not config:
        return None
    return _census_config_to_dict(config)


@app.put("/admin/census")
def upsert_census_config(
    data: CensusConfigCreate,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    if not cred or not cred.credentials:
        raise HTTPException(401, "Token inválido")

    admin = get_user_from_token(cred.credentials, db)
    require_superadmin(admin)

    existing = db.query(CensusConfig).first()
    token = existing.url_token if existing else secrets.token_urlsafe(16)

    if existing:
        db.delete(existing)
        db.commit()

    config = CensusConfig(email_to=data.email_to, url_token=token)
    db.add(config)
    db.flush()

    for i, f in enumerate(data.fields):
        db.add(CensusField(
            config_id=config.id,
            label=f.label,
            field_type=f.field_type,
            required=1 if f.required else 0,
            order_index=f.order_index if f.order_index is not None else i,
            options=json.dumps(f.options) if f.options else None,
        ))

    db.commit()
    db.refresh(config)
    return _census_config_to_dict(config)


@app.post("/admin/census/regenerate-token")
def regenerate_census_token(
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    if not cred or not cred.credentials:
        raise HTTPException(401, "Token inválido")

    admin = get_user_from_token(cred.credentials, db)
    require_superadmin(admin)

    config = db.query(CensusConfig).first()
    if not config:
        raise HTTPException(404, "No hay configuración de censo")

    config.url_token = secrets.token_urlsafe(16)
    db.commit()
    return {"url_token": config.url_token}


@app.post("/admin/census/test-email")
def test_census_email(
    data: CensusTestEmailRequest | None = Body(default=None),
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    if not cred or not cred.credentials:
        raise HTTPException(401, "Token inválido")

    admin = get_user_from_token(cred.credentials, db)
    require_superadmin(admin)

    config = db.query(CensusConfig).first()
    if not config:
        raise HTTPException(404, "No hay configuración de censo")

    target_email = (data.email_to.strip() if data and data.email_to else config.email_to.strip())
    if not target_email:
        raise HTTPException(400, "Email destino obligatorio")

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Prueba", "Fecha"])
    writer.writerow(["Test SMTP", datetime.utcnow().isoformat()])

    ok, message = _send_census_email(target_email, output.getvalue())
    if not ok:
        raise HTTPException(500, message)

    return {"ok": True, "message": "Email de prueba enviado", "email_to": target_email}


@app.get("/censo/{token}/fields")
def get_census_fields(token: str, db: Session = Depends(get_db)):
    config = db.query(CensusConfig).filter(CensusConfig.url_token == token).first()
    if not config:
        raise HTTPException(404, "Formulario no encontrado")

    return {
        "fields": [
            {
                "id": f.id,
                "label": f.label,
                "field_type": f.field_type,
                "required": bool(f.required),
                "order_index": f.order_index,
                "options": json.loads(f.options) if f.options else [],
            }
            for f in config.fields
        ]
    }


@app.post("/censo/{token}")
def submit_census(
    token: str,
    data: dict = Body(...),
    db: Session = Depends(get_db)
):
    config = db.query(CensusConfig).filter(CensusConfig.url_token == token).first()
    if not config:
        raise HTTPException(404, "Formulario no encontrado")

    output = io.StringIO()
    writer = csv.writer(output)
    fields_sorted = sorted(config.fields, key=lambda f: f.order_index)
    writer.writerow([f.label for f in fields_sorted])
    writer.writerow([str(data.get(str(f.id), "")) for f in fields_sorted])

    # El envío de email se ejecuta en background para no bloquear la respuesta HTTP.
    threading.Thread(
        target=_send_census_email_async,
        args=(config.email_to, output.getvalue()),
        daemon=True,
    ).start()
    return {"ok": True}


# =========================================================
# ESPACIOS Y RESERVAS
# =========================================================

def _get_domain(email: str):
    if not email or "@" not in email:
        return ""
    return email.split("@")[-1].strip().lower()


def _get_domain_policy(db: Session, domain: str):
    if not domain:
        return None
    return db.query(models.DomainPolicy).filter(models.DomainPolicy.domain == domain).first()


def _is_feature_enabled(db: Session, domain: str, feature: str, role: str = "user"):
    if role == "superadmin":
        return True

    policy = _get_domain_policy(db, domain)
    if not policy:
        return True
    if feature == "events":
        return bool(policy.events_enabled)
    if feature == "availabilities":
        return bool(policy.availabilities_enabled)
    if feature == "spaces":
        return bool(policy.spaces_enabled)
    if feature == "users":
        return bool(policy.users_enabled)
    if feature == "domain_policies":
        return bool(policy.domain_policies_enabled)
    return True


def _same_domain_or_superadmin(user: User, target_user: User):
    if user.role == "superadmin":
        return True
    if not user.email or not target_user.email:
        return False
    return _get_domain(user.email) == _get_domain(target_user.email)


def _ensure_event_domain_access(user: User, event: Event):
    if user.role == "superadmin":
        return

    if event.allowed_domain:
        event_domain = event.allowed_domain.strip().lower()
        user_domain = _get_domain(user.email)
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

    if user and not _is_feature_enabled(db, _get_domain(user.email), "spaces", user.role):
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

    if not _is_feature_enabled(db, _get_domain(admin.email), "spaces", admin.role):
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

    if not _is_feature_enabled(db, _get_domain(admin.email), "spaces", admin.role):
        raise HTTPException(403, "Funcionalidad de espacios deshabilitada para tu dominio")

    s = db.query(models.Space).filter(models.Space.id == space_id).first()
    if not s:
        raise HTTPException(404, "Espacio no encontrado")

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

    if not _is_feature_enabled(db, user_domain, "spaces", user.role):
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

    if user.role not in ["admin", "superadmin"] and r.user_id != user.id:
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

    if not _is_feature_enabled(db, _get_domain(admin.email), "spaces", admin.role):
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
