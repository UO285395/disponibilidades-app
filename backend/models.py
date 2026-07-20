from sqlalchemy import Column, Integer, String, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False)
    full_name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="user")
    group_tag = Column(String, nullable=True)
    # Unidad organizativa "hogar" del usuario (colectivo donde milita). La
    # autoridad real de un admin no sale de aquí, sino de AdminAssignment.
    org_unit_id = Column(Integer, ForeignKey("org_units.id"), nullable=True, index=True)
    # Correo opcional (opt-in) al que el usuario quiere recibir recordatorios.
    # Puede coincidir con `email` o ser otro; lo gestiona el propio usuario.
    reminder_email = Column(String, nullable=True)
    # Opt-in del recordatorio semanal de disponibilidad sin marcar.
    availability_reminder_opt_in = Column(Integer, nullable=False, default=0)

    # Relaciones
    availabilities = relationship("Availability", back_populates="user")
    events_created = relationship("Event", back_populates="creator")
    responses = relationship("EventResponse", back_populates="user")


class Availability(Base):
    __tablename__ = "availabilities"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    date = Column(String, nullable=False)
    start_time = Column(String, nullable=False)
    end_time = Column(String, nullable=False)

    user = relationship("User", back_populates="availabilities")


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String)
    date = Column(String, nullable=False)
    start_time = Column(String)
    allowed_domain = Column(String, nullable=True)  # si null visible para todos
    visibility = Column(String, nullable=False, default="internal")  # public | internal | private
    event_type = Column(String, nullable=False, default="participativo")  # informativo | participativo
    location = Column(String, nullable=True)
    external_url = Column(String, nullable=True)
    metadata_json = Column("metadata", String, nullable=True)  # JSON serializado
    is_recurring = Column(Integer, nullable=False, default=0)
    recurrence_rule = Column(String, nullable=True)
    updated_at = Column(String, nullable=True)
    deleted_at = Column(String, nullable=True)
    # Unidad propietaria + modo de distribución (unit_only | subtree | custom).
    # Conviven con allowed_domain (legacy) durante la transición.
    org_unit_id = Column(Integer, ForeignKey("org_units.id"), nullable=True, index=True)
    distribution_mode = Column(String, nullable=True, default="unit_only")
    # Adjuntos como JSON serializado: lista de {name, url}. Basado en enlaces
    # para no depender de almacenamiento de ficheros (Railway es efímero).
    attachments = Column(String, nullable=True)

    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)

    # RELACIONES
    creator = relationship("User", back_populates="events_created")
    responses = relationship(
        "EventResponse",
        back_populates="event",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    companions = relationship(
        "EventCompanion",
        back_populates="event",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class DomainPolicy(Base):
    __tablename__ = "domain_policies"

    id = Column(Integer, primary_key=True, index=True)
    domain = Column(String, unique=True, nullable=False)
    events_enabled = Column(Integer, default=1)
    availabilities_enabled = Column(Integer, default=1)
    spaces_enabled = Column(Integer, default=1)
    users_enabled = Column(Integer, default=1)
    domain_policies_enabled = Column(Integer, default=0)
    census_enabled = Column(Integer, default=0)
    surveys_enabled = Column(Integer, default=0)
    notifications_enabled = Column(Integer, default=0)
    # Unidad organizativa a la que aplica la política (reemplaza el storage-key
    # domain / tag: durante la transición).
    org_unit_id = Column(Integer, ForeignKey("org_units.id"), nullable=True, index=True)


class GuestPolicy(Base):
    __tablename__ = "guest_policies"

    id = Column(Integer, primary_key=True, index=True)
    domain_tag = Column(String, unique=True, nullable=False)
    guest_responses_enabled = Column(Integer, default=1)
    guest_surveys_enabled = Column(Integer, default=0)
    guest_census_enabled = Column(Integer, default=0)
    guest_notifications_enabled = Column(Integer, default=1)
    max_guest_responses_per_event = Column(Integer, nullable=True)
    created_at = Column(String, nullable=True)
    updated_at = Column(String, nullable=True)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    # Unidad organizativa a la que aplica (reemplaza domain_tag en transición).
    org_unit_id = Column(Integer, ForeignKey("org_units.id"), nullable=True, index=True)

    updater = relationship("User")



class EventResponse(Base):
    __tablename__ = "event_responses"
    __table_args__ = (
        UniqueConstraint("event_id", "user_id", name="ux_event_responses_event_user"),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"))
    user_id = Column(Integer, ForeignKey("users.id"))
    answer = Column(String, nullable=False)
    justification = Column(String)

    # Relaciones
    event = relationship("Event", back_populates="responses")
    user = relationship("User", back_populates="responses")


class EventCompanion(Base):
    __tablename__ = "event_companions"
    __table_args__ = (
        UniqueConstraint("event_id", "user_id", name="ux_event_companions_event_user"),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    count = Column(Integer, nullable=False, default=0)

    event = relationship("Event", back_populates="companions")
    user = relationship("User")


class GuestResponse(Base):
    __tablename__ = "guest_responses"
    __table_args__ = (
        UniqueConstraint("event_id", "guest_identifier", name="ux_guest_responses_event_guest"),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    guest_name = Column(String, nullable=True)
    guest_email = Column(String, nullable=True)
    answer = Column(String, nullable=False, default="saved")
    companions = Column(Integer, nullable=False, default=0)
    guest_identifier = Column(String, nullable=False)
    created_at = Column(String, nullable=True)
    updated_at = Column(String, nullable=True)

    event = relationship("Event")


class EventReminder(Base):
    """Recordatorio de evento que el propio usuario activa (opt-in). Nunca se
    crea automáticamente: solo existe si la persona pulsó "Recordármelo". El
    planificador en segundo plano lo envía cuando llega `remind_at` y marca
    `sent=1`."""
    __tablename__ = "event_reminders"
    __table_args__ = (
        UniqueConstraint("event_id", "user_id", name="ux_event_reminders_event_user"),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # Momento en que debe dispararse (ISO). Se calcula a partir de la fecha/hora
    # del evento menos el desplazamiento elegido por el usuario.
    remind_at = Column(String, nullable=False, index=True)
    # push, email o "push,email" — canales elegidos.
    channels = Column(String, nullable=False, default="push")
    sent = Column(Integer, nullable=False, default=0)
    created_at = Column(String, nullable=True)

    event = relationship("Event")
    user = relationship("User")


class Space(Base):
    __tablename__ = "spaces"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    description = Column(String)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    org_unit_id = Column(Integer, ForeignKey("org_units.id"), nullable=True, index=True)
    distribution_mode = Column(String, nullable=True, default="unit_only")

    creator = relationship("User")
    reservations = relationship("SpaceReservation", back_populates="space")


class SpaceReservation(Base):
    __tablename__ = "space_reservations"

    id = Column(Integer, primary_key=True, index=True)
    space_id = Column(Integer, ForeignKey("spaces.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    date = Column(String, nullable=False)
    start_time = Column(String, nullable=False)
    end_time = Column(String, nullable=False)
    reason = Column(String)

    space = relationship("Space", back_populates="reservations")
    user = relationship("User")


class CensusConfig(Base):
    __tablename__ = "census_configs"

    id = Column(Integer, primary_key=True, index=True)
    email_to = Column(String, nullable=False)
    url_token = Column(String, unique=True, nullable=False)
    org_unit_id = Column(Integer, ForeignKey("org_units.id"), nullable=True, index=True)
    distribution_mode = Column(String, nullable=True, default="subtree")

    fields = relationship(
        "CensusField",
        back_populates="config",
        order_by="CensusField.order_index",
        cascade="all, delete-orphan",
    )


class CensusField(Base):
    __tablename__ = "census_fields"

    id = Column(Integer, primary_key=True, index=True)
    config_id = Column(Integer, ForeignKey("census_configs.id"), nullable=False)
    label = Column(String, nullable=False)
    field_type = Column(String, nullable=False, default="text")  # text, textarea, number, select
    required = Column(Integer, default=1)
    order_index = Column(Integer, default=0)
    options = Column(String, nullable=True)  # JSON-encoded list for 'select' type

    config = relationship("CensusConfig", back_populates="fields")


class Survey(Base):
    __tablename__ = "surveys"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    url_token = Column(String, unique=True, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_active = Column(Integer, nullable=False, default=1)
    created_at = Column(String, nullable=False)
    org_unit_id = Column(Integer, ForeignKey("org_units.id"), nullable=True, index=True)
    distribution_mode = Column(String, nullable=True, default="unit_only")

    creator = relationship("User")
    fields = relationship(
        "SurveyField",
        back_populates="survey",
        order_by="SurveyField.order_index",
        cascade="all, delete-orphan",
    )
    responses = relationship(
        "SurveyResponse",
        back_populates="survey",
        cascade="all, delete-orphan",
    )


class SurveyField(Base):
    __tablename__ = "survey_fields"

    id = Column(Integer, primary_key=True, index=True)
    survey_id = Column(Integer, ForeignKey("surveys.id"), nullable=False)
    label = Column(String, nullable=False)
    field_type = Column(String, nullable=False, default="text")
    required = Column(Integer, default=1)
    order_index = Column(Integer, default=0)
    options = Column(String, nullable=True)  # JSON-encoded list for 'select' type

    survey = relationship("Survey", back_populates="fields")


class SurveyResponse(Base):
    __tablename__ = "survey_responses"

    id = Column(Integer, primary_key=True, index=True)
    survey_id = Column(Integer, ForeignKey("surveys.id"), nullable=False)
    answers = Column(String, nullable=False)  # JSON-encoded object keyed by field id
    submitted_at = Column(String, nullable=False)

    survey = relationship("Survey", back_populates="responses")


class DeviceToken(Base):
    __tablename__ = "device_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    token = Column(String, unique=True, nullable=False)
    platform = Column(String, nullable=False, default="android")
    device_id = Column(String, nullable=True)
    device_identifier = Column(String, nullable=True)
    user_role = Column(String, nullable=False, default="user")  # guest | user | admin | superadmin
    domain_tag = Column(String, nullable=True)
    collective = Column(String, nullable=True)
    org_unit_id = Column(Integer, ForeignKey("org_units.id"), nullable=True, index=True)
    active = Column(Integer, nullable=False, default=1)
    updated_at = Column(String, nullable=False)
    last_used = Column(String, nullable=True)

    user = relationship("User")


class NotificationDispatch(Base):
    __tablename__ = "notification_dispatches"

    id = Column(Integer, primary_key=True, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    scope = Column(String, nullable=False)  # all | colectivo | users
    title = Column(String, nullable=False)
    body = Column(String, nullable=False)
    target_collective = Column(String, nullable=True)
    target_user_ids = Column(String, nullable=True)  # JSON-encoded list
    sent_count = Column(Integer, nullable=False, default=0)
    failed_count = Column(Integer, nullable=False, default=0)
    created_at = Column(String, nullable=False)

    creator = relationship("User")


class LoginAttempt(Base):
    """Intentos de acceso fallidos, para frenar la fuerza bruta.

    Va en base de datos y no en memoria a propósito: detrás del proxy no hay una
    IP de cliente fiable y puede haber varias réplicas del backend, así que un
    contador en memoria no acumula nada. Se cuenta por email.
    """
    __tablename__ = "login_attempts"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, nullable=False, index=True)
    ip = Column(String, nullable=True)
    created_at = Column(String, nullable=False, index=True)


class InstanceLog(Base):
    __tablename__ = "instance_logs"

    id = Column(Integer, primary_key=True, index=True)
    action = Column(String, nullable=False)
    entity_type = Column(String, nullable=False)
    entity_id = Column(String, nullable=False)
    instance_origin = Column(String, nullable=False, default="central")
    payload = Column(String, nullable=True)  # JSON serializado
    sync_to_instances = Column(String, nullable=True)  # JSON serializado
    synced_at = Column(String, nullable=True)
    created_at = Column(String, nullable=False)


# =========================================================
# ORGANIGRAMA / ESTRUCTURA ORGANIZATIVA
# =========================================================
# Modelo jerárquico de la organización. En la UI se denomina "Organigrama" /
# "Estructura". El catálogo de tipos y la matriz de parentesco son datos
# (tablas), no lógica de Python, para poder ampliar niveles sin tocar código.


class OrgLevelType(Base):
    """Catálogo de tipos de nivel (consejo central, comité regional, comité
    local, comité sectorial, colectivo). Extensible por datos."""
    __tablename__ = "org_level_types"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, nullable=False)   # central | regional | local | sectorial | colectivo
    label = Column(String, nullable=False)               # etiqueta legible
    is_leaf = Column(Integer, nullable=False, default=0)  # colectivo=1: nada cuelga de él
    is_root_only = Column(Integer, nullable=False, default=0)  # central=1: única instancia, sin padre
    sort_order = Column(Integer, nullable=False, default=0)


class OrgLevelParentRule(Base):
    """Matriz padre→hijo permitida, como datos. parent_level_type_id NULL = regla
    de creación de la raíz (qué tipo puede existir sin padre)."""
    __tablename__ = "org_level_parent_rules"
    __table_args__ = (
        UniqueConstraint("parent_level_type_id", "child_level_type_id", name="ux_org_level_parent_rules"),
    )

    id = Column(Integer, primary_key=True, index=True)
    parent_level_type_id = Column(Integer, ForeignKey("org_level_types.id"), nullable=True)
    child_level_type_id = Column(Integer, ForeignKey("org_level_types.id"), nullable=False)


class OrgUnit(Base):
    """Nodo real del árbol. Usa ruta materializada (path) para consultas de
    subárbol baratas vía LIKE 'prefijo%', portables entre SQLite y Postgres."""
    __tablename__ = "org_units"
    __table_args__ = (
        Index("ix_org_units_path", "path"),
    )

    id = Column(Integer, primary_key=True, index=True)
    level_type_id = Column(Integer, ForeignKey("org_level_types.id"), nullable=False)
    parent_id = Column(Integer, ForeignKey("org_units.id"), nullable=True)
    name = Column(String, nullable=False)
    slug = Column(String, nullable=True)
    path = Column(String, nullable=False, default="")   # p.ej. "0000000001.0000000007."
    depth = Column(Integer, nullable=False, default=0)
    is_active = Column(Integer, nullable=False, default=1)
    legacy_domain = Column(String, nullable=True, index=True)  # trazabilidad del backfill
    created_at = Column(String, nullable=True)
    updated_at = Column(String, nullable=True)
    deactivated_at = Column(String, nullable=True)

    level_type = relationship("OrgLevelType")
    parent = relationship("OrgUnit", remote_side=[id])


class AdminAssignment(Base):
    """Concesión explícita y auditable de autoridad de un usuario sobre una
    unidad (y todo su subárbol). Sustituye el hack de delegación por group_tag."""
    __tablename__ = "admin_assignments"
    __table_args__ = (
        UniqueConstraint("user_id", "org_unit_id", name="ux_admin_assignments_user_unit"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    org_unit_id = Column(Integer, ForeignKey("org_units.id"), nullable=False, index=True)
    # Alcance de la autoridad sobre la unidad asignada:
    #   subtree   -> la unidad y todas las que dependen de ella (todo el comité)
    #   unit_only -> solo esa unidad concreta (p. ej. solo su colectivo)
    scope = Column(String, nullable=False, default="subtree")
    granted_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(String, nullable=True)
    is_active = Column(Integer, nullable=False, default=1)

    user = relationship("User", foreign_keys=[user_id])
    org_unit = relationship("OrgUnit")


class ContentDistributionTarget(Base):
    """Destinos explícitos del modo de distribución 'custom', reutilizando el
    convenio entity_type/entity_id (content_type, content_id)."""
    __tablename__ = "content_distribution_targets"
    __table_args__ = (
        UniqueConstraint("content_type", "content_id", "org_unit_id", name="ux_content_distribution_target"),
    )

    id = Column(Integer, primary_key=True, index=True)
    content_type = Column(String, nullable=False)  # event | census_config | survey | space
    content_id = Column(Integer, nullable=False)
    org_unit_id = Column(Integer, ForeignKey("org_units.id"), nullable=False)


# =========================================================
# GEOGRAFÍA (para el filtro público por provincia)
# =========================================================
# División administrativa real de España, estática y pública. Ortogonal al
# árbol organizativo: sirve solo para clasificar ubicación de cara al visitante
# sin desvelar la estructura interna.


class AutonomousCommunity(Base):
    __tablename__ = "autonomous_communities"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)


class Province(Base):
    __tablename__ = "provinces"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    autonomous_community_id = Column(Integer, ForeignKey("autonomous_communities.id"), nullable=False)

    community = relationship("AutonomousCommunity")


class City(Base):
    __tablename__ = "cities"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    province_id = Column(Integer, ForeignKey("provinces.id"), nullable=False)

    province = relationship("Province")


class OrgUnitTerritory(Base):
    """Asociación muchos-a-muchos entre una unidad y sus ámbitos territoriales.
    Un sectorial puede tener varias ciudades; un colectivo normalmente una."""
    __tablename__ = "org_unit_territories"
    __table_args__ = (
        UniqueConstraint("org_unit_id", "territory_type", "territory_id", name="ux_org_unit_territory"),
    )

    id = Column(Integer, primary_key=True, index=True)
    org_unit_id = Column(Integer, ForeignKey("org_units.id"), nullable=False, index=True)
    territory_type = Column(String, nullable=False)  # ciudad | provincia | comunidad_autonoma
    territory_id = Column(Integer, nullable=False)
