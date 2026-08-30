import type { JSX } from "react";
import { ORDEM_ITENS_LITERARIOS, VERSOS_ITENS_LITERARIOS } from "../game/sobrevivencia.js";
import type { IdItemLiterario, RegistroItensLiterarios } from "../game/gameState.js";

/**
 * Pequenos ícones SVG reconhecíveis por item literário. Silhueta simples,
 * desenhada em `currentColor` — apagada (cinza/opacidade baixa) quando não
 * coletado, acesa (cor + opacidade plena) quando coletado.
 */
const ICONES_ITENS: Record<IdItemLiterario, JSX.Element> = {
  cruz: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M12 2v20M6 8h12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </svg>
  ),
  vela: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <rect x="10" y="9" width="4" height="13" fill="currentColor" />
      <path d="M12 3c1.4 1.6 1.4 3 0 4.4C10.6 6 10.6 4.6 12 3z" fill="currentColor" />
    </svg>
  ),
  moeda: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  ),
  pao: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <ellipse cx="12" cy="13" rx="9" ry="6" fill="currentColor" />
    </svg>
  ),
  rede: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M3 3l18 18M21 3L3 21M3 12h18M12 3v18"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
      />
    </svg>
  ),
};

/**
 * Hud — exibe distância percorrida, água coletada e o inventário discreto
 * de itens literários (silhuetas apagadas para os não coletados, acesas
 * para os obtidos — incentiva completar a coleção).
 *
 * Recebe valores já achatados e throttled (~10 Hz) vindos do publisher do
 * jogo (ver src/game/publisher.ts). NÃO lê o estado do jogo diretamente.
 *
 * Props:
 *   distancia       distância percorrida (metros de jogo, arredondado)
 *   itensColetados  quantidade de itens (água) coletados
 *   itensLiterarios { cruz, vela, moeda, pao, rede: boolean }
 *   nomeJogador     nome escolhido na TitleScreen (dado de UI, nunca lido
 *                   pelo game loop) — exibido discretamente como
 *                   "Severino de {nome}".
 */
export interface HudProps {
  distancia?: number;
  itensColetados?: number;
  itensLiterarios?: Partial<RegistroItensLiterarios>;
  nomeJogador?: string;
}

export default function Hud({ distancia = 0, itensColetados = 0, itensLiterarios = {}, nomeJogador = "" }: HudProps) {
  return (
    <div className="hud" aria-live="polite" role="status">
      {nomeJogador && (
        <span className="hud-item hud-nome" title={`Severino de ${nomeJogador}`}>
          Severino de {nomeJogador}
        </span>
      )}
      <span className="hud-item hud-distancia">
        <span className="hud-rotula">Léguas</span>
        <span className="hud-valor">{Math.round(distancia / 100)}</span>
      </span>
      <span className="hud-item hud-itens">
        <span className="hud-rotula">Água</span>
        <span className="hud-valor">{itensColetados}</span>
      </span>
      <span
        className="hud-inventario"
        role="group"
        aria-label="Itens literários encontrados na jornada"
      >
        {ORDEM_ITENS_LITERARIOS.map((id) => {
          const coletado = Boolean(itensLiterarios[id]);
          return (
            <span
              key={id}
              className="hud-inventario-item"
              data-coletado={coletado}
              title={`${VERSOS_ITENS_LITERARIOS[id].nome}${coletado ? " (encontrado)" : " (não encontrado)"}`}
              aria-label={`${VERSOS_ITENS_LITERARIOS[id].nome}: ${coletado ? "encontrado" : "não encontrado"}`}
            >
              {ICONES_ITENS[id]}
            </span>
          );
        })}
      </span>
    </div>
  );
}
