from sqlalchemy import Column, Integer, String, ForeignKey, UniqueConstraint
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


class Space(Base):
    __tablename__ = "spaces"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    description = Column(String)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)

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
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token = Column(String, unique=True, nullable=False)
    platform = Column(String, nullable=False, default="android")
    device_id = Column(String, nullable=True)
    collective = Column(String, nullable=True)
    active = Column(Integer, nullable=False, default=1)
    updated_at = Column(String, nullable=False)

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
