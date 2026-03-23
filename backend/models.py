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
    end_time = Column(String)

    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)

    # RELACIONES
    creator = relationship("User", back_populates="events_created")
    responses = relationship("EventResponse", back_populates="event")


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
