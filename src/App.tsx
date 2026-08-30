import { useCallback, useEffect, useState } from "react";
import TitleScreen from "./components/TitleScreen.js";
import GameCanvas from "./components/GameCanvas.js";
import Hud from "./components/Hud.js";
import StatusBar from "./components/StatusBar.js";
import GameOverModal from "./components/GameOverModal.js";
import VersoOverlay from "./components/VersoOverlay.js";
import HeatOverlay from "./components/HeatOverlay.js";
import BotoesToque from "./components/BotoesToque.js";
import { selecionarHudPadrao, type HudSnapshot } from "./game/publisher.js";
import { createInitialState } from "./game/gameState.js";
import { TELAS, type Tela } from "./game/telas.js";
import type { ResultadoJogo } from "./game/gameState.js";
import "./styles/tokens.css";
import "./App.css";

export default function App() {
  const [tela, setTela] = useState<Tela>(TELAS.MENU);
  // Nome do jogador — dado de UI puro, definido na TitleScreen ANTES da
  // partida começar. NUNCA entra em stateRef/game loop (ver gameState.ts):
  // é passado como prop normal para Hud/GameOverModal, sem qualquer
  // relação com o loop a 60 FPS.
  const [nomeJogador, setNomeJogador] = useState("");

  // Snapshot de HUD publicado com throttle (~10 Hz) pelo publisher do jogo.
  // Este é o ÚNICO lugar onde dados do game loop entram no mundo React.
  const [hudSnapshot, setHudSnapshot] = useState<HudSnapshot>(() =>
    selecionarHudPadrao(createInitialState())
  );

  // --world-progress é lida só pela UI React (transições sutis de borda/tinta
  // em CSS puro) — atualizada no máximo a ~10 Hz junto do hudSnapshot, nunca
  // a 60 FPS (a paleta "pesada" do canvas é outra coisa, ver palette.ts).
  useEffect(() => {
    document.documentElement.style.setProperty("--world-progress", String(hudSnapshot.worldProgress ?? 0));
  }, [hudSnapshot.worldProgress]);

  const iniciarJogo = useCallback((nome: string) => {
    setNomeJogador(nome);
    setTela(TELAS.JOGANDO);
  }, []);

  const voltarAoMenu = useCallback(() => {
    setTela(TELAS.MENU);
  }, []);

  // Callback que a Etapa 2+ deve chamar (via prop `onFimDeJogo` do GameCanvas)
  // quando o loop detectar morte ou vitória.
  const finalizarJogo = useCallback((resultado: NonNullable<ResultadoJogo>) => {
    setTela(resultado === "victory" ? TELAS.VITORIA : TELAS.GAME_OVER);
  }, []);

  return (
    <div className="app-raiz" data-tela={tela}>
      {tela === TELAS.MENU && <TitleScreen onIniciar={iniciarJogo} />}

      {(tela === TELAS.JOGANDO || tela === TELAS.GAME_OVER || tela === TELAS.VITORIA) && (
        <div className="app-area-jogo">
          <GameCanvas
            ativo={tela === TELAS.JOGANDO}
            onHudAtualizado={setHudSnapshot}
            onFimDeJogo={finalizarJogo}
            nomeJogador={nomeJogador}
          />
          <Hud
            distancia={hudSnapshot.distancia}
            itensColetados={hudSnapshot.itensColetados}
            itensLiterarios={hudSnapshot.itensLiterarios}
            nomeJogador={nomeJogador}
          />
          <StatusBar value={hudSnapshot.hidratacao} />
          <HeatOverlay hidratacao={hudSnapshot.hidratacao} />
          <VersoOverlay verso={hudSnapshot.versoAtivo} />
          <BotoesToque />
        </div>
      )}

      {tela === TELAS.GAME_OVER && (
        <GameOverModal
          variant="death"
          causaMorte={hudSnapshot.causaMorte}
          itensLiterarios={hudSnapshot.itensLiterarios}
          distancia={hudSnapshot.distancia}
          itensColetados={hudSnapshot.itensColetados}
          nomeJogador={nomeJogador}
          onReiniciar={voltarAoMenu}
        />
      )}
      {tela === TELAS.VITORIA && (
        <GameOverModal
          variant="victory"
          itensLiterarios={hudSnapshot.itensLiterarios}
          distancia={hudSnapshot.distancia}
          itensColetados={hudSnapshot.itensColetados}
          nomeJogador={nomeJogador}
          onReiniciar={voltarAoMenu}
        />
      )}
    </div>
  );
}
