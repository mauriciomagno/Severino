import { useEffect, useState } from "react";
import { CONSTANTES_SOBREVIVENCIA } from "../game/sobrevivencia.js";

/**
 * HeatOverlay — o "calor" da sede sentido na tela. Escala CONTINUAMENTE
 * com a gravidade da sede (nunca liga/desliga de repente): a intensidade
 * é uma função contínua de `hidratacao`, 0 acima do limiar de atenção até
 * 1 quando a hidratação chega a zero.
 *
 * Efeito: vinheta quente/avermelhada + uma onda sutil de distorção (CSS
 * puro, sem canvas). Respeita prefers-reduced-motion: a onda é substituída
 * por uma vinheta estática de intensidade equivalente — a informação de
 * urgência nunca desaparece, só a animação.
 */
export interface HeatOverlayProps {
  hidratacao?: number;
}

export default function HeatOverlay({ hidratacao = 1 }: HeatOverlayProps) {
  const [reduzirMovimento, setReduzirMovimento] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  });

  useEffect(() => {
    const consulta = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!consulta) return undefined;
    const ouvir = (evento: MediaQueryListEvent) => setReduzirMovimento(evento.matches);
    consulta.addEventListener?.("change", ouvir);
    return () => consulta.removeEventListener?.("change", ouvir);
  }, []);

  const { LIMIAR_ATENCAO } = CONSTANTES_SOBREVIVENCIA;
  const clamped = Math.min(1, Math.max(0, hidratacao));
  // Intensidade 0 (acima do limiar de atenção) .. 1 (hidratação zero).
  const intensidade = clamped >= LIMIAR_ATENCAO ? 0 : 1 - clamped / LIMIAR_ATENCAO;

  if (intensidade <= 0.001) return null;

  return (
    <div
      className="heat-overlay"
      data-reduzir-movimento={reduzirMovimento}
      style={{ "--intensidade-calor": intensidade } as React.CSSProperties}
      aria-hidden="true"
    />
  );
}
