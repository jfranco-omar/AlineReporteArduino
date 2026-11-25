#!/usr/bin/env python3
"""Servidor local del simulador de la mano robótica.

Sirve la página del simulador y compila el código Arduino con arduino-cli.

Uso:
    python3 simulador/servidor.py
    abrir http://localhost:8000

Rutas:
    GET  /api/sketch?nombre=...   devuelve el .ino original de la carpeta codigo/
    POST /api/compilar            {codigo} -> {ok, hex, log, segundos}
    POST /api/guardar             {nombre, codigo} -> sobrescribe el .ino (con respaldo)
"""

import json
import os
import re
import shutil
import subprocess
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

RAIZ = Path(__file__).resolve().parent
PROYECTO = RAIZ.parent
BUILD = RAIZ / "build"
FQBN = "arduino:avr:uno"
HOST = "127.0.0.1"
PUERTO = int(os.environ.get("PUERTO", "8000"))
MAX_BYTES = 256 * 1024

SKETCHES = {
    "mano_robotica_teclado": PROYECTO / "codigo" / "mano_robotica_teclado" / "mano_robotica_teclado.ino",
    "prueba_servos": PROYECTO / "codigo" / "prueba_servos" / "prueba_servos.ino",
}

ANSI = re.compile(r"\x1b\[[0-9;]*m")
candado = threading.Lock()


def buscar_arduino_cli():
    ruta = shutil.which("arduino-cli")
    if ruta:
        return ruta
    for candidata in ("/opt/homebrew/bin/arduino-cli", "/usr/local/bin/arduino-cli"):
        if Path(candidata).exists():
            return candidata
    return None


def compilar(codigo):
    cli = buscar_arduino_cli()
    if not cli:
        return {"ok": False, "log": "No se encontró arduino-cli. Instálalo con: brew install arduino-cli"}

    with candado:
        carpeta = BUILD / "sketch"
        salida = BUILD / "out"
        carpeta.mkdir(parents=True, exist_ok=True)
        shutil.rmtree(salida, ignore_errors=True)
        archivo = carpeta / "sketch.ino"
        archivo.write_text(codigo, encoding="utf-8")

        inicio = time.time()
        try:
            proceso = subprocess.run(
                [cli, "compile", "--fqbn", FQBN, "--no-color", "--output-dir", str(salida), str(carpeta)],
                capture_output=True,
                text=True,
                timeout=300,
            )
        except subprocess.TimeoutExpired:
            return {"ok": False, "log": "La compilación tardó más de 5 minutos y se canceló."}

        log = ANSI.sub("", proceso.stdout + proceso.stderr)
        log = log.replace(str(archivo), "sketch.ino").replace(str(carpeta) + os.sep, "")
        if "bad CPU type" in log:
            log += (
                "\n\nEl compilador de Arduino para Mac es de Intel y necesita Rosetta."
                "\nInstálala con: softwareupdate --install-rosetta --agree-to-license"
            )

        hex_ = salida / "sketch.ino.hex"
        if proceso.returncode != 0 or not hex_.exists():
            return {"ok": False, "log": log.strip()}
        return {
            "ok": True,
            "hex": hex_.read_text(),
            "log": log.strip(),
            "segundos": round(time.time() - inicio, 1),
        }


def guardar(nombre, codigo):
    destino = SKETCHES[nombre]
    respaldos = BUILD / "respaldos"
    respaldos.mkdir(parents=True, exist_ok=True)
    if destino.exists():
        sello = time.strftime("%Y%m%d-%H%M%S")
        shutil.copy2(destino, respaldos / f"{nombre}-{sello}.ino")
    destino.write_text(codigo, encoding="utf-8")
    return {"ok": True, "ruta": str(destino.relative_to(PROYECTO))}


class Manejador(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(RAIZ), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, formato, *args):
        if self.path.startswith("/api/"):
            super().log_message(formato, *args)

    def responder_json(self, datos, codigo=200):
        cuerpo = json.dumps(datos).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/api/sketch":
            nombre = parse_qs(url.query).get("nombre", ["mano_robotica_teclado"])[0]
            if nombre not in SKETCHES:
                return self.responder_json({"ok": False, "log": "Sketch desconocido"}, 404)
            cuerpo = SKETCHES[nombre].read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(cuerpo)))
            self.end_headers()
            self.wfile.write(cuerpo)
            return
        if url.path.startswith("/build/"):
            return self.send_error(404)
        return super().do_GET()

    def origen_valido(self):
        origen = self.headers.get("Origin")
        if origen is None:
            return True
        return origen in (f"http://localhost:{PUERTO}", f"http://127.0.0.1:{PUERTO}")

    def leer_json(self):
        if not self.headers.get("Content-Type", "").startswith("application/json"):
            return None
        largo = int(self.headers.get("Content-Length", "0"))
        if largo <= 0 or largo > MAX_BYTES:
            return None
        try:
            return json.loads(self.rfile.read(largo).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return None

    def do_POST(self):
        if not self.origen_valido():
            return self.responder_json({"ok": False, "log": "Origen no permitido"}, 403)
        datos = self.leer_json()
        if not isinstance(datos, dict) or not isinstance(datos.get("codigo"), str):
            return self.responder_json({"ok": False, "log": "Petición inválida"}, 400)

        ruta = urlparse(self.path).path
        if ruta == "/api/compilar":
            return self.responder_json(compilar(datos["codigo"]))
        if ruta == "/api/guardar":
            nombre = datos.get("nombre")
            if nombre not in SKETCHES:
                return self.responder_json({"ok": False, "log": "Sketch desconocido"}, 400)
            return self.responder_json(guardar(nombre, datos["codigo"]))
        return self.send_error(404)


def main():
    servidor = ThreadingHTTPServer((HOST, PUERTO), Manejador)
    print(f"Simulador listo en http://localhost:{PUERTO}  (Ctrl+C para salir)")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")


if __name__ == "__main__":
    main()
