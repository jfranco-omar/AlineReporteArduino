// Teclado de membrana 4x4 emulado a nivel de pines.
//
// La librería Keypad pone las filas como INPUT_PULLUP y va poniendo cada columna
// como salida en LOW. Si una tecla está pulsada, une su fila con su columna, así
// que la fila se lee en LOW. Aquí se reproduce eso: un pin del teclado se lee LOW
// si una tecla pulsada lo conecta con otro pin que el micro está forzando a LOW.
import { PinState } from 'avr8js';
import { FRECUENCIA } from './avr.js';

// Tiempo mínimo que se mantiene una tecla, para pasar el antirrebote de Keypad (10 ms).
const PULSACION_MINIMA = 0.12 * FRECUENCIA;

export class TecladoMatricial {
  constructor(emu, filas, columnas) {
    this.emu = emu;
    this.filas = filas;       // [{ puerto, bit }]
    this.columnas = columnas; // [{ puerto, bit }]
    this.pulsadas = new Map();

    const puertos = new Set([...filas, ...columnas].map((p) => p.puerto));
    for (const letra of puertos) {
      emu.puertos[letra].addListener(() => this.actualizar());
    }
    this.actualizar();
  }

  enBajo(pin) {
    return this.emu.puertos[pin.puerto].pinState(pin.bit) === PinState.Low;
  }

  actualizar() {
    const teclas = [...this.pulsadas.values()];
    this.filas.forEach((pin, r) => {
      const bajo = teclas.some((t) => t.r === r && this.enBajo(this.columnas[t.c]));
      this.emu.puertos[pin.puerto].setPin(pin.bit, !bajo);
    });
    this.columnas.forEach((pin, c) => {
      const bajo = teclas.some((t) => t.c === c && this.enBajo(this.filas[t.r]));
      this.emu.puertos[pin.puerto].setPin(pin.bit, !bajo);
    });
  }

  pulsar(r, c) {
    const clave = `${r},${c}`;
    const existente = this.pulsadas.get(clave);
    if (existente) existente.soltar = false;
    else this.pulsadas.set(clave, { r, c, inicio: this.emu.cpu.cycles, soltar: false });
    this.actualizar();
  }

  soltar(r, c) {
    const tecla = this.pulsadas.get(`${r},${c}`);
    if (tecla) tecla.soltar = true;
    this.tick();
  }

  // Suelta de verdad las teclas cuyo tiempo mínimo ya pasó (en tiempo simulado).
  tick() {
    let cambio = false;
    for (const [clave, t] of this.pulsadas) {
      if (t.soltar && this.emu.cpu.cycles - t.inicio >= PULSACION_MINIMA) {
        this.pulsadas.delete(clave);
        cambio = true;
      }
    }
    if (cambio) this.actualizar();
  }
}
