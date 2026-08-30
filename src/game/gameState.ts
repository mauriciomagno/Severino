/**
 * gameState.ts — forma canônica do estado mutável do jogo.
 * ============================================================
 * REGRA INEGOCIÁVEL DE PERFORMANCE:
 *
 *   React NÃO deve re-renderizar a 60 FPS. Este objeto de estado é
 *   armazenado em uma ÚNICA useRef (ex.: `const stateRef = useRef(createInitialState())`)
 *   dentro de GameCanvas (ou de um hook de jogo futuro) e é MUTADO
 *   diretamente pelo game loop a cada frame (Etapa 2 em diante):
 *
 *       stateRef.current.distancia += delta
 *       stateRef.current.jogador.velocidadeY += gravidade
 *
 *   NUNCA faça `setState` a cada frame. NUNCA guarde este objeto (ou
 *   qualquer campo dele) diretamente em useState. useState/useReducer só
 *   pode ser usado para os poucos valores que a UI React precisa exibir
 *   (sede, distância, itens coletados, worldProgress) — e mesmo assim
 *   somente através do publisher com throttle (ver src/game/publisher.ts),
 *   nunca em resposta direta a cada mutação do loop.
 *
 * Por quê: setState dispara reconciliação + commit do React. Fazer isso
 * 60x/segundo (ou mais, com múltiplos campos) derruba o frame rate e briga
 * pelo mesmo thread principal que o requestAnimationFrame do jogo usa.
 *
 * O <canvas> é a única "view" que deve refletir o estado a 60 FPS — e ele é
 * desenhado imperativamente (ctx.fillRect, etc.), fora do ciclo de render
 * do React.
 */

/** Estados possíveis do jogador (Severino). Etapa 3+ implementa as transições. */
export const ESTADOS_JOGADOR = Object.freeze({
  CORRENDO: "correndo",
  PULANDO: "pulando",
  AGACHADO: "agachado",
  MORTO: "morto",
});

/** União literal dos valores possíveis de `jogador.estado`. */
export type EstadoJogador = (typeof ESTADOS_JOGADOR)[keyof typeof ESTADOS_JOGADOR];

/** Causa da morte — usada pela tela final para escolher o verso exibido. */
export type CausaMorte = "sede" | "obstaculo" | "morte" | null;

/** Resultado final da partida. */
export type ResultadoJogo = "death" | "victory" | null;

/** Tipos de obstáculo geráveis pelo spawn (ver GameCanvas.jsx). */
export type TipoObstaculo = "mandacaru" | "toco" | "pedra" | "cerca" | "cranio";

/** Tipos de coletável — água (sobrevivência), itens literários, e a Semente. */
export type TipoColetavel = "agua" | "cruz" | "vela" | "moeda" | "pao" | "rede" | "semente";

/** Identificador dos itens literários únicos por partida. */
export type IdItemLiterario = "cruz" | "vela" | "moeda" | "pao" | "rede";

/** Retângulo lógico com posição/tamanho em pixels virtuais (960x540). */
export interface RetanguloLogico {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

/** Um obstáculo ativo em cena. */
export interface Obstaculo extends RetanguloLogico {
  id: number;
  tipo: TipoObstaculo;
}

/** Um coletável ativo em cena (água, item literário ou Semente). */
export interface Coletavel extends RetanguloLogico {
  id: number;
  tipo: TipoColetavel;
  coletado: boolean;
}

/** Efeito visual transitório (flash/poeira de coleta ou pouso). */
export interface Efeito {
  x: number;
  y: number;
  criadoEmMs: number;
  duracaoMs: number;
  /** Só presente no efeito de poeira do pouso — ver passoFisicaFixo. */
  tipo?: "poeira";
}

/** Verso curto exibido brevemente ao coletar um item literário/Semente. */
export interface ItemLiterarioVerso {
  nome: string;
  verso: string;
}

/** Verso ativo publicado para a UI (VersoOverlay) — null quando nenhum. */
export interface VersoAtivo extends ItemLiterarioVerso {
  id: IdItemLiterario | "semente";
  ts: number;
}

/** Registro booleano por item literário (inventário / controle de nascimento). */
export type RegistroItensLiterarios = Record<IdItemLiterario, boolean>;

/** Presença da Morte (perseguidora) — Etapa 4. */
export interface EstadoMorte {
  distanciaAteJogador: number; // 0 = alcançou Severino, 1 = distância máxima/segura
  visivel: boolean;
}

/** Flags de input honradas pelo game loop (ver CONTRATO_INPUT abaixo). */
export interface EstadoInput {
  pulando: boolean;
  esquerda: boolean;
  direita: boolean;
  agachando: boolean;
}

/**
 * Estado canônico e completo do jogo — o contrato mutado pelo game loop a
 * 60 FPS (ver regra inegociável de performance no topo do arquivo).
 */
export interface EstadoJogo {
  // ---------- Meta / controle de tempo ----------
  tempoInicioMs: number | null;
  tempoUltimoFrameMs: number | null;
  frameAtual: number;
  pausado: boolean;
  terminado: boolean;
  resultado: ResultadoJogo;
  causaMorte: CausaMorte;

  // ---------- Progresso do mundo ----------
  distancia: number;
  worldProgress: number;
  distanciaTotal: number;
  velocidadeMundo: number;

  // ---------- Jogador ----------
  jogador: EstadoJogadorCampo;

  // ---------- Sobrevivência ----------
  hidratacao: number;
  taxaConsumoHidratacao: number;

  // ---------- Coletáveis e obstáculos ----------
  obstaculos: Obstaculo[];
  coletaveis: Coletavel[];
  itensColetados: number;

  itensLiterarios: RegistroItensLiterarios;
  itensLiterariosNascidos: RegistroItensLiterarios;
  sementeColhida: boolean;
  sementeNascida: boolean;

  versoAtivo: VersoAtivo | null;

  efeitos: Efeito[];

  // ---------- A Morte (perseguidora — Etapa 4) ----------
  morte: EstadoMorte;

  // ---------- Input ----------
  input: EstadoInput;
}

/** Estado do jogador (Severino) dentro do estado global do jogo. */
export interface EstadoJogadorCampo {
  x: number;
  y: number;
  velocidadeY: number;
  velocidadeX: number;
  largura: number;
  altura: number;
  estado: EstadoJogador;
  noChao: boolean;
}

/**
 * Cria o estado inicial canônico do jogo. Chame uma vez por partida
 * (ex.: ao sair da tela de menu) e guarde o retorno em uma ref.
 */
export function createInitialState(): EstadoJogo {
  return {
    // ---------- Meta / controle de tempo ----------
    tempoInicioMs: null, // preenchido pelo game loop no primeiro frame
    tempoUltimoFrameMs: null,
    frameAtual: 0,
    pausado: false,
    terminado: false, // true quando o jogo acaba (morte ou vitória)
    resultado: null, // 'death' | 'victory' | null
    causaMorte: null, // 'sede' | 'obstaculo' | 'morte' | null — a tela final muda o verso conforme a causa

    // ---------- Progresso do mundo ----------
    distancia: 0, // distância percorrida em "metros" de jogo (float)
    worldProgress: 0, // 0 (sertão) .. 1 (litoral) — deriva de distancia / distanciaTotal
    // distância "de chegada ao litoral". Recalibrada na Etapa 4 para uma
    // travessia perfeita de ≈180s (3min) — ver a matemática completa em
    // src/game/sobrevivencia.ts (cabeçalho "RECALIBRAÇÃO DE ESCALA").
    // TAREFA 1 (resolução virtual): 82000 * 0.75 = 61500 — mesmo fator de
    // escala aplicado a VELOCIDADE_MUNDO_* em fisica.ts, então a razão
    // distância/velocidade (e portanto a duração da partida, ≈180s) não
    // muda: só a UNIDADE de "pixel" mudou de escala, não o tempo.
    distanciaTotal: 61500,
    velocidadeMundo: 4, // velocidade de rolagem do cenário (px/frame equivalente), Etapa 2 ajusta

    // ---------- Jogador ----------
    jogador: {
      x: 0, // posição horizontal em tela — agora móvel dentro de uma janela segura (ver CONSTANTES_FISICA.LIMITE_HORIZONTAL_*_FRACAO)
      y: 0, // posição vertical (para física de pulo — Etapa 2)
      velocidadeY: 0,
      velocidadeX: 0, // px/s — movimento lateral (aceleração/atrito, ver passoFisicaFixo)
      largura: 0,
      altura: 0,
      estado: ESTADOS_JOGADOR.CORRENDO,
      noChao: true,
    },

    // ---------- Sobrevivência ----------
    hidratacao: 1, // 0..1 — 1 = totalmente hidratado, 0 = morte por sede
    taxaConsumoHidratacao: 0.02, // fração consumida por segundo (Etapa 3 ajusta o balanceamento)

    // ---------- Coletáveis e obstáculos (populados pela Etapa 3: spawn) ----------
    obstaculos: [], // array de { id, tipo, x, y, largura, altura }
    coletaveis: [], // array de { id, tipo: 'agua'|'cruz'|'vela'|'moeda'|'pao'|'rede'|'semente', x, y, largura, altura, coletado }
    itensColetados: 0, // contagem de águas coletadas (HUD "Água")

    // Itens literários únicos por partida — cada chave true quando coletado.
    // A UI (Hud) usa isso para acender/apagar as silhuetas do inventário.
    itensLiterarios: {
      cruz: false,
      vela: false,
      moeda: false,
      pao: false,
      rede: false,
    },
    // Controle de nascimento único por item (evita respawn do mesmo item).
    itensLiterariosNascidos: {
      cruz: false,
      vela: false,
      moeda: false,
      pao: false,
      rede: false,
    },
    sementeColhida: false, // true só quando o jogador COLHE a Semente (dispara a vitória)
    sementeNascida: false,

    // Verso curto exibido brevemente ao coletar um item literário (overlay
    // React, lido via publisher — nunca desenhado no canvas a 60 FPS).
    versoAtivo: null, // { id, nome, verso, ts } | null

    // Efeitos visuais transitórios (flash de coleta) — cosméticos, o loop
    // os desenha e remove sozinho, sem afetar a lógica de jogo.
    efeitos: [], // array de { x, y, criadoEmMs, duracaoMs }

    // ---------- A Morte (perseguidora — Etapa 4) ----------
    morte: {
      distanciaAteJogador: 1, // 0 = alcançou Severino (game over), 1 = distância máxima/segura
      visivel: false,
    },

    // ---------- Input (contrato de entrada; sem física ainda) ----------
    // Etapas futuras leem estas flags dentro do game loop.
    input: {
      pulando: false, // true enquanto Espaço/Seta-para-cima/toque estiver pressionado
      esquerda: false, // true enquanto ArrowLeft/KeyA (ou toque no terço esquerdo) estiver pressionado
      direita: false, // true enquanto ArrowRight/KeyD (ou toque no terço direito) estiver pressionado
      agachando: false, // true enquanto ArrowDown/KeyS (ou toque prolongado na metade inferior) estiver pressionado
    },
  };
}

/**
 * Contrato de input completo que o game loop honra (ver passoFisicaFixo em
 * GameCanvas.jsx):
 *
 *  Teclado:
 *   - "Space" ou "ArrowUp"              -> pular
 *   - "ArrowLeft" ou "KeyA"              -> mover para a esquerda
 *   - "ArrowRight" ou "KeyD"             -> mover para a direita
 *   - "ArrowDown" ou "KeyS"              -> agachar (no chão) / queda rápida (no ar)
 *  Todas as 7 teclas acima têm preventDefault() durante a partida (evita
 *  rolar a página com as setas).
 *
 *  Toque (esquema escolhido — "zonas do canvas", jogável só com toque):
 *   O canvas é dividido em três zonas horizontais avaliadas a cada
 *   touchstart/touchmove (o toque pode "arrastar" de uma zona pra outra
 *   sem soltar o dedo, como em runners mobile comuns):
 *     - Terço ESQUERDO do canvas  -> mover para a esquerda
 *     - Terço DIREITO do canvas   -> mover para a direita
 *     - Terço CENTRAL, METADE DE CIMA da tela -> pular
 *     - Terço CENTRAL, METADE DE BAIXO da tela -> agachar
 *   Justificativa: pular e mover são as ações mais frequentes/urgentes
 *   (evitar obstáculo à frente), então ficam nas bordas, alcançáveis com o
 *   polegar sem tampar o centro da visão; agachar é usado com menos
 *   frequência (posicionamento fino/fast-fall) e fica no centro-baixo, uma
 *   área naturalmente menos “tocada por acidente”. mousedown/mousemove no
 *   canvas replicam a mesma lógica de zonas para teste em desktop.
 */
export const CONTRATO_INPUT = Object.freeze({
  teclas: [
    "Space",
    "ArrowUp",
    "ArrowLeft",
    "KeyA",
    "ArrowRight",
    "KeyD",
    "ArrowDown",
    "KeyS",
  ],
  teclasPulo: ["Space", "ArrowUp"],
  teclasEsquerda: ["ArrowLeft", "KeyA"],
  teclasDireita: ["ArrowRight", "KeyD"],
  teclasAgachar: ["ArrowDown", "KeyS"],
  evento: "teclado (7 teclas) ou toque por zonas do canvas -> pular / mover / agachar",
});
