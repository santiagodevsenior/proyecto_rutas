// =============================================================
// RUTAS/EXPERTO — Motor del sistema experto (JavaScript puro)
// =============================================================
// Es el mismo diseño que el backend en Python (src/), pero corre
// enteramente en el navegador: no necesita Flask, ni pip install,
// ni un segundo servidor. Basta con abrir index.html (con doble
// clic, o con "Go Live" / Live Server).
//
// Módulos, igual que en el proyecto Python:
//   1. BaseConocimiento   -> hechos (predicado + argumentos)
//   2. Reglas de dominio  -> R1 (conexión), R2 (transbordo), R3 (penalización)
//   3. MotorInferencia    -> encadenamiento hacia adelante
//   4. GrafoTransporte    -> construido desde los hechos inferidos
//   5. Dijkstra           -> ruta de menor costo
//   6. SistemaExpertoRutas -> fachada con validación y persistencia
//
// Todo va dentro de un IIFE (función que se ejecuta a sí misma) para
// que las clases NO queden declaradas en el ámbito global. Esto evita
// el error "Identifier ... has already been declared" si, por algún
// motivo del navegador o del servidor de desarrollo (recarga en
// caliente de Live Server, caché, etc.), este archivo llega a
// ejecutarse más de una vez en la misma página: cada ejecución tiene
// su propio ámbito aislado y no choca con la anterior.
// =============================================================

(function (global) {
"use strict";

class DatoInvalidoError extends Error {}

// ------------------------- 1. Base de conocimiento -------------------------

class BaseConocimiento {
  constructor() {
    this._hechos = new Map(); // clave -> {predicado, argumentos}
  }

  static _clave(predicado, argumentos) {
    return predicado + "|" + JSON.stringify(argumentos);
  }

  agregarHecho(predicado, ...argumentos) {
    const clave = BaseConocimiento._clave(predicado, argumentos);
    if (this._hechos.has(clave)) return false;
    this._hechos.set(clave, { predicado, argumentos });
    return true;
  }

  existe(predicado, ...argumentos) {
    return this._hechos.has(BaseConocimiento._clave(predicado, argumentos));
  }

  consultar(predicado) {
    return [...this._hechos.values()].filter(h => h.predicado === predicado);
  }

  get size() { return this._hechos.size; }
}

// ------------------------- 2. Reglas del dominio -------------------------

const TIEMPO_PROMEDIO_TRANSBORDO = 4; // minutos: valor por defecto

// Penalización de transbordo diferenciada por estación (ver la
// explicación completa en el src/reglas.py de la versión Python: los
// intercambiadores grandes y concurridos toman más tiempo que un
// simple cruce de andén).
const PENALIZACIONES_TRANSBORDO_MINUTOS = {
  "Avenida_Jiménez": 5,
  "Ricaurte": 5,
  "Universidades": 4,
  "Escuela_Militar": 4,
  "Héroes": 3,
  "Flores": 3,
  "Polo": 3,
  "Calle_100": 3,
  "Tercer_Milenio": 3,
  "Comuneros": 3,
};

function penalizacionTransbordo(estacion) {
  return PENALIZACIONES_TRANSBORDO_MINUTOS[estacion] ?? TIEMPO_PROMEDIO_TRANSBORDO;
}

function crearReglasDominio() {
  const reglas = [];

  // R1: valida una conexión y la habilita en ambos sentidos -> "conectado"
  reglas.push({
    nombre: "R1_validar_conexion",
    descripcion: "La conexión es válida porque ambas estaciones pertenecen a la misma línea; se habilita en ambos sentidos.",
    condicion(base) {
      const bindings = [];
      for (const h of base.consultar("conexion")) {
        const [e1, e2, linea, tiempo] = h.argumentos;
        if (base.existe("pertenece", e1, linea) && base.existe("pertenece", e2, linea)) {
          bindings.push([e1, e2, linea, tiempo]);
        }
      }
      return bindings;
    },
    accion(base, [e1, e2, linea, tiempo]) {
      const a1 = base.agregarHecho("conectado", e1, e2, linea, tiempo);
      const a2 = base.agregarHecho("conectado", e2, e1, linea, tiempo);
      return a1 || a2;
    },
  });

  // R2: una estación en dos líneas distintas -> "punto_transbordo"
  reglas.push({
    nombre: "R2_detectar_transbordo",
    descripcion: "La estación pertenece a dos líneas distintas, por lo tanto es un punto válido de transbordo.",
    condicion(base) {
      const bindings = [];
      const pertenencias = base.consultar("pertenece");
      for (let i = 0; i < pertenencias.length; i++) {
        for (let j = 0; j < pertenencias.length; j++) {
          if (i === j) continue;
          const [e1, l1] = pertenencias[i].argumentos;
          const [e2, l2] = pertenencias[j].argumentos;
          if (e1 === e2 && l1 !== l2) bindings.push([e1, l1, l2]);
        }
      }
      return bindings;
    },
    accion(base, [estacion, l1, l2]) {
      return base.agregarHecho("punto_transbordo", estacion, l1, l2);
    },
  });

  // R3: todo punto de transbordo obtiene una penalización de tiempo
  // (diferenciada por estación: ver penalizacionTransbordo)
  reglas.push({
    nombre: "R3_penalizar_transbordo",
    descripcion: "Todo punto de transbordo implica un costo adicional de tiempo que depende de qué tan grande es el intercambiador en esa estación.",
    condicion(base) {
      return base.consultar("punto_transbordo").map(h => h.argumentos);
    },
    accion(base, [estacion, l1, l2]) {
      const penalizacion = penalizacionTransbordo(estacion);
      return base.agregarHecho("arista_transbordo", estacion, l1, l2, penalizacion);
    },
  });

  return reglas;
}

// ------------------------- 3. Motor de inferencia -------------------------

class MotorInferencia {
  constructor(base, reglas) {
    this.base = base;
    this.reglas = reglas;
    this.traza = [];
  }

  ejecutar(maxIteraciones = 50) {
    for (let iteracion = 1; iteracion <= maxIteraciones; iteracion++) {
      let huboCambio = false;
      for (const regla of this.reglas) {
        for (const binding of regla.condicion(this.base)) {
          if (regla.accion(this.base, binding)) {
            huboCambio = true;
            this.traza.push(
              `[Iteración ${iteracion}] Se disparó la regla '${regla.nombre}' con datos ` +
              `${JSON.stringify(binding)} => ${regla.descripcion}`
            );
          }
        }
      }
      if (!huboCambio) {
        this.traza.push(`Punto fijo alcanzado en la iteración ${iteracion}: no se generaron hechos nuevos.`);
        break;
      }
    }
  }
}

// ------------------------- 4. Grafo de transporte -------------------------

class GrafoTransporte {
  constructor() { this.adyacencias = new Map(); }

  _asegurarNodo(nodo) {
    if (!this.adyacencias.has(nodo)) this.adyacencias.set(nodo, []);
  }

  agregarArista(origen, arista) {
    this._asegurarNodo(origen);
    this._asegurarNodo(arista.destino);
    this.adyacencias.get(origen).push(arista);
  }

  vecinos(nodo) { return this.adyacencias.get(nodo) || []; }
}

function construirGrafoExtendido(base) {
  const grafo = new GrafoTransporte();

  for (const h of base.consultar("conectado")) {
    const [origen, destino, linea, tiempo] = h.argumentos;
    grafo.agregarArista(`${origen}@${linea}`, {
      destino: `${destino}@${linea}`, costo: tiempo, tipo: "tramo",
      lineaOrigen: linea, lineaDestino: linea,
    });
  }

  for (const h of base.consultar("arista_transbordo")) {
    const [estacion, l1, l2, penalizacion] = h.argumentos;
    grafo.agregarArista(`${estacion}@${l1}`, {
      destino: `${estacion}@${l2}`, costo: penalizacion, tipo: "transbordo",
      lineaOrigen: l1, lineaDestino: l2,
    });
    grafo.agregarArista(`${estacion}@${l2}`, {
      destino: `${estacion}@${l1}`, costo: penalizacion, tipo: "transbordo",
      lineaOrigen: l2, lineaDestino: l1,
    });
  }

  return grafo;
}

// ------------------------- 5. Dijkstra -------------------------

function dijkstra(grafo, origenes, destinos) {
  const distancias = new Map();
  for (const n of grafo.adyacencias.keys()) distancias.set(n, Infinity);
  const previo = new Map();
  const visitado = new Set();
  const ordenVisitados = []; // para poder animar la exploración paso a paso

  // Cola de prioridad simple (arreglo + ordenar). Suficiente para el
  // tamaño típico de una red de transporte masivo.
  let cola = [];
  for (const o of origenes) {
    distancias.set(o, 0);
    cola.push({ costo: 0, nodo: o });
  }

  let destinoAlcanzado = null;
  while (cola.length) {
    cola.sort((a, b) => a.costo - b.costo);
    const { costo: costoActual, nodo: nodoActual } = cola.shift();

    if (visitado.has(nodoActual)) continue;
    visitado.add(nodoActual);
    ordenVisitados.push(nodoActual);

    if (destinos.has(nodoActual)) { destinoAlcanzado = nodoActual; break; }

    for (const arista of grafo.vecinos(nodoActual)) {
      const nuevoCosto = costoActual + arista.costo;
      if (nuevoCosto < (distancias.get(arista.destino) ?? Infinity)) {
        distancias.set(arista.destino, nuevoCosto);
        previo.set(arista.destino, { anterior: nodoActual, arista });
        cola.push({ costo: nuevoCosto, nodo: arista.destino });
      }
    }
  }

  return { destinoAlcanzado, distancias, previo, nodosExplorados: visitado.size, ordenVisitados };
}

function reconstruirCamino(destinoFinal, previo) {
  const camino = [];
  let nodo = destinoFinal;
  while (previo.has(nodo)) {
    const { anterior, arista } = previo.get(nodo);
    camino.push({ nodo, arista });
    nodo = anterior;
  }
  camino.push({ nodo, arista: null });
  camino.reverse();
  return camino;
}

// ------------------------- Similitud de texto (para sugerencias) -------------------------
// Equivalente aproximado a difflib.get_close_matches de Python, basado
// en distancia de Levenshtein normalizada.

function distanciaLevenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + costo);
    }
  }
  return dp[m][n];
}

function similitud(a, b) {
  const distancia = distanciaLevenshtein(a.toLowerCase(), b.toLowerCase());
  const maxLen = Math.max(a.length, b.length) || 1;
  return 1 - distancia / maxLen;
}

// ------------------------- 6. Fachada: SistemaExpertoRutas -------------------------

class SistemaExpertoRutas {
  constructor() {
    this.base = new BaseConocimiento();
    this.reglas = crearReglasDominio();
    this.motor = null;
    this.grafo = null;
  }

  static _normalizar(texto, campo) {
    if (texto === null || texto === undefined) {
      throw new DatoInvalidoError(`El campo '${campo}' no puede ser nulo.`);
    }
    const limpio = String(texto).trim().split(/\s+/).filter(Boolean).join(" ");
    if (!limpio) throw new DatoInvalidoError(`El campo '${campo}' no puede estar vacío.`);
    return limpio;
  }

  declararEstacion(nombre) {
    this.base.agregarHecho("estacion", SistemaExpertoRutas._normalizar(nombre, "nombre de estación"));
  }

  declararLinea(nombre) {
    this.base.agregarHecho("linea", SistemaExpertoRutas._normalizar(nombre, "nombre de línea"));
  }

  declararPertenencia(estacion, linea) {
    estacion = SistemaExpertoRutas._normalizar(estacion, "estación");
    linea = SistemaExpertoRutas._normalizar(linea, "línea");
    this.base.agregarHecho("pertenece", estacion, linea);
  }

  declararConexion(e1, e2, linea, tiempoMin) {
    e1 = SistemaExpertoRutas._normalizar(e1, "estación 1");
    e2 = SistemaExpertoRutas._normalizar(e2, "estación 2");
    linea = SistemaExpertoRutas._normalizar(linea, "línea");

    if (e1 === e2) {
      throw new DatoInvalidoError(`No se puede conectar la estación '${e1}' consigo misma (auto-conexión).`);
    }
    const tiempo = Number(tiempoMin);
    if (Number.isNaN(tiempo)) {
      throw new DatoInvalidoError(`El tiempo del tramo debe ser un número; se recibió: ${tiempoMin}.`);
    }
    if (tiempo <= 0) throw new DatoInvalidoError(`El tiempo del tramo debe ser mayor que cero (se recibió ${tiempo}).`);
    if (tiempo > 180) {
      throw new DatoInvalidoError(`El tiempo del tramo (${tiempo} min) parece un error de captura (supera 3 horas).`);
    }

    this.base.agregarHecho("conexion", e1, e2, linea, tiempo);
  }

  procesarConocimiento() {
    this.motor = new MotorInferencia(this.base, this.reglas);
    this.motor.ejecutar();
    this.grafo = construirGrafoExtendido(this.base);
  }

  agregarConexionYReinferir(e1, e2, linea, tiempoMin) {
    const e1n = SistemaExpertoRutas._normalizar(e1, "estación 1");
    const e2n = SistemaExpertoRutas._normalizar(e2, "estación 2");
    const lineaN = SistemaExpertoRutas._normalizar(linea, "línea");
    this.declararConexion(e1n, e2n, lineaN, tiempoMin); // valida primero
    this.declararEstacion(e1n);
    this.declararEstacion(e2n);
    this.declararPertenencia(e1n, lineaN);
    this.declararPertenencia(e2n, lineaN);
    this.procesarConocimiento();
  }

  listarEstaciones() {
    return [...new Set(this.base.consultar("estacion").map(h => h.argumentos[0]))].sort();
  }

  listarLineas() {
    return [...new Set(this.base.consultar("linea").map(h => h.argumentos[0]))].sort();
  }

  estacionesPorLinea(linea) {
    return [...new Set(
      this.base.consultar("pertenece").filter(h => h.argumentos[1] === linea).map(h => h.argumentos[0])
    )].sort();
  }

  lineasDeEstacion(estacion) {
    return [...new Set(
      this.base.consultar("pertenece").filter(h => h.argumentos[0] === estacion).map(h => h.argumentos[1])
    )].sort();
  }

  esEstacionValida(estacion) { return this.base.existe("estacion", estacion); }

  sugerirEstacion(nombreIncorrecto, n = 3) {
    return this.listarEstaciones()
      .map(e => ({ estacion: e, score: similitud(nombreIncorrecto, e) }))
      .filter(c => c.score >= 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, n)
      .map(c => c.estacion);
  }

  infoEstacion(estacion) {
    if (!this.esEstacionValida(estacion)) {
      return { existe: false, sugerencias: this.sugerirEstacion(estacion) };
    }
    const lineas = this.lineasDeEstacion(estacion);
    return { existe: true, estacion, lineas, esTransbordo: lineas.length > 1 };
  }

  exportarDiccionario() {
    return {
      lineas: this.listarLineas(),
      estaciones: this.listarEstaciones(),
      pertenencias: this.base.consultar("pertenece").map(h => ({ estacion: h.argumentos[0], linea: h.argumentos[1] })),
      conexiones: this.base.consultar("conexion").map(h => ({
        origen: h.argumentos[0], destino: h.argumentos[1], linea: h.argumentos[2], tiempo_min: h.argumentos[3],
      })),
    };
  }

  static cargarDesdeDiccionario(datos) {
    for (const campo of ["lineas", "estaciones", "pertenencias", "conexiones"]) {
      if (!(campo in datos)) throw new DatoInvalidoError(`Faltan datos: no se encontró la clave '${campo}'.`);
    }
    const sistema = new SistemaExpertoRutas();
    const errores = [];

    for (const l of datos.lineas) {
      try { sistema.declararLinea(l); } catch (e) { errores.push(e.message); }
    }
    for (const e of datos.estaciones) {
      try { sistema.declararEstacion(e); } catch (ex) { errores.push(ex.message); }
    }
    for (const p of datos.pertenencias) {
      try { sistema.declararPertenencia(p.estacion, p.linea); } catch (e) { errores.push(`Pertenencia inválida: ${e.message}`); }
    }
    for (const c of datos.conexiones) {
      try { sistema.declararConexion(c.origen, c.destino, c.linea, c.tiempo_min); }
      catch (e) { errores.push(`Conexión inválida: ${e.message}`); }
    }

    sistema.erroresImportacion = errores;
    return sistema;
  }

  verificarIntegridad() {
    if (!this.grafo) throw new Error("Debe llamar a procesarConocimiento() primero.");

    const todas = this.listarEstaciones();
    const conectadas = new Set();
    for (const h of this.base.consultar("conectado")) {
      conectadas.add(h.argumentos[0]);
      conectadas.add(h.argumentos[1]);
    }
    const aisladas = todas.filter(e => !conectadas.has(e)).sort();

    const adyacenciaNoDirigida = new Map();
    for (const nodo of this.grafo.adyacencias.keys()) adyacenciaNoDirigida.set(nodo, new Set());
    for (const [origen, aristas] of this.grafo.adyacencias.entries()) {
      for (const arista of aristas) {
        adyacenciaNoDirigida.get(origen).add(arista.destino);
        if (!adyacenciaNoDirigida.has(arista.destino)) adyacenciaNoDirigida.set(arista.destino, new Set());
        adyacenciaNoDirigida.get(arista.destino).add(origen);
      }
    }

    const noVisitados = new Set(this.grafo.adyacencias.keys());
    const componentes = [];
    while (noVisitados.size) {
      const inicio = noVisitados.values().next().value;
      const pila = [inicio];
      const visitadosLocal = new Set();
      while (pila.length) {
        const nodo = pila.pop();
        if (visitadosLocal.has(nodo)) continue;
        visitadosLocal.add(nodo);
        for (const vecino of adyacenciaNoDirigida.get(nodo) || []) {
          if (!visitadosLocal.has(vecino)) pila.push(vecino);
        }
      }
      componentes.push(visitadosLocal);
      for (const n of visitadosLocal) noVisitados.delete(n);
    }

    const reporte = { aisladas, componentes: [] };
    if (componentes.length > 1) {
      componentes.forEach((comp, i) => {
        const estacionesComp = [...new Set([...comp].map(n => n.split("@")[0]))].sort();
        reporte.componentes.push({ indice: i + 1, estaciones: estacionesComp });
      });
    }
    return reporte;
  }

  _nodosDeEstacion(estacion) {
    return this.base.consultar("pertenece")
      .filter(h => h.argumentos[0] === estacion)
      .map(h => `${estacion}@${h.argumentos[1]}`);
  }

  calcularMejorRuta(estacionA, estacionB) {
    if (!this.grafo) throw new Error("Debe llamar a procesarConocimiento() antes de calcular rutas.");

    estacionA = estacionA ? String(estacionA).trim().split(/\s+/).join(" ") : "";
    estacionB = estacionB ? String(estacionB).trim().split(/\s+/).join(" ") : "";

    if (!estacionA || !estacionB) {
      return { encontrada: false, mensaje: "Debe indicar una estación de origen y una de destino.", costo_total: 0, numero_transbordos: 0, pasos: [] };
    }

    if (estacionA === estacionB) {
      if (!this.esEstacionValida(estacionA)) {
        return { encontrada: false, mensaje: `La estación '${estacionA}' no existe.`, costo_total: 0, numero_transbordos: 0, pasos: [] };
      }
      return {
        encontrada: true, costo_total: 0, numero_transbordos: 0,
        mensaje: "El origen y el destino son la misma estación.",
        pasos: [{ estacion: estacionA, linea: this.lineasDeEstacion(estacionA)[0], costo_acumulado: 0, tipo_movimiento: "inicio" }],
      };
    }

    const nodosOrigen = this._nodosDeEstacion(estacionA);
    const nodosDestino = new Set(this._nodosDeEstacion(estacionB));

    if (!nodosOrigen.length) {
      const sugerencias = this.sugerirEstacion(estacionA);
      const extra = sugerencias.length ? ` ¿Quisiste decir: ${sugerencias.join(", ")}?` : "";
      return { encontrada: false, mensaje: `La estación de origen '${estacionA}' no existe.${extra}`, costo_total: 0, numero_transbordos: 0, pasos: [] };
    }
    if (!nodosDestino.size) {
      const sugerencias = this.sugerirEstacion(estacionB);
      const extra = sugerencias.length ? ` ¿Quisiste decir: ${sugerencias.join(", ")}?` : "";
      return { encontrada: false, mensaje: `La estación de destino '${estacionB}' no existe.${extra}`, costo_total: 0, numero_transbordos: 0, pasos: [] };
    }

    const marcaInicio = (typeof performance !== "undefined" ? performance.now() : Date.now());
    const { destinoAlcanzado, previo, nodosExplorados, ordenVisitados } = dijkstra(this.grafo, nodosOrigen, nodosDestino);
    const tiempoCalculoMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - marcaInicio;

    if (destinoAlcanzado === null) {
      return { encontrada: false, mensaje: `No existe una ruta posible entre '${estacionA}' y '${estacionB}'.`, costo_total: 0, numero_transbordos: 0, pasos: [] };
    }

    const camino = reconstruirCamino(destinoAlcanzado, previo);
    const pasos = [];
    let numTransbordos = 0;
    let costoAcum = 0;

    camino.forEach(({ nodo, arista }, i) => {
      const [estacion, linea] = nodo.split("@");
      if (i === 0) {
        pasos.push({ estacion, linea, costo_acumulado: 0, tipo_movimiento: "inicio" });
      } else {
        costoAcum += arista.costo;
        if (arista.tipo === "transbordo") numTransbordos++;
        pasos.push({ estacion, linea, costo_acumulado: costoAcum, tipo_movimiento: arista.tipo });
      }
    });

    const lineasUsadas = [...new Set(pasos.map(p => p.linea))];

    return {
      encontrada: true, costo_total: costoAcum, numero_transbordos: numTransbordos,
      pasos, mensaje: "Ruta óptima calculada exitosamente.",
      diagnostico: {
        nodos_totales_en_grafo: this.grafo.adyacencias.size,
        nodos_explorados: nodosExplorados,
        tiempo_calculo_ms: tiempoCalculoMs,
        lineas_usadas: lineasUsadas,
        alternativas_de_origen: nodosOrigen.length,
        alternativas_de_destino: nodosDestino.size,
        orden_exploracion: ordenVisitados.map(nodo => {
          const [estacion, linea] = nodo.split("@");
          return { estacion, linea };
        }),
      },
    };
  }
}

// ------------------------- Red de ejemplo (tipo Bogotá) -------------------------

function _secuencia(sistema, linea, estacionesTiempos) {
  sistema.declararLinea(linea);
  for (const [nombre] of estacionesTiempos) {
    sistema.declararEstacion(nombre);
    sistema.declararPertenencia(nombre, linea);
  }
  for (let i = 0; i < estacionesTiempos.length - 1; i++) {
    const [actual, tiempo] = estacionesTiempos[i];
    const [siguiente] = estacionesTiempos[i + 1];
    sistema.declararConexion(actual, siguiente, linea, tiempo);
  }
}

function construirEjemploBogota() {
  const sistema = new SistemaExpertoRutas();

  // 1. TRONCAL CARACAS (centro) — de Héroes a Tercer Milenio
  _secuencia(sistema, "Linea_Caracas", [
    ["Héroes", 2.0], ["Calle_76", 1.6], ["Calle_72", 1.5], ["Flores", 1.5],
    ["Calle_63", 1.4], ["Calle_57", 1.3], ["Marly", 1.4], ["Calle_45", 1.5],
    ["Avenida_39", 1.3], ["Calle_34", 1.4], ["Calle_26", 1.6],
    ["Avenida_Jiménez", 1.8], ["Tercer_Milenio", 1.5],
  ]);

  // 2. TRONCAL CARACAS SUR — tronco + dos ramales (Tunal y Usme)
  _secuencia(sistema, "Linea_CaracasSur", [
    ["Tercer_Milenio", 1.8], ["Hospital", 1.5], ["Hortúa", 1.5], ["Nariño", 1.5],
    ["Fucha", 1.8], ["Restrepo", 1.6], ["Olaya", 1.6], ["Quiroga", 1.8],
    ["Calle_40_Sur", 2.0], ["Santa_Lucía", 1.0],
  ]);
  _secuencia(sistema, "Linea_CaracasSur", [
    ["Santa_Lucía", 2.2], ["Biblioteca", 1.5], ["Parque", 1.6], ["Portal_del_Tunal", 0.0],
  ]);
  _secuencia(sistema, "Linea_CaracasSur", [
    ["Santa_Lucía", 2.0], ["Socorro", 1.8], ["Consuelo", 2.0], ["Molinos", 2.2],
    ["Danubio", 2.5], ["Portal_de_Usme", 0.0],
  ]);

  // 3. TRONCAL AUTONORTE — de Terminal (Calle 192) a Héroes
  _secuencia(sistema, "Linea_Autonorte", [
    ["Terminal", 2.2], ["Calle_187", 2.5], ["Portal_del_Norte", 3.0], ["Toberín", 2.2],
    ["Calle_161", 2.0], ["Mazurén", 1.8], ["Calle_146", 1.8], ["Calle_142", 1.6],
    ["Alcalá", 1.8], ["Prado", 1.8], ["Calle_127", 2.0], ["Pepe_Sierra", 1.8],
    ["Calle_106", 1.8], ["Calle_100", 2.0], ["Virrey", 2.2], ["Calle_85", 2.2],
    ["Héroes", 0.0],
  ]);

  // 4. TRONCAL SUBA — de Portal Suba a Escuela Militar
  _secuencia(sistema, "Linea_Suba", [
    ["Portal_Suba", 2.8], ["La_Campiña", 2.2], ["Suba_Tv_91", 2.0], ["21_Ángeles", 2.0],
    ["Suba_Av_Boyacá", 2.5], ["Puente_Largo", 2.8], ["Suba_Calle_100", 2.6],
    ["Suba_Calle_95", 2.0], ["San_Martín", 2.0], ["Escuela_Militar", 0.0],
  ]);

  // 5. TRONCAL CALLE 80 — de Portal 80 a Flores (empalma con Caracas)
  _secuencia(sistema, "Linea_Calle80", [
    ["Portal_de_la_80", 2.8], ["Quirigua", 2.2], ["Carrera_90", 1.8], ["Avenida_Cali", 1.8],
    ["Granja_Carrera_77", 1.8], ["Minuto_de_Dios", 1.8], ["Boyacá_80", 1.8],
    ["Ferias", 1.8], ["Avenida_68", 1.8], ["Carrera_53", 1.6], ["Carrera_47", 1.6],
    ["Escuela_Militar", 1.8], ["Polo", 1.8], ["Flores", 0.0],
  ]);

  // 6. TRONCAL AMÉRICAS — de Portal Américas a Avenida Jiménez
  _secuencia(sistema, "Linea_Americas", [
    ["Portal_de_las_Américas", 2.8], ["Biblioteca_Tintal", 2.2], ["Patio_Bonito", 2.0],
    ["Transversal_86", 1.8], ["Banderas", 2.0], ["Mandalay", 1.8],
    ["Américas_Av_Boyacá", 1.8], ["Marsella", 1.8], ["Distrito_Grafiti", 1.6],
    ["Zona_Industrial", 1.6], ["CDS_Carrera_32", 1.6], ["Ricaurte", 1.8],
    ["De_La_Sabana", 1.6], ["San_Façon", 1.8], ["Avenida_Jiménez", 0.0],
  ]);

  // 7. TRONCAL NQS — de Calle 100 a San Mateo (Soacha); la más larga del sistema
  _secuencia(sistema, "Linea_NQS", [
    ["Calle_100", 2.5], ["La_Castellana", 2.2], ["NQS_Calle_75", 2.0],
    ["Avenida_Chile", 1.8], ["Simón_Bolívar", 1.8], ["Movistar_Arena", 1.6],
    ["Campín", 1.8], ["Universidad_Nacional", 1.8], ["Avenida_El_Dorado", 1.6],
    ["CAD", 1.6], ["Paloquemao", 1.8], ["Ricaurte", 1.8], ["Comuneros", 2.0],
    ["Santa_Isabel", 1.8], ["SENA", 1.8], ["NQS_Calle_30_Sur", 1.8],
    ["NQS_Calle_38A_Sur", 1.8], ["General_Santander", 1.8], ["Alquería", 1.8],
    ["Venecia", 1.8], ["Sevillana", 1.8], ["Villa_del_Río_Madelena", 2.0],
    ["Perdomo", 2.0], ["Portal_Sur", 2.5], ["Bosa", 2.8], ["La_Despensa", 2.2],
    ["León_XIII", 2.2], ["Terreros", 2.8], ["San_Mateo", 0.0],
  ]);
  // Escuela Militar es un intercambiador triple real (Calle 80 / Suba / NQS)
  sistema.declararPertenencia("Escuela_Militar", "Linea_NQS");
  sistema.declararConexion("Campín", "Escuela_Militar", "Linea_NQS", 2.0);

  // 8. EJE AMBIENTAL — de Avenida Jiménez a Universidades
  _secuencia(sistema, "Linea_EjeAmbiental", [
    ["Avenida_Jiménez", 1.5], ["Museo_del_Oro", 1.3], ["Las_Aguas", 1.3],
    ["Universidades", 0.0],
  ]);

  // 9. TRONCAL CALLE 26 / ELDORADO — de Portal Eldorado a Universidades
  _secuencia(sistema, "Linea_Calle26", [
    ["Portal_Eldorado", 2.8], ["Modelia", 2.0], ["Normandía", 1.8], ["Avenida_Rojas", 1.8],
    ["El_Tiempo_Maloka", 1.8], ["Salitre_Greco", 1.8], ["CAN", 1.8],
    ["Gobernación", 1.6], ["Quinta_Paredes", 1.6], ["Recinto_Ferial", 1.6],
    ["Ciudad_Universitaria", 1.8], ["Concejo_de_Bogotá", 1.6], ["Centro_Memoria", 1.6],
    ["Estación_Central", 1.8], ["Universidades", 0.0],
  ]);

  // 10. TRONCAL DÉCIMA / 20 DE JULIO — de Portal 20 de Julio a Avenida Jiménez
  _secuencia(sistema, "Linea_Decima", [
    ["Portal_20_de_Julio", 2.8], ["Country_Sur", 2.0], ["Avenida_1_de_Mayo", 1.8],
    ["Ciudad_Jardín", 1.8], ["Policarpa", 1.8], ["San_Bernardo", 1.6],
    ["Bicentenario", 1.8], ["San_Victorino", 1.5], ["Las_Nieves", 1.5],
    ["San_Diego", 1.6], ["Avenida_Jiménez", 0.0],
  ]);

  return sistema;
}

// Exponer en window para que app.js lo use como <script> clásico
if (typeof window !== "undefined") {
  window.RutasExperto = { SistemaExpertoRutas, DatoInvalidoError, construirEjemploBogota };
}

// Exportar también como módulo CommonJS para poder probarlo con Node
// (ver tests/test_motor.js), sin afectar el uso normal en el navegador.
if (typeof module !== "undefined" && module.exports) {
  module.exports = { SistemaExpertoRutas, DatoInvalidoError, construirEjemploBogota };
}

})(typeof window !== "undefined" ? window : globalThis);
