"use strict";

/*
 * Página de inicio (storytelling): la mascota brota de la tierra, una planta
 * de cebada crece al hacer scroll, sus granos caen al suelo y se quedan ahí.
 * Al final, la mascota se coloca en el espacio en blanco de «Tu turno».
 */

const escenaHome = crearEscenaMascota($("#mascot"));

// La planta vive en el mismo lienzo que la mascota, un poco más al fondo
const PROFUNDIDAD_PLANTA = 7.5;
const MEDIO_ALTO_PLANTA = Math.tan(22.5 * D2R) * PROFUNDIDAD_PLANTA;

const planta = crearPlanta();
const contenedorPlanta = new THREE.Group();
contenedorPlanta.add(planta.grupo);
contenedorPlanta.position.z = -PROFUNDIDAD_PLANTA;
escenaHome.escena.add(contenedorPlanta);

let scrollSuave = 0;
let tiempoPrevio = 0;

function actualizarPlanta(t, s) {
  const aspecto = escenaHome.camara.aspect;
  const angosto = aspecto < 1;

  const crecer = clamp((s - 0.6) / 0.9, 0, 1);
  const soltar = clamp((s - 1.7) / 1.0, 0, 1);
  const sale = suave(clamp((s - 3.3) / 0.6, 0, 1));

  const escala = (angosto ? 0.42 : 0.62) * (1 - sale);

  contenedorPlanta.visible = crecer > 0 && escala > 0.01;
  contenedorPlanta.scale.setScalar(Math.max(0.001, escala));
  contenedorPlanta.position.x = MEDIO_ALTO_PLANTA * aspecto * (angosto ? 0.6 : 0.52);
  // Un poco más arriba del borde, para que los granos caídos se vean
  contenedorPlanta.position.y = -MEDIO_ALTO_PLANTA * 0.84;

  planta.animar(t, crecer, soltar);
}

/** Qué tanto ha llegado el scroll a la última sección (0 a 1). */
const seccionFinal = $("#tu-turno");

function llegadaAlFinal() {
  const caja = seccionFinal.getBoundingClientRect();
  return suave(clamp((window.innerHeight * 0.8 - caja.top) / (window.innerHeight * 0.5), 0, 1));
}

function actualizarMascotaHome(s) {
  const aspecto = escenaHome.camara.aspect;
  const angosto = aspecto < 1;
  const peso = suave(clamp((s - 0.4) / 1.2, 0, 1));
  const esquinaX = angosto ? -0.7 : -0.86;

  // Del centro a la esquina, y al final al espacio en blanco junto al texto
  const llegada = llegadaAlFinal();
  const hueco = angosto ? { x: 0.6, y: -0.7, escala: 0.5 } : { x: 0.6, y: -0.2, escala: 0.95 };

  escenaHome.mover(
    mezcla(mezcla(0, esquinaX, peso), hueco.x, llegada),
    mezcla(mezcla(-0.3, -0.7, peso), hueco.y, llegada),
    mezcla(mezcla(1.25, 0.55, peso), hueco.escala, llegada)
  );
  escenaHome.estado.monticulo = 1 - peso;
}

function animar(milisegundos) {
  const t = milisegundos / 1000;
  const dt = Math.min(0.05, t - tiempoPrevio);
  tiempoPrevio = t;

  scrollSuave += (window.scrollY / window.innerHeight - scrollSuave) * 0.08;

  // Las auroras de fondo se desplazan despacio con el scroll
  document.documentElement.style.setProperty("--aurora-y", scrollSuave.toFixed(3));

  actualizarMascotaHome(scrollSuave);
  actualizarPlanta(t, scrollSuave);
  escenaHome.actualizar(t, dt);
  escenaHome.render();

  requestAnimationFrame(animar);
}

window.addEventListener("resize", escenaHome.ajustar);
window.addEventListener("modelo-activado", () => escenaHome.saltito());

/* --- Texto, contadores y diálogos ---------------------------------------- */

$("#hero-title").innerHTML = "BARLEY BOT"
  .split("")
  .map(
    (letra, i) =>
      `<i aria-hidden="true" style="transition-delay: ${0.04 * i}s">${letra === " " ? "&nbsp;" : letra}</i>`
  )
  .join("");

const mejorReto = Math.max(...DATA.P.filter((p) => !p.p).map((p) => p.y));
$("#stat-reto").textContent = `Las mejores parcelas del reto llegan a ${Util.fmt(mejorReto, 1)} t/ha.`;

function contar(elemento) {
  const meta = Number(elemento.dataset.contar);
  const prefijo = elemento.dataset.prefijo || "";
  const sufijo = elemento.dataset.sufijo || "";
  const duracion = Paleta.movimientoReducido() ? 1 : 1600;
  const inicio = performance.now();

  const paso = (ahora) => {
    const k = clamp((ahora - inicio) / duracion, 0, 1);
    const valor = Math.round(meta * (1 - Math.pow(1 - k, 3)));

    elemento.textContent = prefijo + valor.toLocaleString("es-MX") + sufijo;
    if (k < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

const observarSecciones = new IntersectionObserver(
  (entradas) => {
    entradas.forEach((entrada) => {
      entrada.target.classList.toggle("in", entrada.isIntersecting);

      if (entrada.isIntersecting) {
        $$("[data-contar]", entrada.target).forEach((elemento) => {
          if (elemento.dataset.contado) return;
          elemento.dataset.contado = "1";
          contar(elemento);
        });
      }
    });
  },
  { threshold: 0.35 }
);

let temporizadorDialogo;
let listo = false;

const observarDialogo = new IntersectionObserver(
  (entradas) => {
    entradas.forEach((entrada) => {
      if (!entrada.isIntersecting || !listo) return;

      clearTimeout(temporizadorDialogo);
      temporizadorDialogo = setTimeout(() => Narrador.decir(entrada.target.dataset.say), 600);
    });
  },
  { threshold: 0.6 }
);

$$(".section").forEach((seccion) => {
  observarSecciones.observe(seccion);
  observarDialogo.observe(seccion);
});

/* --- Línea del tiempo horizontal ----------------------------------------- */

const tira = $("#historia-tira");
const desplazarTira = (direccion) => {
  const tarjeta = tira.querySelector(".hito");
  tira.scrollBy({ left: direccion * (tarjeta.offsetWidth + 16), behavior: "smooth" });
};

$("#hist-prev").addEventListener("click", () => desplazarTira(-1));
$("#hist-next").addEventListener("click", () => desplazarTira(1));

/* --- Carga --------------------------------------------------------------- */

function terminarCarga() {
  $("#loader").classList.add("done");
  document.body.classList.add("ready");
  $$(".section")[0].classList.add("in");
  listo = true;

  escenaHome.brotar(performance.now() / 1000 + 0.4);
  setTimeout(() => Narrador.decir($$(".section")[0].dataset.say), 2600);
}

let progresoCarga = 0;
const intervaloCarga = setInterval(() => {
  progresoCarga = Math.min(100, progresoCarga + 4);
  $("#loader-count").textContent = progresoCarga;

  if (progresoCarga >= 100) {
    clearInterval(intervaloCarga);
    terminarCarga();
  }
}, 45);

escenaHome.ajustar();
escenaHome.estado.monticulo = 1;
requestAnimationFrame(animar);
