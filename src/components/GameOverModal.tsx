import type { ReactNode } from "react";
import { ORDEM_ITENS_LITERARIOS, VERSOS_ITENS_LITERARIOS, AUTOR_VERSOS } from "../game/sobrevivencia.js";
import type { CausaMorte, RegistroItensLiterarios } from "../game/gameState.js";

/**
 * GameOverModal — modal de fim de partida.
 *
 * Props:
 *   variant         'death'|'victory' determina tom visual geral
 *   causaMorte      'sede'|'obstaculo'|'morte'|null — SÓ relevante quando
 *                   variant é 'death' — o verso exibido muda conforme a
 *                   causa: a sede tem um verso, a colisão com obstáculo
 *                   tem outro, e a Morte "pura" tem um terceiro.
 *   itensLiterarios itens literários coletados na partida — lista os
 *                   versos encontrados, com atribuição, na tela final.
 *   nomeJogador     nome escolhido na TitleScreen — usado para
 *                   personalizar título/resumo como "Severino de {nome}"
 *   onReiniciar     volta ao menu / reinicia a jornada
 */
interface VersoMorte {
  titulo: (nome: string) => string;
  verso: ReactNode;
}

const VERSOS_MORTE: Record<"sede" | "obstaculo" | "morte", VersoMorte> = {
  sede: {
    titulo: (nome) => `${nome} não chegou ao litoral — a sede o alcançou`,
    verso: (
      <>
        — Não vale mais que o rio
        <br />
        que não seca, quando some,
        <br />
        pois ele deixa (que a morte é seca)
        <br />
        que lembre o rio de um homem.
      </>
    ),
  },
  obstaculo: {
    titulo: (nome) => `${nome} não chegou ao litoral — a Morte o alcançou`,
    verso: (
      <>
        — É de urubu essa vida?
        <br />
        pois ele há de me esperar.
        <br />
        Melhor morrer de facada
        <br />
        que morrer de fome, sem par.
      </>
    ),
  },
  // A Morte, quando "alcança" sem sede nem acidente: a presença que se
  // aproximou pela margem da tela finalmente chegou perto demais.
  morte: {
    titulo: (nome) => `${nome} não chegou ao litoral — a Morte, enfim, o alcançou`,
    verso: (
      <>
        — Não há melhor coisa a fazer
        <br />
        do que enterrar defunto.
      </>
    ),
  },
};

const VERSO_VITORIA: VersoMorte = {
  titulo: (nome) => `${nome} chegou ao litoral — colheu a semente`,
  verso: (
    <>
      — E se somos Severinos
      <br />
      iguais em tudo na vida,
      <br />
      morremos de morte igual,
      <br />
      mesma morte severina.
    </>
  ),
};

export interface GameOverModalProps {
  variant?: "death" | "victory";
  causaMorte?: CausaMorte;
  itensLiterarios?: Partial<RegistroItensLiterarios>;
  distancia?: number;
  itensColetados?: number;
  nomeJogador?: string;
  onReiniciar: () => void;
}

export default function GameOverModal({
  variant = "death",
  causaMorte = null,
  itensLiterarios = {},
  distancia = 0,
  itensColetados = 0,
  nomeJogador = "",
  onReiniciar,
}: GameOverModalProps) {
  const conteudo =
    variant === "victory" ? VERSO_VITORIA : VERSOS_MORTE[causaMorte ?? "obstaculo"] ?? VERSOS_MORTE.obstaculo;
  const nomeExibido = nomeJogador ? `Severino de ${nomeJogador}` : "Severino";
  const tituloExibido = conteudo.titulo(nomeExibido);

  const itensEncontrados = ORDEM_ITENS_LITERARIOS.filter((id) => itensLiterarios[id]);
  const distanciaKm = (distancia / 1000).toFixed(1);

  return (
    <div className="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="modal-titulo">
      <div className="modal-caixa" data-variant={variant}>
        <h2 id="modal-titulo" className="modal-titulo">
          {tituloExibido}
        </h2>
        <blockquote className="modal-verso">
          <p>{conteudo.verso}</p>
          <footer>{AUTOR_VERSOS}</footer>
        </blockquote>

        <div className="modal-resumo" aria-label="Resumo da jornada">
          <div className="modal-resumo-item">
            <span className="modal-resumo-valor">{distanciaKm} km</span>
            <span className="modal-resumo-rotulo">Distância percorrida</span>
          </div>
          <div className="modal-resumo-item">
            <span className="modal-resumo-valor">{itensColetados}</span>
            <span className="modal-resumo-rotula">Águas coletadas</span>
          </div>
          <div className="modal-resumo-item">
            <span className="modal-resumo-valor">{itensEncontrados.length}/{ORDEM_ITENS_LITERARIOS.length}</span>
            <span className="modal-resumo-rotulo">Versos encontrados</span>
          </div>
        </div>

        {itensEncontrados.length > 0 && (
          <div className="modal-itens-encontrados">
            <h3 className="modal-itens-titulo">Versos encontrados na jornada</h3>
            <ul className="modal-itens-lista">
              {ORDEM_ITENS_LITERARIOS.map((id) => {
                const encontrado = itensLiterarios[id];
                return (
                  <li
                    key={id}
                    className="modal-itens-item"
                    data-encontrado={encontrado}
                  >
                    <strong>{VERSOS_ITENS_LITERARIOS[id].nome}:</strong>{" "}
                    {encontrado ? (
                      <span className="modal-itens-verso">
                        {VERSOS_ITENS_LITERARIOS[id].verso.replace("\n", " ")}
                      </span>
                    ) : (
                      <span
                        className="modal-itens-verso modal-itens-verso-ausente"
                        aria-label="não encontrado"
                      >
                        não encontrado nesta jornada
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <button
          type="button"
          className="modal-botao"
          onClick={onReiniciar}
          autoFocus
        >
          Recomeçar a caminhada
        </button>
      </div>
    </div>
  );
}
