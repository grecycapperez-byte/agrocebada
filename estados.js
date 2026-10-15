"use strict";

/*
 * Datos geográficos SIMPLIFICADOS para el globo.
 *
 * - CONTORNO_MEXICO: perfil del país (continente y Baja California).
 * - CADENAS: tramos de frontera compartidos entre dos estados. Cada estado
 *   se arma pegando tramos, así que dos vecinos usan exactamente los mismos
 *   puntos y no se empalman ni dejan huecos.
 * - ESTADOS_MEXICO: los 32 estados como anillos [lon, lat]. Los que tocan la
 *   costa se extienden un poco hacia el mar; al dibujar se recortan con el
 *   contorno del país.
 * - ESTADOS_OBJETIVO: Puebla, Tlaxcala e Hidalgo (el orden coincide con las
 *   zonas 0, 1 y 2 de data.js).
 *
 * Las fronteras son aproximadas (dibujadas a mano, sin GeoJSON). Para
 * fronteras exactas, reemplaza ESTADOS_MEXICO por un GeoJSON de INEGI o
 * Natural Earth (ver README).
 */

const CONTORNO_MEXICO = [
  [
    [-114.8, 32.5], [-111, 31.3], [-108.2, 31.8], [-106.5, 31.8],
    [-104.5, 29.7], [-103.1, 29], [-101.4, 29.8], [-100.9, 29.35],
    [-100.5, 28.7], [-99.5, 27.5], [-99.1, 26.45], [-98.3, 26.1],
    [-97.2, 25.95], [-97.4, 25], [-97.7, 22.5],
    [-97.2, 20.7], [-96.2, 19], [-94.8, 18.2], [-93.6, 18.4],
    [-91.6, 18.6], [-90.5, 19.9], [-90.4, 21], [-88.5, 21.5],
    [-87, 21.5], [-87.5, 18.2], [-88.3, 18.5], [-89.2, 17.8],
    [-91, 17.25], [-91.7, 16.1], [-92.2, 14.5], [-93, 15.2],
    [-94.5, 16.2], [-97.5, 15.9], [-99.9, 16.7], [-102, 17.9],
    [-104, 19], [-105.6, 20.2], [-105.4, 21.5], [-106.4, 23.1],
    [-108.2, 25], [-109.4, 26], [-110.6, 27.9], [-112.2, 29],
    [-113.1, 31.2],
  ],
  [
    [-117.1, 32.5], [-116, 30.5], [-114.5, 28], [-112.8, 26.5],
    [-110.3, 23.2], [-109.5, 23.2], [-110.2, 24.2], [-111.6, 26],
    [-113.1, 28.6], [-114.7, 30], [-114.7, 32.7],
  ],
];

/* ------------------------------------------------------------------------ */
/* Fronteras compartidas (cada tramo se recorre siempre en el mismo sentido) */
/* ------------------------------------------------------------------------ */

const CADENAS = {
  // Norte y noroeste
  sonChi: [[-109.05, 31.7], [-109.05, 31.3], [-109.15, 30.5], [-108.7, 29.9], [-108.95, 29.1], [-108.55, 28.4], [-108.7, 27.6], [-108.4, 26.8]],
  sonSin: [[-108.4, 26.8], [-108.9, 26.5], [-109.4, 26.2], [-110.3, 25.9]],
  chiSin: [[-108.4, 26.8], [-107.9, 26.3], [-107.5, 26.0], [-107.2, 25.9]],
  chiDur: [[-107.2, 25.9], [-106.4, 26.3], [-105.4, 26.8], [-104.6, 26.8], [-104.3, 26.9]],
  chiCoa: [[-104.3, 26.9], [-104.0, 27.8], [-103.6, 28.4], [-103.3, 29.05], [-103.1, 29.5]],
  coaDur: [[-104.3, 26.9], [-103.9, 26.3], [-103.4, 25.7], [-103.3, 25.3], [-102.7, 25.1]],
  coaZac: [[-102.7, 25.1], [-102.0, 24.9], [-101.2, 24.8]],
  coaNl: [[-101.2, 24.8], [-100.8, 25.5], [-100.4, 26.2], [-100.2, 27.0], [-100.1, 27.6], [-100.0, 28.1], [-99.9, 28.4]],

  // Noreste
  nlTam: [[-99.6, 27.6], [-99.45, 26.8], [-99.3, 26.0], [-99.2, 25.3], [-99.5, 24.6], [-99.7, 24.0], [-99.9, 23.2]],
  nlSlp: [[-99.9, 23.2], [-100.3, 23.4], [-100.6, 24.0], [-100.7, 24.5]],
  nlZac: [[-100.7, 24.5], [-101.2, 24.8]],
  tamSlp: [[-99.9, 23.2], [-99.7, 22.7], [-99.3, 22.5], [-98.9, 22.4], [-98.4, 22.3]],
  tamVer: [[-98.4, 22.3], [-98.0, 22.3], [-97.6, 22.25], [-96.9, 22.2]],

  // Centro-norte
  slpZac: [[-100.7, 24.5], [-101.0, 23.9], [-101.2, 23.3], [-101.5, 22.6], [-101.6, 22.0]],
  slpJal: [[-101.6, 22.0], [-101.5, 21.8]],
  slpGto: [[-101.5, 21.8], [-101.2, 21.7], [-100.8, 21.5], [-100.4, 21.45]],
  slpQro: [[-100.4, 21.45], [-99.8, 21.55], [-99.4, 21.5], [-99.2, 21.15]],
  slpHgo: [[-99.2, 21.15], [-99.0, 21.2], [-98.7, 21.4]],
  slpVer: [[-98.7, 21.4], [-98.6, 21.55], [-98.5, 21.9], [-98.4, 22.3]],
  zacJal: [[-101.6, 22.0], [-102.1, 21.7], [-102.6, 21.5], [-102.9, 21.5], [-103.2, 22.0], [-103.7, 22.2], [-104.0, 22.0]],
  zacNay: [[-104.0, 22.0], [-104.2, 22.3]],
  zacDur: [[-104.2, 22.3], [-104.3, 23.0], [-104.1, 23.5], [-103.5, 24.0], [-103.1, 24.6], [-102.7, 25.1]],

  // Occidente
  durNay: [[-104.2, 22.3], [-104.8, 22.6], [-105.3, 23.0]],
  durSin: [[-105.3, 23.0], [-105.6, 23.4], [-105.9, 23.9], [-106.4, 24.5], [-106.9, 25.2], [-107.2, 25.9]],
  sinNay: [[-105.3, 23.0], [-105.6, 22.6], [-106.0, 22.4]],
  nayJal: [[-104.0, 22.0], [-104.4, 21.6], [-104.7, 21.1], [-105.1, 20.8], [-105.6, 20.5]],
  jalCol: [[-104.75, 18.9], [-104.5, 19.15], [-104.2, 19.2], [-103.9, 19.4], [-103.6, 19.35]],
  jalMic: [[-102.2, 20.1], [-102.6, 19.9], [-103.0, 19.7], [-103.3, 19.5], [-103.6, 19.35]],
  micCol: [[-103.6, 19.35], [-103.55, 19.0], [-103.7, 18.6], [-103.85, 18.4]],
  gtoJal: [[-101.5, 21.8], [-101.85, 21.5], [-102.0, 21.0], [-102.2, 20.5], [-102.2, 20.1]],
  gtoMic: [[-102.2, 20.1], [-101.8, 20.1], [-101.3, 20.0], [-100.8, 20.0], [-100.3, 20.1]],
  gtoQro: [[-100.3, 20.1], [-100.3, 20.4], [-100.3, 20.9], [-100.4, 21.45]],

  // Centro
  qroHgo: [[-99.2, 21.15], [-99.3, 20.8], [-99.5, 20.5], [-99.6, 20.2]],
  qroEdo: [[-99.6, 20.2], [-99.8, 20.1], [-100.0, 20.05], [-100.15, 20.0]],
  hgoVer: [[-98.7, 21.4], [-98.4, 21.2], [-98.2, 20.9], [-98.1, 20.55], [-98.0, 20.2]],
  hgoPue: [[-98.0, 20.2], [-98.2, 20.05], [-98.4, 19.9], [-98.5, 19.7], [-98.55, 19.65]],
  hgoEdo: [[-98.65, 19.6], [-99.0, 19.78], [-99.2, 19.9], [-99.4, 20.0], [-99.6, 20.15], [-99.6, 20.2]],
  edoPue: [[-98.7, 19.05], [-98.65, 19.2], [-98.7, 19.4], [-98.65, 19.6]],
  tlxPue: [[-98.65, 19.2], [-98.3, 19.12], [-98.15, 19.08], [-97.95, 19.1], [-97.75, 19.3], [-97.6, 19.45], [-97.72, 19.65], [-97.95, 19.72], [-98.2, 19.73], [-98.5, 19.7], [-98.55, 19.65]],
  micEdo: [[-100.2, 18.4], [-100.1, 18.9], [-100.0, 19.3], [-100.0, 19.6], [-100.15, 20.0]],
  edoMor: [[-99.5, 18.65], [-99.4, 18.95], [-99.3, 19.15], [-99.1, 19.15], [-98.9, 19.1], [-98.7, 19.05]],
  groEdo: [[-100.2, 18.4], [-99.9, 18.35], [-99.7, 18.45], [-99.5, 18.65]],
  groMor: [[-98.75, 18.55], [-98.9, 18.5], [-99.1, 18.4], [-99.4, 18.45], [-99.5, 18.65]],
  pueMor: [[-98.75, 18.55], [-98.65, 18.8], [-98.65, 19.0], [-98.7, 19.05]],
  pueGro: [[-98.35, 17.9], [-98.6, 18.1], [-98.85, 18.3], [-98.75, 18.55]],
  micGro: [[-100.2, 18.4], [-100.5, 18.2], [-101.2, 18.0], [-101.8, 17.95], [-102.3, 17.75]],

  // Golfo y sur
  pueVer: [[-98.0, 20.2], [-97.8, 20.55], [-97.55, 20.75], [-97.3, 20.4], [-97.25, 19.95], [-97.2, 19.6], [-97.3, 19.2], [-97.15, 18.9], [-96.85, 18.6], [-96.8, 18.3]],
  pueOax: [[-96.8, 18.3], [-97.2, 18.15], [-97.7, 17.95], [-98.35, 17.9]],
  groOax: [[-98.35, 17.9], [-98.4, 17.4], [-98.3, 16.9], [-98.3, 16.4], [-98.3, 15.9]],
  verOax: [[-96.8, 18.3], [-96.4, 18.05], [-96.0, 17.7], [-95.5, 17.3], [-95.0, 17.2], [-94.5, 17.2], [-94.1, 17.25]],
  verChi: [[-94.1, 17.25], [-93.9, 17.3], [-93.7, 17.5]],
  verTab: [[-93.7, 17.5], [-93.9, 17.7], [-94.1, 18.0], [-94.15, 18.6]],
  chiOax: [[-94.1, 17.25], [-94.05, 16.7], [-94.0, 16.2], [-94.0, 15.4]],
  chiTab: [[-93.7, 17.5], [-93.1, 17.5], [-92.5, 17.55], [-92.0, 17.6], [-91.6, 17.4], [-91.0, 17.25]],
  tabCam: [[-91.5, 19.2], [-91.5, 18.7], [-91.5, 18.4], [-91.2, 18.1], [-90.99, 17.85]],
  camQro: [[-89.15, 17.8], [-89.15, 18.6], [-89.1, 19.6]],
  camYuc: [[-89.1, 19.6], [-89.4, 19.9], [-89.7, 20.2], [-90.0, 20.5], [-90.4, 20.75], [-90.65, 20.9]],
  yucQro: [[-87.5, 22.0], [-87.55, 21.5], [-88.0, 20.9], [-88.4, 20.2], [-88.7, 19.9], [-89.1, 19.6]],
};

const invertir = (tramo) => [...tramo].reverse();

/** Pega tramos y puntos sueltos en un anillo. "~nombre" recorre el tramo al revés. */
function unir(...partes) {
  const anillo = [];

  partes.forEach((parte) => {
    let puntos = parte;

    if (typeof parte === "string") {
      puntos = parte.startsWith("~") ? invertir(CADENAS[parte.slice(1)]) : CADENAS[parte];
    }
    puntos.forEach((punto) => {
      const ultimo = anillo[anillo.length - 1];
      if (!ultimo || ultimo[0] !== punto[0] || ultimo[1] !== punto[1]) anillo.push(punto);
    });
  });
  return anillo;
}

/* ------------------------------------------------------------------------ */
/* Los 32 estados                                                            */
/* ------------------------------------------------------------------------ */

// Orden de pintado: los enclaves (Aguascalientes, Ciudad de México,
// Tlaxcala) van al final para quedar encima de su vecino.
const ESTADOS_MEXICO = [
  {
    nombre: "Baja California",
    etiqueta: [-115.4, 30.3],
    anillo: [[-117.5, 33.0], [-114.5, 33.0], [-114.5, 31.0], [-113.0, 29.5], [-112.5, 28.0], [-117.5, 28.0]],
  },
  {
    nombre: "Baja California Sur",
    etiqueta: [-111.9, 25.2],
    anillo: [[-117.5, 28.0], [-112.5, 28.0], [-111.2, 26.5], [-109.8, 24.5], [-109.0, 22.8], [-110.0, 21.8], [-117.5, 21.8]],
  },
  {
    nombre: "Sonora",
    etiqueta: [-110.6, 29.6],
    anillo: unir(
      "sonChi", "sonSin",
      [[-111.5, 27.0], [-112.6, 29.0], [-113.4, 30.2], [-114.0, 31.6], [-114.75, 32.2], [-114.8, 33.0], [-111.0, 31.9]]
    ),
  },
  {
    nombre: "Chihuahua",
    etiqueta: [-106.3, 28.9],
    anillo: unir(
      "sonChi", "chiSin", "chiDur", "chiCoa",
      [[-104.5, 30.2], [-106.5, 32.1], [-108.2, 32.1]]
    ),
  },
  {
    nombre: "Coahuila",
    etiqueta: [-102.2, 27.3],
    anillo: unir(
      "chiCoa",
      [[-103.0, 29.7], [-101.4, 30.2], [-100.9, 29.8], [-100.4, 29.0]],
      "~coaNl", "~coaZac", "~coaDur"
    ),
  },
  {
    nombre: "Nuevo León",
    etiqueta: [-100.1, 25.7],
    anillo: unir(
      "coaNl",
      [[-99.4, 28.0]],
      "nlTam", "nlSlp", "nlZac"
    ),
  },
  {
    nombre: "Tamaulipas",
    etiqueta: [-98.7, 24.4],
    anillo: unir(
      [[-99.6, 27.6], [-99.3, 27.9], [-97.0, 26.5], [-96.5, 26.5], [-96.5, 22.2]],
      "~tamVer", "~tamSlp", "~nlTam"
    ),
  },
  {
    nombre: "Sinaloa",
    etiqueta: [-107.5, 25.1],
    anillo: unir(
      "sonSin",
      [[-109.5, 25.0], [-108.5, 24.0], [-107.0, 22.6]],
      "~sinNay", "durSin", "~chiSin"
    ),
  },
  {
    nombre: "Durango",
    etiqueta: [-105.3, 24.6],
    anillo: unir("chiDur", "coaDur", "~zacDur", "durNay", "durSin"),
  },
  {
    nombre: "Zacatecas",
    etiqueta: [-102.6, 23.5],
    anillo: unir("coaZac", "nlZac", "slpZac", "zacJal", "zacNay", "zacDur"),
  },
  {
    nombre: "Nayarit",
    etiqueta: [-104.9, 21.9],
    anillo: unir(
      "sinNay",
      [[-106.1, 21.5], [-105.9, 20.6]],
      "~nayJal", "zacNay", "durNay"
    ),
  },
  {
    nombre: "Jalisco",
    etiqueta: [-103.6, 20.5],
    anillo: unir(
      "nayJal",
      [[-106.0, 20.2], [-105.4, 19.5]],
      "jalCol", "~jalMic", "~gtoJal", "~slpJal", "zacJal"
    ),
  },
  {
    nombre: "Colima",
    etiqueta: [-103.9, 19.15],
    anillo: unir("jalCol", "micCol", [[-104.3, 18.5]]),
  },
  {
    nombre: "Michoacán",
    etiqueta: [-101.9, 19.2],
    anillo: unir(
      "micCol",
      [[-103.3, 17.9]],
      "~micGro",
      "micEdo",
      [[-100.3, 20.1]],
      "~gtoMic",
      "jalMic"
    ),
  },
  {
    nombre: "Guanajuato",
    etiqueta: [-101.0, 20.8],
    anillo: unir("gtoMic", "gtoQro", "~slpGto", "gtoJal"),
  },
  {
    nombre: "Querétaro",
    etiqueta: [-99.9, 20.85],
    anillo: unir("gtoQro", "slpQro", "qroHgo", "qroEdo", [[-100.3, 20.1]]),
  },
  {
    nombre: "San Luis Potosí",
    etiqueta: [-100.5, 22.5],
    anillo: unir("nlSlp", "slpZac", "slpJal", "slpGto", "slpQro", "slpHgo", "slpVer", "~tamSlp"),
  },
  {
    nombre: "Estado de México",
    etiqueta: [-99.75, 19.45],
    anillo: unir("hgoEdo", "qroEdo", "~micEdo", "groEdo", "~edoMor", "edoPue"),
  },
  {
    nombre: "Morelos",
    etiqueta: [-99.1, 18.75],
    anillo: unir("groMor", "edoMor", "~pueMor"),
  },
  {
    nombre: "Guerrero",
    etiqueta: [-100.1, 17.6],
    anillo: unir(
      "micGro",
      [[-102.0, 17.3], [-100.0, 16.2], [-98.3, 15.9]],
      "~groOax", "pueGro", "groMor", "~groEdo"
    ),
  },
  {
    nombre: "Hidalgo",
    etiqueta: [-98.9, 20.6],
    anillo: unir("slpHgo", "hgoVer", "hgoPue", "hgoEdo", "~qroHgo"),
  },
  {
    nombre: "Puebla",
    etiqueta: [-97.9, 18.7],
    anillo: unir("~hgoPue", "pueVer", "pueOax", "pueGro", "pueMor", "tlxPue"),
  },
  {
    nombre: "Veracruz",
    etiqueta: [-96.7, 19.8],
    anillo: unir(
      "~slpVer", "hgoVer", "pueVer", "verOax", "verChi", "verTab",
      [[-94.4, 19.4], [-95.7, 20.0], [-96.6, 20.9]],
      "~tamVer"
    ),
  },
  {
    nombre: "Oaxaca",
    etiqueta: [-96.6, 17.1],
    anillo: unir(
      "~verOax", "pueOax", "groOax",
      [[-96.5, 15.3], [-94.9, 15.6]],
      "~chiOax"
    ),
  },
  {
    nombre: "Chiapas",
    etiqueta: [-92.7, 16.3],
    anillo: unir(
      "verChi", "chiTab",
      [[-91.7, 16.1], [-92.2, 14.5], [-92.5, 14.2], [-93.5, 14.6]],
      "~chiOax"
    ),
  },
  {
    nombre: "Tabasco",
    etiqueta: [-92.7, 18.1],
    anillo: unir(
      "verTab",
      [[-94.15, 19.2]],
      "tabCam",
      [[-90.99, 17.25]],
      "~chiTab"
    ),
  },
  {
    nombre: "Campeche",
    etiqueta: [-90.4, 18.7],
    anillo: unir(
      "tabCam",
      [[-90.99, 17.25], [-89.15, 17.8]],
      "camQro", "camYuc",
      [[-90.9, 20.0]]
    ),
  },
  {
    nombre: "Yucatán",
    etiqueta: [-88.9, 20.6],
    anillo: unir("camYuc", [[-90.7, 22.0]], "yucQro"),
  },
  {
    nombre: "Quintana Roo",
    etiqueta: [-88.3, 19.1],
    anillo: unir("yucQro", "~camQro", [[-88.2, 17.4], [-86.0, 17.4], [-85.8, 22.0]]),
  },
  // Enclaves: encima de sus vecinos
  {
    nombre: "Aguascalientes",
    etiqueta: [-102.3, 21.95],
    anillo: [[-102.75, 22.45], [-102.3, 22.45], [-102.0, 22.2], [-101.85, 21.85], [-102.1, 21.65], [-102.5, 21.6], [-102.8, 21.8], [-102.9, 22.1]],
  },
  {
    nombre: "Ciudad de México",
    etiqueta: [-99.13, 19.33],
    anillo: [[-99.3, 19.58], [-99.1, 19.6], [-98.95, 19.5], [-98.95, 19.3], [-99.0, 19.1], [-99.2, 19.05], [-99.35, 19.2], [-99.3, 19.4]],
  },
  {
    nombre: "Tlaxcala",
    etiqueta: [-98.2, 19.4],
    anillo: unir("tlxPue", [[-98.65, 19.6]], "~edoPue"),
  },
];

/* ------------------------------------------------------------------------ */
/* Estados del reto                                                          */
/* ------------------------------------------------------------------------ */

const DATOS_ESTADOS = {
  Puebla: {
    lon: -98.2,
    lat: 19.0,
    paso: 0.07,
    dato:
      "Puebla es parte del Altiplano donde se concentra la cebada maltera, y hasta tiene una variedad que lleva su nombre. En 2011 aportó cerca del 10% de la cebada del país (SIAP).",
  },
  Tlaxcala: {
    lon: -98.2,
    lat: 19.4,
    paso: 0.035,
    dato:
      "Tlaxcala es chiquito, pero sembrador: en 2011 puso cerca del 13% de la cebada del país (SIAP). Sus valles altos y frescos le van muy bien a mi familia.",
  },
  Hidalgo: {
    lon: -98.76,
    lat: 20.1,
    paso: 0.06,
    dato:
      "Hidalgo es el mayor productor de cebada del país desde 2023 (SIAP). Zempoala, Apan, Almoloya y Singuilucan encabezan la producción en el Altiplano hidalguense.",
  },
};

// El orden importa: coincide con la zona de data.js (0, 1, 2).
const ESTADOS_OBJETIVO = ["Puebla", "Tlaxcala", "Hidalgo"].map((nombre) => ({
  nombre,
  ...DATOS_ESTADOS[nombre],
  poligono: ESTADOS_MEXICO.find((estado) => estado.nombre === nombre).anillo,
}));

if (typeof module !== "undefined") module.exports = { ESTADOS_MEXICO, ESTADOS_OBJETIVO, CONTORNO_MEXICO, CADENAS };
