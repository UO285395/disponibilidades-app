"""División administrativa de España: comunidades autónomas y provincias.

Datos estáticos y públicos, usados para (a) sembrar las tablas de geografía y
(b) el filtro público por provincia de los visitantes sin cuenta. No tiene
relación con la estructura organizativa interna.
"""

# (nombre_comunidad, [provincias...])
COMMUNITIES_AND_PROVINCES = [
    ("Andalucía", ["Almería", "Cádiz", "Córdoba", "Granada", "Huelva", "Jaén", "Málaga", "Sevilla"]),
    ("Aragón", ["Huesca", "Teruel", "Zaragoza"]),
    ("Principado de Asturias", ["Asturias"]),
    ("Illes Balears", ["Illes Balears"]),
    ("Canarias", ["Las Palmas", "Santa Cruz de Tenerife"]),
    ("Cantabria", ["Cantabria"]),
    ("Castilla y León", ["Ávila", "Burgos", "León", "Palencia", "Salamanca", "Segovia", "Soria", "Valladolid", "Zamora"]),
    ("Castilla-La Mancha", ["Albacete", "Ciudad Real", "Cuenca", "Guadalajara", "Toledo"]),
    ("Cataluña", ["Barcelona", "Girona", "Lleida", "Tarragona"]),
    ("Comunitat Valenciana", ["Alicante", "Castellón", "Valencia"]),
    ("Extremadura", ["Badajoz", "Cáceres"]),
    ("Galicia", ["A Coruña", "Lugo", "Ourense", "Pontevedra"]),
    ("Comunidad de Madrid", ["Madrid"]),
    ("Región de Murcia", ["Murcia"]),
    ("Comunidad Foral de Navarra", ["Navarra"]),
    ("País Vasco", ["Araba/Álava", "Bizkaia", "Gipuzkoa"]),
    ("La Rioja", ["La Rioja"]),
    ("Ceuta", ["Ceuta"]),
    ("Melilla", ["Melilla"]),
]
