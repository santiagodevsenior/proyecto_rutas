# -*- coding: utf-8 -*-
"""
CLI interactivo del sistema experto de rutas (uso por consola, sin
frontend web). Ejecutar con:

    python -m cli.main

desde la raíz del proyecto.
"""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from typing import Optional
from src import SistemaExpertoRutas, DatoInvalidoError, construir_ejemplo_bogota


def pedir_estacion(sistema: SistemaExpertoRutas, etiqueta: str) -> Optional[str]:
    while True:
        try:
            nombre = input(f"{etiqueta} (o 'cancelar'): ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n  Entrada interrumpida, se cancela la operación.")
            return None
        if nombre.lower() == "cancelar":
            return None
        if not nombre:
            print("  El nombre no puede estar vacío. Intenta de nuevo.")
            continue
        if sistema.es_estacion_valida(nombre):
            return nombre
        sugerencias = sistema.sugerir_estacion(nombre)
        if sugerencias:
            print(f"  No encontré '{nombre}'. ¿Quisiste decir?: {', '.join(sugerencias)}")
        else:
            print(f"  No encontré '{nombre}' y no hay sugerencias parecidas.")


def pedir_numero(mensaje: str, minimo=None, maximo=None) -> Optional[float]:
    while True:
        try:
            texto = input(mensaje).strip()
        except (EOFError, KeyboardInterrupt):
            print("\n  Entrada interrumpida, se cancela la operación.")
            return None
        if texto.lower() == "cancelar":
            return None
        try:
            valor = float(texto)
        except ValueError:
            print(f"  '{texto}' no es un número válido. Intenta de nuevo (o 'cancelar').")
            continue
        if minimo is not None and valor < minimo:
            print(f"  El valor debe ser mayor o igual a {minimo}.")
            continue
        if maximo is not None and valor > maximo:
            print(f"  El valor debe ser menor o igual a {maximo}.")
            continue
        return valor


def mostrar_menu():
    print("\n" + "=" * 78)
    print(" MENÚ PRINCIPAL — SISTEMA EXPERTO DE RUTAS")
    print("=" * 78)
    print(" 1) Calcular la mejor ruta entre dos estaciones")
    print(" 2) Listar todas las estaciones")
    print(" 3) Listar todas las líneas (y sus estaciones)")
    print(" 4) Ver información de una estación")
    print(" 5) Agregar una nueva conexión y volver a inferir")
    print(" 6) Ver la traza del motor de inferencia")
    print(" 7) Exportar la red actual a un archivo JSON")
    print(" 8) Importar una red desde un archivo JSON")
    print(" 9) Verificar integridad de la red")
    print(" 0) Salir")


def opcion_calcular_ruta(sistema):
    origen = pedir_estacion(sistema, "Estación de origen (A)")
    if origen is None:
        return
    destino = pedir_estacion(sistema, "Estación de destino (B)")
    if destino is None:
        return
    resultado = sistema.calcular_mejor_ruta(origen, destino)
    SistemaExpertoRutas.imprimir_resultado(resultado, origen, destino)


def opcion_listar_estaciones(sistema):
    estaciones = sistema.listar_estaciones()
    print(f"\nHay {len(estaciones)} estaciones registradas:")
    for e in estaciones:
        marcador = " (transbordo)" if len(sistema.lineas_de_estacion(e)) > 1 else ""
        print(f"  - {e}{marcador}")


def opcion_listar_lineas(sistema):
    for linea in sistema.listar_lineas():
        estaciones = sistema.estaciones_por_linea(linea)
        print(f"\nLínea: {linea} ({len(estaciones)} estaciones)")
        for est in estaciones:
            print(f"    · {est}")


def opcion_info_estacion(sistema):
    nombre = input("Nombre de la estación a consultar: ").strip()
    info = sistema.info_estacion(nombre)
    if not info["existe"]:
        extra = f" ¿Quisiste decir: {', '.join(info['sugerencias'])}?" if info["sugerencias"] else ""
        print(f"La estación '{nombre}' no existe.{extra}")
        return
    print(f"Estación: {info['estacion']}")
    print(f"Líneas: {', '.join(info['lineas'])}")
    print("Es punto de transbordo." if info["es_transbordo"] else "No es punto de transbordo.")


def opcion_agregar_conexion(sistema):
    e1 = input("  Estación 1: ").strip()
    e2 = input("  Estación 2: ").strip()
    linea = input("  Línea: ").strip()
    tiempo = pedir_numero("  Tiempo del tramo en minutos (0.01-180): ", minimo=0.01, maximo=180)
    if tiempo is None:
        print("  Operación cancelada.")
        return
    try:
        sistema.agregar_conexion_y_reinferir(e1, e2, linea, tiempo, verbose=False)
        print(f"\nListo. Se agregó '{e1}' <-> '{e2}' en '{linea}'.")
    except DatoInvalidoError as e:
        print(f"\nNo se agregó la conexión: {e}")


def opcion_exportar(sistema):
    ruta = input("Nombre del archivo a crear (ej: mi_red.json): ").strip()
    if not ruta.lower().endswith(".json"):
        ruta += ".json"
    try:
        sistema.exportar_json(ruta)
        print(f"Red exportada a '{ruta}'.")
    except DatoInvalidoError as e:
        print(f"No se pudo exportar: {e}")


def opcion_importar(sistema_actual):
    ruta = input("Ruta del archivo JSON a importar: ").strip()
    try:
        nuevo = SistemaExpertoRutas.importar_json(ruta)
        nuevo.procesar_conocimiento(verbose=False)
        print(f"Red importada: {len(nuevo.listar_estaciones())} estaciones, {len(nuevo.listar_lineas())} líneas.")
        return nuevo
    except DatoInvalidoError as e:
        print(f"No se pudo importar: {e}")
        return sistema_actual


def opcion_verificar_integridad(sistema):
    reporte = sistema.verificar_integridad()
    if reporte["aisladas"]:
        print(f"Estaciones aisladas: {', '.join(reporte['aisladas'])}")
    else:
        print("No hay estaciones aisladas.")
    if reporte["componentes"]:
        print(f"La red está dividida en {len(reporte['componentes'])} subredes.")
        for c in reporte["componentes"]:
            print(f"  Subred {c['indice']}: {', '.join(c['estaciones'])}")
    else:
        print("La red es una sola componente conectada.")


def menu_interactivo(sistema):
    acciones = {
        "1": opcion_calcular_ruta, "2": opcion_listar_estaciones,
        "3": opcion_listar_lineas, "4": opcion_info_estacion,
        "5": opcion_agregar_conexion, "9": opcion_verificar_integridad,
    }
    while True:
        mostrar_menu()
        try:
            opcion = input("Elige una opción: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nSaliendo. Hasta luego.")
            break

        try:
            if opcion == "6":
                sistema.motor.imprimir_traza() if sistema.motor else print("Sin inferencia todavía.")
            elif opcion == "7":
                opcion_exportar(sistema)
            elif opcion == "8":
                sistema = opcion_importar(sistema)
            elif opcion == "0":
                print("Hasta luego.")
                break
            elif opcion in acciones:
                acciones[opcion](sistema)
            else:
                print("Opción no válida.")
        except (EOFError, KeyboardInterrupt):
            print("\nOperación interrumpida. Volviendo al menú.")
        except DatoInvalidoError as e:
            print(f"\nDato inválido: {e}")
        except Exception as e:
            print(f"\nError inesperado ({type(e).__name__}): {e}")


def main():
    print("SISTEMA EXPERTO DE RUTAS — CLI")
    sistema = construir_ejemplo_bogota()
    sistema.procesar_conocimiento(verbose=False)
    print(f"Listo: {len(sistema.listar_estaciones())} estaciones, {len(sistema.listar_lineas())} líneas.")
    menu_interactivo(sistema)


if __name__ == "__main__":
    main()
