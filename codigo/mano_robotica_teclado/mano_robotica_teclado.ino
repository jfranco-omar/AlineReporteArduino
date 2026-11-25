#include <Keypad.h>
#include <Servo.h>

// SERVOMOTORES
Servo pulgar;
Servo indice;
Servo medio;
Servo anular;
Servo menique;

// TECLADO
char teclas[4][4] = {
  {'1','2','3','A'},
  {'4','5','6','B'},
  {'7','8','9','C'},
  {'*','0','#','D'}
};

byte filas[4] = {2, 3, 4, 5};
byte columnas[4] = {6, 7, 8, 10};

Keypad teclado = Keypad(
  makeKeymap(teclas),
  filas, columnas, 4, 4
);

// ANGULOS DE LOS DEDOS

int pulgarAbierto = 106;
int pulgarCerrado = 6;

int indiceAbierto = 180;
int indiceCerrado = 90;

int medioAbierto = 90;
int medioCerrado = 180;

int anularAbierto = 90;
int anularCerrado = 150;

int meniqueAbierto = 90;
int meniqueCerrado = 180;

// CONTROL DEL LOOP
bool movimiento = false;
bool fase = false;

unsigned long tiempoAnterior = 0;
unsigned long intervalo = 700;

// MANO COMPLETAMENTE ABIERTA
void abrirMano() {
  pulgar.write(pulgarAbierto);
  indice.write(indiceAbierto);
  medio.write(medioAbierto);
  anular.write(anularAbierto);
  menique.write(meniqueAbierto);
}

// MANO COMPLETAMENTE CERRADA
void cerrarMano() {
  pulgar.write(pulgarCerrado);
  indice.write(indiceCerrado);
  medio.write(medioCerrado);
  anular.write(anularCerrado);
  menique.write(meniqueCerrado);
}

// LETRA A
void letraA() {
  cerrarMano();
  pulgar.write(pulgarAbierto);
}

// LETRA L
void letraL() {
  cerrarMano();
  pulgar.write(pulgarAbierto);
  indice.write(indiceAbierto);
}

// NUMERO 1
void numeroUno() {
  cerrarMano();
  indice.write(indiceAbierto);
}

// NUMERO 2
void numeroDos() {
  cerrarMano();
  indice.write(indiceAbierto);
  medio.write(medioAbierto);
}

// CONFIGURACION INICIAL
void setup() {

  pulgar.attach(A0);
  indice.attach(9);
  medio.attach(12);
  anular.attach(11);
  menique.attach(13);

  abrirMano();
}

// PROGRAMA PRINCIPAL
void loop() {

  char tecla = teclado.getKey();

  // TECLA 0: DETENER Y ABRIR
  if (tecla == '0') {
    movimiento = false;
    fase = false;
    abrirMano();
  }

  // TECLA 1: MOVIMIENTO CONTINUO
  if (tecla == '1') {
    movimiento = true;
    fase = false;
    abrirMano();
    tiempoAnterior = millis();
  }

  // TECLA 2: CERRAR MANO
  if (tecla == '2') {
    movimiento = false;
    cerrarMano();
  }

  // TECLA 3: LETRA A
  if (tecla == '3') {
    movimiento = false;
    letraA();
  }

  // TECLA 4: LETRA L
  if (tecla == '4') {
    movimiento = false;
    letraL();
  }

  // TECLA 5: NUMERO 1
  if (tecla == '5') {
    movimiento = false;
    numeroUno();
  }

  // TECLA 6: NUMERO 2
  if (tecla == '6') {
    movimiento = false;
    numeroDos();
  }

  // MOVIMIENTO CONTINUO SIN BLOQUEAR EL TECLADO
  if (movimiento) {

    if (millis() - tiempoAnterior >= intervalo) {

      tiempoAnterior = millis();

      if (fase == false) {
        cerrarMano();
        fase = true;
      }

      else {
        abrirMano();
        fase = false;
      }
    }
  }
}
