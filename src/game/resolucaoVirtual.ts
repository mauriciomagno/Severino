/**
 * resolucaoVirtual.ts — resolução de DESIGN fixa do jogo.
 * ============================================================
 * PROBLEMA QUE ISTO RESOLVE: antes, tudo era desenhado em pixels absolutos
 * do canvas real (que muda de tamanho conforme a tela/janela — em tela
 * cheia chegava a ~1900px de largura). Como as constantes de arte
 * (LARGURA_JOGADOR=44px, obstáculos de 26-46px etc.) eram fixas em pixels,
 * numa tela grande o personagem virava um ponto minúsculo (~2% da largura,
 * ~9% da altura) e o cenário parecia vazio e chapado.
 *
 * SOLUÇÃO: toda a cena é desenhada num espaço de coordenadas de DESIGN fixo
 * (RESOLUCAO_VIRTUAL, 960x540 = 16:9), não importa o tamanho real da
 * janela. Uma única transformação de escala (ver GameCanvas.tsx,
 * `redimensionar()`) mapeia esse espaço virtual para o canvas real,
 * combinando devicePixelRatio (nitidez em HiDPI) com um fator de escala
 * uniforme. Assim o enquadramento — proporção do personagem, altura do
 * horizonte, tamanho dos obstáculos — é IDÊNTICO em qualquer tela.
 *
 * ESTRATÉGIA DE AJUSTE ESCOLHIDA: "contain" (letterbox/pillarbox), não
 * "cover". Motivo: um endless runner de plataforma depende de o jogador ver
 * a borda direita da tela inteira (é de lá que os obstáculos chegam) — se
 * usássemos "cover" (preencher e cortar o excesso), telas muito
 * largas/estreitas cortariam parte do topo/base ou dos lados e reduziriam o
 * tempo de reação efetivo diante de obstáculos, quebrando o balanceamento
 * calculado em fisica.ts. Com "contain", nunca cortamos conteúdo — sobram
 * apenas barras (pillar/letterbox) nas bordas, preenchidas com uma cor
 * neutra escura que não compete visualmente com a cena.
 */

export const RESOLUCAO_VIRTUAL = Object.freeze({
  LARGURA: 960,
  ALTURA: 540,
});

// Fração da altura virtual onde fica o topo do chão (horizonte). Pedido:
// 62-70% — usamos 66%, meio-termo que deixa uma faixa generosa de céu
// preenchida (silhuetas, sol, aves) sem espremer o chão/obstáculos.
export const FRACAO_CHAO = 0.66;

// Cor das barras de letterbox/pillarbox — deliberadamente mais escura que
// qualquer paleta do jogo (sertão ou litoral) para nunca ser confundida com
// cenário, e neutra o bastante para não brigar com a vinheta do jogo.
export const COR_LETTERBOX = "#0b0806";
