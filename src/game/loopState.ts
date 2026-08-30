import type { SpriteCanvas } from "./gravura.js";

/**
 * loopState.ts — tipos do "estado interno do loop" compartilhados entre
 * GameCanvas.tsx (dono do loop, mutação a 60 FPS) e render3d.ts (leitura
 * para posicionar/animar a cena Three.js uma vez por frame).
 *
 * Não faz parte do contrato documentado de gameState.ts (EstadoJogo) — são
 * temporizadores/acumuladores/caches puramente de runtime (coyote/buffer,
 * offsets de parallax, ciclo de animação, placas de nome), mas seguem a
 * MESMA regra de mutação direta (nunca setState) do resto do game loop.
 */

/** Marco/placa de beira de estrada com o nome do jogador — reciclada como
 * obstáculo/coletável (desloca com o scroll, removida ao sair da tela). */
export interface Placa {
  id: number;
  x: number;
  largura: number;
  altura: number;
  sprite: SpriteCanvas;
}

/** Offsets acumulados de parallax por camada (fundo/meio/frente). */
export type ParallaxOffsets = [number, number, number];

/** Estado interno do loop do jogo (ver criarEstadoLoop em GameCanvas.tsx). */
export interface EstadoLoop {
  tempoJogoMs: number;
  acumuladorFisicaS: number;
  ultimoTimestampMs: number | null;
  pulandoAnterior: boolean;
  ultimoPressionamentoPuloMs: number;
  puloConsumido: boolean;
  ultimaVezNoChaoMs: number;
  cicloCorrida: number;
  distanciaAteProximoSpawn: number;
  proximoIdObstaculo: number;
  parallaxOffsets: ParallaxOffsets;
  reducaoMovimento: boolean;
  // ---------- Etapa 3: sobrevivência/coletáveis ----------
  distanciaAteProximaAgua: number;
  distanciaAteProximaSemente: number;
  proximoIdColetavel: number;
  // ---------- Etapa 4: a Morte (perseguidora) ----------
  tempoDesdeUltimaColetaS: number;
  // ---------- Placa com o nome do jogador ----------
  placas: Placa[];
  proximoIdPlaca: number;
  distanciaAteProximaPlaca: number;
  primeiraPlacaMostrada: boolean;
}
