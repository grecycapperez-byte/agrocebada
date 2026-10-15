"use strict";

/*
 * Barley Bot en 3D: grano de cebada con cara, planta de cebada con espiga
 * que se desprende, y el narrador (globo de texto).
 * Requiere three.js r128 y common.js.
 */

const D2R = Math.PI / 180;
const { clamp, suave, mezcla } = Util;

const PROFUNDIDAD = 6;
const MEDIO_ALTO = Math.tan(22.5 * D2R) * PROFUNDIDAD;

/* ------------------------------------------------------------------------ */
/* Geometría de un grano de cebada                                           */
/* ------------------------------------------------------------------------ */

const LARGO_GRANO = 1.5;
const ANCHO_GRANO = 0.36;

// Radio del grano a lo largo de su eje: huso con puntas, más ancho al centro
function radioGrano(t) {
  return ANCHO_GRANO * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.9)), 0.7);
}

function geometriaGrano() {
  const perfil = [];
  const PASOS = 28;

  for (let i = 0; i <= PASOS; i++) {
    const t = i / PASOS;
    perfil.push(new THREE.Vector2(radioGrano(t), (t - 0.5) * LARGO_GRANO));
  }
  return new THREE.LatheGeometry(perfil, 32);
}

// Línea fina que recorre el grano de punta a punta (nervaduras y surco)
function lineaSobreGrano(angulo, material, grosor) {
  const puntos = [];

  for (let i = 1; i < 14; i++) {
    const t = i / 14;
    const r = radioGrano(t) * 1.01;
    puntos.push(
      new THREE.Vector3(Math.sin(angulo) * r, (t - 0.5) * LARGO_GRANO, Math.cos(angulo) * r)
    );
  }
  const curva = new THREE.CatmullRomCurve3(puntos);
  return new THREE.Mesh(new THREE.TubeGeometry(curva, 24, grosor, 5, false), material);
}

function crearAristaGeometria(largo, curvatura) {
  const curva = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(curvatura * 0.2, largo * 0.35, 0),
    new THREE.Vector3(curvatura * 0.6, largo * 0.7, 0),
    new THREE.Vector3(curvatura, largo, 0),
  ]);
  return new THREE.TubeGeometry(curva, 12, 0.011, 4, false);
}

/* ------------------------------------------------------------------------ */
/* Mascota                                                                   */
/* ------------------------------------------------------------------------ */

function crearGrano() {
  const grupo = new THREE.Group();
  const tinta = new THREE.MeshBasicMaterial({ color: 0x3f4a3c });

  const materialGrano = new THREE.MeshStandardMaterial({
    color: 0xdcbc6c,
    roughness: 0.55,
    emissive: 0x2a2208,
  });
  const materialNervio = new THREE.MeshStandardMaterial({ color: 0xf3e3b0, roughness: 0.6 });
  const materialSurco = new THREE.MeshStandardMaterial({ color: 0xa5843f, roughness: 0.7 });

  // El cuerpo se aplana un poco; la cara queda fuera para no deformarse
  const cuerpo = new THREE.Group();
  cuerpo.scale.set(1, 1, 0.8);
  cuerpo.add(new THREE.Mesh(geometriaGrano(), materialGrano));

  [-1.25, -0.8, 0.8, 1.25].forEach((angulo) => {
    cuerpo.add(lineaSobreGrano(angulo, materialNervio, 0.008));
  });
  cuerpo.add(lineaSobreGrano(Math.PI, materialSurco, 0.014));
  grupo.add(cuerpo);

  const ojos = [-1, 1].map((lado) => {
    const ojo = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), tinta);
    ojo.position.set(lado * 0.12, 0.12, 0.265);
    grupo.add(ojo);
    return ojo;
  });

  const boca = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.015, 6, 16, Math.PI), tinta);
  boca.rotation.z = Math.PI;
  boca.position.set(0, -0.03, 0.28);
  grupo.add(boca);

  const rosa = new THREE.MeshBasicMaterial({ color: 0xf29ab4 });
  [-1, 1].forEach((lado) => {
    const mejilla = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), rosa);
    mejilla.scale.set(1.3, 0.8, 0.4);
    mejilla.position.set(lado * 0.2, -0.03, 0.225);
    grupo.add(mejilla);
  });

  // Arista (la "barba" larga de la cebada) y pie del grano
  const materialArista = new THREE.MeshStandardMaterial({ color: 0xe9d9a2, roughness: 0.6 });
  const arista = new THREE.Mesh(crearAristaGeometria(0.95, 0.22), materialArista);
  arista.position.set(0, LARGO_GRANO / 2 - 0.03, 0);
  grupo.add(arista);

  const pie = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 6), materialNervio);
  pie.position.set(0, -LARGO_GRANO / 2 - 0.05, 0);
  pie.rotation.x = Math.PI;
  grupo.add(pie);

  grupo.rotation.order = "YXZ";
  return { grupo, ojos, boca, arista };
}

/* ------------------------------------------------------------------------ */
/* Escena de la mascota (canvas superpuesto)                                 */
/* ------------------------------------------------------------------------ */

function crearEscenaMascota(lienzo) {
  const renderizador = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true });
  renderizador.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(45, 1, 0.1, 50);

  escena.add(new THREE.HemisphereLight(0xffffff, 0xb9a37a, 0.95));
  const luz = new THREE.DirectionalLight(0xfff0d0, 1.1);
  luz.position.set(2, 3, 4);
  escena.add(luz);

  const grano = crearGrano();
  escena.add(grano.grupo);

  const monticulo = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 20, 12),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1, transparent: true })
  );
  escena.add(monticulo);

  const estado = {
    ndcX: 0,
    ndcY: -0.3,
    escala: 1.25,
    objetivo: { ndcX: 0, ndcY: -0.3, escala: 1.25 },
    yaw: 0,
    pitch: 0,
    brinco: 0,
    salto: null,
    brote: Infinity,
    monticulo: 0, // 0 = sin montículo, 1 = completo
    visible: true,
  };

  const puntero = { x: 0, y: 0 };

  window.addEventListener("pointermove", (evento) => {
    puntero.x = (evento.clientX / window.innerWidth) * 2 - 1;
    puntero.y = -((evento.clientY / window.innerHeight) * 2 - 1);
  });

  function ajustar() {
    const ancho = window.innerWidth;
    const alto = window.innerHeight;

    renderizador.setSize(ancho, alto, false);
    camara.aspect = ancho / alto;
    camara.updateProjectionMatrix();
  }

  /** Salto con giro sobre su propio eje, que además cambia de tamaño. */
  function saltarA({ ndcX, ndcY, escala, duracion = 1.4, giros = 2, altura = 1.4, alTerminar }) {
    return new Promise((resolver) => {
      estado.salto = {
        x0: estado.ndcX,
        y0: estado.ndcY,
        s0: estado.escala,
        x1: ndcX,
        y1: ndcY,
        s1: escala,
        dur: duracion,
        giros,
        altura,
        t0: null,
        fin: () => {
          if (alTerminar) alTerminar();
          resolver();
        },
      };
    });
  }

  function mover(ndcX, ndcY, escala) {
    estado.objetivo = { ndcX, ndcY, escala };
  }

  function colocar(ndcX, ndcY, escala) {
    estado.salto = null;
    estado.ndcX = ndcX;
    estado.ndcY = ndcY;
    estado.escala = escala;
    mover(ndcX, ndcY, escala);
  }

  function actualizar(t, dt) {
    const aspecto = camara.aspect;
    let arco = 0;
    let giro = null;

    if (estado.salto) {
      const salto = estado.salto;
      if (salto.t0 === null) salto.t0 = t;

      const k = clamp((t - salto.t0) / salto.dur, 0, 1);
      const e = suave(k);

      estado.ndcX = mezcla(salto.x0, salto.x1, e);
      estado.ndcY = mezcla(salto.y0, salto.y1, e);
      estado.escala = mezcla(salto.s0, salto.s1, e);
      arco = Math.sin(Math.PI * k) * salto.altura;
      giro = salto.giros * Math.PI * 2 * e;

      if (k >= 1) {
        estado.objetivo = { ndcX: salto.x1, ndcY: salto.y1, escala: salto.s1 };
        estado.salto = null;
        estado.yaw = 0;
        salto.fin();
      }
    } else {
      const k = 1 - Math.exp(-dt * 5);
      estado.ndcX += (estado.objetivo.ndcX - estado.ndcX) * k;
      estado.ndcY += (estado.objetivo.ndcY - estado.ndcY) * k;
      estado.escala += (estado.objetivo.escala - estado.escala) * k;
    }

    estado.brinco = Math.max(0, estado.brinco - dt * 1.5);

    // Brota de la tierra: crece con un pequeño rebote
    const k = clamp((t - estado.brote) / 1.6, 0, 1);
    const crece = 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2);
    const emergida = Math.min(1, crece);

    const escala = (estado.escala + Math.sin(estado.brinco * Math.PI) * 0.15) * Math.max(0.001, crece);

    const x = estado.ndcX * MEDIO_ALTO * aspecto;
    const y =
      estado.ndcY * MEDIO_ALTO +
      Math.sin(t * 2) * 0.04 * emergida -
      (1 - emergida) * 0.9 +
      Math.abs(Math.sin(estado.brinco * Math.PI * 2)) * 0.2 +
      arco;

    grano.grupo.visible = estado.visible;
    grano.grupo.position.set(x, y, -PROFUNDIDAD);
    grano.grupo.scale.setScalar(escala);

    // Mirada: sigue el puntero (o gira si está saltando)
    if (giro !== null) {
      grano.grupo.rotation.set(0, giro, 0);
    } else {
      const medioAltoObjetivo = Math.tan(22.5 * D2R) * 3;
      const dx = puntero.x * medioAltoObjetivo * aspecto - x;
      const dy = puntero.y * medioAltoObjetivo - y;
      const dz = PROFUNDIDAD - 3;

      const yawObjetivo = clamp(Math.atan2(dx, dz), -1.1, 1.1);
      const pitchObjetivo = clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.8, 0.8);

      estado.yaw += (yawObjetivo - estado.yaw) * 0.18;
      estado.pitch += (pitchObjetivo - estado.pitch) * 0.18;
      grano.grupo.rotation.set(estado.pitch, estado.yaw, 0);
    }

    const parpadeo = t % 3.6 < 0.12 ? 0.1 : 1;
    grano.ojos.forEach((ojo) => {
      ojo.scale.y = parpadeo;
    });

    const apertura = Narrador.escribiendo ? 0.5 + Math.abs(Math.sin(t * 14)) * 1.3 : 1;
    grano.boca.scale.y = apertura;
    grano.boca.position.y = -0.03 - (apertura - 1) * 0.03;

    // Montículo de tierra bajo la mascota
    monticulo.visible = estado.monticulo > 0.01 && k > 0;
    monticulo.position.set(x, y - 0.7 * estado.escala, -PROFUNDIDAD + 0.2);
    monticulo.scale.set(estado.escala * 1.1, estado.escala * 0.3, estado.escala * 0.6);
    monticulo.material.opacity = estado.monticulo;

    Narrador.ubicar(estado, aspecto);
  }

  return {
    renderizador,
    escena,
    camara,
    grano,
    estado,
    puntero,
    ajustar,
    actualizar,
    saltarA,
    mover,
    colocar,
    brotar: (t) => {
      estado.brote = t;
    },
    mostrar: () => {
      estado.brote = -999;
    },
    saltito: () => {
      estado.brinco = 1;
    },
    render: () => renderizador.render(escena, camara),
  };
}

/* ------------------------------------------------------------------------ */
/* Narrador: globo de texto con efecto de escritura                          */
/* ------------------------------------------------------------------------ */

const Narrador = (() => {
  const burbuja = $("#bubble");
  const escrito = burbuja && $(".typed", burbuja);
  const resto = burbuja && $(".rest", burbuja);

  // Región para lectores de pantalla: recibe el texto completo de una vez
  let lector = $("#sr-say");
  if (!lector) {
    lector = document.createElement("div");
    lector.id = "sr-say";
    lector.className = "sr-only";
    lector.setAttribute("aria-live", "polite");
    document.body.appendChild(lector);
  }

  const narrador = {
    escribiendo: false,
    intervalo: null,
    terminar: null,

    /** Escribe el texto letra por letra. Devuelve una promesa que se cumple al terminar. */
    decir(texto) {
      clearInterval(narrador.intervalo);
      if (narrador.terminar) narrador.terminar(false);
      if (!burbuja) return Promise.resolve(false);

      lector.textContent = texto;
      burbuja.classList.add("visible");
      escrito.textContent = "";
      resto.textContent = texto;
      narrador.escribiendo = true;

      return new Promise((resolver) => {
        let letras = 0;
        narrador.terminar = (completo) => {
          narrador.terminar = null;
          resolver(completo);
        };

        const rapido = Paleta.movimientoReducido();
        narrador.intervalo = setInterval(
          () => {
            letras = rapido ? texto.length : letras + 1;
            escrito.textContent = texto.slice(0, letras);
            resto.textContent = texto.slice(letras);

            if (letras >= texto.length) {
              clearInterval(narrador.intervalo);
              narrador.escribiendo = false;
              narrador.terminar(true);
            }
          },
          rapido ? 0 : 28
        );
      });
    },

    callar() {
      clearInterval(narrador.intervalo);
      if (narrador.terminar) narrador.terminar(false);
      narrador.escribiendo = false;
      if (burbuja) burbuja.classList.remove("visible");
    },

    ubicar(estado, aspecto) {
      if (!burbuja) return;

      const ancho = window.innerWidth;
      const alto = window.innerHeight;
      const px = (estado.ndcX * 0.5 + 0.5) * ancho;
      const py = (-estado.ndcY * 0.5 + 0.5) * alto;
      const radio = ((estado.escala * 0.6) / MEDIO_ALTO) * (alto / 2);

      burbuja.style.top = Math.max(100, py - radio * 0.25) + "px";

      if (ancho < 720) {
        burbuja.classList.remove("izq");
        burbuja.style.right = "auto";
        burbuja.style.left = "4vw";
        burbuja.style.maxWidth = "92vw";
        burbuja.style.top = Math.max(100, py - radio - 10) + "px";
        return;
      }

      const derecha = px + radio * 0.75 + 14;
      const espacioDerecha = ancho - derecha - 16;

      if (espacioDerecha >= 260) {
        burbuja.classList.remove("izq");
        burbuja.style.right = "auto";
        burbuja.style.left = derecha + "px";
        burbuja.style.maxWidth = Math.min(400, espacioDerecha) + "px";
      } else {
        // La mascota está pegada al borde derecho: el globo sale hacia la izquierda
        const orilla = px - radio * 0.75 - 14;

        burbuja.classList.add("izq");
        burbuja.style.left = "auto";
        burbuja.style.right = ancho - orilla + "px";
        burbuja.style.maxWidth = Math.min(330, orilla - 16) + "px";
      }
    },
  };

  return narrador;
})();

/* ------------------------------------------------------------------------ */
/* Planta de cebada con espiga: los granos caen al suelo y ahí se quedan     */
/* ------------------------------------------------------------------------ */

function crearPlanta() {
  const grupo = new THREE.Group();
  const verde = new THREE.MeshStandardMaterial({ color: 0x7fa65f, roughness: 0.8, side: THREE.DoubleSide });
  const paja = new THREE.MeshStandardMaterial({ color: 0xc9b46a, roughness: 0.7 });
  const materialGrano = new THREE.MeshStandardMaterial({ color: 0xdcbc6c, roughness: 0.55, emissive: 0x2a2208 });
  const materialArista = new THREE.MeshStandardMaterial({ color: 0xe9d9a2, roughness: 0.6 });

  const ALTURA_TALLO = 4.6;

  // Altura del suelo medida desde la espiga (el grano tirado mide ~0.07 de grosor)
  const SUELO_Y = -ALTURA_TALLO + 0.08;

  // Tallo con una ligera curva
  const curvaTallo = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.08, 1.5, 0),
    new THREE.Vector3(-0.05, 3.1, 0),
    new THREE.Vector3(0.1, ALTURA_TALLO, 0),
  ]);
  const tallo = new THREE.Mesh(new THREE.TubeGeometry(curvaTallo, 24, 0.035, 6, false), paja);
  grupo.add(tallo);

  // Hojas largas que se doblan hacia afuera
  const hojas = [];
  [
    { y: 0.5, giro: 0.3, largo: 2.3 },
    { y: 1.5, giro: Math.PI + 0.2, largo: 2.0 },
    { y: 2.6, giro: Math.PI / 2, largo: 1.6 },
  ].forEach(({ y, giro, largo }) => {
    const geometria = new THREE.PlaneGeometry(0.22, largo, 1, 8);
    const posiciones = geometria.attributes.position;

    for (let i = 0; i < posiciones.count; i++) {
      const sube = (posiciones.getY(i) + largo / 2) / largo;
      posiciones.setZ(i, sube * sube * 0.9);
      posiciones.setX(i, posiciones.getX(i) * (1 - sube * 0.7));
    }
    geometria.translate(0, largo / 2, 0);
    geometria.computeVertexNormals();

    const hoja = new THREE.Mesh(geometria, verde);
    hoja.position.set(0, y, 0);
    hoja.rotation.set(0.15, giro, 0.35, "YXZ");
    grupo.add(hoja);
    hojas.push(hoja);
  });

  // Espiga: eje central y tres granos por nudo
  const espiga = new THREE.Group();
  espiga.position.set(0.1, ALTURA_TALLO, 0);
  grupo.add(espiga);

  const eje = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.4, 6), paja);
  eje.position.y = 0.7;
  espiga.add(eje);

  const geoGrano = geometriaGrano();
  const geometriaArista = crearAristaGeometria(1.1, 0.25);
  const granos = [];
  const NUDOS = 11;

  for (let nudo = 0; nudo < NUDOS; nudo++) {
    for (let k = 0; k < 3; k++) {
      const angulo = nudo * 0.9 + (k * Math.PI * 2) / 3;
      const base = new THREE.Vector3(Math.cos(angulo) * 0.05, 0.08 + nudo * 0.115, Math.sin(angulo) * 0.05);

      const sujeto = new THREE.Group();
      const grano = new THREE.Mesh(geoGrano, materialGrano);
      grano.scale.setScalar(0.19);
      grano.position.y = 0.14;
      grano.scale.z = 0.15;
      sujeto.add(grano);
      sujeto.rotation.order = "YXZ";

      const arista = new THREE.Mesh(geometriaArista, materialArista);
      arista.position.y = 0.27;
      sujeto.add(arista);

      sujeto.position.copy(base);
      sujeto.rotation.set(Math.sin(angulo) * 0.35, 0, -Math.cos(angulo) * 0.35);
      espiga.add(sujeto);

      // Dónde cae y cómo queda tirado: de lado, apuntando a cualquier rumbo
      const azar = Util.crearRng(nudo * 31 + k * 7 + 5);
      const lado = azar() < 0.5 ? -1 : 1;

      granos.push({
        sujeto,
        base,
        rotBase: sujeto.rotation.clone(),
        umbral: (nudo / NUDOS) * 0.6 + k * 0.05,
        giro: 2 + ((nudo * 3 + k) % 5),
        suelo: new THREE.Vector3(
          (azar() - 0.5) * 2.6,
          SUELO_Y + azar() * 0.04,
          (azar() - 0.5) * 0.9
        ),
        reposo: new THREE.Euler(
          (azar() - 0.5) * 0.3,
          azar() * Math.PI * 2,
          lado * (Math.PI / 2 + (azar() - 0.5) * 0.4),
          "YXZ"
        ),
      });
    }
  }

  /**
   * crecer: 0 a 1 (la planta sale de la tierra)
   * soltar: 0 a 1 (los granos se desprenden, caen y quedan en el suelo)
   */
  function animar(t, crecer, soltar) {
    const sube = suave(crecer);

    grupo.scale.set(1, Math.max(0.001, sube), 1);
    grupo.rotation.z = Math.sin(t * 1.2) * 0.025;
    espiga.visible = crecer > 0.55;
    espiga.scale.setScalar(clamp((crecer - 0.55) / 0.45, 0.001, 1));

    hojas.forEach((hoja, i) => {
      hoja.rotation.z = 0.35 + Math.sin(t * 1.4 + i) * 0.05;
    });

    granos.forEach((g) => {
      const d = clamp((soltar - g.umbral) / 0.35, 0, 1);
      const sujeto = g.sujeto;

      if (d <= 0) {
        sujeto.position.copy(g.base);
        sujeto.rotation.copy(g.rotBase);
        return;
      }

      // Cae acelerando como con gravedad, se desvía un poco y rebota al tocar el suelo
      const caida = d * d;
      const deriva = suave(d);
      const rebote = Math.sin(clamp((d - 0.82) / 0.18, 0, 1) * Math.PI) * 0.06;

      sujeto.position.set(
        mezcla(g.base.x, g.suelo.x, deriva),
        mezcla(g.base.y, g.suelo.y, caida) + rebote,
        mezcla(g.base.z, g.suelo.z, deriva)
      );

      // Da vueltas mientras cae (vale 0 al empezar y al terminar) y queda de lado
      const vuelta = (1 - d) * d * 4 * g.giro;

      sujeto.rotation.set(
        mezcla(g.rotBase.x, g.reposo.x, d) + vuelta,
        mezcla(0, g.reposo.y, d),
        mezcla(g.rotBase.z, g.reposo.z, d) + vuelta * 0.5
      );
    });
  }

  return { grupo, animar, altura: ALTURA_TALLO + 1.6 };
}
