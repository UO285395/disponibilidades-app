from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from jose import jwt, JWTError
from passlib.context import CryptContext
from datetime import datetime, timedelta

import models
from models import User, Availability, Event, EventResponse
from database import SessionLocal, engine


# =========================================================
# CREAR TABLAS
# =========================================================
print("🔧 Migrando esquema...")
models.Base.metadata.create_all(bind=engine)


# =========================================================
# CONFIG JWT
# =========================================================
SECRET_KEY = "MI_CLAVE_SECRETA_SUPER_LARGA_123456"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 días

auth_scheme = HTTPBearer()
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


def get_user_from_token(token: str, db: Session):
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
    end_time: str | None

class EventResponseCreate(BaseModel):
    answer: str
    justification: str | None


# =========================================================
# AUTH
# =========================================================
@app.post("/register")
def register(data: Register, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(400, "Email ya registrado")

    db.add(User(
        email=data.email,
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
        role="user"
    ))
    db.commit()
    return {"ok": True}


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
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role
    }


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
    if admin.role != "admin":
        raise HTTPException(403, "Solo admin")

    ev = Event(
        title=data.title,
        description=data.description,
        date=data.date,
        start_time=data.start_time,
        end_time=data.end_time,
        created_by=admin.id
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


@app.get("/events")
def list_events(db: Session = Depends(get_db)):
    cleanup_expired_data(db)

    return [
        {
            "id": e.id,
            "title": e.title,
            "description": e.description,
            "date": e.date,
            "start_time": e.start_time,
            "end_time": e.end_time,
        }
        for e in db.query(Event).all()
    ]


@app.get("/events/{event_id}")
def get_event(
    event_id: int,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    if admin.role != "admin":
        raise HTTPException(403, "No autorizado")

    cleanup_expired_data(db)

    ev = db.query(Event).filter(Event.id == event_id).first()
    if not ev:
        raise HTTPException(404, "Evento no encontrado")

    return {
        "id": ev.id,
        "title": ev.title,
        "description": ev.description,
        "date": ev.date,
        "start_time": ev.start_time,
        "end_time": ev.end_time
    }


@app.get("/events/{event_id}/responses")
def event_responses(
    event_id: int,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    admin = get_user_from_token(cred.credentials, db)
    if admin.role != "admin":
        raise HTTPException(403, "No autorizado")

    cleanup_expired_data(db)

    resp = (
        db.query(EventResponse, User)
        .join(User, EventResponse.user_id == User.id)
        .filter(EventResponse.event_id == event_id)
        .all()
    )

    return [
        {
            "user_full_name": u.full_name,
            "answer": r.answer,
            "justification": r.justification,
        }
        for r, u in resp
    ]


@app.post("/events/{event_id}/responses")
def respond_event(
    event_id: int,
    data: EventResponseCreate,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    user = get_user_from_token(cred.credentials, db)

    db.add(EventResponse(
        event_id=event_id,
        user_id=user.id,
        answer=data.answer,
        justification=data.justification
    ))
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
    return db.query(Availability).filter(Availability.user_id == user.id).all()


@app.post("/availability/my")
def create_my_availability(
    data: AvailabilityCreate,
    cred: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db)
):
    user = get_user_from_token(cred.credentials, db)

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
    if admin.role != "admin":
        raise HTTPException(403, "No autorizado")

    # 🔥 limpieza SOLO aquí
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
