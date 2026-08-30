import type { VersoAtivo } from "../game/gameState.js";

/**
 * VersoOverlay — sobreposição elegante e breve exibida ao coletar um item
 * literário (ou a Semente): mostra o nome do item e um verso curto de
 * "Morte e Vida Severina", aparece e desvanece sozinha (CSS), sem
 * interromper o jogo nem competir visualmente com o cenário.
 *
 * Prop `verso` é o objeto publicado em state.versoAtivo (ver
 * src/game/publisher.ts): { id, nome, verso, ts } ou null. A `key` usada no
 * elemento raiz muda a cada coleta (id+ts), o que reinicia a animação CSS
 * mesmo que o mesmo item seja coletado (não deveria acontecer, mas garante
 * robustez) — cada aparição sempre roda a transição do zero.
 */
export interface VersoOverlayProps {
  verso: VersoAtivo | null;
}

export default function VersoOverlay({ verso }: VersoOverlayProps) {
  if (!verso) return null;

  return (
    <div className="verso-overlay" key={`${verso.id}-${verso.ts}`} aria-live="polite">
      <div className="verso-overlay-caixa">
        <span className="verso-overlay-nome">{verso.nome}</span>
        <p className="verso-overlay-texto">
          {verso.verso.split("\n").map((linha, i) => (
            <span key={i} className="verso-overlay-linha">
              {linha}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}
