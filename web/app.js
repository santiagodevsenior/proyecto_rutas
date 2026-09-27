// =============================================================
// RUTAS/EXPERTO — Frontend
// Corre 100% en el navegador: motor.js trae toda la lógica (reglas,
// inferencia, Dijkstra) y este archivo solo la conecta con la
// interfaz. No hay backend que instalar ni levantar: abre index.html
// (con doble clic o con Go Live / Live Server) y ya funciona.
//
// Todo va dentro de un IIFE, por la misma razón que en motor.js: si
// el script llegara a ejecutarse dos veces (recarga en caliente de
// Live Server, caché, etc.), cada ejecución tiene su propio ámbito y
// no choca con la anterior. Además se guarda una bandera en `window`
// para que, si de verdad se ejecuta dos veces, la segunda vez no
// vuelva a registrar los mismos manejadores de eventos por duplicado.
// =============================================================

(function () {
"use strict";

if (window.__rutasExpertoAppCargada) {
  console.warn("app.js ya se había cargado antes; se ignora esta segunda ejecución.");
  return;
}
window.__rutasExpertoAppCargada = true;

const { SistemaExpertoRutas, DatoInvalidoError, construirEjemploBogota } = window.RutasExperto;

const CLAVE_ALMACENAMIENTO = "rutas_experto_red_v1";

// ------------------------- Estado: cargar o crear la red -------------------------

function cargarSistemaInicial() {
  try {
    const guardado = localStorage.getItem(CLAVE_ALMACENAMIENTO);
    if (guardado) {
      const datos = JSON.parse(guardado);
      const sistema = SistemaExpertoRutas.cargarDesdeDiccionario(datos);
      sistema.procesarConocimiento();
      return sistema;
    }
  } catch (error) {
    console.warn("No se pudo leer la red guardada en este navegador, se usará la red de ejemplo:", error);
  }
  const sistema = construirEjemploBogota();
  sistema.procesarConocimiento();
  return sistema;
}

function guardarSistemaActual() {
  try {
    localStorage.setItem(CLAVE_ALMACENAMIENTO, JSON.stringify(sistema.exportarDiccionario()));
  } catch (error) {
    // localStorage puede fallar (modo privado, cuota excedida, etc.);
    // no es crítico, el sistema sigue funcionando en memoria.
    console.warn("No se pudo guardar la red en este navegador:", error);
  }
}

let sistema = cargarSistemaInicial();

// ------------------------- Utilidades -------------------------

const PALETA_LINEAS = ["#E4572E", "#2EC4B6", "#F2B705", "#7C7CE8", "#63C77B", "#E85C97", "#5CB8E4"];
const colorPorLinea = new Map();

function colorDeLinea(nombreLinea) {
  if (!colorPorLinea.has(nombreLinea)) {
    colorPorLinea.set(nombreLinea, PALETA_LINEAS[colorPorLinea.size % PALETA_LINEAS.length]);
  }
  return colorPorLinea.get(nombreLinea);
}

function actualizarEstadoYAutocompletado() {
  document.getElementById("estado-texto").textContent =
    `${sistema.listarEstaciones().length} estaciones · ${sistema.listarLineas().length} líneas`;

  const datalist = document.getElementById("lista-estaciones");
  datalist.innerHTML = "";
  sistema.listarEstaciones().forEach(nombre => {
    const opcion = document.createElement("option");
    opcion.value = nombre;
    datalist.appendChild(opcion);
  });
}

// ------------------------- Navegación por pestañas -------------------------

function activarPestana(nombre) {
  document.querySelectorAll(".parada").forEach(boton => {
    boton.setAttribute("aria-current", String(boton.dataset.tab === nombre));
  });
  document.querySelectorAll("[data-panel]").forEach(panel => {
    panel.hidden = panel.id !== `tab-${nombre}`;
  });
  if (nombre === "red") renderizarLineas();
  if (nombre === "mapa" && window.RutasExpertoMapa) {
    window.RutasExpertoMapa.renderizarMapa(sistema, colorDeLinea);
  }
}

document.querySelectorAll(".parada").forEach(boton => {
  boton.addEventListener("click", () => activarPestana(boton.dataset.tab));
});

// ------------------------- Planificador de ruta -------------------------

document.getElementById("btn-intercambiar").addEventListener("click", () => {
  const origen = document.getElementById("input-origen");
  const destino = document.getElementById("input-destino");
  [origen.value, destino.value] = [destino.value, origen.value];
});

document.getElementById("form-ruta").addEventListener("submit", (evento) => {
  evento.preventDefault();
  const origen = document.getElementById("input-origen").value.trim();
  const destino = document.getElementById("input-destino").value.trim();

  const resultado = sistema.calcularMejorRuta(origen, destino);
  mostrarRazonamientoYResultado(origen, destino, resultado);
});

const prefiereMenosMovimiento = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function construirPasosDeRazonamiento(origen, destino, resultado) {
  const totalNodos = sistema.grafo ? sistema.grafo.adyacencias.size : 0;
  const pasos = [
    `Analizando estaciones de origen ('${origen}') y destino ('${destino}')…`,
    `Consultando la base de conocimiento: ${sistema.listarEstaciones().length} estaciones, ${sistema.listarLineas().length} líneas, ${totalNodos} nodos en el grafo inferido.`,
    `Ejecutando Dijkstra sobre el grafo (nodos = Estación@Línea, para razonar sobre transbordos)…`,
  ];
  if (resultado.encontrada && resultado.diagnostico) {
    const d = resultado.diagnostico;
    pasos.push(`Se exploraron ${d.nodos_explorados} de ${d.nodos_totales_en_grafo} nodos antes de converger en la ruta óptima (${d.tiempo_calculo_ms.toFixed(2)} ms).`);
  } else if (!resultado.encontrada) {
    pasos.push("No se encontró un camino que conecte esas dos estaciones en el grafo inferido.");
  }
  return pasos;
}

function mostrarRazonamientoYResultado(origen, destino, resultado) {
  const panelPensando = document.getElementById("panel-pensando");
  const contenedorResultado = document.getElementById("resultado-ruta");
  contenedorResultado.hidden = true;

  const pasos = construirPasosDeRazonamiento(origen, destino, resultado);

  if (prefiereMenosMovimiento) {
    // Respeta la preferencia del sistema operativo: sin animación, va directo al resultado.
    panelPensando.hidden = true;
    renderizarResultadoRuta(resultado, origen, destino);
    return;
  }

  panelPensando.hidden = false;
  const RETARDO_ENTRE_LINEAS_MS = 260;
  panelPensando.innerHTML = pasos.map((texto, i) => `
    <div class="panel-pensando__linea" style="animation-delay:${i * RETARDO_ENTRE_LINEAS_MS}ms">
      ${texto}${i === pasos.length - 1 ? '<span class="panel-pensando__cursor"></span>' : ""}
    </div>`).join("");

  const duracionTotal = pasos.length * RETARDO_ENTRE_LINEAS_MS + 500;
  setTimeout(() => {
    panelPensando.hidden = true;
    renderizarResultadoRuta(resultado, origen, destino);
  }, duracionTotal);
}

function generarExplicacionEnLenguajeNatural(resultado) {
  const d = resultado.diagnostico;
  if (!d) return "";
  const lineas = d.lineas_usadas;
  const fraseLineas = lineas.length === 1
    ? `la línea ${lineas[0]}`
    : `las líneas ${lineas.slice(0, -1).join(", ")} y ${lineas[lineas.length - 1]}`;
  const fraseTransbordos = resultado.numero_transbordos === 0
    ? "sin necesidad de ningún transbordo"
    : `con ${resultado.numero_transbordos} transbordo${resultado.numero_transbordos === 1 ? "" : "s"}`;

  return `Evalué ${d.alternativas_de_origen} línea(s) de salida y ${d.alternativas_de_destino} de llegada posibles. ` +
         `Explorando ${d.nodos_explorados} de ${d.nodos_totales_en_grafo} nodos del grafo, Dijkstra convergió en ` +
         `${d.tiempo_calculo_ms.toFixed(2)} ms sobre esta como la ruta de menor tiempo total: usa ${fraseLineas} ` +
         `${fraseTransbordos}. No existe ninguna combinación de tramos y transbordos con un costo total menor a ` +
         `${resultado.costo_total.toFixed(1)} minutos entre estas dos estaciones, dada la red actual.`;
}

function renderizarResultadoRuta(resultado, estacionA, estacionB) {
  const contenedor = document.getElementById("resultado-ruta");
  contenedor.hidden = false;

  if (!resultado.encontrada) {
    contenedor.innerHTML = `<p class="mensaje mensaje--error">${resultado.mensaje}</p>`;
    return;
  }

  if (estacionA === estacionB) {
    contenedor.innerHTML = `<p class="mensaje mensaje--ok">${resultado.mensaje}</p>`;
    return;
  }

  const resumen = `
    <div class="resultado__resumen">
      <div class="resultado__metrica">
        <div class="valor">${resultado.costo_total.toFixed(1)} min</div>
        <div class="etiqueta">Tiempo estimado</div>
      </div>
      <div class="resultado__metrica">
        <div class="valor">${resultado.numero_transbordos}</div>
        <div class="etiqueta">Transbordo${resultado.numero_transbordos === 1 ? "" : "s"}</div>
      </div>
      <div class="resultado__metrica">
        <div class="valor">${resultado.pasos.length}</div>
        <div class="etiqueta">Paradas en el trayecto</div>
      </div>
    </div>`;

  const pasosHtml = resultado.pasos.map(paso => {
    const color = colorDeLinea(paso.linea);
    let detalle;
    if (paso.tipo_movimiento === "inicio") {
      detalle = `Sale por la <span class="chip-linea" style="--linea-color:${color}">${paso.linea}</span>`;
    } else if (paso.tipo_movimiento === "transbordo") {
      detalle = `Cambia a <span class="chip-linea" style="--linea-color:${color}">${paso.linea}</span>
                 <span class="transbordo-tag">transbordo · ${paso.costo_acumulado.toFixed(1)} min acum.</span>`;
    } else {
      detalle = `<span class="chip-linea" style="--linea-color:${color}">${paso.linea}</span>
                 · ${paso.costo_acumulado.toFixed(1)} min acumulados`;
    }
    return `
      <div class="parada-diagrama" style="--linea-color:${color}">
        <div class="nombre">${paso.estacion}</div>
        <div class="detalle">${detalle}</div>
      </div>`;
  }).join("");

  contenedor.innerHTML = resumen + `<div class="diagrama">${pasosHtml}</div>` + renderizarExplicacionIA(resultado);
}

function renderizarExplicacionIA(resultado) {
  if (!resultado.diagnostico) return "";
  const d = resultado.diagnostico;
  const explicacion = generarExplicacionEnLenguajeNatural(resultado);
  return `
    <div class="explicacion-ia">
      <div class="explicacion-ia__titulo">✨ EXPLICACIÓN DEL RAZONAMIENTO</div>
      <p style="margin:0">${explicacion}</p>
      <div class="metricas-ia">
        <span class="metricas-ia__item">Nodos explorados: <strong>${d.nodos_explorados}/${d.nodos_totales_en_grafo}</strong></span>
        <span class="metricas-ia__item">Tiempo de cómputo: <strong>${d.tiempo_calculo_ms.toFixed(2)} ms</strong></span>
        <span class="metricas-ia__item">Líneas combinadas: <strong>${d.lineas_usadas.length}</strong></span>
        <span class="metricas-ia__item">Algoritmo: <strong>Dijkstra</strong></span>
      </div>
    </div>`;
}

// ------------------------- Explorar red -------------------------

function renderizarLineas() {
  const contenedor = document.getElementById("lista-lineas");
  const lineas = sistema.listarLineas();
  if (!lineas.length) {
    contenedor.innerHTML = `<p class="panel__intro">No hay líneas registradas todavía.</p>`;
    return;
  }
  contenedor.innerHTML = lineas.map(nombreLinea => {
    const color = colorDeLinea(nombreLinea);
    const estaciones = sistema.estacionesPorLinea(nombreLinea);
    const estacionesHtml = estaciones.map(e => `<span>${e}</span>`).join("");
    return `
      <div class="tarjeta-linea" style="--linea-color:${color}">
        <div class="tarjeta-linea__titulo">${nombreLinea} · ${estaciones.length} estaciones</div>
        <div class="tarjeta-linea__estaciones">${estacionesHtml}</div>
      </div>`;
  }).join("");
}

// ------------------------- Administración: agregar conexión -------------------------

document.getElementById("form-conexion").addEventListener("submit", (evento) => {
  evento.preventDefault();
  const origen = document.getElementById("c-origen").value.trim();
  const destino = document.getElementById("c-destino").value.trim();
  const linea = document.getElementById("c-linea").value.trim();
  const tiempo = parseFloat(document.getElementById("c-tiempo").value);
  const mensaje = document.getElementById("mensaje-conexion");

  try {
    sistema.agregarConexionYReinferir(origen, destino, linea, tiempo);
    guardarSistemaActual();
    mensaje.hidden = false;
    mensaje.className = "mensaje mensaje--ok";
    mensaje.textContent = `Conexión agregada y red actualizada. Ahora hay ${sistema.listarEstaciones().length} ` +
                           `estaciones y ${sistema.listarLineas().length} líneas.`;
    evento.target.reset();
    actualizarEstadoYAutocompletado();
  } catch (error) {
    mensaje.hidden = false;
    mensaje.className = "mensaje mensaje--error";
    mensaje.textContent = error.message;
  }
});

// ------------------------- Administración: exportar / importar / reiniciar -------------------------

document.getElementById("btn-exportar").addEventListener("click", () => {
  const datos = sistema.exportarDiccionario();
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" });
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(blob);
  enlace.download = "red_transporte.json";
  enlace.click();
  URL.revokeObjectURL(enlace.href);
});

document.getElementById("input-importar").addEventListener("change", async (evento) => {
  const archivo = evento.target.files[0];
  const mensaje = document.getElementById("mensaje-persistencia");
  if (!archivo) return;

  try {
    const texto = await archivo.text();
    const datos = JSON.parse(texto);
    const nuevoSistema = SistemaExpertoRutas.cargarDesdeDiccionario(datos);
    nuevoSistema.procesarConocimiento();

    sistema = nuevoSistema;
    guardarSistemaActual();

    mensaje.hidden = false;
    mensaje.className = "mensaje mensaje--ok";
    let texto2 = `Red importada correctamente (${sistema.listarEstaciones().length} estaciones, ` +
                 `${sistema.listarLineas().length} líneas).`;
    if (sistema.erroresImportacion && sistema.erroresImportacion.length) {
      texto2 += ` Se omitieron ${sistema.erroresImportacion.length} registros inválidos.`;
    }
    mensaje.textContent = texto2;
    actualizarEstadoYAutocompletado();
  } catch (error) {
    mensaje.hidden = false;
    mensaje.className = "mensaje mensaje--error";
    mensaje.textContent = "No se pudo importar el archivo: " + error.message;
  } finally {
    evento.target.value = "";
  }
});

document.getElementById("btn-reiniciar").addEventListener("click", () => {
  if (!confirm("Esto descarta los cambios guardados en este navegador y vuelve a la red de ejemplo. ¿Continuar?")) return;
  sistema = construirEjemploBogota();
  sistema.procesarConocimiento();
  localStorage.removeItem(CLAVE_ALMACENAMIENTO);

  const mensaje = document.getElementById("mensaje-persistencia");
  mensaje.hidden = false;
  mensaje.className = "mensaje mensaje--ok";
  mensaje.textContent = "Red reiniciada a los datos de ejemplo.";
  actualizarEstadoYAutocompletado();
});

// ------------------------- Diagnóstico -------------------------

document.getElementById("btn-integridad").addEventListener("click", () => {
  const contenedor = document.getElementById("resultado-integridad");
  const reporte = sistema.verificarIntegridad();
  let html = "";
  if (reporte.aisladas.length === 0) {
    html += `<p class="mensaje mensaje--ok" style="display:inline-block">Sin estaciones aisladas.</p>`;
  } else {
    html += `<p>Estaciones sin conexión (${reporte.aisladas.length}):</p><ul>${reporte.aisladas.map(e => `<li>${e}</li>`).join("")}</ul>`;
  }
  if (reporte.componentes.length === 0) {
    html += `<p class="mensaje mensaje--ok" style="display:inline-block">La red es una sola componente conectada.</p>`;
  } else {
    html += `<p>La red está dividida en ${reporte.componentes.length} subredes que no se alcanzan entre sí:</p>`;
    html += reporte.componentes.map(c => `<p><strong>Subred ${c.indice}:</strong> ${c.estaciones.join(", ")}</p>`).join("");
  }
  contenedor.innerHTML = html;
});

document.getElementById("btn-traza").addEventListener("click", () => {
  const salida = document.getElementById("salida-traza");
  salida.hidden = false;
  const traza = sistema.motor ? sistema.motor.traza : [];
  salida.textContent = traza.length ? traza.join("\n") : "Todavía no se ha ejecutado el motor de inferencia.";
});

// ------------------------- Arranque -------------------------

actualizarEstadoYAutocompletado();

})();
