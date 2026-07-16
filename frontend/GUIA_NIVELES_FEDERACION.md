# Guía: Sistema de Niveles de la Federación

## ⚠️ Aviso importante antes de leer

**Este sistema todavía NO está implementado.** Lo que existe hoy en el código es exactamente lo mismo que
antes: un dominio de email plano (`_get_domain(email)`, `backend/main.py`) y ningún árbol organizativo real.

Lo que hay hecho es **el diseño aprobado**, documentado como anexo en
[`PLAN_ESCALADO.md`](PLAN_ESCALADO.md) ("ANEXO: PLAN DE FEDERACIÓN MULTI-TERRITORIO"). Este documento es una
explicación en lenguaje más operativo de **cómo funcionará y se configurará** ese sistema una vez se
implemente (Fases 1-2 del anexo), para que sirva de referencia cuando llegue el momento de construirlo — y
para que cualquiera (tú u otra sesión de IA) entienda la mecánica sin tener que releer todo el plan técnico.

Si en algún momento este documento dice "creas una unidad" o "asignas un admin", léelo como **"esto es lo que
podrás hacer una vez esté construido"**, no como un tutorial de algo que ya funciona hoy.

---

## 1. Dos conceptos que no hay que confundir

El sistema tiene dos piezas separadas que a menudo se mezclan mentalmente:

- **Tipos de nivel** (`OrgLevelType`): el *catálogo* de categorías posibles — "consejo central", "comité
  regional", "comité local", "comité sectorial", "colectivo". Esto es fijo y raramente cambia.
- **Unidades** (`OrgUnit`): las *instancias reales* de esos tipos — "Comité Regional de Andalucía", "Comité
  Local de Sevilla", "Colectivo Sevilla-Centro". Esto es el árbol que crece con el día a día del partido.

Es la misma diferencia que entre una clase y un objeto: "comité local" es el tipo, "Comité Local de Sevilla"
es una unidad concreta de ese tipo.

## 2. El catálogo de tipos y quién puede colgar de quién

Los 5 tipos de nivel están definidos una vez, con estas reglas de parentesco (esto **no** es código, es una
tabla de datos — `OrgLevelParentRule` — para poder ajustarla sin tocar el motor):

```
consejo central (raíz, única instancia)
 ├── comité regional
 │    ├── comité local
 │    ├── comité sectorial
 │    └── colectivo
 ├── comité local
 ├── comité sectorial
 └── colectivo
```

Reglas concretas:

- Bajo **consejo central** o bajo **comité regional**: puedes crear un comité local, un comité sectorial o un
  colectivo directamente — cualquier combinación, se pueden saltar niveles (no es obligatorio pasar por
  "regional" para llegar a un colectivo).
- Bajo **comité local** o **comité sectorial**: solo puedes crear **colectivos**. Nada más cuelga de ahí.
- Bajo **colectivo**: nada. Es siempre una hoja — ahí es donde están los militantes (`User`).

Esta matriz vive en una tabla de base de datos, no en `if`s de Python. Si en el futuro hiciera falta un 6º
tipo de nivel (por ejemplo "comité de barrio"), se añade como una fila nueva de tipo + las filas que digan de
qué puede colgar y qué puede colgar de él — sin tocar el motor de permisos ni desplegar código nuevo.

## 3. Cómo se crea una unidad nueva (una vez exista la pantalla de administración)

Una unidad (`OrgUnit`) se crea eligiendo: **tipo** (de la lista de tipos permitidos según el padre elegido —
la pantalla no te dejará crear un colectivo directamente bajo consejo central si esa combinación no estuviera
en la matriz, aunque en este caso sí lo está) + **unidad padre** + **nombre**.

Internamente cada unidad guarda una "ruta" (`path`) que es la cadena de IDs de sus ancestros, algo como
`0000000001.0000000007.0000000042.` — esto es lo que permite, más adelante, responder rápido a preguntas como
"¿esta unidad está dentro de la autoridad de este admin?" sin tener que recorrer el árbol entero.

**Ejemplo paso a paso** (así se vería usar la futura pantalla "Estructura organizativa"):

1. Ya existe, sembrada automáticamente, la raíz: **Consejo Central**.
2. Un superadmin crea, bajo Consejo Central, un **comité regional** llamado "Andalucía".
3. Bajo "Andalucía", crea un **comité local** llamado "Sevilla".
4. Bajo "Sevilla", crea un **colectivo** llamado "Sevilla Centro" — aquí es donde, a partir de ahora, se dan de
   alta los militantes de esa zona (`users.org_unit_id` apunta a este colectivo).
5. Si además hace falta un eje temático que no es geográfico, p.ej. "Comité Sectorial de Feminismos", puede
   crearse tanto bajo Consejo Central (si es de ámbito estatal) como bajo el comité regional de Andalucía (si
   es solo del ámbito andaluz) — son ramas independientes del árbol, un mismo "tipo sectorial" puede existir en
   varios sitios a la vez con nombres distintos.

Una unidad **nunca se borra de verdad** — se desactiva (`is_active=0`). Esto evita romper el historial de
eventos/censos/usuarios que ya apuntan a ella, y permite reactivarla si fue un error.

## 4. Quién administra qué: las asignaciones (`AdminAssignment`)

Hoy la "delegación" de autoridad entre dominios es un hack oculto: escribir prefijos mágicos
(`domain:`, `manage-domain:`...) dentro de la etiqueta de grupo (`group_tag`) de un usuario. Este sistema lo
sustituye por una tabla explícita y auditable: `AdminAssignment(usuario, unidad)`.

**Regla central**: un admin asignado a una unidad puede gestionar esa unidad **y todo lo que cuelgue de ella**
(todo su subárbol), automáticamente — no hace falta asignarle cada colectivo hijo uno a uno.

Ejemplo: si asignas a Marta como admin del comité local "Sevilla" (paso 3 del ejemplo anterior), Marta puede
gestionar automáticamente también el colectivo "Sevilla Centro" y cualquier otro colectivo que se cree después
bajo "Sevilla" — sin ninguna acción adicional. Si mañana se crea "Sevilla Este" bajo el mismo comité local,
Marta ya tiene autoridad sobre él el mismo día, sin tener que re-otorgar nada.

Un mismo usuario puede tener varias asignaciones sueltas (p.ej. admin de "Sevilla" y, por separado, admin del
"Comité Sectorial de Feminismos" a nivel central) — su autoridad total es la unión de todos esos subárboles.

**Superadmin** sigue siendo el nivel por encima de todo: equivale a estar asignado a la raíz (Consejo Central),
así que alcanza cualquier unidad sin necesidad de una fila explícita.

## 5. Cómo se decide qué ve cada evento/censo/encuesta/espacio (distribución)

Cada elemento territorial (evento, censo, encuesta, espacio) se crea con:

- **Unidad propietaria**: dónde "nace" (normalmente la unidad del admin que lo crea).
- **Modo de distribución**, uno de tres:
  - `unit_only` — solo esa unidad exacta lo ve (el comportamiento de hoy, por defecto).
  - `subtree` — esa unidad **y todo lo que cuelga de ella** lo ve. Esto es lo que se usa para un **evento
    estatal**: unidad propietaria = Consejo Central, modo = `subtree` → llega a todos los territorios.
  - `custom` — una lista explícita de unidades adicionales (que no tienen por qué ser contiguas). Ejemplo:
    Consejo Central quiere convocar un evento solo en 3 comunidades autónomas concretas, sin que llegue a las
    demás — se listan esas 3 como destino, y cada una lo reparte automáticamente a todo lo que cuelgue de ella.

Un evento normal de un colectivo, tal y como funciona hoy, sigue siendo simplemente: unidad propietaria = el
colectivo, modo = `unit_only`. Nada cambia para el uso diario más básico.

## 6. El filtro de territorio para visitantes públicos (sin desvelar la estructura interna)

Esto es una pieza aparte, pensada específicamente para la vista pública sin login (`PublicHome`). Un
visitante debe poder decir "quiero ver eventos de mi provincia", pero el selector **no puede ser un
desplegable de comités reales** (eso revelaría dónde existe estructura y dónde no).

La solución: cada unidad (comité regional/local/sectorial/colectivo) lleva **etiquetas de territorio**
asociadas — ciudad, provincia o comunidad autónoma, según lo que tenga sentido para esa unidad concreta. Un
colectivo normal lleva una (su ciudad); un comité sectorial puede llevar **varias** (porque puede actuar sobre
varias ciudades sueltas que no son un territorio contiguo — es la particularidad que motivó que esta relación
sea de "varias etiquetas", no una sola). Consejo Central no lleva ninguna, porque está exento del filtro.

Al visitante se le muestra siempre **la lista completa y fija de las provincias de España** (un dato público y
estático, no generado a partir de qué unidades existen) — así elegir una provincia sin estructura real da
exactamente el mismo resultado ("no hay eventos aquí ahora mismo") que una provincia con estructura pero sin
eventos activos: indistinguibles para quien mira.

Los eventos **estatales** (Consejo Central, modo `subtree`) se muestran siempre, elija la provincia que elija
el visitante — es la única excepción al filtro.

## 7. Ejemplo completo de extremo a extremo

Encadenando todo lo anterior, así se vería usar el sistema completo el día que exista:

1. Superadmin crea el árbol: Andalucía (regional) → Sevilla (local) → Sevilla Centro (colectivo).
2. Etiqueta "Sevilla Centro" con territorio = ciudad "Sevilla" (de la que se deriva su provincia, Sevilla).
3. Asigna a Marta como admin de "Sevilla" (comité local) → Marta gestiona automáticamente "Sevilla Centro" y
   cualquier colectivo futuro bajo "Sevilla".
4. Marta da de alta militantes nuevos, que quedan colgados de "Sevilla Centro".
5. Marta crea un evento local normal (`unit_only`) — solo lo ven los militantes de Sevilla Centro, igual que
   hoy con un evento de "colectivo".
6. Desde el nivel central, se crea un evento estatal (`subtree` desde Consejo Central) — llega a Marta, a sus
   militantes, y a cualquier otro territorio del país, todo a la vez, sin tener que repetir la creación en
   cada sitio.
7. Un visitante sin cuenta entra a la web pública, elige "Sevilla" en el selector de provincia (lista fija de
   toda España) y ve: el evento estatal (siempre visible) + cualquier evento público que "Sevilla Centro" o
   "Sevilla" hayan hecho público — pero nunca ve el nombre real de "Comité Local de Sevilla" en ningún
   desplegable, solo el nombre de la provincia que él mismo eligió.
8. Cuando un admin de nivel superior (p.ej. el admin regional de Andalucía) entra a ver los datos de "Sevilla
   Centro" en detalle (no el resumen agregado), queda registrado en el log de auditoría — porque él no es el
   admin directo de esa unidad, es un ancestro suyo en el árbol.

## 8. Qué pasa con los datos que ya existen hoy

Nada se pierde ni se reinterpreta a mano: al implementarse, una migración automática (aditiva, no destructiva,
igual que las que ya existen en `ensure_legacy_schema_compatibility()`) crea un colectivo por cada dominio de
email que exista hoy, mueve a cada militante a su colectivo correspondiente, y da de alta automáticamente una
`AdminAssignment` para cada admin/superadmin actual sobre su propio colectivo — de forma que el primer día
después de implementarlo, nadie pierde acceso a nada de lo que ya gestionaba.

## 9. Qué falta para que esto exista de verdad

Este documento describe el diseño completo, pero construirlo son las Fases 1 a 6 del anexo de
[`PLAN_ESCALADO.md`](PLAN_ESCALADO.md#anexo-plan-de-federación-multi-territorio-propuesta-no-implementada):
esquema de base de datos, motor único de permisos (sustituyendo las comprobaciones actuales), modos de
distribución, agregación con auditoría de drill-down, y por último las pantallas de administración
(estructura organizativa, selector de ámbito persistente, etc.). Ahí está el detalle técnico completo —
tablas, funciones, endpoints y fases de despliegue — para cuando se decida empezar a construirlo.
