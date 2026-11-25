// Modelo 3D de la mano robótica, armado con piezas simples de Three.js.
// Unidades aproximadas en centímetros. La mano apunta hacia +Y y la palma mira a +Z.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { flexion, nombrePin } from './config.js';

const rad = THREE.MathUtils.degToRad;

const MAT = {
  naranja: new THREE.MeshStandardMaterial({ color: 0xf0661a, roughness: 0.55 }),
  gris: new THREE.MeshStandardMaterial({ color: 0xb9bdc3, roughness: 0.5, metalness: 0.15 }),
  grisCasco: new THREE.MeshStandardMaterial({ color: 0xb9bdc3, roughness: 0.5, metalness: 0.15, side: THREE.DoubleSide }),
  grisOscuro: new THREE.MeshStandardMaterial({ color: 0x8e939a, roughness: 0.55, metalness: 0.2 }),
  servo: new THREE.MeshStandardMaterial({ color: 0x3a3e45, roughness: 0.45, metalness: 0.3 }),
  metal: new THREE.MeshStandardMaterial({ color: 0xd6d9dd, roughness: 0.3, metalness: 0.75 }),
  blanco: new THREE.MeshStandardMaterial({ color: 0xf4f4ef, roughness: 0.6 }),
};

// Dedos largos: posición en X, largo de cada falange e inclinación lateral.
const DEDOS_3D = {
  indice: { x: -2.85, largos: [2.7, 1.9, 1.6], abre: 0.05 },
  medio: { x: -0.95, largos: [3.0, 2.1, 1.7], abre: 0.0 },
  anular: { x: 0.95, largos: [2.8, 2.0, 1.6], abre: -0.03 },
  menique: { x: 2.85, largos: [2.2, 1.6, 1.3], abre: -0.08 },
};
// Ángulo de cada articulación con el dedo totalmente doblado (MCP, PIP, DIP).
const ANGULO_MAX = [70, 95, 70];

// Servos del antebrazo: posición (x, y) y puntos guía del hilo para no cruzar otros servos.
const SERVOS_ANTEBRAZO = {
  medio: { x: -1.25, y: 9.6, guias: [] },
  anular: { x: 1.25, y: 9.6, guias: [] },
  indice: { x: -1.25, y: 4.4, guias: [[-2.6, 7.2, 1.1], [-2.6, 12.6, 1.1]] },
  menique: { x: 1.25, y: 4.4, guias: [[2.6, 7.2, 1.1], [2.6, 12.6, 1.1]] },
};

const PALMA = { ancho: 8.2, alto: 7.8, fondo: 2.6, y0: 15.2 };
const NUDILLOS_Y = PALMA.y0 + PALMA.alto - 0.15;

function caja(ancho, alto, fondo, material, radio = 0.12) {
  return new THREE.Mesh(new RoundedBoxGeometry(ancho, alto, fondo, 3, radio), material);
}

function cilindro(radio, alto, material, segmentos = 32) {
  return new THREE.Mesh(new THREE.CylinderGeometry(radio, radio, alto, segmentos), material);
}

function etiqueta(texto) {
  const lienzo = document.createElement('canvas');
  lienzo.width = 512;
  lienzo.height = 112;
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = 'rgba(24, 26, 31, 0.86)';
  ctx.beginPath();
  ctx.roundRect(4, 4, 504, 104, 26);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 50px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, 256, 59);
  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: textura, depthTest: false }));
  sprite.scale.set(3.6, 0.79, 1);
  sprite.renderOrder = 10;
  return sprite;
}

// Línea fina que une una etiqueta con su pieza.
function guia(desde, hasta) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...desde), new THREE.Vector3(...hasta)]);
  const linea = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x2a2d33, transparent: true, opacity: 0.55, depthTest: false }));
  linea.renderOrder = 9;
  return linea;
}

export class Mano3D {
  constructor(contenedor, dedos) {
    this.contenedor = contenedor;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    contenedor.appendChild(this.renderer.domElement);

    this.escena = new THREE.Scene();
    this.camara = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
    this.controles = new OrbitControls(this.camara, this.renderer.domElement);
    this.controles.enableDamping = true;
    this.controles.minDistance = 12;
    this.controles.maxDistance = 80;

    this.iluminar();
    this.dedos = {};
    this.poleas = {};
    this.tendones = {};
    this.etiquetas = [];

    this.construirAntebrazo();
    this.construirPalma();
    for (const id of Object.keys(DEDOS_3D)) this.construirDedo(id);
    this.construirPulgar();
    for (const id of Object.keys(DEDOS_3D)) this.construirTendon(id);
    this.crearEtiquetas(dedos);

    this.escena.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });

    this.vistaInicial();
    new ResizeObserver(() => this.ajustarTamano()).observe(contenedor);
    this.ajustarTamano();
  }

  iluminar() {
    this.escena.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.3));
    const sol = new THREE.DirectionalLight(0xffffff, 2.2);
    sol.position.set(9, 26, 16);
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    Object.assign(sol.shadow.camera, { left: -16, right: 16, top: 30, bottom: -4, near: 1, far: 70 });
    sol.shadow.bias = -0.0005;
    this.escena.add(sol);
    const relleno = new THREE.DirectionalLight(0xffffff, 0.6);
    relleno.position.set(-12, 10, -8);
    this.escena.add(relleno);

    const piso = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.16 }));
    piso.rotation.x = -Math.PI / 2;
    piso.receiveShadow = true;
    this.escena.add(piso);
  }

  construirAntebrazo() {
    // Base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4.0, 4.2, 0.8, 48), MAT.gris);
    base.position.y = 0.4;
    base.scale.z = 0.75;
    this.escena.add(base);

    // Carcasa: media caparazón trasera, abierta al frente para ver los servos.
    const casco = new THREE.Mesh(
      new THREE.CylinderGeometry(3.3, 3.9, 13.2, 48, 1, true, Math.PI / 2, Math.PI),
      MAT.grisCasco,
    );
    casco.position.y = 7.4;
    casco.scale.z = 0.75;
    this.escena.add(casco);

    // Placa naranja donde se atornillan los servos
    const placa = caja(5.0, 11.6, 0.25, MAT.naranja, 0.08);
    placa.position.set(0, 7.2, -1.35);
    this.escena.add(placa);

    for (const [id, s] of Object.entries(SERVOS_ANTEBRAZO)) {
      const grupo = new THREE.Group();
      grupo.position.set(s.x, s.y, -0.2);

      const cuerpo = caja(2.0, 3.4, 1.8, MAT.servo);
      const orejas = caja(2.0, 4.4, 0.22, MAT.servo, 0.06);
      orejas.position.z = 0.55;
      const eje = cilindro(0.22, 0.5, MAT.metal, 16);
      eje.rotation.x = Math.PI / 2;
      eje.position.set(0, 0.9, 1.05);
      grupo.add(cuerpo, orejas, eje);

      // Polea naranja que gira con el ángulo real del servo
      const polea = new THREE.Group();
      polea.position.set(0, 0.9, 1.4);
      const disco = cilindro(0.85, 0.32, MAT.naranja);
      const borde1 = cilindro(1.0, 0.07, MAT.naranja);
      const borde2 = cilindro(1.0, 0.07, MAT.naranja);
      for (const m of [disco, borde1, borde2]) m.rotation.x = Math.PI / 2;
      borde1.position.z = 0.18;
      borde2.position.z = -0.18;
      const marca = caja(0.16, 0.85, 0.06, MAT.blanco, 0.02);
      marca.position.set(0, 0.42, 0.24);
      polea.add(disco, borde1, borde2, marca);
      grupo.add(polea);

      this.poleas[id] = polea;
      this.escena.add(grupo);
    }
  }

  construirPalma() {
    const muneca = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.3, 1.3, 48), MAT.grisOscuro);
    muneca.position.y = 14.55;
    muneca.scale.z = 0.55;
    this.escena.add(muneca);

    const palma = caja(PALMA.ancho, PALMA.alto, PALMA.fondo, MAT.gris, 0.6);
    palma.position.set(0, PALMA.y0 + PALMA.alto / 2, 0);
    this.escena.add(palma);
  }

  construirDedo(id) {
    const cfg = DEDOS_3D[id];
    const base = new THREE.Group();
    base.position.set(cfg.x, NUDILLOS_Y, 0);
    base.rotation.z = cfg.abre;
    this.escena.add(base);

    const falanges = [];
    let padre = base;
    cfg.largos.forEach((largo, i) => {
      const ancho = 1.55 - i * 0.08;
      const fondo = 1.5 - i * 0.06;
      const g = new THREE.Group();
      if (i > 0) g.position.y = cfg.largos[i - 1] + 0.1;
      const pieza = caja(ancho, largo, fondo, MAT.naranja, i === cfg.largos.length - 1 ? 0.62 : 0.5);
      pieza.position.y = largo / 2;
      const perno = cilindro(0.17, ancho + 0.12, MAT.metal, 16);
      perno.rotation.z = Math.PI / 2;
      g.add(pieza, perno);
      if (i === cfg.largos.length - 1) {
        const remate = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), MAT.metal);
        remate.position.set(0, largo - 0.2, fondo / 2);
        g.add(remate);
      }
      g.userData = { largo, fondo };
      padre.add(g);
      falanges.push(g);
      padre = g;
    });
    this.dedos[id] = { base, falanges };
  }

  construirPulgar() {
    // Servo montado en la palma, con el pulgar unido directo a su eje.
    const servo = caja(2.3, 1.9, 1.3, MAT.servo);
    servo.position.set(-2.2, 16.9, 1.9);
    this.escena.add(servo);

    const raiz = new THREE.Group();
    raiz.position.set(-3.45, 16.9, 2.05);
    this.escena.add(raiz);
    const cubo = cilindro(0.7, 1.1, MAT.naranja);
    raiz.add(cubo);

    const largos = [2.3, 1.9, 1.6];
    const falanges = [];
    let padre = raiz;
    largos.forEach((largo, i) => {
      const alto = 1.35 - i * 0.06;
      const g = new THREE.Group();
      g.position.x = i === 0 ? -0.55 : -(largos[i - 1] + 0.1);
      const pieza = caja(largo, alto, 1.3 - i * 0.06, MAT.naranja, i === largos.length - 1 ? 0.58 : 0.48);
      pieza.position.x = -largo / 2;
      g.add(pieza);
      if (i > 0) g.add(cilindro(0.17, alto + 0.12, MAT.metal, 16));
      padre.add(g);
      falanges.push(g);
      padre = g;
    });
    this.dedos.pulgar = { raiz, falanges };
  }

  construirTendon(id) {
    const puntos = 2 + SERVOS_ANTEBRAZO[id].guias.length + 1 + DEDOS_3D[id].largos.length * 2;
    const geometria = new THREE.BufferGeometry();
    geometria.setAttribute('position', new THREE.BufferAttribute(new Float32Array(puntos * 3), 3));
    const linea = new THREE.Line(geometria, new THREE.LineBasicMaterial({ color: 0xf7f7f2 }));
    linea.frustumCulled = false;
    this.escena.add(linea);
    this.tendones[id] = linea;
  }

  // Etiquetas fuera de la mano, con una línea hasta el servo que nombran.
  crearEtiquetas(dedos) {
    for (const d of dedos) {
      const sprite = etiqueta(`${d.nombre} · ${nombrePin(d.pin)}`);
      let destino;
      if (d.id === 'pulgar') {
        sprite.position.set(-8.6, 19.4, 2.0);
        destino = [-2.2, 17.85, 2.4];
      } else {
        const s = SERVOS_ANTEBRAZO[d.id];
        const lado = Math.sign(s.x);
        sprite.position.set(lado * 6.6, s.y + 0.9, 1.4);
        destino = [s.x + lado * 0.95, s.y + 0.9, 1.4];
      }
      const linea = guia([sprite.position.x - Math.sign(sprite.position.x) * 1.8, sprite.position.y, sprite.position.z], destino);
      this.escena.add(sprite, linea);
      this.etiquetas.push(sprite, linea);
    }
  }

  mostrarEtiquetas(visible) {
    for (const e of this.etiquetas) e.visible = visible;
  }

  // dedos: [{ id, actual (ángulo del eje), abierto, cerrado }]
  actualizar(dedos) {
    for (const d of dedos) {
      const f = flexion(d, d.actual);
      if (d.id === 'pulgar') {
        const p = this.dedos.pulgar;
        p.raiz.rotation.y = f * rad(80);
        p.falanges[1].rotation.y = f * rad(30);
        p.falanges[2].rotation.y = f * rad(45);
      } else {
        this.dedos[d.id].falanges.forEach((g, i) => {
          g.rotation.x = f * rad(ANGULO_MAX[i]);
        });
        this.poleas[d.id].rotation.z = rad(d.actual - 90);
      }
    }
    this.escena.updateMatrixWorld(true);
    for (const id of Object.keys(this.tendones)) this.actualizarTendon(id);
  }

  actualizarTendon(id) {
    const v = new THREE.Vector3();
    const pos = this.tendones[id].geometry.attributes.position;
    let i = 0;
    const agregar = (x, y, z) => pos.setXYZ(i++, x, y, z);

    this.poleas[id].getWorldPosition(v);
    agregar(v.x, v.y + 1.0, v.z);
    for (const g of SERVOS_ANTEBRAZO[id].guias) agregar(...g);
    const x = DEDOS_3D[id].x;
    agregar(x * 0.5, 14.6, 0.6);           // entra por la muñeca
    agregar(x, NUDILLOS_Y - 0.3, 1.0);     // sale por arriba de la palma
    for (const g of this.dedos[id].falanges) {
      const { largo, fondo } = g.userData;
      v.set(0, largo * 0.5, fondo / 2 + 0.04);
      g.localToWorld(v);
      agregar(v.x, v.y, v.z);
      v.set(0, largo - 0.25, fondo / 2 + 0.04);
      g.localToWorld(v);
      agregar(v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
  }

  // Encuadra la mano completa (con etiquetas) desde el frente, un poco a la derecha.
  vistaInicial() {
    const altoMano = 32; // de la base a la punta del dedo medio, con margen
    const anchoMano = 23; // de etiqueta a etiqueta, con margen
    const fov = rad(this.camara.fov);
    const distAlto = altoMano / 2 / Math.tan(fov / 2);
    const distAncho = anchoMano / 2 / Math.tan(fov / 2) / this.camara.aspect;
    const dist = Math.max(distAlto, distAncho) * 1.08;
    const objetivo = new THREE.Vector3(0, 15.5, 0);
    const direccion = new THREE.Vector3(0.32, 0.14, 1).normalize();
    this.camara.position.copy(objetivo).addScaledVector(direccion, dist);
    this.controles.target.copy(objetivo);
    this.controles.update();
  }

  ajustarTamano() {
    const ancho = this.contenedor.clientWidth;
    const alto = this.contenedor.clientHeight;
    if (!ancho || !alto) return;
    const primeraVez = !this.yaMedido;
    this.yaMedido = true;
    this.renderer.setSize(ancho, alto);
    this.camara.aspect = ancho / alto;
    this.camara.updateProjectionMatrix();
    if (primeraVez) this.vistaInicial();
  }

  render() {
    this.controles.update();
    this.renderer.render(this.escena, this.camara);
  }
}
