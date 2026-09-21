'use strict';

function eventPaletteIcon(kind, type) {
  const key = String(type);
  let marker = '';
  if (['12', '32'].includes(key)) {
    marker = '<g class="event-symbol"><circle cx="10" cy="10" r="4.3"/><path d="M10 10V7 M10 10l2.8 1.5 M10 5v1 M15 10h-1 M10 15v-1 M5 10h1"/></g>';
  } else if (['13', '35'].includes(key)) {
    marker = '<g class="event-symbol"><rect x="6.5" y="5" width="7" height="10" rx=".6"/><path d="M8 8h4 M8 10h4 M8 12h4"/></g>';
  } else if (['14', '41'].includes(key)) {
    marker = '<path class="event-symbol" d="M10 5.3l4.7 8.2H5.3z"/>';
  } else if (['64', '37'].includes(key)) {
    marker = '<path class="event-symbol event-symbol-filled" d="M10 5.3l4.7 8.2H5.3z"/>';
  } else if (['16'].includes(key)) {
    marker = '<path class="event-symbol" d="M10 4.8l5 3.7-1.9 5.9H6.9L5 8.5z"/>';
  } else if (['66', '39'].includes(key)) {
    marker = '<path class="event-symbol event-symbol-filled" d="M10 4.8l5 3.7-1.9 5.9H6.9L5 8.5z"/>';
  } else if (['63', '43'].includes(key)) {
    marker = '<path class="event-symbol" d="M11.5 4.7L7.8 9.3l2.6.8-2 5.2 4.1-5.8-2.5-.7z"/>';
  } else if (key === '65') {
    marker = '<path class="event-symbol" d="M6.7 6.7l6.6 6.6m0-6.6l-6.6 6.6"/>';
  } else if (key === '68') {
    marker = '<circle class="event-symbol event-symbol-filled" cx="10" cy="10" r="4.6"/>';
  } else if (key === '36') {
    marker = '<path class="event-symbol event-symbol-filled" d="M5 7h5V5l5 5-5 5v-2H5z"/>';
  } else if (key === '42') {
    marker = '<path class="event-symbol event-symbol-filled" d="M15 7h-5V5l-5 5 5 5v-2h5z"/>';
  }
  const innerRing = kind === 'intermediate' ? '<circle class="event-ring" cx="10" cy="10" r="6.8"/>' : '';
  return `<svg class="palette-event-icon ${kind}" viewBox="0 0 20 20" aria-hidden="true"><circle class="event-shell" cx="10" cy="10" r="8.5"/>${innerRing}${marker}</svg>`;
}

function taskPaletteIcon(type) {
  const key = String(type);
  let marker = '';
  if (key === '81') marker = '<circle cx="5.5" cy="5" r="1.5"/><path d="M2.5 11q3-4 6 0"/>';
  if (key === '82') marker = '<circle cx="5.5" cy="7" r="1.7"/><path d="M5.5 3.2v1.4m0 4.8v1.4M1.7 7h1.4m4.8 0h1.4M2.8 4.3l1 1m3.4 3.4l1 1m0-5.4l-1 1m-3.4 3.4l-1 1"/>';
  if (key === '84') marker = '<rect x="2" y="4" width="8" height="6"/><path d="M2 4l4 3 4-3"/>';
  if (key === '85') marker = '<path class="filled" d="M3 10V5.2c0-.7 1-.7 1 0V8h.6V4.3c0-.7 1-.7 1 0V8h.6V4.8c0-.7 1-.7 1 0V8h.6V5.6c0-.7 1-.7 1 0v4c0 1.7-1.3 3-3 3H5.4c-.8 0-1.5-.3-2-.8L1.5 9.9c-.6-.6.2-1.4.8-.8z"/>';
  if (key === '86') marker = '<rect x="2" y="3" width="8" height="8"/><path d="M2 6h8M5 6v5"/>';
  if (key === '87') marker = '<path d="M5 3L2 7l3 4m2-8l3 4-3 4"/>';
  if (key === '100') marker = '<rect x="8" y="9" width="6" height="5"/><path d="M9.5 11.5h3M11 10v3"/>';
  if (key === '101') marker = '<rect x="5" y="9" width="6" height="5"/><path d="M6.5 11.5h3M8 10v3M12.5 12q1.2-2 2.4 0t2.4 0"/>';
  return `<svg class="palette-task-subtype-icon" viewBox="0 0 22 16" aria-hidden="true"><rect class="task-shell" x=".75" y=".75" width="20.5" height="14.5" rx="2"/><g class="task-symbol">${marker}</g></svg>`;
}

function gatewayPaletteIcon(type) {
  const key = String(type);
  let marker = '';
  if (key === '121') marker = '<circle cx="10" cy="10" r="4.3"/>';
  if (key === '126') marker = '<path d="M5 8h10M5 12h10"/>';
  if (key === '127') marker = '<path d="M5 10h10M10 5v10"/>';
  return `<svg class="palette-gateway-subtype-icon" viewBox="0 0 20 20" aria-hidden="true"><path class="gateway-shell" d="M10 1l9 9-9 9-9-9z"/><g class="gateway-symbol">${marker}</g></svg>`;
}

function getWebviewHtml(webview, scriptUri, styleUri, nonce, dragGeometryUri = 'dragGeometry.js', flowRouterUri = 'flowRouter.js') {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;">
  <link rel="stylesheet" href="${styleUri}">
  <title>Fluig BPMN</title>
</head>
<body>
  <header class="toolbar">
    <div class="brand"><span class="brand-mark">F</span><strong>Fluig BPMN</strong></div>
    <div class="toolbar-actions">
      <label class="search"><span>Buscar</span><input id="search" type="search" placeholder="Código ou nome"></label>
      <button id="showProcess" title="Exibir as propriedades gerais do processo">Processo</button>
      <button id="alignHorizontal" class="toolbar-icon-button" title="Alinhar horizontalmente pelos centros" aria-label="Alinhar horizontalmente pelos centros" disabled>
        <svg viewBox="0 0 24 20" aria-hidden="true">
          <path class="alignment-guide" d="M2 10h20"></path>
          <rect x="3" y="6" width="7" height="8" rx="1"></rect>
          <rect x="14" y="3" width="7" height="14" rx="1"></rect>
        </svg>
      </button>
      <button id="alignVertical" class="toolbar-icon-button" title="Alinhar verticalmente pelos centros" aria-label="Alinhar verticalmente pelos centros" disabled>
        <svg viewBox="0 0 24 20" aria-hidden="true">
          <path class="alignment-guide" d="M12 1v18"></path>
          <rect x="5" y="2" width="14" height="6" rx="1"></rect>
          <rect x="8" y="12" width="8" height="6" rx="1"></rect>
        </svg>
      </button>
      <button id="zoomOut" title="Diminuir zoom (Ctrl + roda do mouse)">−</button>
      <button id="zoomReset" class="zoom-level" title="Ajustar o diagrama ao espaço disponível" aria-label="Ajustar o diagrama ao espaço disponível">100%</button>
      <button id="zoomIn" title="Aumentar zoom (Ctrl + roda do mouse)">+</button>
      <label class="canvas-color-picker" title="Escolher a cor de fundo do editor">
        <span>Fundo</span>
        <input id="canvasBackgroundColor" type="color" value="#f5f5f5" aria-label="Cor de fundo do editor">
      </label>
      <button id="routeFlows" title="Recalcular rotas sem mover os elementos">Ajustar fluxos</button>
      <button id="generateTranslations" title="Gerar e sincronizar os arquivos de tradução">Traduções</button>
      <button id="showErrors" class="validation-list-button" title="Exibir erros agrupados por elemento" disabled>Erros (0)</button>
      <button id="validate" title="Validar estrutura">Validar</button>
      <button id="openText" title="Abrir no editor de texto">XML</button>
    </div>
  </header>
  <section id="status" class="status loading">Carregando processo...</section>
  <main class="workspace">
    <section id="canvasScroller" class="canvas-scroller" aria-label="Diagrama BPMN">
      <div id="emptyState" class="empty-state hidden"></div>
      <svg id="diagram" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMinYMin meet" role="img" aria-label="Diagrama do processo">
        <defs>
          <linearGradient id="taskGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#dceeff"></stop>
            <stop offset="1" stop-color="#f6f9ff"></stop>
          </linearGradient>
          <linearGradient id="databaseGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#ffffff"></stop>
            <stop offset="1" stop-color="#d8d8d8"></stop>
          </linearGradient>
          <linearGradient id="annotationGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#fffde1"></stop>
            <stop offset="1" stop-color="#fffbc0"></stop>
          </linearGradient>
          <marker id="arrow" markerWidth="7" markerHeight="7" refX="6.5" refY="2.5" orient="auto-start-reverse" markerUnits="strokeWidth">
            <path d="M0,0 L0,5 L6.5,2.5 z" class="arrow-head"></path>
          </marker>
          <marker id="arrowReturn" markerWidth="7" markerHeight="7" refX="6.5" refY="2.5" orient="auto-start-reverse" markerUnits="strokeWidth">
            <path d="M0,0 L0,5 L6.5,2.5 z" class="arrow-head return-arrow-head"></path>
          </marker>
          <marker id="arrowAutomatic" markerWidth="7" markerHeight="7" refX="6.5" refY="2.5" orient="auto-start-reverse" markerUnits="strokeWidth">
            <path d="M0,0 L0,5 L6.5,2.5 z" class="arrow-head automatic-arrow-head"></path>
          </marker>
          <filter id="selectionGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#4da3ff"></feDropShadow>
          </filter>
        </defs>
        <g id="viewport"></g>
      </svg>
    </section>
    <aside id="propertiesPanel" class="properties" aria-expanded="false">
      <div class="properties-tab" aria-hidden="true"><span>Propriedades</span></div>
      <div class="properties-content">
        <form id="propertyForm" class="hidden">
          <div class="property-heading">
            <div>
              <span id="propertyKind" class="eyebrow"></span>
              <h2 id="propertyTitle"></h2>
            </div>
            <span id="propertyCode" class="code-pill"></span>
          </div>
          <div id="propertyFields"></div>
          <details class="raw-properties property-category">
            <summary class="property-category-summary">
              <span>Propriedades brutas</span>
              <span class="property-category-action" aria-hidden="true"></span>
            </summary>
            <div class="property-category-body">
              <dl id="rawPropertyList"></dl>
            </div>
          </details>
          <div class="form-actions">
            <span id="dirtyHint"></span>
            <span class="form-action-buttons">
              <button id="deleteElement" type="button" class="danger hidden">Excluir fluxo</button>
              <button id="apply" type="submit" class="primary" disabled>Aplicar</button>
            </span>
          </div>
        </form>
      </div>
    </aside>
    <aside id="elementPalette" class="element-palette" aria-label="Paleta de elementos" aria-expanded="true">
      <div class="palette-header">
        <div class="palette-title">Paleta</div>
        <button id="togglePalette" class="palette-toggle" type="button" title="Ocultar paleta" aria-label="Ocultar paleta">‹</button>
      </div>
      <button type="button" class="palette-tool active" data-tool="select"><span>↖</span>Select</button>
      <button type="button" class="palette-tool" data-tool="marquee"><span>□</span>Marquee</button>
      <details class="palette-section" open>
        <summary>Fluxos</summary>
        <details class="palette-category">
          <summary><span class="palette-dot start"></span><span>Inicial</span></summary>
          <button type="button" class="palette-tool palette-subtype" data-tool="start" data-subtype="10">${eventPaletteIcon('start', '10')}Simples</button>
          <button type="button" class="palette-tool palette-subtype" data-tool="start" data-subtype="12">${eventPaletteIcon('start', '12')}Temporizador</button>
          <button type="button" class="palette-tool palette-subtype" data-tool="start" data-subtype="13">${eventPaletteIcon('start', '13')}Condicional</button>
          <button type="button" class="palette-tool palette-subtype" data-tool="start" data-subtype="14">${eventPaletteIcon('start', '14')}Sinal</button>
          <button type="button" class="palette-tool palette-subtype" data-tool="start" data-subtype="16">${eventPaletteIcon('start', '16')}Múltiplo</button>
        </details>
        <details class="palette-category">
          <summary><span class="palette-dot end"></span><span>Final</span></summary>
          <button type="button" class="palette-tool palette-subtype" data-tool="end" data-subtype="60">${eventPaletteIcon('end', '60')}Simples</button>
          <button type="button" class="palette-tool palette-subtype" data-tool="end" data-subtype="63">${eventPaletteIcon('end', '63')}Erro</button>
          <button type="button" class="palette-tool palette-subtype" data-tool="end" data-subtype="64">${eventPaletteIcon('end', '64')}Envio de sinal</button>
          <button type="button" class="palette-tool palette-subtype" data-tool="end" data-subtype="65">${eventPaletteIcon('end', '65')}Cancelamento</button>
          <button type="button" class="palette-tool palette-subtype" data-tool="end" data-subtype="66">${eventPaletteIcon('end', '66')}Múltiplo</button>
          <button type="button" class="palette-tool palette-subtype" data-tool="end" data-subtype="68">${eventPaletteIcon('end', '68')}Terminação</button>
        </details>
        <details class="palette-category">
          <summary><span class="palette-dot intermediate"></span><span>Normal</span></summary>
          <button type="button" class="palette-tool palette-subtype" data-tool="intermediate" data-subtype="30">${eventPaletteIcon('intermediate', '30')}Simples</button>
          <button type="button" class="palette-tool palette-subtype" data-tool="intermediate" data-subtype="32">${eventPaletteIcon('intermediate', '32')}Temporizador</button>
          <button type="button" class="palette-tool palette-subtype" data-tool="intermediate" data-subtype="35">${eventPaletteIcon('intermediate', '35')}Condicional</button>
          <button type="button" class="palette-tool palette-subtype" data-tool="intermediate" data-subtype="36">${eventPaletteIcon('intermediate', '36')}Link</button>
          <button type="button" class="palette-tool palette-subtype" data-tool="intermediate" data-subtype="37">${eventPaletteIcon('intermediate', '37')}Envio de sinal</button>
          <button type="button" class="palette-tool palette-subtype" data-tool="intermediate" data-subtype="39">${eventPaletteIcon('intermediate', '39')}Múltiplo</button>
          <button type="button" class="palette-tool palette-subtype" data-tool="intermediate" data-subtype="41">${eventPaletteIcon('intermediate', '41')}Recebe sinal</button>
          <button type="button" class="palette-tool palette-subtype" data-tool="intermediate" data-subtype="42">${eventPaletteIcon('intermediate', '42')}Recebe link</button>
          <button type="button" class="palette-tool palette-subtype" data-tool="intermediate" data-subtype="43" title="Arraste para uma atividade de serviço automatizada">${eventPaletteIcon('intermediate', '43')}Captura de erro</button>
        </details>
        <details class="palette-category">
          <summary><span class="palette-task-icon"></span><span>Atividade</span></summary>
          <button type="button" class="palette-tool palette-subtype" data-tool="task" data-subtype="80">${taskPaletteIcon('80')}Atividade</button>
          <button type="button" class="palette-tool palette-subtype" data-tool="task" data-subtype="81">${taskPaletteIcon('81')}Usuário</button>
          <button type="button" class="palette-tool palette-subtype" data-tool="task" data-subtype="82">${taskPaletteIcon('82')}Serviço</button>
          <button type="button" class="palette-tool palette-subtype" data-tool="task" data-subtype="84">${taskPaletteIcon('84')}Envio de e-mail</button>
          <button type="button" class="palette-tool palette-subtype" data-tool="task" data-subtype="85">${taskPaletteIcon('85')}Manual</button>
          <button type="button" class="palette-tool palette-subtype" data-tool="task" data-subtype="86">${taskPaletteIcon('86')}Negócio</button>
          <button type="button" class="palette-tool palette-subtype" data-tool="task" data-subtype="87">${taskPaletteIcon('87')}Script</button>
          <button type="button" class="palette-tool palette-subtype" data-tool="subprocess" data-subtype="100">${taskPaletteIcon('100')}Subprocesso</button>
          <button type="button" class="palette-tool palette-subtype" data-tool="subprocess" data-subtype="101">${taskPaletteIcon('101')}Ad-Hoc</button>
        </details>
        <details class="palette-category">
          <summary><span class="palette-gateway-icon"></span><span>Gateway</span></summary>
          <button type="button" class="palette-tool palette-subtype" data-tool="gateway" data-subtype="120">${gatewayPaletteIcon('120')}Exclusivo</button>
          <button type="button" class="palette-tool palette-subtype" data-tool="gateway" data-subtype="121">${gatewayPaletteIcon('121')}Inclusivo</button>
          <button type="button" class="palette-tool palette-subtype" data-tool="gateway" data-subtype="126">${gatewayPaletteIcon('126')}Paralelo</button>
          <button type="button" class="palette-tool palette-subtype" data-tool="gateway" data-subtype="127">${gatewayPaletteIcon('127')}Join</button>
        </details>
      </details>
      <button type="button" class="palette-tool" data-tool="pool"><span class="palette-pool-icon"></span>Pool</button>
      <button type="button" class="palette-tool" data-tool="lane"><span class="palette-lane-icon"></span>SwimLane</button>
      <button type="button" class="palette-tool" data-tool="database"><span class="palette-database-icon"></span>Database</button>
      <button type="button" class="palette-tool" data-tool="annotation"><span class="palette-annotation-icon"></span>Anotação</button>
      <button type="button" class="palette-tool" data-tool="document"><span class="palette-document-icon"></span>Documento</button>
    </aside>
  </main>
  <dialog id="validationDialog" class="validation-dialog" aria-labelledby="validationDialogTitle">
    <header class="validation-dialog-header">
      <div>
        <span class="eyebrow">Validação do processo</span>
        <h2 id="validationDialogTitle">Erros por elemento</h2>
      </div>
      <button id="closeValidationDialog" type="button" class="validation-dialog-close" title="Fechar" aria-label="Fechar">×</button>
    </header>
    <div id="validationDialogSummary" class="validation-dialog-summary"></div>
    <div id="validationProblemList" class="validation-problem-list"></div>
  </dialog>
  <div id="toast" class="toast hidden" role="status"></div>
  <script nonce="${nonce}" src="${dragGeometryUri}"></script>
  <script nonce="${nonce}" src="${flowRouterUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

module.exports = { getWebviewHtml };
