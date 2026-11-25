// Lee los pulsos que la librería Servo genera en cada pin y los convierte en ángulos.
import { FRECUENCIA } from './avr.js';

// Valores por defecto de la librería Servo de Arduino.
const PULSO_MIN = 544;  // µs -> 0°
const PULSO_MAX = 2400; // µs -> 180°

// Velocidad de un micro servo tipo SG90/MG90: unos 0.12 s por cada 60°.
const VELOCIDAD = 500; // grados por segundo

export function pulsoAGrados(us) {
  return ((us - PULSO_MIN) * 180) / (PULSO_MAX - PULSO_MIN);
}

export class LectorServos {
  // dedos: [{ puerto: 'B', bit: 1, objetivo, actual, ... }]
  constructor(emu, dedos) {
    const porPuerto = {};
    for (const d of dedos) (porPuerto[d.puerto] ??= []).push(d);

    for (const [letra, lista] of Object.entries(porPuerto)) {
      emu.puertos[letra].addListener((valor, anterior) => {
        for (const d of lista) {
          const m = 1 << d.bit;
          if (valor & m && !(anterior & m)) {
            d.inicioPulso = emu.cpu.cycles; // flanco de subida
          } else if (!(valor & m) && anterior & m && d.inicioPulso != null) {
            const us = ((emu.cpu.cycles - d.inicioPulso) * 1e6) / FRECUENCIA;
            d.inicioPulso = null;
            if (us >= 400 && us <= 2700) {
              d.objetivo = Math.round(Math.min(180, Math.max(0, pulsoAGrados(us))));
            }
          }
        }
      });
    }
  }
}

// Mueve el eje del servo hacia el ángulo pedido a velocidad limitada.
export function moverServo(d, dt) {
  if (d.objetivo == null || dt <= 0) return;
  const paso = VELOCIDAD * dt;
  const delta = d.objetivo - d.actual;
  d.actual += Math.max(-paso, Math.min(paso, delta));
}
