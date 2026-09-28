# -*- coding: utf-8 -*-
"""
Módulo: sistema_experto
========================
Fachada de alto nivel (Facade) que integra:
  - la base de conocimiento y las reglas del dominio,
  - el motor de inferencia,
  - la construcción del grafo,
  - el cálculo de rutas óptimas,
  - la validación de datos, persistencia en JSON y verificación de
    integridad de la red.

Es el único módulo que normalmente se necesita importar desde fuera
(API REST, CLI, pruebas): `from src.sistema_experto import SistemaExpertoRutas`.
"""

from __future__ import annotations
import difflib
import json
import os
from typing import Dict, List, Optional, Set

from .conocimiento import BaseDeConocimiento, DatoInvalidoError
from .motor_inferencia import MotorInferencia
from .reglas import crear_reglas_dominio
from .grafo import GrafoTransporte, construir_grafo_extendido
from .rutas import PasoRuta, ResultadoRuta, dijkstra, reconstruir_camino

__all__ = ["SistemaExpertoRutas", "DatoInvalidoError"]


class SistemaExpertoRutas:

    def __init__(self):
        self.base = BaseDeConocimiento()
        self.reglas = crear_reglas_dominio()
        self.motor: Optional[MotorInferencia] = None
        self.grafo: Optional[GrafoTransporte] = None

    # ---------------------- Carga de la base de conocimiento -----------

    @staticmethod
    def _normalizar(texto: str, campo: str) -> str:
        if texto is None:
            raise DatoInvalidoError(f"El campo '{campo}' no puede ser nulo.")
        texto_limpio = " ".join(str(texto).strip().split())
        if not texto_limpio:
            raise DatoInvalidoError(f"El campo '{campo}' no puede estar vacío.")
        return texto_limpio

    def declarar_estacion(self, nombre: str):
        self.base.agregar_hecho("estacion", self._normalizar(nombre, "nombre de estación"))

    def declarar_linea(self, nombre: str):
        self.base.agregar_hecho("linea", self._normalizar(nombre, "nombre de línea"))

    def declarar_pertenencia(self, estacion: str, linea: str):
        estacion = self._normalizar(estacion, "estación")
        linea = self._normalizar(linea, "línea")
        self.base.agregar_hecho("pertenece", estacion, linea)

    def declarar_conexion(self, e1: str, e2: str, linea: str, tiempo_min: float):
        e1 = self._normalizar(e1, "estación 1")
        e2 = self._normalizar(e2, "estación 2")
        linea = self._normalizar(linea, "línea")

        if e1 == e2:
            raise DatoInvalidoError(
                f"No se puede conectar la estación '{e1}' consigo misma (auto-conexión)."
            )
        try:
            tiempo = float(tiempo_min)
        except (TypeError, ValueError):
            raise DatoInvalidoError(
                f"El tiempo del tramo debe ser un número; se recibió: {tiempo_min!r}."
            )
        if tiempo <= 0:
            raise DatoInvalidoError(f"El tiempo del tramo debe ser mayor que cero (se recibió {tiempo}).")
        if tiempo > 180:
            raise DatoInvalidoError(
                f"El tiempo del tramo ({tiempo} min) parece un error de captura "
                f"(supera las 3 horas para un solo tramo)."
            )

        self.base.agregar_hecho("conexion", e1, e2, linea, tiempo)

    # ---------------------- Inferencia y construcción del grafo ---------

    def procesar_conocimiento(self, verbose: bool = True):
        self.motor = MotorInferencia(self.base, self.reglas)
        self.motor.ejecutar()
        if verbose:
            self.motor.imprimir_traza()
        self.grafo = construir_grafo_extendido(self.base)

    def agregar_conexion_y_reinferir(self, e1: str, e2: str, linea: str,
                                      tiempo_min: float, verbose: bool = False):
        e1n = self._normalizar(e1, "estación 1")
        e2n = self._normalizar(e2, "estación 2")
        linean = self._normalizar(linea, "línea")
        self.declarar_conexion(e1n, e2n, linean, tiempo_min)  # valida primero
        self.declarar_estacion(e1n)
        self.declarar_estacion(e2n)
        self.declarar_pertenencia(e1n, linean)
        self.declarar_pertenencia(e2n, linean)
        self.procesar_conocimiento(verbose=verbose)

    # ---------------------- Exploración de la base de conocimiento -------

    def listar_estaciones(self) -> List[str]:
        return sorted({h.argumentos[0] for h in self.base.consultar("estacion")})

    def listar_lineas(self) -> List[str]:
        return sorted({h.argumentos[0] for h in self.base.consultar("linea")})

    def estaciones_por_linea(self, linea: str) -> List[str]:
        return sorted({h.argumentos[0] for h in self.base.consultar("pertenece")
                       if h.argumentos[1] == linea})

    def lineas_de_estacion(self, estacion: str) -> List[str]:
        return sorted({h.argumentos[1] for h in self.base.consultar("pertenece")
                       if h.argumentos[0] == estacion})

    def es_estacion_valida(self, estacion: str) -> bool:
        return self.base.existe("estacion", estacion)

    def sugerir_estacion(self, nombre_incorrecto: str, n: int = 3) -> List[str]:
        return difflib.get_close_matches(nombre_incorrecto, self.listar_estaciones(), n=n, cutoff=0.5)

    def info_estacion(self, estacion: str) -> dict:
        if not self.es_estacion_valida(estacion):
            return {
                "existe": False,
                "sugerencias": self.sugerir_estacion(estacion),
            }
        lineas = self.lineas_de_estacion(estacion)
        return {
            "existe": True,
            "estacion": estacion,
            "lineas": lineas,
            "es_transbordo": len(lineas) > 1,
        }

    # ---------------------- Persistencia (exportar / importar red) -------

    def exportar_json(self, ruta_archivo: str) -> None:
        datos = {
            "lineas": self.listar_lineas(),
            "estaciones": self.listar_estaciones(),
            "pertenencias": [
                {"estacion": h.argumentos[0], "linea": h.argumentos[1]}
                for h in self.base.consultar("pertenece")
            ],
            "conexiones": [
                {"origen": h.argumentos[0], "destino": h.argumentos[1],
                 "linea": h.argumentos[2], "tiempo_min": h.argumentos[3]}
                for h in self.base.consultar("conexion")
            ],
        }
        try:
            with open(ruta_archivo, "w", encoding="utf-8") as f:
                json.dump(datos, f, ensure_ascii=False, indent=2)
        except OSError as e:
            raise DatoInvalidoError(f"No se pudo escribir el archivo '{ruta_archivo}': {e}")

    def exportar_diccionario(self) -> dict:
        """Igual que exportar_json pero devuelve el dict directamente
        (útil para exponerlo como respuesta JSON en la API)."""
        return {
            "lineas": self.listar_lineas(),
            "estaciones": self.listar_estaciones(),
            "pertenencias": [
                {"estacion": h.argumentos[0], "linea": h.argumentos[1]}
                for h in self.base.consultar("pertenece")
            ],
            "conexiones": [
                {"origen": h.argumentos[0], "destino": h.argumentos[1],
                 "linea": h.argumentos[2], "tiempo_min": h.argumentos[3]}
                for h in self.base.consultar("conexion")
            ],
        }

    @classmethod
    def _cargar_desde_diccionario(cls, datos: dict) -> "SistemaExpertoRutas":
        for campo in ("lineas", "estaciones", "pertenencias", "conexiones"):
            if campo not in datos:
                raise DatoInvalidoError(f"Faltan datos: no se encontró la clave '{campo}'.")

        sistema = cls()
        errores: List[str] = []

        for l in datos["lineas"]:
            try:
                sistema.declarar_linea(l)
            except DatoInvalidoError as e:
                errores.append(str(e))
        for e in datos["estaciones"]:
            try:
                sistema.declarar_estacion(e)
            except DatoInvalidoError as ex:
                errores.append(str(ex))
        for p in datos["pertenencias"]:
            try:
                sistema.declarar_pertenencia(p["estacion"], p["linea"])
            except (DatoInvalidoError, KeyError) as e:
                errores.append(f"Pertenencia inválida {p}: {e}")
        for c in datos["conexiones"]:
            try:
                sistema.declarar_conexion(c["origen"], c["destino"], c["linea"], c["tiempo_min"])
            except (DatoInvalidoError, KeyError) as e:
                errores.append(f"Conexión inválida {c}: {e}")

        sistema.errores_importacion = errores
        return sistema

    @classmethod
    def importar_json(cls, ruta_archivo: str) -> "SistemaExpertoRutas":
        if not os.path.isfile(ruta_archivo):
            raise DatoInvalidoError(f"El archivo '{ruta_archivo}' no existe.")
        try:
            with open(ruta_archivo, "r", encoding="utf-8") as f:
                datos = json.load(f)
        except json.JSONDecodeError as e:
            raise DatoInvalidoError(f"El archivo '{ruta_archivo}' no es un JSON válido: {e}")
        except OSError as e:
            raise DatoInvalidoError(f"No se pudo leer el archivo '{ruta_archivo}': {e}")
        return cls._cargar_desde_diccionario(datos)

    # ---------------------- Verificación de integridad de la red ---------

    def verificar_integridad(self) -> Dict[str, List[str]]:
        if self.grafo is None:
            raise RuntimeError("Debe llamar a procesar_conocimiento() primero.")

        reporte: Dict[str, List[str]] = {"aisladas": [], "componentes": []}
        todas = self.listar_estaciones()
        conectadas = {h.argumentos[0] for h in self.base.consultar("conectado")}
        conectadas |= {h.argumentos[1] for h in self.base.consultar("conectado")}
        reporte["aisladas"] = sorted(set(todas) - conectadas)

        adyacencia_no_dirigida: Dict[str, Set[str]] = {n: set() for n in self.grafo.adyacencias}
        for origen, aristas in self.grafo.adyacencias.items():
            for arista in aristas:
                adyacencia_no_dirigida[origen].add(arista.destino)
                adyacencia_no_dirigida.setdefault(arista.destino, set()).add(origen)

        no_visitados = set(self.grafo.adyacencias.keys())
        componentes: List[Set[str]] = []
        while no_visitados:
            inicio = next(iter(no_visitados))
            pila = [inicio]
            visitados_local: Set[str] = set()
            while pila:
                nodo = pila.pop()
                if nodo in visitados_local:
                    continue
                visitados_local.add(nodo)
                pila.extend(adyacencia_no_dirigida.get(nodo, set()) - visitados_local)
            componentes.append(visitados_local)
            no_visitados -= visitados_local

        if len(componentes) > 1:
            for i, comp in enumerate(componentes, start=1):
                estaciones_comp = sorted({n.split("@")[0] for n in comp})
                reporte["componentes"].append({
                    "indice": i,
                    "estaciones": estaciones_comp,
                })

        return reporte

    # ---------------------- Consulta de ruta óptima ----------------------

    def _nodos_de_estacion(self, estacion: str) -> List[str]:
        lineas = [h.argumentos[1] for h in self.base.consultar("pertenece")
                  if h.argumentos[0] == estacion]
        return [f"{estacion}@{l}" for l in lineas]

    def calcular_mejor_ruta(self, estacion_a: str, estacion_b: str) -> ResultadoRuta:
        if self.grafo is None:
            raise RuntimeError("Debe llamar a procesar_conocimiento() antes de calcular rutas.")

        estacion_a = " ".join(str(estacion_a).strip().split()) if estacion_a else ""
        estacion_b = " ".join(str(estacion_b).strip().split()) if estacion_b else ""

        if not estacion_a or not estacion_b:
            return ResultadoRuta(encontrada=False,
                                  mensaje="Debe indicar una estación de origen y una de destino.")

        if estacion_a == estacion_b:
            if not self.es_estacion_valida(estacion_a):
                return ResultadoRuta(encontrada=False,
                                      mensaje=f"La estación '{estacion_a}' no existe.")
            return ResultadoRuta(encontrada=True, costo_total=0.0, numero_transbordos=0,
                                  pasos=[PasoRuta(estacion_a, self.lineas_de_estacion(estacion_a)[0],
                                                   0.0, "inicio")],
                                  mensaje="El origen y el destino son la misma estación.")

        nodos_origen = self._nodos_de_estacion(estacion_a)
        nodos_destino = set(self._nodos_de_estacion(estacion_b))

        if not nodos_origen:
            sugerencias = self.sugerir_estacion(estacion_a)
            extra = f" ¿Quisiste decir: {', '.join(sugerencias)}?" if sugerencias else ""
            return ResultadoRuta(encontrada=False,
                                  mensaje=f"La estación de origen '{estacion_a}' no existe.{extra}")
        if not nodos_destino:
            sugerencias = self.sugerir_estacion(estacion_b)
            extra = f" ¿Quisiste decir: {', '.join(sugerencias)}?" if sugerencias else ""
            return ResultadoRuta(encontrada=False,
                                  mensaje=f"La estación de destino '{estacion_b}' no existe.{extra}")

        destino_alcanzado, _, previo = dijkstra(self.grafo, nodos_origen, nodos_destino)

        if destino_alcanzado is None:
            return ResultadoRuta(
                encontrada=False,
                mensaje=f"No existe una ruta posible entre '{estacion_a}' y '{estacion_b}'."
            )

        camino = reconstruir_camino(destino_alcanzado, previo)
        pasos: List[PasoRuta] = []
        num_transbordos = 0
        costo_acum = 0.0

        for i, (nodo, arista_entrante) in enumerate(camino):
            estacion, linea = nodo.split("@")
            if i == 0:
                pasos.append(PasoRuta(estacion, linea, 0.0, "inicio"))
            else:
                costo_acum += arista_entrante.costo
                if arista_entrante.tipo == "transbordo":
                    num_transbordos += 1
                pasos.append(PasoRuta(estacion, linea, costo_acum, arista_entrante.tipo))

        return ResultadoRuta(encontrada=True, costo_total=costo_acum,
                              numero_transbordos=num_transbordos, pasos=pasos,
                              mensaje="Ruta óptima calculada exitosamente.")

    # ---------------------- Presentación en consola ----------------------

    @staticmethod
    def imprimir_resultado(resultado: ResultadoRuta, estacion_a: str, estacion_b: str):
        print(f"\n=== MEJOR RUTA DE '{estacion_a}' A '{estacion_b}' ===")
        if not resultado.encontrada:
            print(resultado.mensaje)
            return
        if estacion_a == estacion_b:
            print(resultado.mensaje)
            return
        for paso in resultado.pasos:
            if paso.tipo_movimiento == "inicio":
                print(f"  Inicio en '{paso.estacion}' tomando la línea {paso.linea}.")
            elif paso.tipo_movimiento == "tramo":
                print(f"  -> Viajar por la línea {paso.linea} hasta '{paso.estacion}' "
                      f"(tiempo acumulado: {paso.costo_acumulado:.1f} min).")
            elif paso.tipo_movimiento == "transbordo":
                print(f"  -> TRANSBORDO en '{paso.estacion}': cambiar a la línea {paso.linea} "
                      f"(tiempo acumulado: {paso.costo_acumulado:.1f} min).")
        print(f"\nResumen: tiempo total = {resultado.costo_total:.1f} min, "
              f"transbordos = {resultado.numero_transbordos}.")
