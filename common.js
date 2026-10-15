"use strict";

/*
 * Se carga en todas las páginas:
 * utilidades, paleta (claro/oscuro + daltonismo), menú de navegación y cursor.
 */

const $ = (selector, raiz = document) => raiz.querySelector(selector);
const $$ = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];

const Util = {
  clamp: (valor, min, max) => Math.min(max, Math.max(min, valor)),
  suave: (x) => x * x * (3 - 2 * x),
  mezcla: (a, b, t) => a + (b - a) * t,
  esperar: (ms) => new Promise((resolver) => setTimeout(resolver, ms)),

  fmt(numero, decimales = 1) {
    return numero.toLocaleString("es-MX", {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    });
  },

  crearRng(semilla) {
    let s = semilla | 0;

    return function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  hashTexto(texto) {
    let h = 7;
    for (const caracter of texto) {
      h = (h * 31 + caracter.charCodeAt(0)) | 0;
    }
    return h >>> 0;
  },
};

/* ------------------------------------------------------------------------ */
/* Almacenamiento (puede fallar en navegación privada)                       */
/* ------------------------------------------------------------------------ */

const Almacen = {
  leer(clave, defecto) {
    try {
      return localStorage.getItem(clave) ?? defecto;
    } catch (error) {
      return defecto;
    }
  },
  guardar(clave, valor) {
    try {
      localStorage.setItem(clave, valor);
    } catch (error) {
      /* sin almacenamiento: la preferencia dura solo esta visita */
    }
  },
  sesion(clave, valor) {
    try {
      if (valor === undefined) return sessionStorage.getItem(clave);
      sessionStorage.setItem(clave, valor);
    } catch (error) {
      return null;
    }
    return valor;
  },
};

/* ------------------------------------------------------------------------ */
/* Paleta: tema claro/oscuro y tres tipos de daltonismo                      */
/* ------------------------------------------------------------------------ */

const Paleta = (() => {
  const BASE = {
    claro: {
      sky: "#fdfbf7",
      ink: "#3f4a3c",
      green: "#5e7f57",
      gold: "#e3a850",
      rosa: "#e27d9a",
      card: "rgba(253, 251, 247, 0.82)",
      line: "rgba(94, 127, 87, 0.3)",
      fondoGlobo: "#fdfbf7",
      fondoCampo: "#f6e7c1",
      puntos: "#8db17f",
      oro: "#e3a850",
      oceano: "#eef3e8",
      talloVerde: "#5e9055",
      talloOro: "#e0a53e",
      seco: "#8a6a3f",
      parcelaVerde: "#b8d3ab",
      parcelaOro: "#f0d58e",
      borde: "#7f9c73",
      camino: "#c9b58a",
      suelo: "#a9865a",
    },
    oscuro: {
      sky: "#171c16",
      ink: "#e9eedf",
      green: "#a8c69f",
      gold: "#e7b766",
      rosa: "#f0a0b8",
      card: "rgba(23, 28, 22, 0.8)",
      line: "rgba(168, 198, 159, 0.3)",
      fondoGlobo: "#171c16",
      fondoCampo: "#2a2616",
      puntos: "#5e7f57",
      oro: "#e7b766",
      oceano: "#202820",
      talloVerde: "#7fa172",
      talloOro: "#e7b766",
      seco: "#9c7b4a",
      parcelaVerde: "#4a6a44",
      parcelaOro: "#6b5a2e",
      borde: "#8fb083",
      camino: "#5b4e36",
      suelo: "#5a4528",
    },
  };

  /*
   * Daltonismo: se cambia la pareja verde/dorado (conocido / por predecir) y
   * el acento rosa por colores que cada tipo distingue bien.
   * Además, las parcelas por predecir llevan un rayado, para no depender solo
   * del color.
   */
  const DALTONISMO = {
    ninguno: { etiqueta: "Normal" },
    protanopia: {
      etiqueta: "Protanopia (rojo débil)",
      claro: { conocido: "#1f6fb5", prediccion: "#e69f00", acento: "#a63f7f" },
      oscuro: { conocido: "#6cb2f0", prediccion: "#f0b429", acento: "#e08ac0" },
    },
    deuteranopia: {
      etiqueta: "Deuteranopia (verde débil)",
      claro: { conocido: "#2a5fa8", prediccion: "#c9a800", acento: "#a63f7f" },
      oscuro: { conocido: "#7fb0ee", prediccion: "#f2e05a", acento: "#e08ac0" },
    },
    tritanopia: {
      etiqueta: "Tritanopia (azul-amarillo)",
      claro: { conocido: "#0b8a86", prediccion: "#d1483c", acento: "#4a4a4a" },
      oscuro: { conocido: "#4fd1c5", prediccion: "#ff7b6b", acento: "#d9d9d9" },
    },
  };

  const estado = {
    tema: Almacen.leer("bb-tema", "auto"),
    daltonismo: Almacen.leer("bb-cvd", "ninguno"),
    reducirMovimiento: Almacen.leer("bb-mov", "") === "1",
  };

  const consultaOscuro = window.matchMedia("(prefers-color-scheme: dark)");
  const consultaMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)");

  const hexARgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const rgbAHex = (rgb) =>
    "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

  function mezclarHex(a, b, t) {
    const ca = hexARgb(a);
    const cb = hexARgb(b);
    return rgbAHex(ca.map((v, i) => v + (cb[i] - v) * t));
  }

  function temaEfectivo() {
    if (estado.tema === "auto") return consultaOscuro.matches ? "oscuro" : "claro";
    return estado.tema;
  }

  function derivar(tema, daltonismo) {
    const paleta = { ...BASE[tema] };
    const cambio = DALTONISMO[daltonismo] && DALTONISMO[daltonismo][tema];
    if (!cambio) return paleta;

    const { conocido, prediccion, acento } = cambio;
    const claro = tema === "claro";

    return Object.assign(paleta, {
      green: conocido,
      gold: prediccion,
      rosa: acento,
      talloVerde: conocido,
      talloOro: prediccion,
      oro: prediccion,
      puntos: mezclarHex(conocido, paleta.sky, claro ? 0.4 : 0.55),
      parcelaVerde: mezclarHex(conocido, paleta.fondoCampo, 0.5),
      parcelaOro: mezclarHex(prediccion, paleta.fondoCampo, 0.5),
      borde: mezclarHex(conocido, paleta.ink, 0.15),
      line: claro ? "rgba(63, 74, 60, 0.28)" : "rgba(233, 238, 223, 0.28)",
    });
  }

  const Paleta = {
    actual: null,
    DALTONISMO,
    estado,

    aplicar() {
      const tema = temaEfectivo();
      const paleta = derivar(tema, estado.daltonismo);
      const raiz = document.documentElement;

      ["sky", "ink", "green", "gold", "rosa", "card", "line"].forEach((clave) => {
        raiz.style.setProperty(`--${clave}`, paleta[clave]);
      });
      raiz.dataset.theme = tema === "oscuro" ? "dark" : "light";
      raiz.dataset.cvd = estado.daltonismo;
      raiz.dataset.motion = estado.reducirMovimiento || consultaMovimiento.matches ? "reduce" : "full";

      Paleta.actual = paleta;
      window.dispatchEvent(new CustomEvent("paleta", { detail: paleta }));
    },

    cambiarTema(valor) {
      estado.tema = valor;
      Almacen.guardar("bb-tema", valor);
      Paleta.aplicar();
    },

    cambiarDaltonismo(valor) {
      estado.daltonismo = valor;
      Almacen.guardar("bb-cvd", valor);
      Paleta.aplicar();
    },

    cambiarMovimiento(reducir) {
      estado.reducirMovimiento = reducir;
      Almacen.guardar("bb-mov", reducir ? "1" : "0");
      Paleta.aplicar();
    },

    movimientoReducido() {
      return document.documentElement.dataset.motion === "reduce";
    },
  };

  consultaOscuro.addEventListener("change", () => {
    if (estado.tema === "auto") Paleta.aplicar();
  });

  Paleta.aplicar();
  return Paleta;
})();

/* ------------------------------------------------------------------------ */
/* Dibujo del grano (logo, adornos y cursor)                                 */
/* ------------------------------------------------------------------------ */

const Grano = {
  svg(tamano = 28) {
    return `
      <svg width="${tamano}" height="${tamano * 1.2}" viewBox="0 0 40 48" aria-hidden="true">
        <path d="M20 10 C24 6 27 3 31 1" stroke="var(--gold)" stroke-width="2" fill="none"
              stroke-linecap="round"/>
        <path d="M20 10 C28 16 29 30 20 44 C11 30 12 16 20 10Z" fill="var(--gold)"
              stroke="var(--ink)" stroke-width="1.6" stroke-linejoin="round"/>
        <path d="M20 13 C21 22 21 34 20 42" stroke="var(--ink)" stroke-opacity=".45"
              stroke-width="1.4" fill="none"/>
      </svg>`;
  },

  /**
   * Semilla para el cursor: relleno dorado, contorno oscuro grueso y un halo
   * del color del fondo, para que se distinga sobre cualquier parte de la página.
   */
  cursor() {
    const arista = "M20 10 C24 6 27 3 31 1";
    const cuerpo = "M20 10 C28 16 29 30 20 44 C11 30 12 16 20 10Z";

    return `
      <svg class="semilla" width="24" height="29" viewBox="0 0 40 48" aria-hidden="true">
        <g stroke="var(--sky)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
          <path d="${arista}" fill="none"/>
          <path d="${cuerpo}" fill="var(--sky)"/>
        </g>
        <path d="${arista}" stroke="var(--ink)" stroke-width="2.8" fill="none" stroke-linecap="round"/>
        <path d="${cuerpo}" fill="var(--gold)" stroke="var(--ink)" stroke-width="2.8"
              stroke-linejoin="round"/>
        <path d="M20 14 C21 22 21 34 20 41" stroke="var(--ink)" stroke-opacity=".55"
              stroke-width="1.8" fill="none"/>
      </svg>`;
  },
};

/* ------------------------------------------------------------------------ */
/* Navegación y menú desplegable                                             */
/* ------------------------------------------------------------------------ */

function montarNavegacion() {
  const nav = $("#nav");
  if (!nav) return;

  const actual = document.body.dataset.page;
  const enlaces = [
    ["home", "index.html", "Storytime"],
    ["mapa", "mapa.html", "Mapa"],
    ["modelo", "modelo.html", "Modelo"],
  ];

  const radios = (nombre, opciones, valorActual) =>
    opciones
      .map(
        ([valor, etiqueta]) => `
        <label class="opcion">
          <input type="radio" name="${nombre}" value="${valor}" ${valor === valorActual ? "checked" : ""}>
          <span>${etiqueta}</span>
        </label>`
      )
      .join("");

  const opcionesCvd = Object.entries(Paleta.DALTONISMO).map(([clave, d]) => [clave, d.etiqueta]);

  nav.innerHTML = `
    <a class="logo" href="index.html" aria-label="Barley Bot, inicio">${Grano.svg(24)}</a>
    <div class="nav-pill">
      ${enlaces
        .map(
          ([id, href, texto]) =>
            `<a href="${href}"${id === actual ? ' class="active" aria-current="page"' : ""}>${texto}</a>`
        )
        .join("")}
    </div>
    <div class="menu">
      <button id="menu-btn" class="ui" aria-haspopup="true" aria-expanded="false"
              aria-controls="menu-panel">Menú ▾</button>
      <div id="menu-panel" class="menu-panel" hidden>
        <a href="glosario.html" class="menu-enlace">📖 Glosario</a>
        <a href="referencias.html" class="menu-enlace">🔗 Referencias</a>
        <fieldset>
          <legend>Tema</legend>
          ${radios(
            "tema",
            [["auto", "Automático"], ["claro", "Claro"], ["oscuro", "Oscuro"]],
            Paleta.estado.tema
          )}
        </fieldset>
        <fieldset>
          <legend>Accesibilidad · daltonismo</legend>
          ${radios("cvd", opcionesCvd, Paleta.estado.daltonismo)}
        </fieldset>
        <label class="opcion">
          <input type="checkbox" id="opcion-mov" ${Paleta.movimientoReducido() ? "checked" : ""}>
          <span>Reducir movimiento</span>
        </label>
      </div>
    </div>`;

  const boton = $("#menu-btn");
  const panel = $("#menu-panel");

  const alternar = (abrir) => {
    panel.hidden = !abrir;
    boton.setAttribute("aria-expanded", String(abrir));
  };

  boton.addEventListener("click", () => alternar(panel.hidden));

  document.addEventListener("click", (evento) => {
    if (!panel.hidden && !evento.target.closest(".menu")) alternar(false);
  });

  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && !panel.hidden) {
      alternar(false);
      boton.focus();
    }
  });

  $$('input[name="tema"]', panel).forEach((radio) => {
    radio.addEventListener("change", () => Paleta.cambiarTema(radio.value));
  });
  $$('input[name="cvd"]', panel).forEach((radio) => {
    radio.addEventListener("change", () => Paleta.cambiarDaltonismo(radio.value));
  });
  $("#opcion-mov").addEventListener("change", (evento) => {
    Paleta.cambiarMovimiento(evento.target.checked);
  });
}

/* ------------------------------------------------------------------------ */
/* Cursor: una semilla de cebada (solo con ratón)                            */
/* ------------------------------------------------------------------------ */

const Cursor = (() => {
  let punto = null;
  let forzado = false;
  let sobreControl = false;

  const actualizar = () => punto && punto.classList.toggle("big", forzado || sobreControl);

  function iniciar() {
    if (document.body.dataset.cursor !== "on" || !window.matchMedia("(hover: hover)").matches) {
      return;
    }

    punto = document.createElement("div");
    punto.id = "cursor";
    punto.innerHTML = Grano.cursor();
    document.body.appendChild(punto);
    document.body.classList.add("cursor-custom");

    window.addEventListener("pointermove", (evento) => {
      punto.style.transform = `translate(${evento.clientX}px, ${evento.clientY}px)`;
      sobreControl = Boolean(
        evento.target.closest && evento.target.closest("button, a, input, [data-hover]")
      );
      actualizar();
    });
  }

  return {
    iniciar,
    grande(valor) {
      forzado = valor;
      actualizar();
    },
  };
})();

document.addEventListener("DOMContentLoaded", () => {
  montarNavegacion();
  Cursor.iniciar();
});
