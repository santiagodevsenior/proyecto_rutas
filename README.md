# Rutas/Experto — Sistema experto de rutas para transporte masivo

Sistema inteligente basado en reglas lógicas que, a partir de una base
de conocimiento (estaciones, líneas y conexiones), infiere transbordos
y calcula la ruta de menor tiempo entre dos puntos de la red **real**
de TransMilenio (Bogotá/Soacha): 136 estaciones, 10 troncales
actualmente operativas y sus portales.

## Cómo está organizado

```
proyecto_rutas/
├── web/                      # ⭐ Frontend AUTOSUFICIENTE (HTML/CSS/JS, sin backend)
│   ├── index.html
│   ├── style.css
│   └── motor.js              #   El sistema experto completo, portado a JS puro
│   └── app.js                #   Conecta motor.js con la interfaz
│
├── src/                      # Backend en Python (opcional, para quien prefiera Python/API)
│   ├── conocimiento.py       #   Hechos, reglas, base de conocimiento
│   ├── motor_inferencia.py   #   Encadenamiento hacia adelante (forward chaining)
│   ├── reglas.py             #   Reglas lógicas del dominio (R1, R2, R3)
│   ├── grafo.py              #   Construcción del grafo a partir de los hechos
│   ├── rutas.py              #   Dijkstra + estructuras de resultado
│   ├── sistema_experto.py    #   Fachada: valida datos, persiste, calcula rutas
│   └── datos_ejemplo.py      #   Red de ejemplo (tipo Bogotá) para probar
├── api/
│   └── app.py                 # API REST (Flask), opcional — sirve el mismo web/ vía HTTP
├── cli/
│   └── main.py                # Menú interactivo por consola (usa src/, no requiere Flask)
├── tests/
│   └── test_sistema_experto.py   # Pruebas del backend en Python
├── data/                      # Aquí se pueden guardar redes exportadas/importadas
├── requirements.txt
└── README.md
```

**`web/motor.js` y `src/` implementan exactamente la misma lógica y la misma red**,
una en JavaScript y otra en Python — mismos hechos, mismas reglas
(R1/R2/R3), mismo Dijkstra, las 136 estaciones y 10 troncales reales de
TransMilenio. Se probaron uno contra otro y dan resultados idénticos.
Tenerlas separadas te da dos formas de usar el sistema sin que ninguna
dependa de la otra:

- **`web/` solo**: 100% en el navegador, cero instalación, funciona con
  doble clic en `index.html` o con la extensión "Go Live"/Live Server.
  Los cambios que hagas (agregar conexiones, importar una red) se
  guardan en el `localStorage` de tu navegador.
- **`src/` + `api/` + `cli/`**: si prefieres tener el motor en Python
  (para integrarlo a otro sistema, exponerlo como API real para varios
  usuarios, o correrlo por consola).

## Requisitos

- **Para `web/`**: ninguno. Cualquier navegador moderno.
- **Para `src/`, `api/`, `cli/`, `tests/`**: Python 3.9+ (Flask solo si usas `api/app.py`).

## Uso — Frontend en el navegador (recomendado, sin instalar nada)

Simplemente abre `web/index.html`:

- **Doble clic** en el archivo, o
- Clic derecho → "Open with Live Server" / botón "Go Live" en VS Code.

No hace falta `pip install`, no hace falta correr ningún servidor
Python, no hay puertos que coordinar. `web/motor.js` trae todo el
sistema experto (hechos, reglas, motor de inferencia, grafo, Dijkstra)
y corre enteramente en el navegador.

Vas a encontrar:

- **Planificador**: origen/destino con autocompletado, resultado como
  diagrama de estaciones coloreado por línea, tiempo total y transbordos.
- **Mapa**: diagrama esquemático de toda la red — haz clic en dos
  estaciones (origen y destino) y observa la búsqueda de Dijkstra
  explorando el grafo en vivo, nodo por nodo, antes de resaltar la ruta
  óptima.
- **Explorar red**: todas las líneas y sus estaciones en orden.
- **Administración**: agrega conexiones nuevas en caliente (el motor de
  inferencia se vuelve a ejecutar al instante), exporta/importa la red
  como JSON, o restaura la red de ejemplo. Los cambios persisten en tu
  navegador (localStorage) aunque cierres la pestaña.
- **Diagnóstico**: verifica si hay estaciones aisladas o subredes
  desconectadas, y revisa la traza del motor de inferencia.

## Uso — API en Python (opcional, avanzado)

Si prefieres tener el motor corriendo en Python en vez de en el
navegador (por ejemplo, para que varias personas compartan la misma
red desde un servidor central):

```bash
pip install -r requirements.txt
python api/app.py
```

Abre `http://localhost:5000` — Flask sirve la misma interfaz web,
pero esta vez hablando con el motor en Python vía API REST en lugar
de con `motor.js`. (Si en vez de esto abres `web/index.html` con Live
Server sin correr `api/app.py`, la página funciona igual, porque ya no
depende de la API — la corrección de `motor.js` fue justamente
eliminar esa dependencia.)

## Uso — Interfaz de consola (Python, sin Flask)

```bash
python -m cli.main
```

Menú equivalente al de la web, pensado para entornos sin navegador.

## Cómo cargar tu propia red de transporte

En vez de editar `src/datos_ejemplo.py`, exporta el formato JSON desde
la pestaña "Administración" (o con `sistema.exportar_json(...)`) para
ver la estructura esperada, y luego impórtalo:

```python
from src import SistemaExpertoRutas

sistema = SistemaExpertoRutas.importar_json("data/mi_red.json")
sistema.procesar_conocimiento()
```

O súbelo directamente desde la pestaña "Administración" de la interfaz web.

## Pruebas

```bash
python -m unittest discover -s tests -v
```

Cubren: validación de datos (nombres vacíos, tiempos inválidos,
auto-conexiones), cálculo de rutas y transbordos, terminación del
motor de inferencia con datos cíclicos, persistencia JSON (incluyendo
archivos corruptos) y detección de redes desconectadas.

## Cómo funciona (resumen técnico)

Aplica igual en `web/motor.js` (JavaScript) y en `src/` (Python) — son
la misma lógica en dos lenguajes.

1. **Hechos**: `estacion`, `linea`, `pertenece`, `conexion` — declarados
   por quien carga la red.
2. **Reglas lógicas**:
   - R1: valida una conexión y la habilita en ambos sentidos → `conectado`.
   - R2: si una estación pertenece a dos líneas → `punto_transbordo`.
   - R3: todo punto de transbordo obtiene una penalización de tiempo →
     `arista_transbordo`.
3. **Motor de inferencia**: aplica las reglas repetidamente hasta que no
   surgen hechos nuevos (punto fijo), con protección contra ciclos
   infinitos (límite de iteraciones).
4. **Grafo**: se construye con nodos `Estación@Línea` para que Dijkstra
   sepa en qué línea va el pasajero y cuente bien los transbordos.
5. **Dijkstra**: encuentra el camino de menor costo (tiempo de viaje +
   penalización de transbordos) entre cualquier nodo de origen/destino.

## La red: datos reales, tiempos estimados

Las **136 estaciones**, sus **10 troncales** (Caracas, Caracas Sur,
Autonorte, Suba, Calle 80, Américas, NQS, Eje Ambiental, Calle 26 y
Décima) y todos sus **portales** son los reales del sistema
TransMilenio de Bogotá y Soacha, reconstruidos a partir de fuentes
públicas (Wikipedia, transmilenio.gov.co, el buscador de rutas
oficial). No incluye la Troncal Carrera Séptima, que a la fecha de
escritura está en construcción, ni las rutas alimentadoras o zonales.

Las estaciones de transferencia real quedan modeladas como
compartidas entre líneas (la misma estación pertenece a más de una
línea, tal como en la vida real):

| Estación | Conecta |
|---|---|
| Avenida_Jiménez | Caracas + Américas + Eje Ambiental + Décima (el intercambiador más grande del sistema) |
| Ricaurte | Américas + NQS |
| Universidades | Eje Ambiental + Calle 26 |
| Héroes | Caracas + Autonorte |
| Flores | Caracas + Calle 80 |
| Escuela_Militar | Calle 80 + Suba + NQS |
| Calle_100 | Autonorte + NQS |
| Tercer_Milenio | Caracas + Caracas Sur |

**Los tiempos son estimaciones, no datos oficiales de itinerario.** El
tiempo de cada tramo (1.0–3.0 min) se calculó según qué tan seguido
suelen estar las estaciones en cada corredor (más cortos en el centro,
más largos en tramos periféricos), y la penalización de cada
transbordo (3–5 min, en `reglas.py` / `motor.js`) según qué tan grande
es ese intercambiador en la vida real — Avenida Jiménez y Ricaurte,
los más concurridos, penalizan más que un cruce simple como Héroes o
Flores. Si tienes los tiempos reales de itinerario de TransMilenio,
puedes reemplazarlos editando `datos_ejemplo.py` (Python) o
`construirEjemploBogota` en `motor.js`, o importando un JSON propio
desde la pestaña "Administración" / el endpoint `/api/importar`.

