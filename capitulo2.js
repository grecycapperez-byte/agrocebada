"use strict";

/*
 * Capítulo 2 del storytime: justifica el modelo y lo activa.
 * Todo se calcula en el navegador con los datos reales de data.js.
 * Al activarlo se guarda en la sesión que el modelo ya corrió, así que el
 * mapa muestra directamente las predicciones.
 */

(() => {
  const zonaJustificacion = $("#modelo-justificacion");
  if (!zonaJustificacion) return;

  const conocidas = Modelo.conocidas(DATA.P);
  const porPredecir = DATA.P.filter((p) => p.p);
  const rendimientos = conocidas.map((p) => p.y);
  const media = Modelo.promedio(rendimientos);
  const desviacion = Modelo.desviacion(rendimientos, media);
  const variables = Modelo.CARACTERISTICAS.length;

  zonaJustificacion.innerHTML = `
    <p>
      Antes de abrir el mapa, esto es lo que nos llevó a elegir una regresión <b>ridge</b>
      con los índices de satélite que acabas de ver:
    </p>
    <ul class="justificacion">
      <li><b>Hay mucho que explicar.</b> Entre las ${conocidas.length} parcelas con rendimiento conocido
          el promedio es ${Util.fmt(media, 2)} t/ha, con una desviación de ±${Util.fmt(desviacion, 2)}
          (de ${Util.fmt(Math.min(...rendimientos), 1)} a ${Util.fmt(Math.max(...rendimientos), 1)} t/ha).</li>
      <li><b>El satélite ve todas las parcelas,</b> cada semana y sin visitarlas una por una.</li>
      <li><b>Pocos datos y variables parecidas.</b> Con ${conocidas.length} parcelas y ${variables} variables
          muy relacionadas entre sí (como NDVI, EVI y LAI), un modelo complejo memorizaría el ruido.
          Ridge «frena» los coeficientes.</li>
      <li><b>Se puede explicar.</b> Cada coeficiente dice cuánto pesa una variable.</li>
    </ul>`;

  const PASOS = [
    ["Series limpias", `${DATA.P.length} parcelas × 52 semanas × 5 índices`],
    ["Variables", `${variables} promedios de ventanas del ciclo`],
    ["Ajuste", `ridge con ${conocidas.length} parcelas conocidas`],
    ["Validación", "70/30 y dejando una parcela fuera"],
    ["Predicción", `${porPredecir.length} parcelas pendientes`],
  ];

  const lista = $("#modelo-pasos");
  lista.innerHTML = PASOS.map(([nombre, detalle]) => `<li><b>${nombre}</b>${detalle}</li>`).join("");

  const boton = $("#activar-modelo");
  const resultados = $("#modelo-resultados");
  const fmt = Util.fmt;

  function marcarPaso(indice) {
    $$("li", lista).forEach((li, i) => {
      li.classList.toggle("hecho", i < indice);
      li.classList.toggle("actual", i === indice);
    });
  }

  function mostrarResultados() {
    const lambda = Modelo.LAMBDA_INICIAL;
    const particion = Modelo.evaluarParticion(DATA.P, lambda, 11).metricas;
    const cruzada = Modelo.validacionCruzada(DATA.P, lambda);
    const final = Modelo.entrenarFinal(DATA.P, lambda);
    const predicciones = porPredecir.map((p) => Modelo.predecir(final, p));

    const pesos = Modelo.CARACTERISTICAS.map((c, j) => ({ nombre: c.nombre, peso: final.coef[j] }))
      .sort((a, b) => Math.abs(b.peso) - Math.abs(a.peso))
      .slice(0, 3);

    const filasPesos = pesos
      .map((p) => `<li><b>${p.nombre}</b>: ${p.peso >= 0 ? "+" : "−"}${fmt(Math.abs(p.peso), 2)} t/ha por desviación</li>`)
      .join("");

    Almacen.sesion("bb-modelo", "1");
    window.dispatchEvent(new CustomEvent("modelo-activado"));

    resultados.innerHTML = `
      <div class="metricas">
        <div class="metrica"><b>${fmt(particion.r2, 2)}</b><small>R² en ${particion.n} parcelas de prueba</small></div>
        <div class="metrica"><b>${fmt(particion.rmse, 2)}</b><small>RMSE de prueba (t/ha)</small></div>
        <div class="metrica"><b>${fmt(cruzada.r2, 2)}</b><small>R² con validación cruzada</small></div>
        <div class="metrica"><b>${fmt(Modelo.promedio(predicciones), 1)}</b><small>t/ha promedio predicho</small></div>
      </div>
      <p>
        <b>Lo que obtuvimos.</b> Las ${porPredecir.length} parcelas pendientes quedan entre
        ${fmt(Math.min(...predicciones), 1)} y ${fmt(Math.max(...predicciones), 1)} t/ha. Las variables
        que más pesan:
      </p>
      <ul class="justificacion">${filasPesos}</ul>
      <p class="aviso">
        Lectura honesta: el modelo explica una parte del rendimiento, no todo. Se equivoca ±${fmt(cruzada.rmse, 1)}
        t/ha en promedio, frente a una variación natural de ±${fmt(desviacion, 1)}. Es una línea base.
      </p>`;

    Narrador.decir(
      `Modelo activado. Explica cerca de ${Math.round(Math.max(0, cruzada.r2) * 100)}% de la variación en validación cruzada y ya dejó listas las ${porPredecir.length} predicciones. Sigue al mapa para verlas.`
    );
  }

  boton.addEventListener("click", async () => {
    const pausa = Paleta.movimientoReducido() ? 20 : 700;

    boton.disabled = true;
    resultados.innerHTML = "";

    for (let i = 0; i < PASOS.length; i++) {
      marcarPaso(i);
      await Util.esperar(pausa);
    }
    marcarPaso(PASOS.length);

    mostrarResultados();
    boton.disabled = false;
    boton.textContent = "↻ Activar de nuevo";
  });

  // Si ya se corrió en esta sesión, los pasos aparecen completos
  if (Almacen.sesion("bb-modelo") === "1") marcarPaso(PASOS.length);
})();
