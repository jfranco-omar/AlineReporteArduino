// Emulador del ATmega328P (Arduino UNO) con avr8js.
import {
  CPU,
  avrInstruction,
  AVRTimer,
  timer0Config,
  timer1Config,
  timer2Config,
  AVRIOPort,
  portBConfig,
  portCConfig,
  portDConfig,
  AVRUSART,
  usart0Config,
} from 'avr8js';

export const FRECUENCIA = 16e6; // 16 MHz

// Carga un archivo Intel HEX (el que genera arduino-cli) en la memoria de programa.
export function cargarHex(texto, destino) {
  for (const linea of texto.split('\n')) {
    const l = linea.trim();
    if (l[0] !== ':' || l.substr(7, 2) !== '00') continue; // solo registros de datos
    const cantidad = parseInt(l.substr(1, 2), 16);
    const direccion = parseInt(l.substr(3, 4), 16);
    for (let i = 0; i < cantidad; i++) {
      destino[direccion + i] = parseInt(l.substr(9 + i * 2, 2), 16);
    }
  }
}

export class EmuladorAVR {
  constructor(hex) {
    this.programa = new Uint16Array(0x4000); // 32 KB de flash
    cargarHex(hex, new Uint8Array(this.programa.buffer));
    this.cpu = new CPU(this.programa);
    // Timer0 = millis()/delay(), Timer1 = librería Servo, Timer2 = tone() y otros.
    this.timers = [timer0Config, timer1Config, timer2Config].map((c) => new AVRTimer(this.cpu, c));
    this.puertos = {
      B: new AVRIOPort(this.cpu, portBConfig),
      C: new AVRIOPort(this.cpu, portCConfig),
      D: new AVRIOPort(this.cpu, portDConfig),
    };
    this.usart = new AVRUSART(this.cpu, usart0Config, FRECUENCIA);
  }

  get segundos() {
    return this.cpu.cycles / FRECUENCIA;
  }

  ejecutar(ciclos) {
    const cpu = this.cpu;
    const fin = cpu.cycles + ciclos;
    while (cpu.cycles < fin) {
      avrInstruction(cpu);
      cpu.tick();
    }
  }
}
