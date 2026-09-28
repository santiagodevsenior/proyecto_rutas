# -*- coding: utf-8 -*-
"""
Módulo: conocimiento
=====================
Define la representación de HECHOS y REGLAS lógicas, y la memoria de
trabajo (BaseDeConocimiento) del sistema experto.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Tuple, List, Set


class DatoInvalidoError(ValueError):
    """Se lanza cuando un hecho viola una regla de integridad básica
    (nombre vacío, tiempo negativo, auto-conexión, etc.)."""
    pass


@dataclass(frozen=True)
class Hecho:
    """Un hecho lógico: un predicado con argumentos, p. ej.
    Hecho("pertenece", ("Portal_Norte", "Linea_A"))."""
    predicado: str
    argumentos: Tuple

    def __repr__(self):
        args = ", ".join(str(a) for a in self.argumentos)
        return f"{self.predicado}({args})"


class BaseDeConocimiento:
    """Conjunto de hechos (iniciales + derivados). Memoria de trabajo
    del sistema experto."""

    def __init__(self):
        self._hechos: Set[Hecho] = set()

    def agregar_hecho(self, predicado: str, *argumentos) -> bool:
        """Agrega un hecho. Devuelve True si era nuevo (clave para saber
        cuándo detener el encadenamiento hacia adelante)."""
        h = Hecho(predicado, tuple(argumentos))
        if h in self._hechos:
            return False
        self._hechos.add(h)
        return True

    def existe(self, predicado: str, *argumentos) -> bool:
        return Hecho(predicado, tuple(argumentos)) in self._hechos

    def consultar(self, predicado: str) -> List[Hecho]:
        return [h for h in self._hechos if h.predicado == predicado]

    def todos(self) -> List[Hecho]:
        return list(self._hechos)

    def __len__(self):
        return len(self._hechos)


@dataclass
class Regla:
    """Regla de producción: SI <condicion> ENTONCES <accion>."""
    nombre: str
    condicion: callable
    accion: callable
    descripcion: str = ""
