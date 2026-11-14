'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parseProcess } = require('../processModel');
const { validateProcess } = require('../processValidator');
const { toWebviewData } = require('../webviewData');
const { renderProcessImageSvg } = require('../processImage');
const { projectRootForProcessPath } = require('../nodeReferenceScanner');

const SCALE = 2;
const CHROMIUM_FLAGS = ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--force-device-scale-factor=${SCALE}`];

/**
 * Conversores de SVG para PNG que costumam existir na máquina, do mais fiel ao mais improvisado.
 * A extensão não empacota um rasterizador: no editor quem faz isso é o webview.
 */
const RASTERIZERS = [
  { name: 'rsvg-convert', run: ({ svg, png }) => exec('rsvg-convert', ['-z', String(SCALE), '-o', png, svg]) },
  { name: 'magick', run: ({ svg, png }) => exec('magick', ['-density', String(96 * SCALE), svg, png]) },
  { name: 'inkscape', run: ({ svg, png }) => exec('inkscape', [svg, '--export-type=png', `--export-filename=${png}`, '-d', String(96 * SCALE)]) },
  ...chromiumBinaries().map((binary) => ({
    name: path.basename(binary),
    run: ({ svg, png, width, height }) => exec(binary, [
      ...CHROMIUM_FLAGS, `--window-size=${width},${height}`, `--screenshot=${png}`, `file://${svg}`
    ])
  })),
  {
    name: 'qlmanage',
    run: ({ svg, png, width, height }) => {
      if (process.platform !== 'darwin') throw new Error('só existe no macOS');
      exec('qlmanage', ['-t', '-s', String(Math.max(width, height) * SCALE), '-o', path.dirname(png), svg]);
      fs.renameSync(`${svg}.png`, png);
    }
  }
];

function chromiumBinaries() {
  if (process.platform === 'darwin') {
    return ['Google Chrome', 'Microsoft Edge', 'Chromium', 'Brave Browser']
      .map((name) => `/Applications/${name}.app/Contents/MacOS/${name}`);
  }
  if (process.platform === 'win32') {
    const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
    return roots.flatMap((root) => [
      path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    ]);
  }
  return ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge'];
}

function exec(command, args) {
  execFileSync(command, args, { stdio: 'ignore', timeout: 30000 });
}

/**
 * Desenha o processo como o editor o exporta e, por cima, o id de cada elemento e fluxo, para um
 * agente olhar a imagem e saber o que mover.
 * @param {string} text
 * @param {{ids?: boolean}} options
 */
function previewSvg(text, options = {}) {
  const svg = renderProcessImageSvg(text);
  const [, width, height] = svg.match(/<svg\b[^>]*\bwidth="(\d+(?:\.\d+)?)"[^>]*\bheight="(\d+(?:\.\d+)?)"/) ?? [];
  const size = { width: Math.ceil(Number(width)), height: Math.ceil(Number(height)) };
  if (options.ids === false) return { svg, ...size };

  const model = parseProcess(text);
  const data = toWebviewData(model, validateProcess(model), {});
  const label = (x, y, id) => (
    `<text x="${Math.round(x)}" y="${Math.round(y)}" font-size="9" font-family="Menlo, Consolas, monospace" `
    + `fill="#b00020" stroke="#ffffff" stroke-width="2.5" paint-order="stroke" stroke-linejoin="round">${id}</text>`
  );
  const elementById = new Map(data.elements.map((element) => [element.id, element]));
  const labels = [
    ...data.shapes.map((shape) => {
      const tag = elementById.get(shape.businessObject)?.tag ?? '';
      // Eventos e gateways são pequenos: o id vai acima. Nos demais cabe no canto, sem tapar o nome.
      const above = tag.includes('Event') || tag === 'BpmnGateway';
      return above
        ? label(shape.x, shape.y - 4, shape.businessObject)
        : label(shape.x + 4, shape.y + 10, shape.businessObject);
    }),
    ...data.connections.filter((connection) => connection.source && connection.target).map((connection) => {
      const route = [connection.source, ...connection.bendpoints, connection.target];
      const segments = route.slice(1).map((to, index) => ({ from: route[index], to }));
      const { from, to } = segments.reduce((longest, segment) => (length(segment) > length(longest) ? segment : longest));
      // A um quarto do trecho mais longo: o nome do fluxo ocupa o meio.
      return label(from.x + ((to.x - from.x) / 4) + 3, from.y + ((to.y - from.y) / 4) - 4, connection.businessObject);
    })
  ];
  // Os rótulos entram no grupo transladado do desenho, então usam as coordenadas do diagrama.
  return { svg: svg.replace(/<\/g>\s*<\/svg>\s*$/, `${labels.join('')}</g></svg>`), ...size };
}

function length({ from, to }) {
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
}

/**
 * Grava a imagem do processo. Sem `outFile`, ela vai para `.fluig-bpmn/preview`, fora do git.
 * @returns {{svg: string, png?: string, rasterizer?: string, width: number, height: number, hint?: string}}
 */
function renderPreview(processPath, text, options = {}) {
  const baseName = path.basename(processPath, path.extname(processPath));
  const png = path.resolve(options.outFile ?? path.join(
    projectRootForProcessPath(processPath) ?? os.tmpdir(), '.fluig-bpmn', 'preview', `${baseName}.png`
  ));
  const svgFile = png.replace(/\.png$/i, '') + '.svg';
  fs.mkdirSync(path.dirname(png), { recursive: true });
  if (!options.outFile) fs.writeFileSync(path.join(path.dirname(png), '.gitignore'), '*\n');
  const preview = previewSvg(text, options);
  fs.writeFileSync(svgFile, preview.svg);
  fs.rmSync(png, { force: true });

  const size = { width: preview.width, height: preview.height };
  for (const rasterizer of RASTERIZERS) {
    try {
      rasterizer.run({ svg: svgFile, png, ...size });
      if (fs.statSync(png).size > 0) return { png, svg: svgFile, rasterizer: rasterizer.name, ...size };
    } catch {
      // Conversor ausente ou sem suporte a SVG: tenta o próximo.
    }
  }
  return {
    svg: svgFile,
    ...size,
    hint: 'Nenhum conversor de SVG para PNG foi encontrado (rsvg-convert, ImageMagick, Inkscape, Chrome ou Edge). Abra o SVG ou instale um deles.'
  };
}

module.exports = { previewSvg, renderPreview };
