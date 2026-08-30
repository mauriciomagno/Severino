/**
 * BotoesToque — overlay de controle para dispositivos móveis.
 *
 * Renderiza 4 zonas visuais sobre o canvas:
 *   ← Esquerda (terço esquerdo)   |  ↑ Pular (centro-topo)  |  → Direita (terço direito)
 *                                  |  ↓ Agachar (centro-baixo)
 *
 * Os elementos são puramente visuais: os eventos de toque são capturados
 * diretamente pelo canvas (GameCanvas.tsx). Este overlay apenas guia o
 * jogador indicando onde tocar.
 */
export default function BotoesToque() {
  return (
    <div className="btoque-overlay" aria-hidden="true">
      {/* Coluna esquerda */}
      <div className="btoque-zona btoque-esquerda">
        <span className="btoque-icone">◀</span>
      </div>

      {/* Centro — dividido em cima (pular) e baixo (agachar) */}
      <div className="btoque-centro">
        <div className="btoque-zona btoque-pular">
          <span className="btoque-icone">▲</span>
        </div>
        <div className="btoque-zona btoque-agachar">
          <span className="btoque-icone">▼</span>
        </div>
      </div>

      {/* Coluna direita */}
      <div className="btoque-zona btoque-direita">
        <span className="btoque-icone">▶</span>
      </div>
    </div>
  );
}
