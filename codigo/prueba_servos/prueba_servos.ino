#include <Servo.h>

Servo pulgar;
Servo indice;
Servo medio;
Servo anular;
Servo menique;

void setup() {
  pulgar.attach(A0);
  indice.attach(9);
  medio.attach(12);
  anular.attach(11);
  menique.attach(13);
}

void loop() {

  pulgar.write(90);
  indice.write(90);
  medio.write(90);
  anular.write(90);
  menique.write(90);

  delay(2000);

  pulgar.write(180);
  indice.write(180);
  medio.write(180);
  anular.write(180);
  menique.write(180);

  delay(2000);
}
