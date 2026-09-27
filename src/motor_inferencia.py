# -*- coding: utf-8 -*-
"""
Módulo: motor_inferencia
=========================
Motor de inferencia por encadenamiento hacia adelante (forward chaining).
Aplica repetidamente las reglas sobre la base de conocimiento hasta
alcanzar un punto fijo, registrando una traza explicativa.
"""

from __future__ import annotations
from typing import List
from .conocimiento import BaseDeConocimiento, Regla


class MotorInferencia:

    def __init__(self, base: BaseDeConocimiento, reglas: List[Regla]):
        self.base = base
        self.reglas = reglas
        self.traza: List[str] = []

    def ejecutar(self, max_iteraciones: int = 50) -> None:
        for iteracion in range(1, max_iteraciones + 1):
            hubo_cambio = False
            for regla in self.reglas:
                for binding in regla.condicion(self.base):
                    if regla.accion(self.base, binding):
                        hubo_cambio = True
                        self.traza.append(
                            f"[Iteración {iteracion}] Se disparó la regla "
                            f"'{regla.nombre}' con datos {binding} "
                            f"=> {regla.descripcion}"
                        )
            if not hubo_cambio:
                self.traza.append(
                    f"Punto fijo alcanzado en la iteración {iteracion}: "
                    f"no se generaron hechos nuevos."
                )
                break

    def imprimir_traza(self) -> None:
        print("\n--- TRAZA DEL MOTOR DE INFERENCIA ---")
        for linea in self.traza:
            print(linea)
        print(f"Total de hechos en la base tras la inferencia: {len(self.base)}")
