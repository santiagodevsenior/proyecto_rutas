# -*- coding: utf-8 -*-
"""
API REST del sistema experto de rutas.

Expone el motor de inferencia y el cálculo de rutas al frontend web
mediante endpoints JSON, y sirve los archivos estáticos de la carpeta
web/ para poder abrir todo con un solo comando:

    python api/app.py

Luego abrir http://localhost:5000 en el navegador.
"""

import os
import sys

# Permite ejecutar este archivo directamente (python api/app.py) o como
# módulo (python -m api.app), resolviendo el import del paquete src.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from flask import Flask, jsonify, request, send_from_directory

from src import SistemaExpertoRutas, DatoInvalidoError, construir_ejemplo_bogota

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
WEB_DIR = os.path.join(BASE_DIR, "web")
DATA_DIR = os.path.join(BASE_DIR, "data")

app = Flask(__name__, static_folder=None)


@app.after_request
def permitir_cors(respuesta):
    """
    Habilita CORS a mano (sin depender de flask-cors) para que el
    frontend pueda servirse desde OTRO puerto -por ejemplo, la
    extensión "Live Server" de VS Code en el puerto 5500- mientras la
    API corre en el puerto 5000. Si abres todo a través de Flask
    (http://localhost:5000) esto no cambia nada, simplemente no estorba.
    """
    respuesta.headers["Access-Control-Allow-Origin"] = "*"
    respuesta.headers["Access-Control-Allow-Headers"] = "Content-Type"
    respuesta.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return respuesta


@app.route("/api/<path:_ruta>", methods=["OPTIONS"])
def cors_preflight(_ruta):
    """Responde a las peticiones OPTIONS de verificación previa (CORS
    preflight) que el navegador envía automáticamente antes de un POST
    entre orígenes distintos."""
    return ("", 204)

# --- Estado del sistema experto en memoria (proceso único, uso local) ---
sistema = construir_ejemplo_bogota()
sistema.procesar_conocimiento(verbose=False)


# ==================== Archivos estáticos del frontend ====================

@app.route("/")
def index():
    return send_from_directory(WEB_DIR, "index.html")


@app.route("/<path:nombre_archivo>")
def estaticos(nombre_archivo):
    return send_from_directory(WEB_DIR, nombre_archivo)


# ==================== Endpoints de la API ====================

@app.route("/api/estado", methods=["GET"])
def api_estado():
    return jsonify({
        "estaciones": len(sistema.listar_estaciones()),
        "lineas": len(sistema.listar_lineas()),
    })


@app.route("/api/estaciones", methods=["GET"])
def api_estaciones():
    estaciones = sistema.listar_estaciones()
    return jsonify([
        {"nombre": e, "lineas": sistema.lineas_de_estacion(e),
         "es_transbordo": len(sistema.lineas_de_estacion(e)) > 1}
        for e in estaciones
    ])


@app.route("/api/lineas", methods=["GET"])
def api_lineas():
    return jsonify([
        {"nombre": l, "estaciones": sistema.estaciones_por_linea(l)}
        for l in sistema.listar_lineas()
    ])


@app.route("/api/estacion/<nombre>", methods=["GET"])
def api_info_estacion(nombre):
    return jsonify(sistema.info_estacion(nombre))


@app.route("/api/ruta", methods=["GET"])
def api_ruta():
    origen = request.args.get("origen", "")
    destino = request.args.get("destino", "")
    resultado = sistema.calcular_mejor_ruta(origen, destino)
    return jsonify(resultado.a_diccionario())


@app.route("/api/conexion", methods=["POST"])
def api_agregar_conexion():
    datos = request.get_json(silent=True) or {}
    try:
        sistema.agregar_conexion_y_reinferir(
            datos.get("origen"), datos.get("destino"),
            datos.get("linea"), datos.get("tiempo_min"),
        )
    except DatoInvalidoError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({
        "mensaje": "Conexión agregada y red actualizada.",
        "estaciones": len(sistema.listar_estaciones()),
        "lineas": len(sistema.listar_lineas()),
    })


@app.route("/api/integridad", methods=["GET"])
def api_integridad():
    return jsonify(sistema.verificar_integridad())


@app.route("/api/traza", methods=["GET"])
def api_traza():
    if sistema.motor is None:
        return jsonify([])
    return jsonify(sistema.motor.traza)


@app.route("/api/exportar", methods=["GET"])
def api_exportar():
    return jsonify(sistema.exportar_diccionario())


@app.route("/api/importar", methods=["POST"])
def api_importar():
    global sistema
    datos = request.get_json(silent=True)
    if datos is None:
        return jsonify({"error": "Se esperaba un cuerpo JSON con la red a importar."}), 400
    try:
        nuevo_sistema = SistemaExpertoRutas._cargar_desde_diccionario(datos)
        nuevo_sistema.procesar_conocimiento(verbose=False)
    except DatoInvalidoError as e:
        return jsonify({"error": str(e)}), 400

    errores = getattr(nuevo_sistema, "errores_importacion", [])
    sistema = nuevo_sistema
    return jsonify({
        "mensaje": "Red importada correctamente.",
        "estaciones": len(sistema.listar_estaciones()),
        "lineas": len(sistema.listar_lineas()),
        "registros_omitidos": errores,
    })


@app.route("/api/reiniciar", methods=["POST"])
def api_reiniciar():
    """Vuelve a cargar la red de ejemplo original, descartando cualquier
    cambio hecho en caliente durante la sesión."""
    global sistema
    sistema = construir_ejemplo_bogota()
    sistema.procesar_conocimiento(verbose=False)
    return jsonify({"mensaje": "Red reiniciada a los datos de ejemplo."})


if __name__ == "__main__":
    print("Sirviendo el sistema experto de rutas en http://localhost:5000")
    print("(La API también acepta peticiones CORS desde otros puertos, ")
    print(" por ejemplo si abres web/index.html con Live Server en :5500)")
    app.run(debug=True, port=5000)
