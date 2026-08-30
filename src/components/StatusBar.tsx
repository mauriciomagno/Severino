import { CONSTANTES_SOBREVIVENCIA } from "../game/sobrevivencia.js";

/**
 * StatusBar — barra de sede/hidratação de Severino.
 *
 * Prop `value` (0..1): 1 = totalmente hidratado, 0 = morte por sede.
 * Três estados visuais, com limiares centralizados em
 * CONSTANTES_SOBREVIVENCIA (sobrevivencia.ts):
 *   - normal   (value > LIMIAR_ATENCAO)
 *   - atencao  (LIMIAR_CRITICO < value <= LIMIAR_ATENCAO)
 *   - critico  (value <= LIMIAR_CRITICO)
 *
 * Acessibilidade: a urgência NUNCA é comunicada só por cor — o rótulo de
 * texto muda ("Normal"/"Atenção"/"Crítico") e um ícone (gota) some/aumenta
 * junto. `role="meter"` + `aria-valuenow` dão o valor bruto a leitores de
 * tela. A intensidade da pulsação (--intensidade-urgencia) escala
 * continuamente com o quão perto de zero está a hidratação — nunca liga/
 * desliga de repente.
 */
export interface StatusBarProps {
  value?: number;
}

export default function StatusBar({ value = 1 }: StatusBarProps) {
  const { LIMIAR_ATENCAO, LIMIAR_CRITICO } = CONSTANTES_SOBREVIVENCIA;
  const clamped = Math.min(1, Math.max(0, value));
  const estado = clamped <= LIMIAR_CRITICO ? "critico" : clamped <= LIMIAR_ATENCAO ? "atencao" : "normal";
  const rotuloEstado = estado === "critico" ? "Crítico" : estado === "atencao" ? "Atenção" : "Normal";
  // Intensidade contínua 0..1 da urgência dentro da faixa crítica, para
  // escalar a pulsação suavemente em vez de ligar no limiar seco.
  const intensidadeUrgencia = clamped >= LIMIAR_CRITICO ? 0 : 1 - clamped / LIMIAR_CRITICO;

  return (
    <div
      className="status-bar"
      data-estado={estado}
      style={{ "--intensidade-urgencia": intensidadeUrgencia } as React.CSSProperties}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={clamped}
      aria-label={`Hidratação de Severino: ${rotuloEstado}`}
    >
      <svg
        className="status-bar-icone"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        aria-hidden="true"
      >
        <path
          d="M12 2c4 5 7 8.6 7 12.5A7 7 0 1 1 5 14.5C5 10.6 8 7 12 2z"
          fill="currentColor"
        />
      </svg>
      <div className="status-bar-trilho">
        <div
          className="status-bar-preenchimento"
          style={{ width: `${clamped * 100}%` }}
        />
      </div>
      <span className="status-bar-rotulo">
        Sede <span className="status-bar-rotulo-estado">· {rotuloEstado}</span>
      </span>
    </div>
  );
}
