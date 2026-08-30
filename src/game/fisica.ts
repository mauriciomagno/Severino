/**
 * fisica.ts — constantes centrais de física e helpers puros do game loop.
 * ============================================================
 * Toda constante que afeta "game feel" (peso do pulo, janela de coyote time,
 * velocidade do mundo etc.) vive AQUI, num único lugar, para que o tuning do
 * jogo não exija caçar números espalhados pelo código. Ajuste aqui, sinta o
 * resultado, repita.
 *
 * Unidades: pixels VIRTUAIS (ver resolucaoVirtual.ts — espaço de design fixo
 * 960x540) e segundos (não "por frame") — o game loop usa um acumulador de
 * passo fixo (ver GameCanvas.tsx) para que a simulação seja idêntica em
 * qualquer taxa de atualização do monitor (60/120/144Hz) E EM QUALQUER
 * TAMANHO DE TELA (a transformação de escala em GameCanvas.tsx converte o
 * espaço virtual para pixels reais só no desenho — a física nunca vê pixels
 * reais).
 *
 * -----------------------------------------------------------------------
 * CONVERSÃO DE ESCALA (introdução da resolução virtual 960x540)
 * -----------------------------------------------------------------------
 * Antes desta mudança, "pixel" significava pixel CSS do canvas real, que
 * variava com o tamanho da janela (~800-1900px de largura) — as constantes
 * abaixo foram originalmente calibradas por playtesting numa janela de
 * referência de aproximadamente 1280x720. Ao fixar a altura virtual em 540
 * (para caber a resolução 960x540), aplicamos um FATOR DE ESCALA único a
 * toda constante de comprimento/velocidade/aceleração (que compartilham a
 * mesma unidade base de "pixel", e como o tempo NÃO muda de escala, uma
 * velocidade px/s escala exatamente como um comprimento px, e uma
 * aceleração px/s² também, pois s² também não muda):
 *
 *     FATOR_ESCALA = 540 / 720 = 0.75
 *
 * Todas as constantes marcadas "(escalado 0.75x)" abaixo foram
 * multiplicadas por este fator, preservando EXATAMENTE a mesma sensação de
 * jogo (arco de pulo, tempo de voo, relação entre alcance de pulo e gap
 * mínimo) — calcularAlcancePulo/calcularGapMinimo são funções puras dessas
 * constantes, então a proporção entre "quão longe um pulo alcança" e
 * "quão espaçados os obstáculos nascem" é preservada automaticamente sem
 * precisar tocar nas fórmulas.
 *
 * EXCEÇÃO deliberada: LARGURA_JOGADOR/ALTURA_JOGADOR NÃO seguem o fator
 * 0.75 mecânico — foram redefinidas para o alvo explícito de enquadramento
 * (Severino ocupando ~20% da altura virtual, protagonista grande e
 * presente), e MARGEM_HITBOX_JOGADOR foi recalculada para preservar a MESMA
 * proporção (~18%) em relação à nova largura. Como calcularGapMinimo() não
 * depende do tamanho do sprite do jogador (só do alcance de pulo), crescer
 * Severino não interfere na justiça do balanceamento.
 */

export const CONSTANTES_FISICA = Object.freeze({
  // ---------- Passo de simulação ----------
  // Passo fixo da física. 1/120s dá margem folgada acima de monitores de
  // 120Hz e mantém a integração de gravidade estável e determinística.
  PASSO_FIXO_S: 1 / 120,
  // Clamp do delta real de frame — evita "salto" gigante de física quando a
  // aba fica oculta e o navegador atrasa o rAF por segundos.
  DELTA_MAXIMO_S: 1 / 30,

  // ---------- Gravidade e pulo ----------
  // Gravidade "de subida". Severino é um retirante exausto: não é um pulo
  // elástico de plataforma arcade, então a gravidade é relativamente alta e
  // o impulso relativamente contido — arco curto e com peso perceptível.
  GRAVIDADE: 1950, // px/s² durante a subida (enquanto velocidadeY < 0) (escalado 0.75x de 2600)
  // Multiplicador aplicado à gravidade na DESCIDA — cai mais rápido do que
  // subiu, reforçando a sensação de peso/cansaço e deixando o pouso mais
  // "seco" (bom para leitura de colisão também: menos tempo no ar).
  MULTIPLICADOR_GRAVIDADE_QUEDA: 1.7, // proporção adimensional — não escala
  // Velocidade vertical inicial ao pular (negativa = para cima).
  IMPULSO_PULO: -645, // px/s (escalado 0.75x de -860)
  // Variable jump height: se o jogador soltar o botão durante a subida e a
  // velocidade ainda for "mais negativa" que este teto, ela é cortada até
  // aqui — pulo curto quando o toque é breve, sem cortar a descida.
  TETO_VELOCIDADE_AO_SOLTAR: -195, // px/s (escalado 0.75x de -260)
  // Velocidade vertical máxima de queda (terminal), evita que picos de
  // delta acelerem demais a queda em quedas muito longas.
  VELOCIDADE_QUEDA_MAXIMA: 1350, // px/s (escalado 0.75x de 1800)

  // ---------- Janelas de perdão (essenciais pro "feel" do runner) ----------
  // Coyote time: quantos ms depois de sair do chão o jogador ainda pode
  // pular como se estivesse nele. Cobre o caso de apertar o pulo 1-2 frames
  // "tarde demais" em relação à borda visual da plataforma.
  COYOTE_TIME_MS: 90,
  // Jump buffering: quantos ms antes de tocar o chão um pulo pressionado
  // "cedo demais" fica na fila e é executado assim que o chão for tocado.
  JUMP_BUFFER_MS: 120,

  // ---------- Dimensões do jogador ----------
  // TAREFA 1 (reenquadramento): Severino precisa ocupar ~18-24% da ALTURA
  // VIRTUAL (540px) para ser protagonista — não um ponto perdido no quadro.
  // 114px / 540px ≈ 21,1%, dentro do alvo. Largura mantém a mesma proporção
  // largura/altura que o desenho anatômico já usava (44/76 ≈ 0,579):
  // 114 * 0,579 ≈ 66. Estas dimensões são deliberadamente maiores que uma
  // simples escala 0.75x das antigas (44x76) — ver nota no cabeçalho do
  // arquivo sobre por que o jogador é uma exceção ao fator de escala
  // mecânico. calcularAlcancePulo/calcularGapMinimo NÃO dependem do tamanho
  // do jogador (só do alcance de pulo, que vem de IMPULSO_PULO/GRAVIDADE) —
  // então este redimensionamento não quebra a matemática do gap mínimo.
  LARGURA_JOGADOR: 66,
  ALTURA_JOGADOR: 114,
  // Posição horizontal inicial em tela (ponto de partida dentro da janela
  // segura de movimento lateral — ver LIMITE_HORIZONTAL_MIN_FRACAO/MAX_FRACAO).
  X_JOGADOR: 72, // ≈ 0,075 * 960 (mesma fração relativa que antes: 96/1280 de referência)
  // Encolhimento da hitbox de colisão em relação ao sprite visual (forgiving
  // hitbox), em pixels por lado. Recalculado para preservar a MESMA
  // proporção de antes (8/44 ≈ 18,2% da largura do sprite): 66 * 0,182 ≈ 12.
  MARGEM_HITBOX_JOGADOR: 12,

  // ---------- Mundo / scroll ----------
  // Velocidade inicial de rolagem do mundo.
  VELOCIDADE_MUNDO_INICIAL: 195, // px/s (escalado 0.75x de 260)
  // Velocidade máxima (teto) — o jogo fica tenso, não impossível.
  VELOCIDADE_MUNDO_MAXIMA: 465, // px/s (escalado 0.75x de 620)
  // Quão rápido a velocidade se aproxima do teto conforme worldProgress
  // avança (curva suave — ver calcularVelocidadeMundo).
  CURVA_ACELERACAO_MUNDO: 2.2, // adimensional — não escala

  // ---------- Obstáculos ----------
  // Margem extra de segurança somada ao alcance mínimo de pulo calculado
  // dinamicamente (ver calcularGapMinimo) — dá folga para reação humana.
  MARGEM_SEGURANCA_GAP_PX: 45, // (escalado 0.75x de 60)
  // Faixa de variação aleatória ADICIONADA ao gap mínimo, para variedade
  // sem nunca ficar abaixo do mínimo seguro.
  VARIACAO_GAP_MAX_PX: 165, // (escalado 0.75x de 220)
  MARGEM_HITBOX_OBSTACULO: 3, // (escalado 0.75x de 4)

  // ---------- Movimento horizontal ----------
  // Ganho de velocidadeX por segundo enquanto uma direção é pressionada no
  // chão. Alto o bastante para responder rápido ao toque/tecla (runner
  // exige reação imediata), mas não instantâneo — dá uma sensação de peso
  // condizente com o personagem exausto.
  ACELERACAO_HORIZONTAL: 1650, // px/s² (escalado 0.75x de 2200)
  // Desaceleração aplicada quando nenhuma direção está pressionada (ou ao
  // inverter o sentido) — um pouco mais forte que a aceleração para que
  // Severino "pare" com previsibilidade e não deslize feito sabão.
  ATRITO_HORIZONTAL: 1950, // px/s² (escalado 0.75x de 2600)
  // Teto de velocidade horizontal — mantém o movimento lateral como ajuste
  // fino de posição, nunca uma corrida livre pela tela.
  VELOCIDADE_HORIZONTAL_MAXIMA: 195, // px/s (escalado 0.75x de 260)
  // Controle aéreo bem reduzido: no ar o jogador já comprometeu a
  // trajetória do pulo, então só pode corrigir levemente a posição, não
  // "dirigir" o pulo como em um platformer arcade.
  FATOR_CONTROLE_AEREO: 0.4, // adimensional — não escala
  // Janela horizontal de movimento, como frações da largura lógica
  // (virtual) do canvas.
  //
  // TAREFA 2 (pedido do usuário: "caminhar até o final do cenário") — antes
  // o jogador ficava travado numa janela estreita (12%-30% da largura).
  // Agora a janela cobre quase toda a largura jogável (4%-90%), mas o
  // balanceamento dos obstáculos (calcularGapMinimo, função pura e
  // inalterada) foi projetado supondo o jogador numa posição HORIZONTAL
  // conhecida. Se o jogador avança para a direita, o obstáculo recém-
  // nascido está efetivamente mais perto dele do que a IA de spawn
  // calculou — encolhendo o tempo de reação real.
  //
  // A CORREÇÃO fica no PONTO DE SPAWN (ver atualizarSpawnObstaculos em
  // GameCanvas.tsx), não neste clamp: o obstáculo agora nasce em
  //   xSpawn = max(largura + 20, LIMITE_HORIZONTAL_MAX_FRACAO*largura + calcularGapMinimo(velocidadeMundo))
  // ou seja, a distância entre o obstáculo recém-nascido e o PIOR CASO (o
  // jogador colado em LIMITE_HORIZONTAL_MAX_FRACAO, o mais a direita
  // permitido) nunca é menor que o gap mínimo seguro — o mesmo que
  // garantimos entre dois obstáculos consecutivos. Isso empurra o spawn
  // mais para fora da tela quando o mundo já está rápido (gap mínimo maior),
  // exatamente como pedido ("nascer suficientemente além da borda direita").
  LIMITE_HORIZONTAL_MIN_FRACAO: 0.04,
  LIMITE_HORIZONTAL_MAX_FRACAO: 0.9,

  // ---------- Agachar ----------
  // Multiplicador extra de gravidade quando agachado no ar (fast-fall):
  // permite descer mais rápido para reagir a um pulo que durou mais do que
  // o planejado, sem alterar o impulso/altura normal do pulo.
  FATOR_QUEDA_RAPIDA_AGACHADO: 1.8,
  // Fração da ALTURA_JOGADOR usada como altura efetiva (sprite/hitbox)
  // quando agachado — reduz o perfil vertical, coerente com uma postura
  // baixa, sem encolher tanto a ponto de a figura sumir.
  ALTURA_AGACHADO_FATOR: 0.6,
});

/**
 * Calcula a velocidade atual do mundo a partir do progresso (0..1).
 * Curva suave com teto: sobe rápido no início e desacelera perto do fim,
 * nunca ultrapassando VELOCIDADE_MUNDO_MAXIMA.
 * @param worldProgress 0..1
 * @returns px/s
 */
export function calcularVelocidadeMundo(worldProgress: number): number {
  const t = Math.min(1, Math.max(0, worldProgress));
  const fator = 1 - Math.exp(-CONSTANTES_FISICA.CURVA_ACELERACAO_MUNDO * t);
  return (
    CONSTANTES_FISICA.VELOCIDADE_MUNDO_INICIAL +
    fator * (CONSTANTES_FISICA.VELOCIDADE_MUNDO_MAXIMA - CONSTANTES_FISICA.VELOCIDADE_MUNDO_INICIAL)
  );
}

/**
 * Calcula o alcance horizontal aproximado de um pulo completo (sem soltar o
 * botão cedo), dada a velocidade atual do mundo. Usado para garantir que o
 * gap entre obstáculos nunca exija um pulo maior do que o possível.
 *
 * Tempo de voo total (subida + descida com gravidade assimétrica):
 *   t_subida = |IMPULSO_PULO| / GRAVIDADE
 *   t_descida = |IMPULSO_PULO| / (GRAVIDADE * MULTIPLICADOR_GRAVIDADE_QUEDA)
 * Distância percorrida no mundo nesse tempo = velocidadeMundo * tempoTotal.
 *
 * @param velocidadeMundo px/s
 * @returns alcance horizontal em px
 */
export function calcularAlcancePulo(velocidadeMundo: number): number {
  const { GRAVIDADE, MULTIPLICADOR_GRAVIDADE_QUEDA, IMPULSO_PULO } = CONSTANTES_FISICA;
  const tempoSubida = Math.abs(IMPULSO_PULO) / GRAVIDADE;
  const tempoDescida = Math.abs(IMPULSO_PULO) / (GRAVIDADE * MULTIPLICADOR_GRAVIDADE_QUEDA);
  const tempoTotal = tempoSubida + tempoDescida;
  return velocidadeMundo * tempoTotal;
}

/**
 * Gap mínimo GARANTIDO entre o fim de um obstáculo e o início do próximo,
 * em função da velocidade atual do mundo. Nunca gera uma sequência
 * impossível de vencer: o gap é sempre <= alcance de pulo, com margem de
 * segurança para reação humana.
 * @param velocidadeMundo px/s
 * @returns gap mínimo em px
 */
export function calcularGapMinimo(velocidadeMundo: number): number {
  return calcularAlcancePulo(velocidadeMundo) * 0.55 + CONSTANTES_FISICA.MARGEM_SEGURANCA_GAP_PX;
}

/**
 * Altura MÁXIMA que o pulo alcança (ápice), em px, partindo do chão.
 * Física de queda livre: v² = v0² - 2*g*h => no ápice v=0, logo
 *   h_max = v0² / (2*g)
 * Com IMPULSO_PULO=-645 e GRAVIDADE=1950:
 *   h_max = 645² / (2*1950) = 416025 / 3900 ≈ 106,7 px.
 * Esta é a MAIOR altura de obstáculo teoricamente ultrapassável, e só no
 * caso ideal (segurar o botão até o topo exato do arco). Qualquer obstáculo
 * calibrado perto desse número é injogável na prática.
 * @returns px
 */
export function calcularAlturaMaximaPulo(): number {
  const { IMPULSO_PULO, GRAVIDADE } = CONSTANTES_FISICA;
  return (IMPULSO_PULO * IMPULSO_PULO) / (2 * GRAVIDADE);
}

/**
 * Altura MÁXIMA segura para um obstáculo, com folga real sobre o ápice do
 * pulo (calcularAlturaMaximaPulo). Usamos 0,55 do ápice (mesma fração usada
 * em calcularGapMinimo, por consistência de "quanto do pulo ideal contamos
 * como disponível na prática") porque: (1) variable jump height corta a
 * subida se o botão for solto cedo — nem todo pulo chega ao ápice; (2) o
 * corpo do jogador tem volume (não é um ponto), então a "altura útil" de
 * passagem é menor que o pico da trajetória do CENTRO de massa; (3) o
 * jogador precisa de reação humana, não do quadro-a-quadro perfeito.
 * Isto vira o TETO para TODOS os obstáculos (ver dimensoesObstaculo em
 * GameCanvas.tsx) — nenhum tipo pode ultrapassar este valor.
 * @returns px
 */
export function calcularAlturaMaximaObstaculo(): number {
  return calcularAlturaMaximaPulo() * 0.55;
}
