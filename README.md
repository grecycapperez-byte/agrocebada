# Barley Bot · FIRA 2026 (Reto AgroCebada)

Experiencia web para contar la historia de la cebada y predecir el rendimiento de 197 parcelas
de Puebla, Tlaxcala e Hidalgo. Es HTML, CSS y JavaScript sin compilar: Three.js r128 se carga
desde cdnjs y las fuentes desde Google Fonts, así que se necesita internet.

## Cómo abrirlo

1. Descomprime la carpeta.
2. Abre `index.html` en el navegador (o sirve la carpeta: `python -m http.server`).

## Páginas

| Página | Qué hace |
| --- | --- |
| `index.html` | Storytime. **Capítulo 1:** historia, números, espiga (los granos caen al suelo y se quedan), línea del tiempo, usos y factores de crecimiento. **Capítulo 2:** por qué este modelo y botón para activarlo. Al final, la mascota se coloca en el espacio en blanco de «Tu turno». |
| `mapa.html` | Contexto de la parcela → mapa de México (arrastrable y con zoom libre) → salto de la mascota → campo con parcelas. Sin scroll. |
| `modelo.html` | Línea del tiempo de 6 pasos con botones «Anterior / Siguiente» y botón **Iniciar modelo**. |
| `glosario.html` | Términos de variables, datos y modelo, con buscador. |
| `referencias.html` | Fuentes de cada cifra. |

Menú desplegable (en todas): Glosario, Referencias, Tema (automático / claro / oscuro),
Accesibilidad (daltonismo) y «Reducir movimiento».

## Storytime

- **Cursor:** una semilla de cebada en 2D con contorno oscuro y halo claro; crece sobre botones,
  enlaces y estados del mapa.
- **Auroras:** cuatro manchas de color difuminadas, con movimiento lento y opacidad baja, que se
  desplazan un poco con el scroll (`#aurora`). Se detienen con «Reducir movimiento».
- **Espiga:** los granos se desprenden de arriba hacia abajo, caen con gravedad y rebote, y quedan
  tirados de lado en el suelo (`crearPlanta` en `mascota.js`).
- **Usos:** título «05 · Destinos» y tres filas unidas por un hilo, con el rango de rendimiento.
- **Factores (`factores.js`):** una parcela real por estado (la conocida más cercana a la mediana
  de su estado). Una planta crece con los índices de 2025, las curvas se dibujan con la semana y
  cuatro tarjetas explican por qué se relacionan las variables, con la correlación calculada con
  esa parcela. Si una relación sale débil o inversa, la tarjeta lo dice.
- **Capítulo 2 (`capitulo2.js`):** justificación con cifras reales y botón «Activar el modelo».
  Al activarlo se corre el modelo, se muestran R², RMSE, validación cruzada, rango de las
  predicciones y las variables que más pesan, y se guarda en la sesión que el modelo ya corrió.

## Flujo del mapa

1. **Contexto:** la primera mascota explica qué es una parcela con cifras reales.
2. **Mapa:** México más grande, con los 32 estados. Se arrastra para moverlo, se hace zoom con la
   rueda, el pellizco, las teclas `+` / `−` o los botones de la izquierda (⌂ restablece la vista).
   Al acercarse aparecen los nombres de los estados. Se elige Puebla, Tlaxcala o Hidalgo en la
   lista o tocando el estado sobre el mapa.
3. **Viaje:** se resalta el estado, la cebada cuenta un dato suyo, salta girando y se encoge a la
   escala del estado. Entra sola al campo (hay botón «Entrar ya»).
4. **Campo:** la mascota cuenta cómo creció la cebada con la barra de semanas oculta. Mientras
   tanto aparece el botón **«Saltar explicación»** (también con `Esc`).
5. **Parcelas:** clic (o flechas ← →) para seleccionar. Las **rayadas** son las que hay que
   predecir. Las acciones (cambiar estado, vista general, ver cómo creció, predecir todas) están
   en un **menú lateral** de alto contraste que se puede ocultar con «◂ Ocultar menú».
6. **Cosecha:** «¿A dónde va mi cosecha?» anima el viaje del grano según el rendimiento
   (≥ 4.5 t/ha → maltería; 3.5–4.5 → alimento y harinas; < 3.5 → forraje). Es una regla didáctica.

## El modelo (`modelo-core.js`)

Regresión **ridge** sobre 7 variables: promedios de NDVI, EVI, LAI, FAPAR y DSWI en ventanas
del ciclo (semanas 15–25, 31–41, 42–52). Se entrena solo con las 138 parcelas de rendimiento
conocido. Todo se calcula en el navegador a partir de `data.js`.

Resultados con los datos actuales (λ = 3):

- Partición 70/30: R² ≈ 0.42, RMSE ≈ 0.58 t/ha.
- Validación cruzada dejando una fuera: R² ≈ 0.35, RMSE ≈ 0.69 t/ha (la desviación natural es 0.85).

Es una **línea base**. Las ventanas se eligieron explorando las mismas parcelas conocidas, así que
estos números pueden salir algo optimistas.

## Qué es real y qué es simulado

- **Real:** 197 polígonos (IDs), áreas, rendimientos de entrenamiento, curvas semanales de NDVI,
  EVI, LAI (Planet), FAPAR y DSWI (Sentinel-2) de 2025, nubosidad.
- **Simulado:** clima semanal (Tmín, amplitud, GDD), tipo de suelo, eventos de estrés, y la
  ilustración «datos crudos» del paso de limpieza.
- **Ilustrativo:** la posición de las parcelas en el campo (los CSV no traen coordenadas).

## Mapa de México

`estados.js` define los 32 estados con **tramos de frontera compartidos** (`CADENAS`): dos vecinos
usan exactamente los mismos puntos, así que no se empalman ni dejan huecos. Los estados costeros
se extienden un poco al mar y se recortan con `CONTORNO_MEXICO`. En `mapa.js`, `dibujarTexturaMexico`
pinta los estados en una textura de 4096 × 2048 que se pega sobre la esfera (relleno, fronteras y
costa nítidos a cualquier zoom).

Las fronteras están **dibujadas a mano y son aproximadas**. Para fronteras exactas, reemplaza
`ESTADOS_MEXICO[].anillo` por coordenadas `[lon, lat]` de un GeoJSON de INEGI o Natural Earth
(el resto del código no cambia).

## Accesibilidad

- Temas claro, oscuro y automático.
- Daltonismo: protanopia, deuteranopia y tritanopia. Las parcelas por predecir llevan además un
  **rayado**, para no depender solo del color.
- Enlace «Saltar al contenido», foco visible, texto del narrador también para lectores de
  pantalla, parcelas navegables con ← →, y «Reducir movimiento» (también respeta la preferencia
  del sistema).
- Las preferencias se guardan en el navegador.

## Archivos

```
index.html  mapa.html  modelo.html  glosario.html  referencias.html
styles.css           estilos compartidos
common.js            utilidades, temas, daltonismo, menú, cursor de semilla
mascota.js           grano de cebada 3D, planta con espiga, narrador
home.js              storytelling (scroll, auroras, mascota)
factores.js          animación de factores de la parcela (storytime)
capitulo2.js         justificación y activación del modelo (storytime)
mapa.js              globo, estados, zoom, campo, parcelas, predicción, cosecha
estados.js           contorno de México y los 32 estados (fronteras compartidas)
modelo-core.js       regresión ridge y métricas (sin dependencias)
modelo.js            línea del tiempo del modelo
data.js              datos (generado por prep_data.py)
paises.js            contornos para el globo
prep_data.py         genera data.js a partir de los CSV del reto
```

## Regenerar los datos

```
pip install pandas numpy
python prep_data.py carpeta_con_los_csv
```

## Cifras de contexto

Las cifras del storytelling (4.º cereal, +900 mil t, +25 mil familias, 2.6 t/ha, participación
de estados en 2011, Hidalgo mayor productor desde 2023) están en `referencias.html`. Revísalas
antes de citarlas: algunas son de años distintos.
