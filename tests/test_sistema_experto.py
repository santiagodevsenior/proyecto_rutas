# -*- coding: utf-8 -*-
"""
Pruebas unitarias del sistema experto de rutas.
Ejecutar desde la raíz del proyecto con:

    python -m unittest discover -s tests -v
"""

import os
import sys
import unittest
import tempfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src import SistemaExpertoRutas, DatoInvalidoError, construir_ejemplo_bogota


class TestValidacionDeDatos(unittest.TestCase):

    def setUp(self):
        self.sistema = SistemaExpertoRutas()

    def test_nombre_estacion_vacio_es_rechazado(self):
        with self.assertRaises(DatoInvalidoError):
            self.sistema.declarar_estacion("   ")

    def test_nombre_estacion_none_es_rechazado(self):
        with self.assertRaises(DatoInvalidoError):
            self.sistema.declarar_estacion(None)

    def test_auto_conexion_es_rechazada(self):
        with self.assertRaises(DatoInvalidoError):
            self.sistema.declarar_conexion("A", "A", "Linea_1", 3.0)

    def test_tiempo_negativo_es_rechazado(self):
        with self.assertRaises(DatoInvalidoError):
            self.sistema.declarar_conexion("A", "B", "Linea_1", -5)

    def test_tiempo_no_numerico_es_rechazado(self):
        with self.assertRaises(DatoInvalidoError):
            self.sistema.declarar_conexion("A", "B", "Linea_1", "no-es-un-numero")

    def test_espacios_se_normalizan(self):
        self.sistema.declarar_estacion("  Calle   100  ")
        self.assertIn("Calle 100", self.sistema.listar_estaciones())

    def test_conexion_invalida_no_deja_residuos(self):
        total_antes = len(self.sistema.base)
        with self.assertRaises(DatoInvalidoError):
            self.sistema.declarar_conexion("X", "X", "Linea_1", 5)
        self.assertEqual(total_antes, len(self.sistema.base))


class TestCalculoDeRutas(unittest.TestCase):

    def setUp(self):
        self.sistema = SistemaExpertoRutas()
        for est in ("A", "B", "C"):
            self.sistema.declarar_estacion(est)
            self.sistema.declarar_pertenencia(est, "L1")
        self.sistema.declarar_conexion("A", "B", "L1", 5)
        self.sistema.declarar_conexion("B", "C", "L1", 5)
        for est in ("C", "D"):
            self.sistema.declarar_estacion(est)
            self.sistema.declarar_pertenencia(est, "L2")
        self.sistema.declarar_conexion("C", "D", "L2", 5)
        self.sistema.procesar_conocimiento(verbose=False)

    def test_ruta_directa_sin_transbordo(self):
        r = self.sistema.calcular_mejor_ruta("A", "C")
        self.assertTrue(r.encontrada)
        self.assertEqual(r.costo_total, 10)
        self.assertEqual(r.numero_transbordos, 0)

    def test_ruta_con_un_transbordo(self):
        r = self.sistema.calcular_mejor_ruta("A", "D")
        self.assertTrue(r.encontrada)
        self.assertEqual(r.numero_transbordos, 1)

    def test_origen_igual_a_destino(self):
        r = self.sistema.calcular_mejor_ruta("A", "A")
        self.assertTrue(r.encontrada)
        self.assertEqual(r.costo_total, 0.0)

    def test_estacion_inexistente(self):
        r = self.sistema.calcular_mejor_ruta("NoExiste", "C")
        self.assertFalse(r.encontrada)

    def test_no_existe_ruta_entre_islas(self):
        aislado = SistemaExpertoRutas()
        for est in ("X", "Y"):
            aislado.declarar_estacion(est)
            aislado.declarar_pertenencia(est, "L1")
        aislado.declarar_conexion("X", "Y", "L1", 2)
        aislado.declarar_estacion("Z")
        aislado.declarar_pertenencia("Z", "L2")
        aislado.declarar_linea("L2")
        aislado.procesar_conocimiento(verbose=False)
        r = aislado.calcular_mejor_ruta("X", "Z")
        self.assertFalse(r.encontrada)


class TestMotorInferencia(unittest.TestCase):

    def test_deteccion_de_transbordo(self):
        sistema = SistemaExpertoRutas()
        sistema.declarar_estacion("Compartida")
        sistema.declarar_pertenencia("Compartida", "L1")
        sistema.declarar_pertenencia("Compartida", "L2")
        sistema.procesar_conocimiento(verbose=False)
        transbordos = sistema.base.consultar("punto_transbordo")
        self.assertTrue(any(h.argumentos[0] == "Compartida" for h in transbordos))

    def test_motor_termina_con_datos_ciclicos(self):
        sistema = SistemaExpertoRutas()
        for est in ("A", "B", "C"):
            sistema.declarar_estacion(est)
            sistema.declarar_pertenencia(est, "L1")
        sistema.declarar_conexion("A", "B", "L1", 1)
        sistema.declarar_conexion("B", "C", "L1", 1)
        sistema.declarar_conexion("C", "A", "L1", 1)
        sistema.procesar_conocimiento(verbose=False)
        self.assertIsNotNone(sistema.grafo)


class TestPersistenciaJSON(unittest.TestCase):

    def setUp(self):
        self.dir_temp = tempfile.mkdtemp()

    def test_exportar_e_importar_preserva_la_red(self):
        original = construir_ejemplo_bogota()
        original.procesar_conocimiento(verbose=False)
        ruta = os.path.join(self.dir_temp, "red.json")
        original.exportar_json(ruta)

        importado = SistemaExpertoRutas.importar_json(ruta)
        importado.procesar_conocimiento(verbose=False)

        self.assertEqual(sorted(original.listar_estaciones()), sorted(importado.listar_estaciones()))
        r1 = original.calcular_mejor_ruta("Portal_de_Usme", "Portal_del_Norte")
        r2 = importado.calcular_mejor_ruta("Portal_de_Usme", "Portal_del_Norte")
        self.assertTrue(r1.encontrada and r2.encontrada)
        self.assertEqual(r1.costo_total, r2.costo_total)

    def test_importar_archivo_inexistente(self):
        with self.assertRaises(DatoInvalidoError):
            SistemaExpertoRutas.importar_json("/ruta/inexistente.json")

    def test_importar_json_corrupto(self):
        ruta = os.path.join(self.dir_temp, "corrupto.json")
        with open(ruta, "w") as f:
            f.write("{ esto no es json ][")
        with self.assertRaises(DatoInvalidoError):
            SistemaExpertoRutas.importar_json(ruta)


class TestVerificacionDeIntegridad(unittest.TestCase):

    def test_detecta_estacion_aislada(self):
        sistema = SistemaExpertoRutas()
        sistema.declarar_estacion("Solitaria")
        sistema.declarar_pertenencia("Solitaria", "L1")
        sistema.declarar_linea("L1")
        sistema.procesar_conocimiento(verbose=False)
        reporte = sistema.verificar_integridad()
        self.assertIn("Solitaria", reporte["aisladas"])

    def test_detecta_red_dividida(self):
        sistema = SistemaExpertoRutas()
        for est in ("A", "B"):
            sistema.declarar_estacion(est)
            sistema.declarar_pertenencia(est, "L1")
        sistema.declarar_conexion("A", "B", "L1", 2)
        for est in ("X", "Y"):
            sistema.declarar_estacion(est)
            sistema.declarar_pertenencia(est, "L2")
        sistema.declarar_conexion("X", "Y", "L2", 2)
        sistema.procesar_conocimiento(verbose=False)
        reporte = sistema.verificar_integridad()
        self.assertEqual(len(reporte["componentes"]), 2)


class TestSugerenciaDeEstaciones(unittest.TestCase):

    def test_sugiere_nombre_parecido(self):
        sistema = construir_ejemplo_bogota()
        sistema.procesar_conocimiento(verbose=False)
        self.assertIn("Toberín", sistema.sugerir_estacion("Toberim"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
