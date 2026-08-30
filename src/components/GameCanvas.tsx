import { useEffect, useRef, useState } from "react";
import {
  createInitialState,
  CONTRATO_INPUT,
  ESTADOS_JOGADOR,
  type EstadoJogo,
  type ResultadoJogo,
  type TipoObstaculo,
} from "../game/gameState.js";
import { criarPublisher, selecionarHudPadrao, type HudSnapshot } from "../game/publisher.js";
import { getPalette } from "../game/palette.js";
import {
  CONSTANTES_FISICA,
  calcularVelocidadeMundo,
  calcularGapMinimo,
  calcularAlturaMaximaPulo,
  calcularAlturaMaximaObstaculo,
} from "../game/fisica.js";
import {
  CONSTANTES_SOBREVIVENCIA,
  calcularTaxaDrenagem,
  VERSOS_ITENS_LITERARIOS,
} from "../game/sobrevivencia.js";
import { criarSpriteEstatico, type SpriteCanvas } from "../game/gravura.js";
import { RESOLUCAO_VIRTUAL, FRACAO_CHAO } from "../game/resolucaoVirtual.js";
import { criarRenderer3D, suportaWebGL, type Renderer3D } from "../game/render3d.js";
import type { Paleta } from "../game/palette.js";
import type { EstadoLoop } from "../game/loopState.js";

// ---------------------------------------------------------------------
// REALISMO 2D — direção de luz global única (sol alto à direita, ver
// desenharSilhuetasDistantes: solX ~ 0.78*largura, solY ~ 0.22*altura).
// TODOS os elementos do cenário (mandacarus, túmulos, chão) obedecem a
// esta mesma direção ao decidir qual lado pintar claro/escuro e para onde
// projetar sombra — é isto que faz o cenário ler como coerente/real em vez
// de "cada elemento chapado com sua própria cor". Vetor normalizado
// aproximado (da fonte de luz para o objeto): desce e vai para a
// esquerda.
// ---------------------------------------------------------------------

// Fator de escala VISUAL aplicado ao tamanho de obstáculos/coletáveis em
// relação aos números originais (calibrados para o antigo ALTURA_JOGADOR de
// 76px). Severino cresceu para 114px (ver fisica.ts) — um fator de 1.5x
// (114/76) mantém obstáculos/itens na MESMA proporção visual em relação ao
// personagem, sem depender do fator 0.75 de física/tempo (que rege alcance
// de pulo, velocidade, distâncias de spawn — grandezas diferentes).
const OBST_SCALE = 1.5;
// BUG CORRIGIDO (obstáculo intransponível): as constantes de FÍSICA foram
// escaladas por 0.75 na migração pra resolução virtual, mas os tamanhos
// VISUAIS de obstáculo continuaram escalados por OBST_SCALE=1.5 — as duas
// escalas deixaram de ser compatíveis. Ápice do pulo = 645²/(2*1950) ≈
// 106,7px; o mandacaru (o mais alto, 70 * 1.5 = 105px) sobrava apenas 1,7px
// de folga — impossível na prática (variable jump height corta a maioria
// dos pulos antes do ápice). A altura de TODO obstáculo agora escala por
// OBST_SCALE_ALTURA, derivado do teto seguro calculado em fisica.ts
// (calcularAlturaMaximaObstaculo), preservando as proporções relativas
// entre os tipos (70/40/46/28/32 = mandacaru/toco/cerca/cranio/pedra,
// mandacaru sempre o mais alto). A LARGURA continua em OBST_SCALE (não
// afeta o pulo, só a leitura visual).
const ALTURA_MAXIMA_OBSTACULO_PX = calcularAlturaMaximaObstaculo();
const ALTURA_ORIGINAL_MAX_OBSTACULO = 70; // mandacaru, o mais alto dos 5 tipos
const OBST_SCALE_ALTURA = ALTURA_MAXIMA_OBSTACULO_PX / ALTURA_ORIGINAL_MAX_OBSTACULO;

/**
 * TAREFA — placa/marco de beira de estrada com o nome do jogador.
 * ================================================================
 * "SEVERINO DE {NOME}" entalhado numa placa de madeira envelhecida,
 * levemente inclinada (marco de estrada de terra), com sombreamento
 * coerente com a luz global (LUZ_DIRECAO) e tipografia serifada.
 *
 * PERFORMANCE: como o nome não muda durante a partida, a placa é
 * pré-renderizada (madeira + texto) UMA VEZ POR SPAWN (não por frame) num
 * canvas offscreen via `criarSpriteEstatico` — o desenho por frame é só
 * `ctx.drawImage`. A léguas percorridas (que variam a cada spawn) fazem
 * parte do texto, então cada marco é seu próprio sprite — mas isso ocorre
 * raramente (a cada várias centenas de px), nunca dentro do loop a 60 FPS.
 */
function criarSpritePlaca(nome: string, leguas: number, paleta: Paleta): SpriteCanvas {
  const w = 96;
  const h = 90;
  return criarSpriteEstatico(w, h, (ctx) => {
    ctx.save();
    // Leve inclinação, como um marco fincado às pressas à beira do caminho.
    ctx.translate(w / 2, h * 0.62);
    ctx.rotate(-0.06);
    ctx.translate(-w / 2, -h * 0.62);

    // Estaca de apoio — sombreada na mesma direção da luz global.
    const gradEstaca = ctx.createLinearGradient(w * 0.42, 0, w * 0.58, 0);
    gradEstaca.addColorStop(0, "#3a2415");
    gradEstaca.addColorStop(1, "#6b4526");
    ctx.fillStyle = gradEstaca;
    ctx.fillRect(w * 0.44, h * 0.42, w * 0.12, h * 0.58);

    // Tábua da placa — madeira envelhecida, gradiente claro (lado do sol) a
    // escuro (lado de sombra), a mesma convenção de luz dos demais
    // elementos do cenário.
    const tabuaX = w * 0.06;
    const tabuaY = h * 0.06;
    const tabuaW = w * 0.88;
    const tabuaH = h * 0.4;
    const gradTabua = ctx.createLinearGradient(tabuaX, 0, tabuaX + tabuaW, 0);
    gradTabua.addColorStop(0, "#8a5a34");
    gradTabua.addColorStop(0.45, "#a9713f");
    gradTabua.addColorStop(0.75, "#c08a52");
    gradTabua.addColorStop(1, "#8f5c36");
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(tabuaX, tabuaY, tabuaW, tabuaH, 3);
    ctx.fillStyle = gradTabua;
    ctx.fill();
    ctx.clip();
    // Veios de madeira — linhas finas onduladas, sutis.
    ctx.strokeStyle = "rgba(60,32,14,0.35)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const y = tabuaY + tabuaH * (0.2 + i * 0.22);
      ctx.beginPath();
      ctx.moveTo(tabuaX, y);
      ctx.quadraticCurveTo(tabuaX + tabuaW * 0.5, y + 3, tabuaX + tabuaW, y - 2);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = "#3a2415";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(tabuaX, tabuaY, tabuaW, tabuaH, 3);
    ctx.stroke();

    // Texto entalhado/pintado à mão — fonte serifada, truncagem elegante
    // para nomes longos (campo aceita até 24 caracteres).
    const nomeExibido = (nome || "").trim().slice(0, 24) || "SEVERINO";
    let linha2 = `DE ${nomeExibido}`.toUpperCase();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let tamanhoFonte = 12;
    ctx.font = `700 ${tamanhoFonte}px Georgia, "Times New Roman", serif`;
    while (ctx.measureText(linha2).width > tabuaW - 8 && tamanhoFonte > 7) {
      tamanhoFonte -= 1;
      ctx.font = `700 ${tamanhoFonte}px Georgia, "Times New Roman", serif`;
    }
    if (ctx.measureText(linha2).width > tabuaW - 8) {
      // Ainda não coube: trunca com reticências.
      while (linha2.length > 4 && ctx.measureText(`${linha2}…`).width > tabuaW - 8) {
        linha2 = linha2.slice(0, -1);
      }
      linha2 = `${linha2}…`;
    }
    // Leve irregularidade (como se pintado à mão): rotação minúscula por
    // linha, determinística (não Math.random por frame — desenhado 1x).
    ctx.save();
    ctx.translate(w / 2, tabuaY + tabuaH * 0.36);
    ctx.rotate(-0.015);
    ctx.fillStyle = "rgba(58,36,21,0.85)";
    ctx.font = `700 13px Georgia, "Times New Roman", serif`;
    ctx.fillText("SEVERINO", 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(w / 2, tabuaY + tabuaH * 0.72);
    ctx.rotate(0.012);
    ctx.fillStyle = "rgba(58,36,21,0.85)";
    ctx.font = `700 ${tamanhoFonte}px Georgia, "Times New Roman", serif`;
    ctx.fillText(linha2, 0, 0);
    ctx.restore();

    // Léguas percorridas — marco de quilometragem, discreto, abaixo da tábua.
    if (leguas > 0) {
      ctx.fillStyle = paleta.sombra;
      ctx.font = `italic 9px Georgia, serif`;
      ctx.fillText(`${leguas} léguas`, w / 2, tabuaY + tabuaH + 11);
    }

    ctx.restore();
  });
}

export interface GameCanvasProps {
  ativo: boolean;
  onHudAtualizado: (snapshot: HudSnapshot) => void;
  onFimDeJogo: (resultado: NonNullable<ResultadoJogo>) => void;
  nomeJogador?: string;
}

export default function GameCanvas({ ativo, onHudAtualizado, onFimDeJogo, nomeJogador = "" }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderer3DRef = useRef<Renderer3D | null>(null);
  const stateRef = useRef<EstadoJogo>(createInitialState());
  const rafRef = useRef<number | null>(null);
  // TAREFA 4 (fallback): se o navegador não expuser WebGL, mostramos uma
  // mensagem clara em português em vez de deixar a tela em branco/quebrada.
  const [webglIndisponivel, setWebglIndisponivel] = useState(false);

  // Nome do jogador chega como PROP normal de UI (definido antes da
  // partida, na TitleScreen). Guardado num ref para que o game loop (que
  // roda fora do ciclo de render do React) sempre leia o valor mais
  // recente sem depender de closures antigas — nunca dispara setState.
  const nomeJogadorRef = useRef(nomeJogador);
  useEffect(() => {
    nomeJogadorRef.current = nomeJogador;
  }, [nomeJogador]);

  // "latest ref": onHudAtualizado/onFimDeJogo podem mudar de identidade entre
  // renders (ex.: recriadas sem useCallback em algum ponto da árvore). O
  // publisher e o loop sempre devem chamar a versão mais recente, nunca a
  // capturada no primeiro render.
  const onHudAtualizadoRef = useRef(onHudAtualizado);
  const onFimDeJogoRef = useRef(onFimDeJogo);
  useEffect(() => {
    onHudAtualizadoRef.current = onHudAtualizado;
  }, [onHudAtualizado]);
  useEffect(() => {
    onFimDeJogoRef.current = onFimDeJogo;
  }, [onFimDeJogo]);

  const publisherRef = useRef(
    criarPublisher<HudSnapshot>((snapshot) => onHudAtualizadoRef.current?.(snapshot), selecionarHudPadrao)
  );

  // Estado interno do loop que não faz parte do contrato "salvo" de
  // gameState.ts (temporizadores de coyote/buffer, offsets de parallax,
  // contador de spawn, ciclo de animação de corrida). Vive fora de
  // stateRef.current para não poluir o contrato documentado, mas segue a
  // mesma regra: mutação direta, nunca setState.
  const loopRef = useRef<EstadoLoop | null>(null);

  function criarEstadoLoop(): EstadoLoop {
    return {
      tempoJogoMs: 0, // acumulador de tempo de simulação (avança em passos fixos)
      acumuladorFisicaS: 0,
      ultimoTimestampMs: null,
      pulandoAnterior: false,
      ultimoPressionamentoPuloMs: -Infinity,
      puloConsumido: false,
      ultimaVezNoChaoMs: 0,
      cicloCorrida: 0, // avança com o tempo para animar as pernas
      distanciaAteProximoSpawn: 360, // (escalado 0.75x de 480 — mesma conversão de fisica.ts)
      proximoIdObstaculo: 1,
      parallaxOffsets: [0, 0, 0],
      reducaoMovimento: false,
      // ---------- Etapa 3: sobrevivência/coletáveis ----------
      distanciaAteProximaAgua:
        CONSTANTES_SOBREVIVENCIA.DISTANCIA_MEDIA_SPAWN_AGUA_PX * 0.6,
      distanciaAteProximaSemente: 0,
      proximoIdColetavel: 1,
      // ---------- Etapa 4: a Morte (perseguidora) ----------
      // Segundos desde a última coleta (água ou item literário). Alimenta
      // a "pressão de ociosidade" que aproxima a Morte quando o jogador
      // fica tempo demais sem agir — ver atualizarMorte().
      tempoDesdeUltimaColetaS: 0,
      // ---------- Placa com o nome do jogador (marco de beira de estrada) ----------
      placas: [], // { x, sprite, largura, altura } — reciclado como obstáculos
      proximoIdPlaca: 1,
      // Primeira placa aparece cedo (nos primeiros metros da jornada), as
      // seguintes marcam quilometragem (léguas) ao longo do percurso.
      distanciaAteProximaPlaca: 260,
      primeiraPlacaMostrada: false,
    };
  }

  function reiniciarPartida() {
    stateRef.current = createInitialState();
    const chaoTopoInicial = alturaLogicaAtual() * FRACAO_CHAO - CONSTANTES_FISICA.ALTURA_JOGADOR;
    // Posição horizontal inicial dentro do novo clamp de movimento lateral
    // (perto do limite mínimo da janela segura, igual ao X_JOGADOR fixo de
    // antes, mas agora como ponto de partida móvel).
    stateRef.current.jogador.x = CONSTANTES_FISICA.X_JOGADOR;
    stateRef.current.jogador.y = chaoTopoInicial;
    stateRef.current.jogador.velocidadeX = 0;
    stateRef.current.jogador.largura = CONSTANTES_FISICA.LARGURA_JOGADOR;
    stateRef.current.jogador.altura = CONSTANTES_FISICA.ALTURA_JOGADOR;
    stateRef.current.velocidadeMundo = CONSTANTES_FISICA.VELOCIDADE_MUNDO_INICIAL;
    loopRef.current = criarEstadoLoop();
  }

  // TAREFA 1 (resolução virtual): a partir daqui, "altura/largura lógica"
  // do jogo é SEMPRE a resolução virtual fixa (960x540), nunca o tamanho
  // real do canvas — é isto que garante o MESMO enquadramento (fração de
  // tela ocupada pelo personagem, altura do horizonte etc.) em qualquer
  // tela. A conversão para pixels reais acontece só em `redimensionar()`,
  // via uma transformação de escala aplicada ao contexto 2D.
  function alturaLogicaAtual(): number {
    return RESOLUCAO_VIRTUAL.ALTURA;
  }

  // Inicialização do renderizador 3D (Three.js imperativo) + redimensionamento
  // responsivo. A câmera (ver render3d.ts) já resolve o equivalente ao antigo
  // letterbox 2D via distância — nunca corta a largura lógica de 960 unidades
  // que a física assume.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    if (!suportaWebGL()) {
      setWebglIndisponivel(true);
      return undefined;
    }

    const renderer3D = criarRenderer3D(canvas);
    renderer3DRef.current = renderer3D;

    function redimensionar() {
      const { clientWidth, clientHeight } = canvas!.parentElement ?? canvas!;
      renderer3D.resize(Math.max(1, clientWidth), Math.max(1, clientHeight));
      desenharFrame();
    }

    redimensionar();
    const observer = new ResizeObserver(redimensionar);
    observer.observe(canvas.parentElement ?? canvas);
    window.addEventListener("resize", redimensionar);
    return () => {
      window.removeEventListener("resize", redimensionar);
      observer.disconnect();
      renderer3D.dispose();
      renderer3DRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Contrato de input (ver CONTRATO_INPUT em gameState.ts para o esquema
  // completo de teclado + zonas de toque): registra flags em
  // stateRef.input. A física (coyote/buffer/corte de pulo, movimento
  // lateral, agachar) é lida a partir dessas flags dentro do game loop.
  // Só registra os listeners enquanto a partida está `ativo` — evita
  // capturar/prevenir teclas fora da tela de jogo (ex.: na tela de título).
  useEffect(() => {
    if (!ativo) return undefined;

    function aoPressionarTecla(evento: KeyboardEvent) {
      if (!CONTRATO_INPUT.teclas.includes(evento.code)) return;
      evento.preventDefault();
      const input = stateRef.current.input;
      if (CONTRATO_INPUT.teclasPulo.includes(evento.code)) input.pulando = true;
      if (CONTRATO_INPUT.teclasEsquerda.includes(evento.code)) input.esquerda = true;
      if (CONTRATO_INPUT.teclasDireita.includes(evento.code)) input.direita = true;
      if (CONTRATO_INPUT.teclasAgachar.includes(evento.code)) input.agachando = true;
    }
    function aoSoltarTecla(evento: KeyboardEvent) {
      if (!CONTRATO_INPUT.teclas.includes(evento.code)) return;
      const input = stateRef.current.input;
      if (CONTRATO_INPUT.teclasPulo.includes(evento.code)) input.pulando = false;
      if (CONTRATO_INPUT.teclasEsquerda.includes(evento.code)) input.esquerda = false;
      if (CONTRATO_INPUT.teclasDireita.includes(evento.code)) input.direita = false;
      if (CONTRATO_INPUT.teclasAgachar.includes(evento.code)) input.agachando = false;
    }

    // Esquema de toque por ZONAS com suporte a MULTI-TOUCH:
    // terço esquerdo/direito do canvas movem; terço central dividido
    // em metade de cima (pular) e baixo (agachar).
    // Múltiplos dedos são combinados via OR — assim o jogador pode
    // segurar ← com um dedo e tocar Pular com outro simultaneamente.
    type Zona = "esquerda" | "direita" | "pular" | "agachar" | null;
    function zonaDoToque(clientX: number, clientY: number): Zona {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const retangulo = canvas.getBoundingClientRect();
      const xRel = (clientX - retangulo.left) / Math.max(1, retangulo.width);
      const yRel = (clientY - retangulo.top) / Math.max(1, retangulo.height);
      if (xRel < 1 / 3) return "esquerda";
      if (xRel > 2 / 3) return "direita";
      return yRel < 0.5 ? "pular" : "agachar";
    }

    // Acumula o OR de TODOS os dedos presentes na tela.
    function aplicarMultiToque(touches: TouchList) {
      const input = stateRef.current.input;
      input.esquerda  = false;
      input.direita   = false;
      input.pulando   = false;
      input.agachando = false;
      for (let i = 0; i < touches.length; i++) {
        const t = touches[i];
        const zona = zonaDoToque(t.clientX, t.clientY);
        if (zona === "esquerda") input.esquerda  = true;
        if (zona === "direita")  input.direita   = true;
        if (zona === "pular")    input.pulando   = true;
        if (zona === "agachar")  input.agachando = true;
      }
    }

    function limparInputToque() {
      const input = stateRef.current.input;
      input.esquerda  = false;
      input.direita   = false;
      input.pulando   = false;
      input.agachando = false;
    }

    function aoTocar(evento: TouchEvent) {
      evento.preventDefault();
      aplicarMultiToque(evento.touches);
    }
    function aoMoverToque(evento: TouchEvent) {
      evento.preventDefault();
      aplicarMultiToque(evento.touches);
    }
    function aoSoltarToque(evento: TouchEvent) {
      if (evento.touches && evento.touches.length > 0) {
        aplicarMultiToque(evento.touches);
      } else {
        limparInputToque();
      }
    }
    function aoPressionarMouse(evento: MouseEvent) {
      const zona = zonaDoToque(evento.clientX, evento.clientY);
      const input = stateRef.current.input;
      input.esquerda  = zona === "esquerda";
      input.direita   = zona === "direita";
      input.pulando   = zona === "pular";
      input.agachando = zona === "agachar";
    }
    function aoMoverMouseBotaoPressionado(evento: MouseEvent) {
      if (evento.buttons !== 1) return;
      aoPressionarMouse(evento);
    }
    function aoSoltarMouseUp() {
      limparInputToque();
    }

    window.addEventListener("keydown", aoPressionarTecla);
    window.addEventListener("keyup", aoSoltarTecla);
    const canvas = canvasRef.current;
    canvas?.addEventListener("touchstart", aoTocar, { passive: false });
    canvas?.addEventListener("touchmove", aoMoverToque, { passive: false });
    canvas?.addEventListener("touchend", aoSoltarToque, { passive: false });
    canvas?.addEventListener("touchcancel", aoSoltarToque, { passive: false });
    canvas?.addEventListener("mousedown", aoPressionarMouse);
    canvas?.addEventListener("mousemove", aoMoverMouseBotaoPressionado);
    window.addEventListener("mouseup", aoSoltarMouseUp);

    return () => {
      window.removeEventListener("keydown", aoPressionarTecla);
      window.removeEventListener("keyup", aoSoltarTecla);
      canvas?.removeEventListener("touchstart", aoTocar);
      canvas?.removeEventListener("touchmove", aoMoverToque);
      canvas?.removeEventListener("touchend", aoSoltarToque);
      canvas?.removeEventListener("touchcancel", aoSoltarToque);
      canvas?.removeEventListener("mousedown", aoPressionarMouse);
      canvas?.removeEventListener("mousemove", aoMoverMouseBotaoPressionado);
      window.removeEventListener("mouseup", aoSoltarMouseUp);
      limparInputToque();
    };
  }, [ativo]);

  // ---------------------------------------------------------------------
  // FÍSICA — um passo de duração fixa (CONSTANTES_FISICA.PASSO_FIXO_S).
  // Chamado 0..N vezes por frame pelo acumulador, garantindo que o pulo se
  // comporte identicamente em 60/120/144Hz.
  // ---------------------------------------------------------------------
  function passoFisicaFixo(dtS: number) {
    const state = stateRef.current;
    const loop = loopRef.current!;
    const { jogador } = state;
    const dtMs = dtS * 1000;
    loop.tempoJogoMs += dtMs;

    // ---- Detecta borda de pressionar/soltar o pulo ----
    const pulandoAgora = state.input.pulando;
    if (pulandoAgora && !loop.pulandoAnterior) {
      loop.ultimoPressionamentoPuloMs = loop.tempoJogoMs;
      loop.puloConsumido = false;
    }
    if (!pulandoAgora && loop.pulandoAnterior) {
      // Variable jump height: soltou o botão durante a subida -> corta o
      // impulso até o teto configurado (sem afetar a queda).
      if (jogador.velocidadeY < CONSTANTES_FISICA.TETO_VELOCIDADE_AO_SOLTAR) {
        jogador.velocidadeY = CONSTANTES_FISICA.TETO_VELOCIDADE_AO_SOLTAR;
      }
    }
    loop.pulandoAnterior = pulandoAgora;

    // ---- Movimento horizontal (aceleração/atrito, com clamp de posição) ----
    // Física simples de aceleração/atrito rodando dentro do passo fixo,
    // igual à vertical — nunca no rAF fora do acumulador.
    const direcaoInput = (state.input.direita ? 1 : 0) - (state.input.esquerda ? 1 : 0);
    const fatorControle = jogador.noChao ? 1 : CONSTANTES_FISICA.FATOR_CONTROLE_AEREO;
    if (direcaoInput !== 0) {
      jogador.velocidadeX += direcaoInput * CONSTANTES_FISICA.ACELERACAO_HORIZONTAL * fatorControle * dtS;
    } else if (jogador.velocidadeX !== 0) {
      const sinal = Math.sign(jogador.velocidadeX);
      const atrito = CONSTANTES_FISICA.ATRITO_HORIZONTAL * fatorControle * dtS;
      jogador.velocidadeX -= sinal * Math.min(atrito, Math.abs(jogador.velocidadeX));
    }
    jogador.velocidadeX = Math.max(
      -CONSTANTES_FISICA.VELOCIDADE_HORIZONTAL_MAXIMA,
      Math.min(CONSTANTES_FISICA.VELOCIDADE_HORIZONTAL_MAXIMA, jogador.velocidadeX)
    );
    jogador.x += jogador.velocidadeX * dtS;

    // Clamp de posição: mantém o jogador numa janela segura à esquerda da
    // tela (ver comentário extenso em CONSTANTES_FISICA.LIMITE_HORIZONTAL_*
    // sobre por que isso é crítico para o balanceamento dos obstáculos).
    // Zera velocidadeX ao bater no limite para não "grudar" acumulando
    // velocidade contra a parede invisível.
    const larguraCanvasAtual = alcanceHorizontalCanvas();
    const limiteMin = larguraCanvasAtual * CONSTANTES_FISICA.LIMITE_HORIZONTAL_MIN_FRACAO;
    const limiteMax = larguraCanvasAtual * CONSTANTES_FISICA.LIMITE_HORIZONTAL_MAX_FRACAO;
    if (jogador.x < limiteMin) {
      jogador.x = limiteMin;
      jogador.velocidadeX = 0;
    } else if (jogador.x > limiteMax) {
      jogador.x = limiteMax;
      jogador.velocidadeX = 0;
    }

    // ---- Agachar: hitbox/altura reduzida no chão, fast-fall no ar ----
    const agachandoAgora = state.input.agachando && jogador.estado !== ESTADOS_JOGADOR.MORTO;
    if (agachandoAgora && jogador.noChao) {
      if (jogador.estado !== ESTADOS_JOGADOR.AGACHADO) {
        const alturaAgachado = CONSTANTES_FISICA.ALTURA_JOGADOR * CONSTANTES_FISICA.ALTURA_AGACHADO_FATOR;
        // Mantém os pés no chão: y sobe a diferença de altura perdida.
        jogador.y += jogador.altura - alturaAgachado;
        jogador.altura = alturaAgachado;
        jogador.estado = ESTADOS_JOGADOR.AGACHADO;
      }
    } else if (jogador.estado === ESTADOS_JOGADOR.AGACHADO && (!agachandoAgora || !jogador.noChao)) {
      // Volta à altura normal ao soltar agachar (ou ao deixar o chão) —
      // repõe jogador.y para não afundar no chão nem flutuar.
      jogador.y -= CONSTANTES_FISICA.ALTURA_JOGADOR - jogador.altura;
      jogador.altura = CONSTANTES_FISICA.ALTURA_JOGADOR;
      jogador.estado = ESTADOS_JOGADOR.CORRENDO;
    }
    const fastFallAgachado = agachandoAgora && !jogador.noChao;

    // ---- Coyote time + jump buffering ----
    const dentroDoCoyote =
      jogador.noChao || loop.tempoJogoMs - loop.ultimaVezNoChaoMs <= CONSTANTES_FISICA.COYOTE_TIME_MS;
    const pedidoDePuloNoBuffer =
      !loop.puloConsumido &&
      loop.tempoJogoMs - loop.ultimoPressionamentoPuloMs <= CONSTANTES_FISICA.JUMP_BUFFER_MS;

    if (dentroDoCoyote && pedidoDePuloNoBuffer && jogador.estado !== ESTADOS_JOGADOR.MORTO) {
      jogador.velocidadeY = CONSTANTES_FISICA.IMPULSO_PULO;
      jogador.noChao = false;
      jogador.estado = ESTADOS_JOGADOR.PULANDO;
      loop.puloConsumido = true; // sem pulo duplo: consome o buffer/coyote
    }

    // ---- Integração vertical ----
    // Usa jogador.altura ATUAL (pode estar reduzida se agachado) para que
    // os pés continuem no mesmo chaoY visual, independente do estado.
    const chaoTopoY = alturaLogicaAtual() * FRACAO_CHAO - jogador.altura;
    if (!jogador.noChao) {
      let gravidadeAtual =
        jogador.velocidadeY < 0
          ? CONSTANTES_FISICA.GRAVIDADE
          : CONSTANTES_FISICA.GRAVIDADE * CONSTANTES_FISICA.MULTIPLICADOR_GRAVIDADE_QUEDA;
      // Fast-fall: segurar agachar no ar multiplica a gravidade de queda
      // (só quando já caindo, não afeta a subida do pulo).
      if (fastFallAgachado && jogador.velocidadeY >= 0) {
        gravidadeAtual *= CONSTANTES_FISICA.FATOR_QUEDA_RAPIDA_AGACHADO;
      }
      jogador.velocidadeY += gravidadeAtual * dtS;
      if (jogador.velocidadeY > CONSTANTES_FISICA.VELOCIDADE_QUEDA_MAXIMA) {
        jogador.velocidadeY = CONSTANTES_FISICA.VELOCIDADE_QUEDA_MAXIMA;
      }
      jogador.y += jogador.velocidadeY * dtS;

      if (jogador.y >= chaoTopoY) {
        jogador.y = chaoTopoY;
        jogador.velocidadeY = 0;
        jogador.noChao = true;
        loop.ultimaVezNoChaoMs = loop.tempoJogoMs;
        if (jogador.estado !== ESTADOS_JOGADOR.MORTO) jogador.estado = ESTADOS_JOGADOR.CORRENDO;
        // Microinteração: poeira do pouso (cosmético, some sozinho).
        state.efeitos.push({
          tipo: "poeira",
          x: jogador.x + jogador.largura / 2,
          y: chaoTopoY + jogador.altura,
          criadoEmMs: loop.tempoJogoMs,
          duracaoMs: 280,
        });
      }
    } else {
      jogador.y = chaoTopoY;
    }

    // ---- Scroll do mundo ----
    state.velocidadeMundo = calcularVelocidadeMundo(state.worldProgress);
    const deslocamento = state.velocidadeMundo * dtS;
    state.distancia += deslocamento;
    state.worldProgress = Math.min(1, Math.max(0, state.distancia / state.distanciaTotal));

    // ---- Hidratação: drena continuamente (curva de sobrevivencia.ts) ----
    const taxaAtual = calcularTaxaDrenagem(state.worldProgress);
    state.taxaConsumoHidratacao = taxaAtual; // exposto para depuração/HUD futuro
    state.hidratacao = Math.max(0, state.hidratacao - taxaAtual * dtS);
    if (!state.terminado && state.hidratacao <= 0) {
      state.terminado = true;
      state.resultado = "death";
      state.causaMorte = "sede";
      jogador.estado = ESTADOS_JOGADOR.MORTO;
      state.morte.distanciaAteJogador = 0;
      state.morte.visivel = true;
      publisherRef.current.forcar(state);
      onFimDeJogoRef.current?.("death");
      return;
    }

    // ---- Parallax (offsets acumulados; usados só no desenho) ----
    loop.parallaxOffsets[0] += deslocamento * 0.2;
    loop.parallaxOffsets[1] += deslocamento * 0.5;
    loop.parallaxOffsets[2] += deslocamento * 1.0;

    // ---- Ciclo de animação de corrida ----
    // Escala com a velocidade do mundo: correr mais rápido (worldProgress
    // avançado) precisa parecer mais rápido nas pernas, não só o cenário.
    const fatorVelocidadeAnimacao = state.velocidadeMundo / CONSTANTES_FISICA.VELOCIDADE_MUNDO_INICIAL;
    loop.cicloCorrida += dtS * (jogador.noChao ? 8.5 * fatorVelocidadeAnimacao : 0);

    // ---- Spawn de obstáculos com gap mínimo garantido ----
    atualizarSpawnObstaculos(deslocamento);

    // ---- Spawn de coletáveis (água, itens literários, Semente) ----
    atualizarSpawnAgua(deslocamento);
    atualizarSpawnItensLiterarios();
    atualizarSpawnSemente(deslocamento);

    // ---- Move obstáculos e recicla os que saíram da tela (sem alocar) ----
    moverERecolherObstaculos(deslocamento);

    // ---- Placa com o nome do jogador (marco de beira de estrada) ----
    atualizarSpawnPlacas(deslocamento);
    moverERecolherPlacas(deslocamento);

    // ---- Colisão AABB (hitbox um pouco menor que o sprite) ----
    verificarColisao();
    verificarColetaDeItens();

    // ---- Efeitos visuais transitórios (flash de coleta) ----
    limparEfeitosExpirados();

    // ---- A Morte: presença que responde ao desempenho do jogador ----
    if (!state.terminado) atualizarMorte(dtS);
    if (state.terminado) return;

    // ETAPA 3: a Semente final (colheita simbólica) dispara a vitória — a
    // chegada ao litoral sozinha (worldProgress >= 1) NÃO basta; é preciso
    // ter colhido `state.sementeColhida` (ver verificarColetaDeItens).
    if (!state.terminado && state.worldProgress >= 1 && state.sementeColhida) {
      state.terminado = true;
      state.resultado = "victory";
      publisherRef.current.forcar(state);
      onFimDeJogoRef.current?.("victory");
    }
  }

  function alcanceHorizontalCanvas(): number {
    return RESOLUCAO_VIRTUAL.LARGURA;
  }

  function tipoObstaculoAleatorio(): TipoObstaculo {
    const tipos: TipoObstaculo[] = ["mandacaru", "toco", "pedra", "cerca", "cranio"];
    return tipos[Math.floor(Math.random() * tipos.length)];
  }

  // Largura escalada por OBST_SCALE (1.5x, não afeta o pulo). Altura
  // escalada por OBST_SCALE_ALTURA (derivado do teto seguro do ápice do
  // pulo — ver comentário de OBST_SCALE_ALTURA no topo do arquivo),
  // preservando as proporções originais entre os tipos.
  function dimensoesObstaculo(tipo: TipoObstaculo): { largura: number; altura: number } {
    let largura: number, altura: number;
    switch (tipo) {
      case "mandacaru":
        largura = 26 * OBST_SCALE; altura = 70 * OBST_SCALE_ALTURA; break;
      case "toco":
        largura = 34 * OBST_SCALE; altura = 40 * OBST_SCALE_ALTURA; break;
      case "cerca":
        largura = 46 * OBST_SCALE; altura = 46 * OBST_SCALE_ALTURA; break;
      case "cranio":
        largura = 38 * OBST_SCALE; altura = 28 * OBST_SCALE_ALTURA; break;
      case "pedra":
      default:
        largura = 40 * OBST_SCALE; altura = 32 * OBST_SCALE_ALTURA; break;
    }
    // GUARDA DE REGRESSÃO: clamp final ao teto calculado a partir do ápice
    // do pulo. Mesmo que alguém troque OBST_SCALE_ALTURA ou os números-base
    // acima no futuro, nenhum obstáculo pode nascer mais alto do que o
    // jogador consegue transpor.
    altura = Math.min(altura, ALTURA_MAXIMA_OBSTACULO_PX);
    return { largura, altura };
  }

  function atualizarSpawnObstaculos(deslocamento: number) {
    const state = stateRef.current;
    const loop = loopRef.current!;
    loop.distanciaAteProximoSpawn -= deslocamento;
    if (loop.distanciaAteProximoSpawn > 0) return;

    const largura = alcanceHorizontalCanvas();
    const tipo = tipoObstaculoAleatorio();
    const { largura: largObstaculo, altura: altObstaculo } = dimensoesObstaculo(tipo);
    const chaoY = alturaLogicaAtual() * FRACAO_CHAO;

    // TAREFA 2 — PIOR CASO: como o jogador agora pode avançar até
    // LIMITE_HORIZONTAL_MAX_FRACAO da largura (quase a borda direita), o
    // ponto de spawn não pode mais ser sempre "largura + 20" — se o jogador
    // já estiver colado na borda direita, isso daria quase zero tempo de
    // reação. Garantimos que a distância entre o PIOR CASO (jogador em
    // limiteMax) e o spawn seja pelo menos o gap mínimo seguro (a mesma
    // regra usada entre dois obstáculos consecutivos) — se o mundo está
    // rápido (gap mínimo maior), o obstáculo nasce mais além da borda.
    const gapMinimo = calcularGapMinimo(state.velocidadeMundo);
    const limiteMaxX = largura * CONSTANTES_FISICA.LIMITE_HORIZONTAL_MAX_FRACAO;
    const xSpawn = Math.max(largura + 20, limiteMaxX + gapMinimo);

    state.obstaculos.push({
      id: loop.proximoIdObstaculo++,
      tipo,
      x: xSpawn,
      y: chaoY - altObstaculo,
      largura: largObstaculo,
      altura: altObstaculo,
    });

    const variacao = Math.random() * CONSTANTES_FISICA.VARIACAO_GAP_MAX_PX;
    loop.distanciaAteProximoSpawn = gapMinimo + variacao + largObstaculo;
  }

  function moverERecolherObstaculos(deslocamento: number) {
    const state = stateRef.current;
    const obstaculos = state.obstaculos;
    let escrita = 0;
    for (let leitura = 0; leitura < obstaculos.length; leitura++) {
      const obstaculo = obstaculos[leitura];
      obstaculo.x -= deslocamento;
      if (obstaculo.x + obstaculo.largura >= 0) {
        obstaculos[escrita] = obstaculo;
        escrita++;
      }
    }
    obstaculos.length = escrita;

    // Coletáveis reciclados do mesmo jeito (sem alocar), incluindo os já
    // coletados (ficam invisíveis/inertes até saírem da tela).
    const coletaveis = state.coletaveis;
    let escritaC = 0;
    for (let leitura = 0; leitura < coletaveis.length; leitura++) {
      const coletavel = coletaveis[leitura];
      coletavel.x -= deslocamento;
      if (coletavel.x + coletavel.largura >= 0) {
        coletaveis[escritaC] = coletavel;
        escritaC++;
      }
    }
    coletaveis.length = escritaC;
  }

  // ---------------------------------------------------------------------
  // COLETÁVEIS — Etapa 3: água (sobrevivência), itens literários (raros e
  // únicos) e a Semente final (clímax da vitória).
  // ---------------------------------------------------------------------
  function hitbocaObstaculosSobrepoe(x: number, largura: number): boolean {
    const state = stateRef.current;
    const margem = CONSTANTES_SOBREVIVENCIA.MARGEM_ANTICOLISAO_SPAWN_PX;
    return state.obstaculos.some(
      (o) => x - margem < o.x + o.largura && x + largura + margem > o.x
    );
  }

  function atualizarSpawnAgua(deslocamento: number) {
    const state = stateRef.current;
    const loop = loopRef.current!;
    loop.distanciaAteProximaAgua -= deslocamento;
    if (loop.distanciaAteProximaAgua > 0) return;

    const larguraCanvas = alcanceHorizontalCanvas();
    const chaoY = alturaLogicaAtual() * FRACAO_CHAO;
    const largura = 30 * OBST_SCALE;
    const altura = 30 * OBST_SCALE;
    const x = larguraCanvas + 30;

    // Não nasce sobrepondo a hitbox de um obstáculo já posicionado.
    if (!hitbocaObstaculosSobrepoe(x, largura)) {
      const alta = Math.random() < 0.45; // posição alta: exige pulo (risco x recompensa)
      // Offset extra de altura DERIVADO do ápice do pulo (mesma lógica de
      // calcularAlturaMaximaObstaculo em fisica.ts), não um número mágico:
      // o topo do item (altura + offset) precisa caber com folga real sob
      // o ápice teórico (calcularAlturaMaximaPulo), já que nem todo pulo
      // chega ao topo do arco (variable jump height). Usamos metade do
      // ápice como offset — altura(45) + offset(~53) ≈ 98px, com ~9px de
      // folga sob o ápice de ≈106,7px.
      const offsetAguaAlta = calcularAlturaMaximaPulo() * 0.5;
      const y = alta ? chaoY - altura - offsetAguaAlta : chaoY - altura;
      state.coletaveis.push({
        id: loop.proximoIdColetavel++,
        tipo: "agua",
        x,
        y,
        largura,
        altura,
        coletado: false,
      });
    }

    const { DISTANCIA_MEDIA_SPAWN_AGUA_PX, VARIACAO_SPAWN_AGUA_PX } = CONSTANTES_SOBREVIVENCIA;
    loop.distanciaAteProximaAgua =
      DISTANCIA_MEDIA_SPAWN_AGUA_PX + Math.random() * VARIACAO_SPAWN_AGUA_PX;
  }

  function atualizarSpawnItensLiterarios() {
    const state = stateRef.current;
    const { FAIXAS_ITENS_LITERARIOS } = CONSTANTES_SOBREVIVENCIA;
    for (const id of Object.keys(FAIXAS_ITENS_LITERARIOS) as Array<keyof typeof FAIXAS_ITENS_LITERARIOS>) {
      if (state.itensLiterariosNascidos[id] || state.itensLiterarios[id]) continue;
      const [inicio, fim] = FAIXAS_ITENS_LITERARIOS[id];
      if (state.worldProgress < inicio || state.worldProgress > fim) continue;

      state.itensLiterariosNascidos[id] = true;
      const larguraCanvas = alcanceHorizontalCanvas();
      const chaoY = alturaLogicaAtual() * FRACAO_CHAO;
      const largura = 32 * OBST_SCALE;
      const altura = 40 * OBST_SCALE;
      state.coletaveis.push({
        id: loopRef.current!.proximoIdColetavel++,
        tipo: id,
        x: larguraCanvas + 60,
        y: chaoY - altura,
        largura,
        altura,
        coletado: false,
      });
    }
  }

  function atualizarSpawnSemente(deslocamento: number) {
    const state = stateRef.current;
    const loop = loopRef.current!;
    if (state.sementeColhida) return;
    if (state.worldProgress < CONSTANTES_SOBREVIVENCIA.PROGRESSO_MINIMO_SEMENTE) return;

    if (state.sementeNascida) {
      // Já existe (ou existiu) uma Semente em cena; se o jogador a perdeu,
      // renasce periodicamente para garantir que a vitória continue
      // alcançável (a chegada ao litoral não pode travar o jogo).
      const aindaEmCena = state.coletaveis.some((c) => c.tipo === "semente" && !c.coletado);
      if (aindaEmCena) return;
      loop.distanciaAteProximaSemente -= deslocamento;
      if (loop.distanciaAteProximaSemente > 0) return;
    }

    const larguraCanvas = alcanceHorizontalCanvas();
    const chaoY = alturaLogicaAtual() * FRACAO_CHAO;
    const largura = 26 * OBST_SCALE;
    const altura = 26 * OBST_SCALE;
    state.coletaveis.push({
      id: loop.proximoIdColetavel++,
      tipo: "semente",
      x: larguraCanvas + 40,
      y: chaoY - altura - 10,
      largura,
      altura,
      coletado: false,
    });
    state.sementeNascida = true;
    loop.distanciaAteProximaSemente = CONSTANTES_SOBREVIVENCIA.DISTANCIA_RENASCER_SEMENTE_PX;
  }

  /**
   * Marco/placa com o nome do jogador: nasce cedo (primeiros metros) e
   * reaparece periodicamente marcando as léguas percorridas. Reciclada como
   * obstáculo/coletável (desloca com o scroll, removida ao sair da tela) —
   * vive em loopRef (não no contrato documentado de gameState.ts) porque é
   * puramente decorativa/narrativa, sem participar de física ou colisão.
   */
  function atualizarSpawnPlacas(deslocamento: number) {
    const state = stateRef.current;
    const loop = loopRef.current!;
    loop.distanciaAteProximaPlaca -= deslocamento;
    if (loop.distanciaAteProximaPlaca > 0) return;

    const larguraCanvas = alcanceHorizontalCanvas();
    const leguas = Math.round(state.distancia / 100);
    const nome = nomeJogadorRef.current;
    const sprite = criarSpritePlaca(nome, leguas, getPalette(state.worldProgress));
    const largura = 60;
    const altura = 56;
    loop.placas.push({
      id: loop.proximoIdPlaca++,
      x: larguraCanvas + 30,
      largura,
      altura,
      sprite,
    });
    loop.primeiraPlacaMostrada = true;
    // Marcos seguintes bem mais espaçados que a primeira aparição.
    loop.distanciaAteProximaPlaca = 1400 + Math.random() * 500;
  }

  function moverERecolherPlacas(deslocamento: number) {
    const loop = loopRef.current!;
    const placas = loop.placas;
    let escrita = 0;
    for (let leitura = 0; leitura < placas.length; leitura++) {
      const placa = placas[leitura];
      placa.x -= deslocamento;
      if (placa.x + placa.largura >= 0) {
        placas[escrita] = placa;
        escrita++;
      }
    }
    placas.length = escrita;
  }

  function verificarColetaDeItens() {
    const state = stateRef.current;
    if (state.terminado) return;
    const { jogador } = state;
    // Hitbox de COLETA generosa: EXPANDE em relação ao visual (o oposto do
    // obstáculo, que encolhe) — favorece o jogador na coleta.
    const expansao = CONSTANTES_SOBREVIVENCIA.EXPANSAO_HITBOX_COLETA_PX;
    const jx = jogador.x - expansao;
    const jy = jogador.y - expansao;
    const jw = jogador.largura + expansao * 2;
    const jh = jogador.altura + expansao * 2;

    for (const item of state.coletaveis) {
      if (item.coletado) continue;
      const colidiu =
        jx < item.x + item.largura && jx + jw > item.x && jy < item.y + item.altura && jy + jh > item.y;
      if (!colidiu) continue;

      item.coletado = true;
      // Qualquer coleta (água ou item literário) tranquiliza a Morte por
      // um tempo — recompensa jogar ativamente, não só sobreviver passivo.
      loopRef.current!.tempoDesdeUltimaColetaS = 0;

      if (item.tipo === "agua") {
        state.hidratacao = Math.min(1, state.hidratacao + CONSTANTES_SOBREVIVENCIA.RESTAURACAO_AGUA);
        state.itensColetados += 1;
        state.efeitos.push({
          x: item.x + item.largura / 2,
          y: item.y + item.altura / 2,
          criadoEmMs: loopRef.current!.tempoJogoMs,
          duracaoMs: 420,
        });
      } else if (item.tipo === "semente") {
        state.sementeColhida = true;
        state.efeitos.push({
          x: item.x + item.largura / 2,
          y: item.y + item.altura / 2,
          criadoEmMs: loopRef.current!.tempoJogoMs,
          duracaoMs: 900,
        });
        state.versoAtivo = {
          id: "semente",
          ...VERSOS_ITENS_LITERARIOS.semente,
          ts: performance.now(),
        };
      } else if (VERSOS_ITENS_LITERARIOS[item.tipo]) {
        state.itensLiterarios[item.tipo] = true;
        state.versoAtivo = {
          id: item.tipo,
          ...VERSOS_ITENS_LITERARIOS[item.tipo],
          ts: performance.now(),
        };
        state.efeitos.push({
          x: item.x + item.largura / 2,
          y: item.y + item.altura / 2,
          criadoEmMs: loopRef.current!.tempoJogoMs,
          duracaoMs: 600,
        });
      }

      publisherRef.current.forcar(state);
    }
  }

  // ---------------------------------------------------------------------
  // A MORTE — Etapa 4: não é obstáculo, é presença. Nunca colide
  // diretamente; se aproxima pela margem esquerda como espelho do
  // desempenho do jogador (sede alta e ociosidade aproximam, beber e
  // coletar bem afastam). Ver desenharMorte() para o lado visual.
  // ---------------------------------------------------------------------
  function atualizarMorte(dtS: number) {
    const state = stateRef.current;
    const loop = loopRef.current!;
    loop.tempoDesdeUltimaColetaS += dtS;

    // Pressão da sede: 0 (hidratado) .. 1 (seco). Pressão de ociosidade:
    // sobe conforme o tempo sem coletar nada se aproxima de ~18s (mais ou
    // menos meio ciclo de spawn de água na fase mais lenta do jogo).
    const pressaoSede = 1 - state.hidratacao;
    const pressaoOciosidade = Math.min(1, loop.tempoDesdeUltimaColetaS / 18);
    const pressaoTotal = Math.min(1, pressaoSede * 0.7 + pressaoOciosidade * 0.3);
    const alvo = Math.max(0, 1 - pressaoTotal);

    // A Morte se aproxima mais depressa do que recua — o alívio é sempre
    // mais lento que o alarme, reforçando a tensão psicológica.
    const distanciaAtual = state.morte.distanciaAteJogador;
    const taxaAjuste = alvo < distanciaAtual ? 1.4 : 0.55;
    const diferenca = alvo - distanciaAtual;
    state.morte.distanciaAteJogador = Math.max(
      0,
      Math.min(1, distanciaAtual + diferenca * Math.min(1, taxaAjuste * dtS))
    );
    // Só fica "visível" (a UI/canvas desenha com nitidez) quando já
    // representa alguma ameaça real — evita ruído visual constante.
    state.morte.visivel = state.morte.distanciaAteJogador < 0.8;

    if (state.morte.distanciaAteJogador <= 0) {
      state.terminado = true;
      state.resultado = "death";
      state.causaMorte = "morte";
      state.jogador.estado = ESTADOS_JOGADOR.MORTO;
      publisherRef.current.forcar(state);
      onFimDeJogoRef.current?.("death");
    }
  }

  function limparEfeitosExpirados() {
    const state = stateRef.current;
    const agora = loopRef.current!.tempoJogoMs;
    state.efeitos = state.efeitos.filter((efeito) => agora - efeito.criadoEmMs < efeito.duracaoMs);
  }

  function verificarColisao() {
    const state = stateRef.current;
    if (state.terminado) return;
    const { jogador } = state;
    const margemJ = CONSTANTES_FISICA.MARGEM_HITBOX_JOGADOR;
    const jx = jogador.x + margemJ;
    const jy = jogador.y + margemJ;
    const jw = jogador.largura - margemJ * 2;
    const jh = jogador.altura - margemJ * 2;

    for (const obstaculo of state.obstaculos) {
      const margemO = CONSTANTES_FISICA.MARGEM_HITBOX_OBSTACULO;
      const ox = obstaculo.x + margemO;
      const oy = obstaculo.y + margemO;
      const ow = obstaculo.largura - margemO * 2;
      const oh = obstaculo.altura - margemO * 2;

      const colidiu = jx < ox + ow && jx + jw > ox && jy < oy + oh && jy + jh > oy;
      if (colidiu) {
        state.terminado = true;
        state.resultado = "death";
        state.causaMorte = "obstaculo";
        jogador.estado = ESTADOS_JOGADOR.MORTO;
        // A Morte "alcança" Severino visualmente também neste caso — o
        // acidente é só a forma que ela tomou desta vez.
        state.morte.distanciaAteJogador = 0;
        state.morte.visivel = true;
        publisherRef.current.forcar(state);
        onFimDeJogoRef.current?.("death");
        return;
      }
    }
  }

  // ---------------------------------------------------------------------
  // DESENHO — uma vez por frame (não por passo de física). Toda a
  // renderização propriamente dita vive em render3d.ts (cena Three.js
  // imperativa); esta função só repassa o estado atual do jogo para lá.
  // ---------------------------------------------------------------------
  function desenharFrame() {
    const renderer3D = renderer3DRef.current;
    if (!renderer3D) return;
    const state = stateRef.current;
    const loop = loopRef.current ?? criarEstadoLoop();
    renderer3D.atualizar(state, loop, nomeJogadorRef.current, loop.reducaoMovimento);
  }

  // ---------------------------------------------------------------------
  // GAME LOOP — requestAnimationFrame com acumulador de passo fixo.
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!ativo) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return undefined;
    }

    // Reset explícito: sempre que a tela de jogo se torna ativa, o estado
    // vem limpo (corrige o bug de "estado sujo" ao reiniciar a partida).
    reiniciarPartida();
    loopRef.current!.reducaoMovimento =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    let cancelado = false;

    function frame(timestampMs: number) {
      if (cancelado) return;
      const loop = loopRef.current!;
      const state = stateRef.current;

      if (document.hidden) {
        loop.ultimoTimestampMs = null; // evita salto ao voltar da aba oculta
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      if (loop.ultimoTimestampMs === null) {
        loop.ultimoTimestampMs = timestampMs;
      }
      const deltaS = Math.min(
        CONSTANTES_FISICA.DELTA_MAXIMO_S,
        Math.max(0, (timestampMs - loop.ultimoTimestampMs) / 1000)
      );
      loop.ultimoTimestampMs = timestampMs;

      if (!state.terminado) {
        loop.acumuladorFisicaS += deltaS;
        while (loop.acumuladorFisicaS >= CONSTANTES_FISICA.PASSO_FIXO_S) {
          passoFisicaFixo(CONSTANTES_FISICA.PASSO_FIXO_S);
          loop.acumuladorFisicaS -= CONSTANTES_FISICA.PASSO_FIXO_S;
          if (state.terminado) break;
        }
      }

      publisherRef.current.tick(state, timestampMs);
      desenharFrame();

      if (!state.terminado) {
        rafRef.current = requestAnimationFrame(frame);
      }
    }

    rafRef.current = requestAnimationFrame(frame);

    function aoMudarVisibilidade() {
      if (!document.hidden && loopRef.current) {
        loopRef.current.ultimoTimestampMs = null;
      }
    }
    document.addEventListener("visibilitychange", aoMudarVisibilidade);

    return () => {
      cancelado = true;
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo]);

  if (webglIndisponivel) {
    return (
      <div className="game-canvas-wrapper game-canvas-fallback" role="alert">
        <p>
          Não foi possível iniciar os gráficos 3D deste jogo neste navegador
          (WebGL indisponível). Tente atualizar o navegador, ativar a
          aceleração de hardware nas configurações, ou usar outro dispositivo.
        </p>
      </div>
    );
  }

  return (
    <div className="game-canvas-wrapper" role="img" aria-label="Cenário do jogo Morte e Vida Severina">
      <canvas ref={canvasRef} className="game-canvas" />
    </div>
  );
}
