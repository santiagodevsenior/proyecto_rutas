# -*- coding: utf-8 -*-
"""
Módulo: rutas
==============
Algoritmo de Dijkstra adaptado a múltiples nodos origen/destino (una
estación puede tener varios nodos "Estacion@Linea"), y las estructuras
de datos que describen el resultado de una búsqueda de ruta.
"""

from __future__ import annotations
import heapq
from dataclasses import dataclass, field
from typing import Dict, List, Tuple, Optional, Set
from .grafo import GrafoTransporte, Arista


@dataclass
class PasoRuta:
    estacion: str
    linea: str
    costo_acumulado: float
    tipo_movimiento: str  # "inicio", "tramo", "transbordo"


@dataclass
class ResultadoRuta:
    encontrada: bool
    costo_total: float = 0.0
    numero_transbordos: int = 0
    pasos: List[PasoRuta] = field(default_factory=list)
    mensaje: str = ""

    def a_diccionario(self) -> dict:
        """Serialización para exponer el resultado vía API JSON."""
        return {
            "encontrada": self.encontrada,
            "costo_total": self.costo_total,
            "numero_transbordos": self.numero_transbordos,
            "mensaje": self.mensaje,
            "pasos": [
                {
                    "estacion": p.estacion,
                    "linea": p.linea,
                    "costo_acumulado": p.costo_acumulado,
                    "tipo_movimiento": p.tipo_movimiento,
                }
                for p in self.pasos
            ],
        }


def dijkstra(grafo: GrafoTransporte, origenes: List[str], destinos: Set[str]
             ) -> Tuple[Optional[str], Dict[str, float], Dict[str, Tuple[str, Arista]]]:
    """Dijkstra con múltiples orígenes/destinos. Se detiene apenas se
    extrae de la cola el primer destino, lo que garantiza optimalidad
    porque todos los costos son no negativos."""
    distancias: Dict[str, float] = {n: float("inf") for n in grafo.adyacencias}
    previo: Dict[str, Tuple[str, Arista]] = {}
    visitado: Set[str] = set()

    cola: List[Tuple[float, str]] = []
    for o in origenes:
        distancias[o] = 0.0
        heapq.heappush(cola, (0.0, o))

    destino_alcanzado = None
    while cola:
        costo_actual, nodo_actual = heapq.heappop(cola)
        if nodo_actual in visitado:
            continue
        visitado.add(nodo_actual)

        if nodo_actual in destinos:
            destino_alcanzado = nodo_actual
            break

        for arista in grafo.vecinos(nodo_actual):
            nuevo_costo = costo_actual + arista.costo
            if nuevo_costo < distancias.get(arista.destino, float("inf")):
                distancias[arista.destino] = nuevo_costo
                previo[arista.destino] = (nodo_actual, arista)
                heapq.heappush(cola, (nuevo_costo, arista.destino))

    return destino_alcanzado, distancias, previo


def reconstruir_camino(destino_final: str, previo: Dict[str, Tuple[str, Arista]]
                        ) -> List[Tuple[str, Optional[Arista]]]:
    camino: List[Tuple[str, Optional[Arista]]] = []
    nodo = destino_final
    while nodo in previo:
        anterior, arista = previo[nodo]
        camino.append((nodo, arista))
        nodo = anterior
    camino.append((nodo, None))
    camino.reverse()
    return camino
