import { useEffect, useId, useState } from "react";

/** Chave de localStorage onde o nome do jogador é lembrado entre partidas. */
const CHAVE_NOME_ARMAZENADO = "severino:nomeJogador";
const TAMANHO_MAXIMO_NOME = 24;

/** Lê o nome salvo, se houver. Nunca lança — localStorage pode falhar
 * (modo privativo, cota, etc.); nesse caso simplesmente não pré-preenche. */
function lerNomeArmazenado(): string {
  try {
    return window.localStorage.getItem(CHAVE_NOME_ARMAZENADO) ?? "";
  } catch {
    return "";
  }
}

/** Salva o nome para a próxima partida. Falha silenciosamente. */
function salvarNomeArmazenado(nome: string): void {
  try {
    window.localStorage.setItem(CHAVE_NOME_ARMAZENADO, nome);
  } catch {
    // Modo privativo ou localStorage indisponível — segue sem persistir.
  }
}

/** Sanitiza: remove espaços das pontas, colapsa espaços internos repetidos
 * e corta no tamanho máximo. Aceita acentos e nomes compostos normalmente. */
function sanitizarNome(bruto: string): string {
  return bruto.trim().replace(/\s+/g, " ").slice(0, TAMANHO_MAXIMO_NOME);
}

export interface TitleScreenProps {
  /** Chamado ao confirmar, com o nome já sanitizado (nunca string vazia). */
  onIniciar: (nome: string) => void;
}

/**
 * TitleScreen — tela inicial. Exibe o título da obra, um verso de abertura
 * (com atribuição), um campo para o jogador se nomear — no espírito do
 * poema, em que os Severinos se distinguem pelo nome da mãe/origem — e o
 * botão para iniciar a corrida (desabilitado enquanto o nome estiver vazio).
 */
export default function TitleScreen({ onIniciar }: TitleScreenProps) {
  const [nome, setNome] = useState<string>(() => lerNomeArmazenado());
  const [tentouEnviar, setTentouEnviar] = useState(false);
  const idCampo = useId();
  const idErro = useId();

  const nomeSanitizado = sanitizarNome(nome);
  const nomeValido = nomeSanitizado.length > 0;

  useEffect(() => {
    // Persiste a cada alteração válida — a próxima partida já vem pré-preenchida.
    if (nomeValido) salvarNomeArmazenado(nomeSanitizado);
  }, [nomeSanitizado, nomeValido]);

  function confirmarInicio() {
    if (!nomeValido) {
      setTentouEnviar(true);
      return;
    }
    onIniciar(nomeSanitizado);
  }

  return (
    <div className="title-screen" role="dialog" aria-modal="true" aria-label="Tela inicial - Morte e Vida Severina">
      <div className="title-screen-conteudo">
        <h1 className="title-screen-titulo">Morte e Vida Severina</h1>
        <blockquote className="title-screen-verso">
          <p>
            — O meu nome é Severino,
            <br />
            não tenho outro de pia.
            <br />
            Como há muitos Severinos,
            <br />
            [...] fui me chamando
            <br />
            Severino de Maria.
          </p>
          <footer>João Cabral de Melo Neto, <cite>Morte e Vida Severina</cite></footer>
        </blockquote>

        <form
          className="title-screen-form-nome"
          onSubmit={(evento) => {
            evento.preventDefault();
            confirmarInicio();
          }}
        >
          <label htmlFor={idCampo} className="title-screen-rotulo-nome">
            Como hei de me chamar? — Severino de...
          </label>
          <input
            id={idCampo}
            type="text"
            className="title-screen-input-nome"
            value={nome}
            maxLength={TAMANHO_MAXIMO_NOME}
            placeholder="seu nome (ou o de sua mãe, sua terra)"
            autoComplete="off"
            aria-describedby={!nomeValido && tentouEnviar ? idErro : undefined}
            aria-invalid={!nomeValido && tentouEnviar}
            onChange={(evento) => setNome(evento.target.value)}
          />
          {!nomeValido && tentouEnviar && (
            <p id={idErro} className="title-screen-erro-nome" role="alert" aria-live="assertive">
              É preciso um nome para começar a caminhada.
            </p>
          )}

          <button
            type="submit"
            className="title-screen-botao"
            disabled={!nomeValido}
            aria-disabled={!nomeValido}
          >
            Começar a andar
          </button>
        </form>

        <p className="title-screen-instrucoes">
          Espaço, Seta para cima ou toque na parte de cima da tela para pular os
          obstáculos do caminho. Setas esquerda/direita (ou A/D) — ou toque nas
          laterais da tela — para se mover; seta para baixo ou S (ou toque na
          parte de baixo, no centro) para agachar. Colete água para matar a sede
          e não deixe a Morte se aproximar.
        </p>
      </div>
    </div>
  );
}
