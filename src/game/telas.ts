/**
 * Estados de tela do jogo. A máquina de estados é simples de propósito:
 * a Etapa 2+ é quem decide QUANDO transicionar (ex.: colisão -> 'gameover'),
 * este componente só reage à mudança de `tela`.
 */
const TELAS = Object.freeze({
  MENU: "menu",
  JOGANDO: "playing",
  GAME_OVER: "gameover",
  VITORIA: "victory",
});

/** União literal dos valores possíveis de `tela` (ver App.tsx). */
export type Tela = (typeof TELAS)[keyof typeof TELAS];

export { TELAS };
