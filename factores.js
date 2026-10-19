"use strict";

/*
 * Sección «Factores» del storytime.
 *
 * Una parcela real por estado (la de rendimiento conocido más cercano a la
 * mediana de su estado) y su año 2025 semana a semana: una planta que crece
 * según los índices de satélite, las curvas que se dibujan con el tiempo y
 * las relaciones entre variables, calculadas con los datos de esa parcela.
 *
 * Reales: NDVI, EVI, LAI (Planet), FAPAR, DSWI (Sentinel-2) y nubosidad.
 * Simulados: temperatura mínima y GDD.
 */

(() => {
  const contenedor = $("#factores-demo");
  if (!contenedor) return;

  const ESTADOS = ["Puebla", "Tlaxcala", "Hidalgo"];
  const MAX_PARCELAS = 66;
  const SEMANA_INICIAL = 14;
  const SEMANA_FINAL = 51;
  const SEGUNDOS_POR_FASE = 4.2;
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

  const SERIES = [
    { clave: "n", nombre: "NDVI", color: "var(--green)", trazo: "" },
    { clave: "e", nombre: "EVI", color: "var(--gold)", trazo: "7 3" },
    { clave: "l", nombre: "LAI", color: "var(--rosa)", trazo: "" },
    { clave: "f", nombre: "FAPAR", color: "var(--ink)", trazo: "10 3 2 3" },
    { clave: "d", nombre: "DSWI", color: "var(--green)", trazo: "2 4" },
  ];
  const ETIQUETAS_FASE = ["Arranque", "Macollamiento", "Pico", "Madurez"];
  const NOMBRE = Object.fromEntries(SERIES.map((s) => [s.clave, s.nombre]));
  const ORDEN = SERIES.map((s) => s.clave);

  const EXPLICACION = {
    "n-e": "Los dos miden el verdor con luz roja e infrarroja cercana (ambos vienen de Planet). El EVI solo añade una corrección por atmósfera y suelo, por eso casi siempre suben y bajan juntos.",
    "n-l": "Más hojas (LAI) significa más superficie que absorbe luz roja y refleja infrarroja: el NDVI sube con la cantidad de hoja, hasta que se satura.",
    "n-f": "Una planta más verde absorbe más luz para hacer fotosíntesis. El NDVI viene de Planet y el FAPAR de Sentinel-2: que dos satélites coincidan da confianza en la señal.",
    "n-d": "El DSWI mira el agua en la vegetación. Mientras la planta está llena de agua y verde, sube con el NDVI; en la maduración las hojas se secan y los dos caen.",
    "e-l": "El EVI sigue mejor la cantidad de hoja en cultivos densos, porque no se satura tan pronto como el NDVI.",
    "e-f": "Los dos reflejan cuánta hoja verde está captando luz; el EVI, además, corrige la atmósfera.",
    "l-f": "Cada hoja nueva intercepta más radiación: con LAI alto sube el FAPAR, hasta que el follaje cierra y casi toda la luz ya se aprovecha.",
    "l-d": "Más hoja suele traer más agua en la vegetación (DSWI), y las dos bajan cuando la planta se seca.",
    "f-d": "FAPAR y DSWI vienen del mismo satélite (Sentinel-2): comparten fechas, nubes y ruido, además de seguir a la misma planta.",
    "e-d": "Cuando la planta tiene agua, el verdor corregido (EVI) y el DSWI suben juntos; al secarse, caen juntos.",
  };

  // Las cuatro relaciones que se cuentan, en el orden del ciclo
  const RELACIONES_MOSTRADAS = ["l-f", "n-l", "n-e", "n-d"];

  /* --- Datos de la parcela --------------------------------------------- */

  function elegirParcela(zona) {
    const lista = DATA.P.slice(zona * MAX_PARCELAS, (zona + 1) * MAX_PARCELAS).filter((p) => !p.p);
    const ordenadas = lista.map((p) => p.y).sort((a, b) => a - b);
    const mediana = ordenadas[Math.floor(ordenadas.length / 2)];

    return lista.reduce((mejor, p) => (Math.abs(p.y - mediana) < Math.abs(mejor.y - mediana) ? p : mejor));
  }

  const PARCELAS = ESTADOS.map((_, zona) => elegirParcela(zona));

  function prepararParcela(parcela) {
    const rangos = {};
    ORDEN.forEach((clave) => {
      rangos[clave] = [Math.min(...parcela[clave]), Math.max(...parcela[clave])];
    });

    // Fases del ciclo, a partir del NDVI de esta parcela
    let pico = 20;
    for (let w = 20; w <= 48; w++) if (parcela.n[w] > parcela.n[pico]) pico = w;

    const base = Math.min(...parcela.n.slice(SEMANA_INICIAL, pico + 1));
    const alcanza = (fraccion) => {
      for (let w = SEMANA_INICIAL; w <= pico; w++) {
        if (parcela.n[w] >= base + fraccion * (parcela.n[pico] - base)) return w;
      }
      return pico;
    };
    const arranque = Math.max(alcanza(0.15), SEMANA_INICIAL + 3);
    const medio = Math.max(alcanza(0.6), arranque + 3);
    const cima = Math.max(pico, medio + 3);

    // Correlaciones entre pares de índices durante el ciclo
    const correlaciones = {};
    ORDEN.forEach((a, i) => {
      ORDEN.slice(i + 1).forEach((b) => {
        correlaciones[`${a}-${b}`] = Modelo.pearson(
          parcela[a].slice(SEMANA_INICIAL, SEMANA_FINAL + 1),
          parcela[b].slice(SEMANA_INICIAL, SEMANA_FINAL + 1)
        );
      });
    });

    return { parcela, rangos, arranque, medio, cima, correlaciones, fronteras: [SEMANA_INICIAL, arranque, medio, cima, SEMANA_FINAL] };
  }

  const DATOS = PARCELAS.map(prepararParcela);

  /* --- Utilidades ------------------------------------------------------ */

  const valorEn = (serie, w) => {
    const i = Math.min(SEMANA_FINAL - 1, Math.floor(w));
    return serie[i] + (serie[i + 1] - serie[i]) * (w - i);
  };

  const normalizado = (datos, clave, w) => {
    const [min, max] = datos.rangos[clave];
    return clamp((valorEn(datos.parcela[clave], w) - min) / (max - min || 1), 0, 1);
  };

  const mesDeSemana = (w) => {
    const fecha = new Date(2025, 0, 1 + Math.round(w) * 7);
    return MESES[fecha.getMonth()];
  };

  function mezclaColor(a, b, t) {
    const parte = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    return (
      "#" +
      [0, 1, 2]
        .map((i) => Math.round(parte(a, i) + (parte(b, i) - parte(a, i)) * t).toString(16).padStart(2, "0"))
        .join("")
    );
  }

  const fraseFuerza = (r) => {
    const fuerza = Math.abs(r) >= 0.9 ? "muy fuerte" : Math.abs(r) >= 0.7 ? "fuerte" : Math.abs(r) >= 0.4 ? "moderada" : "débil";
    return r < 0 ? `${fuerza}, en sentido contrario` : fuerza;
  };

  /* --- Fases ----------------------------------------------------------- */

  function fasesDe(datos) {
    const { parcela, fronteras, cima } = datos;
    const [, arranque, medio] = fronteras;
    const v = (clave, w) => Util.fmt(parcela[clave][w] / 1000, 2);
    const secaCon = parcela.d[SEMANA_FINAL] < parcela.d[cima] ? "baja" : "cambia";

    return [
      {
        titulo: `Arranque · semanas ${SEMANA_INICIAL + 1}–${arranque + 1}`,
        texto: `El campo apenas despierta. Los grados-día* se acumulan poco a poco y las noches frías (Tmín ${DATA.cli.tmin[arranque]} °C*) frenan el crecimiento. Con pocas hojas (LAI ${v("l", arranque)}) la planta casi no aprovecha luz (FAPAR ${v("f", arranque)}).`,
        series: ["l", "f"],
        pares: [],
      },
      {
        titulo: `Macollamiento · semanas ${arranque + 1}–${medio + 1}`,
        texto: `Cada hoja nueva atrapa más luz: sube el LAI (hasta ${v("l", medio)}) y con él el FAPAR (${v("f", medio)}). Más hoja verde también eleva el NDVI y el EVI. Es una cadena: hoja → luz → verdor.`,
        series: ["l", "f", "n"],
        pares: ["l-f", "n-l"],
      },
      {
        titulo: `Pico · semanas ${medio + 1}–${cima + 1}`,
        texto: `El NDVI llega a ${v("n", cima)} en la semana ${cima + 1} y se aplana: con tanta hoja ya no distingue entre «mucha» y «muchísima». El EVI, que corrige atmósfera y suelo, se satura menos y separa mejor las parcelas densas.`,
        series: ["n", "e"],
        pares: ["n-e"],
      },
      {
        titulo: `Maduración · semanas ${cima + 1}–${SEMANA_FINAL + 1}`,
        texto: `El grano se llena y la planta se seca. El DSWI ${secaCon} (de ${v("d", cima)} a ${v("d", SEMANA_FINAL)}): las hojas pierden agua y el NDVI baja con él. Por eso el modelo usa el NDVI y el DSWI de esta etapa.`,
        series: ["d", "n"],
        pares: ["n-d"],
      },
    ];
  }

  /* --- Estado y estructura --------------------------------------------- */

  const estado = {
    zona: 0,
    w: SEMANA_INICIAL,
    jugando: false,
    visibles: new Set(ORDEN),
    fase: -1,
    iniciado: false,
    enPantalla: false,
  };

  let fases = fasesDe(DATOS[0]);

  contenedor.innerHTML = `
    <div class="factores-tabs" id="fz-tabs" role="group" aria-label="Estado"></div>
    <div class="factores-grid">
      <div class="factores-col">
        <svg class="factores-escena" id="fz-escena" viewBox="0 0 300 262" role="img"
             aria-label="Planta de cebada que crece según los índices de satélite"></svg>
        <dl class="factores-datos" aria-label="Clima de la semana">
          <div><dt>Nubes</dt><dd id="fz-nubes">0%</dd></div>
          <div><dt>Tmín*</dt><dd id="fz-tmin">0 °C</dd></div>
          <div><dt>GDD*</dt><dd id="fz-gdd">0</dd></div>
        </dl>
      </div>
      <div class="factores-col">
        <div class="factores-chips" id="fz-chips" role="group" aria-label="Variables de la gráfica"></div>
        <svg class="factores-grafica" id="fz-grafica" viewBox="0 0 460 240" role="img"
             aria-label="Curvas de los índices de satélite y del clima de la parcela en 2025"></svg>
        <p class="factores-leyenda">
          Semanas de 2025. Cada curva va de su mínimo (0) a su máximo (1). Abajo: barras de nubosidad
          (real) y línea de Tmín* (simulada).
        </p>
        <div class="factores-ctrl">
          <button id="fz-play" aria-label="Reproducir o pausar">▶</button>
          <span>Sem. <b id="fz-semana">15</b> · <span id="fz-mes">abril</span></span>
          <input type="range" id="fz-slider" min="${SEMANA_INICIAL}" max="${SEMANA_FINAL}" step="0.1"
                 value="${SEMANA_INICIAL}" aria-label="Semana de 2025" />
        </div>
        <div class="factores-fases" id="fz-fases" role="group" aria-label="Fases del ciclo"></div>
      </div>
    </div>
    <div class="factores-fase" id="fz-fase" aria-live="polite"></div>
    <div class="factores-relaciones" id="fz-relaciones"></div>
    <small class="factores-nota">
      Parcela real de cada estado, año 2025. Planet: NDVI, EVI, LAI · Sentinel-2: FAPAR, DSWI ·
      * simulado (temperatura y GDD). Las correlaciones se calculan con las semanas 15 a 52 de la parcela elegida.
    </small>`;

  const el = {
    tabs: $("#fz-tabs"),
    escena: $("#fz-escena"),
    chips: $("#fz-chips"),
    grafica: $("#fz-grafica"),
    play: $("#fz-play"),
    semana: $("#fz-semana"),
    mes: $("#fz-mes"),
    slider: $("#fz-slider"),
    fase: $("#fz-fase"),
    relaciones: $("#fz-relaciones"),
    fases: $("#fz-fases"),
    nubes: $("#fz-nubes"),
    tmin: $("#fz-tmin"),
    gdd: $("#fz-gdd"),
  };

  function montarTabs() {
    el.tabs.innerHTML = "";
    ESTADOS.forEach((nombre, zona) => {
      const boton = document.createElement("button");
      boton.className = zona === estado.zona ? "active" : "";
      boton.innerHTML = `${nombre}<small>${PARCELAS[zona].id} · ${Util.fmt(PARCELAS[zona].y, 1)} t/ha</small>`;
      boton.addEventListener("click", () => elegirZona(zona));
      el.tabs.appendChild(boton);
    });
  }

  function montarChips() {
    el.chips.innerHTML = "";
    SERIES.forEach(({ clave, nombre }) => {
      const boton = document.createElement("button");
      boton.textContent = nombre;
      boton.className = estado.visibles.has(clave) ? "active" : "";
      boton.addEventListener("click", () => {
        if (estado.visibles.has(clave) && estado.visibles.size > 1) estado.visibles.delete(clave);
        else estado.visibles.add(clave);
        boton.classList.toggle("active", estado.visibles.has(clave));
        dibujar();
      });
      el.chips.appendChild(boton);
    });
  }

  function montarFases() {
    el.fases.innerHTML = "";
    ETIQUETAS_FASE.forEach((nombre, i) => {
      const boton = document.createElement("button");
      boton.innerHTML = `<i>${i + 1}</i>${nombre}`;
      boton.addEventListener("click", () => {
        estado.jugando = false;
        estado.w = DATOS[estado.zona].fronteras[i];
        dibujar();
      });
      el.fases.appendChild(boton);
    });
  }

  /* --- Dibujo: planta -------------------------------------------------- */

  const SOL = { x: 250, y: 46 };
  const SUELO_Y = 238;

  function dibujarEscena(datos, w, t) {
    const [, , medio, cima] = datos.fronteras;
    const vn = normalizado(datos, "n", w);
    const vl = normalizado(datos, "l", w);
    const vf = normalizado(datos, "f", w);
    const vd = normalizado(datos, "d", w);
    const madurez = clamp((w - cima) / (SEMANA_FINAL - cima), 0, 1);
    const nubes = valorEn(DATA.cli.cld, w) / 100;

    const alto = 16 + 150 * vn;
    const balanceo = Math.sin(t * 1.5) * 2.2;
    const x0 = 150;
    const xTop = x0 + balanceo;
    const yTop = SUELO_Y - alto;

    const verde = "#6f9a58";
    const dorado = "#d3a94a";
    const colorTallo = mezclaColor(verde, dorado, madurez);
    const colorHoja = mezclaColor(verde, dorado, clamp(madurez * 0.8 + (1 - vd) * 0.25 * madurez, 0, 1));

    // Puntos sobre el tallo
    const sobreTallo = (f) => ({ x: x0 + (xTop - x0) * f * f, y: SUELO_Y - alto * f });

    const hojas = [0.2, 0.42, 0.64]
      .map((f, i) => {
        const p = sobreTallo(f);
        const largo = (10 + 52 * vl) * (1 - 0.3 * madurez) * (1 - i * 0.12);
        const lado = i % 2 === 0 ? 1 : -1;
        const caida = madurez * 14;

        return [lado, -lado]
          .map(
            (d) => `
          <path d="M0 0 Q ${largo * 0.5} ${-largo * 0.4 + caida * 0.5} ${largo} ${-largo * 0.1 + caida} Q ${largo * 0.5} ${-largo * 0.1 + caida * 0.3} 0 0Z"
                transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${d} 1)"
                fill="${colorHoja}" opacity="${(0.25 + 0.75 * clamp(vl * 2.5, 0, 1)).toFixed(2)}"/>`
          )
          .join("");
      })
      .join("");

    // Espiga: aparece al macollar y se llena con la maduración
    const avance = clamp((w - medio) / (cima - medio), 0, 1);
    const largoEspiga = 34 * avance;
    let espiga = "";
    if (avance > 0) {
      const granos = [];
      for (let k = 0; k < 6; k++) {
        const y = yTop - 4 - (k / 6) * largoEspiga;
        const tam = (3 + 2.6 * madurez) * avance;
        const color = mezclaColor(verde, dorado, clamp(madurez * 1.2, 0, 1));

        granos.push(
          `<ellipse cx="${(xTop - 4.5).toFixed(1)}" cy="${y.toFixed(1)}" rx="${(tam * 0.7).toFixed(1)}" ry="${tam.toFixed(1)}" transform="rotate(-18 ${xTop - 4.5} ${y})" fill="${color}" stroke="#6b5a2e" stroke-width=".6"/>`,
          `<ellipse cx="${(xTop + 4.5).toFixed(1)}" cy="${y.toFixed(1)}" rx="${(tam * 0.7).toFixed(1)}" ry="${tam.toFixed(1)}" transform="rotate(18 ${xTop + 4.5} ${y})" fill="${color}" stroke="#6b5a2e" stroke-width=".6"/>`,
          `<line x1="${xTop - 5}" y1="${y - tam}" x2="${xTop - 12}" y2="${y - tam - 15 * avance}" stroke="${dorado}" stroke-width=".8"/>`,
          `<line x1="${xTop + 5}" y1="${y - tam}" x2="${xTop + 12}" y2="${y - tam - 15 * avance}" stroke="${dorado}" stroke-width=".8"/>`
        );
      }
      espiga = granos.join("");
    }

    // Luz que llega a las hojas: más intensa cuanto mayor es el FAPAR
    const hojaMedia = sobreTallo(0.55);
    const rayos = [-14, 0, 14]
      .map(
        (d) => `
        <line x1="${SOL.x - 12}" y1="${SOL.y + 12}" x2="${hojaMedia.x + 18 + d * 0.5}" y2="${hojaMedia.y - 10 + d}"
              stroke="var(--gold)" stroke-width="2.2" stroke-dasharray="5 5"
              stroke-dashoffset="${(-t * 12).toFixed(1)}" opacity="${(0.12 + 0.8 * vf * (1 - nubes * 0.6)).toFixed(2)}"/>`
      )
      .join("");

    const gota = 4 + 7 * vd;

    el.escena.innerHTML = `
      <rect width="300" height="262" fill="var(--sky)"/>
      <circle cx="${SOL.x}" cy="${SOL.y}" r="${13 + 3 * vf}" fill="var(--gold)" opacity="${(0.55 + 0.45 * (1 - nubes)).toFixed(2)}"/>
      <g opacity="${(0.15 + 0.85 * nubes).toFixed(2)}" fill="var(--line)" stroke="var(--ink)" stroke-opacity=".35">
        <ellipse cx="78" cy="48" rx="34" ry="13"/><ellipse cx="62" cy="40" rx="16" ry="12"/><ellipse cx="92" cy="38" rx="18" ry="14"/>
      </g>
      <text x="78" y="70" text-anchor="middle">nubes</text>
      ${rayos}
      <rect x="0" y="${SUELO_Y}" width="300" height="24" fill="#a9865a" opacity=".55"/>
      <path d="M${x0} ${SUELO_Y} C ${x0 - 3} ${SUELO_Y - alto * 0.4}, ${x0 + 4} ${SUELO_Y - alto * 0.7}, ${xTop.toFixed(1)} ${yTop.toFixed(1)}"
            fill="none" stroke="${colorTallo}" stroke-width="3.4" stroke-linecap="round"/>
      ${hojas}
      ${espiga}
      <path d="M215 ${SUELO_Y - 8} q ${-gota * 0.9} ${-gota * 1.2} 0 ${-gota * 2} q ${gota * 0.9} ${gota * 0.8} 0 ${gota * 2}Z"
            fill="#5aa0d8" opacity="${(0.3 + 0.7 * vd).toFixed(2)}"/>
      <text x="228" y="${SUELO_Y - 6}">agua (DSWI)</text>
      <text x="${SOL.x}" y="${SOL.y - 24}" text-anchor="middle">luz (FAPAR)</text>`;
  }

  /* --- Dibujo: gráfica ------------------------------------------------- */

  const X = (w) => 28 + ((w - SEMANA_INICIAL) / (SEMANA_FINAL - SEMANA_INICIAL)) * 422;
  const Y = (v) => 150 - v * 100;
  const BASE_CLIMA = 226;

  function dibujarGrafica(datos, w) {
    const fase = estado.fase;
    const activas = fase >= 0 ? fases[fase].series : [];
    const { fronteras } = datos;

    // Cada fase lleva su número dentro de la banda; los nombres están en los botones de abajo
    const bandas = fases
      .map((f, i) => {
        const x1 = X(fronteras[i]);
        const x2 = X(fronteras[i + 1]);
        const cx = (x1 + x2) / 2;
        const actual = i === fase;

        return `
          <rect x="${x1}" y="14" width="${x2 - x1}" height="136" fill="${i % 2 ? "var(--green)" : "var(--gold)"}"
                opacity="${actual ? 0.2 : 0.07}"/>
          ${i ? `<line x1="${x1}" x2="${x1}" y1="14" y2="150" stroke="var(--line)" stroke-dasharray="2 4"/>` : ""}
          <circle cx="${cx}" cy="29" r="9" fill="${actual ? "var(--green)" : "none"}" stroke="var(--green)"
                  stroke-width="1.5" opacity="${actual ? 1 : 0.5}"/>
          <text x="${cx}" y="32.5" text-anchor="middle"
                style="font-weight:800;fill:${actual ? "var(--sky)" : "var(--ink)"}">${i + 1}</text>`;
      })
      .join("");

    const lineas = SERIES.filter((s) => estado.visibles.has(s.clave))
      .map((serie) => {
        const valores = [];
        for (let i = SEMANA_INICIAL; i <= SEMANA_FINAL; i++) valores.push(normalizado(datos, serie.clave, i));

        const completa = valores.map((v, i) => `${i ? "L" : "M"}${X(SEMANA_INICIAL + i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
        const hasta = Math.floor(w) - SEMANA_INICIAL;
        let avance = valores
          .slice(0, hasta + 1)
          .map((v, i) => `${i ? "L" : "M"}${X(SEMANA_INICIAL + i).toFixed(1)},${Y(v).toFixed(1)}`)
          .join("");
        avance += ` L${X(w).toFixed(1)},${Y(normalizado(datos, serie.clave, w)).toFixed(1)}`;

        const destacada = activas.includes(serie.clave);
        return `
          <path d="${completa}" fill="none" stroke="${serie.color}" stroke-width="1.5" opacity=".15"/>
          <path d="${avance}" fill="none" stroke="${serie.color}" stroke-dasharray="${serie.trazo}"
                stroke-width="${destacada ? 3.6 : 2.2}" opacity="${destacada || !activas.length ? 1 : 0.4}"
                stroke-linecap="round"/>`;
      })
      .join("");

    // Franja de clima: nubosidad (real) y temperatura mínima (simulada)
    const tmin = DATA.cli.tmin.slice(SEMANA_INICIAL, SEMANA_FINAL + 1);
    const tMin = Math.min(...tmin);
    const tMax = Math.max(...tmin);
    const barras = DATA.cli.cld
      .slice(SEMANA_INICIAL, Math.floor(w) + 1)
      .map((v, i) => `<rect x="${X(SEMANA_INICIAL + i) - 4}" y="${BASE_CLIMA - v * 0.3}" width="8" height="${v * 0.3}" rx="1.5" fill="var(--ink)" opacity=".22"/>`)
      .join("");
    const termica = tmin
      .slice(0, Math.floor(w) - SEMANA_INICIAL + 1)
      .map((v, i) => `${i ? "L" : "M"}${X(SEMANA_INICIAL + i).toFixed(1)},${(BASE_CLIMA - ((v - tMin) / (tMax - tMin || 1)) * 28).toFixed(1)}`)
      .join("");

    const ejes = [15, 20, 30, 40, 52]
      .map(
        (s) => `
        <line x1="${X(s - 1)}" x2="${X(s - 1)}" y1="150" y2="155" stroke="var(--line)" stroke-width="2"/>
        <text x="${X(s - 1)}" y="170" text-anchor="middle">${s}</text>`
      )
      .join("");

    el.grafica.innerHTML = `
      ${bandas}
      <line x1="28" x2="450" y1="150" y2="150" stroke="var(--line)" stroke-width="2"/>
      ${lineas}
      <line x1="${X(w)}" x2="${X(w)}" y1="14" y2="150" stroke="var(--rosa)" stroke-width="2"/>
      ${ejes}
      <line x1="28" x2="450" y1="${BASE_CLIMA}" y2="${BASE_CLIMA}" stroke="var(--line)"/>
      ${barras}
      <path d="${termica}" fill="none" stroke="var(--rosa)" stroke-width="2" stroke-dasharray="4 3"/>`;
  }

  /* --- Fase y relaciones ----------------------------------------------- */

  function faseDe(datos, w) {
    const f = datos.fronteras;
    for (let i = 0; i < 4; i++) if (w < f[i + 1]) return i;
    return 3;
  }

  function dibujarRelaciones(datos) {
    const activos = estado.fase >= 0 ? fases[estado.fase].pares : [];

    el.relaciones.innerHTML = RELACIONES_MOSTRADAS.map((par) => {
      const [a, b] = par.split("-");
      const r = datos.correlaciones[par];

      // Si en esta parcela la relación sale débil o inversa, se dice con honestidad
      const nota =
        r < 0.4
          ? `<p class="nota"><i>Ojo: en general se espera una relación positiva, pero en esta parcela sale ${fraseFuerza(r)}. Los datos de satélite tienen ruido y cada parcela es distinta.</i></p>`
          : "";

      return `
        <div class="relacion ${activos.includes(par) ? "activa" : ""}">
          <div class="relacion-cab">
            <b>${NOMBRE[a]} ↔ ${NOMBRE[b]}</b>
            <span class="r">r = ${Util.fmt(r, 2)}</span>
          </div>
          <small class="fuerza">${fraseFuerza(r)}</small>
          <p>${EXPLICACION[par]}</p>
          ${nota}
        </div>`;
    }).join("");
  }

  function actualizarFase(datos, w) {
    const nueva = faseDe(datos, w);
    if (nueva === estado.fase) return;

    estado.fase = nueva;
    const [nombre, semanas] = fases[nueva].titulo.split(" · ");
    el.fase.innerHTML = `
      <div class="fase-cab">
        <span class="fase-num">${nueva + 1}</span>
        <div><b>${nombre}</b><small>${semanas}</small></div>
      </div>
      <p>${fases[nueva].texto}</p>`;
    [...el.fases.children].forEach((boton, i) => boton.classList.toggle("active", i === nueva));
    dibujarRelaciones(datos);
  }

  /* --- Bucle ----------------------------------------------------------- */

  function dibujar() {
    const datos = DATOS[estado.zona];
    const w = estado.w;

    actualizarFase(datos, w);
    dibujarEscena(datos, w, performance.now() / 1000);
    dibujarGrafica(datos, w);

    el.semana.textContent = Math.round(w) + 1;
    el.mes.textContent = mesDeSemana(w);

    const semanaEntera = Math.min(SEMANA_FINAL, Math.round(w));
    el.nubes.textContent = `${Math.round(valorEn(DATA.cli.cld, w))}%`;
    el.tmin.textContent = `${DATA.cli.tmin[semanaEntera]} °C`;
    el.gdd.textContent = `${DATA.cli.gdd[semanaEntera]}`;
    el.slider.value = w;
    el.play.textContent = estado.jugando ? "⏸" : estado.w >= SEMANA_FINAL ? "↻" : "▶";
  }

  let previo = 0;

  function ciclo(ahora) {
    const dt = Math.min(0.05, (ahora - previo) / 1000);
    previo = ahora;

    if (estado.enPantalla) {
      if (estado.jugando) {
        const datos = DATOS[estado.zona];
        const fase = faseDe(datos, estado.w);
        const duracion = datos.fronteras[fase + 1] - datos.fronteras[fase];

        estado.w = Math.min(SEMANA_FINAL, estado.w + (duracion / SEGUNDOS_POR_FASE) * dt);
        if (estado.w >= SEMANA_FINAL) estado.jugando = false;
      }
      dibujar();
    }
    requestAnimationFrame(ciclo);
  }

  /* --- Acciones -------------------------------------------------------- */

  function reproducir() {
    if (estado.w >= SEMANA_FINAL) estado.w = SEMANA_INICIAL;
    estado.jugando = true;
  }

  function elegirZona(zona) {
    estado.zona = zona;
    estado.w = SEMANA_INICIAL;
    estado.fase = -1;
    fases = fasesDe(DATOS[zona]);
    montarTabs();
    if (Paleta.movimientoReducido()) {
      estado.w = DATOS[zona].cima;
      estado.jugando = false;
    } else {
      reproducir();
    }
    dibujar();
  }

  el.play.addEventListener("click", () => {
    if (estado.jugando) estado.jugando = false;
    else reproducir();
  });

  el.slider.addEventListener("input", (evento) => {
    estado.jugando = false;
    estado.w = Number(evento.target.value);
  });

  // Solo se anima cuando la sección está a la vista; arranca sola la primera vez
  new IntersectionObserver(
    (entradas) => {
      entradas.forEach((entrada) => {
        estado.enPantalla = entrada.isIntersecting;

        if (entrada.isIntersecting && !estado.iniciado) {
          estado.iniciado = true;
          if (Paleta.movimientoReducido()) estado.w = DATOS[estado.zona].cima;
          else reproducir();
        }
      });
    },
    { threshold: 0.3 }
  ).observe($("#factores"));

  montarTabs();
  montarChips();
  montarFases();
  dibujar();
  requestAnimationFrame(ciclo);
})();
