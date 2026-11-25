// Une el emulador, los servos, el teclado, el editor y la mano 3D.
import { DEDOS, TECLADO, pinArduino, nombrePin, flexion, fueraDeRango } from './config.js';
import { EmuladorAVR, FRECUENCIA } from './avr.js';
import { LectorServos, moverServo } from './servos.js';
import { TecladoMatricial } from './teclado.js';
import { Mano3D } from './mano3d.js';

const $ = (s) => document.querySelector(s);

// Estado de cada dedo. "actual" empieza en abierto: es la posición física del eje.
const dedos = DEDOS.map((d) => ({ ...d, ...pinArduino(d.pin), objetivo: null, actual: d.abierto }));
const filas = TECLADO.filas.map(pinArduino);
const columnas = TECLADO.columnas.map(pinArduino);

const mano = new Mano3D($('#vista3d'), dedos);

let emu = null;
let teclado = null;
let ultimoHex = null;
let pausado = false;
let compilando = false;
let velocidad = 1;
let ultimaTecla = '—';
let textoSerie = '';
let serieCambio = false;
let codigoCargado = '';

// ---------- Editor ----------
const editor = CodeMirror.fromTextArea($('#codigo'), {
  mode: 'text/x-c++src',
  lineNumbers: true,
  indentUnit: 2,
  tabSize: 2,
  extraKeys: { 'Cmd-Enter': () => compilar(), 'Ctrl-Enter': () => compilar() },
});

const hayCambios = () => editor.getValue() !== codigoCargado;

// ---------- Mensajes ----------
function estado(texto, tipo = '') {
  const chip = $('#estado');
  chip.textContent = texto;
  chip.className = `chip ${tipo}`;
}

function escribirLog(texto, tipo = '') {
  const log = $('#log');
  log.textContent = texto;
  log.className = `consola ${tipo}`;
}

function mostrarPestana(nombre) {
  for (const b of document.querySelectorAll('.pestanas button')) {
    b.classList.toggle('activa', b.dataset.tab === nombre);
  }
  $('#log').hidden = nombre !== 'log';
  $('#serie').hidden = nombre !== 'serie';
}

// ---------- Servidor ----------
async function cargarArchivo() {
  const nombre = $('#sketch').value;
  const r = await fetch(`/api/sketch?nombre=${encodeURIComponent(nombre)}`);
  if (!r.ok) throw new Error(`No se pudo leer ${nombre}.ino`);
  codigoCargado = await r.text();
  editor.setValue(codigoCargado);
  editor.clearHistory();
}

async function compilar() {
  if (compilando) return;
  compilando = true;
  $('#btn-compilar').disabled = true;
  estado('Compilando…', 'trabajando');
  mostrarPestana('log');
  escribirLog('Compilando con arduino-cli… (la primera vez puede tardar unos segundos)');
  try {
    const r = await fetch('/api/compilar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo: editor.getValue() }),
    });
    const res = await r.json();
    if (res.ok) {
      escribirLog(`${res.log}\n\nCompilado en ${res.segundos} s. Programa cargado en el Arduino simulado.`, 'ok');
      ultimoHex = res.hex;
      iniciar();
    } else {
      escribirLog(res.log, 'error');
      estado(emu ? 'Error · sigue el programa anterior' : 'Error de compilación', 'error');
    }
  } catch (e) {
    escribirLog(
      `No se pudo contactar al servidor local (${e.message}).\n¿Está corriendo "python3 simulador/servidor.py"?`,
      'error',
    );
    estado('Sin servidor', 'error');
  } finally {
    compilando = false;
    $('#btn-compilar').disabled = false;
  }
}

async function guardar() {
  const nombre = $('#sketch').value;
  const ok = confirm(
    `¿Sobrescribir codigo/${nombre}/${nombre}.ino con el contenido del editor?\n` +
      'Se guarda un respaldo del archivo anterior en simulador/build/respaldos/.',
  );
  if (!ok) return;
  const r = await fetch('/api/guardar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, codigo: editor.getValue() }),
  });
  const res = await r.json();
  if (res.ok) {
    codigoCargado = editor.getValue();
    estado(`Guardado en ${res.ruta}`, 'ok');
  } else {
    estado(res.log || 'No se pudo guardar', 'error');
  }
}

// ---------- Simulación ----------
function iniciar() {
  if (!ultimoHex) return;
  emu = new EmuladorAVR(ultimoHex);
  for (const d of dedos) {
    d.objetivo = null;
    d.inicioPulso = null;
  }
  new LectorServos(emu, dedos);
  teclado = new TecladoMatricial(emu, filas, columnas);
  for (const b of document.querySelectorAll('.tecla.pulsada')) b.classList.remove('pulsada');
  textoSerie = '';
  serieCambio = true;
  emu.usart.onByteTransmit = (byte) => {
    textoSerie = (textoSerie + String.fromCharCode(byte)).slice(-20000);
    serieCambio = true;
  };
  pausado = false;
  $('#btn-pausa').textContent = 'Pausa';
  estado('En ejecución', 'ok');
}

let ultimoCuadro = performance.now();
let ultimoPanel = 0;

function cuadro(ahora) {
  const dt = Math.min((ahora - ultimoCuadro) / 1000, 0.1);
  ultimoCuadro = ahora;

  let dtSimulado = 0;
  if (emu && !pausado) {
    const objetivo = Math.round(dt * FRECUENCIA);
    const t0 = performance.now();
    let hechos = 0;
    while (hechos < objetivo) {
      const n = Math.min(100000, objetivo - hechos);
      emu.ejecutar(n);
      hechos += n;
      teclado.tick();
      if (performance.now() - t0 > 14) break; // no congelar la página
    }
    dtSimulado = hechos / FRECUENCIA;
    if (dt > 0) velocidad = velocidad * 0.95 + (dtSimulado / dt) * 0.05;
  }

  for (const d of dedos) moverServo(d, dtSimulado);
  mano.actualizar(dedos);
  mano.render();

  if (ahora - ultimoPanel > 100) {
    refrescarPanel();
    ultimoPanel = ahora;
  }
  requestAnimationFrame(cuadro);
}

// ---------- Panel de servos ----------
const filasTabla = new Map();
for (const d of dedos) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <th scope="row">${d.nombre}</th>
    <td class="pin">${nombrePin(d.pin)}</td>
    <td class="angulo">—</td>
    <td><div class="medidor"><div class="relleno"></div></div></td>`;
  $('#tabla-servos tbody').append(tr);
  filasTabla.set(d.id, tr);
}

function refrescarPanel() {
  for (const d of dedos) {
    const tr = filasTabla.get(d.id);
    tr.querySelector('.angulo').textContent = d.objetivo == null ? '—' : `${d.objetivo}°`;
    tr.querySelector('.relleno').style.width = `${Math.round(flexion(d, d.actual) * 100)}%`;
    const fuera = fueraDeRango(d, d.objetivo);
    tr.classList.toggle('fuera', fuera);
    tr.title = fuera
      ? `El código pide ${d.objetivo}°, fuera del recorrido calibrado (${d.abierto}° a ${d.cerrado}°). En la mano real el dedo forzaría.`
      : '';
  }
  $('#ultima-tecla').textContent = ultimaTecla;
  $('#tiempo').textContent = emu ? `${emu.segundos.toFixed(1)} s` : '—';
  $('#velocidad').textContent = emu && !pausado ? `${Math.round(velocidad * 100)} %` : '—';
  if (serieCambio) {
    const serie = $('#serie');
    serie.textContent = textoSerie || '(sin datos; usa Serial.begin(9600) y Serial.println() en tu código)';
    serie.scrollTop = serie.scrollHeight;
    serieCambio = false;
  }
}

// ---------- Teclado 4x4 ----------
const botones = new Map();
const posiciones = new Map();
TECLADO.teclas.forEach((fila, r) =>
  fila.forEach((t, c) => {
    posiciones.set(t, { r, c });
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t;
    b.className = /\d/.test(t) ? 'tecla' : 'tecla especial';
    b.setAttribute('aria-label', `Tecla ${t}`);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      presionar(t);
    });
    for (const ev of ['pointerup', 'pointercancel']) b.addEventListener(ev, () => soltarTecla(t));
    botones.set(t, b);
    $('#teclado').append(b);
  }),
);

function presionar(t) {
  const p = posiciones.get(t);
  if (!p) return;
  botones.get(t).classList.add('pulsada');
  ultimaTecla = t;
  teclado?.pulsar(p.r, p.c);
}

function soltarTecla(t) {
  const p = posiciones.get(t);
  if (!p) return;
  botones.get(t).classList.remove('pulsada');
  teclado?.soltar(p.r, p.c);
}

function enCampoDeTexto(e) {
  return e.target.closest?.('.CodeMirror, input, select, textarea');
}

window.addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || enCampoDeTexto(e)) return;
  const t = e.key.length === 1 ? e.key.toUpperCase() : null;
  if (t && posiciones.has(t)) {
    e.preventDefault();
    presionar(t);
  }
});
window.addEventListener('keyup', (e) => {
  const t = e.key.length === 1 ? e.key.toUpperCase() : null;
  if (t && posiciones.has(t)) soltarTecla(t);
});
window.addEventListener('blur', () => {
  for (const t of posiciones.keys()) if (botones.get(t).classList.contains('pulsada')) soltarTecla(t);
});

// ---------- Botones ----------
$('#btn-compilar').addEventListener('click', compilar);
$('#btn-reiniciar').addEventListener('click', () => {
  if (ultimoHex) iniciar();
});
$('#btn-pausa').addEventListener('click', () => {
  if (!emu) return;
  pausado = !pausado;
  $('#btn-pausa').textContent = pausado ? 'Continuar' : 'Pausa';
  estado(pausado ? 'En pausa' : 'En ejecución', pausado ? '' : 'ok');
});
$('#btn-recargar').addEventListener('click', async () => {
  if (hayCambios() && !confirm('Se perderán los cambios del editor. ¿Recargar el archivo?')) return;
  await cargarArchivo();
});
$('#btn-guardar').addEventListener('click', guardar);
$('#btn-vista').addEventListener('click', () => mano.vistaInicial());
$('#chk-etiquetas').addEventListener('change', (e) => mano.mostrarEtiquetas(e.target.checked));
for (const b of document.querySelectorAll('.pestanas button')) {
  b.addEventListener('click', () => mostrarPestana(b.dataset.tab));
}

let sketchAnterior = $('#sketch').value;
$('#sketch').addEventListener('change', async (e) => {
  if (hayCambios() && !confirm('Se perderán los cambios del editor. ¿Cambiar de sketch?')) {
    e.target.value = sketchAnterior;
    return;
  }
  sketchAnterior = e.target.value;
  await cargarArchivo();
  await compilar();
});

// ---------- Arranque ----------
requestAnimationFrame(cuadro);
try {
  await cargarArchivo();
  await compilar();
} catch (e) {
  escribirLog(`${e.message}\n¿Está corriendo "python3 simulador/servidor.py"?`, 'error');
  estado('Sin servidor', 'error');
}
