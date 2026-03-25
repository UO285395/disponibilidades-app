from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False)
    full_name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="user")

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
    responses = relationship("EventResponse", back_populates="event")


class DomainPolicy(Base):
    __tablename__ = "domain_policies"

    id = Column(Integer, primary_key=True, index=True)
    domain = Column(String, unique=True, nullable=False)
    events_enabled = Column(Integer, default=1)
    availabilities_enabled = Column(Integer, default=1)
    spaces_enabled = Column(Integer, default=1)
    users_enabled = Column(Integer, default=1)
    domain_policies_enabled = Column(Integer, default=0)



class EventResponse(Base):
    __tablename__ = "event_responses"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    answer = Column(String, nullable=False)
    justification = Column(String)

    # Relaciones
    event = relationship("Event", back_populates="responses")
    user = relationship("User", back_populates="responses")


class EventCompanion(Base):
    __tablename__ = "event_companions"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    count = Column(Integer, nullable=False, default=0)

    event = relationship("Event")
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
