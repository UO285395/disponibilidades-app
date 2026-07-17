# Plan de optimización

> **Estado: Fases 1 y 2 aplicadas y medidas.** Ver §6 al final para los resultados reales.

Repaso de rendimiento y peso de la aplicación. **Todo lo que sigue está medido**, no estimado:
las cifras salen de instrumentar el backend contando consultas SQL reales con volumen de prueba
(40 eventos, 60 usuarios, 5 colectivos bajo un comité regional) y de inspeccionar el bundle real.

---

## 1. Diagnóstico medido

### Backend: latencia y consultas por petición

| Endpoint | Tiempo | Consultas SQL | Causa |
|---|---:|---:|---|
| `GET /admin/users` (60 usuarios, **admin normal**) | 254 ms | **228** | Permisos re-consultados por cada usuario |
| `GET /admin/availability` (60 franjas) | 235 ms | **257** | Igual + limpieza en cada petición |
| `GET /events` (40 eventos) | 296 ms | **243** | ~6 `COUNT` por evento |
| `GET /events?province_id=` (visitante) | 251 ms | **201** | Bucle de unidades × alcance |
| `GET /admin/org/tree` | 30 ms | 25 | 2 `COUNT` por unidad |
| `GET /me` (admin normal) | 26 ms | 25 | 8 comprobaciones de módulo × ~3 consultas |

> **Dato clave**: `GET /admin/users` como **superadmin** son solo **3 consultas**, pero como **admin
> normal** son **228**. El superadmin tiene un atajo (`role == "superadmin" → True`) que cortocircuita
> las comprobaciones de permisos y **oculta el problema**. El caso real de uso —un admin de estructura—
> es el que sufre. Cualquier medición hecha solo con superadmin da una falsa sensación de rapidez.

### Impacto real en producción

Estas cifras son con **SQLite local** (consultas de microsegundos). En producción el backend usa
**Postgres en Railway, por red**: cada consulta es un viaje de ida y vuelta. 228 consultas a ~1-3 ms
de latencia de red = **0,3–0,7 s solo en esperas**, por petición. Es la causa más probable de que la
app se sienta lenta al refrescar.

### Frontend: peso

| Recurso | Tamaño |
|---|---:|
| JS (un solo chunk) | **583 kB** (~181 kB gzip) |
| CSS | **198 kB** |
| **Total** | **~781 kB** |

- **Sin code splitting**: un visitante sin cuenta que solo mira eventos públicos se descarga
  *también* todo el panel de administración (9 componentes: usuarios, políticas, censo, encuestas,
  notificaciones, organigrama…). Es la mayor parte de los componentes de la app.
- **Dependencias declaradas y no usadas**: `axios`, `@mantine/dates`, `dayjs` aparecen en
  `package.json` pero **no se importan en ningún archivo** (0 usos). No engordan el bundle enviado
  (Rollup las descarta al no importarse), pero sí el `node_modules`, el `package-lock`, el tiempo de
  `npm install` y el de compilación del APK.
- `OrgUnitSelect` pide `/admin/org/tree` **en cada instancia**: una pantalla con 2-3 selectores hace
  2-3 peticiones idénticas simultáneas.
- El calendario hace **polling cada 15 s** descargando el listado completo, aunque no haya cambios.

---

## 2. Causa raíz

Casi toda la lentitud del backend viene de **tres patrones N+1**, no de consultas lentas:

1. **El motor de permisos no cachea nada.** `authorized_root_units(db, admin)` consulta
   `AdminAssignment` + `OrgUnit` **cada vez que se llama**, y se llama dentro de bucles
   (`[u for u in users if _can_admin_manage_user(admin, u, db)]`). Con 60 usuarios → ~180 consultas
   para responder algo que necesita 2.
2. **Los conteos de eventos se hacen uno a uno.** `_serialize_event_with_counts` lanza ~6 `COUNT`
   por evento (sí/no militantes, acompañantes, sí/no/acompañantes visitantes). Con 40 eventos → 240
   consultas que podrían ser 3 agregadas con `GROUP BY`.
3. **Las políticas se recargan enteras en cada comprobación.** `_get_applicable_policies` hace
   `db.query(DomainPolicy).all()`, y `/me` comprueba 8 módulos → 8 recargas por petición.

Ninguno se arregla con índices: son **viajes de más**, no consultas lentas.

---

## 3. Plan de mejora (priorizado por impacto / esfuerzo)

### Fase 1 — Eliminar los N+1 del backend `[impacto muy alto · esfuerzo bajo]`

| # | Acción | Efecto esperado |
|---|---|---|
| 1.1 | **Cachear la autoridad del admin por petición** (sus unidades y su subárbol se resuelven una vez y se reutilizan) | `/admin/users` **228 → ~5** consultas |
| 1.2 | **Conteos de eventos agregados**: 3 consultas con `GROUP BY event_id` en vez de 6 por evento | `/events` **243 → ~5** consultas |
| 1.3 | **Cachear políticas por petición** y reutilizarlas entre las 8 comprobaciones de módulo | `/me` **25 → ~3** consultas |
| 1.4 | **Sacar `cleanup_expired_data` de `/admin/availability`**: hoy borra y hace `commit` en **cada** lectura. Debe ser tarea periódica o de arranque | Quita escrituras del camino de lectura |
| 1.5 | **Precalcular el conjunto de unidades de la provincia** una sola vez en el filtro público | `/events?province_id` **201 → ~5** |
| 1.6 | Conteos del árbol (`serialize_unit`) agregados | `/admin/org/tree` **25 → ~3** |

> Es la fase con mejor relación impacto/esfuerzo: son cambios localizados en `org_service.py` y en los
> serializadores, sin tocar el modelo de datos ni la semántica de permisos.

### Fase 2 — Aligerar el frontend `[impacto alto · esfuerzo medio]`

| # | Acción | Efecto esperado |
|---|---|---|
| 2.1 | **Code splitting del panel admin** (`React.lazy` + `Suspense` en las rutas `/admin*`) | El visitante/militante deja de descargar el código de administración |
| 2.2 | **`manualChunks`**: separar vendor (react, router, mantine) del código de la app | Mejor caché entre despliegues: al cambiar la app no se reinvalida el vendor |
| 2.3 | **Quitar dependencias muertas** (`axios`, `@mantine/dates`, `dayjs`) | Menos `node_modules`, install y build del APK más rápidos (no cambia el bundle) |
| 2.4 | Revisar el CSS de Mantine (198 kB) e importar solo lo necesario | Menos CSS de arranque |

### Fase 3 — Red y refresco `[impacto medio · esfuerzo bajo]`

| # | Acción | Efecto esperado |
|---|---|---|
| 3.1 | **Compartir el árbol del organigrama** entre selectores (contexto/caché en memoria) en vez de refetch por instancia | 2-3 peticiones → 1 |
| 3.2 | **Polling del calendario**: sustituir el intervalo fijo de 15 s por refresco en foco + `ETag`/`304` | Menos tráfico y menos trabajo del servidor en reposo |
| 3.3 | **Paginación** en listados que crecen (usuarios, eventos, disponibilidades) | Respuestas de tamaño acotado |
| 3.4 | Devolver solo los campos que la vista usa | Menos payload |

### Fase 4 — Base de datos `[impacto medio · esfuerzo bajo]`

| # | Acción |
|---|---|
| 4.1 | Índices en las columnas de filtro caliente: `event_responses.event_id`, `guest_responses.event_id` (ya existe), `availabilities.date`, `users.org_unit_id` (ya existe) |
| 4.2 | Sustituir los `.all()` sobre tablas completas (`db.query(User).all()`, `db.query(DomainPolicy).all()`) por consultas filtradas |
| 4.3 | Revisar el `pool_pre_ping` y el tamaño de pool para Railway |

---

## 4. Orden recomendado

1. **Fase 1** primero: es donde está el 80 % de la mejora percibida ("aligerar la respuesta de todas
   las acciones"), con el menor riesgo.
2. **Fase 2.1** (code splitting) después: es la que más aligera la carga inicial y el APK.
3. **Fase 3** para el refresco.
4. **Fase 4** al final: sin los N+1 resueltos, los índices apenas se notan.

## 5. Cómo verificar que funciona

El script de medición usado para este diagnóstico debe re-ejecutarse tras cada fase: instrumenta
`before_cursor_execute` de SQLAlchemy para contar consultas reales por endpoint con volumen de prueba.
**El criterio de aceptación es el número de consultas, no el tiempo** (en SQLite local los tiempos
engañan; lo que se traduce a producción es el número de viajes a la base de datos).

Regla para no repetir el error: **medir siempre como admin normal, nunca solo como superadmin**, que
tiene atajos que ocultan los N+1.

---

## 6. Resultados reales (Fases 1 y 2 aplicadas)

### Fase 1 — Backend: medido antes/después con el mismo instrumental

| Endpoint | Antes | Después | Mejora |
|---|---:|---:|---:|
| `/admin/users` (60 usuarios, admin normal) | 228 q · 254 ms | **8 q · 26 ms** | **28× menos consultas** |
| `/admin/availability` (60 franjas) | 257 q · 235 ms | **8 q · 30 ms** | **32× menos** |
| `/events` (40 eventos) | 243 q · 296 ms | **6 q · 21 ms** | **40× menos** |
| `/events` (visitante) | 241 q · 288 ms | **4 q · 17 ms** | **60× menos** |
| `/events?province_id` | 201 q · 251 ms | **10 q · 17 ms** | **20× menos** |
| `/me` (admin normal) | 25 q · 26 ms | **3 q · 12 ms** | **8× menos** |
| `/admin/org/tree` | 25 q · 30 ms | **7 q · 16 ms** | 3,5× menos |

**Lo importante no es el tiempo, es que el número de consultas ya no crece con el volumen.** Antes,
el doble de usuarios significaba el doble de consultas; ahora es constante. En Postgres por red (que
es lo que corre en producción) esto se traduce en cientos de viajes ahorrados por petición.

Los límites de autoridad se verificaron intactos tras el cambio (un admin sigue sin ver ni poder
crear fuera de su rama).

### Fase 2 — Frontend: resultado honesto

| | Antes | Después |
|---|---:|---:|
| JS que descarga un **visitante** | 583 kB (181 kB gzip) | **~505 kB (~160 kB gzip)** |
| Código de administración | Siempre | **Solo al entrar al panel** (62 kB) |
| Chunks | 1 | Entry + vendor-react + vendor-mantine + 5 bajo demanda |

**Con perspectiva**: la mejora del frontend es **moderada (~11 % gzip para el visitante)**, no
espectacular, y conviene decirlo. El motivo es que **Mantine domina el peso** (250 kB JS + 203 kB CSS)
y las páginas públicas también lo necesitan, así que no se puede diferir. Lo que sí aporta:
- El panel admin (62 kB) ya no lo descarga quien no lo usa.
- El *vendor* separado significa que **desplegar un cambio nuestro ya no invalida la caché de
  React/Mantine** en el navegador ni en la APK: las actualizaciones se descargan mucho más ligeras.

**Descartado a propósito**: trocear el CSS de Mantine por componente. Son 203 kB en bruto pero solo
**30 kB comprimidos** por la red; trocearlo obliga a listar cada componente usado, es frágil y se
rompe en silencio al añadir uno nuevo. El coste/beneficio no sale.

### Conclusión

**El cuello de botella real era el backend, no el peso del frontend.** La sensación de lentitud al
refrescar venía de cientos de viajes a la base de datos por petición, no de descargar JavaScript.
Quedan pendientes las Fases 3 y 4, de menor impacto.
