# -*- coding: utf-8 -*-
"""
Módulo: datos_ejemplo
=======================
Red REAL del sistema TransMilenio (Bogotá/Soacha): las 11 troncales
actualmente operativas, con todos sus portales, construida a partir de
fuentes públicas (Wikipedia, TransMilenio.gov.co, buscador de rutas
oficial). No incluye la futura Troncal Carrera Séptima (en
construcción a la fecha de escritura) ni rutas alimentadoras/zonales.

Los tiempos entre estaciones son ESTIMACIONES razonables basadas en el
espaciamiento típico de las estaciones (más cortas en el centro,
más largas en tramos periféricos), no en datos oficiales de itinerario
minuto a minuto. Las penalizaciones de transbordo específicas por
estación están definidas en reglas.py (PENALIZACIONES_TRANSBORDO_MINUTOS).

Estaciones de transferencia real que quedan representadas como
compartidas entre líneas (la misma estación pertenece a más de una
línea, tal como en la vida real):
    - Avenida_Jiménez : Caracas + Américas + Eje Ambiental + Décima (4 líneas)
    - Ricaurte        : Américas + NQS
    - Universidades   : Eje Ambiental + Calle 26
    - Héroes          : Caracas + Autonorte
    - Flores          : Caracas + Calle 80
    - Escuela_Militar : Calle 80 + Suba + NQS
    - Calle_100       : Autonorte + NQS
    - Tercer_Milenio  : Caracas + Caracas Sur
"""

from .sistema_experto import SistemaExpertoRutas


def _secuencia(sistema: SistemaExpertoRutas, linea: str, estaciones_tiempos):
    """
    Declara una línea completa a partir de una lista de tuplas
    (nombre_estacion, tiempo_hasta_la_siguiente). El tiempo de la
    última tupla se ignora (no hay "siguiente").
    """
    sistema.declarar_linea(linea)
    nombres = [nombre for nombre, _ in estaciones_tiempos]
    for nombre in nombres:
        sistema.declarar_estacion(nombre)
        sistema.declarar_pertenencia(nombre, linea)
    for i in range(len(estaciones_tiempos) - 1):
        nombre_actual, tiempo = estaciones_tiempos[i]
        nombre_siguiente, _ = estaciones_tiempos[i + 1]
        sistema.declarar_conexion(nombre_actual, nombre_siguiente, linea, tiempo)


def construir_ejemplo_bogota() -> SistemaExpertoRutas:
    sistema = SistemaExpertoRutas()

    # =====================================================================
    # 1. TRONCAL CARACAS (centro) — de Héroes a Tercer Milenio
    # =====================================================================
    _secuencia(sistema, "Linea_Caracas", [
        ("Héroes", 2.0), ("Calle_76", 1.6), ("Calle_72", 1.5), ("Flores", 1.5),
        ("Calle_63", 1.4), ("Calle_57", 1.3), ("Marly", 1.4), ("Calle_45", 1.5),
        ("Avenida_39", 1.3), ("Calle_34", 1.4), ("Calle_26", 1.6),
        ("Avenida_Jiménez", 1.8), ("Tercer_Milenio", 1.5),
    ])

    # =====================================================================
    # 2. TRONCAL CARACAS SUR — tronco + dos ramales (Tunal y Usme)
    # =====================================================================
    _secuencia(sistema, "Linea_CaracasSur", [
        ("Tercer_Milenio", 1.8), ("Hospital", 1.5), ("Hortúa", 1.5), ("Nariño", 1.5),
        ("Fucha", 1.8), ("Restrepo", 1.6), ("Olaya", 1.6), ("Quiroga", 1.8),
        ("Calle_40_Sur", 2.0), ("Santa_Lucía", 1.0),
    ])
    # Ramal hacia Portal del Tunal
    _secuencia(sistema, "Linea_CaracasSur", [
        ("Santa_Lucía", 2.2), ("Biblioteca", 1.5), ("Parque", 1.6), ("Portal_del_Tunal", 0.0),
    ])
    # Ramal hacia Portal de Usme
    _secuencia(sistema, "Linea_CaracasSur", [
        ("Santa_Lucía", 2.0), ("Socorro", 1.8), ("Consuelo", 2.0), ("Molinos", 2.2),
        ("Danubio", 2.5), ("Portal_de_Usme", 0.0),
    ])

    # =====================================================================
    # 3. TRONCAL AUTONORTE — de Terminal (Calle 192) a Héroes
    # =====================================================================
    _secuencia(sistema, "Linea_Autonorte", [
        ("Terminal", 2.2), ("Calle_187", 2.5), ("Portal_del_Norte", 3.0), ("Toberín", 2.2),
        ("Calle_161", 2.0), ("Mazurén", 1.8), ("Calle_146", 1.8), ("Calle_142", 1.6),
        ("Alcalá", 1.8), ("Prado", 1.8), ("Calle_127", 2.0), ("Pepe_Sierra", 1.8),
        ("Calle_106", 1.8), ("Calle_100", 2.0), ("Virrey", 2.2), ("Calle_85", 2.2),
        ("Héroes", 0.0),
    ])

    # =====================================================================
    # 4. TRONCAL SUBA — de Portal Suba a Escuela Militar
    # =====================================================================
    _secuencia(sistema, "Linea_Suba", [
        ("Portal_Suba", 2.8), ("La_Campiña", 2.2), ("Suba_Tv_91", 2.0), ("21_Ángeles", 2.0),
        ("Suba_Av_Boyacá", 2.5), ("Puente_Largo", 2.8), ("Suba_Calle_100", 2.6),
        ("Suba_Calle_95", 2.0), ("San_Martín", 2.0), ("Escuela_Militar", 0.0),
    ])

    # =====================================================================
    # 5. TRONCAL CALLE 80 — de Portal 80 a Flores (empalma con Caracas)
    # =====================================================================
    _secuencia(sistema, "Linea_Calle80", [
        ("Portal_de_la_80", 2.8), ("Quirigua", 2.2), ("Carrera_90", 1.8), ("Avenida_Cali", 1.8),
        ("Granja_Carrera_77", 1.8), ("Minuto_de_Dios", 1.8), ("Boyacá_80", 1.8),
        ("Ferias", 1.8), ("Avenida_68", 1.8), ("Carrera_53", 1.6), ("Carrera_47", 1.6),
        ("Escuela_Militar", 1.8), ("Polo", 1.8), ("Flores", 0.0),
    ])

    # =====================================================================
    # 6. TRONCAL AMÉRICAS — de Portal Américas a Avenida Jiménez
    # =====================================================================
    _secuencia(sistema, "Linea_Americas", [
        ("Portal_de_las_Américas", 2.8), ("Biblioteca_Tintal", 2.2), ("Patio_Bonito", 2.0),
        ("Transversal_86", 1.8), ("Banderas", 2.0), ("Mandalay", 1.8),
        ("Américas_Av_Boyacá", 1.8), ("Marsella", 1.8), ("Distrito_Grafiti", 1.6),
        ("Zona_Industrial", 1.6), ("CDS_Carrera_32", 1.6), ("Ricaurte", 1.8),
        ("De_La_Sabana", 1.6), ("San_Façon", 1.8), ("Avenida_Jiménez", 0.0),
    ])

    # =====================================================================
    # 7. TRONCAL NQS (Norte-Quito-Sur) — de Calle 100 a San Mateo (Soacha)
    #    Es la troncal más larga: cruza toda la ciudad de norte a sur.
    # =====================================================================
    _secuencia(sistema, "Linea_NQS", [
        ("Calle_100", 2.5), ("La_Castellana", 2.2), ("NQS_Calle_75", 2.0),
        ("Avenida_Chile", 1.8), ("Simón_Bolívar", 1.8), ("Movistar_Arena", 1.6),
        ("Campín", 1.8), ("Universidad_Nacional", 1.8), ("Avenida_El_Dorado", 1.6),
        ("CAD", 1.6), ("Paloquemao", 1.8), ("Ricaurte", 1.8), ("Comuneros", 2.0),
        ("Santa_Isabel", 1.8), ("SENA", 1.8), ("NQS_Calle_30_Sur", 1.8),
        ("NQS_Calle_38A_Sur", 1.8), ("General_Santander", 1.8), ("Alquería", 1.8),
        ("Venecia", 1.8), ("Sevillana", 1.8), ("Villa_del_Río_Madelena", 2.0),
        ("Perdomo", 2.0), ("Portal_Sur", 2.5), ("Bosa", 2.8), ("La_Despensa", 2.2),
        ("León_XIII", 2.2), ("Terreros", 2.8), ("San_Mateo", 0.0),
    ])
    # Escuela Militar es un intercambiador triple real (Calle 80 / Suba / NQS)
    sistema.declarar_pertenencia("Escuela_Militar", "Linea_NQS")
    sistema.declarar_conexion("Campín", "Escuela_Militar", "Linea_NQS", 2.0)

    # =====================================================================
    # 8. EJE AMBIENTAL — de Avenida Jiménez a Universidades
    # =====================================================================
    _secuencia(sistema, "Linea_EjeAmbiental", [
        ("Avenida_Jiménez", 1.5), ("Museo_del_Oro", 1.3), ("Las_Aguas", 1.3),
        ("Universidades", 0.0),
    ])

    # =====================================================================
    # 9. TRONCAL CALLE 26 / ELDORADO — de Portal Eldorado a Universidades
    # =====================================================================
    _secuencia(sistema, "Linea_Calle26", [
        ("Portal_Eldorado", 2.8), ("Modelia", 2.0), ("Normandía", 1.8), ("Avenida_Rojas", 1.8),
        ("El_Tiempo_Maloka", 1.8), ("Salitre_Greco", 1.8), ("CAN", 1.8),
        ("Gobernación", 1.6), ("Quinta_Paredes", 1.6), ("Recinto_Ferial", 1.6),
        ("Ciudad_Universitaria", 1.8), ("Concejo_de_Bogotá", 1.6), ("Centro_Memoria", 1.6),
        ("Estación_Central", 1.8), ("Universidades", 0.0),
    ])

    # =====================================================================
    # 10. TRONCAL DÉCIMA / 20 DE JULIO — de Portal 20 de Julio a Avenida Jiménez
    # =====================================================================
    _secuencia(sistema, "Linea_Decima", [
        ("Portal_20_de_Julio", 2.8), ("Country_Sur", 2.0), ("Avenida_1_de_Mayo", 1.8),
        ("Ciudad_Jardín", 1.8), ("Policarpa", 1.8), ("San_Bernardo", 1.6),
        ("Bicentenario", 1.8), ("San_Victorino", 1.5), ("Las_Nieves", 1.5),
        ("San_Diego", 1.6), ("Avenida_Jiménez", 0.0),
    ])

    return sistema
