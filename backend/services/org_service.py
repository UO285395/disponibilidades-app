"""Servicio de estructura organizativa ("Organigrama").

Contiene:
- Helpers de árbol (ruta materializada).
- Migración/backfill aditiva e idempotente.
- Motor único de autoridad (¿puedo gestionar esta unidad?) y de alcance
  (¿este contenido llega a esta unidad?), basado en prefijos de `path`.
- Resolución territorial para el filtro público por provincia.

En la UI todo esto se denomina "Organigrama" / "Estructura". No se exponen
términos internos de diseño.
"""

from datetime import datetime

from sqlalchemy import inspect, text, or_
from sqlalchemy.orm import Session

import models
from models import (
    User,
    Event,
    DomainPolicy,
    GuestPolicy,
    DeviceToken,
    CensusConfig,
    Survey,
    Space,
    OrgLevelType,
    OrgLevelParentRule,
    OrgUnit,
    AdminAssignment,
    ContentDistributionTarget,
    AutonomousCommunity,
    Province,
    City,
    OrgUnitTerritory,
    InstanceLog,
)


# =========================================================
# CATÁLOGO DE TIPOS Y MATRIZ DE PARENTESCO (datos semilla)
# =========================================================

LEVEL_TYPES = [
    # code, label, is_leaf, is_root_only, sort_order
    ("central", "Consejo Central", 0, 1, 0),
    ("regional", "Comité Regional", 0, 0, 1),
    ("local", "Comité Local", 0, 0, 2),
    ("sectorial", "Comité Sectorial", 0, 0, 3),
    ("colectivo", "Colectivo", 1, 0, 4),
]

# (código_padre | None, código_hijo)
PARENT_RULES = [
    (None, "central"),
    ("central", "regional"),
    ("central", "local"),
    ("central", "sectorial"),
    ("central", "colectivo"),
    ("regional", "local"),
    ("regional", "sectorial"),
    ("regional", "colectivo"),
    ("local", "colectivo"),
    ("sectorial", "colectivo"),
]

ROOT_UNIT_NAME = "Consejo Central"
DISTRIBUTION_MODES = {"unit_only", "subtree", "custom"}


# =========================================================
# HELPERS DE RUTA MATERIALIZADA
# =========================================================

def _pad(unit_id: int) -> str:
    return f"{unit_id:010d}."


def compute_path(parent: OrgUnit | None, unit_id: int) -> str:
    base = parent.path if parent else ""
    return f"{base}{_pad(unit_id)}"


def path_depth(path: str) -> int:
    return max(0, path.strip(".").count(".") )


def ancestor_ids_from_path(path: str) -> list[int]:
    """Cadena de IDs raíz→self derivada de la ruta."""
    parts = [p for p in path.strip(".").split(".") if p]
    return [int(p) for p in parts]


def finalize_unit_path(db: Session, unit: OrgUnit) -> None:
    """Fija path/depth de una unidad recién creada (necesita su id ya asignado)."""
    parent = db.query(OrgUnit).get(unit.parent_id) if unit.parent_id else None
    unit.path = compute_path(parent, unit.id)
    unit.depth = len(ancestor_ids_from_path(unit.path)) - 1


# =========================================================
# MIGRACIÓN / BACKFILL
# =========================================================

def _domain_of_email(email: str | None) -> str | None:
    if not email or "@" not in email:
        return None
    return email.split("@")[-1].strip().lower() or None


def _add_column_if_missing(conn, inspector, table: str, column: str, ddl_type: str):
    existing = {c["name"] for c in inspector.get_columns(table)}
    if column not in existing:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}"))
        print(f"✅ Columna {table}.{column} añadida (organigrama)")


def ensure_org_hierarchy_schema_compatibility(engine, session_factory):
    """Aditiva e idempotente, mismo estilo que ensure_legacy_schema_compatibility."""
    try:
        inspector = inspect(engine)
        table_names = set(inspector.get_table_names())

        # 1) Columnas nuevas en tablas existentes -------------------------------
        column_specs = [
            ("users", "org_unit_id", "INTEGER"),
            ("events", "org_unit_id", "INTEGER"),
            ("events", "distribution_mode", "VARCHAR DEFAULT 'unit_only'"),
            ("domain_policies", "org_unit_id", "INTEGER"),
            ("guest_policies", "org_unit_id", "INTEGER"),
            ("device_tokens", "org_unit_id", "INTEGER"),
            ("census_configs", "org_unit_id", "INTEGER"),
            ("census_configs", "distribution_mode", "VARCHAR DEFAULT 'subtree'"),
            ("surveys", "org_unit_id", "INTEGER"),
            ("surveys", "distribution_mode", "VARCHAR DEFAULT 'unit_only'"),
            ("spaces", "org_unit_id", "INTEGER"),
            ("spaces", "distribution_mode", "VARCHAR DEFAULT 'unit_only'"),
        ]
        with engine.begin() as conn:
            for table, column, ddl in column_specs:
                if table in table_names:
                    _add_column_if_missing(conn, inspector, table, column, ddl)

        db = session_factory()
        try:
            _seed_level_types_and_rules(db)
            root = _ensure_root_unit(db)
            _seed_geography(db)
            _backfill_colectivos_and_users(db, root)
            _backfill_admin_assignments(db, root)
            _backfill_domain_policies(db)
            _backfill_guest_policies(db, root)
            _backfill_device_tokens(db)
            _backfill_events(db, root)
            _backfill_global_content(db, root)
            db.commit()
            print("✅ Organigrama: esquema y backfill verificados")
        finally:
            db.close()
    except Exception as exc:
        print(f"⚠️ No se pudo verificar el organigrama: {exc}")


def _seed_level_types_and_rules(db: Session):
    for code, label, is_leaf, is_root_only, sort_order in LEVEL_TYPES:
        existing = db.query(OrgLevelType).filter(OrgLevelType.code == code).first()
        if not existing:
            db.add(OrgLevelType(
                code=code, label=label, is_leaf=is_leaf,
                is_root_only=is_root_only, sort_order=sort_order,
            ))
    db.flush()

    by_code = {lt.code: lt for lt in db.query(OrgLevelType).all()}
    for parent_code, child_code in PARENT_RULES:
        parent_id = by_code[parent_code].id if parent_code else None
        child_id = by_code[child_code].id
        exists = db.query(OrgLevelParentRule).filter(
            OrgLevelParentRule.parent_level_type_id.is_(parent_id) if parent_id is None
            else OrgLevelParentRule.parent_level_type_id == parent_id,
            OrgLevelParentRule.child_level_type_id == child_id,
        ).first()
        if not exists:
            db.add(OrgLevelParentRule(
                parent_level_type_id=parent_id, child_level_type_id=child_id,
            ))
    db.flush()


def _ensure_root_unit(db: Session) -> OrgUnit:
    root = db.query(OrgUnit).filter(OrgUnit.parent_id.is_(None)).first()
    if root:
        return root
    central_type = db.query(OrgLevelType).filter(OrgLevelType.code == "central").first()
    now = datetime.utcnow().isoformat()
    root = OrgUnit(
        level_type_id=central_type.id, parent_id=None, name=ROOT_UNIT_NAME,
        slug="consejo-central", path="", depth=0, is_active=1, created_at=now,
    )
    db.add(root)
    db.flush()
    finalize_unit_path(db, root)
    db.flush()
    return root


def _seed_geography(db: Session):
    if db.query(AutonomousCommunity).first():
        return
    from data.spain_geo import COMMUNITIES_AND_PROVINCES
    for community_name, provinces in COMMUNITIES_AND_PROVINCES:
        community = AutonomousCommunity(name=community_name)
        db.add(community)
        db.flush()
        for province_name in provinces:
            db.add(Province(name=province_name, autonomous_community_id=community.id))
    db.flush()
    print("✅ Organigrama: geografía de España sembrada")


def _colectivo_type_id(db: Session) -> int:
    return db.query(OrgLevelType).filter(OrgLevelType.code == "colectivo").first().id


def _distinct_legacy_domains(db: Session) -> set[str]:
    domains: set[str] = set()
    for (email,) in db.query(User.email).all():
        d = _domain_of_email(email)
        if d:
            domains.add(d)
    for (ad,) in db.query(Event.allowed_domain).filter(Event.allowed_domain.isnot(None)).all():
        if ad and ad.strip():
            domains.add(ad.strip().lower())
    for (dom,) in db.query(DomainPolicy.domain).all():
        if dom and not dom.startswith("tag:"):
            domains.add(dom.strip().lower())
    for (dt,) in db.query(GuestPolicy.domain_tag).all():
        if dt and dt.strip().lower() != "public":
            domains.add(dt.strip().lower())
    for (dt,) in db.query(DeviceToken.domain_tag).filter(DeviceToken.domain_tag.isnot(None)).all():
        if dt and dt.strip():
            domains.add(dt.strip().lower())
    return domains


def _colectivo_by_domain(db: Session, root: OrgUnit) -> dict[str, OrgUnit]:
    return {
        u.legacy_domain: u
        for u in db.query(OrgUnit).filter(OrgUnit.legacy_domain.isnot(None)).all()
    }


def _backfill_colectivos_and_users(db: Session, root: OrgUnit):
    colectivo_type_id = _colectivo_type_id(db)
    existing = _colectivo_by_domain(db, root)
    now = datetime.utcnow().isoformat()

    for domain in _distinct_legacy_domains(db):
        if domain in existing:
            continue
        unit = OrgUnit(
            level_type_id=colectivo_type_id, parent_id=root.id, name=domain,
            slug=domain, path="", depth=0, is_active=1, legacy_domain=domain,
            created_at=now,
        )
        db.add(unit)
        db.flush()
        finalize_unit_path(db, unit)
        existing[domain] = unit
    db.flush()

    # Asignar org_unit_id a usuarios sin unidad, según el dominio de su email.
    for user in db.query(User).filter(User.org_unit_id.is_(None)).all():
        domain = _domain_of_email(user.email)
        unit = existing.get(domain) if domain else None
        if unit:
            user.org_unit_id = unit.id
    db.flush()


def _backfill_admin_assignments(db: Session, root: OrgUnit):
    now = datetime.utcnow().isoformat()
    for user in db.query(User).filter(User.role.in_(["admin", "superadmin"])).all():
        target_unit_id = root.id if user.role == "superadmin" else user.org_unit_id
        if not target_unit_id:
            continue
        exists = db.query(AdminAssignment).filter(
            AdminAssignment.user_id == user.id,
            AdminAssignment.org_unit_id == target_unit_id,
        ).first()
        if not exists:
            db.add(AdminAssignment(
                user_id=user.id, org_unit_id=target_unit_id,
                granted_by=None, created_at=now, is_active=1,
            ))
    db.flush()


def _backfill_domain_policies(db: Session):
    domain_units = {
        u.legacy_domain: u for u in
        db.query(OrgUnit).filter(OrgUnit.legacy_domain.isnot(None)).all()
    }
    for policy in db.query(DomainPolicy).filter(DomainPolicy.org_unit_id.is_(None)).all():
        key = (policy.domain or "").strip().lower()
        if key.startswith("tag:"):
            print(f"⚠️ Organigrama: política legacy '{policy.domain}' (tag) sin unidad equivalente — revisión manual")
            continue
        unit = domain_units.get(key)
        if unit:
            policy.org_unit_id = unit.id
    db.flush()


def _backfill_guest_policies(db: Session, root: OrgUnit):
    domain_units = {
        u.legacy_domain: u for u in
        db.query(OrgUnit).filter(OrgUnit.legacy_domain.isnot(None)).all()
    }
    for policy in db.query(GuestPolicy).filter(GuestPolicy.org_unit_id.is_(None)).all():
        key = (policy.domain_tag or "").strip().lower()
        if key == "public":
            policy.org_unit_id = root.id
            continue
        unit = domain_units.get(key)
        if unit:
            policy.org_unit_id = unit.id
    db.flush()


def _backfill_device_tokens(db: Session):
    domain_units = {
        u.legacy_domain: u for u in
        db.query(OrgUnit).filter(OrgUnit.legacy_domain.isnot(None)).all()
    }
    for token in db.query(DeviceToken).filter(DeviceToken.org_unit_id.is_(None)).all():
        key = (token.domain_tag or "").strip().lower()
        unit = domain_units.get(key)
        if unit:
            token.org_unit_id = unit.id
    db.flush()


def _backfill_events(db: Session, root: OrgUnit):
    domain_units = {
        u.legacy_domain: u for u in
        db.query(OrgUnit).filter(OrgUnit.legacy_domain.isnot(None)).all()
    }
    for ev in db.query(Event).filter(Event.org_unit_id.is_(None)).all():
        allowed = (ev.allowed_domain or "").strip().lower()
        if not allowed:
            # "visible para todos" -> raíz + subtree (preserva semántica exacta).
            ev.org_unit_id = root.id
            ev.distribution_mode = "subtree"
        else:
            unit = domain_units.get(allowed)
            ev.org_unit_id = unit.id if unit else root.id
            ev.distribution_mode = "unit_only"
    db.flush()


def _backfill_global_content(db: Session, root: OrgUnit):
    # Census, Surveys y Spaces eran 100% globales -> raíz + subtree (visible por
    # todos, sin regresión), pero ya scopables territorialmente en adelante.
    for cfg in db.query(CensusConfig).filter(CensusConfig.org_unit_id.is_(None)).all():
        cfg.org_unit_id = root.id
        cfg.distribution_mode = "subtree"
    for survey in db.query(Survey).filter(Survey.org_unit_id.is_(None)).all():
        survey.org_unit_id = root.id
        survey.distribution_mode = "subtree"
    for space in db.query(Space).filter(Space.org_unit_id.is_(None)).all():
        space.org_unit_id = root.id
        space.distribution_mode = "subtree"
    db.flush()


# =========================================================
# CREACIÓN / EDICIÓN / REPARENTADO DE UNIDADES
# =========================================================

def allowed_child_type_ids(db: Session, parent_level_type_id: int | None) -> list[int]:
    """Tipos de nivel que la matriz permite crear bajo el tipo padre dado
    (None = reglas de creación de raíz)."""
    query = db.query(OrgLevelParentRule.child_level_type_id)
    if parent_level_type_id is None:
        query = query.filter(OrgLevelParentRule.parent_level_type_id.is_(None))
    else:
        query = query.filter(OrgLevelParentRule.parent_level_type_id == parent_level_type_id)
    return [row[0] for row in query.all()]


def can_place_under(db: Session, parent_unit: OrgUnit | None, child_level_type_id: int) -> bool:
    parent_type_id = parent_unit.level_type_id if parent_unit else None
    return child_level_type_id in allowed_child_type_ids(db, parent_type_id)


def create_unit(db: Session, level_type_id: int, parent_id: int | None, name: str,
                slug: str | None = None) -> OrgUnit:
    parent = db.query(OrgUnit).get(parent_id) if parent_id else None
    if not can_place_under(db, parent, level_type_id):
        raise ValueError("La estructura elegida no admite ese tipo de unidad debajo")

    level_type = db.query(OrgLevelType).get(level_type_id)
    if level_type is None:
        raise ValueError("Tipo de nivel inexistente")
    # is_root_only solo puede existir como raíz y una sola vez.
    if level_type.is_root_only and (parent is not None or get_root_unit(db) is not None):
        raise ValueError("Ese tipo solo puede existir como raíz única")

    now = datetime.utcnow().isoformat()
    unit = OrgUnit(
        level_type_id=level_type_id, parent_id=parent_id, name=name.strip(),
        slug=(slug or name).strip().lower().replace(" ", "-"),
        path="", depth=0, is_active=1, created_at=now,
    )
    db.add(unit)
    db.flush()
    finalize_unit_path(db, unit)
    db.flush()
    return unit


def reparent_unit(db: Session, unit: OrgUnit, new_parent: OrgUnit) -> None:
    """Mueve una unidad (y su subárbol) bajo un nuevo padre, reescribiendo las
    rutas del subárbol movido. Valida matriz y ausencia de ciclos."""
    if new_parent.id == unit.id:
        raise ValueError("Una unidad no puede ser su propio padre")
    if new_parent.path.startswith(unit.path):
        raise ValueError("No puedes mover una unidad dentro de su propio subárbol")
    if not can_place_under(db, new_parent, unit.level_type_id):
        raise ValueError("El destino no admite ese tipo de unidad")

    old_prefix = unit.path
    new_self_path = compute_path(new_parent, unit.id)

    # Recolectar unidad + descendientes (path LIKE old_prefix%).
    affected = db.query(OrgUnit).filter(OrgUnit.path.like(f"{old_prefix}%")).all()
    for node in affected:
        node.path = new_self_path + node.path[len(old_prefix):]
        node.depth = len(ancestor_ids_from_path(node.path)) - 1
    unit.parent_id = new_parent.id
    unit.updated_at = datetime.utcnow().isoformat()
    db.flush()


def deactivate_unit(db: Session, unit: OrgUnit) -> None:
    unit.is_active = 0
    unit.deactivated_at = datetime.utcnow().isoformat()
    db.flush()


def reactivate_unit(db: Session, unit: OrgUnit) -> None:
    unit.is_active = 1
    unit.deactivated_at = None
    db.flush()


def serialize_unit(db: Session, unit: OrgUnit, include_counts: bool = False) -> dict:
    data = {
        "id": unit.id,
        "name": unit.name,
        "parent_id": unit.parent_id,
        "level_type": unit.level_type.code if unit.level_type else None,
        "level_label": unit.level_type.label if unit.level_type else None,
        "depth": unit.depth,
        "is_active": bool(unit.is_active),
        "path": unit.path,
    }
    if include_counts:
        data["member_count"] = db.query(User).filter(User.org_unit_id == unit.id).count()
        data["child_count"] = db.query(OrgUnit).filter(OrgUnit.parent_id == unit.id).count()
    return data


# =========================================================
# MOTOR DE AUTORIDAD (¿puedo gestionar esta unidad?)
# =========================================================

def get_root_unit(db: Session) -> OrgUnit | None:
    return db.query(OrgUnit).filter(OrgUnit.parent_id.is_(None)).first()


def unit_id_for_legacy_domain(db: Session, domain: str | None) -> int | None:
    """Resuelve un dominio legacy (p.ej. 'gmail.com') a su colectivo. Puente
    durante la transición desde el modelo de dominios por email."""
    if not domain:
        return None
    key = domain.strip().lower()
    unit = db.query(OrgUnit).filter(OrgUnit.legacy_domain == key).first()
    return unit.id if unit else None


def ensure_colectivo_for_domain(db: Session, domain: str | None) -> OrgUnit | None:
    """Devuelve el colectivo asociado a un dominio; lo crea bajo la raíz si no
    existe. Mantiene coherente el modelo dominio→colectivo en la transición."""
    if not domain:
        return None
    key = domain.strip().lower()
    unit = db.query(OrgUnit).filter(OrgUnit.legacy_domain == key).first()
    if unit:
        return unit
    root = get_root_unit(db)
    if not root:
        return None
    colectivo_type_id = _colectivo_type_id(db)
    now = datetime.utcnow().isoformat()
    unit = OrgUnit(
        level_type_id=colectivo_type_id, parent_id=root.id, name=key, slug=key,
        path="", depth=0, is_active=1, legacy_domain=key, created_at=now,
    )
    db.add(unit)
    db.flush()
    finalize_unit_path(db, unit)
    db.flush()
    return unit


def can_manage_legacy_domain(db: Session, admin: User, domain: str | None) -> bool:
    """Autoridad sobre un dominio legacy, vía su colectivo en el organigrama.
    Si el dominio no tiene unidad equivalente (dato huérfano), cae al criterio
    conservador: solo el propio dominio del admin."""
    if admin.role == "superadmin":
        return True
    unit_id = unit_id_for_legacy_domain(db, domain)
    if unit_id is not None:
        return can_manage_unit(db, admin, unit_id)
    # Fallback conservador: mismo dominio que el admin.
    admin_domain = _domain_of_email(admin.email)
    return bool(domain) and domain.strip().lower() == admin_domain


def authorized_root_units(db: Session, admin: User) -> list[OrgUnit]:
    """Unidades con AdminAssignment directa del admin (sus raíces de autoridad).
    Superadmin ostenta implícitamente la raíz."""
    if admin.role == "superadmin":
        root = get_root_unit(db)
        return [root] if root else []
    unit_ids = [
        a.org_unit_id for a in db.query(AdminAssignment).filter(
            AdminAssignment.user_id == admin.id,
            AdminAssignment.is_active == 1,
        ).all()
    ]
    if not unit_ids:
        return []
    return db.query(OrgUnit).filter(OrgUnit.id.in_(unit_ids)).all()


def can_manage_unit(db: Session, admin: User, target_unit_id: int | None) -> bool:
    """Comprobación canónica de autoridad. True si target es la propia unidad
    asignada o un descendiente estructural de alguna asignación del admin."""
    if admin.role == "superadmin":
        return True
    if target_unit_id is None:
        return False
    target = db.query(OrgUnit).get(target_unit_id)
    if target is None:
        return False
    for root in authorized_root_units(db, admin):
        if target.id == root.id or (root.path and target.path.startswith(root.path)):
            return True
    return False


def can_manage_user(db: Session, admin: User, target_user: User) -> bool:
    if admin.role == "superadmin":
        return True
    return can_manage_unit(db, admin, target_user.org_unit_id)


def authorized_subtree_unit_ids(db: Session, admin: User) -> list[int] | None:
    """IDs de todas las unidades dentro de la autoridad del admin. None =
    sin restricción (superadmin)."""
    if admin.role == "superadmin":
        return None
    roots = authorized_root_units(db, admin)
    if not roots:
        return []
    clauses = []
    for r in roots:
        if r.path:
            clauses.append(OrgUnit.path.like(f"{r.path}%"))
    if not clauses:
        return []
    units = db.query(OrgUnit.id).filter(or_(*clauses)).all()
    return [u.id for u in units]


# =========================================================
# MOTOR DE ALCANCE (¿este contenido llega a esta unidad?)
# =========================================================

def reach_root_units(db: Session, owning_unit_id: int, distribution_mode: str,
                     content_type: str, content_id: int) -> tuple[OrgUnit | None, list[OrgUnit]]:
    owning = db.query(OrgUnit).get(owning_unit_id) if owning_unit_id else None
    targets: list[OrgUnit] = []
    if distribution_mode == "custom":
        target_ids = [
            row.org_unit_id for row in db.query(ContentDistributionTarget).filter(
                ContentDistributionTarget.content_type == content_type,
                ContentDistributionTarget.content_id == content_id,
            ).all()
        ]
        if target_ids:
            targets = db.query(OrgUnit).filter(OrgUnit.id.in_(target_ids)).all()
    return owning, targets


def unit_in_reach(db: Session, viewer_unit: OrgUnit | None, owning_unit_id: int,
                  distribution_mode: str, content_type: str, content_id: int) -> bool:
    if viewer_unit is None or owning_unit_id is None:
        return False
    owning, targets = reach_root_units(db, owning_unit_id, distribution_mode, content_type, content_id)
    if owning is None:
        return False
    mode = distribution_mode or "unit_only"
    if mode == "unit_only":
        return viewer_unit.id == owning.id
    if mode == "subtree":
        return bool(owning.path) and viewer_unit.path.startswith(owning.path)
    # custom
    if viewer_unit.id == owning.id:
        return True
    return any(t.path and viewer_unit.path.startswith(t.path) for t in targets)


# =========================================================
# POLÍTICAS DE MÓDULO (cascada más-específico-gana)
# =========================================================

def policy_chain_unit_ids(unit: OrgUnit) -> list[int]:
    """Cadena self→raíz derivada de la ruta."""
    return list(reversed(ancestor_ids_from_path(unit.path)))


FEATURE_COLUMN = {
    "events": "events_enabled",
    "availabilities": "availabilities_enabled",
    "spaces": "spaces_enabled",
    "users": "users_enabled",
    "domain_policies": "domain_policies_enabled",
    "census": "census_enabled",
    "surveys": "surveys_enabled",
    "notifications": "notifications_enabled",
}


def is_feature_enabled_for_unit(db: Session, unit_id: int | None, feature: str, role: str = "user") -> bool:
    if role == "superadmin":
        return True
    column_name = FEATURE_COLUMN.get(feature)
    if not column_name:
        return True

    unit = db.query(OrgUnit).get(unit_id) if unit_id else None
    chain = policy_chain_unit_ids(unit) if unit else []
    if chain:
        policies = {
            p.org_unit_id: p for p in
            db.query(DomainPolicy).filter(DomainPolicy.org_unit_id.in_(chain)).all()
        }
        for candidate_id in chain:  # self primero
            policy = policies.get(candidate_id)
            if policy is not None:
                return bool(getattr(policy, column_name, 0))

    # Sin política en toda la cadena -> defaults por rol
    if role == "admin":
        return feature in {"events", "availabilities", "users"}
    return feature in {"events", "availabilities"}


# =========================================================
# AUDITORÍA DE DRILL-DOWN
# =========================================================

def requires_drill_down_log(db: Session, admin: User, target_unit_id: int) -> bool:
    own_unit_ids = {u.id for u in authorized_root_units(db, admin)}
    return target_unit_id not in own_unit_ids


def log_drill_down(db: Session, admin: User, target_unit_id: int, module: str):
    import json
    db.add(InstanceLog(
        action="drill_down",
        entity_type="org_unit",
        entity_id=str(target_unit_id),
        instance_origin="central",
        payload=json.dumps({"admin_id": admin.id, "admin_email": admin.email, "module": module}),
        created_at=datetime.utcnow().isoformat(),
    ))
    db.commit()


# =========================================================
# RESOLUCIÓN TERRITORIAL (filtro público por provincia)
# =========================================================

def org_units_for_province(db: Session, province_id: int) -> list[int]:
    """IDs de unidades cuyo ámbito territorial incluye la provincia dada."""
    province = db.query(Province).get(province_id)
    if not province:
        return []

    matching_ids: set[int] = set()

    # provincia directa
    for row in db.query(OrgUnitTerritory).filter(
        OrgUnitTerritory.territory_type == "provincia",
        OrgUnitTerritory.territory_id == province_id,
    ).all():
        matching_ids.add(row.org_unit_id)

    # comunidad autónoma que contiene la provincia
    for row in db.query(OrgUnitTerritory).filter(
        OrgUnitTerritory.territory_type == "comunidad_autonoma",
        OrgUnitTerritory.territory_id == province.autonomous_community_id,
    ).all():
        matching_ids.add(row.org_unit_id)

    # ciudades de esa provincia
    city_ids = [c.id for c in db.query(City).filter(City.province_id == province_id).all()]
    if city_ids:
        for row in db.query(OrgUnitTerritory).filter(
            OrgUnitTerritory.territory_type == "ciudad",
            OrgUnitTerritory.territory_id.in_(city_ids),
        ).all():
            matching_ids.add(row.org_unit_id)

    return list(matching_ids)
