"use strict";

/*
 * Línea del tiempo del modelo. Cada paso se dibuja con datos reales de
 * data.js; el modelo es la regresión ridge de modelo-core.js.
 */

const TODAS = DATA.P;
const CONOCIDAS = Modelo.conocidas(TODAS);
const POR_PREDECIR = TODAS.filter((p) => p.p);
const fmt = Util.fmt;

/* ------------------------------------------------------------------------ */
/* Gráficas SVG pequeñas                                                     */
/* ------------------------------------------------------------------------ */

function lineaSerie(serie, X, Y) {
  return serie.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
}

function ejeSemanas(X, base) {
  return [1, 13, 26, 39, 52]
    .map(
      (s) => `<text x="${X(s - 1)}" y="${base + 14}" text-anchor="middle">sem. ${s}</text>`
    )
    .join("");
}

/* ------------------------------------------------------------------------ */
/* Paso 1 · Limpieza                                                         */
/* ------------------------------------------------------------------------ */

function observacionesCrudas(parcela) {
  const azar = Util.crearRng(21);
  const crudas = [];

  parcela.n.forEach((valor, semana) => {
    if (azar() < 0.22) return; // semana sin imagen útil
    const cantidad = 1 + Math.floor(azar() * 3);

    for (let k = 0; k < cantidad; k++) {
      let v = valor * (1 + (azar() - 0.5) * 0.16);
      if (azar() < 0.08) v *= 0.55; // nube o sombra
      crudas.push({ x: semana + azar() * 0.95, semana, v });
    }
  });
  return crudas;
}

function graficaLimpieza(etapa) {
  const parcela = TODAS[0];
  const crudas = observacionesCrudas(parcela);
  const X = (w) => 30 + (w / 51) * 410;
  const Y = (v) => 150 - ((v - 100) / 750) * 135;

  const medianas = [];
  for (let w = 0; w < 52; w++) {
    const valores = crudas.filter((o) => o.semana === w).map((o) => o.v).sort((a, b) => a - b);
    if (valores.length) medianas.push({ w, v: valores[Math.floor(valores.length / 2)] });
  }

  let contenido = "";
  if (etapa === 0) {
    contenido = crudas
      .map((o) => `<circle cx="${X(o.x)}" cy="${Y(o.v)}" r="2.6" fill="var(--rosa)" opacity=".75"/>`)
      .join("");
  } else if (etapa === 1) {
    contenido =
      crudas.map((o) => `<circle cx="${X(o.x)}" cy="${Y(o.v)}" r="2" fill="var(--rosa)" opacity=".2"/>`).join("") +
      medianas.map((m) => `<circle cx="${X(m.w)}" cy="${Y(m.v)}" r="4" fill="var(--gold)"/>`).join("");
  } else {
    contenido =
      medianas.map((m) => `<circle cx="${X(m.w)}" cy="${Y(m.v)}" r="3" fill="var(--gold)" opacity=".5"/>`).join("") +
      `<path d="${lineaSerie(parcela.n, X, Y)}" fill="none" stroke="var(--green)" stroke-width="3"/>`;
  }

  return `
    <svg class="grafica" viewBox="0 0 460 180" role="img"
         aria-label="Ejemplo ilustrativo de limpieza del NDVI de ${parcela.id}">
      <line x1="30" x2="440" y1="150" y2="150" stroke="var(--line)" stroke-width="2"/>
      ${contenido}
      ${ejeSemanas(X, 150)}
      <text x="30" y="10">NDVI · ${parcela.id}</text>
    </svg>`;
}

const ETAPAS_LIMPIEZA = [
  "1 · Datos crudos",
  "2 · Mediana semanal",
  "3 · Huecos interpolados",
];

function pasoLimpieza() {
  const valores = TODAS.length * 52 * 5;

  return `
    <span class="kicker">Paso 1 de 6</span>
    <h2>Cómo se limpiaron los datos</h2>
    <div class="paso-dos">
      <div>
        <p>Los tres CSV del reto traen observaciones sueltas de satélite, con fechas irregulares,
        nubes y sensores distintos. Esto se hizo con <code>prep_data.py</code>:</p>
        <ol class="lista-limpieza">
          <li>Se unen los CSV por <b>ID de parcela</b> y se separan los sensores: Planet (NDVI, EVI, LAI) y Sentinel-2 (FAPAR, DSWI).</li>
          <li>Se conserva solo <b>2025</b> y cada fecha se convierte en una de las <b>52 semanas</b>.</li>
          <li>Por parcela y semana se toma la <b>mediana</b>: así una nube aislada no distorsiona el valor.</li>
          <li>Las semanas sin imagen se <b>interpolan</b> entre sus vecinas.</li>
          <li>Los valores se guardan ×1000 como enteros para que el archivo pese menos.</li>
        </ol>
        <p class="aviso">Resultado: <b>${TODAS.length}</b> parcelas × 52 semanas × 5 índices =
        <b>${valores.toLocaleString("es-MX")}</b> valores limpios.</p>
      </div>
      <div>
        <div class="etapas" role="group" aria-label="Etapas de la limpieza">
          ${ETAPAS_LIMPIEZA.map((e, i) => `<button data-etapa="${i}" class="${i === 0 ? "active" : ""}">${e}</button>`).join("")}
        </div>
        <div id="grafica-limpieza">${graficaLimpieza(0)}</div>
        <small>Ilustración: observaciones simuladas alrededor de la curva real de ${TODAS[0].id}
        para mostrar el proceso. La curva verde final sí es el dato real.</small>
      </div>
    </div>`;
}

function montarLimpieza(raiz) {
  $$("[data-etapa]", raiz).forEach((boton) => {
    boton.addEventListener("click", () => {
      $$("[data-etapa]", raiz).forEach((b) => b.classList.toggle("active", b === boton));
      $("#grafica-limpieza", raiz).innerHTML = graficaLimpieza(Number(boton.dataset.etapa));
    });
  });
}

/* ------------------------------------------------------------------------ */
/* Paso 2 · Cómo se llega al modelo                                          */
/* ------------------------------------------------------------------------ */

const FLUJO = [
  ["Series semanales", `Las ${TODAS.length} parcelas ya limpias: 5 curvas de 52 semanas cada una.`],
  ["Variables", "Cada curva se resume en promedios de ventanas del ciclo. Son 7 variables por parcela."],
  ["Ajuste", `Una regresión ridge aprende con las ${CONOCIDAS.length} parcelas de rendimiento conocido.`],
  ["Validación", "Se prueba con parcelas que el modelo no vio: partición 70/30 y validación cruzada."],
  ["Predicción", `Con todo lo aprendido se estiman las ${POR_PREDECIR.length} parcelas por predecir.`],
];

function graficaAltasBajas() {
  const orden = [...CONOCIDAS].sort((a, b) => a.y - b.y);
  const cuarto = Math.floor(orden.length / 4);
  const bajas = orden.slice(0, cuarto);
  const altas = orden.slice(-cuarto);
  const media = (lista, w) => Modelo.promedio(lista.map((p) => p.n[w])) / 1000;

  const serieBajas = Array.from({ length: 52 }, (_, w) => media(bajas, w));
  const serieAltas = Array.from({ length: 52 }, (_, w) => media(altas, w));
  const X = (w) => 30 + (w / 51) * 410;
  const Y = (v) => 150 - ((v - 0.1) / 0.8) * 135;

  return `
    <svg class="grafica" viewBox="0 0 460 180" role="img"
         aria-label="NDVI promedio de las parcelas de mayor y menor rendimiento">
      <line x1="30" x2="440" y1="150" y2="150" stroke="var(--line)" stroke-width="2"/>
      <path d="${lineaSerie(serieBajas, X, Y)}" fill="none" stroke="var(--rosa)" stroke-width="3" stroke-dasharray="6 4"/>
      <path d="${lineaSerie(serieAltas, X, Y)}" fill="none" stroke="var(--green)" stroke-width="3"/>
      ${ejeSemanas(X, 150)}
      <text x="30" y="10">NDVI promedio</text>
      <text x="250" y="10" fill="var(--green)">— ${cuarto} parcelas de mayor rendimiento</text>
      <text x="250" y="24" fill="var(--rosa)">-- ${cuarto} de menor rendimiento</text>
    </svg>`;
}

function pasoRuta() {
  return `
    <span class="kicker">Paso 2 de 6</span>
    <h2>Cómo llegas al modelo</h2>
    <p>Toca cada etapa del camino.</p>
    <div class="flujo" role="group" aria-label="Etapas">
      ${FLUJO.map(
        ([nombre], i) =>
          `${i ? '<span class="flecha" aria-hidden="true">→</span>' : ""}<button data-flujo="${i}" class="${i === 0 ? "active" : ""}">${nombre}</button>`
      ).join("")}
    </div>
    <div class="detalle-variable" id="detalle-flujo">${FLUJO[0][1]}</div>
    <h3>¿Por qué hay algo que modelar?</h3>
    ${graficaAltasBajas()}
    <small>Las parcelas de mayor rendimiento (cuartil superior) siguen una curva de NDVI distinta a las
    de menor rendimiento: esa diferencia es la señal que el modelo aprende.</small>`;
}

function montarRuta(raiz) {
  $$("[data-flujo]", raiz).forEach((boton) => {
    boton.addEventListener("click", () => {
      $$("[data-flujo]", raiz).forEach((b) => b.classList.toggle("active", b === boton));
      $("#detalle-flujo", raiz).textContent = FLUJO[Number(boton.dataset.flujo)][1];
    });
  });
}

/* ------------------------------------------------------------------------ */
/* Paso 3 · Variables                                                        */
/* ------------------------------------------------------------------------ */

// ● vienen de los datos del reto · ○ simuladas por ahora
const CARTAS = [
  { n: "EVI y NDVI ★", s: "vigor de la planta", real: true, uso: ["ndvi_ini", "evi_ini", "ndvi_pico", "ndvi_fin"],
    t: "Miden qué tan verde y vigorosa está la planta a partir de imágenes de satélite. Son de las señales más fuertes para predecir el rendimiento." },
  { n: "DSWI", s: "estrés hídrico", real: true, uso: ["dswi_fin"],
    t: "Índice de estrés hídrico: detecta cuándo el cultivo no tiene suficiente agua, antes de que se note a simple vista." },
  { n: "VI6T", s: "índice espectral", real: true, uso: [],
    t: "Índice espectral que combina bandas del satélite para resaltar el estado de la vegetación en una fecha concreta." },
  { n: "Nubosidad", s: "calidad de la imagen", real: true, uso: [],
    t: "Cuánta nube hubo en la imagen. Sirve para saber qué tanto confiar en los demás índices de esa fecha." },
  { n: "FAPAR", s: "aprovechamiento de luz", real: true, uso: ["fapar_ini"],
    t: "Fracción de la luz solar que la planta realmente aprovecha para hacer fotosíntesis." },
  { n: "LAI", s: "cantidad de hoja", real: true, uso: ["lai_ini"],
    t: "Índice de área foliar: cuántas hojas hay por metro cuadrado de suelo. Más hoja, más capacidad de captar luz." },
  { n: "CRC", s: "residuos de cultivo", real: true, uso: [],
    t: "Cobertura de residuos de cultivo: cuánto rastrojo de la cosecha anterior queda sobre el suelo." },
  { n: "SAVI", s: "NDVI ajustado al suelo", real: true, uso: [],
    t: "Como el NDVI pero corregido por el brillo del suelo; útil cuando el cultivo aún es joven y se ve mucha tierra." },
  { n: "GDD ★", s: "grados-día de desarrollo", real: false, uso: [],
    t: "Calor acumulado que la planta necesita para avanzar de etapa. Marca el ritmo del ciclo." },
  { n: "Temp. mínima", s: "y amplitud térmica", real: false, uso: [],
    t: "Las noches frías y los cambios bruscos de temperatura (heladas) afectan el llenado del grano." },
  { n: "Suelo INEGI ★", s: "tipo de suelo", real: false, uso: [],
    t: "Tipo de suelo según INEGI: textura y retención de agua influyen en cuánto rinde la parcela." },
  { n: "Eventos ★", s: "sequías, incendios, plagas", real: false, uso: [],
    t: "Sequías, incendios y plagas registrados en la zona; explican caídas de rendimiento que el clima solo no muestra." },
];

function barrasCorrelacion() {
  return Modelo.correlaciones(TODAS)
    .map((c) => {
      const ancho = Math.abs(c.r) * 50;
      const izquierda = c.r >= 0 ? 50 : 50 - ancho;

      return `
        <div class="barra-fila">
          <span>${c.nombre}</span>
          <div class="pista">
            <div class="relleno ${c.r < 0 ? "neg" : ""}" style="left:${izquierda}%;width:${ancho}%"></div>
            <div class="cero"></div>
          </div>
          <b>${c.r >= 0 ? "+" : "−"}${fmt(Math.abs(c.r), 2)}</b>
        </div>`;
    })
    .join("");
}

function pasoVariables() {
  return `
    <span class="kicker">Paso 3 de 6</span>
    <h2>¿Qué variables tiene?</h2>
    <p>● viene de los datos del reto · ○ se simula por ahora · ★ muy relevante para cebada. Toca una tarjeta.</p>
    <div class="cartas-variables">
      ${CARTAS.map(
        (c, i) => `<button class="carta" data-carta="${i}"><b>${c.real ? "●" : "○"}</b>${c.n}<br><small>${c.s}</small></button>`
      ).join("")}
    </div>
    <div class="detalle-variable" id="detalle-carta">Toca una variable para ver qué mide y si entra al modelo.</div>
    <h3>Qué tanto se relaciona cada variable del modelo con el rendimiento</h3>
    <div id="correlaciones">${barrasCorrelacion()}</div>
    <small>Correlación de Pearson con el rendimiento de las ${CONOCIDAS.length} parcelas conocidas
    (de −1 a +1). Una correlación baja sola no descarta una variable: en conjunto pueden aportar.</small>`;
}

function montarVariables(raiz) {
  $$("[data-carta]", raiz).forEach((boton) => {
    boton.addEventListener("click", () => {
      const carta = CARTAS[Number(boton.dataset.carta)];
      $$("[data-carta]", raiz).forEach((b) => b.classList.toggle("activa", b === boton));

      let uso;
      if (carta.uso.length) {
        const nombres = Modelo.CARACTERISTICAS.filter((c) => carta.uso.includes(c.clave)).map((c) => c.nombre);
        uso = `<b>Entra al modelo</b> como: ${nombres.join(", ")}.`;
      } else if (carta.real) {
        uso = "<b>Está en los CSV</b>, pero esta versión del modelo aún no la usa.";
      } else {
        uso = "<b>Simulada:</b> no entra al modelo hasta tener el dato real.";
      }
      $("#detalle-carta", raiz).innerHTML = `<b>${carta.n}.</b> ${carta.t}<br>${uso}`;
    });
  });
}

/* ------------------------------------------------------------------------ */
/* Paso 4 · Justificación                                                    */
/* ------------------------------------------------------------------------ */

function histograma() {
  const ys = CONOCIDAS.map((p) => p.y);
  const cajas = [];
  for (let inicio = 2; inicio < 5.6; inicio += 0.5) cajas.push({ inicio, cuenta: 0 });
  ys.forEach((y) => {
    const caja = cajas[Math.min(cajas.length - 1, Math.floor((y - 2) / 0.5))];
    caja.cuenta += 1;
  });

  const maximo = Math.max(...cajas.map((c) => c.cuenta));
  const X = (v) => 30 + ((v - 2) / 3.6) * 410;

  return `
    <svg class="grafica" viewBox="0 0 460 190" role="img" aria-label="Distribución de rendimientos">
      <line x1="30" x2="440" y1="150" y2="150" stroke="var(--line)" stroke-width="2"/>
      ${cajas
        .map((c) => {
          const alto = (c.cuenta / maximo) * 120;
          return `<rect x="${X(c.inicio) + 2}" y="${150 - alto}" width="${X(c.inicio + 0.5) - X(c.inicio) - 4}"
                    height="${alto}" rx="4" fill="var(--green)"/>
                  <text x="${(X(c.inicio) + X(c.inicio + 0.5)) / 2}" y="${144 - alto}" text-anchor="middle">${c.cuenta}</text>`;
        })
        .join("")}
      ${[2, 3, 4, 5].map((v) => `<text x="${X(v)}" y="164" text-anchor="middle">${v} t/ha</text>`).join("")}
      <line x1="${X(2.6)}" x2="${X(2.6)}" y1="20" y2="150" stroke="var(--rosa)" stroke-width="2" stroke-dasharray="5 4"/>
      <text x="${X(2.6) + 4}" y="28" fill="var(--rosa)">media nacional 2.6</text>
    </svg>`;
}

function pasoJustificacion() {
  const ys = CONOCIDAS.map((p) => p.y);
  const media = Modelo.promedio(ys);
  const desviacion = Modelo.desviacion(ys, media);

  return `
    <span class="kicker">Paso 4 de 6</span>
    <h2>Por qué este modelo</h2>
    <div class="metricas">
      <div class="metrica"><b>${CONOCIDAS.length}</b><small>parcelas con rendimiento conocido</small></div>
      <div class="metrica"><b>${fmt(media, 2)}</b><small>t/ha de rendimiento promedio</small></div>
      <div class="metrica"><b>${fmt(Math.min(...ys), 1)}–${fmt(Math.max(...ys), 1)}</b><small>t/ha, mínimo y máximo</small></div>
      <div class="metrica"><b>±${fmt(desviacion, 2)}</b><small>desviación estándar</small></div>
    </div>
    <div class="paso-dos">
      <div>
        <ul>
          <li><b>Hay mucho que explicar:</b> entre parcelas el rendimiento cambia más de 3 t/ha.</li>
          <li><b>El satélite ve todas las parcelas</b>, cada semana y sin visitarlas una por una.</li>
          <li><b>Pocos datos, variables parecidas:</b> con ${CONOCIDAS.length} parcelas y índices muy relacionados entre sí, un modelo muy complejo se memorizaría el ruido. Por eso se usa <b>ridge</b>, que “frena” los coeficientes.</li>
          <li><b>Se puede explicar:</b> cada coeficiente dice cuánto pesa una variable.</li>
        </ul>
      </div>
      <div>${histograma()}
      <small>Rendimientos conocidos del reto. La media nacional (INEGI, 2013–2019) es solo referencia.</small></div>
    </div>`;
}

/* ------------------------------------------------------------------------ */
/* Paso 5 · Construcción                                                     */
/* ------------------------------------------------------------------------ */

function barrasCoeficientes(modelo) {
  const maximo = Math.max(...modelo.coef.map(Math.abs), 0.01);

  return Modelo.CARACTERISTICAS.map((c, j) => {
    const w = modelo.coef[j];
    const ancho = (Math.abs(w) / maximo) * 50;

    return `
      <div class="barra-fila">
        <span>${c.nombre}</span>
        <div class="pista">
          <div class="relleno ${w < 0 ? "neg" : ""}" style="left:${w >= 0 ? 50 : 50 - ancho}%;width:${ancho}%"></div>
          <div class="cero"></div>
        </div>
        <b>${w >= 0 ? "+" : "−"}${fmt(Math.abs(w), 2)}</b>
      </div>`;
  }).join("");
}

function resultadoLambda(lambda) {
  const evaluacion = Modelo.evaluarParticion(TODAS, lambda, 11);
  const m = evaluacion.metricas;

  return `
    ${barrasCoeficientes(evaluacion.modelo)}
    <div class="metricas">
      <div class="metrica"><b>${fmt(m.r2, 2)}</b><small>R² en las ${m.n} parcelas de prueba</small></div>
      <div class="metrica"><b>${fmt(m.rmse, 2)}</b><small>RMSE (t/ha)</small></div>
    </div>`;
}

function pasoConstruccion() {
  const { entrenamiento, prueba } = Modelo.particion(TODAS, 11);

  return `
    <span class="kicker">Paso 5 de 6</span>
    <h2>Construcción del modelo</h2>
    <div class="paso-dos">
      <div>
        <ol class="lista-limpieza">
          <li><b>Variables:</b> el promedio de cada índice en una ventana del ciclo (semanas 15-25, 31-41, 42-52…).</li>
          <li><b>Estandarizar:</b> cada variable pasa a <i>z = (x − media) / desviación</i>, para compararlas.</li>
          <li><b>Partir:</b> ${entrenamiento.length} parcelas entrenan y ${prueba.length} se guardan para probar (70/30).</li>
          <li><b>Ajustar:</b> <i>ŷ = b₀ + Σ wⱼ·zⱼ</i>, con una penalización λ que encoge los pesos.</li>
        </ol>
        <p class="aviso">Las ventanas se eligieron explorando las mismas parcelas conocidas, así que
        el resultado puede salir algo optimista. Es una línea base, no el modelo final.</p>
        <table>
          <caption class="sr-only">Variables y ventanas</caption>
          <tbody>
            ${Modelo.CARACTERISTICAS.map(
              (c) => `<tr><td>${c.nombre}</td><td><small>sem. ${c.semanas[0]}–${c.semanas[1]}</small></td></tr>`
            ).join("")}
          </tbody>
        </table>
      </div>
      <div>
        <div class="cosecha-ctrl">
          <label for="lambda">Penalización λ:</label>
          <input type="range" id="lambda" min="-2" max="2" step="0.1" value="${Math.log10(Modelo.LAMBDA_INICIAL)}">
          <b id="lambda-valor">${fmt(Modelo.LAMBDA_INICIAL, 1)}</b>
        </div>
        <div id="resultado-lambda">${resultadoLambda(Modelo.LAMBDA_INICIAL)}</div>
        <small>Pesos aprendidos (en t/ha por cada desviación). Mueve λ: más alto = pesos más pequeños.</small>
      </div>
    </div>`;
}

function montarConstruccion(raiz) {
  $("#lambda", raiz).addEventListener("input", (evento) => {
    const lambda = Math.pow(10, Number(evento.target.value));
    $("#lambda-valor", raiz).textContent = fmt(lambda, lambda < 1 ? 2 : 1);
    $("#resultado-lambda", raiz).innerHTML = resultadoLambda(lambda);
  });
}

/* ------------------------------------------------------------------------ */
/* Paso 6 · Prueba                                                           */
/* ------------------------------------------------------------------------ */

function dispersion(evaluacion) {
  const X = (v) => 40 + ((v - 1.8) / 4) * 300;
  const Y = (v) => 200 - ((v - 1.8) / 4) * 175;

  const puntos = evaluacion.prueba
    .map(
      (p, i) =>
        `<circle cx="${X(p.y)}" cy="${Y(evaluacion.estimado[i])}" r="4.5" fill="var(--gold)" stroke="var(--ink)" stroke-width="1"/>`
    )
    .join("");

  return `
    <svg class="grafica" viewBox="0 0 360 230" role="img"
         aria-label="Rendimiento real contra rendimiento predicho en las parcelas de prueba">
      <line x1="40" x2="340" y1="200" y2="200" stroke="var(--line)" stroke-width="2"/>
      <line x1="40" x2="40" y1="25" y2="200" stroke="var(--line)" stroke-width="2"/>
      <line x1="${X(1.8)}" y1="${Y(1.8)}" x2="${X(5.8)}" y2="${Y(5.8)}" stroke="var(--green)" stroke-width="2" stroke-dasharray="5 4"/>
      ${puntos}
      <text x="190" y="222" text-anchor="middle">real (t/ha)</text>
      <text x="14" y="110" transform="rotate(-90 14 110)" text-anchor="middle">predicho (t/ha)</text>
      <text x="200" y="40" fill="var(--green)">la línea punteada sería el modelo perfecto</text>
    </svg>`;
}

function pasoPrueba() {
  return `
    <span class="kicker">Paso 6 de 6</span>
    <h2>Prueba del modelo</h2>
    <p>Ahora corre el modelo completo: entrena, se prueba con parcelas que no vio y predice las
    ${POR_PREDECIR.length} parcelas pendientes.</p>
    <button id="iniciar-modelo" class="btn principal">▶ Iniciar modelo</button>
    <div class="progreso" aria-hidden="true"><div id="barra-modelo"></div></div>
    <ul class="registro" id="registro-modelo"></ul>
    <div id="resultados-modelo"></div>`;
}

async function correrModelo(raiz) {
  const boton = $("#iniciar-modelo", raiz);
  const barra = $("#barra-modelo", raiz);
  const registro = $("#registro-modelo", raiz);
  const resultados = $("#resultados-modelo", raiz);
  const pausa = Paleta.movimientoReducido() ? 20 : 650;

  boton.disabled = true;
  registro.innerHTML = "";
  resultados.innerHTML = "";

  const etapas = [
    `Cargando ${CONOCIDAS.length} parcelas con rendimiento conocido`,
    "Calculando las 7 variables de cada parcela",
    "Separando 70% para entrenar y 30% para probar",
    "Entrenando la regresión ridge",
    "Validando con parcelas que no vio",
    `Prediciendo las ${POR_PREDECIR.length} parcelas pendientes`,
  ];

  for (let i = 0; i < etapas.length; i++) {
    await Util.esperar(pausa);
    registro.insertAdjacentHTML("beforeend", `<li>${etapas[i]}</li>`);
    barra.style.width = `${((i + 1) / etapas.length) * 100}%`;
  }

  const lambda = Modelo.LAMBDA_INICIAL;
  const evaluacion = Modelo.evaluarParticion(TODAS, lambda, 11);
  const cruzada = Modelo.validacionCruzada(TODAS, lambda);
  const final = Modelo.entrenarFinal(TODAS, lambda);
  const predicciones = POR_PREDECIR.map((p) => Modelo.predecir(final, p));
  const m = evaluacion.metricas;

  Almacen.sesion("bb-modelo", "1");

  resultados.innerHTML = `
    <div class="metricas">
      <div class="metrica"><b>${fmt(m.r2, 2)}</b><small>R² en ${m.n} parcelas de prueba</small></div>
      <div class="metrica"><b>${fmt(m.rmse, 2)}</b><small>RMSE de prueba (t/ha)</small></div>
      <div class="metrica"><b>${fmt(m.mae, 2)}</b><small>error absoluto medio (t/ha)</small></div>
      <div class="metrica"><b>${fmt(cruzada.r2, 2)}</b><small>R² validación cruzada (deja una fuera)</small></div>
    </div>
    <div class="paso-dos">
      <div>${dispersion(evaluacion)}</div>
      <div>
        <p><b>Lectura honesta.</b> Con un R² de ${fmt(cruzada.r2, 2)}, el modelo explica una parte del
        rendimiento, no todo: se equivoca ±${fmt(cruzada.rmse, 1)} t/ha en promedio, frente a una
        variación natural de ±${fmt(Modelo.desviacion(CONOCIDAS.map((p) => p.y)), 1)} t/ha.</p>
        <p>Predicciones de las ${POR_PREDECIR.length} parcelas: de
        <b>${fmt(Math.min(...predicciones), 1)}</b> a <b>${fmt(Math.max(...predicciones), 1)}</b> t/ha,
        con promedio de <b>${fmt(Modelo.promedio(predicciones), 1)}</b>.</p>
        <p class="aviso">Siguientes pasos: sumar clima real, suelo y eventos (hoy simulados) y probar
        modelos más flexibles. Ahora las predicciones están listas en el mapa.</p>
        <a class="btn principal" href="mapa.html">Ver las predicciones en el mapa →</a>
      </div>
    </div>`;
  boton.disabled = false;
  boton.textContent = "↻ Correr de nuevo";
}

function montarPrueba(raiz) {
  $("#iniciar-modelo", raiz).addEventListener("click", () => correrModelo(raiz));
}

/* ------------------------------------------------------------------------ */
/* Navegación de la línea del tiempo                                         */
/* ------------------------------------------------------------------------ */

const PASOS = [
  { nombre: "Limpieza", dibujar: pasoLimpieza, montar: montarLimpieza },
  { nombre: "Camino al modelo", dibujar: pasoRuta, montar: montarRuta },
  { nombre: "Variables", dibujar: pasoVariables, montar: montarVariables },
  { nombre: "Justificación", dibujar: pasoJustificacion },
  { nombre: "Construcción", dibujar: pasoConstruccion, montar: montarConstruccion },
  { nombre: "Prueba", dibujar: pasoPrueba, montar: montarPrueba },
];

let actual = 0;

function irAPaso(indice) {
  actual = clampIndice(indice);
  const contenedor = $("#paso");
  const paso = PASOS[actual];

  contenedor.innerHTML = paso.dibujar();
  contenedor.style.animation = "none";
  void contenedor.offsetWidth;
  contenedor.style.animation = "";
  if (paso.montar) paso.montar(contenedor);

  $$("#pasos li").forEach((li, i) => {
    li.classList.toggle("actual", i === actual);
    li.classList.toggle("hecho", i < actual);
    $("button", li).setAttribute("aria-current", i === actual ? "step" : "false");
  });
  $("#pasos").style.setProperty("--avance", actual / (PASOS.length - 1));

  $("#anterior").disabled = actual === 0;
  $("#siguiente").hidden = actual === PASOS.length - 1;
  history.replaceState(null, "", `#paso-${actual + 1}`);
}

const clampIndice = (i) => Math.max(0, Math.min(PASOS.length - 1, i));

$("#pasos").innerHTML = PASOS.map(
  (p, i) => `<li><button aria-label="Paso ${i + 1}: ${p.nombre}" data-paso="${i}">${i + 1}</button><span>${p.nombre}</span></li>`
).join("");

$$("#pasos button").forEach((boton) => {
  boton.addEventListener("click", () => irAPaso(Number(boton.dataset.paso)));
});
$("#anterior").addEventListener("click", () => irAPaso(actual - 1));
$("#siguiente").addEventListener("click", () => irAPaso(actual + 1));

document.addEventListener("keydown", (evento) => {
  if (evento.target.closest("input, select, textarea")) return;
  if (evento.key === "ArrowRight") irAPaso(actual + 1);
  if (evento.key === "ArrowLeft") irAPaso(actual - 1);
});

const inicial = Number((location.hash.match(/paso-(\d)/) || [])[1]) - 1;
irAPaso(Number.isFinite(inicial) && inicial >= 0 ? inicial : 0);
