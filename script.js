/*
  DEMO: scroll-scrubbing con frames extraidos de TUS videos
  -----------------------------------------------------------
  Cuatro secciones pineadas, cada una con su propio set de fotogramas:
  la intro (carpeta frames/intro) y los 3 videos (frames/v1, v2, v3).
  Todas se scrubean con el scroll igual: un ScrollTrigger por seccion
  calcula el progreso de 0 a 1 dentro de esa seccion, y con eso
  elegimos que imagen mostrar en el <canvas> de esa seccion.

  Como se preparó cada video (fuera de este archivo, con ffmpeg):
    ffmpeg -i video.mp4 -vf "scale=960:-2" -q:v 3 frames/vX/frame_%03d.jpg

  Todo es scroll puro: cada seccion pineada tiene su propia animacion
  de entrada (distinta por seccion), disparada una sola vez la primera
  vez que esa seccion entra en pantalla. Intercaladas van 3 secciones
  de "revista" (video real + texto) que se despliegan y repliegan como
  un cajon al pasar por su franja de scroll.

  Ademas: preloader con progreso real, nav fija con menu a pantalla
  completa, indicador de progreso lateral (dot-nav), cursor
  personalizado, titulos que se revelan palabra por palabra, botones
  magneticos y un CTA flotante + seccion de contacto.
*/

gsap.registerPlugin(ScrollTrigger);

// ---- Configuracion: intro + una entrada por seccion/video ----
const INTRO = { folder: 'intro', count: 241, prefix: 'frame_', pad: 4, ext: 'jpg' };
const SECTIONS = [
  { folder: 'v1', count: 121, prefix: 'frame_', pad: 3, ext: 'jpg' },
  { folder: 'v2', count: 121, prefix: 'frame_', pad: 3, ext: 'jpg' },
  { folder: 'v3', count: 121, prefix: 'frame_', pad: 3, ext: 'jpg' },
];
function framePath(section, i) {
  // los archivos estan numerados desde 1 (frame_001.jpg / frame_0001.jpg)
  const n = String(i + 1).padStart(section.pad, '0');
  return `frames/${section.folder}/${section.prefix}${n}.${section.ext}`;
}

// Dibuja recortando como object-fit:cover, en vez de estirar la imagen
// al tamaño del canvas. Los fotogramas de la intro son cuadrados
// (2160x2160) y el canvas es horizontal: sin este recorte salen
// deformados.
function drawCover(ctx, img, canvasW, canvasH) {
  const canvasRatio = canvasW / canvasH;
  const imgRatio = img.naturalWidth / img.naturalHeight;
  let sx, sy, sw, sh;
  if (imgRatio > canvasRatio) {
    sh = img.naturalHeight;
    sw = sh * canvasRatio;
    sx = (img.naturalWidth - sw) / 2;
    sy = 0;
  } else {
    sw = img.naturalWidth;
    sh = sw / canvasRatio;
    sx = 0;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvasW, canvasH);
}

/* ============================================================
   1) PRELOADER: cuenta cada fotograma/video cargado y muestra
   el % real hasta que todo esta listo.
   ============================================================ */
const AssetTracker = (() => {
  const TOTAL = INTRO.count + SECTIONS.reduce((n, s) => n + s.count, 0) + 4; // +4 videos (3 tarjetas + fondo de contacto)
  let loaded = 0;
  const bar = document.getElementById('preloader-bar');
  const count = document.getElementById('preloader-count');
  const pre = document.getElementById('preloader');
  let finished = false;

  function render() {
    const pct = Math.min(100, Math.round((loaded / TOTAL) * 100));
    if (bar) bar.style.width = pct + '%';
    if (count) count.textContent = pct + '%';
    if (pct >= 100) finish();
  }
  function finish() {
    if (finished) return;
    finished = true;
    if (pre) pre.classList.add('done');
    document.body.classList.add('loaded');
    ScrollTrigger.refresh();
  }
  function tick() {
    loaded++;
    render();
  }
  // seguro: si algo no dispara su evento de carga, no dejar la
  // pantalla de carga trabada para siempre.
  setTimeout(finish, 12000);
  return { tick, finish };
})();

/* ============================================================
   5) Reveal de texto: separa un heading en palabras envueltas
   (mascara + span) para poder animarlas con stagger.
   ============================================================ */
function splitWords(el) {
  if (!el || el.dataset.split) return el ? el.querySelectorAll('.word') : [];
  el.dataset.split = '1';
  const text = el.textContent;
  el.textContent = '';
  const words = text.split(' ');
  words.forEach((word, i) => {
    const wrap = document.createElement('span');
    wrap.className = 'word-wrap';
    const inner = document.createElement('span');
    inner.className = 'word';
    inner.textContent = word;
    wrap.appendChild(inner);
    el.appendChild(wrap);
    if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
  });
  return el.querySelectorAll('.word');
}

// ---- Velo de transicion entre secciones: se atenua a --bg en el
// ultimo tramo de cada seccion (tail) y se despeja en el primer tramo
// de la siguiente (head), asi el corte entre una seccion y la otra no
// se nota — en vez de un salto seco, queda un respiro leve (nunca
// opaco del todo). Es igual para TODAS las transiciones, sin video —
// el unico video del final es el propio fondo de Contacto
// (.contact-bg), que no depende de este velo.
const veilEl = document.querySelector('.transition-veil');
const veilMark = document.querySelector('.transition-veil-mark');
const VEIL_WINDOW_SUBTLE = 0.09;
const VEIL_SUBTLE_PEAK = 0.35;
function applyVeil(progress, skipHead) {
  const win = VEIL_WINDOW_SUBTLE;
  const head = !skipHead && progress < win ? 1 - progress / win : 0;
  const tail = progress > 1 - win ? (progress - (1 - win)) / win : 0;
  const v = Math.max(head, tail);
  veilEl.style.opacity = v * VEIL_SUBTLE_PEAK;
  if (veilMark) veilMark.style.opacity = 0;
}

// ---- Curvas de easing propias, aplicadas sobre un progreso "p" que
// ya de por si esta atado 1:1 al scroll. Aunque p nunca retrocede,
// una curva con overshoot (easeOutBack) SI puede pasarse de 1 y
// volver — eso es lo que da la sensacion de "rebote" al asentarse,
// como cuando un auto entra girando y se acomoda de golpe en un
// videojuego de carreras, sin depender de una animacion por tiempo.
function easeOutBack(t, s = 1.7) {
  const c3 = s + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
}
function easeOutExpo(t) {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

// Convierte un blur en px a un valor de "filter" — con 'none' en vez
// de "blur(0px)" cuando ya no hace falta. Esto importa: un filter
// activo (aunque sea blur(0px)) obliga al navegador a componer el
// canvas por una capa de filtro en vez de pintarlo directo, y eso se
// nota como perdida de nitidez incluso con blur en 0. Por eso se dejo
// completamente afuera del transform una vez que ya no suma nada.
function blurFilter(px) {
  return px > 0.4 ? `blur(${px.toFixed(1)}px)` : 'none';
}

// ---- Animaciones de entrada para las secciones pineadas (intro, 01, 02, 03).
// Cada entrada toma un progreso de entrada "p" (0 a 1, atado 1:1 al
// scroll — no es una animacion de tiempo fijo) y devuelve las
// propiedades de esa seccion. scaleEntrance se combina despues con el
// zoom continuo de la seccion en un solo gsap.set. Los autos entran
// girando (skew + rotation, 2D — nada de rotationY/perspectiva real:
// eso forzaba una capa 3D permanente en el canvas y le bajaba la
// nitidez incluso ya asentado) con motion blur que se aclara al
// entrar — tipo reveal de auto en juego de carreras, no una entrada
// recta y plana.
const ENTRANCE_WINDOW = 0.26; // fraccion del recorrido dedicada a la entrada: bien lenta y perceptible
const PIN_ENTRANCES = {
  intro: (p) => {
    const e = easeOutBack(p);
    return {
      opacity: Math.min(1, p * 1.4),
      scaleEntrance: 1.24 - 0.24 * e,
      rotation: (1 - e) * -8,
      filter: blurFilter((1 - easeOutExpo(p)) * 16),
    };
  },
  0: (p) => {
    // desliza de izquierda a derecha, con un giro que se pasa y vuelve
    const e = easeOutBack(p);
    return {
      opacity: Math.min(1, p * 1.4),
      xPercent: (1 - e) * -135,
      skewY: (1 - e) * 6,
      rotation: (1 - e) * -10,
      filter: blurFilter((1 - easeOutExpo(p)) * 22),
    };
  },
  1: (p) => {
    // simetrico al anterior, desde la derecha
    const e = easeOutBack(p);
    return {
      opacity: Math.min(1, p * 1.4),
      xPercent: (1 - e) * 135,
      skewY: (1 - e) * -6,
      rotation: (1 - e) * 10,
      filter: blurFilter((1 - easeOutExpo(p)) * 22),
    };
  },
  2: (p) => {
    const e = easeOutBack(p);
    return {
      opacity: p,
      clipPath: `circle(${p * 75}% at 50% 50%)`,
      webkitClipPath: `circle(${p * 75}% at 50% 50%)`,
      scaleEntrance: 1 + (1 - e) * 0.16,
      rotation: (1 - e) * 7,
      filter: blurFilter((1 - easeOutExpo(p)) * 12),
    };
  }, // iris/circulo que se abre + rebote
};

// Titulo grande de la intro: se separa en palabras una sola vez, al
// arrancar, y se revela junto con el resto de la entrada de la intro.
const introHeadingWords = splitWords(document.querySelector('.intro-heading h1'));
if (introHeadingWords.length) gsap.set(introHeadingWords, { yPercent: 110 });

// Registro de los canvas de cada seccion pineada (siempre muestran el
// fotograma actual, ya recortado tipo "cover"), para que las tarjetas
// de video puedan usarlos como fondo borroso de transicion — ver
// setupFeatureBackdrop mas abajo.
const sectionCanvasRegistry = {};

// ---- Motor comun: precarga, dibuja en el canvas y scrubea con ScrollTrigger.
function setupSection(pinWrapEl, sectionKey, section) {
  const canvas = pinWrapEl.querySelector('.frame-canvas');
  sectionCanvasRegistry[sectionKey] = canvas;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const progressFill = pinWrapEl.querySelector('.progress-fill');
  const caption = pinWrapEl.querySelector('.caption');
  const extras = pinWrapEl.querySelectorAll('.section-index, .progress-track, .data-chip');

  const images = new Array(section.count);
  let loaded = 0;
  let lastIndex = 0;

  function drawFrame(index) {
    lastIndex = index;
    const img = images[Math.max(0, Math.min(section.count - 1, index))];
    if (!img || !img.complete) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawCover(ctx, img, canvas.width, canvas.height);
  }

  // ---- Control hibrido drag + scroll: ademas de scrollear, se puede
  // arrastrar horizontalmente sobre el canvas para "girar" el auto a
  // mano, como en un configurador (Tesla/Porsche). El scroll sigue
  // siendo la fuente de verdad — el arrastre es un offset temporal
  // que se suelta y vuelve solo a la posicion que marca el scroll.
  let scrollFrame = 0;
  let dragOffset = 0;
  const dragState = { active: false, startX: 0, startOffset: 0 };
  const dragDecay = { v: 0 };
  const DRAG_SENSITIVITY = 4.5; // px por fotograma

  function renderCombined() {
    const idx = Math.round(scrollFrame + dragOffset);
    drawFrame(Math.max(0, Math.min(section.count - 1, idx)));
  }

  function onPointerDown(e) {
    dragState.active = true;
    dragState.startX = e.clientX;
    dragState.startOffset = dragOffset;
    gsap.killTweensOf(dragDecay);
    canvas.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e) {
    if (!dragState.active) return;
    const dx = e.clientX - dragState.startX;
    dragOffset = dragState.startOffset + dx / DRAG_SENSITIVITY;
    renderCombined();
  }
  function onPointerUp() {
    if (!dragState.active) return;
    dragState.active = false;
    dragDecay.v = dragOffset;
    gsap.to(dragDecay, {
      v: 0,
      duration: 0.6,
      ease: 'power2.out',
      onUpdate: () => {
        dragOffset = dragDecay.v;
        renderCombined();
      },
    });
  }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  // El buffer interno del canvas se ajusta al tamaño real en pantalla
  // (con devicePixelRatio, hasta 3x) en vez de quedar fijo en la
  // resolucion del archivo fuente — asi se ve nitido en pantallas
  // grandes/retina en vez de estirado y borroso.
  function sizeCanvas() {
    // En touch (celulares) el redibujado de cada fotograma compite
    // por el mismo hilo principal que procesa el gesto — bajamos el
    // tope de resolucion ahi para que cada drawImage sea mas liviano
    // y el scroll no se sienta trabado. En mouse/desktop se mantiene
    // nitido a 3x.
    const isCoarse = window.matchMedia('(pointer: coarse)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, isCoarse ? 2 : 3);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      drawFrame(lastIndex);
    }
  }
  window.addEventListener('resize', sizeCanvas);

  // El texto aparece entre 8% y 30% del recorrido de la seccion, y
  // se mantiene visible hasta el 85% donde empieza a desvanecerse.
  function applyCaption(progress) {
    if (!caption) return;
    let opacity;
    if (progress < 0.08) opacity = 0;
    else if (progress < 0.30) opacity = (progress - 0.08) / 0.22;
    else if (progress < 0.85) opacity = 1;
    else if (progress < 1.0) opacity = 1 - (progress - 0.85) / 0.15;
    else opacity = 0;
    caption.style.opacity = Math.max(0, Math.min(1, opacity));
    caption.style.transform = `translate(-50%, ${14 - opacity * 14}px)`;
  }

  const entranceFn = PIN_ENTRANCES[sectionKey];
  if (entranceFn) {
    const initial = entranceFn(0);
    const initialScale = initial.scaleEntrance || 1;
    delete initial.scaleEntrance;
    gsap.set(canvas, { ...initial, scale: initialScale, transformOrigin: '50% 50%' });
    if (extras.length) gsap.set(extras, { opacity: 0 });
    if (sectionKey === 'intro' && introHeadingWords.length) gsap.set(introHeadingWords, { yPercent: 110 });
  }

  function onReady() {
    sizeCanvas();
    drawFrame(0);

    ScrollTrigger.create({
      trigger: pinWrapEl,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.5, // pequeña inercia para que no se sienta 1:1 rigido
      onUpdate: (self) => {
        const progress = self.progress;
        scrollFrame = progress * (section.count - 1);
        renderCombined();
        if (progressFill) progressFill.style.height = `${progress * 100}%`;
        applyCaption(progress);
        applyVeil(progress, sectionKey === 'intro');

        // Entrada atada 100% al scroll: los primeros ENTRANCE_WINDOW
        // del recorrido de la seccion son la animacion de entrada
        // (deslizar / iris / fade), no una animacion de tiempo fijo —
        // va tan rapido o lento como vos scrolleas. Se combina en un
        // solo gsap.set con el zoom continuo de la seccion.
        const entranceP = Math.min(1, progress / ENTRANCE_WINDOW);
        if (entranceFn) {
          const props = entranceFn(entranceP);
          const scaleEntrance = props.scaleEntrance || 1;
          delete props.scaleEntrance;
          gsap.set(canvas, { ...props, scale: scaleEntrance * (1 + progress * 0.045) });
          if (extras.length) gsap.set(extras, { opacity: entranceP });
          if (sectionKey === 'intro' && introHeadingWords.length) {
            gsap.set(introHeadingWords, { yPercent: (1 - entranceP) * 110 });
          }
        } else {
          // Zoom sutil y continuo mientras se scrubea (ademas del
          // cambio de fotograma): disimula los saltos entre frames y
          // suma la sensacion de movimiento 3D tipo comercial de auto.
          gsap.set(canvas, { scale: 1 + progress * 0.045 });
        }
      },
    });
  }

  for (let i = 0; i < section.count; i++) {
    const img = new Image();
    img.onload = () => {
      loaded++;
      AssetTracker.tick();
      if (loaded === section.count) onReady();
    };
    img.onerror = img.onload;
    img.src = framePath(section, i);
    images[i] = img;
  }
}

// ---- Secciones nuevas intercaladas (video + texto): no son estaticas,
// se despliegan como un cajon al entrar en su franja de scroll, se
// mantienen abiertas un tramo, y se repliegan de nuevo antes de la
// siguiente seccion pineada — como una barra de tareas que aparece y
// se esconde. Cada una tiene su propio estilo de apertura/cierre segun
// data-anim.
//
// abre 0 -> 0.1, se mantiene abierta hasta 0.9, cierra 0.9 -> 1
// (ventana corta para que la tarjeta este visible la mayor parte del
// tramo, en vez de dejar mucho espacio "vacio" antes/despues)
const OPEN_WINDOW = 0.22; // el wrap ahora es mas alto (240vh), asi que aunque la fraccion baja un poco, en scroll real la entrada dura MAS que antes — y deja mucho mas tramo (56%) con la tarjeta bien abierta para leer
function openness(progress) {
  if (progress < OPEN_WINDOW) return progress / OPEN_WINDOW;
  if (progress < 1 - OPEN_WINDOW) return 1;
  if (progress < 1) return 1 - (progress - (1 - OPEN_WINDOW)) / OPEN_WINDOW;
  return 0;
}

// Quien es la seccion pineada anterior/siguiente de cada tarjeta de
// video, para saber que fotograma usar de fondo borroso al abrir/
// cerrar. El orden real de la pagina es fijo (no generico), asi que
// esto va hardcodeado.
const FEATURE_NEIGHBORS = {
  precision: { prev: 'intro', next: 0 },
  tecnologia: { prev: 0, next: 1 },
  garantia: { prev: 1, next: 2 },
};

// ---- Fondo de transicion de cada tarjeta de video: mientras la
// tarjeta se abre, dibuja (bien borroso y oscurecido) el fotograma
// actual de la seccion pineada anterior; mientras se cierra, adelanta
// el de la siguiente. Reutiliza el canvas de esa seccion como fuente
// (ya viene recortado tipo "cover"), asi que no hay que duplicar
// nada — solo estirarlo, difuminarlo y variar su opacidad segun el
// mismo progreso de apertura/cierre que ya mueve la tarjeta.
function setupFeatureBackdrop(wrapEl) {
  const stage = wrapEl.querySelector('.feature-stage');
  const backdrop = stage ? stage.querySelector('.feature-backdrop') : null;
  const neighbors = FEATURE_NEIGHBORS[wrapEl.id];
  if (!backdrop || !neighbors) return null;
  const ctx = backdrop.getContext('2d');

  // El blur/oscurecido se aplica UNA sola vez por CSS (lo compone la
  // GPU) en vez de con ctx.filter en cada dibujo. ctx.filter con blur
  // es carisimo de recalcular por software en el canvas 2D — sobre
  // todo en celulares — y era lo que hacia que el scroll por touch se
  // sintiera trabado/lento. Asi el canvas dibuja la imagen nitida y
  // el desenfoque queda del lado barato (compositor).
  backdrop.style.filter = 'blur(24px) brightness(0.8) saturate(1.25)';

  function sizeBackdrop() {
    const isCoarse = window.matchMedia('(pointer: coarse)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, isCoarse ? 1.5 : 2); // el blur tapa cualquier perdida de nitidez
    const rect = stage.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (backdrop.width !== w || backdrop.height !== h) {
      backdrop.width = w;
      backdrop.height = h;
    }
  }
  sizeBackdrop();
  window.addEventListener('resize', sizeBackdrop);

  function drawSource(source, alpha) {
    if (!source || alpha <= 0.01) return;
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(source, 0, 0, backdrop.width, backdrop.height);
    ctx.globalAlpha = 1;
  }

  return function updateBackdrop(progress) {
    ctx.clearRect(0, 0, backdrop.width, backdrop.height);
    if (progress < OPEN_WINDOW) {
      // abriendo: se desvanece del fotograma de la seccion anterior
      const t = 1 - progress / OPEN_WINDOW;
      drawSource(sectionCanvasRegistry[neighbors.prev], t);
    } else if (progress > 1 - OPEN_WINDOW) {
      // cerrando: empieza a insinuar el fotograma de la siguiente
      const t = (progress - (1 - OPEN_WINDOW)) / OPEN_WINDOW;
      drawSource(sectionCanvasRegistry[neighbors.next], t);
    }
  };
}

function setupFeatureAccordion(wrapEl) {
  const updateBackdrop = setupFeatureBackdrop(wrapEl);
  const card = wrapEl.querySelector('.feature');
  const media = card.querySelector('.feature-media');
  const textCol = card.querySelector('.feature-text');
  const video = card.querySelector('video');
  const style = card.dataset.anim;
  const heading = card.querySelector('.feature-text h2');
  const words = splitWords(heading);
  if (words.length) gsap.set(words, { yPercent: 100 });

  // Fallback por si el autoplay del navegador no dispara solo con el
  // atributo (pasa en algunos navegadores/entornos aunque este
  // muted+playsinline, que es lo que en teoria alcanza).
  if (video) {
    const tryPlay = () => video.play().catch(() => {});
    tryPlay();
    video.addEventListener('loadeddata', () => { tryPlay(); AssetTracker.tick(); }, { once: true });
    video.addEventListener('error', () => AssetTracker.tick(), { once: true });
  }

  gsap.set(card, { transformOrigin: '50% 0%' });

  ScrollTrigger.create({
    trigger: wrapEl,
    start: 'top top',
    end: 'bottom bottom',
    scrub: 0.9, // mas inercia que las secciones de auto: se siente mas pesada/suave, no 1:1 rigida
    onUpdate: (self) => {
      const o = Math.max(0, Math.min(1, openness(self.progress)));

      // Apertura/cierre general de la tarjeta: se despliega de arriba
      // hacia abajo con clip-path (no se escala/deforma el contenido,
      // se va REVELANDO mas a medida que "crece"), como el menu que
      // se despliega al hacer click en el logo de Apple en macOS. Se
      // repliega de la misma forma al cerrar (el borde de abajo
      // retrocede hacia arriba). Un rebote MUY leve (easeOutBack con
      // overshoot bajo, 0.85 en vez del 1.7 que usan los autos) le da
      // un asentado elegante y suave, no un "boing" de videojuego —
      // el bloque de scroll de la seccion tambien es mas alto ahora
      // (240vh) asi que todo esto pasa mas lento y da tiempo a leer.
      const openE = easeOutBack(o, 0.85);
      const hiddenBottom = Math.max(0, (1 - openE)) * 100;
      const clipOuter = `inset(0% 0 ${hiddenBottom}% 0)`;
      gsap.set(card, { clipPath: clipOuter, webkitClipPath: clipOuter, opacity: Math.min(1, o + 0.2) });

      // Adentro del cajon, el video y el texto entran por separado
      // (no pegados como un solo bloque) y con un leve desfase entre
      // ellos — el texto arranca un poco despues y alcanza al video,
      // asi se siente una aparicion elegante en vez de un solo golpe.
      // Todo esto sigue atado 100% al scroll (mismo valor "o").
      const mediaP = o;
      const textP = Math.max(0, Math.min(1, (o - 0.3) / 0.7));
      const mediaE = easeOutBack(mediaP, 0.85);

      if (style === 'wipe') {
        // el video entra como una cortina que se abre de lado, con un
        // leve giro y rebote vertical al terminar de abrirse
        const clip = `inset(0 ${(1 - mediaP) * 100}% 0 0)`;
        gsap.set(media, { clipPath: clip, webkitClipPath: clip, rotation: (1 - mediaE) * -4, y: (1 - mediaE) * 26 });
        // el texto entra deslizando desde el costado, por separado
        gsap.set(textCol, { opacity: textP, x: (1 - textP) * -70 });
      } else if (style === 'scale') {
        // el video entra con zoom + un giro que se pasa un poco y vuelve
        gsap.set(media, { scale: 0.76 + 0.24 * mediaE, opacity: mediaP, rotation: (1 - mediaE) * 6 });
        // el texto sube con fade, distinto al zoom del video
        gsap.set(textCol, { opacity: textP, y: (1 - textP) * 45 });
      } else {
        // 'rise': el video sube desde abajo con rebote (se pasa un
        // poco del punto final y vuelve a acomodarse) y un tambaleo
        gsap.set(media, { opacity: mediaP, y: (1 - mediaE) * 95, rotation: (1 - mediaE) * -7 });
        // el texto tambien sube, con su propio ritmo
        gsap.set(textCol, { opacity: textP, y: (1 - textP) * 50 });
      }

      if (words.length) gsap.set(words, { yPercent: (1 - textP) * 100 });
      applyVeil(self.progress, false);
      if (updateBackdrop) updateBackdrop(self.progress);
    },
  });
}

/* ============================================================
   Scroll suave compartido (menu, dot-nav, CTA, botones de
   contacto): anima con GSAP en vez de scrollTo({behavior:'smooth'})
   porque el scroll suave nativo puede quedar deshabilitado segun el
   navegador/SO (p.ej. "reducir movimiento") y ahi no hace nada.
   ============================================================ */
function scrollToTarget(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (lenisInstance) {
    lenisInstance.scrollTo(el, { duration: 1.2, easing: (t) => 1 - Math.pow(1 - t, 3) });
    return;
  }
  const proxy = { y: window.scrollY };
  gsap.to(proxy, {
    y: el.offsetTop,
    duration: 1.1,
    ease: 'power2.inOut',
    onUpdate: () => window.scrollTo(0, proxy.y),
  });
}

/* ============================================================
   Smooth scroll obligatorio (Lenis): reemplaza los saltos bruscos
   del scroll nativo del sistema operativo por una inercia suave y
   controlada, para que el recorrido se sienta como una pelicula.
   Se conecta al ticker de GSAP y a ScrollTrigger para que el scrub
   y todas las animaciones de entrada sigan funcionando igual.
   ============================================================ */
let lenisInstance = null;
function setupLenis() {
  if (typeof Lenis === 'undefined') return; // si no cargo la libreria, sigue el scroll nativo
  lenisInstance = new Lenis({
    duration: 1.7, // mas inercia: el sitio tarda mas en "alcanzar" el scroll real
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // desaceleracion exponencial suave
    smoothWheel: true,
    wheelMultiplier: 0.65, // por mas fuerte que se scrollee, avanza a ritmo moderado
    touchMultiplier: 0.85,
  });
  lenisInstance.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenisInstance.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

/* ============================================================
   2) NAV + MENU A PANTALLA COMPLETA
   ============================================================ */
function setupNav() {
  const toggle = document.getElementById('nav-toggle');
  const overlay = document.getElementById('nav-overlay');
  const links = document.querySelectorAll('#nav-links a');
  let open = false;
  gsap.set(links, { yPercent: 110, opacity: 0 });

  function setOpen(next) {
    open = next;
    toggle.classList.toggle('open', open);
    overlay.classList.toggle('open', open);
    toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    if (open) {
      gsap.to(links, { yPercent: 0, opacity: 1, duration: 0.7, ease: 'power3.out', stagger: 0.045, delay: 0.15, overwrite: true });
    } else {
      gsap.to(links, { opacity: 0, duration: 0.2, overwrite: true, onComplete: () => gsap.set(links, { yPercent: 110 }) });
    }
  }

  toggle.addEventListener('click', () => setOpen(!open));
  links.forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      setOpen(false);
      scrollToTarget(a.dataset.target);
    });
  });
}

/* ============================================================
   3) DOT-NAV: indicador de progreso lateral + navegacion directa
   ============================================================ */
function setupDotNav() {
  const buttons = Array.from(document.querySelectorAll('#dot-nav button'));
  const targets = buttons
    .map((btn) => ({ btn, el: document.getElementById(btn.dataset.target) }))
    .filter((t) => t.el);

  targets.forEach((t) => {
    t.btn.addEventListener('click', () => scrollToTarget(t.btn.dataset.target));
  });

  function updateActive() {
    const y = window.scrollY + window.innerHeight * 0.4;
    let current = targets[0];
    targets.forEach((t) => {
      if (t.el.offsetTop <= y) current = t;
    });
    targets.forEach((t) => t.btn.classList.toggle('active', t === current));
  }
  window.addEventListener('scroll', updateActive, { passive: true });
  window.addEventListener('resize', updateActive);
  updateActive();
}

/* ============================================================
   Enlaces genericos con data-target (CTA flotante, botones de
   contacto): mismo scroll suave que el menu y el dot-nav.
   ============================================================ */
function setupSmoothLinks() {
  document.querySelectorAll('[data-target]').forEach((el) => {
    if (el.closest('#nav-links') || el.closest('#dot-nav')) return; // ya tienen su propio handler
    el.addEventListener('click', (e) => {
      e.preventDefault();
      scrollToTarget(el.dataset.target);
    });
  });
}

/* ============================================================
   4) CURSOR PERSONALIZADO (solo con mouse real, no touch)
   ============================================================ */
function setupCursor() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const dot = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');
  if (!dot || !ring) return;
  document.body.classList.add('has-custom-cursor');

  let mx = window.innerWidth / 2;
  let my = window.innerHeight / 2;
  let rx = mx;
  let ry = my;
  let ready = false;

  document.addEventListener('mousemove', (e) => {
    mx = e.clientX;
    my = e.clientY;
    dot.style.transform = `translate(${mx}px, ${my}px)`;
    if (!ready) {
      ready = true;
      document.body.classList.add('cursor-ready');
      rx = mx;
      ry = my;
    }
  });

  gsap.ticker.add(() => {
    rx += (mx - rx) * 0.18;
    ry += (my - ry) * 0.18;
    ring.style.transform = `translate(${rx}px, ${ry}px)`;
  });

  document.querySelectorAll('.feature-media, a, button').forEach((el) => {
    el.addEventListener('mouseenter', () => ring.classList.add('hovering'));
    el.addEventListener('mouseleave', () => ring.classList.remove('hovering'));
  });

  // En las secciones de fotogramas, el cursor avisa que se puede
  // arrastrar (control hibrido drag + scroll).
  document.querySelectorAll('.pin-stage canvas').forEach((el) => {
    el.addEventListener('mouseenter', () => ring.classList.add('hovering', 'drag-hint'));
    el.addEventListener('mouseleave', () => ring.classList.remove('hovering', 'drag-hint'));
  });
}

/* ============================================================
   Tilt 3D en las tarjetas de video: la tarjeta se inclina
   levemente siguiendo al cursor, tipo paginas de producto Apple.
   ============================================================ */
function setupTilt() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  document.querySelectorAll('.feature-media').forEach((el) => {
    const maxTilt = 9; // grados
    const qx = gsap.quickTo(el, 'rotationX', { duration: 0.45, ease: 'power2.out' });
    const qy = gsap.quickTo(el, 'rotationY', { duration: 0.45, ease: 'power2.out' });
    const qs = gsap.quickTo(el, 'scale', { duration: 0.45, ease: 'power2.out' });
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      qy(px * maxTilt * 2);
      qx(-py * maxTilt * 2);
      qs(1.02);
    });
    el.addEventListener('mouseleave', () => {
      qx(0);
      qy(0);
      qs(1);
    });
  });
}

/* ============================================================
   6) BOTONES MAGNETICOS: se atraen levemente hacia el cursor
   ============================================================ */
function setupMagnetic() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  document.querySelectorAll('.magnetic').forEach((el) => {
    const strength = 0.32;
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width / 2) * strength;
      const y = (e.clientY - r.top - r.height / 2) * strength;
      gsap.to(el, { x, y, duration: 0.3, ease: 'power2.out' });
    });
    el.addEventListener('mouseleave', () => {
      gsap.to(el, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.4)' });
    });
  });
}

/* ============================================================
   Seccion de contacto (final, no pineada): reveal simple al
   entrar en pantalla, con su titulo tambien palabra por palabra.
   ============================================================ */
function setupContactReveal() {
  const section = document.getElementById('contacto');
  if (!section) return;

  // Video de fondo: igual que en las tarjetas, se intenta reproducir
  // apenas esta listo (no solo al entrar en pantalla — ese trigger
  // por si solo no era confiable).
  const bgVideo = section.querySelector('.contact-bg');
  if (bgVideo) {
    const tryPlay = () => bgVideo.play().catch(() => {});
    tryPlay();
    ScrollTrigger.create({
      trigger: section,
      start: 'top 90%',
      once: true,
      onEnter: tryPlay,
    });
    bgVideo.addEventListener('loadeddata', () => { tryPlay(); AssetTracker.tick(); }, { once: true });
    bgVideo.addEventListener('canplay', tryPlay, { once: true });
    bgVideo.addEventListener('error', () => AssetTracker.tick(), { once: true });
  }

  const heading = section.querySelector('h2');
  const words = splitWords(heading);
  const rest = section.querySelectorAll('.eyebrow, p:not(.eyebrow), .stats-row, .contact-actions');
  if (words.length) gsap.set(words, { yPercent: 100 });
  gsap.set(rest, { opacity: 0, y: 18 });

  // Arranca justo en 'top top': exactamente donde termina de bajar el
  // velo final (ver setupFinaleVeilBridge) — asi el texto no se mezcla
  // con el video mientras todavia se esta despejando.
  ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    once: true,
    onEnter: () => {
      if (words.length) gsap.to(words, { yPercent: 0, duration: 0.8, ease: 'power3.out', stagger: 0.03 });
      gsap.to(rest, { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out', stagger: 0.08, delay: 0.15 });
    },
  });
}

/* ============================================================
   Contadores animados (500+ autos entregados, etc): cuentan
   hacia arriba una sola vez, al entrar en pantalla.
   ============================================================ */
function setupCounters() {
  document.querySelectorAll('.stat-num').forEach((el) => {
    const target = parseFloat(el.dataset.count || '0');
    const suffix = el.dataset.suffix || '';
    const obj = { v: 0 };
    ScrollTrigger.create({
      trigger: el,
      start: 'top 90%',
      once: true,
      onEnter: () => {
        gsap.to(obj, {
          v: target,
          duration: 1.6,
          ease: 'power2.out',
          delay: 0.3,
          onUpdate: () => {
            el.textContent = Math.round(obj.v) + suffix;
          },
        });
      },
    });
  });
}

// ---- Puente del velo hacia Contacto ----
// Entre el final del scrub de "garantia" y el momento en que
// "contacto" queda realmente en su lugar hay un tramo muerto de
// scroll (una pantalla completa) donde ningun ScrollTrigger de
// seccion actualiza el velo — se quedaba congelado, tapando todo.
// Este trigger cubre exactamente ese tramo y termina de bajar el
// mismo respiro sutil (sin video) justo cuando Contacto llega.
function setupFinaleVeilBridge() {
  const contacto = document.getElementById('contacto');
  if (!contacto) return;
  ScrollTrigger.create({
    trigger: contacto,
    start: 'top bottom',
    end: 'top top',
    scrub: 0.3,
    onUpdate: (self) => {
      veilEl.style.opacity = (1 - self.progress) * VEIL_SUBTLE_PEAK;
    },
  });
}

// ---- arranque ----
setupLenis();
setupSection(document.querySelector('.pin-wrap[data-section="intro"]'), 'intro', INTRO);
document.querySelectorAll('.pin-wrap[data-section]').forEach((el) => {
  const idx = el.dataset.section;
  if (idx === 'intro') return;
  setupSection(el, parseInt(idx, 10), SECTIONS[parseInt(idx, 10)]);
});
document.querySelectorAll('.feature-wrap').forEach(setupFeatureAccordion);

setupNav();
setupDotNav();
setupSmoothLinks();
setupCursor();
setupMagnetic();
setupTilt();
setupContactReveal();
setupCounters();
setupFinaleVeilBridge();
