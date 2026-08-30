# Morte e Vida Severina — Jogo Web

Um endless runner 3D em React + Vite + Three.js que reimagina digitalmente a jornada épica de Severino através do sertão nordestino, inspirado na obra de João Cabral de Melo Neto.

## Sobre o Jogo

**Morte e Vida Severina** é uma adaptação interativa do poema homônimo de João Cabral de Melo Neto (1980), uma das obras-primas da literatura brasileira. No poema, Severino, um retirante do sertão, viaja na esperança de chegar ao litoral e escapar da miséria. Aqui, você controla Severino em uma corrida pela sobrevivência: o deserto avança, a sede aperta, e uma presença sombria o persegue — a própria Morte.

O jogo não trivializa a narrativa; em vez disso, traduz a tensão lírica do poema em mecânica de jogo: hidratação como recurso finito, itens literários como marcos da jornada, e a Morte como uma pressão psicológica invisível que responde ao desempenho do jogador.

**Atribuição:** Projeto educacional baseado em *Morte e Vida Severina: Auto de Natal Pernambucano* de João Cabral de Melo Neto.

---

## Como Rodar

### Instalação e Desenvolvimento

```bash
npm install      # Instala dependências (React, Vite, Oxlint)
npm run dev      # Inicia servidor de desenvolvimento (hot reload)
npm run build    # Build para produção (dist/)
npm run lint     # Verifica código com Oxlint
```

Acesse `http://localhost:5173` no navegador após `npm run dev`.

---

## Controles

| Ação | Comando |
|------|---------|
| Pular | <kbd>Espaço</kbd> ou <kbd>↑</kbd> (teclado) |
| Pular | Toque na metade de cima da tela (celular/tablet) |
| Mover-se | <kbd>←</kbd>/<kbd>→</kbd> ou <kbd>A</kbd>/<kbd>D</kbd> (teclado) |
| Mover-se | Toque no terço esquerdo/direito da tela |
| Agachar | <kbd>↓</kbd> ou <kbd>S</kbd> (teclado) |
| Agachar | Toque na metade de baixo, centro da tela |

**Objetivo:** Chegar ao litoral (final da jornada) e colher a **Semente** para vencer.

### Nome do jogador

Antes de começar, a tela de título pede um nome — no espírito do poema, em
que os Severinos se distinguem pelo nome da mãe ou da terra ("Severino de
Maria"). O campo fica sob o rótulo "Como hei de me chamar? — Severino
de...", e o botão "Começar a andar" só é habilitado com um nome preenchido
(feedback de erro acessível via `aria-live` se tentar enviar vazio). O nome
é lembrado em `localStorage` para a próxima partida (falha silenciosamente
em modo privativo) e acompanha o jogador discretamente no HUD e nas telas
de fim ("Severino de {nome} não chegou ao litoral" / "...colheu a
semente"). É um dado de UI puro — nunca entra no estado do game loop.

---

## Como Jogar

### Mecânicas Centrais

**Sede e Hidratação**
- A barra de "Sede" no canto superior esquerdo marca quanta água Severino ainda tem no corpo (0 = morte).
- A hidratação drena continuamente conforme o sertão avança — o calor no meio da travessia é brutal.
- Colete **água** (cacimbas, cantis, poças) para restaurar ~55% da barra. Nenhuma única coleta zera a tensão; o jogador sempre permanece vulnerável.

**Obstáculos**
- Mandacaru, toco, pedras, cruzes, crânios aparecem no caminho. Colidir = morte (a não ser que a Morte já o tenha alcançado).
- O jogo garante que todos os obstáculos são ultrapassáveis com um pulo completo — a dificuldade é gerenciar a sede, não dominar pulos impossíveis.

**Itens Literários**
- **Cruz de madeira, Vela, Moeda antiga, Pão, Rede de pesca** — cinco objetos únicos que surgem em momentos específicos da jornada.
- Cada um representa um episódio ou tema do poema original (morte, trabalho, fome, o rio).
- Coletá-los exibe um verso breve da obra, aprofundando a imersão lírica.
- Não são obrigatórios para vencer, mas o jogo rastreia quantos você encontrou.

**A Semente (Vitória)**
- Surge quando você está muito perto do litoral (progresso > 97%).
- Coletá-la dispara a vitória — chegar ao litoral sozinho **não é suficiente**.
- A Semente renasce periodicamente se perdida, garantindo que a vitória sempre seja possível.

**A Morte (Perseguidora)**
- Uma presença silenciosa que se aproxima pela margem esquerda da tela.
- Não é um obstáculo que mata por colisão; em vez disso, quando `distanciaAteJogador` chega a zero, o jogo termina.
- A Morte responde a dois fatores:
  - **Sede alta** (hidratação baixa) a pressiona para mais perto.
  - **Ociosidade** (tempo sem coletar nada) a pressiona para mais perto.
  - Beber água e coletar itens literários a afastam temporariamente, recompensando o jogo ativo.
- Ela é invisível quando muito distante, mas ganha nitidez conforme se aproxima — a urgência é visual, não auditiva.

### Fases da Jornada

| Fase | Progresso | Características |
|------|-----------|-----------------|
| **Sertão** | 0%–60% | Céu quente, terra árida, vegetação seca. Taxa de drenagem de sede elevada. |
| **Transição** | 60%–97% | Paisagem muda gradualmente: vegetação verde, silhuetas de aves, mangue aparecem. |
| **Litoral** | 97%–100% | Brilho de água no horizonte, areia clara, silhuetas de árvores de fruta-pão. A Semente aguarda. |

---

## Direção de Arte: 3D Procedural

Toda a arte do jogo é **geometria e material procedurais** (`src/game/render3d.js`),
sem nenhum asset externo (.glb/.fbx/.png): geometrias primitivas do Three.js
(cilindros, cápsulas, esferas, dodecaedros) com deslocamento de vértices
customizado, materiais PBR (`MeshStandardMaterial`) e shaders próprios
(céu com gradiente + glow de sol, a Morte com fresnel translúcido), além de
`CanvasTexture` gerada em runtime para o chão e para a placa com o nome do
jogador.

- **Severino** é um boneco articulado a partir de primitivas (cápsulas para
  tronco/membros, esfera para a cabeça, cone para o chapéu), animado por
  rotação dos pivôs de braço/perna em função do ciclo de corrida — ainda em
  fase funcional, com refinamento visual planejado para uma etapa futura
  dedicada ao personagem.
- **Cenário**: mandacarus com tronco colunar "costelado" (raio modulado
  radialmente numa `CylinderGeometry`), túmulos de pedra com cruz
  (decorativos, sem colisão), serras distantes e vegetação média via
  `InstancedMesh` (dezenas de instâncias, uma única chamada de desenho por
  camada) — tudo distribuído em profundidade Z real, gerando parallax
  natural pela perspectiva da câmera.
- A paleta sertão→litoral (`palette.js`) continua sendo a única fonte de
  cor: ela dirige o céu, o fog, a luz do sol e o material do chão a cada
  frame conforme `worldProgress` avança.
- O antigo vocabulário de xilogravura 2D (`gravura.js`) foi mantido apenas
  como utilitário de `CanvasTexture` (chão, placa com nome do jogador);
  `severinoArt.js` (desenho 2D do personagem) foi removido por não ter mais
  uso.

---

## Arquitetura

### Estrutura de Pastas

```
src/
├── components/
│   ├── GameCanvas.jsx        # Game loop, physics, collision, spawn (60 FPS) — desenho delegado a render3d.js
│   ├── Hud.jsx               # Distância, itens coletados, inventário visual
│   ├── StatusBar.jsx         # Barra de hidratação (reativa a state.hidratacao)
│   ├── HeatOverlay.jsx       # Vinheta quente visual da sede (CSS + React)
│   ├── VersoOverlay.jsx      # Sobreposição transitória de versos ao coletar
│   ├── GameOverModal.jsx     # Tela de fim (morte/vitória) com resumo da jornada
│   └── TitleScreen.jsx       # Tela inicial, verso de abertura, instruções
├── game/
│   ├── gameState.js          # Contrato de estado mutável (uma única fonte de verdade)
│   ├── fisica.js             # Constantes e helpers de physics (pulo, gravidade, gap)
│   ├── sobrevivencia.js      # Constantes de hidratação, itens literários, taxas
│   ├── publisher.js          # Bridge com throttle entre game loop (60 FPS) → React (~10 Hz)
│   ├── palette.js            # Interpolação de cores (sertão ↔ litoral)
│   ├── render3d.js           # Cena Three.js IMPERATIVA: câmera, luz, céu, fog, chão, pools de objetos
│   └── gravura.js            # Utilitário de CanvasTexture (chão, placa com nome do jogador)
├── styles/
│   ├── tokens.css            # Variáveis CSS (cores, tipografia, layout)
│   └── App.css               # Estilos de componentes React
├── App.jsx                   # Máquina de estados de tela (MENU → JOGANDO → GAME_OVER/VITÓRIA)
├── main.jsx                  # Entry point (React.StrictMode + createRoot)
└── index.css                 # Reset CSS global
```

### Regra de Performance Central

**React deve NUNCA re-renderizar a 60 FPS.**

O estado do jogo vive em uma **única ref** dentro de `GameCanvas`:

```javascript
const stateRef = useRef(createInitialState());
```

Ele é **mutado diretamente** pelo game loop:

```javascript
stateRef.current.distancia += deslocamento;
stateRef.current.jogador.velocidadeY += gravidade * dt;
```

**React NÃO é notificado a cada mutação.** Em vez disso, um **publisher com throttle** (ver `src/game/publisher.js`) decide a cada ~100ms se algum valor relevante para a UI realmente mudou. Se mudou, ele chama `setState` uma única vez com um snapshot pequeno (distância, hidratação, itens):

```javascript
// Dentro do game loop (requestAnimationFrame, 60 FPS):
publisherRef.current.tick(stateRef.current, timestampMs);

// Publisher verifica a cada 100ms se o snapshot mudou; se sim:
setHudSnapshot(novoSnapshot);  // React re-renderiza ~10 vezes/segundo, não 60
```

O **<canvas>** é a única "view" que reflete o estado a 60 FPS — ele é desenhado imperativamente (`ctx.fillRect`, etc.), fora do ciclo de reconciliação do React.

**Por quê?** setState dispara reconciliação + commit. Fazer isso 60 vezes/segundo derruba o frame rate e briga pelo thread principal que o `requestAnimationFrame` do jogo também usa. Threaded rendering (Web Workers) poderia ajudar, mas não é necessário — o canvas é suficiente e muito mais simples.

---

## Onde Ajustar o Jogo

### Game Feel: Pulo e Velocidade

**Arquivo:** `src/game/fisica.js`

Constantes relevantes:

- `GRAVIDADE` (2600 px/s²) — aumentar deixa o pulo mais "pesado", diminuir mais "flutuante".
- `IMPULSO_PULO` (-860 px/s) — altura do pulo; valores mais negativos = pulo mais alto.
- `MULTIPLICADOR_GRAVIDADE_QUEDA` (1.7) — aumentar deixa a queda mais rápida, acentuando peso.
- `VELOCIDADE_MUNDO_INICIAL` (260 px/s) — velocidade de scroll inicial (sertão).
- `VELOCIDADE_MUNDO_MAXIMA` (620 px/s) — velocidade no litoral (teto).
- `CURVA_ACELERACAO_MUNDO` (2.2) — quão rápido a velocidade sobe conforme `worldProgress` avança.

**Nota:** Os valores atuais foram validados por simulação numérica (script Node com 20ms de timestep, RNG determinístico). Ao ajustar, teste com `npm run dev` e sinta a jornada completa (~180s) para garantir que as proporções de dificuldade se mantêm.

### Balanceamento: Sede e Água

**Arquivo:** `src/game/sobrevivencia.js`

Constantes relevantes:

- `DRENAGEM_MINIMA` (0.0145/s) — taxa de perda de hidratação no início/fim (litoral).
- `DRENAGEM_MAXIMA` (0.0435/s) — taxa no pico (meio do sertão). Siga a curva senoidal `taxa(progress) = MIN + (MAX - MIN) × sin(π × progress)`.
- `LIMIAR_ATENCAO` (0.5) — quando a StatusBar muda de "Normal" para "Atenção" (visualmente, cor e pulsação começam).
- `LIMIAR_CRITICO` (0.2) — quando muda para "Crítico" (urgência máxima).
- `RESTAURACAO_AGUA` (0.55) — quanto da barra uma água restaura. Parcial de propósito: nenhuma coleta única zera a tensão.
- `DISTANCIA_MEDIA_SPAWN_AGUA_PX` (4000 px ± 2200) — intervalo médio entre nascimentos de água.
- `FAIXAS_ITENS_LITERARIOS` — ranges de `worldProgress` (0..1) onde cada item literário nasce.

**Nota:** Estes valores foram obtidos resolvendo numericamente a integral de tempo de jogo (`T = distanciaTotal × ∫ dx/v(x)`) com alvo de travessia ≈ 180s (3 min). Qualquer mudança em `distanciaTotal` em `gameState.js` requer recalibração. Refer à matemática comentada no topo do arquivo `sobrevivencia.js` antes de ajustar.

---

## Acessibilidade

### Suporte a Teclado

- Todos os botões são focáveis e ativados por <kbd>Enter</kbd>/<kbd>Space</kbd>.
- Controles de jogo: <kbd>Space</kbd> ou <kbd>↑</kbd> para pular, <kbd>←</kbd>/<kbd>A</kbd> e <kbd>→</kbd>/<kbd>D</kbd> para mover, <kbd>↓</kbd>/<kbd>S</kbd> para agachar (redundantes, sem conflito com a UI).
- Não há armadilhas de foco; o foco permanece previsível.

### Respeita `prefers-reduced-motion`

- **HeatOverlay** (vinheta de sede): a onda de animação CSS é substituída por uma vinheta estática de opacidade equivalente quando `prefers-reduced-motion: reduce` está ativo.
- **GameCanvas**: a Morte (oscilação vertical leve) respeita a preferência do usuário.
- A urgência **nunca desaparece** — apenas a animação é substituída por uma representação estática.

### Urgência Não Comunica Só por Cor

- A barra de "Sede" muda de **rótulo de texto** ("Normal" → "Atenção" → "Crítico"), não apenas cor.
- O ícone (gota) aumenta de opacidade conforme a urgência sobe.
- A pulsação da vinheta de calor (HeatOverlay) é **suave e contínua**, não um piscar discreto (evita fotossensibilidade).

### ARIA / Roles Semânticos

- Modais usam `role="dialog"` e `aria-modal="true"`.
- A StatusBar usa `role="meter"` com `aria-valuenow`, `aria-valuemin`, `aria-valuemax`.
- Elementos decorativos (ícones de silhueta) têm `aria-hidden="true"`.
- Overlays transitórios (versos) usam `aria-live="polite"` para leitores de tela.

---

## Build e Deploy

```bash
npm run build    # Gera dist/index.html + assets otimizados
```

Os artefatos de build estão em `dist/`. Para servir em produção, qualquer servidor HTTP estático funciona (Netlify, Vercel, GitHub Pages, etc.). Não há backend necessário.

---

## Créditos e Inspiração

Este jogo é uma adaptação educacional e artística de **Morte e Vida Severina: Auto de Natal Pernambucano** de **João Cabral de Melo Neto** (1980, prêmio Nobel de Literatura em 1992).

O poema retrata a jornada de Severino, um retirante do sertão nordestino, em busca de um lugar onde a vida tivesse sentido — uma reflexão profunda sobre pobreza, migração, morte e esperança. Este jogo traduz essa narrativa em mecânica de jogo de forma respeitosa, sem simplificar nem trivializar a obra.

---

## Desenvolvimento

### Stack Técnico

- **React 19** — UI declarativa, reconciliação mínima (HUD/modais/overlays; nunca o jogo em si).
- **Vite 8** — bundler rápido, HMR.
- **Three.js (imperativo, sem React Three Fiber)** — cena 3D renderizada a 60 FPS pelo mesmo `requestAnimationFrame` que já roda a física.
- **Oxlint** — linter rápido (Rust), zero dependências de tipagem.
- **CSS 3** — gradientes, animações, variáveis customizadas (camada de UI sobre o `<canvas>` WebGL).

### Etapas do Projeto

1. **Etapa 1:** Estrutura de componentes, máquina de estados de tela, estilização base.
2. **Etapa 2:** Game loop (requestAnimationFrame), física (pulo, gravidade, coyote time), drawing (canvas).
3. **Etapa 3:** Hidratação (drenagem contínua, coletáveis de água), itens literários, versículos na UI.
4. **Etapa 4:** A Morte (perseguidora, presença visual), recalibração de escala temporal e drenagem, testes de balanceamento por simulação.
5. **Etapa 5 (migração 3D):** troca do renderizador Canvas 2D por uma cena Three.js imperativa (`render3d.js`) — a simulação (física, colisão, spawn, sobrevivência) não foi reescrita, só o desenho. Ver seção "Direção de Arte" acima.

Todas as etapas estão completas e o jogo passa em testes de build. O
refinamento visual do modelo do Severino (atualmente um boneco funcional de
primitivas) fica para uma próxima etapa dedicada ao personagem.

---

## Licença

Educacional, baseado em obra de domínio público. Respeite os direitos morais do autor João Cabral de Melo Neto.
