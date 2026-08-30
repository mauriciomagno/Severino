import type { CausaMorte, EstadoJogo, RegistroItensLiterarios, VersoAtivo } from "./gameState.js";

/**
 * publisher.ts — ponte com throttle entre o estado do jogo (refs, 60 FPS) e
 * o React (useState, ~10 Hz).
 * ============================================================
 * O game loop (Etapa 2+) chama `publisher.tick(state)` a cada frame. O
 * publisher decide, no máximo a ~10 Hz (a cada 100ms), se deve notificar a
 * UI React — e SOMENTE quando o valor "achatado" relevante para exibição
 * realmente mudou (evita setState redundante mesmo dentro da janela de
 * throttle).
 *
 * Uso típico dentro de um componente:
 *
 *   const [hudSnapshot, setHudSnapshot] = useState(() => selecionarHud(createInitialState()));
 *   const publisherRef = useRef(criarPublisher(setHudSnapshot, selecionarHud));
 *
 *   // dentro do loop de animação (Etapa 2):
 *   function frame(agora) {
 *     // ...mutações em stateRef.current...
 *     publisherRef.current.tick(stateRef.current, agora);
 *     requestAnimationFrame(frame);
 *   }
 *
 * `selecionarHud` é uma função pura (state) => objeto pequeno e serializável
 * com só os campos que a UI precisa (ex.: { distancia, hidratacao, itens }).
 * O publisher faz uma comparação rasa (shallow) desse objeto contra o
 * último publicado; só chama setState se algo mudou E o intervalo mínimo
 * já passou.
 */

const INTERVALO_MINIMO_MS = 100; // ~10 Hz

/**
 * Compara rasamente dois objetos simples (um nível, sem aninhamento).
 * @returns true se todas as chaves têm o mesmo valor (===)
 */
function iguaisRaso<T extends object>(a: T | null, b: T | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const chavesA = Object.keys(a) as Array<keyof T>;
  const chavesB = Object.keys(b) as Array<keyof T>;
  if (chavesA.length !== chavesB.length) return false;
  return chavesA.every((chave) => a[chave] === b[chave]);
}

/** API pública de um publisher com throttle (ver criarPublisher). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface Publisher<_Snapshot> {
  /** Chame a cada frame do game loop; internamente decide se publica. */
  tick(state: EstadoJogo, agoraMs?: number): void;
  /** Força publicação imediata (ex.: ao pausar, ao terminar a partida). */
  forcar(state: EstadoJogo): void;
}

/**
 * Cria um publisher com throttle, genérico sobre o tipo do snapshot que a
 * UI React consome (ver `selecionarHudPadrao` para o snapshot padrão).
 * @param setState setter do React (useState)
 * @param selecionar função pura que extrai o snapshot exibível a partir do
 *   estado completo do jogo
 */
export function criarPublisher<Snapshot extends object>(
  setState: (snapshot: Snapshot) => void,
  selecionar: (state: EstadoJogo) => Snapshot
): Publisher<Snapshot> {
  let ultimaPublicacaoMs = 0;
  let ultimoSnapshot: Snapshot | null = null;

  function publicarSe(state: EstadoJogo, agoraMs: number, ignorarIntervalo: boolean) {
    if (!ignorarIntervalo && agoraMs - ultimaPublicacaoMs < INTERVALO_MINIMO_MS) {
      return;
    }
    const proximo = selecionar(state);
    if (iguaisRaso(proximo, ultimoSnapshot)) {
      // Nada mudou de fato: não gera re-render à toa, mesmo estando no
      // intervalo permitido.
      ultimaPublicacaoMs = agoraMs;
      return;
    }
    ultimoSnapshot = proximo;
    ultimaPublicacaoMs = agoraMs;
    setState(proximo);
  }

  return {
    tick(state, agoraMs = performance.now()) {
      publicarSe(state, agoraMs, false);
    },
    forcar(state) {
      publicarSe(state, performance.now(), true);
    },
  };
}

/** Snapshot de HUD achatado, publicado com throttle pelo publisher padrão. */
export interface HudSnapshot {
  distancia: number;
  hidratacao: number;
  itensColetados: number;
  worldProgress: number;
  causaMorte: CausaMorte;
  itensLiterarios: RegistroItensLiterarios | Record<string, never>;
  versoAtivo: VersoAtivo | null;
}

/**
 * Seletor padrão de HUD — as próximas etapas podem estender ou substituir.
 * Mantido aqui como referência do contrato mínimo esperado pela UI.
 */
export function selecionarHudPadrao(state: EstadoJogo): HudSnapshot {
  return {
    distancia: Math.round(state.distancia),
    hidratacao: state.hidratacao,
    itensColetados: state.itensColetados,
    worldProgress: state.worldProgress,
    causaMorte: state.causaMorte ?? null,
    // Nota: novo objeto a cada chamada — a comparação rasa do publisher
    // trata isso como "sempre mudou", o que é aceitável aqui (republica no
    // máximo a ~10Hz, e o conteúdo em si muda com frequência real de jogo).
    itensLiterarios: { ...(state.itensLiterarios ?? {}) },
    versoAtivo: state.versoAtivo ?? null,
  };
}
