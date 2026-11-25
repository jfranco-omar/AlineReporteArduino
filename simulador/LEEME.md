# Simulador de la mano robótica

Corre el código Arduino real (`codigo/*.ino`) en un Arduino UNO emulado dentro del navegador y mueve una mano 3D con los ángulos que el código manda a los servos.

## Requisitos (una sola vez)

```
brew install arduino-cli
arduino-cli core update-index
arduino-cli core install arduino:avr
arduino-cli lib install Keypad Servo
softwareupdate --install-rosetta --agree-to-license   # Mac con chip Apple: el compilador AVR es de Intel
```

## Uso

```
cd ~/Proyectos/AlineReporteArduino
python3 simulador/servidor.py
```

Abre http://localhost:8000. El sketch se compila y arranca solo.

- **Teclado 4x4**: clic en las teclas o usa el teclado de la computadora (0–9, A–D, *, #).
- **Editar código**: cambia el código y pulsa *Compilar y ejecutar* (o Cmd+Enter).
- **Guardar en .ino**: sobrescribe el archivo de `codigo/`. Antes guarda un respaldo en `simulador/build/respaldos/`.
- **Monitor serie**: muestra lo que imprima `Serial.print()`.
- Si el código pide un ángulo fuera del recorrido calibrado de un dedo, el ángulo se marca en rojo.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `servidor.py` | Sirve la página y compila con `arduino-cli` |
| `js/config.js` | Pines y calibración de cada dedo (**hardware**). Cámbialo si recableas o recalibras la mano real |
| `js/avr.js` | Emulador del ATmega328P (`avr8js`) |
| `js/servos.js` | Mide los pulsos de la librería Servo y los convierte en ángulos |
| `js/teclado.js` | Emula el teclado de membrana pin por pin, como lo lee la librería Keypad |
| `js/mano3d.js` | Modelo 3D de la mano (Three.js) |
| `js/app.js` | Une todo: editor, panel, teclado y animación |

`autoprueba.html` (http://localhost:8000/autoprueba.html) comprueba solo que cada tecla dé los ángulos correctos. `README.html` explica el funcionamiento para cualquier lector.

`build/` es temporal y se puede borrar.
