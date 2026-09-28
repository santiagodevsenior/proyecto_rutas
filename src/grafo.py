# -*- coding: utf-8 -*-
"""
Módulo: grafo
==============
Grafo dirigido y ponderado construido a partir de los hechos inferidos
('conectado' y 'arista_transbordo'). Cada nodo se representa como
"Estacion@Linea" para que el algoritmo de ruta sepa en qué línea va el
pasajero y cuente correctamente los transbordos.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, List, Optional
from .conocimiento import BaseDeConocimiento


@dataclass
class Arista:
    destino: str
    costo: float
    tipo: str  # "tramo" o "transbordo"
    linea_origen: Optional[str] = None
    linea_destino: Optional[str] = None


class GrafoTransporte:

    def __init__(self):
        self.adyacencias: Dict[str, List[Arista]] = {}

    def _asegurar_nodo(self, nodo: str):
        if nodo not in self.adyacencias:
            self.adyacencias[nodo] = []

    def agregar_arista(self, origen: str, arista: Arista):
        self._asegurar_nodo(origen)
        self._asegurar_nodo(arista.destino)
        self.adyacencias[origen].append(arista)

    def vecinos(self, nodo: str) -> List[Arista]:
        return self.adyacencias.get(nodo, [])


def construir_grafo_extendido(base: BaseDeConocimiento) -> GrafoTransporte:
    grafo = GrafoTransporte()

    for h in base.consultar("conectado"):
        origen, destino, linea, tiempo = h.argumentos
        grafo.agregar_arista(
            f"{origen}@{linea}",
            Arista(destino=f"{destino}@{linea}", costo=tiempo, tipo="tramo",
                   linea_origen=linea, linea_destino=linea)
        )

    for h in base.consultar("arista_transbordo"):
        estacion, l1, l2, penalizacion = h.argumentos
        grafo.agregar_arista(
            f"{estacion}@{l1}",
            Arista(destino=f"{estacion}@{l2}", costo=penalizacion, tipo="transbordo",
                   linea_origen=l1, linea_destino=l2)
        )
        grafo.agregar_arista(
            f"{estacion}@{l2}",
            Arista(destino=f"{estacion}@{l1}", costo=penalizacion, tipo="transbordo",
                   linea_origen=l2, linea_destino=l1)
        )

    return grafo
