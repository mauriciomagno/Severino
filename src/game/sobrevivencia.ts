import type { IdItemLiterario, ItemLiterarioVerso } from "./gameState.js";

/**
 * sobrevivencia.ts — a sede como motor dramático (Etapa 3, recalibrado na
 * Etapa 4 — ver "RECALIBRAÇÃO DE ESCALA" abaixo).
 * ============================================================
 * Centraliza TODO número que rege sobrevivência: drenagem de hidratação,
 * limiares de urgência da StatusBar, restauração/spawn do coletável de
 * água e as faixas narrativas dos itens literários. Ajustar o jogo é
 * ajustar aqui — nunca espalhar "números mágicos" pelo GameCanvas.
 *
 * -----------------------------------------------------------------------
 * RECALIBRAÇÃO DE ESCALA (Etapa 4) — a matemática, não o chute
 * -----------------------------------------------------------------------
 * A Etapa 3 usava distanciaTotal = 5000px, o que — integrando
 * numericamente dx/dt = velocidadeMundo(x)/distanciaTotal com a curva de
 * fisica.ts (260 -> 620 px/s) — durava só ≈ 11s. Curto demais para 5 itens
 * literários + transição sertão→litoral. Refeita a integral (regra de
 * Simpson, 20 intervalos) de I = ∫₀¹ dx/v(x) ≈ 0.0022013 s/px, o tempo
 * total de uma travessia é T = distanciaTotal * I. Alvo: T ≈ 180s (3min,
 * dentro de 2,5–3,5min) => distanciaTotal = 180 / 0.0022013 ≈ 81 772px,
 * arredondado para 82000px (T real ≈ 180,5s — ver src/game/fisica.ts e o
 * script de simulação usado para validar estes números).
 *
 * A drenagem de hidratação segue a MESMA curva senoidal de antes, só que
 * recalibrada para a nova escala temporal:
 *
 *     taxa(x) = DRENAGEM_MINIMA + (DRENAGEM_MAXIMA - DRENAGEM_MINIMA) * sin(PI * x)
 *
 * Alvo: a barra CHEIA (sem beber nenhuma água) dura 30 a 45s. Resolvendo
 * numericamente x(t) (integração de dx/dt = v(x)/D) e a equação
 * ∫₀ᵀ taxa(x(t)) dt = 1 para DRENAGEM_MAXIMA = 3×DRENAGEM_MINIMA (mesma
 * proporção da Etapa 3), obtém-se DRENAGEM_MINIMA ≈ 0.0145/s e
 * DRENAGEM_MAXIMA ≈ 0.0435/s — a barra cheia esgota em T ≈ 45,7s sem
 * nenhuma água (dentro do alvo, na borda superior).
 *
 * O coletável de água precisa nascer a cada ~12 a 20s de jogo. Como a
 * velocidade do mundo varia (260→620px/s), a distância fixa
 * DISTANCIA_MEDIA_SPAWN_AGUA_PX = 4000px (± VARIACAO_SPAWN_AGUA_PX =
 * 2200px) resulta em intervalos reais medidos por simulação entre ~9s
 * (trechos rápidos do litoral) e ~18s (trechos lentos do sertão) — dentro
 * da faixa pedida. RESTAURACAO_AGUA = 0.55 (55% da barra — parcial, uma
 * única água NUNCA zera a tensão sozinha, mas evita a morte iminente).
 *
 * REVALIDAÇÃO POR SIMULAÇÃO NUMÉRICA (script Node ad-hoc, dt=20ms, curva
 * de velocidade real de fisica.ts, RNG determinístico por seed):
 *   - Partida PERFEITA (coleta ~100% das águas que nascem): SEMPRE
 *     sobrevive, chegando ao litoral com hidratação média ≈ 0,91 — folga
 *     real, sem trivializar (ainda exige jogar de olho na barra).
 *   - Partida DESCUIDADA (ignora toda água): morre de sede em t ≈ 45,7s,
 *     bem antes dos ≈180s da travessia completa — SEMPRE fatal.
 *   - Partida MEDIANA (coleta ~80% das águas — pula as que exigem pulo
 *     arriscado): o resultado é tenso e variável, como pede o poema: a
 *     maioria das tentativas nessa faixa morre no trecho mais cruel do
 *     sertão (x ≈ 0,3–0,5, onde sin(PI·x) é alto), mas quando sobrevive,
 *     chega "apertada" — exemplos simulados terminam com hidratação
 *     ≈ 0,50 e ≈ 0,58 (contra ≈0,91 da partida perfeita). A faixa de
 *     colheita ~80–90% é o limiar exato entre "sobrevive com sobra" e
 *     "morre no meio do caminho" — não há gradiente suave porque o
 *     sistema é de reforço positivo (cada água extra garante folga para
 *     a próxima), o que é tematicamente coerente: viver ou morrer no
 *     sertão raramente é uma questão de grau.
 *
 * As faixas de worldProgress dos itens literários (abaixo) são
 * proporcionais (0..1) e por isso continuam válidas sem qualquer ajuste
 * ao rescale de distanciaTotal — confirmado por inspeção: elas dependem
 * só de state.worldProgress, nunca de distância em px absoluta.
 */

export const CONSTANTES_SOBREVIVENCIA = Object.freeze({
  // ---------- Drenagem de hidratação (ver matemática acima) ----------
  // Taxa mínima (fração/segundo) — início do sertão e proximidade do
  // litoral, quando a friagem da água próxima ou a manhã amena aliviam.
  DRENAGEM_MINIMA: 0.0145,
  // Taxa máxima (fração/segundo) — pico do calor, coração do sertão.
  DRENAGEM_MAXIMA: 0.0435,

  // ---------- Limiares de urgência (StatusBar) ----------
  // Espelham o data-estado já preparado em StatusBar.jsx/App.css.
  LIMIAR_ATENCAO: 0.5,
  LIMIAR_CRITICO: 0.2,

  // ---------- Coletável de água ----------
  // Restauração por unidade coletada (fração da barra, 0..1) — parcial de
  // propósito: uma única água nunca deve zerar a tensão da partida.
  RESTAURACAO_AGUA: 0.55,
  // Distância média (px) entre nascimentos de água — mesma unidade de
  // distanciaAteProximoSpawn usada para obstáculos em fisica.ts. Calibrada
  // para um intervalo real de ~12 a ~20s de jogo (ver matemática acima).
  // TAREFA 1 (resolução virtual): escalado 0.75x junto com VELOCIDADE_MUNDO_*
  // em fisica.ts (4000->3000, 2200->1650) para preservar os MESMOS
  // intervalos de tempo entre nascimentos, já que "pixel" agora é pixel
  // virtual (960x540), não pixel de tela real.
  DISTANCIA_MEDIA_SPAWN_AGUA_PX: 3000,
  VARIACAO_SPAWN_AGUA_PX: 1650,
  // Hitbox de COLETA é GENEROSA: expande (não encolhe) em relação ao
  // desenho visual, ao contrário da hitbox de obstáculo. Valor em px
  // somado a cada lado do retângulo visual. Escalado 1.5x (mesmo fator dos
  // sprites de obstáculo/coletável — ver OBST_SCALE em GameCanvas.tsx) para
  // acompanhar o novo tamanho visual dos itens.
  EXPANSAO_HITBOX_COLETA_PX: 24,
  // Distância mínima livre de obstáculo exigida para nascer uma água,
  // evitando sobrepor hitbox de obstáculo. Escalado 0.75x (distância de
  // mundo, mesma família de DISTANCIA_MEDIA_SPAWN_AGUA_PX acima).
  MARGEM_ANTICOLISAO_SPAWN_PX: 53,

  // ---------- Itens literários: faixas de worldProgress ----------
  // Cada faixa [inicio, fim] foi escolhida para coincidir com o momento
  // do poema em que o objeto aparece na narrativa de Severino:
  FAIXAS_ITENS_LITERARIOS: Object.freeze({
    // A Cruz de madeira marca as covas rasas do sertão — cedo na jornada,
    // quando a morte por acaso já ronda o retirante.
    cruz: [0.08, 0.28] as [number, number],
    // A Vela pertence às mesmas cenas de vigília e enterro no sertão,
    // um pouco mais adiante (a "vela" que se acende para o defunto).
    vela: [0.24, 0.42] as [number, number],
    // A Moeda antiga é o "caminho" — o trabalho ocasional, a esmola, a
    // troca — centro da travessia, nem sertão puro nem litoral à vista.
    moeda: [0.40, 0.58] as [number, number],
    // O Pão é a fome que aperta quando o corpo mais fraqueja, pouco antes
    // da paisagem começar a anunciar o litoral.
    pao: [0.56, 0.76] as [number, number],
    // A Rede de pesca pertence ao encontro com o rio/mar — só faz sentido
    // perto do litoral, onde a vida de pescador se anuncia.
    rede: [0.78, 0.96] as [number, number],
  }),
  // A Semente só aparece ao chegar muito perto do litoral: colhê-la (não
  // só chegar) é o que dispara a vitória.
  PROGRESSO_MINIMO_SEMENTE: 0.97,
  // Se o jogador perder a Semente na tela, ela renasce a cada intervalo
  // (px) para garantir que a vitória continue possível. Escalado 0.75x.
  DISTANCIA_RENASCER_SEMENTE_PX: 195,
});

/**
 * Taxa de drenagem de hidratação (fração/segundo) para um dado
 * worldProgress. Curva senoidal: sobe no sertão, pico no meio, alivia
 * perto do litoral. Ver comentário no topo do arquivo para a matemática.
 * @param worldProgress 0..1
 * @returns fração/segundo
 */
export function calcularTaxaDrenagem(worldProgress: number): number {
  const x = Math.min(1, Math.max(0, worldProgress));
  const { DRENAGEM_MINIMA, DRENAGEM_MAXIMA } = CONSTANTES_SOBREVIVENCIA;
  return DRENAGEM_MINIMA + (DRENAGEM_MAXIMA - DRENAGEM_MINIMA) * Math.sin(Math.PI * x);
}

/** Ordem canônica de exibição do inventário de itens literários no HUD. */
export const ORDEM_ITENS_LITERARIOS: readonly IdItemLiterario[] = Object.freeze([
  "cruz",
  "vela",
  "moeda",
  "pao",
  "rede",
]);

/**
 * Versos curtos exibidos brevemente ao coletar cada item literário, e
 * citados (com atribuição) na tela final. Mantidos curtos de propósito —
 * a leitura não pode competir com o jogo em andamento.
 */
export const VERSOS_ITENS_LITERARIOS: Readonly<Record<IdItemLiterario | "semente", ItemLiterarioVerso>> =
  Object.freeze({
    cruz: {
      nome: "Cruz de madeira",
      verso: "— Não há melhor coisa a fazer\ndo que enterrar defunto",
    },
    vela: {
      nome: "Vela",
      verso: "— Vamos rezar a novena\nde defunto pobre é essa",
    },
    moeda: {
      nome: "Moeda antiga",
      verso: "— Melhor é morrer de faca\ndo que de fome, viver",
    },
    pao: {
      nome: "Pedaço de pão",
      verso: "— Que roças é essas que não têm\nnem um pé de plantação",
    },
    rede: {
      nome: "Rede de pesca",
      verso: "— É de rio, esse rio, que atravessa\nquando enfim se chega ao mar",
    },
    semente: {
      nome: "Semente",
      verso: "— E há sempre um homem que espera,\nsempre uma semente a plantar",
    },
  });

export const AUTOR_VERSOS = "João Cabral de Melo Neto, Morte e Vida Severina";
