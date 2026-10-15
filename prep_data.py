"""Genera data.js a partir de los tres CSV del reto AgroCebada.

Uso:
    python prep_data.py carpeta_con_los_csv

Requiere: pip install pandas numpy

Datos REALES (de los CSV): polígonos, áreas, rendimientos de entrenamiento y
curvas semanales de 2025 de NDVI, EVI, LAI (Planet), FAPAR y DSWI (Sentinel-2).

Datos SIMULADOS (no existen en los CSV): rendimiento de las parcelas por
predecir y clima semanal (temperatura mínima, amplitud térmica, GDD).
"""

import json
import os
import sys

import numpy as np
import pandas as pd

CARPETA = sys.argv[1] if len(sys.argv) > 1 else "."
SALIDA = "data.js"

ARCHIVO_IDS = "ID_area_rendimiento_70_30_Reto_AgroCebada.csv"
ARCHIVO_BASICO = "Conjunto_datos_BASICO_AgroCebada2026.csv"
ARCHIVO_PRO = "Conjunto_datos_PRO_AgroCebada.csv"

ANIO = 2025
SEMANAS = 52
RENDIMIENTO_ALTO = 4.5  # t/ha; las parcelas por encima definen la curva de referencia


def ruta(nombre):
    return os.path.join(CARPETA, nombre)


def serie_semanal(df, columna):
    """Mediana semanal de `columna` por parcela (2025), con huecos interpolados.

    Devuelve un DataFrame: una fila por parcela, una columna por semana (0-51).
    """
    df = df.copy()
    df["fecha"] = pd.to_datetime(df["fecha_captura"], dayfirst=True)
    df = df[df["fecha"].dt.year == ANIO]
    df["semana"] = ((df["fecha"].dt.dayofyear - 1) // 7).clip(0, SEMANAS - 1)

    tabla = (
        df.groupby(["ID_POLIGONO", "semana"])[columna]
        .median()
        .unstack()
        .reindex(columns=range(SEMANAS))
    )
    return tabla.T.interpolate(limit_direction="both").T


def cargar_series():
    pro = pd.read_csv(ruta(ARCHIVO_PRO))
    basico = pd.read_csv(
        ruta(ARCHIVO_BASICO),
        low_memory=False,
        usecols=[
            "ID_POLIGONO",
            "fecha_captura",
            "sensor",
            "fapar_promedio",
            "dswi2_promedio",
        ],
    )
    sentinel = basico[basico["sensor"] == "Sentinel-2"]

    series = {
        "n": serie_semanal(pro, "ndvi_promedio"),
        "e": serie_semanal(pro, "evi_promedio"),
        "l": serie_semanal(pro, "lai_promedio"),
        "f": serie_semanal(sentinel, "fapar_promedio"),
        "d": serie_semanal(sentinel, "dswi2_promedio"),
    }
    return pro, series


def nubosidad_semanal(pro):
    pro = pro.copy()
    pro["fecha"] = pd.to_datetime(pro["fecha_captura"], dayfirst=True)
    pro["semana"] = ((pro["fecha"].dt.dayofyear - 1) // 7).clip(0, SEMANAS - 1)

    nubes = (
        pro.groupby("semana")["porcentaje_nubosidad"]
        .mean()
        .reindex(range(SEMANAS))
        .interpolate()
    )
    return [int(round(v)) for v in nubes]


def simular_clima(rng):
    """Clima semanal inventado (los CSV no traen temperatura)."""
    semanas = np.arange(SEMANAS)
    temp_media = 14 + 8 * np.sin((semanas - 14) / SEMANAS * 2 * np.pi)
    temp_media = temp_media + rng.normal(0, 1, SEMANAS)
    amplitud = 15 - 4 * np.sin((semanas - 30) / SEMANAS * 2 * np.pi)
    amplitud = amplitud + rng.normal(0, 1.2, SEMANAS)

    temp_minima = temp_media - amplitud / 2
    gdd = np.cumsum(np.maximum(temp_media, 0) * 7)

    return {
        "tmin": [round(float(v), 1) for v in temp_minima],
        "amp": [round(float(v), 1) for v in amplitud],
        "gdd": [int(v) for v in gdd],
    }


def a_enteros(serie):
    """Guarda cada valor x1000 como entero para que el archivo pese menos."""
    return [int(round(valor * 1000)) for valor in serie]


def construir_datos():
    ids = pd.read_csv(ruta(ARCHIVO_IDS)).iloc[:, :4].set_index("ID_POLIGONO")
    pro, series = cargar_series()
    ids = ids.loc[series["n"].index.intersection(ids.index)]

    entrenamiento = ids[ids["CONJUNTO"] == "ENTRENAMIENTO"]
    integral_ndvi = series["n"].loc[entrenamiento.index].sum(axis=1)
    ajuste = np.polyfit(integral_ndvi, entrenamiento["RENDIMIENTO_T_HA"], 1)

    rng = np.random.default_rng(3)
    clima = simular_clima(rng)

    # Curva de referencia: promedio de las parcelas de alto rendimiento
    altas = entrenamiento.index[
        entrenamiento["RENDIMIENTO_T_HA"] >= RENDIMIENTO_ALTO
    ]
    referencia = {
        clave: a_enteros(tabla.loc[altas].mean()) for clave, tabla in series.items()
    }

    parcelas = []
    for id_parcela, fila in ids.iterrows():
        por_predecir = fila["CONJUNTO"] == "PREDICCION"
        rendimiento = fila["RENDIMIENTO_T_HA"]

        if por_predecir:
            # SIMULADO: recta simple sobre el NDVI acumulado + ruido
            estimado = np.polyval(ajuste, series["n"].loc[id_parcela].sum())
            rendimiento = float(np.clip(estimado + rng.normal(0, 0.25), 2, 5.6))

        parcelas.append(
            {
                "id": id_parcela,
                "a": float(fila["AREA_HA"]),
                "y": round(float(rendimiento), 2),
                "p": int(por_predecir),
                **{c: a_enteros(t.loc[id_parcela]) for c, t in series.items()},
            }
        )

    clima["cld"] = nubosidad_semanal(pro)
    return {"P": parcelas, "opt": referencia, "cli": clima}


def lista(valores):
    return "[" + ", ".join(str(v) for v in valores) + "]"


def escribir_data_js(datos, destino):
    """Escribe data.js con un formato legible (una parcela por bloque)."""
    lineas = [
        "// Generado con prep_data.py. Valores x1000 en las series de índices.",
        "const DATA = {",
        "  // Parcelas: id, área (ha), rendimiento (t/ha), p = 1 si es por predecir",
        "  P: [",
    ]

    for parcela in datos["P"]:
        lineas.append("    {")
        lineas.append(f'      id: "{parcela["id"]}",')
        lineas.append(f'      a: {parcela["a"]},')
        lineas.append(f'      y: {parcela["y"]},')
        lineas.append(f'      p: {parcela["p"]},')
        for clave in ("n", "e", "l", "f", "d"):
            lineas.append(f"      {clave}: {lista(parcela[clave])},")
        lineas.append("    },")

    lineas.append("  ],")
    lineas.append("")
    lineas.append("  // Curva de referencia (parcelas de alto rendimiento)")
    lineas.append("  opt: {")
    for clave, serie in datos["opt"].items():
        lineas.append(f"    {clave}: {lista(serie)},")
    lineas.append("  },")
    lineas.append("")
    lineas.append("  // Clima semanal (tmin, amp y gdd simulados; cld real)")
    lineas.append("  cli: {")
    for clave, serie in datos["cli"].items():
        lineas.append(f"    {clave}: {lista(serie)},")
    lineas.append("  },")
    lineas.append("};")

    with open(destino, "w", encoding="utf-8") as archivo:
        archivo.write("\n".join(lineas) + "\n")


if __name__ == "__main__":
    datos = construir_datos()
    escribir_data_js(datos, SALIDA)

    entrenamiento = sum(1 - p["p"] for p in datos["P"])
    por_predecir = sum(p["p"] for p in datos["P"])
    print(f"{SALIDA}: {len(datos['P'])} parcelas "
          f"({entrenamiento} conocidas, {por_predecir} por predecir)")
