from datetime import datetime, date as date_cls, time as time_cls

ICS_LINE_LIMIT = 75


def _escape_ics_text(value: str) -> str:
    return (
        str(value)
        .replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
    )


def _fold_line(line: str) -> str:
    encoded = line.encode("utf-8")
    if len(encoded) <= ICS_LINE_LIMIT:
        return line

    folded = []
    chunk = b""
    for byte in encoded:
        candidate = chunk + bytes([byte])
        if len(candidate) > ICS_LINE_LIMIT - (0 if not folded else 1):
            folded.append(chunk)
            chunk = bytes([byte])
        else:
            chunk = candidate
    if chunk:
        folded.append(chunk)

    return ("\r\n ").join(part.decode("utf-8", errors="ignore") for part in folded)


def _parse_event_time(time_value: str | None) -> time_cls | None:
    if not time_value:
        return None
    for fmt in ("%H:%M:%S", "%H:%M"):
        try:
            return datetime.strptime(time_value, fmt).time()
        except ValueError:
            continue
    return None


def _format_datetime_utc(dt: datetime) -> str:
    return dt.strftime("%Y%m%dT%H%M%SZ")


def _build_vevent(event: dict) -> list[str]:
    event_date = datetime.strptime(event["date"], "%Y-%m-%d").date()
    event_time = _parse_event_time(event.get("start_time"))

    lines = ["BEGIN:VEVENT", f"UID:evento-{event['id']}@disponibilidad-app"]

    if event_time:
        dtstart = datetime.combine(event_date, event_time)
        lines.append(f"DTSTART:{dtstart.strftime('%Y%m%dT%H%M%S')}")
    else:
        lines.append(f"DTSTART;VALUE=DATE:{event_date.strftime('%Y%m%d')}")

    dtstamp_source = event.get("updated_at") or event.get("created_at")
    try:
        dtstamp = datetime.fromisoformat(dtstamp_source) if dtstamp_source else datetime.utcnow()
    except ValueError:
        dtstamp = datetime.utcnow()
    lines.append(f"DTSTAMP:{_format_datetime_utc(dtstamp)}")

    lines.append(f"SUMMARY:{_escape_ics_text(event['title'])}")

    if event.get("description"):
        lines.append(f"DESCRIPTION:{_escape_ics_text(event['description'])}")

    if event.get("location"):
        lines.append(f"LOCATION:{_escape_ics_text(event['location'])}")

    if event.get("external_url"):
        lines.append(f"URL:{_escape_ics_text(event['external_url'])}")

    if event.get("organizer_email"):
        organizer_name = event.get("organizer_name") or event["organizer_email"]
        lines.append(
            f"ORGANIZER;CN={_escape_ics_text(organizer_name)}:mailto:{event['organizer_email']}"
        )

    lines.append(f"CATEGORIES:{_escape_ics_text(event.get('visibility') or 'internal')}")
    lines.append("END:VEVENT")
    return lines


def generate_ics(events: list[dict], calendar_name: str = "Disponibilidad App") -> str:
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Disponibilidad App//Calendar Export//ES",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_escape_ics_text(calendar_name)}",
    ]

    for event in events:
        lines.extend(_build_vevent(event))

    lines.append("END:VCALENDAR")

    folded = [_fold_line(line) for line in lines]
    return "\r\n".join(folded) + "\r\n"
