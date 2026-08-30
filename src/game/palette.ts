/**
 * palette.ts — interpolação de cores consumida pelo <canvas>/Three.js do jogo.
 *
 * O Canvas 2D e os shaders do Three.js não enxergam variáveis CSS, então
 * este módulo é a "fonte da verdade" para as cores desenhadas em cada
 * frame. As cores-base aqui precisam espelhar as definidas em
 * src/styles/tokens.css (SERTÃO / LITORAL). Se ajustar uma paleta, ajuste
 * as duas.
 *
 * Contrato consumido pelas próximas etapas:
 *   getPalette(progress) -> {
 *     ceu, terraClara, terraEscura, clara, sombra, poeira,
 *     uiFundo, uiTexto
 *   }
 * `progress` é um número 0..1 (0 = sertão, 1 = litoral). O game loop (Etapa 2)
 * deve chamar getPalette(state.worldProgress) uma vez por frame (ou sempre
 * que worldProgress mudar) e usar o objeto retornado para os fillStyle do
 * desenho de fundo/silhuetas.
 */

/** Paleta completa de cores derivada do progresso de mundo (0..1). */
export interface Paleta {
  ceu: string;
  terraClara: string;
  terraEscura: string;
  clara: string;
  sombra: string;
  poeira: string;
}

// Paleta SERTÃO — deve espelhar as variáveis --sertao-* em tokens.css
export const PALETA_SERTAO: Paleta = {
  ceu: "#5BB8E8",        // azul tropical vibrante (como na imagem de referência)
  terraClara: "#C4935A", // terra dourada
  terraEscura: "#7A4830",
  clara: "#E8D5A9",
  sombra: "#3D2317",
  poeira: "#D9A35F",
};

// Paleta LITORAL — deve espelhar as variáveis --litoral-* em tokens.css
export const PALETA_LITORAL: Paleta = {
  ceu: "#4AC8E8",        // azul oceano brilhante
  terraClara: "#4FA3A5",
  terraEscura: "#2E6E7E",
  clara: "#A8D5BA",
  sombra: "#1B3A4B",
  poeira: "#7FB8C4",
};

/** Converte "#rrggbb" em [r,g,b] (0-255). */
function hexParaRgb(hex: string): [number, number, number] {
  const limpo = hex.replace("#", "");
  const bigint = parseInt(limpo, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

/** Converte [r,g,b] (0-255) em "#rrggbb". */
function rgbParaHex([r, g, b]: [number, number, number]): string {
  const canal = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${canal(r)}${canal(g)}${canal(b)}`;
}

/**
 * Interpola linearmente entre duas cores hexadecimais.
 * @param a cor inicial, ex. "#C77B3A"
 * @param b cor final, ex. "#4FA3A5"
 * @param t fator 0..1
 * @returns cor hexadecimal interpolada
 */
export function lerpColor(a: string, b: string, t: number): string {
  const clampT = Math.min(1, Math.max(0, t));
  const rgbA = hexParaRgb(a);
  const rgbB = hexParaRgb(b);
  const resultado = rgbA.map((canalA, i) => canalA + (rgbB[i] - canalA) * clampT) as [number, number, number];
  return rgbParaHex(resultado);
}

/**
 * Easing da transição de paleta: o sertão muda DEVAGAR (a vida dura não
 * cede fácil) e a virada para o litoral se torna mais MARCADA no terço
 * final — a chegada precisa emocionar, não só se misturar. Curva côncava
 * simples (t^1.8): próxima de t linear no início, acelera perto de t=1.
 * @param t 0..1
 * @returns 0..1
 */
function easeTransicaoLitoral(t: number): number {
  return Math.pow(Math.min(1, Math.max(0, t)), 1.8);
}

/**
 * Calcula a paleta completa interpolada para um dado progresso de mundo.
 * @param progress 0 (sertão) .. 1 (litoral)
 */
export function getPalette(progress: number): Paleta {
  const t = easeTransicaoLitoral(progress);
  return {
    ceu: lerpColor(PALETA_SERTAO.ceu, PALETA_LITORAL.ceu, t),
    terraClara: lerpColor(PALETA_SERTAO.terraClara, PALETA_LITORAL.terraClara, t),
    terraEscura: lerpColor(PALETA_SERTAO.terraEscura, PALETA_LITORAL.terraEscura, t),
    clara: lerpColor(PALETA_SERTAO.clara, PALETA_LITORAL.clara, t),
    sombra: lerpColor(PALETA_SERTAO.sombra, PALETA_LITORAL.sombra, t),
    poeira: lerpColor(PALETA_SERTAO.poeira, PALETA_LITORAL.poeira, t),
  };
}
