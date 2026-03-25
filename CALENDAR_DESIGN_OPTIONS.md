# Rediseño de Calendario: Opciones de UX para Móvil

## Problema actual

El calendario actual es una **tabla 7 días × 16 horas** que requiere scroll horizontal en móvil, lo que es incómodo e incómodo en pantallas pequeñas.

---

## OPCIÓN A: Minicalendarios Verticales (⭐ RECOMENDADA)

### Visualización en Móvil

```
═══════════════════════════════════════════
┌─────────────────────────────────────────┐
│  🗓️  LUNES 25 de marzo                  │
│  ─────────────────────────────────────  │
│  ☑️ [08:00 - 09:00]                    │
│  ☐ [09:00 - 10:00]                    │
│  ☑️ [10:00 - 11:00]                    │
│  ☑️ [11:00 - 12:00]                    │
│  ☐ [12:00 - 13:00]                    │
│  ☐ [13:00 - 14:00] ← scroll vertical   │
│  ☑️ [14:00 - 15:00]                    │
│  ☐ [15:00 - 16:00]                    │
│     ... (8 más)                        │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  🗓️  MARTES 26 de marzo                 │
│  ─────────────────────────────────────  │
│  ☐ [08:00 - 09:00]                    │
│  ☐ [09:00 - 10:00]                    │
│     ... (14 más)                       │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  🗓️  MIÉRCOLES 27 de marzo              │
│     ... (16 horas)                     │
└─────────────────────────────────────────┘
```

### Visualización en Desktop (1280px)

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Lunes 25         │  │ Martes 26        │  │ Miércoles 27     │
│ ☑ 08:00-09:00   │  │ ☐ 08:00-09:00   │  │ ☑ 08:00-09:00   │
│ ☐ 09:00-10:00   │  │ ☐ 09:00-10:00   │  │ ☐ 09:00-10:00   │
│ ☑ 10:00-11:00   │  │ ☑ 10:00-11:00   │  │ ☐ 10:00-11:00   │
│ ☑ 11:00-12:00   │  │ ... (13 más)     │  │ ... (13 más)     │
│ ... (12 más)     │  │                  │  │                  │
└──────────────────┘  └──────────────────┘  └──────────────────┘

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Jueves 28        │  │ Viernes 29       │  │ Sábado 30        │
│ ☐ 08:00-09:00   │  │ ☑ 08:00-09:00   │  │ ☑ 08:00-09:00   │
│ ... (15 más)     │  │ ... (15 más)     │  │ ... (15 más)     │
└──────────────────┘  └──────────────────┘  └──────────────────┘

┌──────────────────┐
│ Domingo 31       │
│ ☐ 08:00-09:00   │
│ ... (15 más)     │
└──────────────────┘
```

### Características Clave

✅ **Ventajas**:
- Scroll **vertical natural** (móvil lo hace bien de por defecto)
- **Todos los días visibles a la vez** en desktop (contexto completo)
- Cada día es un **bloque cognitivo independiente**
- UI **limpia y consistente**
- Escala bien: 1 card/fila en móvil → 3 cards/fila en desktop

❌ **Desventajas**:
- Ligeramente más espacio que tabla original
- Requiere scroll más que tabla (pero vertical, no horizontal)

---

## OPCIÓN B: Accordion por Día (Compacta)

### Visualización en Móvil

```
═══════════════════════════════════════════
┌─ 🗓️  LUNES 25                    ▼ ─────┐
│  (collapse/expand con click)        │
├─────────────────────────────────────┤
│  ☑️ [08:00 - 09:00]                │
│  ☐ [09:00 - 10:00]                │
│  ☑️ [10:00 - 11:00]                │
│     ... (13 más)                   │
└─────────────────────────────────────┘

┌─ ▶ MARTES 26          [COLLAPSED] ──┐
└─────────────────────────────────────┘

┌─ ▶ MIÉRCOLES 27       [COLLAPSED] ──┐
└─────────────────────────────────────┘

┌─ ▶ JUEVES 28          [COLLAPSED] ──┐
└─────────────────────────────────────┘
```

### Características Clave

✅ **Ventajas**:
- **Ultra compacto** de inicio (solo 1-2 líneas por día)
- Usuario controla qué ve
- Reduce scroll initial

❌ **Desventajas**:
- **No hay contexto de otros días** (hay que expandir cada uno)
- Requiere más clics para planificar semana
- UX poco intuitiva para plannificación de disponibilidad

---

## OPCIÓN C: Tabs/Navegación por Día

### Visualización en Móvil

```
═══════════════════════════════════════════
[ ◀ LUNES 25 DE MARZO ▶ ]

┌─────────────────────────────────────────┐
│ Disponibilidad para LUNES 25            │
│ ─────────────────────────────────────   │
│ ☑️ [08:00 - 09:00]                    │
│ ☐ [09:00 - 10:00]                    │
│ ☑️ [10:00 - 11:00]                    │
│ ☑️ [11:00 - 12:00]                    │
│ ☐ [12:00 - 13:00]                    │
│ ☐ [13:00 - 14:00]                    │
│ ☑️ [14:00 - 15:00]                    │
│ ☐ [15:00 - 16:00]                    │
│     ... (8 más)                        │
└─────────────────────────────────────────┘
```

### Características Clave

✅ **Ventajas**:
- **Simple y limpio**
- Un calendario visible a la vez
- No hay scroll

❌ **Desventajas**:
- **No ve contexto de otros días**
- Tedioso para planificar semana completa
- Requiere muchos clics para cambiar de día

---

## Recomendación: OPCIÓN A ⭐

**Mejor relación entre UX en móvil y desktop.**

- Móvil: scroll vertical natural, contexto completo
- Desktop: vista elegante de 3 cards/fila
- UX intuitiva para planificación de disponibilidades semanales

### Segunda opción: Opción B si necesitas máxima compactidad

---

## Comparativa Técnica

| Aspecto | Opción A | Opción B | Opción C |
|---------|----------|----------|----------|
| Scroll horizontal | ❌ No | ❌ No | ❌ No |
| Contexto múltiples días | ✅ Sí | ❌ No | ❌ No |
| Clics para ver todos días | 0 | 7 | 7 |
| Compactidad inicial | Media | Muy alta | Muy alta |
| UX para planificar semanal | ✅ Excelente | ❌ Mala | ❌ Mala |
| Escalabilidad responsive | ✅ Excelente | Buena | Buena |
| Esfuerzo implementación | Medio | Bajo | Bajo |

---

## Próximos Pasos

Si apruebas **Opción A**, el sprint estimado es **6-8 horas**:

1. Crear componente `MobileWeekCalendar.jsx`
2. Grid responsive con Mantine
3. Misma lógica de toggle que WeekCalendar actual
4. Testing y ajustes visuales

¿Quieres proceder con Opción A o prefieres una alternativa?
