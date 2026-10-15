"use strict";

/*
 * Núcleo del modelo de rendimiento (sin dependencias).
 *
 * Idea: resumir las curvas semanales de satélite de cada parcela en pocas
 * variables y ajustar una regresión ridge (mínimos cuadrados con
 * penalización). Todo se calcula en el navegador con los datos reales de
 * data.js (solo las parcelas con rendimiento conocido entrenan el modelo).
 */

const Modelo = (() => {
  // Promedio de una serie entre dos semanas (índices 0-51). Los índices
  // vienen multiplicados por 1000 en data.js.
  const promedioVentana = (serie, desde, hasta) => {
    let total = 0;
    for (let i = desde; i <= hasta; i++) total += serie[i];
    return total / (hasta - desde + 1) / 1000;
  };

  /*
   * Variables del modelo: promedios de cada índice en ventanas del ciclo.
   * Las ventanas salieron de explorar las parcelas conocidas (en estos datos,
   * las semanas 15-25 y 42-52 separan mejor las parcelas de alto y bajo
   * rendimiento), así que la validación puede salir algo optimista.
   * Los números de semana de "semanas" van de 1 a 52.
   */
  const ventana = (clave, nombre, detalle, fuente, desde, hasta) => ({
    clave,
    nombre,
    detalle,
    fuente,
    semanas: [desde, hasta],
    calcular: (p) => promedioVentana(p[fuente], desde - 1, hasta - 1),
  });

  const CARACTERISTICAS = [
    ventana("ndvi_ini", "NDVI inicial", "Vigor de la planta al arrancar el ciclo", "n", 15, 25),
    ventana("evi_ini", "EVI inicial", "Vigor corregido por atmósfera, al arrancar", "e", 15, 25),
    ventana("lai_ini", "LAI inicial", "Cantidad de hoja al arrancar", "l", 15, 25),
    ventana("fapar_ini", "FAPAR inicial", "Luz aprovechada al arrancar", "f", 18, 26),
    ventana("ndvi_pico", "NDVI en el pico", "Vigor en pleno crecimiento", "n", 31, 41),
    ventana("ndvi_fin", "NDVI final", "Vigor durante la maduración", "n", 42, 52),
    ventana("dswi_fin", "DSWI final", "Estrés hídrico al final del ciclo", "d", 44, 52),
  ];

  // --- Utilidades numéricas -------------------------------------------------

  function promedio(valores) {
    return valores.reduce((a, b) => a + b, 0) / valores.length;
  }

  function desviacion(valores, media = promedio(valores)) {
    const varianza = valores.reduce((a, v) => a + (v - media) ** 2, 0) / valores.length;
    return Math.sqrt(varianza);
  }

  function pearson(a, b) {
    const ma = promedio(a);
    const mb = promedio(b);
    let num = 0;
    let da = 0;
    let db = 0;

    for (let i = 0; i < a.length; i++) {
      num += (a[i] - ma) * (b[i] - mb);
      da += (a[i] - ma) ** 2;
      db += (b[i] - mb) ** 2;
    }
    return num / Math.sqrt(da * db || 1);
  }

  // Eliminación gaussiana con pivoteo parcial: resuelve A x = b
  function resolver(A, b) {
    const n = b.length;
    const M = A.map((fila, i) => [...fila, b[i]]);

    for (let c = 0; c < n; c++) {
      let pivote = c;
      for (let r = c + 1; r < n; r++) {
        if (Math.abs(M[r][c]) > Math.abs(M[pivote][c])) pivote = r;
      }
      [M[c], M[pivote]] = [M[pivote], M[c]];

      const divisor = M[c][c] || 1e-12;
      for (let k = c; k <= n; k++) M[c][k] /= divisor;

      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const factor = M[r][c];
        for (let k = c; k <= n; k++) M[r][k] -= factor * M[c][k];
      }
    }
    return M.map((fila) => fila[n]);
  }

  function crearRng(semilla) {
    let s = semilla | 0;

    return function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function barajar(lista, semilla) {
    const azar = crearRng(semilla);
    const copia = [...lista];

    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(azar() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  }

  // --- Modelo ---------------------------------------------------------------

  const vectorDe = (parcela) => CARACTERISTICAS.map((c) => c.calcular(parcela));

  /** Ajusta ridge sobre variables estandarizadas. */
  function ajustar(parcelas, lambda) {
    const X = parcelas.map(vectorDe);
    const y = parcelas.map((p) => p.y);
    const k = CARACTERISTICAS.length;

    const medias = [];
    const desvios = [];
    for (let j = 0; j < k; j++) {
      const columna = X.map((fila) => fila[j]);
      medias.push(promedio(columna));
      desvios.push(desviacion(columna, medias[j]) || 1);
    }

    const Z = X.map((fila) => fila.map((v, j) => (v - medias[j]) / desvios[j]));
    const mediaY = promedio(y);

    const XtX = Array.from({ length: k }, () => new Array(k).fill(0));
    const Xty = new Array(k).fill(0);

    Z.forEach((fila, i) => {
      for (let a = 0; a < k; a++) {
        Xty[a] += fila[a] * (y[i] - mediaY);
        for (let b = 0; b < k; b++) XtX[a][b] += fila[a] * fila[b];
      }
    });
    for (let a = 0; a < k; a++) XtX[a][a] += lambda;

    return {
      lambda,
      medias,
      desvios,
      coef: resolver(XtX, Xty),
      intercepto: mediaY,
      rango: [Math.min(...y), Math.max(...y)],
    };
  }

  function estandarizar(modelo, parcela) {
    return vectorDe(parcela).map((v, j) => (v - modelo.medias[j]) / modelo.desvios[j]);
  }

  function predecir(modelo, parcela) {
    const z = estandarizar(modelo, parcela);
    const bruto = modelo.intercepto + z.reduce((a, v, j) => a + v * modelo.coef[j], 0);

    // El modelo no extrapola: se queda dentro de lo observado en entrenamiento
    return Math.min(modelo.rango[1], Math.max(modelo.rango[0], bruto));
  }

  /** Cuánto aportó cada variable a la predicción de una parcela (t/ha). */
  function contribuciones(modelo, parcela) {
    const z = estandarizar(modelo, parcela);

    return CARACTERISTICAS.map((c, j) => ({
      clave: c.clave,
      nombre: c.nombre,
      aporte: z[j] * modelo.coef[j],
    })).sort((a, b) => Math.abs(b.aporte) - Math.abs(a.aporte));
  }

  function metricas(real, estimado) {
    const media = promedio(real);
    let ssRes = 0;
    let ssTot = 0;
    let abs = 0;

    real.forEach((v, i) => {
      ssRes += (v - estimado[i]) ** 2;
      ssTot += (v - media) ** 2;
      abs += Math.abs(v - estimado[i]);
    });

    return {
      r2: 1 - ssRes / ssTot,
      rmse: Math.sqrt(ssRes / real.length),
      mae: abs / real.length,
      n: real.length,
    };
  }

  const conocidas = (parcelas) => parcelas.filter((p) => !p.p);

  /** Partición 70/30 reproducible de las parcelas conocidas. */
  function particion(parcelas, semilla = 11) {
    const orden = barajar(conocidas(parcelas), semilla);
    const corte = Math.round(orden.length * 0.7);
    return { entrenamiento: orden.slice(0, corte), prueba: orden.slice(corte) };
  }

  function evaluarParticion(parcelas, lambda, semilla) {
    const { entrenamiento, prueba } = particion(parcelas, semilla);
    const modelo = ajustar(entrenamiento, lambda);
    const estimado = prueba.map((p) => predecir(modelo, p));

    return {
      modelo,
      entrenamiento,
      prueba,
      estimado,
      metricas: metricas(
        prueba.map((p) => p.y),
        estimado
      ),
    };
  }

  /** Validación cruzada dejando una parcela fuera cada vez. */
  function validacionCruzada(parcelas, lambda) {
    const base = conocidas(parcelas);
    const estimado = base.map((_, i) => {
      const resto = base.filter((__, j) => j !== i);
      return predecir(ajustar(resto, lambda), base[i]);
    });

    return metricas(
      base.map((p) => p.y),
      estimado
    );
  }

  /** Correlación de cada variable con el rendimiento (parcelas conocidas). */
  function correlaciones(parcelas) {
    const base = conocidas(parcelas);
    const y = base.map((p) => p.y);

    return CARACTERISTICAS.map((c) => ({
      clave: c.clave,
      nombre: c.nombre,
      r: pearson(
        base.map((p) => c.calcular(p)),
        y
      ),
    }));
  }

  const LAMBDA_INICIAL = 3;

  /** Modelo final: usa todas las parcelas conocidas. */
  function entrenarFinal(parcelas, lambda = LAMBDA_INICIAL) {
    return ajustar(conocidas(parcelas), lambda);
  }

  return {
    CARACTERISTICAS,
    LAMBDA_INICIAL,
    promedio,
    desviacion,
    pearson,
    ajustar,
    predecir,
    contribuciones,
    metricas,
    particion,
    evaluarParticion,
    validacionCruzada,
    correlaciones,
    entrenarFinal,
    conocidas,
  };
})();

if (typeof module !== "undefined") module.exports = Modelo;
