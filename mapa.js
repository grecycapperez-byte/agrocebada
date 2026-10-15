"use strict";

/*
 * Mapa y parcelas.
 *
 *   contexto  → la mascota explica qué es una parcela
 *   estados   → globo con divisiones; se elige Puebla, Tlaxcala o Hidalgo
 *   viaje     → se resalta el estado, la mascota habla, salta girando y se
 *               encoge sobre él (sin scroll)
 *   campo     → parcelas irregulares; primero la mascota cuenta cómo creció
 *               la cebada (sin barra) y luego se abre la barra de semanas
 *
 * Las posiciones de las parcelas son ilustrativas: los CSV no traen
 * coordenadas. Forma y tamaño sí parten de datos reales (área en hectáreas).
 */

const C = { ...Paleta.actual };

/* ------------------------------------------------------------------------ */
/* Renderizador, escena y mascota                                            */
/* ------------------------------------------------------------------------ */

const renderizador = new THREE.WebGLRenderer({ canvas: $("#gl"), antialias: true, alpha: true });
const escena = new THREE.Scene();
const camara = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
const mascota = crearEscenaMascota($("#mascot"));

renderizador.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

function ajustarTamano() {
  renderizador.setSize(window.innerWidth, window.innerHeight, false);
  camara.aspect = window.innerWidth / window.innerHeight;
  camara.updateProjectionMatrix();
  mascota.ajustar();
}

const puntero = mascota.puntero;

/* ------------------------------------------------------------------------ */
/* Geometría y utilidades geográficas                                        */
/* ------------------------------------------------------------------------ */

function puntoEnPoligono(x, y, poligono) {
  let dentro = false;

  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [xi, yi] = poligono[i];
    const [xj, yj] = poligono[j];
    const cruza = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (cruza) dentro = !dentro;
  }
  return dentro;
}

function latLonAVector(lon, lat, radio) {
  const lambda = lon * D2R;
  const phi = lat * D2R;

  return new THREE.Vector3(
    radio * Math.cos(phi) * Math.sin(lambda),
    radio * Math.sin(phi),
    radio * Math.cos(phi) * Math.cos(lambda)
  );
}

const enMexico = (lon, lat) => CONTORNO_MEXICO.some((poligono) => puntoEnPoligono(lon, lat, poligono));

const enTierra = (lon, lat) =>
  Object.values(PAISES).some((poligono) => puntoEnPoligono(lon, lat, poligono));

function densificar(poligono) {
  const resultado = [];

  poligono.forEach((a, i) => {
    const b = poligono[(i + 1) % poligono.length];
    const pasos = Math.max(
      1,
      Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / 0.4)
    );

    for (let p = 0; p < pasos; p++) {
      resultado.push([mezcla(a[0], b[0], p / pasos), mezcla(a[1], b[1], p / pasos)]);
    }
  });
  return resultado;
}

/* ------------------------------------------------------------------------ */
/* Globo con divisiones por estado                                           */
/* ------------------------------------------------------------------------ */

const RADIO = 3.0;
const globo = new THREE.Group();
escena.add(globo);

const crearNube = (vectores, color) =>
  new THREE.Points(
    new THREE.BufferGeometry().setFromPoints(vectores),
    new THREE.PointsMaterial({ color, size: 0.03 })
  );

const enEstados = (lon, lat, poligono) => puntoEnPoligono(lon, lat, poligono);

/** Nombre del estado en un punto (los enclaves se pintan encima, así que se revisan al revés). */
function estadoEnPunto(lon, lat) {
  for (let i = ESTADOS_MEXICO.length - 1; i >= 0; i--) {
    if (enEstados(lon, lat, ESTADOS_MEXICO[i].anillo)) return ESTADOS_MEXICO[i].nombre;
  }
  return null;
}

function crearPuntosGlobo() {
  const base = [];
  const TOTAL_BASE = 16000;

  for (let i = 0; i < TOTAL_BASE; i++) {
    const y = 1 - (2 * (i + 0.5)) / TOTAL_BASE;
    const radio = Math.sqrt(1 - y * y);
    const angulo = i * 2.39996;
    const lat = Math.asin(y) / D2R;
    const lon = Math.atan2(radio * Math.sin(angulo), radio * Math.cos(angulo)) / D2R;

    if (!enMexico(lon, lat) && enTierra(lon, lat)) base.push(latLonAVector(lon, lat, RADIO));
  }
  return { base };
}

/* --- Textura de México: estados con relleno y fronteras nítidas ----------- */

// Ventana geográfica de la textura (2:1 para poder usar mipmaps)
const TEXTURA = { lon0: -118.5, lon1: -86.5, lat0: 14, lat1: 33.2, ancho: 4096, alto: 2048 };

const lienzoMexico = document.createElement("canvas");
lienzoMexico.width = TEXTURA.ancho;
lienzoMexico.height = TEXTURA.alto;

const texturaMexico = new THREE.CanvasTexture(lienzoMexico);
texturaMexico.generateMipmaps = true;
texturaMexico.minFilter = THREE.LinearMipmapLinearFilter;
texturaMexico.magFilter = THREE.LinearFilter;
texturaMexico.anisotropy = Math.min(8, renderizador.capabilities.getMaxAnisotropy());

const aPixelX = (lon) => ((lon - TEXTURA.lon0) / (TEXTURA.lon1 - TEXTURA.lon0)) * TEXTURA.ancho;
const aPixelY = (lat) => ((TEXTURA.lat1 - lat) / (TEXTURA.lat1 - TEXTURA.lat0)) * TEXTURA.alto;

function trazarPoligono(g, anillo) {
  g.beginPath();
  anillo.forEach(([lon, lat], i) => {
    if (i) g.lineTo(aPixelX(lon), aPixelY(lat));
    else g.moveTo(aPixelX(lon), aPixelY(lat));
  });
  g.closePath();
}

function dibujarTexturaMexico() {
  const g = lienzoMexico.getContext("2d");
  const color = (hex) => new THREE.Color(hex);
  const aCss = (c) => `#${c.getHexString()}`;

  // Tres tonos suaves para que los vecinos se distingan sin depender de la línea
  const tonos = [
    aCss(color(C.puntos).lerp(color(C.sky), 0.42)),
    aCss(color(C.puntos).lerp(color(C.sky), 0.62)),
    aCss(color(C.puntos).lerp(color(C.oceano), 0.25)),
  ];
  const tonoReto = aCss(color(C.oro).lerp(color(C.sky), 0.28));

  g.clearRect(0, 0, TEXTURA.ancho, TEXTURA.alto);
  g.save();

  // Todo se recorta con el contorno del país
  g.beginPath();
  CONTORNO_MEXICO.forEach((poligono) => {
    poligono.forEach(([lon, lat], i) => {
      if (i) g.lineTo(aPixelX(lon), aPixelY(lat));
      else g.moveTo(aPixelX(lon), aPixelY(lat));
    });
    g.closePath();
  });
  g.clip();

  g.lineJoin = "round";
  ESTADOS_MEXICO.forEach((estado, i) => {
    const esReto = ESTADOS_OBJETIVO.some((e) => e.nombre === estado.nombre);

    trazarPoligono(g, estado.anillo);
    g.fillStyle = esReto ? tonoReto : tonos[i % tonos.length];
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = aCss(color(C.borde));
    g.globalAlpha = 0.95;
    g.stroke();
    g.globalAlpha = 1;
  });
  g.restore();

  // Costa
  g.lineWidth = 4;
  g.strokeStyle = aCss(color(C.borde));
  CONTORNO_MEXICO.forEach((poligono) => {
    trazarPoligono(g, poligono);
    g.stroke();
  });
  texturaMexico.needsUpdate = true;
}

const puntosGlobo = crearPuntosGlobo();
const nubeBase = crearNube(puntosGlobo.base, C.puntos);

const esferaOceano = new THREE.Mesh(
  new THREE.SphereGeometry(2.97, 48, 32),
  new THREE.MeshBasicMaterial({ color: C.oceano })
);

// Parche de esfera con la textura, solo sobre la ventana de México
const parcheMexico = new THREE.Mesh(
  new THREE.SphereGeometry(
    RADIO + 0.006,
    128,
    64,
    (TEXTURA.lon0 + 90) * D2R,
    (TEXTURA.lon1 - TEXTURA.lon0) * D2R,
    (90 - TEXTURA.lat1) * D2R,
    (TEXTURA.lat1 - TEXTURA.lat0) * D2R
  ),
  new THREE.MeshBasicMaterial({ map: texturaMexico, transparent: true, depthWrite: false })
);
globo.add(nubeBase, esferaOceano, parcheMexico);
dibujarTexturaMexico();

const materialFronteras = new THREE.LineBasicMaterial({ color: C.rosa, transparent: true, opacity: 0.55 });

Object.values(PAISES).forEach((poligono) => {
  const vectores = densificar(poligono).map(([lon, lat]) => latLonAVector(lon, lat, RADIO + 0.012));
  globo.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(vectores), materialFronteras));
});

// Estados del reto: contorno propio y, si se eligen, relleno con puntos
const estadosGlobo = ESTADOS_OBJETIVO.map((estado) => {
  const puntos = [];
  const [lons, lats] = [estado.poligono.map((p) => p[0]), estado.poligono.map((p) => p[1])];
  const tlaxcala = ESTADOS_MEXICO.find((e) => e.nombre === "Tlaxcala").anillo;

  for (let lon = Math.min(...lons); lon <= Math.max(...lons); lon += estado.paso) {
    for (let lat = Math.min(...lats); lat <= Math.max(...lats); lat += estado.paso) {
      const dentro = puntoEnPoligono(lon, lat, estado.poligono);
      const enTlaxcala = estado.nombre !== "Tlaxcala" && puntoEnPoligono(lon, lat, tlaxcala);

      if (dentro && !enTlaxcala) puntos.push(latLonAVector(lon, lat, RADIO + 0.01));
    }
  }

  const nube = crearNube(puntos, C.rosa);
  nube.visible = false;

  const material = new THREE.LineBasicMaterial({ color: C.rosa, transparent: true, opacity: 0.9 });
  const vectores = densificar(estado.poligono).map(([lon, lat]) =>
    latLonAVector(lon, lat, RADIO + 0.016)
  );
  const contorno = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(vectores), material);

  globo.add(nube, contorno);
  return { nube, contorno, material };
});

/* --- Pulso sobre el estado elegido --------------------------------------- */

function texturaCanvas(dibujar) {
  const lienzo = document.createElement("canvas");
  lienzo.width = lienzo.height = 128;
  dibujar(lienzo.getContext("2d"));
  return new THREE.CanvasTexture(lienzo);
}

const texturaAnillo = texturaCanvas((g) => {
  g.strokeStyle = "#fff";
  g.lineWidth = 6;
  g.beginPath();
  g.arc(64, 64, 56, 0, Math.PI * 2);
  g.stroke();
});

const materialesPulso = [];
function crearSpritePulso(textura) {
  const material = new THREE.SpriteMaterial({
    map: textura,
    color: C.rosa,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  materialesPulso.push(material);

  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 10;
  return sprite;
}

const pulso = new THREE.Group();
pulso.visible = false;
globo.add(pulso);
const ondasPulso = [0, 1, 2].map(() => crearSpritePulso(texturaAnillo));
pulso.add(...ondasPulso);

const brote = { base: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), tiempo: 99, activo: false };

/* --- Marcadores HTML sobre el globo -------------------------------------- */

let estadoElegido = -1;

const marcadores = ESTADOS_OBJETIVO.map((estado, indice) => {
  const boton = document.createElement("button");
  boton.className = "state-marker";
  boton.textContent = estado.nombre;
  boton.addEventListener("click", () => elegirEstado(indice));
  $("#state-markers").appendChild(boton);
  return boton;
});

// Nombres de los demás estados: aparecen al acercarse
const ESTADOS_CHICOS = ["Colima", "Morelos", "Ciudad de México", "Aguascalientes"];

const etiquetasEstados = ESTADOS_MEXICO.filter(
  (estado) => !ESTADOS_OBJETIVO.some((objetivo) => objetivo.nombre === estado.nombre)
).map((estado) => {
  const span = document.createElement("span");

  span.className = "etiqueta-estado";
  span.textContent = estado.nombre;
  $("#state-markers").appendChild(span);
  return { estado, span, chico: ESTADOS_CHICOS.includes(estado.nombre) };
});

/** Proyecta un punto del globo a la pantalla; devuelve null si está al otro lado. */
function proyectarEnGlobo(lon, lat) {
  const posicion = latLonAVector(lon, lat, RADIO).applyMatrix4(globo.matrixWorld);
  const haciaCamara = camara.position.clone().sub(posicion);

  if (posicion.clone().normalize().dot(haciaCamara) <= 0) return null;

  const pantalla = posicion.project(camara);
  return {
    x: (pantalla.x * 0.5 + 0.5) * window.innerWidth,
    y: (-pantalla.y * 0.5 + 0.5) * window.innerHeight,
  };
}

function actualizarMarcadores() {
  const enGlobo = vista === "estados" || vista === "contexto";
  const visibles = vista === "estados" && estadoElegido < 0;
  const distancia = miradaGlobo.z - RADIO;

  marcadores.forEach((boton, i) => {
    const punto = visibles ? proyectarEnGlobo(ESTADOS_OBJETIVO[i].lon, ESTADOS_OBJETIVO[i].lat) : null;

    if (punto) {
      boton.style.left = punto.x + "px";
      boton.style.top = punto.y + "px";
    }
    boton.style.display = punto ? "block" : "none";
  });

  etiquetasEstados.forEach(({ estado, span, chico }) => {
    const mostrar = enGlobo && distancia < (chico ? 1.7 : 3.2);
    const punto = mostrar ? proyectarEnGlobo(estado.etiqueta[0], estado.etiqueta[1]) : null;

    if (punto) {
      span.style.left = punto.x + "px";
      span.style.top = punto.y + "px";
    }
    span.style.display = punto ? "block" : "none";
  });
}

/* ------------------------------------------------------------------------ */
/* Control libre del globo: arrastrar, zoom con rueda o pellizco, botones    */
/* ------------------------------------------------------------------------ */

const lienzoGl = $("#gl");
const punterosActivos = new Map();
let arrastre = null;
let distanciaPellizco = 0;

const puedeInteractuar = () => vista === "contexto" || vista === "estados";

function gradosPorPixel() {
  const distancia = Math.max(0.3, miradaGlobo.z - RADIO);
  const unidadesPorPixel = (2 * Math.tan(22.5 * D2R) * distancia) / window.innerHeight;

  return unidadesPorPixel / RADIO / D2R;
}

/** factor < 1 acerca, factor > 1 aleja (se mide desde la superficie). */
function zoomPor(factor, inmediato = false) {
  const objetivo = miradaGlobo.objetivo;

  objetivo.z = clamp(RADIO + (objetivo.z - RADIO) * factor, ZOOM_MIN, ZOOM_MAX);
  if (inmediato) miradaGlobo.z = objetivo.z;
}

function moverVista(dx, dy) {
  const grados = gradosPorPixel();
  const objetivo = miradaGlobo.objetivo;

  objetivo.lon -= dx * grados;
  objetivo.lat = clamp(objetivo.lat + dy * grados, -70, 75);
  miradaGlobo.lon = objetivo.lon;
  miradaGlobo.lat = objetivo.lat;
}

function restablecerVista() {
  miradaGlobo.objetivo = vistaGloboAjustada(vista === "contexto" ? "contexto" : "estados");
}

/** Estado bajo un punto de la pantalla (nombre) o null. */
function estadoBajoPantalla(clientX, clientY) {
  const rayoGlobo = new THREE.Raycaster();
  rayoGlobo.setFromCamera(
    new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1),
    camara
  );

  const punto = new THREE.Vector3();
  if (!rayoGlobo.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), RADIO), punto)) return null;

  globo.worldToLocal(punto);
  const lat = Math.asin(clamp(punto.y / RADIO, -1, 1)) / D2R;
  const lon = Math.atan2(punto.x, punto.z) / D2R;

  return estadoEnPunto(lon, lat);
}

lienzoGl.addEventListener("pointerdown", (evento) => {
  if (!puedeInteractuar()) return;

  lienzoGl.setPointerCapture(evento.pointerId);
  punterosActivos.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });
  arrastre = { movido: 0 };

  if (punterosActivos.size === 2) {
    const [a, b] = [...punterosActivos.values()];
    distanciaPellizco = Math.hypot(a.x - b.x, a.y - b.y);
  }
  lienzoGl.classList.add("arrastrando");
});

lienzoGl.addEventListener("pointermove", (evento) => {
  const previo = punterosActivos.get(evento.pointerId);
  if (!previo || !puedeInteractuar()) return;

  const dx = evento.clientX - previo.x;
  const dy = evento.clientY - previo.y;
  punterosActivos.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });

  if (punterosActivos.size === 2) {
    const [a, b] = [...punterosActivos.values()];
    const distancia = Math.hypot(a.x - b.x, a.y - b.y);

    if (distanciaPellizco > 0) zoomPor(distanciaPellizco / distancia, true);
    distanciaPellizco = distancia;
    if (arrastre) arrastre.movido += 10;
    return;
  }

  if (arrastre) arrastre.movido += Math.abs(dx) + Math.abs(dy);
  moverVista(dx, dy);
});

function soltarPuntero(evento) {
  const eraToque = arrastre && arrastre.movido < 6 && punterosActivos.size === 1;

  punterosActivos.delete(evento.pointerId);
  if (!punterosActivos.size) {
    arrastre = null;
    lienzoGl.classList.remove("arrastrando");
  }
  distanciaPellizco = 0;

  if (eraToque && evento.type === "pointerup") elegirEnMapa(evento.clientX, evento.clientY);
}

lienzoGl.addEventListener("pointerup", soltarPuntero);
lienzoGl.addEventListener("pointercancel", soltarPuntero);

lienzoGl.addEventListener(
  "wheel",
  (evento) => {
    if (!puedeInteractuar()) return;

    evento.preventDefault();
    zoomPor(Math.exp(evento.deltaY * 0.0012));
  },
  { passive: false }
);

function elegirEnMapa(x, y) {
  if (vista !== "estados" || estadoElegido >= 0) return;

  const nombre = estadoBajoPantalla(x, y);
  if (!nombre) return;

  const indice = ESTADOS_OBJETIVO.findIndex((e) => e.nombre === nombre);
  if (indice >= 0) elegirEstado(indice);
  else Narrador.decir(`${nombre}. En este reto solo hay parcelas en Puebla, Tlaxcala e Hidalgo. ¡Elige uno de esos!`);
}

$("#zoom-mas").addEventListener("click", () => zoomPor(0.7));
$("#zoom-menos").addEventListener("click", () => zoomPor(1.4));
$("#zoom-reset").addEventListener("click", restablecerVista);

window.addEventListener("keydown", (evento) => {
  if (!puedeInteractuar() || evento.target.closest("input")) return;

  if (evento.key === "+" || evento.key === "=") zoomPor(0.7);
  if (evento.key === "-" || evento.key === "_") zoomPor(1.4);
});

/* ------------------------------------------------------------------------ */
/* Cámara del globo                                                          */
/* ------------------------------------------------------------------------ */

// México ocupa buena parte de la pantalla; la vista queda algo hacia el este
// para que el panel de la derecha no tape el mapa.
const VISTAS_GLOBO = {
  contexto: { lon: -98.5, lat: 23, z: 5.6 },
  estados: { lon: -97.5, lat: 23.2, z: 4.4 },
};

const ZOOM_MIN = RADIO + 0.35;
const ZOOM_MAX = 12;

const miradaGlobo = { lon: -98.5, lat: 23, z: 5.6, objetivo: { ...VISTAS_GLOBO.contexto } };

/** En pantallas angostas se aleja un poco para que quepa todo el país. */
function vistaGloboAjustada(nombre) {
  const vista = { ...VISTAS_GLOBO[nombre] };
  const factor = Math.max(1, 1.15 / camara.aspect);

  vista.z = RADIO + (vista.z - RADIO) * factor;
  return vista;
}

function actualizarGlobo(t, dt) {
  const k = 1 - Math.exp(-dt * 2.4);
  const objetivo = miradaGlobo.objetivo;
  const deriva = vista === "contexto" && !arrastre ? Math.sin(t * 0.25) * 3 : 0;

  miradaGlobo.lon += (objetivo.lon + deriva - miradaGlobo.lon) * k;
  miradaGlobo.lat += (objetivo.lat - miradaGlobo.lat) * k;
  miradaGlobo.z += (objetivo.z - miradaGlobo.z) * k;

  globo.rotation.y = -miradaGlobo.lon * D2R;
  globo.rotation.x = miradaGlobo.lat * D2R;
  globo.updateMatrixWorld();

  const distancia = Math.max(0.3, miradaGlobo.z - RADIO);
  const altoPantalla = window.innerHeight;
  const px = (pixeles) => (pixeles * 2 * distancia) / altoPantalla;

  nubeBase.material.size = px(2.2);
  estadosGlobo.forEach((e) => {
    e.nube.material.size = px(3.6);
  });

  actualizarPulso(dt);
}

function actualizarPulso(dt) {
  if (!brote.activo) return;
  brote.tiempo += dt;

  const mundo = pulso.position.clone().applyMatrix4(globo.matrixWorld);
  const normal = brote.normal.clone().transformDirection(globo.matrixWorld);
  pulso.visible = normal.dot(camara.position.clone().sub(mundo)) > 0;
  if (!pulso.visible) return;

  const px = (2 * Math.tan(22.5 * D2R) * camara.position.distanceTo(mundo)) / window.innerHeight;
  const k = Math.min(1, brote.tiempo * 1.4);
  const entrada = Math.max(0, 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2));

  ondasPulso.forEach((onda, i) => {
    const fase = (brote.tiempo / 2.4 + i / 3) % 1;
    onda.scale.setScalar((10 + 90 * fase) * px * entrada);
    onda.material.opacity = Math.pow(1 - fase, 1.5) * 0.9 * Math.min(1, k * 2);
  });
}

/* ------------------------------------------------------------------------ */
/* Datos de las parcelas                                                     */
/* ------------------------------------------------------------------------ */

const VARIABLES = [
  { clave: "n", nombre: "NDVI" },
  { clave: "e", nombre: "EVI" },
  { clave: "l", nombre: "LAI" },
  { clave: "f", nombre: "FAPAR" },
  { clave: "d", nombre: "DSWI" },
];
const TIPOS_ESTRES = ["Hídrico", "Térmico", "Helada", "Plaga", "Incendio"];
const TIPOS_SUELO = ["Vertisol", "Feozem", "Regosol", "Cambisol", "Luvisol"];

const MAX_PARCELAS = 66;

// Rango global de cada variable, para que la gráfica no cambie de escala
const rangos = {};
VARIABLES.forEach(({ clave }) => {
  let min = Infinity;
  let max = -Infinity;

  DATA.P.forEach((parcela) => {
    parcela[clave].forEach((valor) => {
      min = Math.min(min, valor);
      max = Math.max(max, valor);
    });
  });
  rangos[clave] = [min, max];
});

function muestrear(serie, semanaActual) {
  const i = Math.min(50, Math.floor(semanaActual));
  return serie[i] + (serie[i + 1] - serie[i]) * (semanaActual - i);
}

const zonaDe = (zona) => DATA.P.slice(zona * MAX_PARCELAS, (zona + 1) * MAX_PARCELAS);

/* --- Modelo (se calcula una vez, en el navegador) ------------------------- */

const modelo = {
  final: Modelo.entrenarFinal(DATA.P),
  validacion: Modelo.validacionCruzada(DATA.P, Modelo.LAMBDA_INICIAL),
};

let todasReveladas = Almacen.sesion("bb-modelo") === "1";
const reveladas = new Set();

const estaRevelada = (parcela) => !parcela.p || todasReveladas || reveladas.has(parcela.id);
const rendimientoNumerico = (parcela) => (parcela.p ? parcela.pred : parcela.y);

/* ------------------------------------------------------------------------ */
/* Campo: parcelas irregulares                                               */
/* ------------------------------------------------------------------------ */

const campo = new THREE.Group();
campo.position.y = -100;
campo.visible = false;
escena.add(campo);

const TW = 1024;
const TH = 768;
const ANCHO = 40;
const ALTO = 30;
const PX = TW / ANCHO;
const FILA_PX = 7; // separación entre surcos, en píxeles de la textura
const ID_RELLENO = 127; // monte y linderos alrededor de las parcelas
const TOTAL_TALLOS = 20000;

let parcelas = [];
let idsCampo = new Uint8Array(TW * TH);
let angulosSurco = [];
let rangosTallos = [];

/* --- Suelo: un solo plano con mapa de identificadores -------------------- */

const texturaIds = new THREE.DataTexture(new Uint8Array(TW * TH * 4), TW, TH, THREE.RGBAFormat);
const texturaMapa = new THREE.DataTexture(new Uint8Array(TW * TH * 4), TW, TH, THREE.RGBAFormat);
const datosPaleta = new Uint8Array(128 * 4);
const texturaPaleta = new THREE.DataTexture(datosPaleta, 128, 1, THREE.RGBAFormat);

texturaIds.magFilter = texturaIds.minFilter = THREE.NearestFilter;
texturaMapa.magFilter = texturaMapa.minFilter = THREE.LinearFilter;
texturaPaleta.magFilter = texturaPaleta.minFilter = THREE.NearestFilter;
[texturaIds, texturaMapa, texturaPaleta].forEach((textura) => {
  textura.generateMipmaps = false;
  textura.needsUpdate = true;
});

const uniformesSuelo = {
  uMapa: { value: texturaMapa },
  uIds: { value: texturaIds },
  uPaleta: { value: texturaPaleta },
  uSel: { value: -1 },
  uHover: { value: -1 },
  uCamino: { value: new THREE.Color(C.camino) },
  uAcento: { value: new THREE.Color(C.rosa) },
  uPixel: { value: new THREE.Vector2(2 / TW, 2 / TH) },
};

const SHADER_SUELO_V = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SHADER_SUELO_F = `
  uniform sampler2D uMapa, uIds, uPaleta;
  uniform float uSel, uHover;
  uniform vec3 uCamino, uAcento;
  uniform vec2 uPixel;
  varying vec2 vUv;

  float identificador(vec2 uv) {
    return floor(texture2D(uIds, uv).r * 255.0 + 0.5);
  }

  void main() {
    vec4 mapa = texture2D(uMapa, vUv);
    float id = identificador(vUv);
    vec3 color = texture2D(uPaleta, vec2((id + 0.5) / 128.0, 0.5)).rgb * mapa.rgb;
    color = mix(color, uCamino, mapa.a);

    float sel = step(abs(id - uSel), 0.5);
    float hov = step(abs(id - uHover), 0.5);

    // Contorno de la parcela seleccionada
    float vecinos = max(
      max(abs(identificador(vUv + vec2(uPixel.x, 0.0)) - id), abs(identificador(vUv - vec2(uPixel.x, 0.0)) - id)),
      max(abs(identificador(vUv + vec2(0.0, uPixel.y)) - id), abs(identificador(vUv - vec2(0.0, uPixel.y)) - id))
    );
    float contorno = step(0.5, vecinos) * sel;

    color *= 1.0 + 0.1 * hov + 0.06 * sel;
    color = mix(color, uAcento, contorno * 0.95);
    gl_FragColor = vec4(color, 1.0);
  }
`;

const suelo = new THREE.Mesh(
  new THREE.PlaneGeometry(ANCHO, ALTO).rotateX(-Math.PI / 2),
  new THREE.ShaderMaterial({
    uniforms: uniformesSuelo,
    vertexShader: SHADER_SUELO_V,
    fragmentShader: SHADER_SUELO_F,
  })
);
campo.add(suelo);

/* --- Tallos de cebada (instancias) --------------------------------------- */

const attrPosicion = new Float32Array(TOTAL_TALLOS * 3);
const attrParcela = new Float32Array(TOTAL_TALLOS);
const attrAzar = new Float32Array(TOTAL_TALLOS);
const attrTipo = new Float32Array(TOTAL_TALLOS);
const attrAlto = new Float32Array(TOTAL_TALLOS);
const attrEstres = new Float32Array(TOTAL_TALLOS);

const geometriaTallo = new THREE.CylinderBufferGeometry(0.014, 0.032, 1, 4, 5);
geometriaTallo.translate(0, 0.5, 0);

const geometriaTallos = new THREE.InstancedBufferGeometry();
geometriaTallos.index = geometriaTallo.index;
geometriaTallos.setAttribute("position", geometriaTallo.attributes.position);
geometriaTallos.instanceCount = TOTAL_TALLOS;

function agregarAtributo(nombre, datos, tamano, dinamico) {
  const atributo = new THREE.InstancedBufferAttribute(datos, tamano);
  if (dinamico) atributo.setUsage(THREE.DynamicDrawUsage);
  geometriaTallos.setAttribute(nombre, atributo);
  return atributo;
}

const atributosFijos = [
  agregarAtributo("aOff", attrPosicion, 3),
  agregarAtributo("aPar", attrParcela, 1),
  agregarAtributo("aR", attrAzar, 1),
  agregarAtributo("aTy", attrTipo, 1),
];
const atributoAlto = agregarAtributo("aH", attrAlto, 1, true);
const atributoEstres = agregarAtributo("aS", attrEstres, 1, true);

const uniformes = {
  uT: { value: 0 },
  uSel: { value: 0 },
  cA: { value: new THREE.Color(C.talloVerde) },
  cB: { value: new THREE.Color(C.talloOro) },
  cD: { value: new THREE.Color(C.seco) },
};

const SHADER_VERTICE = `
  attribute vec3 aOff;
  attribute float aPar, aR, aTy, aH, aS;
  uniform float uT, uSel;
  varying float vT, vS, vSel, vTy;

  void main() {
    float alto = aH * (0.8 + 0.4 * aR);
    float t = position.y;
    vec3 p = position;

    p.xz *= 1.0 + 2.6 * smoothstep(0.8, 0.86, t) * (1.0 - smoothstep(0.97, 1.0, t));
    p.y *= alto;

    float viento = sin(uT * 1.6 + aOff.x * 0.7 + aOff.z * 0.5 + aR * 6.0) * 0.1
                 + sin(uT * 0.7 + aOff.z) * 0.06;
    float doblez = (viento + aS * 0.55) * t * t * alto;
    p.x += doblez;
    p.z += doblez * 0.4 * sin(aR * 9.0);
    p += aOff;

    vT = t;
    vS = aS;
    vTy = aTy;
    vSel = abs(aPar - uSel) < 0.5 ? 1.0 : 0.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const SHADER_FRAGMENTO = `
  uniform vec3 cA, cB, cD;
  varying float vT, vS, vSel, vTy;

  void main() {
    vec3 color = mix(cA, cB, vTy);
    color = mix(color * 0.7, color * 1.15, vT);
    color = mix(color, vec3(0.95, 0.82, 0.45), smoothstep(0.8, 0.9, vT) * 0.5);
    color = mix(color, cD, clamp(vS * 1.2, 0.0, 1.0));
    color += vSel * 0.16;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const tallos = new THREE.Mesh(
  geometriaTallos,
  new THREE.ShaderMaterial({
    uniforms: uniformes,
    vertexShader: SHADER_VERTICE,
    fragmentShader: SHADER_FRAGMENTO,
    side: THREE.DoubleSide,
  })
);
tallos.frustumCulled = false;
campo.add(tallos);

/* --- Construcción del campo de una zona ---------------------------------- */

// Ruido determinista por píxel (para el grano del suelo)
const ruidoPixel = (x, y) => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
const ruido01 = (x, y) => (ruidoPixel(x, y) % 1000) / 1000;

/**
 * Reparte el terreno entre las parcelas: cada una tiene una semilla, y su
 * "peso" depende de su área real, así las grandes ocupan más. Los bordes se
 * deforman con ondas suaves para que no sean rectas.
 */
function repartirTerreno(lista, azar) {
  const n = lista.length;
  const columnas = Math.ceil(Math.sqrt((n * ANCHO) / ALTO));
  const filas = Math.ceil(n / columnas);
  const cw = ANCHO / columnas;
  const ch = ALTO / filas;
  const areaMedia = lista.reduce((suma, p) => suma + p.a, 0) / n;

  const celdas = [];
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < columnas; c++) {
      const i = f * columnas + c;
      celdas.push({
        x: (c + 0.5 + (azar() - 0.5) * 0.6) * cw - ANCHO / 2,
        z: (f + 0.5 + (azar() - 0.5) * 0.6) * ch - ALTO / 2,
        id: i < n ? i : ID_RELLENO,
        peso: i < n ? clamp(Math.sqrt(lista[i].a / areaMedia), 0.7, 1.45) : 0.8,
      });
    }
  }

  const ids = new Uint8Array(TW * TH);
  const suma = lista.map(() => ({ x: 0, z: 0, n: 0 }));

  for (let py = 0; py < TH; py++) {
    const z = ALTO / 2 - py / PX;

    for (let px = 0; px < TW; px++) {
      const x = px / PX - ANCHO / 2;
      let id = ID_RELLENO;

      if (px >= 8 && px < TW - 8 && py >= 8 && py < TH - 8) {
        const wx = x + Math.sin(z * 1.3 + 1.7) * 0.35 + Math.sin(z * 3.1 + x * 0.7) * 0.15;
        const wz = z + Math.sin(x * 1.1 + 0.4) * 0.35 + Math.sin(x * 2.7 - z * 0.9) * 0.15;
        const c0 = Math.floor((wx + ANCHO / 2) / cw);
        const f0 = Math.floor((wz + ALTO / 2) / ch);
        let mejor = Infinity;

        for (let df = -2; df <= 2; df++) {
          const f = f0 + df;
          if (f < 0 || f >= filas) continue;

          for (let dc = -2; dc <= 2; dc++) {
            const c = c0 + dc;
            if (c < 0 || c >= columnas) continue;

            const celda = celdas[f * columnas + c];
            const dx = wx - celda.x;
            const dz = wz - celda.z;
            const distancia = (dx * dx + dz * dz) / (celda.peso * celda.peso);

            if (distancia < mejor) {
              mejor = distancia;
              id = celda.id;
            }
          }
        }
      }

      ids[py * TW + px] = id;
      if (id !== ID_RELLENO) {
        suma[id].x += x;
        suma[id].z += z;
        suma[id].n += 1;
      }
    }
  }

  return { ids, suma };
}

/** Textura con surcos, rayado de las parcelas por predecir y linderos. */
function hornearMapa(ids, lista, angulos) {
  const datos = texturaMapa.image.data;
  const datosIds = texturaIds.image.data;

  for (let py = 0; py < TH; py++) {
    for (let px = 0; px < TW; px++) {
      const k = py * TW + px;
      const id = ids[k];

      const derecha = px < TW - 1 ? ids[k + 1] : id;
      const abajo = py < TH - 1 ? ids[k + TW] : id;
      const izquierda = px > 0 ? ids[k - 1] : id;
      const arriba = py > 0 ? ids[k - TW] : id;
      const borde = id !== derecha || id !== abajo || id !== izquierda || id !== arriba;

      let brillo;
      if (id === ID_RELLENO) {
        brillo = 0.9;
      } else {
        const angulo = angulos[id];
        const v = -px * Math.sin(angulo) + py * Math.cos(angulo);
        const surco = 0.5 + 0.5 * Math.cos((2 * Math.PI * v) / FILA_PX);

        brillo = 0.82 + 0.18 * surco;
        if (lista[id].p && (px + py) % 15 < 2) brillo *= 0.84;
      }
      brillo *= 0.95 + 0.1 * ruido01(px, py);

      datos[k * 4] = datos[k * 4 + 1] = datos[k * 4 + 2] = Math.min(255, brillo * 255);
      datos[k * 4 + 3] = borde ? 230 : 0;

      datosIds[k * 4] = id;
      datosIds[k * 4 + 3] = 255;
    }
  }
  texturaMapa.needsUpdate = true;
  texturaIds.needsUpdate = true;
}

/** Tallos en hileras siguiendo el rumbo de los surcos de cada parcela. */
function sembrarTallos(ids, lista, angulos, azar) {
  const cubos = lista.map(() => []);
  let total = 0;
  let intentos = 0;

  while (total < TOTAL_TALLOS && intentos < TOTAL_TALLOS * 8) {
    intentos++;

    const px = 12 + azar() * (TW - 24);
    const py = 12 + azar() * (TH - 24);
    const id = ids[Math.floor(py) * TW + Math.floor(px)];
    if (id >= lista.length) continue;

    const seno = Math.sin(angulos[id]);
    const coseno = Math.cos(angulos[id]);
    const u = px * coseno + py * seno;
    const v = Math.round((-px * seno + py * coseno) / FILA_PX) * FILA_PX;

    const qx = u * coseno - v * seno + (azar() - 0.5) * 1.2;
    const qy = u * seno + v * coseno + (azar() - 0.5) * 1.2;
    if (qx < 4 || qx >= TW - 4 || qy < 4 || qy >= TH - 4) continue;

    // Que no se salgan de su parcela (se revisan los lados)
    const misma = [
      ids[Math.floor(qy) * TW + Math.floor(qx)],
      ids[Math.floor(qy) * TW + Math.floor(qx + 3)],
      ids[Math.floor(qy) * TW + Math.floor(qx - 3)],
      ids[Math.floor(qy + 3) * TW + Math.floor(qx)],
      ids[Math.floor(qy - 3) * TW + Math.floor(qx)],
    ].every((valor) => valor === id);
    if (!misma) continue;

    cubos[id].push(qx / PX - ANCHO / 2, ALTO / 2 - qy / PX);
    total++;
  }

  // Volcado ordenado por parcela
  attrAlto.fill(0);
  attrEstres.fill(0);
  attrPosicion.fill(0);
  attrPosicion.forEach((_, i) => {
    if (i % 3 === 1) attrPosicion[i] = -1000;
  });

  const rangos_ = [];
  let n = 0;

  cubos.forEach((coordenadas, id) => {
    const inicio = n;

    for (let k = 0; k < coordenadas.length; k += 2) {
      attrPosicion.set([coordenadas[k], 0, coordenadas[k + 1]], n * 3);
      attrParcela[n] = id;
      attrAzar[n] = azar();
      attrTipo[n] = lista[id].p;
      n++;
    }
    rangos_.push([inicio, n]);
  });

  atributosFijos.forEach((atributo) => {
    atributo.needsUpdate = true;
  });
  return rangos_;
}

function cargarZona(zona) {
  const lista = zonaDe(zona);
  const azar = Util.crearRng(zona * 913 + 17);

  angulosSurco = lista.map(() => azar() * Math.PI);

  const { ids, suma } = repartirTerreno(lista, azar);
  idsCampo = ids;
  hornearMapa(ids, lista, angulosSurco);
  rangosTallos = sembrarTallos(ids, lista, angulosSurco, azar);

  parcelas = lista.map((parcela, i) => {
    const centro = suma[i];
    const pred = parcela.p ? Modelo.predecir(modelo.final, parcela) : null;

    return {
      ...parcela,
      pred,
      aportes: parcela.p ? Modelo.contribuciones(modelo.final, parcela) : null,
      x: centro.n ? centro.x / centro.n : 0,
      z: centro.n ? centro.z / centro.n : 0,
      radio: Math.sqrt(centro.n / Math.PI) / PX,
    };
  });

  recalcular = true;
  hover = -1;
  enfocado = false;
  actualizarBotonPredecir();
  seleccionar(0);
}

/* ------------------------------------------------------------------------ */
/* Estado del campo, semana y gráfica                                        */
/* ------------------------------------------------------------------------ */

let seleccion = 0;
let hover = -1;
let semana = 14;
let semanaDibujada = -1;
let variableActiva = "n";
let recalcular = true;
let enfocado = false;
let tweenSemana = null;

function eventosEstres(parcela) {
  const referencia = DATA.opt.n;
  const candidatos = [];

  for (let w = 20; w <= 46; w++) {
    const brecha = (referencia[w] - parcela.n[w]) / referencia[w];
    const esMinimoLocal = parcela.n[w] <= parcela.n[w - 1] && parcela.n[w] <= parcela.n[w + 1];

    if (brecha > 0.2 && esMinimoLocal) candidatos.push([w, brecha]);
  }

  return candidatos
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .sort((a, b) => a[0] - b[0])
    .map(([w], k) => ({
      semana: w,
      tipo: TIPOS_ESTRES[(Util.hashTexto(parcela.id) + w + k) % TIPOS_ESTRES.length],
    }));
}

function dibujarGrafica() {
  const parcela = parcelas[seleccion];
  const [min, max] = rangos[variableActiva];
  const referencia = DATA.opt[variableActiva];

  const X = (w) => 10 + (w / 51) * 340;
  const Y = (v) => 140 - ((v - min) / (max - min)) * 125;
  const trazo = (serie) => serie.map((v, i) => `${i ? "L" : "M"}${X(i)},${Y(v)}`).join("");

  const marcasEstres = eventosEstres(parcela)
    .map(
      (e) => `
        <line x1="${X(e.semana)}" x2="${X(e.semana)}" y1="10" y2="140"
              stroke="var(--ink)" stroke-opacity=".3" stroke-dasharray="3 4"/>
        <text x="${X(e.semana) + 3}" y="20" font-size="10" fill="var(--ink)">${e.tipo}*</text>`
    )
    .join("");

  $("#chart").innerHTML = `
    <line x1="10" x2="350" y1="140" y2="140" stroke="var(--line)" stroke-width="2"/>
    <path d="${trazo(referencia)}" fill="none" stroke="var(--green)" stroke-width="3"/>
    ${marcasEstres}
    <path d="${trazo(parcela[variableActiva])}" fill="none" stroke="var(--gold)"
          stroke-width="3.5" stroke-linecap="round"/>
    <line id="chart-now" x1="10" x2="10" y1="10" y2="140" stroke="var(--gold)" stroke-width="2"/>`;

  semanaDibujada = -1;
}

/* --- Panel de la parcela y predicción interactiva ------------------------ */

function cajaPrediccion(parcela) {
  if (!parcela.p) return "";

  if (!estaRevelada(parcela)) {
    return `
      <div class="prediccion">
        Esta parcela es de las que el modelo debe predecir.
        <div class="panel-acciones">
          <button id="btn-predecir" class="principal">🔮 Predecir con el modelo</button>
        </div>
      </div>`;
  }

  const margen = modelo.validacion.rmse;
  const maximo = Math.max(...parcela.aportes.map((a) => Math.abs(a.aporte)), 0.01);
  const filas = parcela.aportes
    .slice(0, 3)
    .map((a) => {
      const ancho = Math.round((Math.abs(a.aporte) / maximo) * 100);
      const signo = a.aporte >= 0 ? "+" : "−";

      return `
        <div class="aporte">
          <span>${a.nombre}</span>
          <span><div class="barra-aporte ${a.aporte < 0 ? "neg" : ""}" style="width:${ancho}%"></div>
          ${signo}${Util.fmt(Math.abs(a.aporte), 2)}</span>
        </div>`;
    })
    .join("");

  return `
    <div class="prediccion">
      Predicción del modelo
      <div class="valor" id="valor-pred">${Util.fmt(parcela.pred, 2)} <small>t/ha</small></div>
      <small>Margen típico ±${Util.fmt(margen, 2)} t/ha · R² ${Util.fmt(modelo.validacion.r2, 2)}
      (validación cruzada)</small>
      <div style="margin-top:6px">Lo que más pesó (t/ha):</div>
      ${filas}
    </div>`;
}

function seleccionar(indice, anunciar) {
  seleccion = indice;
  uniformes.uSel.value = indice;
  uniformesSuelo.uSel.value = indice;

  const parcela = parcelas[indice];
  const eventos = eventosEstres(parcela);
  const sueloTipo = TIPOS_SUELO[Util.hashTexto(parcela.id) % TIPOS_SUELO.length];
  const etiqueta = parcela.p
    ? '<b style="color: var(--gold)">Por predecir</b>'
    : '<b style="color: var(--green)">Rendimiento conocido</b>';
  const estres = eventos.length
    ? " · Estrés*: " + eventos.map((e) => `${e.tipo} sem. ${e.semana + 1}`).join(", ")
    : "";

  const rendimiento = estaRevelada(parcela) ? `${Util.fmt(rendimientoNumerico(parcela), 2)} t/ha` : "? t/ha";

  $("#panel-title").textContent = `${parcela.id} · ${rendimiento}`;
  $("#panel-info").innerHTML = `${etiqueta} · ${Util.fmt(parcela.a, 2)} ha<br>
    <small>Suelo INEGI*: ${sueloTipo}${estres}<br>* simulado</small>`;
  $("#prediccion-caja").innerHTML = cajaPrediccion(parcela);
  $("#ver-cosecha").disabled = !estaRevelada(parcela);

  const botonPredecir = $("#btn-predecir");
  if (botonPredecir) botonPredecir.addEventListener("click", () => predecirParcela(indice));

  dibujarGrafica();

  if (anunciar) {
    const picos = eventos.length
      ? `Tuvo ${eventos.length} picos de estrés.`
      : "No tuvo picos de estrés importantes.";

    if (parcela.p && !estaRevelada(parcela)) {
      Narrador.decir(
        `${parcela.id} mide ${Util.fmt(parcela.a, 1)} hectáreas y es de las que el modelo debe predecir. ¡Toca «Predecir» para ver su estimación!`
      );
    } else {
      const verbo = parcela.p ? "el modelo predice" : "rindió";
      Narrador.decir(
        `${parcela.id}: ${verbo} ${Util.fmt(rendimientoNumerico(parcela), 2)} toneladas por hectárea, en ${Util.fmt(parcela.a, 1)} hectáreas. ${picos}`
      );
    }
  }
}

async function predecirParcela(indice) {
  const parcela = parcelas[indice];
  if (!parcela.p || estaRevelada(parcela)) return;

  $("#prediccion-caja").innerHTML = '<div class="prediccion">Calculando…</div>';
  mascota.saltito();
  await Util.esperar(Paleta.movimientoReducido() ? 50 : 900);

  reveladas.add(parcela.id);
  recalcular = true;
  actualizarBotonPredecir();
  if (seleccion !== indice) return;

  seleccionar(indice, false);

  // El número "sube" hasta su valor
  const elemento = $("#valor-pred");
  const inicio = performance.now();
  const animarNumero = (ahora) => {
    const k = clamp((ahora - inicio) / 800, 0, 1);
    if (elemento && seleccion === indice) {
      elemento.firstChild.textContent = Util.fmt(mezcla(2, parcela.pred, 1 - Math.pow(1 - k, 3)), 2) + " ";
      if (k < 1) requestAnimationFrame(animarNumero);
    }
  };
  requestAnimationFrame(animarNumero);

  Narrador.decir(
    `El modelo estima ${Util.fmt(parcela.pred, 2)} toneladas por hectárea para ${parcela.id}, con un margen típico de ±${Util.fmt(modelo.validacion.rmse, 1)}.`
  );
}

function pendientesDeZona() {
  return parcelas.filter((p) => p.p && !estaRevelada(p));
}

function actualizarBotonPredecir() {
  const total = parcelas.filter((p) => p.p).length;
  const pendientes = pendientesDeZona().length;
  const boton = $("#predecir-todas");

  boton.textContent = pendientes ? `Predecir las ${pendientes} pendientes` : `Las ${total} ya están predichas ✓`;
  boton.disabled = pendientes === 0;
}

async function predecirTodas() {
  const pendientes = pendientesDeZona();
  if (!pendientes.length) return;

  mascota.saltito();
  pendientes.forEach((p) => reveladas.add(p.id));
  recalcular = true;
  actualizarBotonPredecir();
  seleccionar(seleccion, false);

  const valores = parcelas.filter((p) => p.p).map((p) => p.pred);
  const promedio = Modelo.promedio(valores);
  Narrador.decir(
    `Listo: ${valores.length} predicciones en este estado, de ${Util.fmt(Math.min(...valores), 1)} a ${Util.fmt(Math.max(...valores), 1)} t/ha, con promedio de ${Util.fmt(promedio, 1)}. Toca cualquiera para ver el detalle.`
  );
}

function crearBotonesDeVariable() {
  const contenedor = $("#var-chips");

  VARIABLES.forEach(({ clave, nombre }) => {
    const boton = document.createElement("button");
    boton.textContent = nombre;
    boton.classList.toggle("active", clave === variableActiva);
    boton.addEventListener("click", () => {
      variableActiva = clave;
      $$("button", contenedor).forEach((b) => b.classList.toggle("active", b === boton));
      dibujarGrafica();
    });
    contenedor.appendChild(boton);
  });
}

/* ------------------------------------------------------------------------ */
/* Cámara y animación del campo                                              */
/* ------------------------------------------------------------------------ */

const camaraPos = new THREE.Vector3(0, -73, 24);
const camaraMira = new THREE.Vector3(0, -100, 2);
const destinoPos = new THREE.Vector3();
const destinoMira = new THREE.Vector3();
const mirada = new THREE.Vector3();

function actualizarCamaraCampo(dt) {
  const parcela = parcelas[seleccion];
  const retrato = Math.max(1, 1.25 / camara.aspect);

  if (enfocado && parcela) {
    destinoPos.set(parcela.x * 0.9, -100 + 9.5 * retrato, parcela.z + 9.5 * retrato);
    destinoMira.set(parcela.x, -100, parcela.z);
  } else {
    destinoPos.set(0, -100 + 27 * retrato, 24 * retrato);
    destinoMira.set(0, -100, 2);
  }

  const k = 1 - Math.exp(-dt * 3);
  camaraPos.lerp(destinoPos, k);
  camaraMira.lerp(destinoMira, k);

  camara.position.set(camaraPos.x + puntero.x * 0.4, camaraPos.y + puntero.y * 0.25, camaraPos.z);
  mirada.copy(camaraMira);
  camara.lookAt(mirada);
}

function actualizarPaletaCampo(w) {
  const sueloColor = new THREE.Color(C.suelo);
  const color = new THREE.Color();

  parcelas.forEach((parcela, i) => {
    const ndvi = muestrear(parcela.n, w) / 1000;
    const verdor = clamp((ndvi - 0.18) / 0.55, 0, 1);

    color.set(parcela.p ? C.parcelaOro : C.parcelaVerde);
    color.lerp(sueloColor, 1 - Math.pow(verdor, 0.7));

    datosPaleta[i * 4] = color.r * 255;
    datosPaleta[i * 4 + 1] = color.g * 255;
    datosPaleta[i * 4 + 2] = color.b * 255;
    datosPaleta[i * 4 + 3] = 255;
  });

  color.set(C.parcelaVerde).lerp(sueloColor, 0.55).multiplyScalar(0.8);
  datosPaleta.set([color.r * 255, color.g * 255, color.b * 255, 255], ID_RELLENO * 4);
  texturaPaleta.needsUpdate = true;
}

function actualizarCampo(t, dt) {
  uniformes.uT.value = t;

  if (tweenSemana) {
    const k = clamp((performance.now() - tweenSemana.inicio) / tweenSemana.duracion, 0, 1);
    semana = mezcla(tweenSemana.desde, tweenSemana.hasta, Paleta.movimientoReducido() ? 1 : Util.suave(k));
    $("#week-slider").value = semana;

    if (k >= 1) {
      const resolver = tweenSemana.resolver;
      tweenSemana = null;
      resolver();
    }
  }

  if (semana !== semanaDibujada || recalcular) {
    const w = Math.min(50.99, semana);

    parcelas.forEach((parcela, i) => {
      const ndvi = muestrear(parcela.n, w) / 1000;
      const ideal = muestrear(DATA.opt.n, w) / 1000;
      const verdor = clamp((ndvi - 0.18) / 0.55, 0, 1);
      const alto = 0.08 + 1.35 * verdor * (0.7 + (0.3 * rendimientoNumerico(parcela)) / 5.6);
      const brecha = ideal > 0.3 ? Math.max(0, (ideal - ndvi) / ideal) : 0;
      const estres = clamp(brecha * 2.2, 0, 1);
      const [inicio, fin] = rangosTallos[i];

      attrAlto.fill(alto, inicio, fin);
      attrEstres.fill(estres, inicio, fin);
    });
    atributoAlto.needsUpdate = true;
    atributoEstres.needsUpdate = true;
    actualizarPaletaCampo(w);

    const s = Math.round(Math.min(51, semana));
    const clima = DATA.cli;

    $("#week-label").textContent = s + 1;
    $("#panel-climate").innerHTML = `Semana ${s + 1} · Tmín ${clima.tmin[s]}°C* ·
      Amplitud ${clima.amp[s]}°C* · GDD ${clima.gdd[s]}* · Nubosidad ${clima.cld[s]}%<br>* simulado`;

    const linea = $("#chart-now");
    if (linea) {
      const x = 10 + (semana / 51) * 340;
      linea.setAttribute("x1", x);
      linea.setAttribute("x2", x);
    }

    semanaDibujada = semana;
    recalcular = false;
  }

  uniformesSuelo.uHover.value = hover;
}

function animarSemana(desde, hasta, duracion) {
  return new Promise((resolver) => {
    if (tweenSemana) tweenSemana.resolver();
    tweenSemana = { desde, hasta, duracion, inicio: performance.now(), resolver };
  });
}

/* --- Selección con el puntero ------------------------------------------- */

const rayo = new THREE.Raycaster();
const vectorRayo = new THREE.Vector2();

function parcelaBajoPuntero() {
  vectorRayo.set(puntero.x, puntero.y);
  rayo.setFromCamera(vectorRayo, camara);

  const impactos = rayo.intersectObject(suelo);
  if (!impactos.length) return -1;

  const punto = impactos[0].point;
  const px = Math.floor((punto.x + ANCHO / 2) * PX);
  const py = Math.floor((ALTO / 2 - (punto.z - campo.position.z)) * PX);
  if (px < 0 || px >= TW || py < 0 || py >= TH) return -1;

  const id = idsCampo[py * TW + px];
  return id < parcelas.length ? id : -1;
}

/* ------------------------------------------------------------------------ */
/* Fondo y paleta                                                            */
/* ------------------------------------------------------------------------ */

const colorGlobo = new THREE.Color(C.fondoGlobo);
const colorCampo = new THREE.Color(C.fondoCampo);
const colorFondo = new THREE.Color();
let pasoFondo = 0;

function actualizarFondo(dt) {
  pasoFondo += ((vista === "campo" ? 1 : 0) - pasoFondo) * (1 - Math.exp(-dt * 4));
  colorFondo.copy(colorGlobo).lerp(colorCampo, pasoFondo);
  document.documentElement.style.setProperty("--sky", `#${colorFondo.getHexString()}`);
}

function aplicarPaleta() {
  colorGlobo.set(C.fondoGlobo);
  colorCampo.set(C.fondoCampo);
  nubeBase.material.color.set(C.puntos);
  dibujarTexturaMexico();
  esferaOceano.material.color.set(C.oceano);
  materialFronteras.color.set(C.rosa);
  materialesPulso.forEach((m) => m.color.set(C.rosa));

  estadosGlobo.forEach((e) => {
    e.nube.material.color.set(C.rosa);
    e.material.color.set(C.rosa);
  });

  uniformes.cA.value.set(C.talloVerde);
  uniformes.cB.value.set(C.talloOro);
  uniformes.cD.value.set(C.seco);
  uniformesSuelo.uCamino.value.set(C.camino);
  uniformesSuelo.uAcento.value.set(C.rosa);
  recalcular = true;
}

window.addEventListener("paleta", (evento) => {
  Object.assign(C, evento.detail);
  aplicarPaleta();
});

/* ------------------------------------------------------------------------ */
/* Recorrido: contexto → estados → viaje → campo                             */
/* ------------------------------------------------------------------------ */

let vista = "contexto";
let sesionViaje = 0;

const esquinaMascota = () => (camara.aspect < 1 ? -0.7 : -0.86);

function colocarMascotaPara(nombre) {
  const posiciones = {
    contexto: [-0.62, -0.4, 0.95],
    estados: [-0.8, -0.55, 0.75],
    campo: [esquinaMascota(), -0.7, 0.62],
  };
  mascota.mover(...posiciones[nombre]);
}

function mostrarVista(nombre) {
  vista = nombre;
  $("#vista-contexto").hidden = nombre !== "contexto";
  $("#vista-estados").hidden = nombre !== "estados" && nombre !== "viaje";
  $("#hud-campo").hidden = nombre !== "campo";
  $("#zoom-ctrl").hidden = nombre !== "contexto" && nombre !== "estados";
  lienzoGl.classList.toggle("arrastrable", nombre === "contexto" || nombre === "estados");
  if (nombre !== "campo") {
    $("#abrir-menu-campo").classList.remove("visible");
    $("#hud-campo").classList.remove("plegado");
  }

  if (VISTAS_GLOBO[nombre]) miradaGlobo.objetivo = vistaGloboAjustada(nombre);
  if (nombre !== "viaje") colocarMascotaPara(nombre === "campo" ? "campo" : nombre);
}

function datosContexto() {
  const total = DATA.P.length;
  const hectareas = DATA.P.reduce((suma, p) => suma + p.a, 0);
  const porPredecir = DATA.P.filter((p) => p.p).length;
  const mayor = Math.max(...DATA.P.map((p) => p.a));

  return { total, hectareas, porPredecir, conocidas: total - porPredecir, mayor };
}

function iniciarContexto() {
  const d = datosContexto();

  $("#datos-contexto").innerHTML = `
    <div class="dato"><b>${d.total}</b>parcelas</div>
    <div class="dato"><b>${Util.fmt(d.hectareas, 0)}</b>hectáreas en total</div>
    <div class="dato"><b>${Util.fmt(d.hectareas / d.total, 1)} ha</b>área promedio</div>
    <div class="dato"><b>${Util.fmt(d.mayor, 1)} ha</b>la más grande</div>
    <div class="dato"><b>${d.conocidas}</b>con rendimiento conocido</div>
    <div class="dato"><b>${d.porPredecir}</b>por predecir</div>`;

  mascota.colocar(-1.4, -0.4, 0.95);
  mascota.saltarA({ ndcX: -0.62, ndcY: -0.4, escala: 0.95, duracion: 1.4, giros: 1, altura: 1.2 });

  Util.esperar(1500).then(() => {
    if (vista !== "contexto") return;
    Narrador.decir(
      `Una parcela es un terreno agrícola con sus propios límites. En el reto hay ${d.total}, suman ${Util.fmt(d.hectareas, 0)} hectáreas y están en Puebla, Tlaxcala e Hidalgo. De ${d.conocidas} ya sabemos cuánto rindieron; las otras ${d.porPredecir} las tiene que predecir el modelo.`
    );
  });
}

function iniciarEstados() {
  Narrador.callar();
  estadoElegido = -1;
  brote.activo = false;
  pulso.visible = false;
  resaltarEstado(-1);
  mostrarVista("estados");

  $("#saltar-viaje").hidden = true;
  $$("#estados-lista button").forEach((b) => {
    b.disabled = false;
  });

  Narrador.decir(
    "Este es México con sus estados. Elige Puebla, Tlaxcala o Hidalgo y me planto ahí."
  );
}

function resaltarEstado(indice) {
  estadosGlobo.forEach((e, i) => {
    const activo = i === indice;

    e.nube.visible = activo;
    e.material.opacity = activo ? 1 : 0.9;
  });
}

/** Posición y tamaño del estado en pantalla, para que la mascota salte sobre él. */
function medirEstadoEnPantalla(indice) {
  const vectores = ESTADOS_OBJETIVO[indice].poligono.map(([lon, lat]) =>
    latLonAVector(lon, lat, RADIO + 0.02).applyMatrix4(globo.matrixWorld).project(camara)
  );
  const xs = vectores.map((v) => v.x);
  const ys = vectores.map((v) => v.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const anchoPx = ((maxX - minX) / 2) * window.innerWidth;
  const altoPx = ((maxY - minY) / 2) * window.innerHeight;
  const radioPx = (Math.min(anchoPx, altoPx) / 2) * 0.9;
  const pxPorEscala = (0.6 / MEDIO_ALTO) * (window.innerHeight / 2);

  return {
    ndcX: (minX + maxX) / 2,
    ndcY: (minY + maxY) / 2,
    escala: clamp(radioPx / pxPorEscala, 0.14, 0.6),
  };
}

async function elegirEstado(indice) {
  if (vista !== "estados") return;

  vista = "viaje";
  $("#zoom-ctrl").hidden = true;
  lienzoGl.classList.remove("arrastrable");
  const sesion = ++sesionViaje;
  const cancelado = () => sesion !== sesionViaje;
  const estado = ESTADOS_OBJETIVO[indice];

  estadoElegido = indice;
  resaltarEstado(indice);
  marcadores.forEach((b, i) => b.classList.toggle("active", i === indice));
  $$("#estados-lista button").forEach((b) => {
    b.disabled = true;
  });
  $("#saltar-viaje").hidden = false;

  // El estado se resalta y la cámara se acerca
  const punto = latLonAVector(estado.lon, estado.lat, RADIO + 0.02);
  brote.base.copy(punto);
  brote.normal.copy(punto).normalize();
  pulso.position.copy(punto);
  brote.activo = true;
  brote.tiempo = 0;
  miradaGlobo.objetivo = { lon: estado.lon, lat: estado.lat, z: 3.55 };

  Narrador.callar();
  mascota.saltito();
  await Util.esperar(1700);
  if (cancelado()) return;

  // La cebada cuenta algo del estado
  await Narrador.decir(estado.dato);
  if (cancelado()) return;
  await Util.esperar(700);
  if (cancelado()) return;

  // Salta girando sobre su eje y se hace chiquita sobre el estado
  const destino = medirEstadoEnPantalla(indice);
  await mascota.saltarA({ ...destino, duracion: 1.6, giros: 2, altura: 1.8 });
  if (cancelado()) return;

  const lista = zonaDe(indice);
  Narrador.decir(`¡Aquí me planto! ${estado.nombre}: ${lista.length} parcelas. Vamos a verlas.`);
  await Util.esperar(2200);
  if (cancelado()) return;

  entrarCampo(indice);
}

async function entrarCampo(indice) {
  sesionViaje++;
  const sesion = sesionViaje;
  Narrador.callar();

  $("#saltar-explicacion").hidden = true;
  $("#wipe").classList.add("on");
  await Util.esperar(Paleta.movimientoReducido() ? 50 : 750);

  cargarZona(indice);
  $("#state-markers").hidden = true;
  mostrarVista("campo");
  $("#timeline").classList.remove("visible");
  $("#panel").classList.remove("visible");
  $("#vista-general").hidden = true;

  // Cámara lejos del suelo, lista para el recorrido
  camaraPos.set(0, -100 + 40, 34);
  camaraMira.set(0, -100, 2);

  mascota.saltarA({ ndcX: esquinaMascota(), ndcY: -0.7, escala: 0.62, duracion: 1.3, giros: 1, altura: 1 });
  $("#wipe").classList.remove("on");
  await Util.esperar(900);
  if (sesion !== sesionViaje) return;

  contarCrecimiento(indice);
}

/* --- Cómo creció la cebada (sin barra de semanas) ------------------------ */

function fasesDeCrecimiento(zona, nombre) {
  const lista = zonaDe(zona);
  const media = Array.from({ length: 52 }, (_, w) => Modelo.promedio(lista.map((p) => p.n[w])) / 1000);

  let pico = 20;
  for (let w = 20; w <= 48; w++) if (media[w] > media[pico]) pico = w;

  const base = Math.min(...media.slice(14, pico + 1));
  const alcanza = (fraccion) => {
    for (let w = 14; w <= pico; w++) if (media[w] >= base + fraccion * (media[pico] - base)) return w;
    return pico;
  };
  const arranque = alcanza(0.15);
  const medio = alcanza(0.6);

  return [
    {
      desde: 14,
      hasta: arranque,
      texto: `Así creció la cebada en ${nombre}. En la semana ${15}, el campo apenas arranca: se ve mucha tierra y el NDVI promedio es de ${Util.fmt(media[14], 2)}.`,
    },
    {
      desde: arranque,
      hasta: medio,
      texto: `Hacia la semana ${arranque + 1} brotan las plantas, sacan hojas y macollan. El NDVI sube rápido: ya vale ${Util.fmt(media[medio], 2)}.`,
    },
    {
      desde: medio,
      hasta: pico,
      texto: `En la semana ${pico + 1} llega el pico de vigor, con NDVI de ${Util.fmt(media[pico], 2)}. Si una parcela queda por debajo de la curva ideal, sus tallos se doblan: eso es estrés.`,
    },
    {
      desde: pico,
      hasta: 48,
      texto: "Después el grano se llena, la planta se seca y llega la cosecha. Cada parcela cierra el ciclo con un rendimiento distinto.",
    },
  ];
}

async function contarCrecimiento(indice) {
  const sesion = sesionViaje;
  const cancelado = () => sesion !== sesionViaje || vista !== "campo";

  $("#timeline").classList.remove("visible");
  $("#panel").classList.remove("visible");
  semana = 14;
  recalcular = true;
  $("#saltar-explicacion").hidden = false;

  const fases = fasesDeCrecimiento(indice, ESTADOS_OBJETIVO[indice].nombre);

  for (const fase of fases) {
    const hablando = Narrador.decir(fase.texto);
    const avanza = animarSemana(fase.desde, fase.hasta, 4600);
    await Promise.all([hablando, avanza]);
    if (cancelado()) return;
    await Util.esperar(450);
    if (cancelado()) return;
  }

  // Ahora sí: se abre la barra para recapitular
  $("#saltar-explicacion").hidden = true;
  $("#timeline").classList.add("visible");
  $("#panel").classList.add("visible");
  Narrador.decir(
    "Ahora te toca a ti. Mueve la barra de semanas para recapitular, toca una parcela y descubre cómo le fue. Las rayadas son las que debo predecir."
  );
}

function saltarHistoria() {
  sesionViaje++;
  $("#saltar-explicacion").hidden = true;
  if (tweenSemana) {
    const resolver = tweenSemana.resolver;
    tweenSemana = null;
    resolver();
  }
  Narrador.callar();
  semana = 36;
  recalcular = true;
  $("#week-slider").value = semana;
  $("#timeline").classList.add("visible");
  $("#panel").classList.add("visible");
  Narrador.decir("Sin problema. Toca una parcela o mueve la barra de semanas para explorar el campo.");
}

function volverAEstados() {
  sesionViaje++;
  $("#saltar-explicacion").hidden = true;
  Narrador.callar();
  tweenSemana = null;

  $("#wipe").classList.add("on");
  Util.esperar(600).then(() => {
    $("#timeline").classList.remove("visible");
    $("#panel").classList.remove("visible");
    $("#state-markers").hidden = false;
    miradaGlobo.lon = ESTADOS_OBJETIVO[estadoElegido].lon;
    miradaGlobo.lat = ESTADOS_OBJETIVO[estadoElegido].lat;
    miradaGlobo.z = 3.55;
    iniciarEstados();
    $("#wipe").classList.remove("on");
  });
}

/* ------------------------------------------------------------------------ */
/* Destino de la cosecha                                                     */
/* ------------------------------------------------------------------------ */

const DESTINOS = [
  {
    min: 4.5,
    icono: "🍺",
    nombre: "Maltería y cervecería",
    y: 70,
    texto:
      "Con rendimientos altos suele haber granos grandes y parejos: lo que busca la industria maltera para hacer cerveza.",
  },
  {
    min: 3.5,
    icono: "🥣",
    nombre: "Alimento y harinas",
    y: 170,
    texto:
      "Un rendimiento medio va a hojuelas, harinas y alimentos balanceados para animales de granja.",
  },
  {
    min: 0,
    icono: "🐄",
    nombre: "Forraje y paja",
    y: 270,
    texto: "Si la cosecha rinde poco, el grano y la paja terminan como forraje o ensilado para el ganado.",
  },
];

const destinoPara = (rendimiento) => DESTINOS.find((d) => rendimiento >= d.min);

const cosecha = { activa: false, destino: DESTINOS[0], total: 0 };

function dibujarEscenaCosecha() {
  const parcela = parcelas[seleccion];

  const destinos = DESTINOS.map((d) => {
    const activo = d === cosecha.destino;
    return `
      <g opacity="${activo ? 1 : 0.35}">
        <path d="M150,170 C300,170 380,${d.y} 560,${d.y}" fill="none"
              stroke="${activo ? "var(--gold)" : "var(--line)"}" stroke-width="${activo ? 5 : 3}"
              stroke-dasharray="${activo ? "" : "6 8"}" ${activo ? 'id="ruta-activa"' : ""}/>
        <rect x="560" y="${d.y - 34}" width="150" height="68" rx="18" fill="var(--card)"
              stroke="${activo ? "var(--gold)" : "var(--line)"}" stroke-width="${activo ? 3 : 1.5}"/>
        <text x="585" y="${d.y + 12}" font-size="34">${d.icono}</text>
        <text x="630" y="${d.y - 4}" font-size="11" font-weight="700" fill="var(--ink)">${d.nombre.split(" ")[0]}</text>
        <text x="630" y="${d.y + 12}" font-size="11" fill="var(--ink)">${d.nombre.split(" ").slice(1).join(" ")}</text>
      </g>`;
  }).join("");

  $("#cosecha-svg").innerHTML = `
    ${destinos}
    <rect x="20" y="120" width="130" height="100" rx="14" fill="var(--${parcela.p ? "gold" : "green"})" opacity=".85"/>
    <g stroke="var(--sky)" stroke-opacity=".5" stroke-width="2">
      ${[0, 1, 2, 3, 4, 5].map((i) => `<line x1="${34 + i * 20}" y1="128" x2="${34 + i * 20}" y2="212"/>`).join("")}
    </g>
    <text x="85" y="238" text-anchor="middle" font-size="12" fill="var(--ink)">${parcela.id}</text>
    <g id="cosecha-grupo"></g>`;
}

function actualizarCosecha(rendimiento) {
  const parcela = parcelas[seleccion];
  cosecha.destino = destinoPara(rendimiento);
  cosecha.total = rendimiento * parcela.a;

  const camiones = Math.max(1, Math.ceil(cosecha.total / 30));

  $("#cosecha-valor").textContent = `${Util.fmt(rendimiento, 1)} t/ha`;
  $("#cosecha-resumen").textContent =
    `${parcela.id}: ${Util.fmt(rendimiento, 1)} t/ha × ${Util.fmt(parcela.a, 1)} ha ≈ ${Util.fmt(cosecha.total, 1)} toneladas, ` +
    `unos ${camiones} ${camiones === 1 ? "camión" : "camiones"} de ~30 t.`;
  $("#cosecha-texto").innerHTML = `<b>${cosecha.destino.icono} ${cosecha.destino.nombre}.</b> ${cosecha.destino.texto}`;

  dibujarEscenaCosecha();
}

function animarCosecha() {
  if (!cosecha.activa) return;

  const ruta = $("#ruta-activa");
  const grupo = $("#cosecha-grupo");
  if (!ruta || !grupo) return requestAnimationFrame(animarCosecha);

  const largo = ruta.getTotalLength();
  const cantidad = clamp(Math.round(cosecha.total / 2), 6, 28);
  const duracion = Paleta.movimientoReducido() ? 1e9 : 5000;
  const ahora = performance.now();

  let contenido = "";
  for (let i = 0; i < cantidad; i++) {
    const fase = ((ahora / duracion + i / cantidad) % 1) * 1;
    const punto = ruta.getPointAtLength(fase * largo);
    const girando = (ahora / 3 + i * 40) % 360;

    contenido += `<ellipse cx="${punto.x}" cy="${punto.y + Math.sin(fase * 20 + i) * 4}" rx="6" ry="3"
      fill="var(--gold)" stroke="var(--ink)" stroke-width="1" transform="rotate(${girando} ${punto.x} ${punto.y})"/>`;
  }

  const camion = ruta.getPointAtLength(((ahora / duracion) % 1) * largo * 0.95);
  contenido += `<text x="${camion.x - 14}" y="${camion.y - 10}" font-size="26">🚚</text>`;

  grupo.innerHTML = contenido;
  requestAnimationFrame(animarCosecha);
}

function abrirCosecha() {
  const parcela = parcelas[seleccion];
  if (!estaRevelada(parcela)) return;

  const rendimiento = Math.round(clamp(rendimientoNumerico(parcela), 2, 5.6) * 10) / 10;

  $("#cosecha-rend").value = rendimiento;
  $("#modal-cosecha").hidden = false;
  actualizarCosecha(rendimiento);

  cosecha.activa = true;
  animarCosecha();
  $("#cerrar-cosecha").focus();

  Narrador.decir(
    `Así viaja la cosecha de ${parcela.id}. Mueve el control para ver adónde iría con otro rendimiento.`
  );
}

function cerrarCosecha() {
  cosecha.activa = false;
  $("#modal-cosecha").hidden = true;
  $("#ver-cosecha").focus();
}

/* ------------------------------------------------------------------------ */
/* Bucle principal y eventos                                                 */
/* ------------------------------------------------------------------------ */

let tiempoPrevio = 0;

function animar(milisegundos) {
  const t = milisegundos / 1000;
  const dt = Math.min(0.05, t - tiempoPrevio);
  tiempoPrevio = t;

  const enCampo = vista === "campo";
  globo.visible = !enCampo;
  campo.visible = enCampo;

  if (enCampo) {
    actualizarCamaraCampo(dt);
  } else {
    camara.position.set(puntero.x * 0.06, puntero.y * 0.04, miradaGlobo.z);
    camara.lookAt(0, 0, 0);
  }
  camara.updateMatrixWorld();

  actualizarGlobo(t, dt);
  actualizarMarcadores();
  actualizarFondo(dt);
  mascota.actualizar(t, dt);
  if (enCampo) actualizarCampo(t, dt);

  renderizador.render(escena, camara);
  mascota.render();
  requestAnimationFrame(animar);
}

window.addEventListener("resize", ajustarTamano);

window.addEventListener("pointermove", (evento) => {
  if (vista !== "campo") {
    hover = -1;

    // Sobre el mapa: la semilla crece al pasar por Puebla, Tlaxcala o Hidalgo
    const sobreMapa = vista === "estados" && estadoElegido < 0 && evento.target.id === "gl" && !arrastre;
    const nombre = sobreMapa ? estadoBajoPantalla(evento.clientX, evento.clientY) : null;

    Cursor.grande(ESTADOS_OBJETIVO.some((e) => e.nombre === nombre));
    return;
  }
  hover = parcelaBajoPuntero();
  Cursor.grande(hover >= 0);
});

window.addEventListener("click", (evento) => {
  if (evento.target.id !== "gl" || vista !== "campo" || hover < 0) return;

  seleccionar(hover, true);
  enfocado = true;
  $("#vista-general").hidden = false;
});

window.addEventListener("keydown", (evento) => {
  if (vista !== "campo" || evento.target.closest("input, button")) return;

  if (evento.key === "ArrowRight" || evento.key === "ArrowLeft") {
    const paso = evento.key === "ArrowRight" ? 1 : -1;
    seleccionar((seleccion + paso + parcelas.length) % parcelas.length, true);
    enfocado = true;
    $("#vista-general").hidden = false;
  }
});

$("#week-slider").addEventListener("input", (evento) => {
  if (tweenSemana) {
    const resolver = tweenSemana.resolver;
    tweenSemana = null;
    resolver();
  }
  semana = Number(evento.target.value);
});

$("#reproducir").addEventListener("click", async () => {
  const desde = semana >= 47 ? 14 : semana;
  await animarSemana(desde, 48, (48 - desde) * 220);
});

$("#ir-estados").addEventListener("click", iniciarEstados);
$("#volver-contexto").addEventListener("click", () => {
  Narrador.callar();
  mostrarVista("contexto");
  Narrador.decir("Aquí estamos de nuevo. Cuando quieras, elige un estado.");
});
$("#saltar-viaje").addEventListener("click", () => entrarCampo(estadoElegido));
$("#volver-estados").addEventListener("click", volverAEstados);
$("#vista-general").addEventListener("click", () => {
  enfocado = false;
  $("#vista-general").hidden = true;
});
$("#repetir-historia").addEventListener("click", () => {
  if (estadoElegido < 0) return;

  sesionViaje++;
  contarCrecimiento(estadoElegido);
});
$("#saltar-explicacion").addEventListener("click", saltarHistoria);

// Menú lateral del campo: se puede plegar para ver todo el terreno
$("#plegar-menu").addEventListener("click", () => {
  $("#hud-campo").classList.add("plegado");
  $("#abrir-menu-campo").classList.add("visible");
});
$("#abrir-menu-campo").addEventListener("click", () => {
  $("#hud-campo").classList.remove("plegado");
  $("#abrir-menu-campo").classList.remove("visible");
});
$("#predecir-todas").addEventListener("click", predecirTodas);
$("#ver-cosecha").addEventListener("click", abrirCosecha);
$("#cerrar-cosecha").addEventListener("click", cerrarCosecha);
$("#modal-cosecha").addEventListener("click", (evento) => {
  if (evento.target.id === "modal-cosecha") cerrarCosecha();
});
$("#cosecha-rend").addEventListener("input", (evento) => actualizarCosecha(Number(evento.target.value)));
document.addEventListener("keydown", (evento) => {
  if (evento.key !== "Escape") return;

  if (!$("#modal-cosecha").hidden) cerrarCosecha();
  else if (!$("#saltar-explicacion").hidden) saltarHistoria();
});

// Lista accesible de estados (además de los puntos sobre el mapa)
ESTADOS_OBJETIVO.forEach((estado, indice) => {
  const lista = zonaDe(indice);
  const porPredecir = lista.filter((p) => p.p).length;
  const boton = document.createElement("button");

  boton.innerHTML = `${estado.nombre} <small>${lista.length} parcelas · ${porPredecir} por predecir</small>`;
  boton.addEventListener("click", () => elegirEstado(indice));
  $("#estados-lista").appendChild(boton);
});

/* --- Carga --------------------------------------------------------------- */

function terminarCarga() {
  $("#loader").classList.add("done");
  mascota.mostrar();
  iniciarContexto();
}

let progresoCarga = 0;
const intervaloCarga = setInterval(() => {
  progresoCarga = Math.min(100, progresoCarga + 5);
  $("#loader-count").textContent = progresoCarga;

  if (progresoCarga >= 100) {
    clearInterval(intervaloCarga);
    terminarCarga();
  }
}, 40);

ajustarTamano();
crearBotonesDeVariable();
mostrarVista("contexto");
Object.assign(miradaGlobo, vistaGloboAjustada("contexto"));
requestAnimationFrame(animar);

// Modo accesible: se puede volver a ver el recorrido sin la historia
$("#timeline").addEventListener("dblclick", saltarHistoria);
