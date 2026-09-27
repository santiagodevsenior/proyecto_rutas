// =============================================================
// RUTAS/EXPERTO — Mapa esquemático interactivo
// =============================================================
// Dibuja la red completa como un diagrama tipo "mapa de metro":
// cada troncal es una polilínea de color propio, las estaciones son
// nodos sobre esa polilínea, y los nodos compartidos entre líneas
// (las transferencias reales) quedan en la MISMA coordenada en las
// dos líneas que los usan, para que el cruce se vea correctamente.
//
// Las coordenadas son esquemáticas (no son las coordenadas GPS
// reales), pero preservan la orientación geográfica real de Bogotá:
// norte arriba, sur abajo, oriente a la derecha, occidente a la
// izquierda, y cada troncal ocupa aproximadamente la zona de la
// ciudad por donde pasa en la vida real.
//
// Interacción: clic en una estación = origen, clic en otra = destino.
// Al tener las dos, se recalcula la ruta con el motor real y se anima
// la exploración de Dijkstra nodo por nodo sobre el propio mapa.
// =============================================================

(function () {
"use strict";

// ---------------------------------------------------------------
// 1. Definición de cada tramo del mapa: línea, estaciones en orden,
//    y los puntos fijos (índice -> [x,y]) por los que DEBE pasar.
//    Las estaciones que no son puntos fijos se reparten en línea
//    recta entre el punto fijo anterior y el siguiente.
// ---------------------------------------------------------------

const TRAMOS = [
  { linea: "Linea_Caracas", fijos: { 0: [500, 430], 3: [500, 478], 11: [500, 560], 12: [520, 620] },
    estaciones: ["Héroes", "Calle_76", "Calle_72", "Flores", "Calle_63", "Calle_57", "Marly",
      "Calle_45", "Avenida_39", "Calle_34", "Calle_26", "Avenida_Jiménez", "Tercer_Milenio"] },

  { linea: "Linea_CaracasSur", fijos: { 0: [520, 620], 9: [560, 760] },
    estaciones: ["Tercer_Milenio", "Hospital", "Hortúa", "Nariño", "Fucha", "Restrepo",
      "Olaya", "Quiroga", "Calle_40_Sur", "Santa_Lucía"] },
  { linea: "Linea_CaracasSur", fijos: { 0: [560, 760], 3: [420, 880] },
    estaciones: ["Santa_Lucía", "Biblioteca", "Parque", "Portal_del_Tunal"] },
  { linea: "Linea_CaracasSur", fijos: { 0: [560, 760], 5: [680, 900] },
    estaciones: ["Santa_Lucía", "Socorro", "Consuelo", "Molinos", "Danubio", "Portal_de_Usme"] },

  { linea: "Linea_Autonorte", fijos: { 0: [560, 40], 13: [470, 230], 16: [500, 430] },
    estaciones: ["Terminal", "Calle_187", "Portal_del_Norte", "Toberín", "Calle_161", "Mazurén",
      "Calle_146", "Calle_142", "Alcalá", "Prado", "Calle_127", "Pepe_Sierra", "Calle_106",
      "Calle_100", "Virrey", "Calle_85", "Héroes"] },

  { linea: "Linea_Suba", fijos: { 0: [120, 150], 9: [330, 480] },
    estaciones: ["Portal_Suba", "La_Campiña", "Suba_Tv_91", "21_Ángeles", "Suba_Av_Boyacá",
      "Puente_Largo", "Suba_Calle_100", "Suba_Calle_95", "San_Martín", "Escuela_Militar"] },

  { linea: "Linea_Calle80", fijos: { 0: [60, 340], 11: [330, 480], 13: [500, 478] },
    estaciones: ["Portal_de_la_80", "Quirigua", "Carrera_90", "Avenida_Cali", "Granja_Carrera_77",
      "Minuto_de_Dios", "Boyacá_80", "Ferias", "Avenida_68", "Carrera_53", "Carrera_47",
      "Escuela_Militar", "Polo", "Flores"] },

  { linea: "Linea_Americas", fijos: { 0: [60, 760], 11: [330, 640], 14: [500, 560] },
    estaciones: ["Portal_de_las_Américas", "Biblioteca_Tintal", "Patio_Bonito", "Transversal_86",
      "Banderas", "Mandalay", "Américas_Av_Boyacá", "Marsella", "Distrito_Grafiti",
      "Zona_Industrial", "CDS_Carrera_32", "Ricaurte", "De_La_Sabana", "San_Façon", "Avenida_Jiménez"] },

  { linea: "Linea_NQS", fijos: { 0: [470, 230], 11: [330, 640], 28: [400, 980] },
    estaciones: ["Calle_100", "La_Castellana", "NQS_Calle_75", "Avenida_Chile", "Simón_Bolívar",
      "Movistar_Arena", "Campín", "Universidad_Nacional", "Avenida_El_Dorado", "CAD", "Paloquemao",
      "Ricaurte", "Comuneros", "Santa_Isabel", "SENA", "NQS_Calle_30_Sur", "NQS_Calle_38A_Sur",
      "General_Santander", "Alquería", "Venecia", "Sevillana", "Villa_del_Río_Madelena", "Perdomo",
      "Portal_Sur", "Bosa", "La_Despensa", "León_XIII", "Terreros", "San_Mateo"] },

  { linea: "Linea_EjeAmbiental", fijos: { 0: [500, 560], 3: [560, 540] },
    estaciones: ["Avenida_Jiménez", "Museo_del_Oro", "Las_Aguas", "Universidades"] },

  { linea: "Linea_Calle26", fijos: { 0: [60, 540], 14: [560, 540] },
    estaciones: ["Portal_Eldorado", "Modelia", "Normandía", "Avenida_Rojas", "El_Tiempo_Maloka",
      "Salitre_Greco", "CAN", "Gobernación", "Quinta_Paredes", "Recinto_Ferial",
      "Ciudad_Universitaria", "Concejo_de_Bogotá", "Centro_Memoria", "Estación_Central", "Universidades"] },

  { linea: "Linea_Decima", fijos: { 0: [620, 860], 10: [500, 560] },
    estaciones: ["Portal_20_de_Julio", "Country_Sur", "Avenida_1_de_Mayo", "Ciudad_Jardín",
      "Policarpa", "San_Bernardo", "Bicentenario", "San_Victorino", "Las_Nieves", "San_Diego",
      "Avenida_Jiménez"] },
];

// Conector adicional real: Escuela Militar (Calle80/Suba) también
// empalma con la troncal NQS a la altura de Campín.
const CONECTOR_EXTRA = { linea: "Linea_NQS", desde: "Campín", hasta: "Escuela_Militar" };

function interpolar(p1, p2, t) {
  return [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t];
}

function calcularCoordenadasTramo(tramo) {
  const indicesFijos = Object.keys(tramo.fijos).map(Number).sort((a, b) => a - b);
  const coords = new Array(tramo.estaciones.length);
  for (let k = 0; k < indicesFijos.length; k++) {
    coords[indicesFijos[k]] = tramo.fijos[indicesFijos[k]];
  }
  for (let k = 0; k < indicesFijos.length - 1; k++) {
    const iDesde = indicesFijos[k];
    const iHasta = indicesFijos[k + 1];
    const pDesde = tramo.fijos[iDesde];
    const pHasta = tramo.fijos[iHasta];
    const pasos = iHasta - iDesde;
    for (let i = iDesde + 1; i < iHasta; i++) {
      coords[i] = interpolar(pDesde, pHasta, (i - iDesde) / pasos);
    }
  }
  return coords;
}

// Mapa global nombreEstacion -> [x,y] (se llena una sola vez)
let COORDENADAS = null;

function obtenerCoordenadas() {
  if (COORDENADAS) return COORDENADAS;
  COORDENADAS = new Map();
  for (const tramo of TRAMOS) {
    const coords = calcularCoordenadasTramo(tramo);
    tramo.estaciones.forEach((nombre, i) => {
      if (!COORDENADAS.has(nombre)) COORDENADAS.set(nombre, coords[i]);
    });
  }
  return COORDENADAS;
}

// ---------------------------------------------------------------
// 2. Construcción del SVG
// ---------------------------------------------------------------

function construirSVGBase(sistema, colorDeLinea) {
  const coords = obtenerCoordenadas();
  const partes = [];

  partes.push(
    '<svg id="svg-mapa" viewBox="0 0 1000 1020" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Mapa esquemático de la red">'
  );

  // Polilíneas por tramo
  for (const tramo of TRAMOS) {
    const puntos = tramo.estaciones.map(nombre => coords.get(nombre).join(",")).join(" ");
    partes.push(
      `<polyline points="${puntos}" fill="none" stroke="${colorDeLinea(tramo.linea)}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" opacity="0.9"></polyline>`
    );
  }
  // Conector extra Campín-Escuela Militar
  const [cx, cy] = coords.get(CONECTOR_EXTRA.desde);
  const [ex, ey] = coords.get(CONECTOR_EXTRA.hasta);
  partes.push(
    `<line x1="${cx}" y1="${cy}" x2="${ex}" y2="${ey}" stroke="${colorDeLinea(CONECTOR_EXTRA.linea)}" stroke-width="5" stroke-linecap="round" opacity="0.9"></line>`
  );

  // Nodos (una vez por estación física)
  for (const nombre of sistema.listarEstaciones()) {
    const coord = coords.get(nombre);
    if (!coord) continue; // por si acaso alguna estación no tiene coordenada
    const [x, y] = coord;
    const esTransferencia = sistema.lineasDeEstacion(nombre).length > 1;
    const radio = esTransferencia ? 8 : 4.5;
    partes.push(
      `<g class="nodo-estacion" data-estacion="${nombre}" tabindex="0" role="button" aria-label="${nombre.replace(/_/g, " ")}">` +
      `<circle cx="${x}" cy="${y}" r="${radio + 6}" fill="transparent"></circle>` + // área de clic más grande
      `<circle class="nodo-circulo" cx="${x}" cy="${y}" r="${radio}" ` +
      `fill="${esTransferencia ? "#0B1224" : "#0B1224"}" stroke="${esTransferencia ? "#E7ECF5" : "#8C96B4"}" stroke-width="${esTransferencia ? 2.2 : 1.4}"></circle>` +
      `<title>${nombre.replace(/_/g, " ")}${esTransferencia ? " (transferencia)" : ""}</title>` +
      `</g>`
    );
  }

  partes.push("</svg>");
  return partes.join("");
}

// ---------------------------------------------------------------
// 3. Estado de selección + animación
// ---------------------------------------------------------------

const estado = { origen: null, destino: null, animando: false };

function nodoSvg(nombre) {
  const cont = document.getElementById("svg-mapa");
  return cont ? cont.querySelector(`.nodo-estacion[data-estacion="${nombre}"] .nodo-circulo`) : null;
}

function limpiarEstilosNodos() {
  const cont = document.getElementById("svg-mapa");
  if (!cont) return;
  cont.querySelectorAll(".nodo-circulo").forEach(c => {
    c.setAttribute("fill", "#0B1224");
    c.removeAttribute("class");
    c.setAttribute("class", "nodo-circulo");
  });
}

function marcarNodo(nombre, clase) {
  const nodo = nodoSvg(nombre);
  if (nodo) nodo.setAttribute("class", `nodo-circulo ${clase}`);
}

function actualizarInfo(texto) {
  const info = document.getElementById("mapa-info");
  if (info) info.textContent = texto;
}

function reiniciarSeleccion() {
  estado.origen = null;
  estado.destino = null;
  estado.animando = false;
  limpiarEstilosNodos();
  actualizarInfo("Haz clic en una estación para elegir el origen.");
  const resultado = document.getElementById("mapa-resultado");
  if (resultado) { resultado.hidden = true; resultado.innerHTML = ""; }
}

function animarExploracionYMostrar(sistema, resultado, colorDeLinea) {
  estado.animando = true;
  const orden = (resultado.diagnostico && resultado.diagnostico.orden_exploracion) || [];
  const PASO_MS = orden.length > 80 ? 8 : orden.length > 40 ? 14 : 22;

  // Evita re-marcar el mismo nodo físico varias veces si aparece en
  // más de una línea durante la exploración (solo importa la primera vez).
  const yaMarcados = new Set();

  orden.forEach((paso, i) => {
    setTimeout(() => {
      if (!yaMarcados.has(paso.estacion) && paso.estacion !== estado.origen && paso.estacion !== estado.destino) {
        marcarNodo(paso.estacion, "nodo-explorado");
        yaMarcados.add(paso.estacion);
      }
    }, i * PASO_MS);
  });

  setTimeout(() => {
    if (resultado.encontrada) {
      resultado.pasos.forEach(p => {
        if (p.estacion !== estado.origen && p.estacion !== estado.destino) {
          marcarNodo(p.estacion, "nodo-ruta");
        }
      });
      marcarNodo(estado.origen, "nodo-origen");
      marcarNodo(estado.destino, "nodo-destino");
      mostrarResultadoEnMapa(resultado);
      actualizarInfo(`${orden.length} nodos explorados antes de converger. Ruta encontrada en ${resultado.diagnostico.tiempo_calculo_ms.toFixed(2)} ms.`);
    } else {
      actualizarInfo(resultado.mensaje);
    }
    estado.animando = false;
  }, orden.length * PASO_MS + 150);
}

function mostrarResultadoEnMapa(resultado) {
  const contenedor = document.getElementById("mapa-resultado");
  if (!contenedor) return;
  contenedor.hidden = false;
  contenedor.innerHTML = `
    <div class="mapa-resultado__fila">
      <span><strong>${resultado.costo_total.toFixed(1)}</strong> min</span>
      <span><strong>${resultado.numero_transbordos}</strong> transbordo${resultado.numero_transbordos === 1 ? "" : "s"}</span>
      <span><strong>${resultado.pasos.length}</strong> paradas</span>
      <span><strong>${resultado.diagnostico.nodos_explorados}</strong> nodos explorados</span>
    </div>`;
}

function manejarClicNodo(nombre, sistema, colorDeLinea) {
  if (estado.animando) return;

  if (!estado.origen || (estado.origen && estado.destino)) {
    // Empieza una nueva selección
    reiniciarSeleccion();
    estado.origen = nombre;
    marcarNodo(nombre, "nodo-origen");
    actualizarInfo(`Origen: ${nombre.replace(/_/g, " ")}. Ahora haz clic en el destino.`);
    return;
  }

  if (nombre === estado.origen) return; // no tiene sentido origen == destino aquí

  estado.destino = nombre;
  marcarNodo(nombre, "nodo-destino");
  actualizarInfo("Calculando y animando la búsqueda…");

  const resultado = sistema.calcularMejorRuta(estado.origen, estado.destino);
  animarExploracionYMostrar(sistema, resultado, colorDeLinea);
}

// ---------------------------------------------------------------
// 4. Punto de entrada público
// ---------------------------------------------------------------

function renderizarMapa(sistema, colorDeLinea) {
  const contenedor = document.getElementById("contenedor-mapa");
  if (!contenedor) return;
  contenedor.innerHTML = construirSVGBase(sistema, colorDeLinea);

  const svg = document.getElementById("svg-mapa");
  svg.querySelectorAll(".nodo-estacion").forEach(g => {
    const nombre = g.getAttribute("data-estacion");
    g.addEventListener("click", () => manejarClicNodo(nombre, sistema, colorDeLinea));
    g.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        manejarClicNodo(nombre, sistema, colorDeLinea);
      }
    });
  });

  reiniciarSeleccion();

  const botonReiniciar = document.getElementById("btn-mapa-reiniciar");
  if (botonReiniciar) botonReiniciar.onclick = reiniciarSeleccion;
}

window.RutasExpertoMapa = { renderizarMapa };

})();
