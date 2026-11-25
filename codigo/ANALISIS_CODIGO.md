# Mano robótica con Arduino: análisis del código

Fecha: 2026-11-25

## 1. Objetivo que busca el código

El proyecto controla una **mano robótica de 5 dedos** (un servomotor por dedo) con un **Arduino UNO** y un **teclado matricial 4x4**. Cada tecla pone la mano en una postura predefinida: abierta, cerrada, gestos del alfabeto de señas (letras **A** y **L**, números **1** y **2**) o un modo de abrir y cerrar continuo.

En resumen, es un prototipo de **mano que reproduce gestos de lengua de señas** a pedido del usuario. Es la base de lo que hay que reproducir en el simulador.

## 2. Archivos

| Archivo | Para qué sirve |
| --- | --- |
| `mano_robotica_teclado/mano_robotica_teclado.ino` | Programa principal: teclado + 5 servos + gestos |
| `prueba_servos/prueba_servos.ino` | Prueba de hardware: mueve los 5 servos entre 90° y 180° cada 2 s |

Cada sketch está en una carpeta con su mismo nombre, como exige el Arduino IDE.

## 3. Hardware y conexiones

### Servomotores (uno por dedo)

| Dedo | Pin Arduino |
| --- | --- |
| Pulgar | A0 (usado como digital) |
| Índice | 9 |
| Medio | 12 |
| Anular | 11 |
| Meñique | 13 |

### Teclado matricial 4x4 (librería `Keypad`)

| Línea | Pines |
| --- | --- |
| Filas 1–4 | 2, 3, 4, 5 |
| Columnas 1–4 | 6, 7, 8, 10 |

Distribución de teclas:

```
1 2 3 A
4 5 6 B
7 8 9 C
* 0 # D
```

## 4. Calibración de ángulos de cada dedo

| Dedo | Abierto | Cerrado | Recorrido | Sentido al cerrar |
| --- | --- | --- | --- | --- |
| Pulgar | 106° | 6° | 100° | disminuye |
| Índice | 180° | 90° | 90° | disminuye |
| Medio | 90° | 180° | 90° | aumenta |
| Anular | 90° | 150° | 60° | aumenta |
| Meñique | 90° | 180° | 90° | aumenta |

Puntos clave:

- Pulgar e índice cierran **bajando** el ángulo; medio, anular y meñique cierran **subiendo**. Se debe a cómo quedó montado cada servo y cómo pasa el hilo/tendón.
- El anular tiene menos recorrido (60°), probablemente por un límite mecánico.
- Estos valores salen de calibrar la mano real. El simulador debe usarlos tal cual y convertirlos a un "porcentaje de flexión" (0 % abierto, 100 % cerrado) para dibujar el dedo.

## 5. Mapa de teclas y gestos

| Tecla | Acción | Pulgar | Índice | Medio | Anular | Meñique |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | Detener y abrir mano | abierto | abierto | abierto | abierto | abierto |
| 1 | Modo continuo: abre/cierra cada 700 ms | alterna | alterna | alterna | alterna | alterna |
| 2 | Cerrar mano (puño) | cerrado | cerrado | cerrado | cerrado | cerrado |
| 3 | Letra **A** | abierto | cerrado | cerrado | cerrado | cerrado |
| 4 | Letra **L** | abierto | abierto | cerrado | cerrado | cerrado |
| 5 | Número **1** | cerrado | abierto | cerrado | cerrado | cerrado |
| 6 | Número **2** | cerrado | abierto | abierto | cerrado | cerrado |
| 7, 8, 9, A, B, C, D, *, # | Sin uso (libres para nuevos gestos) | — | — | — | — | — |

Cualquier tecla de gesto (2–6) también **detiene** el modo continuo.

## 6. Lógica del programa principal

1. `setup()`: conecta los 5 servos a sus pines y abre la mano.
2. `loop()` se repite sin parar:
   1. Lee el teclado con `teclado.getKey()` (devuelve la tecla o nada).
   2. Según la tecla, llama a la función del gesto y activa o desactiva `movimiento`.
   3. Si `movimiento` está activo, revisa con `millis()` si ya pasaron 700 ms. Si sí, alterna entre `cerrarMano()` y `abrirMano()` usando la variable `fase`.

El modo continuo **no usa `delay()`**: así el teclado se sigue leyendo y la tecla 0 lo detiene al instante. Es el detalle de diseño más importante del sketch.

Cada gesto parte de `cerrarMano()` y luego abre solo los dedos necesarios. Así basta con escribir los dedos que cambian.

## 7. Sketch de prueba de servos

Pone los 5 servos a 90°, espera 2 s, los pone a 180°, espera 2 s, y repite. Sirve para comprobar el cableado y que cada servo responde, antes de calibrar. Usa `delay()`, así que bloquea todo; está bien para una prueba, pero no para el programa final.

Ojo: lleva todos los servos a 180° sin respetar los límites calibrados. En la mano armada podría forzar el pulgar (su máximo útil es 106°) o el anular (150°).

## 8. Observaciones y riesgos

- **Alimentación:** 5 servos moviéndose a la vez pueden pedir más corriente de la que da el pin 5V del Arduino. Lo recomendable es una fuente externa de 5–6 V con la tierra (GND) unida a la del Arduino. En la foto se ve un capacitor en la protoboard, que ayuda pero no sustituye la fuente.
- **Pin 13:** tiene el LED integrado de la placa; funciona con servo, pero el LED parpadeará con la señal.
- **Movimiento brusco:** `write()` salta directo al ángulo final. Mover el servo por pasos daría un gesto más suave y menos esfuerzo mecánico.
- **Teclas libres:** quedan 9 teclas disponibles para más letras o números.
- **Repetición:** los ángulos están en 10 variables sueltas; agruparlos en arreglos facilitaría añadir gestos (y portar el código al simulador).

## 9. Hacia el simulador

Objetivo: reproducir en pantalla (por ejemplo, una página web) el mismo comportamiento que el Arduino real, sin hardware.

Qué debe tener el simulador:

1. **Teclado 4x4 virtual** con la misma distribución; también se puede usar el teclado de la computadora.
2. **Mano dibujada** con 5 dedos. Cada dedo se dobla según el ángulo de su servo, convertido a % de flexión con la tabla de la sección 4.
3. **Modelo de servo:** recibe un ángulo con `write()` y llega a él en un tiempo realista (un servo SG90 tarda unos 0.1 s por cada 60°), en lugar de saltar.
4. **Misma lógica del sketch:** las funciones `abrirMano`, `cerrarMano`, `letraA`, `letraL`, `numeroUno`, `numeroDos` y el modo continuo de 700 ms basado en tiempo, no en pausas.
5. **Panel de estado:** última tecla, modo activo y ángulo actual de cada servo; útil para el reporte.
6. **Diagrama de conexiones** opcional con los pines de la sección 3.

Pasos sugeridos:

1. Definir la tecnología (recomendado: HTML + JavaScript, se abre en cualquier navegador).
2. Dibujar la mano y el teclado.
3. Traducir el `loop()` a JavaScript con un temporizador.
4. Añadir la animación de los servos.
5. Comparar con la mano real y ajustar.
6. Agregar gestos nuevos en las teclas libres.
