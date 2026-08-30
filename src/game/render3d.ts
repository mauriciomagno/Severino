/**
 * render3d.ts — renderizador Three.js IMPERATIVO do jogo.
 * ============================================================================
 * ÚNICA responsabilidade deste módulo: DESENHAR. A simulação (física,
 * colisão, spawn, sobrevivência, a Morte) continua inteiramente em
 * GameCanvas.tsx, mutando stateRef a 60 FPS. Este módulo lê esse estado uma
 * vez por frame (em `atualizar(state, loop, nomeJogador, reduzirMovimento)`)
 * e só move/anima/mostra objetos Three já existentes — nunca decide regras
 * de jogo.
 *
 * Three.js IMPERATIVO (não React Three Fiber): a regra inegociável do
 * projeto é que React nunca re-renderiza a 60 FPS — o loop de
 * requestAnimationFrame já existente em GameCanvas.tsx deve continuar dono
 * do frame. R3F introduziria uma segunda árvore de reconciliação por cima da
 * cena, competindo pelo mesmo laço; o imperativo elimina essa camada.
 *
 * ---------------------------------------------------------------------------
 * SISTEMA DE COORDENADAS (2D -> 3D) — LEIA ANTES DE MEXER
 * ---------------------------------------------------------------------------
 * A simulação continua em pixels VIRTUAIS (960x540, ver resolucaoVirtual.ts),
 * eixo X para a direita, eixo Y para BAIXO (convenção de canvas 2D), origem
 * no canto superior esquerdo. O Three usa Y para CIMA. Em vez de espalhar
 * conversões ad hoc pelo código (a maior fonte de bugs numa migração como
 * esta), TODA posição de jogo passa por uma única função:
 *
 *   paraMundo3D(xVirtual, yVirtual) -> { x, y, z }
 *     x3D = xVirtual - LARGURA/2        (centraliza horizontalmente em 0)
 *     y3D = CHAO_Y - yVirtual           (inverte o eixo: yVirtual=CHAO_Y -> y3D=0;
 *                                         yVirtual menor, ou seja mais "para
 *                                         cima" na tela 2D, vira y3D positivo,
 *                                         ou seja mais alto no mundo 3D)
 *     z3D = 0                            (plano de jogo — profundidade extra
 *                                         é somada por quem chama, para
 *                                         camadas de parallax/cenário)
 *
 * `objetoParaMundo3D(x, y, largura, altura)` é o helper usado por obstáculos/
 * coletáveis/jogador: converte o retângulo lógico (top-left x,y,w,h) para o
 * CENTRO do objeto em 3D (x centralizado, y na metade da altura acima do
 * chão), pronto para `mesh.position.set(...)`.
 *
 * ---------------------------------------------------------------------------
 * CÂMERA — enquadramento idêntico ao 2D
 * ---------------------------------------------------------------------------
 * PerspectiveCamera com fov=FOV_GRAUS. Para que o plano z=0 (onde vive toda a
 * simulação) enquadre EXATAMENTE ALTURA (540) unidades verticais na tela,
 * calculamos a distância pela fórmula clássica de câmera de perspectiva:
 *
 *   distancia = (altura/2) / tan(fov/2)
 *
 * (metade da altura visível a uma dada distância é `distancia*tan(fov/2)`;
 * invertendo, a distância que enquadra exatamente ALTURA/2 para cima e para
 * baixo do centro óptico é a fórmula acima). Com fov=45°, altura=540:
 *   distancia = 270 / tan(22.5°) = 270 / 0.41421 ≈ 651.9 unidades.
 * A câmera fica nessa distância em Z, mais um pequeno deslocamento extra em
 * Y/Z e uma leve inclinação para revelar profundidade (ver `atualizarCamera`)
 * — pequeno o bastante para não distorcer a leitura de distâncias de pulo.
 */

import * as THREE from "three";
import { RESOLUCAO_VIRTUAL, FRACAO_CHAO } from "./resolucaoVirtual.js";
import { getPalette, lerpColor, type Paleta } from "./palette.js";
import { criarSpriteEstatico } from "./gravura.js";
import type { EstadoJogo, Obstaculo, Coletavel, TipoObstaculo, TipoColetavel, EstadoJogadorCampo } from "./gameState.js";
import type { EstadoLoop, Placa } from "./loopState.js";

const { LARGURA, ALTURA } = RESOLUCAO_VIRTUAL;
const CHAO_Y = ALTURA * FRACAO_CHAO;
const FOV_GRAUS = 45;
const DISTANCIA_CAMERA = (ALTURA / 2) / Math.tan((FOV_GRAUS / 2) * (Math.PI / 180));

/** Coordenada 3D (Three.js: Y para cima) derivada de uma coordenada 2D virtual. */
export interface Ponto3D {
  x: number;
  y: number;
  z: number;
}

/** Coordenada 3D de um objeto (centro), com o tamanho lógico original preservado. */
export interface ObjetoPonto3D extends Ponto3D {
  largura: number;
  altura: number;
}

// ---------------------------------------------------------------------------
// CONVERSÃO DE COORDENADAS — única fonte da verdade (ver cabeçalho acima).
// ---------------------------------------------------------------------------
export function paraMundo3D(xVirtual: number, yVirtual: number, zVirtual = 0): Ponto3D {
  return { x: xVirtual - LARGURA / 2, y: CHAO_Y - yVirtual, z: zVirtual };
}

/** Retângulo lógico (top-left x,y,largura,altura) -> centro em coordenadas
 * 3D, pronto para mesh.position.set(...). */
export function objetoParaMundo3D(x: number, y: number, largura: number, altura: number, z = 0): ObjetoPonto3D {
  const base = paraMundo3D(x + largura / 2, y + altura, z);
  return { x: base.x, y: base.y + altura / 2, z: base.z, largura, altura };
}

// ---------------------------------------------------------------------------
// CÉU PROCEDURAL — shader de gradiente (sem imagem), com sol com glow.
// ---------------------------------------------------------------------------
const VERTEX_CEU = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const FRAGMENT_CEU = /* glsl */ `
  varying vec3 vWorldPos;
  uniform vec3 corZenite;
  uniform vec3 corCeu;
  uniform vec3 corHorizonte;
  uniform vec3 direcaoSol;
  uniform vec3 corSol;
  void main() {
    float alturaN = clamp(normalize(vWorldPos).y * 0.5 + 0.5, 0.0, 1.0);
    vec3 cor = mix(corHorizonte, corCeu, smoothstep(0.0, 0.55, alturaN));
    cor = mix(cor, corZenite, smoothstep(0.55, 1.0, alturaN));
    float alinhamentoSol = max(dot(normalize(vWorldPos), normalize(direcaoSol)), 0.0);
    float glow = pow(alinhamentoSol, 220.0) * 3.0 + pow(alinhamentoSol, 8.0) * 0.5;
    cor += corSol * glow;
    gl_FragColor = vec4(cor, 1.0);
  }
`;

function criarCeu(): THREE.Mesh {
  const geometria = new THREE.SphereGeometry(4000, 24, 16);
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_CEU,
    fragmentShader: FRAGMENT_CEU,
    uniforms: {
      corZenite: { value: new THREE.Color("#1a6ea8") },   // azul profundo no zenite
      corCeu: { value: new THREE.Color("#5BB8E8") },       // azul tropical vibrante
      corHorizonte: { value: new THREE.Color("#a8ddf5") }, // horizonte claro/brilhante
      direcaoSol: { value: new THREE.Vector3(0.55, 0.65, 0.4) },
      corSol: { value: new THREE.Color("#fff8d0") },       // sol dourado/quente
    },
    side: THREE.BackSide,
    depthWrite: false,
  });
  return new THREE.Mesh(geometria, material);
}

// ---------------------------------------------------------------------------
// CHÃO PROCEDURAL — plano com deslocamento de vértices + CanvasTexture
// (rachaduras/manchas geradas em runtime, não é asset externo) rolando via
// offset de UV para nunca ter costura.
// ---------------------------------------------------------------------------
function criarTexturaChao(paleta: Paleta): THREE.CanvasTexture {
  const tam = 512;
  const canvas = criarSpriteEstatico(tam, tam, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, lerpColor(paleta.terraClara, paleta.clara, 0.3));
    grad.addColorStop(1, lerpColor(paleta.terraClara, paleta.terraEscura, 0.4));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    // Rachaduras/manchas determinísticas — o padrão se repete a cada tile,
    // mas como o offset de UV rola continuamente isso não é perceptível.
    ctx.strokeStyle = paleta.sombra;
    for (let i = 0; i < 40; i++) {
      const hx = Math.abs(Math.sin(i * 12.9898)) % 1;
      const hy = Math.abs(Math.sin(i * 78.233 + 4)) % 1;
      const hc = Math.abs(Math.sin(i * 37.1 + 9)) % 1;
      ctx.globalAlpha = 0.25 + hc * 0.3;
      ctx.lineWidth = 1 + hc * 1.5;
      ctx.beginPath();
      ctx.moveTo(hx * w, hy * h);
      ctx.lineTo(hx * w + (hc - 0.5) * 60, hy * h + hc * 50);
      ctx.stroke();
    }
    for (let i = 0; i < 60; i++) {
      const hx = Math.abs(Math.sin(i * 31.7 + 1)) % 1;
      const hy = Math.abs(Math.sin(i * 5.19 + 2)) % 1;
      const raio = 1 + (Math.abs(Math.sin(i * 3.3)) % 1) * 2.2;
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = paleta.sombra;
      ctx.beginPath();
      ctx.arc(hx * w, hy * h, raio, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
  const textura = new THREE.CanvasTexture(canvas as unknown as HTMLCanvasElement);
  textura.wrapS = THREE.RepeatWrapping;
  textura.wrapT = THREE.RepeatWrapping;
  textura.repeat.set(6, 3);
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}

// ---------------------------------------------------------------------------
// MAR — plano distante no horizonte com shader de brilho especular animado
// (fresnel + ondulação senoidal, sem textura de imagem). Fica invisível no
// sertão e ganha opacidade gradualmente conforme worldProgress -> litoral
// (ver atualizarMar). É o "pagamento emocional" da chegada.
// ---------------------------------------------------------------------------
const VERTEX_MAR = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const FRAGMENT_MAR = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  uniform float tempo;
  uniform float opacidade;
  uniform vec3 corMar;
  uniform vec3 corBrilho;
  void main() {
    float ondas = sin(vWorldPos.x * 0.04 + tempo * 0.6) * 0.5
                + sin(vWorldPos.x * 0.11 - tempo * 1.3 + vWorldPos.z * 0.02) * 0.5;
    float brilho = pow(max(0.0, ondas), 5.0);
    float horizonte = smoothstep(0.0, 0.35, vUv.y);
    vec3 cor = mix(corMar * 0.7, corMar, horizonte);
    cor += corBrilho * brilho * (0.4 + 0.6 * horizonte);
    gl_FragColor = vec4(cor, opacidade * (0.55 + 0.45 * horizonte));
  }
`;

function criarMar(): THREE.Mesh {
  const geometria = new THREE.PlaneGeometry(5000, 1600, 1, 1);
  geometria.rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_MAR,
    fragmentShader: FRAGMENT_MAR,
    uniforms: {
      tempo: { value: 0 },
      opacidade: { value: 0 },
      corMar: { value: new THREE.Color("#2E6E7E") },
      corBrilho: { value: new THREE.Color("#eaffff") },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometria, material);
  mesh.position.set(0, -1, -820);
  mesh.renderOrder = -1;
  return mesh;
}

// ---------------------------------------------------------------------------
// NUVENS — blobs esféricos achatados instanciados; opacidade cresce com
// worldProgress (céu mais carregado/úmido perto do litoral).
// ---------------------------------------------------------------------------
function criarNuvens(): { malha: THREE.InstancedMesh; mat: THREE.MeshStandardMaterial; quantidade: number } {
  const geo = new THREE.SphereGeometry(1, 8, 6);
  const mat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 1,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
  });
  const quantidade = 12;
  const malha = criarCamadaInstanciada(geo, mat, quantidade);
  malha.castShadow = false;
  malha.receiveShadow = false;
  return { malha, mat, quantidade };
}

function criarChao(): THREE.Mesh {
  const largura = LARGURA * 6; // margem generosa além da tela nos dois lados
  const profundidade = 900;
  const segmentosX = 60;
  const segmentosZ = 30;
  const geometria = new THREE.PlaneGeometry(largura, profundidade, segmentosX, segmentosZ);
  geometria.rotateX(-Math.PI / 2);
  // Relevo sutil procedural (deslocamento de vértices) — colinas suaves,
  // determinístico via seno (sem Math.random, estável entre frames).
  const posicoes = geometria.attributes.position;
  for (let i = 0; i < posicoes.count; i++) {
    const x = posicoes.getX(i);
    const z = posicoes.getZ(i);
    const relevo =
      Math.sin(x * 0.02 + z * 0.05) * 1.6 + Math.sin(x * 0.07 - z * 0.03) * 0.8;
    posicoes.setY(i, relevo);
  }
  geometria.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  const chao = new THREE.Mesh(geometria, material);
  chao.receiveShadow = true;
  chao.position.y = 0;
  return chao;
}

// ---------------------------------------------------------------------------
// GEOMETRIAS/MATERIAIS COMPARTILHADOS — criados UMA VEZ, nunca dentro do
// loop. Cada tipo de obstáculo/coletável reaproveita a MESMA geometria e o
// MESMO material entre todas as instâncias (pool abaixo só clona o Object3D,
// não o buffer).
// ---------------------------------------------------------------------------
function construirMandacaru(paleta: Paleta): THREE.Group {
  const grupo = new THREE.Group();
  const corTronco = new THREE.Color(paleta.terraEscura);
  const corClara = new THREE.Color(paleta.clara);
  const matTronco = new THREE.MeshStandardMaterial({ color: corTronco, roughness: 0.85 });

  // Tronco colunar com "costelas": CylinderGeometry cujo raio é modulado
  // radialmente (BufferGeometry customizada via deslocamento de vértices) —
  // dá o perfil ondulado característico do mandacaru em vez de um cilindro liso.
  function costeladoGeom(raio: number, altura: number, segRadiais = 10, gomos = 8): THREE.CylinderGeometry {
    const geo = new THREE.CylinderGeometry(raio, raio * 1.15, altura, segRadiais, 6, true);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const ang = Math.atan2(z, x);
      const r = Math.hypot(x, z);
      const onda = 1 + 0.16 * Math.cos(ang * gomos);
      pos.setX(i, Math.cos(ang) * r * onda);
      pos.setZ(i, Math.sin(ang) * r * onda);
    }
    geo.computeVertexNormals();
    return geo;
  }

  const troncoGeo = costeladoGeom(6, 60);
  const tronco = new THREE.Mesh(troncoGeo, matTronco);
  tronco.position.y = 30;
  tronco.castShadow = true;
  grupo.add(tronco);

  function braco(sinal: number, alturaBase: number, alturaBraco: number): THREE.Mesh {
    const geo = costeladoGeom(3.6, alturaBraco, 8, 6);
    const m = new THREE.Mesh(geo, matTronco);
    m.position.set(sinal * 9, alturaBase, 0);
    m.rotation.z = sinal * 0.25;
    m.castShadow = true;
    grupo.add(m);
    return m;
  }
  braco(-1, 26, 26);
  if (Math.random() > 0.35) braco(1, 34, 22);

  // Espinhos: pequenos cones distribuídos.
  const espinhoGeo = new THREE.ConeGeometry(0.5, 2.2, 4);
  const matEspinho = new THREE.MeshStandardMaterial({ color: 0x2b1a10 });
  for (let i = 0; i < 10; i++) {
    const espinho = new THREE.Mesh(espinhoGeo, matEspinho);
    const ang = i * 1.7;
    const alt = 6 + (i % 5) * 10;
    espinho.position.set(Math.cos(ang) * 6.2, alt, Math.sin(ang) * 6.2);
    espinho.rotation.z = Math.PI / 2 + ang;
    grupo.add(espinho);
  }

  if (Math.random() > 0.66) {
    const flor = new THREE.Mesh(
      new THREE.SphereGeometry(2.6, 8, 6),
      new THREE.MeshStandardMaterial({ color: corClara, emissive: corClara, emissiveIntensity: 0.15 })
    );
    flor.position.y = 62;
    grupo.add(flor);
  }
  return grupo;
}

function construirObstaculo(tipo: TipoObstaculo, paleta: Paleta): THREE.Group {
  const grupo = new THREE.Group();
  const corSombra = new THREE.Color(paleta.sombra);
  const corTerra = new THREE.Color(paleta.terraEscura);
  const corClara = new THREE.Color(paleta.clara);
  switch (tipo) {
    case "mandacaru":
      grupo.add(construirMandacaru(paleta));
      break;
    case "toco": {
      const corpo = new THREE.Mesh(
        new THREE.CylinderGeometry(9, 11, 22, 10),
        new THREE.MeshStandardMaterial({ color: corSombra, roughness: 0.9 })
      );
      corpo.position.y = 11;
      corpo.castShadow = true;
      grupo.add(corpo);
      const topo = new THREE.Mesh(
        new THREE.CylinderGeometry(11, 11, 3, 10),
        new THREE.MeshStandardMaterial({ color: corTerra, roughness: 0.9 })
      );
      topo.position.y = 22.5;
      topo.castShadow = true;
      grupo.add(topo);
      break;
    }
    case "cerca": {
      const matPoste = new THREE.MeshStandardMaterial({ color: corSombra, roughness: 0.85 });
      const posteGeo = new THREE.CylinderGeometry(1.6, 1.6, 30, 6);
      for (const sinal of [-1, 1]) {
        const poste = new THREE.Mesh(posteGeo, matPoste);
        poste.position.set(sinal * 13, 15, 0);
        poste.castShadow = true;
        grupo.add(poste);
      }
      const travessaGeo = new THREE.BoxGeometry(30, 2, 2);
      for (const altura of [10, 20]) {
        const travessa = new THREE.Mesh(travessaGeo, matPoste);
        travessa.position.set(0, altura, 0);
        travessa.castShadow = true;
        grupo.add(travessa);
      }
      break;
    }
    case "cranio": {
      const caixa = new THREE.Mesh(
        new THREE.SphereGeometry(9, 10, 8),
        new THREE.MeshStandardMaterial({ color: corClara, roughness: 0.7 })
      );
      caixa.scale.set(1, 0.7, 1.2);
      caixa.position.y = 9;
      caixa.castShadow = true;
      grupo.add(caixa);
      const matChifre = new THREE.MeshStandardMaterial({ color: corClara, roughness: 0.6 });
      const chifreGeo = new THREE.ConeGeometry(1.4, 10, 6);
      for (const sinal of [-1, 1]) {
        const chifre = new THREE.Mesh(chifreGeo, matChifre);
        chifre.position.set(sinal * 9, 12, 0);
        chifre.rotation.z = sinal * 0.9;
        grupo.add(chifre);
      }
      break;
    }
    case "pedra":
    default: {
      const geo = new THREE.DodecahedronGeometry(11, 0);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const jitter = 0.85 + 0.3 * Math.abs(Math.sin(i * 12.9898));
        pos.setXYZ(i, pos.getX(i) * jitter, pos.getY(i) * jitter * 0.8, pos.getZ(i) * jitter);
      }
      geo.computeVertexNormals();
      const pedra = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: corTerra, roughness: 0.95, flatShading: true }));
      pedra.position.y = 8;
      pedra.castShadow = true;
      grupo.add(pedra);
      break;
    }
  }
  return grupo;
}

function construirTumba(paleta: Paleta): THREE.Group {
  const grupo = new THREE.Group();
  const corPedra = new THREE.Color(paleta.terraEscura);
  const laje = new THREE.Mesh(
    new THREE.BoxGeometry(20, 16, 8),
    new THREE.MeshStandardMaterial({ color: corPedra, roughness: 0.95 })
  );
  laje.position.y = 8;
  laje.castShadow = true;
  laje.receiveShadow = true;
  grupo.add(laje);
  const matCruz = new THREE.MeshStandardMaterial({ color: paleta.sombra, roughness: 0.8 });
  const vertical = new THREE.Mesh(new THREE.BoxGeometry(1.6, 18, 1.6), matCruz);
  vertical.position.y = 25;
  const horizontal = new THREE.Mesh(new THREE.BoxGeometry(10, 1.6, 1.6), matCruz);
  horizontal.position.y = 30;
  grupo.add(vertical, horizontal);
  return grupo;
}

function construirColetavel(tipo: TipoColetavel, paleta: Paleta): THREE.Group {
  const grupo = new THREE.Group();
  switch (tipo) {
    case "agua": {
      const pote = new THREE.Mesh(
        new THREE.SphereGeometry(9, 12, 10),
        new THREE.MeshStandardMaterial({ color: paleta.terraEscura, roughness: 0.6 })
      );
      pote.scale.set(1, 0.85, 1);
      pote.castShadow = true;
      grupo.add(pote);
      const gargalo = new THREE.Mesh(
        new THREE.CylinderGeometry(2.6, 3.4, 4, 8),
        new THREE.MeshStandardMaterial({ color: paleta.clara })
      );
      gargalo.position.y = 8;
      grupo.add(gargalo);
      break;
    }
    case "cruz": {
      const mat = new THREE.MeshStandardMaterial({ color: "#e8d5a9", roughness: 0.6 });
      const v = new THREE.Mesh(new THREE.BoxGeometry(2.4, 20, 2.4), mat);
      const h = new THREE.Mesh(new THREE.BoxGeometry(12, 2.4, 2.4), mat);
      h.position.y = 5;
      v.castShadow = true; h.castShadow = true;
      grupo.add(v, h);
      break;
    }
    case "vela": {
      const corpo = new THREE.Mesh(
        new THREE.CylinderGeometry(2.6, 2.6, 14, 10),
        new THREE.MeshStandardMaterial({ color: "#f2e6c9" })
      );
      corpo.position.y = 7;
      corpo.castShadow = true;
      grupo.add(corpo);
      const chama = new THREE.Mesh(
        new THREE.ConeGeometry(1.6, 4, 8),
        new THREE.MeshStandardMaterial({ color: "#e8963c", emissive: "#e8963c", emissiveIntensity: 1.4 })
      );
      chama.position.y = 16;
      chama.name = "chama";
      grupo.add(chama);
      const luz = new THREE.PointLight("#e8963c", 1.1, 60, 2);
      luz.position.y = 16;
      grupo.add(luz);
      break;
    }
    case "moeda": {
      const moeda = new THREE.Mesh(
        new THREE.CylinderGeometry(8, 8, 1.6, 20),
        new THREE.MeshStandardMaterial({ color: "#c9a227", metalness: 0.6, roughness: 0.3 })
      );
      moeda.rotation.z = Math.PI / 2;
      moeda.position.y = 8;
      moeda.castShadow = true;
      grupo.add(moeda);
      break;
    }
    case "pao": {
      const pao = new THREE.Mesh(
        new THREE.CapsuleGeometry(6, 10, 4, 8),
        new THREE.MeshStandardMaterial({ color: "#c48a4f", roughness: 0.85 })
      );
      pao.rotation.z = Math.PI / 2;
      pao.position.y = 6;
      pao.castShadow = true;
      grupo.add(pao);
      break;
    }
    case "rede": {
      const mat = new THREE.MeshStandardMaterial({ color: "#e8d5a9", wireframe: true });
      const rede = new THREE.Mesh(new THREE.PlaneGeometry(20, 14, 6, 4), mat);
      rede.position.y = 10;
      grupo.add(rede);
      break;
    }
    case "semente":
    default: {
      const semente = new THREE.Mesh(
        new THREE.SphereGeometry(7, 12, 10),
        new THREE.MeshStandardMaterial({
          color: "#e8b93a",
          emissive: "#e8b93a",
          emissiveIntensity: 0.6,
          roughness: 0.4,
        })
      );
      semente.scale.set(0.8, 1, 0.8);
      semente.castShadow = true;
      grupo.add(semente);
      const luz = new THREE.PointLight("#ffe9a8", 2.2, 140, 2);
      grupo.add(luz);
      break;
    }
  }
  return grupo;
}

/** SEVERINO — o retirante nordestino: rig articulado (pivôs aninhados nas
 * articulações reais — quadril/joelho/tornozelo, ombro/cotovelo/punho,
 * tronco/pescoço/cabeça/chapéu) com geometria afunilada (LatheGeometry) em
 * vez de cápsulas cruas, para dar silhueta magra e alongada. O rosto some
 * na sombra (sem olhos/boca) — "há muitos Severinos", o anonimato é
 * proposital. Retorna { grupo, partes, pose } consumido por animarSeverino. */

/** Segmento de membro afunilado: LatheGeometry cujo perfil vai do punho/
 * tornozelo (fino, em y=-comprimento) até a articulação-mãe (y=0, TOPO —
 * é aqui que o pivô do grupo-pai deve ficar, para que rotacionar o pivô
 * balance o segmento inteiro em torno da articulação certa). */
function segmentoMembro(
  comprimento: number,
  raioTopo: number,
  raioPonta: number,
  mat: THREE.Material,
  segmentos = 8
): THREE.Mesh {
  const pontos = [
    new THREE.Vector2(Math.max(0.5, raioPonta * 0.6), -comprimento),
    new THREE.Vector2(raioPonta, -comprimento * 0.86),
    new THREE.Vector2(Math.max(raioTopo, raioPonta) * 1.06, -comprimento * 0.46),
    new THREE.Vector2(raioTopo, -comprimento * 0.1),
    new THREE.Vector2(raioTopo * 0.88, 0),
  ];
  const geo = new THREE.LatheGeometry(pontos, segmentos);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

/** Chapéu de aba larga: LatheGeometry (copa cônica + aba) com leve ondulação
 * radial (mesma técnica do mandacaru — modulação angular do raio) para não
 * ficar um disco perfeitamente circular. */
function construirChapeu(mat: THREE.Material): THREE.Mesh {
  const pontos = [
    new THREE.Vector2(0.5, 9),
    new THREE.Vector2(4.6, 8.6),
    new THREE.Vector2(5.4, 4.2),
    new THREE.Vector2(5.0, 2.6),
    new THREE.Vector2(13.5, 1.6),
    new THREE.Vector2(14.2, 0.6),
    new THREE.Vector2(12.5, -0.4),
    new THREE.Vector2(4.6, 1.2),
  ];
  const geo = new THREE.LatheGeometry(pontos, 16);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ang = Math.atan2(z, x);
    const r = Math.hypot(x, z);
    if (r > 9) {
      const onda = 1 + 0.05 * Math.sin(ang * 5) * Math.min(1, (r - 9) / 5);
      pos.setXYZ(i, x * onda, y + Math.sin(ang * 5) * 0.35 * Math.min(1, (r - 9) / 5), z * onda);
    }
  }
  geo.computeVertexNormals();
  const chapeu = new THREE.Mesh(geo, mat);
  chapeu.castShadow = true;
  return chapeu;
}

/** Um braço articulado (ombro -> cotovelo -> punho). */
interface BracoRig {
  ombro: THREE.Group;
  cotovelo: THREE.Group;
  punho: THREE.Group;
  antebraco: THREE.Mesh;
  mao: THREE.Mesh;
}

/** Uma perna articulada (quadril -> joelho -> tornozelo). */
interface PernaRig {
  quadril: THREE.Group;
  joelho: THREE.Group;
  tornozelo: THREE.Group;
}

/** Partes nomeadas do rig de Severino, usadas por animarSeverino. */
interface SeverinoPartes {
  raizQuadril: THREE.Group;
  tronco: THREE.Group;
  peito: THREE.Group;
  cabeca: THREE.Mesh;
  chapeu: THREE.Mesh;
  bracoEsq: BracoRig;
  bracoDir: BracoRig;
  pernaEsq: PernaRig;
  pernaDir: PernaRig;
}

/** Ângulos/valores correntes de pose (lerp suave entre poses, ver animarSeverino). */
interface SeverinoPose {
  quadrilEsq: number;
  joelhoEsq: number;
  quadrilDir: number;
  joelhoDir: number;
  ombroEsq: number;
  cotoveloEsq: number;
  ombroDir: number;
  cotoveloDir: number;
  inclinacaoTronco: number;
  bobY: number;
  balancoZ: number;
  escalaY: number;
  rotZ: number;
}

interface SeverinoRig {
  grupo: THREE.Group;
  partes: SeverinoPartes;
  pose: SeverinoPose;
}

function construirSeverino(paleta: Paleta): SeverinoRig {
  const grupo = new THREE.Group(); // origem = pés no chão (y=0)

  const corPeleSombra = lerpColor(paleta.sombra, "#a06840", 0.6);
  const matPele = new THREE.MeshStandardMaterial({ color: corPeleSombra, roughness: 0.9 });
  // Calça cáqui/bege clara como na imagem de referência
  const matCalca = new THREE.MeshStandardMaterial({ color: "#C4A265", roughness: 0.9 });
  // Botas marrons escuras, estilo aventureiro
  const matBota = new THREE.MeshStandardMaterial({ color: "#4A2810", roughness: 0.85 });
  // Camisa verde oliva como o aventureiro da imagem
  const matCamisa = new THREE.MeshStandardMaterial({ color: "#6B8C42", roughness: 0.88 });
  // Trouxa/mochila verde escuro
  const matTrouxa = new THREE.MeshStandardMaterial({ color: "#4A6030", roughness: 0.95 });
  const matPau = new THREE.MeshStandardMaterial({ color: "#5a3a18", roughness: 0.9 });
  // Chapéu marrom aventureiro (como na imagem)
  const matChapeu = new THREE.MeshStandardMaterial({ color: "#7A5020", roughness: 0.5, metalness: 0.05 });

  // ---- Raiz do quadril: origem da física e da animação vertical/bob ----
  const raizQuadril = new THREE.Group();
  raizQuadril.position.y = 34;
  grupo.add(raizQuadril);

  // ---- Tronco: inclinação na corrida, volume da camisa ----
  const tronco = new THREE.Group();
  raizQuadril.add(tronco);
  const pontosCamisa = [
    new THREE.Vector2(7.6, 0), // barra da camisa, solta
    new THREE.Vector2(6.6, 2.5),
    new THREE.Vector2(5.5, 8),
    new THREE.Vector2(5.0, 15),
    new THREE.Vector2(5.8, 22), // peito/ombros
    new THREE.Vector2(4.4, 25.5),
  ];
  const geoCamisa = new THREE.LatheGeometry(pontosCamisa, 10);
  const camisa = new THREE.Mesh(geoCamisa, matCamisa);
  camisa.castShadow = true;
  camisa.receiveShadow = true;
  tronco.add(camisa);

  // Peito: suporte do pescoço e da cabeça
  const peito = new THREE.Group();
  peito.position.y = 25.5;
  tronco.add(peito);

  const pescoco = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 3.5, 8), matPele);
  pescoco.position.y = 1.5;
  pescoco.castShadow = true;
  peito.add(pescoco);

  // Cabeça: formaAlongada, sem feições (proposital — "muitos Severinos")
  const cabeca = new THREE.Mesh(new THREE.SphereGeometry(5.2, 12, 10), matPele);
  cabeca.scale.set(0.84, 1.05, 0.9);
  cabeca.position.y = 6.2;
  cabeca.castShadow = true;
  peito.add(cabeca);

  // Chapéu de aba larga — silhueta icônica do retirante
  const chapeu = construirChapeu(matChapeu);
  chapeu.position.y = 9.4;
  peito.add(chapeu);

  // ---- Braços: ombro -> cotovelo -> punho, articulados ----
  // POSIÇÃO: ombro.position é relativa ao peito (parent final).
  // Peito está no topo do tronco (y=25.5). O ombro da camisa
  // fica em y≈22 no espaço do tronco → y≈-3 no espaço do peito.
  function braco(sinal: number): BracoRig {
    const ombro = new THREE.Group();
    ombro.position.set(sinal * 5.4, -3, 0); // y relativo ao peito
    const antebracoComp = 13;
    const bracoMesh = segmentoMembro(15, 2.2, 1.5, matCamisa, 8);
    ombro.add(bracoMesh);
    const cotovelo = new THREE.Group();
    cotovelo.position.y = -14;
    ombro.add(cotovelo);
    const antebracoMesh = segmentoMembro(antebracoComp, 1.5, 1.1, matPele, 8);
    cotovelo.add(antebracoMesh);
    const punho = new THREE.Group();
    punho.position.y = -antebracoComp;
    cotovelo.add(punho);
    const mao = new THREE.Mesh(new THREE.SphereGeometry(1.3, 6, 5), matPele);
    mao.castShadow = true;
    punho.add(mao);
    // Não adicionado ao grupo raiz — será adicionado ao peito abaixo.
    return { ombro, cotovelo, punho, antebraco: antebracoMesh, mao };
  }
  const bracoEsq = braco(-1);
  const bracoDir = braco(1);
  // Re-parent arms from grupo to peito (Three.js: add() auto-removes from old parent)
  peito.add(bracoEsq.ombro);
  peito.add(bracoDir.ombro);

  // Trouxa amarrada às costas — imagem clássica do retirante, mas discreta:
  // o "pau de carregar trouxa" original tinha 32 de comprimento (corpo tem
  // ~114 de altura) e apontava para cima, lendo como um espantalho na
  // silhueta (dois traços finos erguidos). Reduzido a um coto curto só o
  // bastante para sugerir a vara sem dominar a leitura, e reposicionado
  // junto ao ombro/costas em vez de erguido acima da cabeça.
  const trouxaGrupo = new THREE.Group();
  trouxaGrupo.position.set(-2.4, 20, -3.2);
  trouxaGrupo.rotation.z = -0.35;
  trouxaGrupo.rotation.x = 0.25;
  const pauTrouxa = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 9, 6), matPau);
  pauTrouxa.position.y = -1;
  pauTrouxa.castShadow = true;
  trouxaGrupo.add(pauTrouxa);
  const trouxa = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 7), matTrouxa);
  trouxa.scale.set(1, 0.8, 1);
  trouxa.position.set(0, -5.5, 0);
  trouxa.castShadow = true;
  trouxaGrupo.add(trouxa);
  peito.add(trouxaGrupo);

  // ---- Pernas: quadril -> joelho -> tornozelo -> pé/bota ----
  function perna(sinal: number): PernaRig {
    const quadril = new THREE.Group();
    quadril.position.set(sinal * 3.0, 0, 0);
    raizQuadril.add(quadril);
    const coxaComp = 17;
    const coxaMesh = segmentoMembro(coxaComp, 3.2, 2.2, matCalca, 8);
    quadril.add(coxaMesh);
    const joelho = new THREE.Group();
    joelho.position.y = -coxaComp;
    quadril.add(joelho);
    const canelaComp = 15;
    const canelaMesh = segmentoMembro(canelaComp, 2.2, 1.3, matCalca, 8);
    joelho.add(canelaMesh);
    const tornozelo = new THREE.Group();
    tornozelo.position.y = -canelaComp;
    joelho.add(tornozelo);
    // Bota de couro do retirante
    const bota = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 5), matBota);
    bota.position.set(0, -0.6, 1.5);
    bota.castShadow = true;
    bota.receiveShadow = true;
    tornozelo.add(bota);
    // Dope simple na bota
    const doleta = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 4), matPele);
    doleta.position.set(0.8, 0.3, 0.5);
    doleta.castShadow = true;
    tornozelo.add(doleta);
    return { quadril, joelho, tornozelo };
  }
  const pernaEsq = perna(-1);
  const pernaDir = perna(1);

  return {
    grupo,
    partes: {
      raizQuadril, tronco, peito, cabeca, chapeu,
      bracoEsq, bracoDir, pernaEsq, pernaDir,
    },
    // Ângulos correntes (para lerp suave entre poses — evita troca brusca).
    pose: {
      quadrilEsq: 0, joelhoEsq: 0, quadrilDir: 0, joelhoDir: 0,
      ombroEsq: 0, cotoveloEsq: 0, ombroDir: 0, cotoveloDir: 0,
      inclinacaoTronco: 0, bobY: 0, balancoZ: 0, escalaY: 1, rotZ: 0,
    },
  };
}

/** A MORTE — vulto alto e indefinido: geometria alongada com material
 * fresnel (mais opaco na borda, translúcido no centro) simulando um contorno
 * indefinido, sem qualquer figuração literal (nada de caveira/foice). */
const VERTEX_MORTE = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vPosOriginal;
  uniform float tempo;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosOriginal = position;
    // Borda indefinida: um deslocamento sutil e não-uniforme do contorno,
    // baseado em senos de baixa frequência (nunca ruído literal de "malha
    // rasgada") — o vulto nunca fica com silhueta estável, perturba sem se
    // declarar como nada específico.
    float ondulacao = sin(position.y * 0.35 + tempo * 1.7) * 0.5
                     + sin(position.x * 0.6 - tempo * 1.1) * 0.5;
    vec3 deslocada = position + normal * ondulacao * 1.1;
    vec4 mv = modelViewMatrix * vec4(deslocada, 1.0);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAGMENT_MORTE = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vPosOriginal;
  uniform float ameaca;
  uniform float tempo;
  void main() {
    float fresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0), 2.2);
    // Flutuação lenta e irregular da opacidade — como se o vulto nunca
    // estivesse totalmente "presente", sem piscar de forma legível/rítmica.
    float flicker = 0.85 + 0.15 * sin(tempo * 2.3 + vPosOriginal.y * 0.2)
                          * sin(tempo * 0.7 + vPosOriginal.x * 0.15);
    float alpha = clamp(0.10 + fresnel * 0.75, 0.0, 1.0) * clamp(ameaca, 0.0, 1.0) * flicker;
    vec3 cor = mix(vec3(0.015, 0.015, 0.03), vec3(0.09, 0.08, 0.12), fresnel);
    gl_FragColor = vec4(cor, alpha);
  }
`;

interface MorteRig {
  grupo: THREE.Group;
  mat: THREE.ShaderMaterial;
  luz: THREE.PointLight;
}

function construirMorte(): MorteRig {
  const geo = new THREE.CapsuleGeometry(14, 60, 6, 10);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERTEX_MORTE,
    fragmentShader: FRAGMENT_MORTE,
    uniforms: { ameaca: { value: 0 }, tempo: { value: 0 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  const luz = new THREE.PointLight("#0a0a14", 0.6, 200, 2);
  const grupo = new THREE.Group();
  grupo.add(mesh, luz);
  grupo.visible = false;
  return { grupo, mat, luz };
}

// ---------------------------------------------------------------------------
// PLACA (marco com o nome do jogador) — reaproveita a textura de canvas já
// gerada por criarSpritePlaca (ver GameCanvas.tsx) num plano.
// ---------------------------------------------------------------------------

/** Grupo Three.js de uma placa, com dados extras anexados via userData. */
interface PlacaUserData {
  mesh: THREE.Mesh;
  textura: THREE.CanvasTexture | null;
  spriteOrigem?: unknown;
}

function construirPlaca(): THREE.Group {
  const geo = new THREE.PlaneGeometry(28, 26);
  const mat = new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.9 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  const posteGeo = new THREE.CylinderGeometry(1.2, 1.2, 14, 6);
  const posteMat = new THREE.MeshStandardMaterial({ color: "#3a2415" });
  const poste = new THREE.Mesh(posteGeo, posteMat);
  poste.position.y = -20;
  const grupo = new THREE.Group();
  grupo.add(mesh, poste);
  mesh.position.y = -4;
  grupo.visible = false;
  const userData: PlacaUserData = { mesh, textura: null };
  grupo.userData = userData;
  return grupo;
}

// ---------------------------------------------------------------------------
// POOL genérico — reaproveita instâncias existentes (reposicionando) em vez
// de criar/destruir a cada spawn. `construtor(tipo)` só é chamado a mais
// (nunca por frame do jogo) quando o pool precisa crescer.
// ---------------------------------------------------------------------------
interface Pool<Tipo extends string> {
  obter(indice: number, tipo: Tipo): THREE.Object3D;
  ocultarApartirDe(indice: number): void;
  dispose(): void;
}

function criarPool<Tipo extends string>(
  cenaGrupo: THREE.Group,
  construtor: (tipo: Tipo) => THREE.Object3D
): Pool<Tipo> {
  interface Entrada {
    tipo: Tipo;
    obj: THREE.Object3D;
  }
  const instancias: Array<Entrada | undefined> = []; // { tipo, obj }
  function obter(indice: number, tipo: Tipo): THREE.Object3D {
    let entrada = instancias[indice];
    if (!entrada || entrada.tipo !== tipo) {
      if (entrada) cenaGrupo.remove(entrada.obj);
      const obj = construtor(tipo);
      cenaGrupo.add(obj);
      entrada = { tipo, obj };
      instancias[indice] = entrada;
    }
    entrada.obj.visible = true;
    return entrada.obj;
  }
  function ocultarApartirDe(indice: number): void {
    for (let i = indice; i < instancias.length; i++) {
      const entrada = instancias[i];
      if (entrada) entrada.obj.visible = false;
    }
  }
  function dispose(): void {
    for (const entrada of instancias) {
      if (!entrada) continue;
      entrada.obj.traverse((o: THREE.Object3D) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m: THREE.Material) => m.dispose());
        }
      });
      cenaGrupo.remove(entrada.obj);
    }
    instancias.length = 0;
  }
  return { obter, ocultarApartirDe, dispose };
}

// ---------------------------------------------------------------------------
// VEGETAÇÃO/PEDRAS DE FUNDO — InstancedMesh: dezenas de silhuetas repetidas
// (mandacarus/pedras distantes) custam UMA única chamada de desenho por
// camada, em vez de uma malha por planta. Reposicionadas por frame (rolagem
// de parallax), nunca recriadas.
// ---------------------------------------------------------------------------
function criarCamadaInstanciada(
  geometria: THREE.BufferGeometry,
  material: THREE.Material,
  quantidade: number
): THREE.InstancedMesh {
  const malha = new THREE.InstancedMesh(geometria, material, quantidade);
  malha.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  malha.castShadow = true;
  malha.receiveShadow = true;
  return malha;
}

// ---------------------------------------------------------------------------
// PARTÍCULAS — sistema único, pooled, com teto FIXO (THREE.Points sobre uma
// única BufferGeometry). `emitir()` só reescreve um slot existente (buffer
// circular) — nunca aloca geometria/atributo novo por frame. Cobre: poeira
// dos pés, nuvem de pouso, respingo de água e poeira fina em suspensão.
// ---------------------------------------------------------------------------
const MAX_PARTICULAS = 260;
const TIPO_PARTICULA_GRAVIDADE = 0; // poeira do pé / pouso / respingo: cai
const TIPO_PARTICULA_SUSPENSAO = 1; // poeira fina no ar quente: flutua devagar

function criarTexturaParticula(): THREE.CanvasTexture {
  const tam = 32;
  const canvas = criarSpriteEstatico(tam, tam, (ctx, w, h) => {
    const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.4, "rgba(255,255,255,0.55)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });
  return new THREE.CanvasTexture(canvas as unknown as HTMLCanvasElement);
}

const VERTEX_PARTICULA = /* glsl */ `
  attribute float aTamanho;
  attribute float aAlfa;
  attribute vec3 aCor;
  varying float vAlfa;
  varying vec3 vCor;
  void main() {
    vAlfa = aAlfa;
    vCor = aCor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aTamanho * (320.0 / max(1.0, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAGMENT_PARTICULA = /* glsl */ `
  uniform sampler2D mapa;
  varying float vAlfa;
  varying vec3 vCor;
  void main() {
    vec4 tex = texture2D(mapa, gl_PointCoord);
    if (tex.a * vAlfa < 0.01) discard;
    gl_FragColor = vec4(vCor, tex.a * vAlfa);
  }
`;

interface SistemaParticulas {
  pontos: THREE.Points;
  emitir(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    tamanho: number, vida: number,
    cor: THREE.Color, tipo: number
  ): void;
  atualizar(dtS: number): void;
  dispose(): void;
  TIPO_PARTICULA_GRAVIDADE: number;
  TIPO_PARTICULA_SUSPENSAO: number;
}

function criarSistemaParticulas(): SistemaParticulas {
  const geometria = new THREE.BufferGeometry();
  const posicoes = new Float32Array(MAX_PARTICULAS * 3);
  const cores = new Float32Array(MAX_PARTICULAS * 3);
  const tamanhos = new Float32Array(MAX_PARTICULAS);
  const alfas = new Float32Array(MAX_PARTICULAS);
  geometria.setAttribute("position", new THREE.BufferAttribute(posicoes, 3));
  geometria.setAttribute("aCor", new THREE.BufferAttribute(cores, 3));
  geometria.setAttribute("aTamanho", new THREE.BufferAttribute(tamanhos, 1));
  geometria.setAttribute("aAlfa", new THREE.BufferAttribute(alfas, 1));

  const textura = criarTexturaParticula();
  const material = new THREE.ShaderMaterial({
    uniforms: { mapa: { value: textura } },
    vertexShader: VERTEX_PARTICULA,
    fragmentShader: FRAGMENT_PARTICULA,
    transparent: true,
    depthWrite: false,
  });
  const pontos = new THREE.Points(geometria, material);
  pontos.frustumCulled = false;

  const velocidades = new Float32Array(MAX_PARTICULAS * 3);
  const vidas = new Float32Array(MAX_PARTICULAS);
  const vidasMax = new Float32Array(MAX_PARTICULAS);
  const tamanhosBase = new Float32Array(MAX_PARTICULAS);
  const tipos = new Uint8Array(MAX_PARTICULAS);
  let cursor = 0;

  /** Ocupa o próximo slot do buffer circular — nunca cresce além do teto. */
  function emitir(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    tamanho: number, vida: number,
    cor: THREE.Color, tipo: number
  ): void {
    const i = cursor;
    cursor = (cursor + 1) % MAX_PARTICULAS;
    posicoes[i * 3] = x; posicoes[i * 3 + 1] = y; posicoes[i * 3 + 2] = z;
    velocidades[i * 3] = vx; velocidades[i * 3 + 1] = vy; velocidades[i * 3 + 2] = vz;
    cores[i * 3] = cor.r; cores[i * 3 + 1] = cor.g; cores[i * 3 + 2] = cor.b;
    tamanhosBase[i] = tamanho;
    vidasMax[i] = vida;
    vidas[i] = vida;
    tipos[i] = tipo;
  }

  function atualizar(dtS: number): void {
    for (let i = 0; i < MAX_PARTICULAS; i++) {
      if (vidas[i] <= 0) { if (alfas[i] !== 0) alfas[i] = 0; continue; }
      vidas[i] -= dtS;
      if (vidas[i] <= 0) { vidas[i] = 0; alfas[i] = 0; continue; }
      const t = 1 - vidas[i] / vidasMax[i];
      posicoes[i * 3] += velocidades[i * 3] * dtS;
      posicoes[i * 3 + 1] += velocidades[i * 3 + 1] * dtS;
      posicoes[i * 3 + 2] += velocidades[i * 3 + 2] * dtS;
      if (tipos[i] === TIPO_PARTICULA_GRAVIDADE) {
        velocidades[i * 3 + 1] -= 95 * dtS;
      } else {
        velocidades[i * 3 + 1] += Math.sin(t * 6 + i) * 0.5 * dtS;
      }
      tamanhos[i] = tamanhosBase[i] * (1 + t * 0.7);
      alfas[i] = Math.sin(Math.PI * Math.min(1, t * 1.4)) * (1 - t * 0.25);
    }
    geometria.attributes.position.needsUpdate = true;
    geometria.attributes.aAlfa.needsUpdate = true;
    geometria.attributes.aTamanho.needsUpdate = true;
    geometria.attributes.aCor.needsUpdate = true;
  }

  function dispose(): void {
    geometria.dispose();
    material.dispose();
    textura.dispose();
  }

  return { pontos, emitir, atualizar, dispose, TIPO_PARTICULA_GRAVIDADE, TIPO_PARTICULA_SUSPENSAO };
}

export function suportaWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (canvas.getContext("webgl2") || canvas.getContext("webgl")));
  } catch {
    return false;
  }
}

/** API pública do renderizador 3D, retornada por criarRenderer3D. */
export interface Renderer3D {
  resize(cssWidth: number, cssHeight: number): void;
  atualizar(state: EstadoJogo, loop: EstadoLoop, nomeJogador: string, reduzirMovimento: boolean): void;
  dispose(): void;
  dispararShakeMorte(): void;
  dispararRespiroVitoria(): void;
}

/**
 * Cria o renderizador 3D completo ligado ao <canvas> fornecido.
 */
export function criarRenderer3D(canvas: HTMLCanvasElement): Renderer3D {
  const dprMax = Math.min(window.devicePixelRatio || 1, 2);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(dprMax);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV_GRAUS, LARGURA / ALTURA, 1, 5000);
  camera.position.set(0, ALTURA * 0.08, DISTANCIA_CAMERA * 1.03);
  camera.lookAt(0, -ALTURA * 0.02, 0);

  // ---- Iluminação: sol tropical (direcional + sombra), preenchimento (hemisfério verde/quente),
  // luz de rebote sutil (ponto de luz fraca vinda de baixo/frente). ----
  const sol = new THREE.DirectionalLight(0xfff5d0, 2.8);  // sol quente/dourado
  sol.position.set(200, 350, 200);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  sol.shadow.camera.left = -LARGURA * 0.9;
  sol.shadow.camera.right = LARGURA * 0.9;
  sol.shadow.camera.top = 300;
  sol.shadow.camera.bottom = -80;
  sol.shadow.camera.near = 10;
  sol.shadow.camera.far = 900;
  sol.shadow.bias = -0.005;
  scene.add(sol);
  scene.add(sol.target);

  // Fill light: céu azul por cima, sub-bosque verde por baixo
  const fillLight = new THREE.HemisphereLight(0x87CEEB, 0x3a6e28, 0.6);
  scene.add(fillLight);

  const rebote = new THREE.PointLight(0xffd080, 0.4, 280, 2);
  rebote.position.set(-40, 20, 120);
  scene.add(rebote);

  // ---- Céu procedural ----
  const ceu = criarCeu();
  scene.add(ceu);

  // ---- Fog azulado/tropical ----
  const fog = new THREE.Fog(0x5BB8E8, 350, 1800);
  scene.fog = fog;

  // ---- Chão ----
  const chao = criarChao();
  const texturaChao = criarTexturaChao(getPalette(0));
  (chao.material as THREE.MeshStandardMaterial).map = texturaChao;
  scene.add(chao);

  // ---- Camadas de parallax em profundidade real (Z) ----
  const grupoObstaculos = new THREE.Group();
  const grupoColetaveis = new THREE.Group();
  const grupoPlacas = new THREE.Group();
  const grupoSeverino = new THREE.Group();
  scene.add(grupoObstaculos, grupoColetaveis, grupoPlacas, grupoSeverino);

  const poolObstaculos = criarPool<TipoObstaculo>(grupoObstaculos, (tipo) => construirObstaculo(tipo, getPalette(0)));
  const poolColetaveis = criarPool<TipoColetavel>(grupoColetaveis, (tipo) => construirColetavel(tipo, getPalette(0)));
  const poolPlacas = criarPool<"placa">(grupoPlacas, () => construirPlaca());

  const severino = construirSeverino(getPalette(0));
  grupoSeverino.add(severino.grupo);

  const morte = construirMorte();
  scene.add(morte.grupo);

  // ---- Serras distantes — verdes tropicais como na imagem de referência ----
  const geoSerra = new THREE.ConeGeometry(1, 1, 5);
  const matSerra = new THREE.MeshStandardMaterial({ color: "#2D6A2A", roughness: 1, fog: true });
  const QUANTIDADE_SERRAS = 24;
  const serras = criarCamadaInstanciada(geoSerra, matSerra, QUANTIDADE_SERRAS);
  serras.castShadow = false;
  scene.add(serras);

  // ---- Vegetação/arbustos de fundo — verde selva ----
  const geoArbusto = new THREE.SphereGeometry(1, 6, 5);
  const matArbusto = new THREE.MeshStandardMaterial({ color: "#3A8C30", roughness: 1 });
  const QUANTIDADE_ARBUSTOS = 30;
  const arbustos = criarCamadaInstanciada(geoArbusto, matArbusto, QUANTIDADE_ARBUSTOS);
  scene.add(arbustos);

  // ---- Árvores tropicais de fundo (substituindo mandacarus) — troncos altos ----
  const geoMandacaruFundo = new THREE.CylinderGeometry(0.8, 1, 1, 6);
  const matMandacaruFundo = new THREE.MeshStandardMaterial({ color: "#4A7835", roughness: 1 });
  const QUANTIDADE_MANDACARUS_FUNDO = 18;
  const mandacarusFundo = criarCamadaInstanciada(geoMandacaruFundo, matMandacaruFundo, QUANTIDADE_MANDACARUS_FUNDO);
  mandacarusFundo.castShadow = false;
  scene.add(mandacarusFundo);

  // ---- Grama / vegetação rasteira — verde claro vibrante ----
  const geoCapim = new THREE.ConeGeometry(0.6, 1, 4);
  const matCapim = new THREE.MeshStandardMaterial({ color: "#6BAA40", roughness: 1 });
  const QUANTIDADE_CAPIM = 46;
  const capim = criarCamadaInstanciada(geoCapim, matCapim, QUANTIDADE_CAPIM);
  capim.castShadow = false;
  scene.add(capim);

  // ---- Pedras e raízes espalhadas ----
  const geoPedraFundo = new THREE.DodecahedronGeometry(1, 0);
  const matPedraFundo = new THREE.MeshStandardMaterial({ color: "#6B7A5A", roughness: 0.95, flatShading: true });
  const QUANTIDADE_PEDRAS_FUNDO = 10;
  const pedrasFundo = criarCamadaInstanciada(geoPedraFundo, matPedraFundo, QUANTIDADE_PEDRAS_FUNDO);
  scene.add(pedrasFundo);

  const geoOssoFundo = new THREE.CapsuleGeometry(0.5, 1, 3, 6);
  const matOssoFundo = new THREE.MeshStandardMaterial({ color: "#c8c0a0", roughness: 0.8 });
  const QUANTIDADE_OSSOS_FUNDO = 8;
  const ossosFundo = criarCamadaInstanciada(geoOssoFundo, matOssoFundo, QUANTIDADE_OSSOS_FUNDO);
  scene.add(ossosFundo);

  // ---- Mar (clímax visual do litoral) ----
  const mar = criarMar();
  scene.add(mar);
  const marMaterial = mar.material as THREE.ShaderMaterial;

  // ---- Nuvens (mais carregadas/úmidas perto do litoral) ----
  const { malha: nuvens, mat: matNuvem, quantidade: QUANTIDADE_NUVENS } = criarNuvens();
  scene.add(nuvens);

  // ---- Partículas: poeira dos pés, pouso, respingo de água, poeira em
  // suspensão. Teto fixo (MAX_PARTICULAS), nunca aloca por frame. ----
  const particulas = criarSistemaParticulas();
  scene.add(particulas.pontos);

  // ---- Túmulos decorativos (reciclados como pool simples, sem colisão) ----
  const grupoTumbas = new THREE.Group();
  scene.add(grupoTumbas);
  const poolTumbas = criarPool<"tumba">(grupoTumbas, () => construirTumba(getPalette(0)));

  const dummy = new THREE.Object3D();
  const iShake = { t: 0, ativo: false };
  const iVitoria = { t: 0, ativo: false };

  // Distância base da câmera (ver cabeçalho: distancia = (altura/2)/tan(fov/2)).
  // Em telas mais ESTREITAS que 16:9 (celular em pé, por ex.), a largura
  // visível a essa distância ficaria menor que os 960 lógicos que a física
  // assume (ver alcanceHorizontalCanvas em GameCanvas.tsx) — encolhendo o
  // tempo de reação diante de obstáculos. Em vez de pillarbox (que exigiria
  // reintroduzir barras 2D por cima do WebGL), afastamos a câmera o
  // suficiente para que a largura de 960 continue SEMPRE inteiramente
  // visível (o excesso de altura visível sertão/céu além de 540 é bônus
  // estético, nunca corta jogabilidade) — o mesmo espírito do "contain" do
  // canvas 2D, resolvido por distância de câmera em vez de barras.
  let distanciaBase = DISTANCIA_CAMERA;
  function resize(cssWidth: number, cssHeight: number): void {
    renderer.setSize(cssWidth, cssHeight, true);
    const aspecto = cssWidth / Math.max(1, cssHeight);
    camera.aspect = aspecto;
    const vfovRad = (FOV_GRAUS / 2) * (Math.PI / 180);
    const distanciaParaLargura = (LARGURA / 2) / (Math.tan(vfovRad) * aspecto);
    distanciaBase = Math.max(DISTANCIA_CAMERA, distanciaParaLargura);
    camera.updateProjectionMatrix();
  }

  function atualizarAtmosfera(worldProgress: number, paleta: Paleta): void {
    const ceuMaterial = ceu.material as THREE.ShaderMaterial;
    ceuMaterial.uniforms.corCeu.value.set(paleta.ceu);
    ceuMaterial.uniforms.corHorizonte.value.set(lerpColor(paleta.ceu, "#c8eaf8", 0.55));
    ceuMaterial.uniforms.corZenite.value.set(lerpColor("#1a6ea8", paleta.ceu, 0.35));
    fog.color.set(paleta.ceu);
    // Litoral: névoa mais densa e difusa (mar úmido); sertão: ar tropical, leve.
    const near = 350 - worldProgress * 100;
    const far = 1800 - worldProgress * 800;
    fog.near = near;
    fog.far = far;
    scene.background = null;

    // Sol mais intenso e quente na floresta, mais difuso no litoral.
    sol.intensity = 2.8 - worldProgress * 1.0;

    // Chão: terra avermelhada → areia/granito na chegada.
    const chaoMaterial = chao.material as THREE.MeshStandardMaterial;
    chaoMaterial.color.set(lerpColor("#ffffff", "#e2e8d8", worldProgress * 0.8));
    chaoMaterial.roughness = 1 - worldProgress * 0.45;

    // Mar: some no sertão, aparece gradualmente na chegada.
    const opacidadeMar = Math.max(0, Math.min(1, (worldProgress - 0.45) / 0.5));
    marMaterial.uniforms.opacidade.value = opacidadeMar;
    marMaterial.uniforms.corMar.value.set(paleta.terraEscura);
    marMaterial.uniforms.corBrilho.value.set(lerpColor(paleta.clara, "#ffffff", 0.6));

    // Nuvens: mais volumosas/visíveis perto do litoral.
    matNuvem.opacity = Math.min(0.8, worldProgress * 1.1);
    matNuvem.color.set(lerpColor("#f8fbff", "#f0faff", worldProgress));
  }

  // CRITÉRIO PARA `reduzirMovimento` (prefers-reduced-motion) — NÃO REGREDIR:
  // essa flag existe para atenuar movimento SUPÉRFLUO e desconfortável (o
  // tipo que causa enjoo/desconforto vestibular): tremor de câmera (shake),
  // respiro/bob de câmera, seguimento de câmera, distorção/pulsação de tela,
  // excesso de partículas. Ela NUNCA deve desligar animação que é
  // INFORMAÇÃO DE JOGO: o ciclo de passada de Severino (pernas/braços/bob do
  // corpo), transições de pose, ou a rotação/flutuação de coletáveis (sinal
  // de "isto é pegável"). Um personagem congelado enquanto o mundo rola é
  // ilegível, não é acessibilidade — é o oposto dela.
  function atualizarCamera(state: EstadoJogo, _loop: EstadoLoop, reduzirMovimento: boolean): void {
    const jogadorX = state.jogador.x + state.jogador.largura / 2 - LARGURA / 2;
    // Leve seguimento em X dentro de um limite — nunca perde o quadro geral.
    const alvoSeguimento = reduzirMovimento ? 0 : Math.max(-40, Math.min(40, jogadorX * 0.12));
    camera.position.x += (alvoSeguimento - camera.position.x) * 0.06;

    let shakeX = 0, shakeY = 0;
    if (iShake.ativo && !reduzirMovimento) {
      iShake.t += 1;
      const forca = Math.max(0, 1 - iShake.t / 24);
      shakeX = (Math.random() - 0.5) * 6 * forca;
      shakeY = (Math.random() - 0.5) * 4 * forca;
      if (forca <= 0) iShake.ativo = false;
    }

    let respiroY = 0;
    if (iVitoria.ativo && !reduzirMovimento) {
      iVitoria.t += 0.01;
      respiroY = Math.sin(iVitoria.t) * 4;
    }

    const baseY = ALTURA * 0.08 + respiroY;
    const baseZ = distanciaBase * 1.03;
    camera.position.y = baseY + shakeY;
    camera.position.z = baseZ;
    camera.lookAt(camera.position.x + shakeX * 0.5, -ALTURA * 0.02, 0);
    // Leve inclinação constante para revelar profundidade sem prejudicar a
    // leitura de distâncias de pulo (rotação mínima, plano de jogo continua
    // quase de frente).
    camera.rotation.z = 0;
  }

  // ---------------------------------------------------------------------
  // PARTÍCULAS — estado de emissão (tracking entre frames, só para VFX;
  // nunca lê/escreve nada que a simulação em GameCanvas.tsx dependa).
  // ---------------------------------------------------------------------
  let ultimoTempoJogoMs: number | null = null;
  let acumuladorPoeiraPe = 0;
  let acumuladorSuspensao = 0;
  let noChaoAnterior = true;
  let velocidadeYAnterior = 0;
  const idsAguaTratados = new Set<number>();
  const corPoeira = new THREE.Color();
  const corAgua = new THREE.Color("#bfe4ea");

  function emitirPoeiraPe(x: number, y: number, z: number, paleta: Paleta, intensidadeVel: number): void {
    corPoeira.set(paleta.poeira);
    const n = 1;
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const vel = (4 + Math.random() * 6) * (0.6 + intensidadeVel * 0.6);
      particulas.emitir(
        x + (Math.random() - 0.5) * 6, y + 1, z + (Math.random() - 0.5) * 4,
        Math.cos(ang) * vel, 6 + Math.random() * 6, Math.sin(ang) * vel * 0.4,
        2.2 + Math.random() * 1.6, 0.5 + Math.random() * 0.3,
        corPoeira, TIPO_PARTICULA_GRAVIDADE
      );
    }
  }

  function emitirNuvemPouso(x: number, y: number, z: number, paleta: Paleta): void {
    corPoeira.set(paleta.poeira);
    const quantidade = 14;
    for (let i = 0; i < quantidade; i++) {
      const ang = (i / quantidade) * Math.PI * 2;
      const vel = 14 + Math.random() * 14;
      particulas.emitir(
        x, y + 1, z,
        Math.cos(ang) * vel, 8 + Math.random() * 8, Math.sin(ang) * vel * 0.5,
        3 + Math.random() * 2, 0.55 + Math.random() * 0.35,
        corPoeira, TIPO_PARTICULA_GRAVIDADE
      );
    }
  }

  function emitirRespingoAgua(x: number, y: number, z: number): void {
    const quantidade = 12;
    for (let i = 0; i < quantidade; i++) {
      const ang = (i / quantidade) * Math.PI * 2 + Math.random() * 0.3;
      const vel = 16 + Math.random() * 18;
      particulas.emitir(
        x, y, z,
        Math.cos(ang) * vel * 0.5, 22 + Math.random() * 14, Math.sin(ang) * vel * 0.5,
        1.6 + Math.random() * 1.2, 0.45 + Math.random() * 0.25,
        corAgua, TIPO_PARTICULA_GRAVIDADE
      );
    }
  }

  function emitirPoeiraSuspensao(paleta: Paleta): void {
    corPoeira.set(lerpColor(paleta.poeira, "#ffffff", 0.3));
    const x = (Math.random() - 0.5) * 700;
    const y = 30 + Math.random() * 130;
    const z = -40 + Math.random() * 240;
    particulas.emitir(
      x, y, z,
      (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3,
      1.6 + Math.random() * 1.8, 3.5 + Math.random() * 2.5,
      corPoeira, TIPO_PARTICULA_SUSPENSAO
    );
  }

  function atualizarParticulas(state: EstadoJogo, loop: EstadoLoop, paleta: Paleta, reduzirMovimento: boolean): void {
    if (ultimoTempoJogoMs === null) ultimoTempoJogoMs = loop.tempoJogoMs;
    const dtS = Math.min(0.05, Math.max(0, (loop.tempoJogoMs - ultimoTempoJogoMs) / 1000));
    ultimoTempoJogoMs = loop.tempoJogoMs;

    const jogador = state.jogador;
    const posChao = paraMundo3D(jogador.x + jogador.largura / 2, jogador.y + jogador.altura);
    const morto = jogador.estado === "morto";
    const fatorReducao = reduzirMovimento ? 0.35 : 1;

    // Poeira dos pés — intensidade proporcional à velocidade do mundo.
    if (jogador.noChao && !morto && dtS > 0) {
      const intensidadeVel = Math.min(1.6, (state.velocidadeMundo || 0) / 280);
      const taxa = (7 + intensidadeVel * 10) * fatorReducao;
      acumuladorPoeiraPe += dtS * taxa;
      while (acumuladorPoeiraPe >= 1) {
        emitirPoeiraPe(posChao.x, 0, posChao.z, paleta, intensidadeVel);
        acumuladorPoeiraPe -= 1;
      }
    } else {
      acumuladorPoeiraPe = 0;
    }

    // Nuvem de poeira no pouso: transição aérea -> chão com queda (não subida).
    if (jogador.noChao && !noChaoAnterior && velocidadeYAnterior > 60 && !morto) {
      emitirNuvemPouso(posChao.x, 0, posChao.z, paleta);
    }
    noChaoAnterior = jogador.noChao;
    velocidadeYAnterior = jogador.velocidadeY;

    // Respingo ao coletar água (edge-detect por id — cada coleta dispara 1x).
    for (const item of state.coletaveis) {
      if (item.tipo !== "agua" || !item.coletado) continue;
      if (idsAguaTratados.has(item.id)) continue;
      idsAguaTratados.add(item.id);
      const posItem = objetoParaMundo3D(item.x, item.y, item.largura, item.altura);
      emitirRespingoAgua(posItem.x, posItem.y, posItem.z);
    }

    // Poeira fina em suspensão no ar quente do sertão — sumindo no litoral.
    const taxaSuspensao = Math.max(0, (5 - state.worldProgress * 5.5)) * fatorReducao;
    acumuladorSuspensao += dtS * taxaSuspensao;
    while (acumuladorSuspensao >= 1) {
      emitirPoeiraSuspensao(paleta);
      acumuladorSuspensao -= 1;
    }

    particulas.atualizar(dtS);
  }

  function dispararShakeMorte(): void {
    iShake.ativo = true;
    iShake.t = 0;
  }
  function dispararRespiroVitoria(): void {
    iVitoria.ativo = true;
    iVitoria.t = 0;
  }

  function atualizarChao(deslocamentoTotalX: number): void {
    // Offset de UV = rolagem contínua sem costura (nunca recria geometria).
    texturaChao.offset.x = (deslocamentoTotalX / 90) % 1;
  }

  function atualizarSerrasEArbustos(loop: EstadoLoop, worldProgress: number, paleta: Paleta): void {
    matSerra.color.set(lerpColor(paleta.poeira, paleta.ceu, 0.3));
    const offSerra = loop.parallaxOffsets[0];
    for (let i = 0; i < QUANTIDADE_SERRAS; i++) {
      const periodo = 380;
      const slot = i - QUANTIDADE_SERRAS / 2;
      const x = (((slot * periodo - offSerra * 0.3) % (periodo * QUANTIDADE_SERRAS)) + periodo * QUANTIDADE_SERRAS) % (periodo * QUANTIDADE_SERRAS) - (periodo * QUANTIDADE_SERRAS) / 2;
      const alt = 90 + ((i * 53) % 60);
      dummy.position.set(x, alt / 2 - 4, -520 - (i % 3) * 60);
      dummy.scale.set(60 + (i % 4) * 12, alt, 60 + (i % 4) * 12);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      serras.setMatrixAt(i, dummy.matrix);
    }
    serras.instanceMatrix.needsUpdate = true;

    matArbusto.color.set(lerpColor(paleta.terraEscura, paleta.clara, worldProgress * 0.5));
    const offArb = loop.parallaxOffsets[1];
    for (let i = 0; i < QUANTIDADE_ARBUSTOS; i++) {
      const periodo = 140;
      const slot = i - QUANTIDADE_ARBUSTOS / 2;
      const x = (((slot * periodo - offArb) % (periodo * QUANTIDADE_ARBUSTOS)) + periodo * QUANTIDADE_ARBUSTOS) % (periodo * QUANTIDADE_ARBUSTOS) - (periodo * QUANTIDADE_ARBUSTOS) / 2;
      const escala = 6 + (i % 5) * 2;
      dummy.position.set(x, escala * 0.5, -180 - (i % 4) * 25);
      dummy.scale.set(escala, escala * 0.8, escala);
      dummy.rotation.set(0, i, 0);
      dummy.updateMatrix();
      arbustos.setMatrixAt(i, dummy.matrix);
    }
    arbustos.instanceMatrix.needsUpdate = true;
  }

  /** Camadas extras de densidade/profundidade: mandacarus de fundo (mais
   * atrás que os arbustos), capim seco (mais perto, mais denso) e um
   * primeiro plano de pedras/ossos colado nas bordas do quadro — cruza mais
   * rápido pela perspectiva, sensação real de profundidade em 3 planos. */
  function atualizarVegetacaoFundo(loop: EstadoLoop, worldProgress: number, paleta: Paleta): void {
    const corMangue = lerpColor(paleta.terraEscura, "#2f6b45", worldProgress);
    matMandacaruFundo.color.set(lerpColor("#6b3d22", corMangue, worldProgress * 0.6));
    const offFundo = loop.parallaxOffsets[0] * 0.6;
    for (let i = 0; i < QUANTIDADE_MANDACARUS_FUNDO; i++) {
      const periodo = 210;
      const slot = i - QUANTIDADE_MANDACARUS_FUNDO / 2;
      const total = periodo * QUANTIDADE_MANDACARUS_FUNDO;
      const x = (((slot * periodo - offFundo) % total) + total) % total - total / 2;
      const braços = 1 + (i % 3); // variação de "número de braços" via altura/raio
      const alt = 34 + (i % 4) * 10 + braços * 4;
      dummy.position.set(x, alt / 2, -360 - (i % 3) * 40);
      dummy.scale.set(5 + (i % 3) * 1.5, alt, 5 + (i % 3) * 1.5);
      dummy.rotation.set(0, i * 0.7, 0);
      dummy.updateMatrix();
      mandacarusFundo.setMatrixAt(i, dummy.matrix);
    }
    mandacarusFundo.instanceMatrix.needsUpdate = true;

    matCapim.color.set(lerpColor("#B99456", "#5fae6e", worldProgress));
    const offCapim = loop.parallaxOffsets[1] * 1.15;
    for (let i = 0; i < QUANTIDADE_CAPIM; i++) {
      const periodo = 55;
      const slot = i - QUANTIDADE_CAPIM / 2;
      const total = periodo * QUANTIDADE_CAPIM;
      const x = (((slot * periodo - offCapim) % total) + total) % total - total / 2;
      const alt = 3 + (i % 5) * 1.4;
      dummy.position.set(x, alt / 2, -95 - (i % 5) * 15);
      dummy.scale.set(1.4 + (i % 3) * 0.5, alt, 1.4 + (i % 3) * 0.5);
      dummy.rotation.set(0, i * 1.3, 0);
      dummy.updateMatrix();
      capim.setMatrixAt(i, dummy.matrix);
    }
    capim.instanceMatrix.needsUpdate = true;

    // Primeiro plano: colado nas bordas horizontais do quadro (|x| grande)
    // para nunca cruzar a pista onde jogador/obstáculos vivem — só reforça
    // a sensação de velocidade/profundidade sem atrapalhar a leitura.
    const offPerto = loop.parallaxOffsets[2] * 1.5;
    for (let i = 0; i < QUANTIDADE_PEDRAS_FUNDO; i++) {
      const periodo = 130;
      const ladoSinal = i % 2 === 0 ? 1 : -1;
      const slot = Math.floor(i / 2);
      const total = periodo * QUANTIDADE_PEDRAS_FUNDO;
      const along = (((slot * periodo * 2 - offPerto) % total) + total) % total - total / 2;
      const x = ladoSinal * (410 + (i % 3) * 25);
      dummy.position.set(x, 4, along % 260 - 40 + (i % 2) * 30);
      dummy.scale.setScalar(5 + (i % 4) * 2);
      dummy.rotation.set(i, i * 0.5, i * 0.3);
      dummy.updateMatrix();
      pedrasFundo.setMatrixAt(i, dummy.matrix);
    }
    pedrasFundo.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < QUANTIDADE_OSSOS_FUNDO; i++) {
      const periodo = 170;
      const ladoSinal = i % 2 === 0 ? -1 : 1;
      const slot = Math.floor(i / 2);
      const total = periodo * QUANTIDADE_OSSOS_FUNDO;
      const along = (((slot * periodo * 2 - offPerto * 0.8) % total) + total) % total - total / 2;
      const x = ladoSinal * (390 + (i % 3) * 20);
      dummy.position.set(x, 3, along % 220 - 30);
      dummy.scale.setScalar(3.5 + (i % 3) * 1.2);
      dummy.rotation.set(0.3, i * 0.9, Math.PI / 2);
      dummy.updateMatrix();
      ossosFundo.setMatrixAt(i, dummy.matrix);
    }
    ossosFundo.instanceMatrix.needsUpdate = true;
    ossosFundo.visible = worldProgress < 0.8; // ossos somem perto do litoral

    // Nuvens: drift lento e independente do scroll do mundo.
    const tSeg = loop.tempoJogoMs / 1000;
    for (let i = 0; i < QUANTIDADE_NUVENS; i++) {
      const x = ((i * 340 + tSeg * 6) % 3400) - 1700;
      const y = 260 + (i % 4) * 50;
      const z = -600 - (i % 3) * 220;
      dummy.position.set(x, y, z);
      const escala = 60 + (i % 4) * 25;
      dummy.scale.set(escala, escala * 0.45, escala * 0.7);
      dummy.rotation.set(0, i, 0);
      dummy.updateMatrix();
      nuvens.setMatrixAt(i, dummy.matrix);
    }
    nuvens.instanceMatrix.needsUpdate = true;
  }

  function posicionarObstaculo(mesh: THREE.Object3D, obstaculo: Obstaculo): void {
    const pos = objetoParaMundo3D(obstaculo.x, obstaculo.y, obstaculo.largura, obstaculo.altura);
    // Escala uniforme simples: a geometria de cada tipo já foi modelada numa
    // unidade "de referência"; aqui só normalizamos pela altura lógica do
    // obstáculo em relação à altura de modelagem de referência (60 un.).
    const escala = obstaculo.altura / 60;
    mesh.position.set(pos.x, 0, pos.z);
    mesh.scale.setScalar(Math.max(0.3, escala));
  }

  function posicionarColetavel(mesh: THREE.Object3D, item: Coletavel, tempoJogoMs: number): void {
    const pos = objetoParaMundo3D(item.x, item.y, item.largura, item.altura);
    const flutua = Math.sin(tempoJogoMs / 500 + item.id) * 3;
    const giro = tempoJogoMs / 900 + item.id;
    mesh.position.set(pos.x, pos.y - item.altura / 2 + flutua + item.altura * 0.3, pos.z);
    mesh.rotation.y = giro;
    const escala = item.largura / 22;
    mesh.scale.setScalar(escala);
  }

  function posicionarPlaca(grupo: THREE.Object3D, placa: Placa): void {
    const pos = objetoParaMundo3D(placa.x, 0, placa.largura, placa.altura);
    grupo.position.set(pos.x, 0, 6);
    const userData = grupo.userData as PlacaUserData;
    const meshPlaca = userData.mesh;
    if (userData.spriteOrigem !== placa.sprite) {
      const meshMaterial = meshPlaca.material as THREE.MeshStandardMaterial;
      if (meshMaterial.map) meshMaterial.map.dispose();
      const textura = new THREE.CanvasTexture(placa.sprite as unknown as HTMLCanvasElement);
      textura.colorSpace = THREE.SRGBColorSpace;
      meshMaterial.map = textura;
      meshMaterial.needsUpdate = true;
      userData.spriteOrigem = placa.sprite;
    }
  }

  /** Aproxima `atual` de `alvo` a uma taxa fixa por frame — interpolação de
   * poses em vez de troca brusca (é isto que muda a percepção de qualidade
   * da animação). Fator alto o bastante para não ficar "borrachudo". */
  function lerpAngulo(atual: number, alvo: number, fator: number): number {
    return atual + (alvo - atual) * fator;
  }

  function animarSeverino(jogador: EstadoJogadorCampo, cicloCorrida: number, reduzirMovimento: boolean): void {
    const pos = objetoParaMundo3D(jogador.x, jogador.y, jogador.largura, jogador.altura);
    const { partes, grupo, pose } = severino;
    const alturaRef = 114;
    const escala = jogador.altura / alturaRef;
    grupo.position.set(pos.x, pos.y - jogador.altura / 2, pos.z);
    grupo.scale.set(escala, escala, escala);

    const noChao = jogador.noChao;
    const morto = jogador.estado === "morto";
    const agachado = jogador.estado === "agachado";
    // `fator` é o quanto a pose ATUAL anda em direção ao ALVO por frame (não
    // congela nada — ver critério de reduzirMovimento acima). Sem redução:
    // fator=1 aplica o alvo instantaneamente, o que é CORRETO aqui porque o
    // próprio alvo já varia suavemente quadro a quadro (é função contínua de
    // cicloCorrida); interpolar de novo em cima disso só atrasaria a leitura
    // do passo. Por padrão: fator 0.32 suaviza a transição entre poses
    // DISCRETAS (ex.: corrida -> agachado -> pulo) via lerpAngulo. Com
    // reduzirMovimento: fator 1 aplica a pose alvo de forma direta, sem
    // interpolação — isto é o único efeito que a flag deve ter aqui.
    const fator = reduzirMovimento ? 1 : 0.32;

    // ---- Alvos por estado (ângulos em radianos) ----
    let alvoQuadrilEsq = 0, alvoJoelhoEsq = 0, alvoQuadrilDir = 0, alvoJoelhoDir = 0;
    let alvoOmbroEsq = 0, alvoCotoveloEsq = 0, alvoOmbroDir = 0, alvoCotoveloDir = 0;
    let alvoInclinacao = 0, alvoBobY = 0, alvoBalancoZ = 0, alvoEscalaY = 1, alvoRotZ = 0;

    if (morto) {
      // Colapso: pernas dobradas de lado, braços caídos, tronco tombado —
      // pose distinta e legível de "caiu", não apenas um "parar".
      alvoQuadrilEsq = 1.3; alvoJoelhoEsq = 1.6;
      alvoQuadrilDir = 1.0; alvoJoelhoDir = 0.5;
      alvoOmbroEsq = 1.1; alvoCotoveloEsq = 0.3;
      alvoOmbroDir = 0.6; alvoCotoveloDir = 0.2;
      alvoInclinacao = 0;
      alvoRotZ = Math.PI / 2.15;
      alvoBobY = -4;
    } else if (!noChao) {
      if (jogador.velocidadeY < 0) {
        // Subida: pernas recolhidas por baixo, braços abertos/erguidos.
        alvoQuadrilEsq = -0.85; alvoJoelhoEsq = 1.5;
        alvoQuadrilDir = -0.6; alvoJoelhoDir = 1.7;
        alvoOmbroEsq = -1.9; alvoCotoveloEsq = -0.4;
        alvoOmbroDir = -1.9; alvoCotoveloDir = -0.4;
        alvoInclinacao = -0.1;
      } else {
        // Queda: pernas estendidas antecipando o solo.
        alvoQuadrilEsq = -0.35; alvoJoelhoEsq = 0.2;
        alvoQuadrilDir = 0.55; alvoJoelhoDir = 0.6;
        alvoOmbroEsq = -0.7; alvoCotoveloEsq = -0.2;
        alvoOmbroDir = -1.0; alvoCotoveloDir = -0.3;
        alvoInclinacao = 0.18;
      }
    } else if (agachado) {
      // Agachado: compressão real da pose (quadril/joelho dobrados), não só
      // escala — a silhueta some por trás das próprias pernas dobradas.
      alvoQuadrilEsq = 1.5; alvoJoelhoEsq = 2.0;
      alvoQuadrilDir = 1.5; alvoJoelhoDir = 2.0;
      alvoOmbroEsq = 0.5; alvoCotoveloEsq = 0.9;
      alvoOmbroDir = 0.5; alvoCotoveloDir = 0.9;
      alvoInclinacao = 0.35;
      alvoBobY = -8;
      alvoEscalaY = 0.72;
    } else {
      // Corrida: ciclo completo — pernas em oposição de fase com joelho que
      // dobra na fase de balanço e estende no contato, braços em
      // contraposição (opostos à perna do mesmo lado), bob vertical do
      // quadril e leve balanço lateral acompanhando a cadência.
      // O ciclo de corrida SEMPRE roda, com ou sem reduzirMovimento — ver
      // comentário de critério em atualizarCamera. `c` NUNCA é zerado pela
      // flag: congelar as pernas/braços do protagonista enquanto o mundo
      // rola é um jogo quebrado, não uma acomodação de acessibilidade.
      const c = cicloCorrida;
      const faseEsq = Math.sin(c);
      const faseDir = Math.sin(c + Math.PI);
      // Perna: quando faseX>0 (perna atrás indo à frente, fase de balanço),
      // dobra bem o joelho; na fase de apoio/contato, estende quase reto.
      // Amplitude AUMENTADA (era 0.75/1.7) para que a passada seja
      // inequivocamente visível na escala em que Severino aparece na tela.
      alvoQuadrilEsq = faseEsq * 1.05;
      alvoJoelhoEsq = Math.max(0, faseEsq) * 2.3 + 0.12;
      alvoQuadrilDir = faseDir * 1.05;
      alvoJoelhoDir = Math.max(0, faseDir) * 2.3 + 0.12;
      // Braços em contraposição ao braço homônimo da perna oposta.
      // Amplitude AUMENTADA (era 0.9/0.9) pelo mesmo motivo.
      alvoOmbroEsq = faseDir * 1.3;
      alvoCotoveloEsq = 1.1 + Math.max(0, faseDir) * 0.6;
      alvoOmbroDir = faseEsq * 1.3;
      alvoCotoveloDir = 1.1 + Math.max(0, faseEsq) * 0.6;
      alvoInclinacao = 0.22;
      // Bob vertical/balanço lateral do CORPO fazem parte da leitura da
      // passada (não são "supérfluos" no sentido de reduzirMovimento — ver
      // critério acima) — rodam sempre, com amplitude aumentada (era 1.6/
      // 0.05) para reforçar a sensação de peso/passo.
      alvoBobY = Math.abs(Math.sin(c)) * 3.2;
      alvoBalancoZ = Math.sin(c) * 0.09;
    }

    pose.quadrilEsq = lerpAngulo(pose.quadrilEsq, alvoQuadrilEsq, fator);
    pose.joelhoEsq = lerpAngulo(pose.joelhoEsq, alvoJoelhoEsq, fator);
    pose.quadrilDir = lerpAngulo(pose.quadrilDir, alvoQuadrilDir, fator);
    pose.joelhoDir = lerpAngulo(pose.joelhoDir, alvoJoelhoDir, fator);
    pose.ombroEsq = lerpAngulo(pose.ombroEsq, alvoOmbroEsq, fator);
    pose.cotoveloEsq = lerpAngulo(pose.cotoveloEsq, alvoCotoveloEsq, fator);
    pose.ombroDir = lerpAngulo(pose.ombroDir, alvoOmbroDir, fator);
    pose.cotoveloDir = lerpAngulo(pose.cotoveloDir, alvoCotoveloDir, fator);
    pose.inclinacaoTronco = lerpAngulo(pose.inclinacaoTronco, alvoInclinacao, fator);
    pose.bobY = lerpAngulo(pose.bobY, alvoBobY, fator);
    pose.balancoZ = lerpAngulo(pose.balancoZ, alvoBalancoZ, fator);
    pose.escalaY = lerpAngulo(pose.escalaY, alvoEscalaY, fator);
    pose.rotZ = lerpAngulo(pose.rotZ, alvoRotZ, fator);

    partes.pernaEsq.quadril.rotation.x = pose.quadrilEsq;
    // O joelho humano dobra na direção oposta ao movimento do quadril (para trás)
    partes.pernaEsq.joelho.rotation.x = -pose.joelhoEsq;
    partes.pernaDir.quadril.rotation.x = pose.quadrilDir;
    partes.pernaDir.joelho.rotation.x = -pose.joelhoDir;
    partes.bracoEsq.ombro.rotation.x = pose.ombroEsq;
    partes.bracoEsq.antebraco.rotation.x = pose.cotoveloEsq;
    partes.bracoEsq.mao.rotation.x = pose.cotoveloEsq * 0.8;
    partes.bracoDir.ombro.rotation.x = pose.ombroDir;
    partes.bracoDir.antebraco.rotation.x = pose.cotoveloDir;
    partes.bracoDir.mao.rotation.x = pose.cotoveloDir * 0.8;
    partes.tronco.rotation.x = pose.inclinacaoTronco;
    partes.raizQuadril.position.y = 34 + pose.bobY;
    partes.raizQuadril.rotation.z = pose.balancoZ;
    // Reação do chapéu/barra da camisa ao movimento: balanço leve por
    // rotação de pivô (nunca simulação física), amplificando o bob.
    partes.chapeu.rotation.z = pose.balancoZ * 1.6;
    partes.cabeca.rotation.z = -pose.balancoZ * 0.4;

    grupo.scale.y = escala * pose.escalaY;
    grupo.rotation.z = pose.rotZ;
    grupo.rotation.x = 0;
    // Corpo voltado para a direita (direção do movimento no mundo): leve
    // giro em Y (câmera é quase frontal, então isto é um 3/4, não um perfil
    // puro) — o suficiente para a silhueta comunicar "correndo para lá".
    grupo.rotation.y = morto ? grupo.rotation.y : -1.4;
  }

  function animarMorte(state: EstadoJogo, tempoJogoMs: number): void {
    if (!state.morte.visivel) {
      morte.grupo.visible = false;
      return;
    }
    morte.grupo.visible = true;
    const proximidade = Math.min(1, Math.max(0, state.morte.distanciaAteJogador));
    const ameaca = 1 - proximidade;
    morte.mat.uniforms.ameaca.value = ameaca;
    morte.mat.uniforms.tempo.value = tempoJogoMs / 1000;
    morte.luz.intensity = 0.3 + ameaca * 1.2;
    const xLonge = -LARGURA * 0.35;
    const xPerto = -LARGURA / 2 + 60;
    const cx = xLonge + (xPerto - xLonge) * ameaca;
    const oscila = Math.sin(tempoJogoMs / 900) * 3;
    morte.grupo.position.set(cx + oscila, 44, -20);
  }

  function atualizarPlacas(placas: Placa[]): void {
    for (let i = 0; i < placas.length; i++) {
      const grupo = poolPlacas.obter(i, "placa");
      posicionarPlaca(grupo, placas[i]);
    }
    poolPlacas.ocultarApartirDe(placas.length);
  }

  function atualizarTumbas(loop: EstadoLoop, worldProgress: number): void {
    // Recicla o mesmo cálculo de slot do 2D anterior de forma simplificada:
    // decide, por posição de scroll, uma amostra de túmulos visíveis dentro
    // da faixa do sertão (worldProgress < 0.75), reaproveitando o pool.
    if (worldProgress >= 0.75) {
      poolTumbas.ocultarApartirDe(0);
      return;
    }
    const offset = loop.parallaxOffsets[1];
    const periodo = 260;
    const quantidade = 5;
    let visiveis = 0;
    for (let i = 0; i < quantidade; i++) {
      const slotGlobal = Math.round((offset + i * periodo) / periodo);
      const hash = Math.abs(Math.sin(slotGlobal * 12.9898)) % 1;
      const prob = Math.min(0.5, worldProgress * 0.7 + 0.15);
      if (hash > prob) continue;
      const x = (((i * periodo - offset) % (periodo * quantidade)) + periodo * quantidade) % (periodo * quantidade) - (periodo * quantidade) / 2;
      const grupo = poolTumbas.obter(visiveis, "tumba");
      grupo.position.set(x, 0, -35 - (i % 2) * 20);
      visiveis++;
    }
    poolTumbas.ocultarApartirDe(visiveis);
  }

  // Flags de "disparo único" de efeitos ao terminar a partida (shake na
  // morte, respiro na vitória) — vivem no closure do renderer, não mais
  // como propriedades penduradas na função (padrão JS antigo incompatível
  // com tipagem de função nomeada em TS).
  let shakeDisparado = false;
  let vitoriaDisparada = false;

  /**
   * Chamado UMA VEZ por frame (depois da física) — nunca dentro do
   * acumulador de passo fixo. Só lê/posiciona; não muta o estado do jogo.
   */
  function atualizar(state: EstadoJogo, loop: EstadoLoop, _nomeJogador: string, reduzirMovimento: boolean): void {
    const paleta = getPalette(state.worldProgress);

    atualizarAtmosfera(state.worldProgress, paleta);
    atualizarChao(loop.parallaxOffsets[2]);
    atualizarSerrasEArbustos(loop, state.worldProgress, paleta);
    atualizarVegetacaoFundo(loop, state.worldProgress, paleta);
    atualizarTumbas(loop, state.worldProgress);
    atualizarCamera(state, loop, reduzirMovimento);
    marMaterial.uniforms.tempo.value = loop.tempoJogoMs / 1000;
    atualizarParticulas(state, loop, paleta, reduzirMovimento);

    for (let i = 0; i < state.obstaculos.length; i++) {
      const obstaculo = state.obstaculos[i];
      const mesh = poolObstaculos.obter(i, obstaculo.tipo);
      posicionarObstaculo(mesh, obstaculo);
    }
    poolObstaculos.ocultarApartirDe(state.obstaculos.length);

    let idxColetavel = 0;
    for (const item of state.coletaveis) {
      if (item.coletado) continue;
      const mesh = poolColetaveis.obter(idxColetavel, item.tipo);
      posicionarColetavel(mesh, item, loop.tempoJogoMs);
      idxColetavel++;
    }
    poolColetaveis.ocultarApartirDe(idxColetavel);

    atualizarPlacas(loop.placas);
    animarSeverino(state.jogador, loop.cicloCorrida, reduzirMovimento);
    animarMorte(state, loop.tempoJogoMs);

    if (state.terminado && state.resultado === "death" && !shakeDisparado) {
      dispararShakeMorte();
      shakeDisparado = true;
    }
    if (state.terminado && state.resultado === "victory" && !vitoriaDisparada) {
      dispararRespiroVitoria();
      vitoriaDisparada = true;
    }
    if (!state.terminado) {
      shakeDisparado = false;
      vitoriaDisparada = false;
    }

    renderer.render(scene, camera);
  }

  function dispose(): void {
    poolObstaculos.dispose();
    poolColetaveis.dispose();
    poolPlacas.dispose();
    poolTumbas.dispose();
    [ceu, chao].forEach((obj) => {
      obj.geometry?.dispose();
      const material = obj.material as THREE.Material | undefined;
      material?.dispose();
    });
    texturaChao.dispose();
    geoSerra.dispose();
    matSerra.dispose();
    geoArbusto.dispose();
    matArbusto.dispose();
    geoMandacaruFundo.dispose();
    matMandacaruFundo.dispose();
    geoCapim.dispose();
    matCapim.dispose();
    geoPedraFundo.dispose();
    matPedraFundo.dispose();
    geoOssoFundo.dispose();
    matOssoFundo.dispose();
    mar.geometry.dispose();
    marMaterial.dispose();
    nuvens.geometry.dispose();
    matNuvem.dispose();
    particulas.dispose();
    severino.grupo.traverse((o: THREE.Object3D) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m: THREE.Material) => m.dispose());
    });
    morte.mat.dispose();
    morte.grupo.traverse((o: THREE.Object3D) => (o as THREE.Mesh).geometry?.dispose());
    renderer.dispose();
  }

  return { resize, atualizar, dispose, dispararShakeMorte, dispararRespiroVitoria };
}
