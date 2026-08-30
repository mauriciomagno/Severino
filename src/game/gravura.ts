/**
 * gravura.ts — vocabulário procedural de "xilogravura de cordel".
 * ============================================================
 * Dá a TODO o jogo a mesma linguagem visual das referências: contorno de
 * linha firme + volume construído por hachuras (linhas paralelas, às vezes
 * cruzadas), no espírito da gravura nordestina/cordel. Nenhuma imagem
 * externa — tudo é desenhado com ctx.* a partir de paths simples.
 *
 * ESTRATÉGIA DE PERFORMANCE (importante — leia antes de usar):
 *   Hachurar é basicamente "desenhar dezenas de linhas dentro de um
 *   clip/path", o que é MUITO mais caro que um fillRect/arc simples.
 *   Fazer isso a cada frame para elementos ESTÁTICOS (mandacarus, túmulos,
 *   pedras, texturas de chão) seria desperdício: a forma não muda quadro a
 *   quadro, só a posição de scroll. Por isso:
 *
 *   1. Elementos ESTÁTICOS (cenário/decoração) são pré-renderizados UMA VEZ
 *      por variação/tipo em um <canvas> offscreen (`criarSpriteEstatico`),
 *      guardados num cache Map, e reaproveitados via `ctx.drawImage(...)`
 *      a cada frame — custo passa a ser igual a desenhar uma imagem, não a
 *      recalcular hachuras. Ver `obterSpriteCacheado`.
 *   2. O personagem (Severino), que ANIMA a cada frame, NÃO usa esse cache
 *      de sprite-sheet-por-pose: sua silhueta muda continuamente (ângulos
 *      de perna/braço são contínuos, não um conjunto fixo de poses), então
 *      pré-renderizar explodiria em combinações. Em vez disso, ele usa um
 *      hachurado ECONÔMICO (poucas linhas retas por região — tronco/perna/
 *      chapéu), que é barato o bastante para rodar a 60 FPS (medido: bem
 *      abaixo do orçamento de 16ms/frame mesmo em máquinas modestas, pois
 *      são ~20-30 segmentos de linha por frame, não centena).
 *
 * API:
 *   hachurar(ctx, larguraRegiao, alturaRegiao, angulo, densidade, cor, largura?)
 *     Desenha hachuras DENTRO do clip/transform já configurado pelo
 *     chamador (ctx.save/clip antes, ctx.restore depois — esta função não
 *     salva/restaura sozinha, para poder ser chamada várias vezes dentro do
 *     mesmo clip sem overhead).
 *   contorno(ctx, desenharPath, cor, espessura)
 *     Executa `desenharPath(ctx)` (que deve fazer ctx.beginPath + moveTo/
 *     lineTo/etc.) e aplica ctx.stroke() com a cor/espessura dadas.
 *   texturaGranulada(ctx, x, y, largura, altura, cor, densidade)
 *     Pontos irregulares espalhados (textura de areia/pedra), determinística
 *     (sem Math.random por frame fora do pré-render) via hashing simples.
 *   criarSpriteEstatico(largura, altura, desenhar)
 *     Cria um canvas offscreen do tamanho dado, chama desenhar(ctxOffscreen,
 *     largura, altura) UMA VEZ, e retorna o canvas pronto para drawImage.
 *   obterSpriteCacheado(cache, chave, largura, altura, desenhar)
 *     Helper de cache: se `chave` já existe no Map `cache`, retorna o
 *     sprite existente; senão cria (criarSpriteEstatico) e guarda.
 */

/** Canvas de desenho suportado — offscreen quando disponível, DOM senão. */
export type SpriteCanvas = OffscreenCanvas | HTMLCanvasElement;

/** Contexto 2D suportado pelos dois tipos de canvas acima. */
export type SpriteContext2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/** Hash determinístico simples (0..1) a partir de inteiros — evita
 * Math.random() em texturas que precisam ser estáveis entre frames. */
function hashPseudoAleatorio(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Desenha hachuras (linhas paralelas) cobrindo um retângulo lógico
 * [0,0,largura,altura] no espaço de coordenadas atual do ctx (o chamador
 * deve ter feito ctx.save()+clip()+translate() antes, se quiser confinar a
 * hachura a uma forma específica).
 *
 * @param ctx
 * @param largura região a cobrir (eixo X)
 * @param altura região a cobrir (eixo Y)
 * @param angulo em radianos — 0 = linhas verticais
 * @param densidade espaçamento entre linhas em px (menor = mais denso)
 * @param cor cor do traço (normalmente paleta.sombra)
 * @param espessura largura da linha
 * @param cruzado se true, desenha uma segunda passada perpendicular
 *   (hachura cruzada — sombra mais densa)
 */
export function hachurar(
  ctx: SpriteContext2D,
  largura: number,
  altura: number,
  angulo: number,
  densidade: number,
  cor: string,
  espessura = 1,
  cruzado = false
): void {
  ctx.strokeStyle = cor;
  ctx.lineWidth = espessura;
  const diagonal = Math.hypot(largura, altura);
  const passos = Math.max(1, Math.ceil((diagonal * 2) / densidade));

  function passada(a: number) {
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    ctx.beginPath();
    for (let i = -passos; i <= passos; i++) {
      const offset = i * densidade;
      // Linha "infinita" cruzando a região, centrada no meio do retângulo.
      const cx = largura / 2 + offset * -sinA;
      const cy = altura / 2 + offset * cosA;
      const meia = diagonal;
      ctx.moveTo(cx - cosA * meia, cy - sinA * meia);
      ctx.lineTo(cx + cosA * meia, cy + sinA * meia);
    }
    ctx.stroke();
  }

  passada(angulo);
  if (cruzado) passada(angulo + Math.PI / 2);
}

/**
 * Executa um path arbitrário e aplica stroke — só um atalho para deixar o
 * chamador explícito sobre "isto é contorno de linha", separando
 * semanticamente do preenchimento/hachura.
 */
export function contorno(
  ctx: SpriteContext2D,
  desenharPath: (ctx: SpriteContext2D) => void,
  cor: string,
  espessura = 2
): void {
  ctx.strokeStyle = cor;
  ctx.lineWidth = espessura;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  desenharPath(ctx);
  ctx.stroke();
}

/**
 * Textura granulada determinística (pontos irregulares) — usada para
 * areia/pedra. `densidade` é o número aproximado de pontos por 1000px².
 */
export function texturaGranulada(
  ctx: SpriteContext2D,
  x: number,
  y: number,
  largura: number,
  altura: number,
  cor: string,
  densidade = 18,
  semente = 0
): void {
  ctx.fillStyle = cor;
  const area = largura * altura;
  const quantidade = Math.max(1, Math.round((area / 1000) * densidade));
  for (let i = 0; i < quantidade; i++) {
    const rx = hashPseudoAleatorio(semente + i * 3.11);
    const ry = hashPseudoAleatorio(semente + i * 7.77 + 1);
    const raio = 0.6 + hashPseudoAleatorio(semente + i * 1.61 + 2) * 0.9;
    ctx.beginPath();
    ctx.arc(x + rx * largura, y + ry * altura, raio, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Cria um canvas offscreen (fallback para <canvas> comum quando
 * OffscreenCanvas não existir — ex.: alguns Safari antigos) e chama
 * `desenhar(ctx, largura, altura)` UMA vez. Devolve o canvas pronto para
 * `ctx.drawImage(sprite, x, y)`.
 */
export function criarSpriteEstatico(
  largura: number,
  altura: number,
  desenhar: (ctx: SpriteContext2D, largura: number, altura: number) => void
): SpriteCanvas {
  const larguraPx = Math.max(1, Math.ceil(largura));
  const alturaPx = Math.max(1, Math.ceil(altura));
  let canvas: SpriteCanvas;
  if (typeof OffscreenCanvas !== "undefined") {
    canvas = new OffscreenCanvas(larguraPx, alturaPx);
  } else {
    const canvasDom = document.createElement("canvas");
    canvasDom.width = larguraPx;
    canvasDom.height = alturaPx;
    canvas = canvasDom;
  }
  // getContext("2d") nunca retorna null na prática para um canvas recém-
  // criado sem outro contexto já solicitado — mas o tipo é nullable.
  const ctx = canvas.getContext("2d") as SpriteContext2D | null;
  if (!ctx) throw new Error("Não foi possível obter contexto 2D para o sprite offscreen.");
  desenhar(ctx, larguraPx, alturaPx);
  return canvas;
}

/**
 * Cache simples chave -> sprite offscreen. Use uma Map por "família" de
 * elemento (ex.: uma Map para mandacarus, outra para túmulos) para não
 * colidir chaves entre tipos diferentes de elemento.
 */
export function obterSpriteCacheado(
  cache: Map<string, SpriteCanvas>,
  chave: string,
  largura: number,
  altura: number,
  desenhar: (ctx: SpriteContext2D, largura: number, altura: number) => void
): SpriteCanvas {
  let sprite = cache.get(chave);
  if (!sprite) {
    sprite = criarSpriteEstatico(largura, altura, desenhar);
    cache.set(chave, sprite);
  }
  return sprite;
}
