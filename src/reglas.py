# -*- coding: utf-8 -*-
"""
Módulo: reglas
===============
Reglas lógicas del dominio "transporte masivo":

  R1: conexion(E1,E2,L,T) + pertenece(E1,L) + pertenece(E2,L)
        => conectado(E1,E2,L,T)  (bidireccional)
  R2: pertenece(E,L1) + pertenece(E,L2), L1 != L2
        => punto_transbordo(E,L1,L2)
  R3: punto_transbordo(E,L1,L2)
        => arista_transbordo(E,L1,L2,PENALIZACION)
"""

from __future__ import annotations
import itertools
from typing import List
from .conocimiento import BaseDeConocimiento, Regla

TIEMPO_PROMEDIO_TRANSBORDO = 4  # minutos: valor por defecto para estaciones sin dato específico

# Penalización de transbordo diferenciada por estación. Los valores reflejan,
# de forma aproximada, cuánto toma caminar de un vagón/plataforma a otro y
# esperar el siguiente bus en cada punto real de la red: los intercambiadores
# grandes y con más flujo de pasajeros (Avenida Jiménez, Ricaurte) toman más
# tiempo que un simple cruce de andén (Héroes, Flores).
PENALIZACIONES_TRANSBORDO_MINUTOS = {
    "Avenida_Jiménez": 5,   # el intercambiador más concurrido del sistema (4 líneas)
    "Ricaurte": 5,          # cruce Américas/NQS, alto flujo
    "Universidades": 4,     # túnel peatonal hacia Las Aguas (Eje Ambiental/Calle 26)
    "Escuela_Militar": 4,   # intercambio triple Calle 80/Suba/NQS
    "Héroes": 3,
    "Flores": 3,
    "Polo": 3,
    "Calle_100": 3,
    "Tercer_Milenio": 3,
    "Comuneros": 3,
}


def _penalizacion_transbordo(estacion: str) -> float:
    return PENALIZACIONES_TRANSBORDO_MINUTOS.get(estacion, TIEMPO_PROMEDIO_TRANSBORDO)


def crear_reglas_dominio() -> List[Regla]:
    reglas: List[Regla] = []

    # --- R1: validar y normalizar conexiones directas ---
    def cond_conectado(base: BaseDeConocimiento):
        bindings = []
        for h in base.consultar("conexion"):
            e1, e2, linea, tiempo = h.argumentos
            if base.existe("pertenece", e1, linea) and base.existe("pertenece", e2, linea):
                bindings.append((e1, e2, linea, tiempo))
        return bindings

    def accion_conectado(base: BaseDeConocimiento, binding):
        e1, e2, linea, tiempo = binding
        a1 = base.agregar_hecho("conectado", e1, e2, linea, tiempo)
        a2 = base.agregar_hecho("conectado", e2, e1, linea, tiempo)
        return a1 or a2

    reglas.append(Regla(
        "R1_validar_conexion", cond_conectado, accion_conectado,
        "La conexión es válida porque ambas estaciones pertenecen a la misma línea; "
        "se habilita el tramo en ambos sentidos."
    ))

    # --- R2: detectar puntos de transbordo ---
    def cond_transbordo(base: BaseDeConocimiento):
        bindings = []
        pertenencias = base.consultar("pertenece")
        for h1, h2 in itertools.permutations(pertenencias, 2):
            e1, l1 = h1.argumentos
            e2, l2 = h2.argumentos
            if e1 == e2 and l1 != l2:
                bindings.append((e1, l1, l2))
        return bindings

    def accion_transbordo(base: BaseDeConocimiento, binding):
        estacion, l1, l2 = binding
        return base.agregar_hecho("punto_transbordo", estacion, l1, l2)

    reglas.append(Regla(
        "R2_detectar_transbordo", cond_transbordo, accion_transbordo,
        "La estación pertenece a dos líneas distintas, por lo tanto es un punto "
        "válido de transbordo entre ambas."
    ))

    # --- R3: penalización de tiempo por transbordo ---
    def cond_arista_transbordo(base: BaseDeConocimiento):
        return [h.argumentos for h in base.consultar("punto_transbordo")]

    def accion_arista_transbordo(base: BaseDeConocimiento, binding):
        estacion, l1, l2 = binding
        penalizacion = _penalizacion_transbordo(estacion)
        return base.agregar_hecho(
            "arista_transbordo", estacion, l1, l2, penalizacion
        )

    reglas.append(Regla(
        "R3_penalizar_transbordo", cond_arista_transbordo, accion_arista_transbordo,
        "Todo punto de transbordo implica un costo adicional de tiempo (caminar y esperar "
        "el siguiente bus); el valor depende de qué tan grande es el intercambiador en esa "
        "estación específica."
    ))

    return reglas
