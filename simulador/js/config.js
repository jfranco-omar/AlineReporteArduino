// Descripción del HARDWARE de la mano (no del código).
// Si cambias un cable o recalibras la mano real, cámbialo aquí.

// Pin de cada servo y su calibración mecánica (ver codigo/ANALISIS_CODIGO.md §4).
// "abierto" y "cerrado" son los ángulos del servo en los que el dedo queda
// totalmente extendido o totalmente doblado. Sirven para dibujar el dedo.
export const DEDOS = [
  { id: 'pulgar',  nombre: 'Pulgar',  pin: 'A0', abierto: 106, cerrado: 6 },
  { id: 'indice',  nombre: 'Índice',  pin: 9,    abierto: 180, cerrado: 90 },
  { id: 'medio',   nombre: 'Medio',   pin: 12,   abierto: 90,  cerrado: 180 },
  { id: 'anular',  nombre: 'Anular',  pin: 11,   abierto: 90,  cerrado: 150 },
  { id: 'menique', nombre: 'Meñique', pin: 13,   abierto: 90,  cerrado: 180 },
];

// Teclado matricial 4x4 (librería Keypad).
export const TECLADO = {
  filas: [2, 3, 4, 5],
  columnas: [6, 7, 8, 10],
  teclas: [
    ['1', '2', '3', 'A'],
    ['4', '5', '6', 'B'],
    ['7', '8', '9', 'C'],
    ['*', '0', '#', 'D'],
  ],
};

// Pin de Arduino UNO -> puerto y bit del ATmega328P.
// D0–D7 = PORTD, D8–D13 = PORTB, A0–A5 = PORTC.
export function pinArduino(pin) {
  const n = typeof pin === 'string' && /^A\d$/i.test(pin) ? 14 + Number(pin.slice(1)) : Number(pin);
  if (n >= 0 && n <= 7) return { puerto: 'D', bit: n };
  if (n >= 8 && n <= 13) return { puerto: 'B', bit: n - 8 };
  if (n >= 14 && n <= 19) return { puerto: 'C', bit: n - 14 };
  throw new Error(`Pin no válido: ${pin}`);
}

export function nombrePin(pin) {
  return typeof pin === 'string' ? pin.toUpperCase() : `D${pin}`;
}

const limitar = (v, a, b) => Math.min(b, Math.max(a, v));

// 0 = dedo extendido, 1 = dedo doblado.
export function flexion(dedo, angulo) {
  return limitar((angulo - dedo.abierto) / (dedo.cerrado - dedo.abierto), 0, 1);
}

// true si el código pide un ángulo fuera del recorrido calibrado del dedo.
export function fueraDeRango(dedo, angulo) {
  if (angulo == null) return false;
  const min = Math.min(dedo.abierto, dedo.cerrado);
  const max = Math.max(dedo.abierto, dedo.cerrado);
  return angulo < min - 2 || angulo > max + 2;
}
