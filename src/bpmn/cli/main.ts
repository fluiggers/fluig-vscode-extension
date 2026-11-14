'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../processModel');
const { validateProcess } = require('../processValidator');
const { BackupService } = require('../backupService');
const { buildInitialProcess } = require('../processScaffold');
const { normalizeProcessCode } = require('../processIdentity');
const { OPERATIONS, applyOperations } = require('./operations');
const { creationTemplateText, editorData, openSession } = require('./session');
const { lintProcess } = require('./lint');
const { renderPreview } = require('./render');

const USAGE = `fluig-bpmn: lê e edita diagramas .process do Fluig sem abrir o editor visual.

  fluig-bpmn describe <arquivo.process> [--element id[,id]]
      Sem --element: elementos, fluxos, posições e validação. Com --element: tudo o que o painel de
      propriedades mostra para o elemento, com os valores atuais e as opções de cada campo.
  fluig-bpmn catalog <arquivo.process> [nome] [--search texto] [--limit n]
      Catálogos do editor: users, roles, groups, mechanisms, processes, expedients, volumes, servers,
      formFields, localForms. Sem nome, mostra as contagens.
  fluig-bpmn ops [tipo]
      Operações aceitas por "apply", cada uma com um exemplo de payload.
  fluig-bpmn apply <arquivo.process> --ops <json | @arquivo.json | -> [--dry-run] [--render]
      Aplica as operações em ordem. Grava só se todas passarem; antes, faz backup em .fluig-bpmn/backups.
      --render devolve também a imagem do resultado, inclusive em --dry-run.
  fluig-bpmn render <arquivo.process> [--out imagem.png] [--no-ids]
      Imagem PNG do diagrama com o id de cada elemento e fluxo, para conferir o layout.
  fluig-bpmn validate <arquivo.process>
      Validação estrutural do editor mais as invariantes que só o editor garante. Sai com 1 se houver erro.
  fluig-bpmn new <codigo> --project <raiz do projeto> [--form pasta] [--pool-name nome]
      Cria workflow/diagrams/<codigo>.process com início, atividade e fim, e as literais.

  Toda saída é JSON. Salve o .process no VS Code antes de editar por aqui.
  A CLI não consulta o servidor Fluig: os catálogos do servidor vêm do cache que o editor visual
  grava em .fluig-bpmn/catalogs ao abrir o processo.`;

const VALUE_FLAGS = new Set(['element', 'search', 'limit', 'form', 'ops', 'project', 'pool-name', 'out']);
const BOOLEAN_FLAGS = new Set(['dry-run', 'help', 'render', 'no-ids']);

const CATALOGS = Object.freeze({
  users: 'userCatalog',
  roles: 'roleCatalog',
  groups: 'groupCatalog',
  mechanisms: 'mechanismCatalog',
  processes: 'processCatalog',
  expedients: 'expedientCatalog',
  volumes: 'volumeCatalog',
  servers: 'serverCatalog',
  formFields: 'formFields',
  localForms: 'localFormCatalog'
});

const COMMANDS = {
  describe: async ({ positionals, flags }) => {
    const session = await openSession(requiredFile(positionals));
    const { data, validation, model, catalogs, catalogsSavedAt } = await editorData(session);
    const findings = { ...validation, lint: lintProcess(session.text, model, session.filePath) };
    if (flags.element) return describeElements(session, data, String(flags.element).split(',').map((id) => id.trim()).filter(Boolean));
    return describeOverview(session, data, findings, catalogs, catalogsSavedAt);
  },
  catalog: async ({ positionals, flags }) => {
    const session = await openSession(requiredFile(positionals));
    const name = positionals[1];
    const { catalogs, catalogsSavedAt } = await editorData(session);
    if (!name) {
      return { catalogs: catalogCounts(catalogs), serverCatalogsSavedAt: catalogsSavedAt, warnings: session.warnings };
    }
    if (!Object.hasOwn(CATALOGS, name)) {
      throw new Error(`Catálogo desconhecido: ${name}. Use ${Object.keys(CATALOGS).join(', ')}.`);
    }
    return { catalog: name, ...filtered(catalogs[CATALOGS[name]], flags), warnings: session.warnings };
  },
  ops: async ({ positionals }) => {
    const type = positionals[0];
    if (!type) {
      return {
        operations: Object.fromEntries(Object.entries(OPERATIONS).map(([name, operation]) => [name, operation.summary])),
        usage: 'apply recebe uma lista: [{ "type": "<operação>", ...payload }]. "ops <tipo>" mostra o payload.'
      };
    }
    if (!Object.hasOwn(OPERATIONS, type)) throw new Error(`Operação desconhecida: ${type}.`);
    return {
      type,
      summary: OPERATIONS[type].summary,
      example: { type, ...OPERATIONS[type].example },
      extras: {
        as: 'Nomeia o elemento criado; operações seguintes o citam como "$nome" e o fluxo criado junto como "$nome.flow".',
        properties: 'Em operações que criam: propriedades simples aplicadas ao elemento novo, como { "name": "..." }.',
        flowProperties: 'Em createConnected*: propriedades do fluxo criado junto.'
      }
    };
  },
  apply: async ({ positionals, flags }) => {
    const session = await openSession(requiredFile(positionals));
    const result = await applyOperations(session, readOperations(flags.ops), creationTemplateText());
    const model = parseProcess(result.text);
    const validation = validateProcess(model);
    const output = {
      file: session.filePath,
      changed: result.text !== session.originalText,
      dryRun: Boolean(flags['dry-run']),
      operations: result.outcomes,
      names: result.aliases,
      repairs: result.repairs,
      validation: summarize({ ...validation, lint: lintProcess(result.text, model, session.filePath) }),
      warnings: session.warnings,
      ...(flags.render ? { preview: renderPreview(session.filePath, result.text, { outFile: flags.out }) } : {})
    };
    if (output.dryRun || !output.changed) return output;
    return { ...output, ...await commit(session, result) };
  },
  render: async ({ positionals, flags }) => {
    const filePath = path.resolve(requiredFile(positionals));
    const text = await fs.promises.readFile(filePath, 'utf8');
    return { file: filePath, ...renderPreview(filePath, text, { outFile: flags.out, ids: !flags['no-ids'] }) };
  },
  validate: async ({ positionals }) => {
    const filePath = path.resolve(requiredFile(positionals));
    const text = await fs.promises.readFile(filePath, 'utf8');
    const model = parseProcess(text);
    const summary = summarize({ ...validateProcess(model), lint: lintProcess(text, model, filePath) });
    return { file: filePath, ...summary, exitCode: summary.ok ? 0 : 1 };
  },
  new: async ({ positionals, flags }) => {
    if (!positionals[0] || !flags.project) throw new Error('Informe o código e --project <raiz do projeto>.');
    const code = normalizeProcessCode(positionals[0]);
    const projectRoot = path.resolve(String(flags.project));
    const processFile = path.join(projectRoot, 'workflow', 'diagrams', `${code}.process`);
    const literalFile = (locale) => path.join(projectRoot, 'workflow', 'literals', `${code}_${locale}.properties`);
    const locales = ['pt_BR', 'en_US', 'es'];
    for (const target of [processFile, ...locales.map(literalFile)]) {
      if (fs.existsSync(target)) throw new Error(`O arquivo ${path.basename(target)} ja existe.`);
    }
    const scaffold = buildInitialProcess(creationTemplateText(), code, {
      poolName: String(flags['pool-name'] ?? path.basename(projectRoot)),
      form: flags.form ? String(flags.form) : undefined
    });
    await fs.promises.mkdir(path.dirname(processFile), { recursive: true });
    await fs.promises.mkdir(path.dirname(literalFile('es')), { recursive: true });
    await fs.promises.writeFile(processFile, Buffer.from(scaffold.text, 'ascii'));
    for (const locale of locales) {
      const literals = scaffold.translationPlan.files.get(locale);
      if (!literals) throw new Error(`Traducao inicial ausente: ${locale}.`);
      await fs.promises.writeFile(literalFile(locale), Buffer.from(literals.content, 'ascii'));
    }
    return { file: processFile, code, literals: locales.map(literalFile) };
  }
};

function describeOverview(session, data, findings, catalogs, catalogsSavedAt) {
  const shapeById = new Map(data.shapes.map((shape) => [shape.businessObject, shape]));
  const flows = data.elements.filter((element) => element.tag === 'SequenceFlow');
  const process = data.elements.find((element) => element.tag === 'BpmnProcess');
  const references = (value) => String(value ?? '').trim().split(/\s+/).filter(Boolean);
  return {
    file: session.filePath,
    process: process ? { id: process.id, name: process.name, ...pick(process.attributes, ['serverId', 'formSource', 'cardIndex', 'version']) } : null,
    format: data.fingerprint,
    canvas: data.canvas,
    elements: data.elements
      .filter((element) => element.tag !== 'SequenceFlow' && element.tag !== 'BpmnProcess')
      .map((element) => {
        const shape = shapeById.get(element.id);
        return compact({
          id: element.id,
          code: element.code,
          kind: element.typeLabel,
          tag: element.tag,
          type: element.type,
          name: element.name,
          incoming: references(element.attributes.incoming),
          outgoing: references(element.attributes.outgoing),
          bounds: shape ? { x: shape.x, y: shape.y, width: shape.visualWidth, height: shape.visualHeight } : undefined,
          issues: element.configurationIssues
        });
      }),
    flows: flows.map((flow) => compact({
      id: flow.id,
      name: flow.name,
      from: flow.attributes.sourceRef,
      to: flow.attributes.targetRef,
      default: ['true', '1'].includes(flow.attributes.defaultLink) || undefined,
      bendpoints: data.connections.find((connection) => connection.businessObject === flow.id)?.bendpoints
    })),
    validation: summarize(findings),
    catalogs: catalogCounts(catalogs),
    serverCatalogsSavedAt: catalogsSavedAt,
    warnings: session.warnings
  };
}

function describeElements(session, data, ids) {
  const shapeById = new Map(data.shapes.map((shape) => [shape.businessObject, shape]));
  const missing = ids.filter((id) => !data.elements.some((element) => element.id === id));
  if (missing.length) throw new Error(`Elementos não encontrados: ${missing.join(', ')}.`);
  return {
    file: session.filePath,
    elements: data.elements.filter((element) => ids.includes(element.id)).map((element) => {
      const shape = shapeById.get(element.id);
      const editors = Object.fromEntries(Object.entries(element)
        .filter(([key, value]) => key.endsWith('Editor') && value && value.supported !== false));
      return compact({
        id: element.id,
        code: element.code,
        kind: element.typeLabel,
        tag: element.tag,
        type: element.type,
        name: element.name,
        attributes: element.attributes,
        bounds: shape ? { x: shape.x, y: shape.y, width: shape.visualWidth, height: shape.visualHeight } : undefined,
        issues: element.configurationIssues,
        editableProperties: element.editableProperties,
        ...editors
      });
    }),
    warnings: session.warnings
  };
}

function catalogCounts(catalogs) {
  return Object.fromEntries(Object.entries(CATALOGS).map(([label, key]) => [label, catalogs[key].length]));
}

function filtered(items, flags) {
  const search = String(flags.search ?? '').trim().toLocaleLowerCase('pt-BR');
  const matching = search
    ? items.filter((item) => JSON.stringify(item).toLocaleLowerCase('pt-BR').includes(search))
    : items;
  const limit = flags.limit === undefined ? 200 : Math.max(1, Number.parseInt(String(flags.limit), 10) || 200);
  return { total: matching.length, items: matching.slice(0, limit) };
}

/** Grava o .process e os arquivos vinculados depois que todas as operações passaram. */
async function commit(session, result) {
  if (await fs.promises.readFile(session.filePath, 'utf8') !== session.originalText) {
    throw new Error('O arquivo mudou no disco enquanto as operações eram calculadas. Tente novamente.');
  }
  const backups = new BackupService();
  const owner = { uri: session.uri, getText: () => session.originalText };
  const backup = await backups.ensureBackup(session.host, owner);
  const removed = result.fileEffects.filter((effect) => effect.kind === 'delete');
  for (const effect of removed) {
    await backups.createRelatedFileBackup(session.host, owner, session.host.Uri.file(effect.file));
  }
  const temporary = `${session.filePath}.${process.pid}.tmp`;
  await fs.promises.writeFile(temporary, Buffer.from(result.text, 'utf8'));
  await fs.promises.rename(temporary, session.filePath);
  const files = [];
  for (const effect of result.fileEffects) {
    if (effect.kind === 'delete') {
      await fs.promises.rm(effect.file, { force: true });
    } else {
      await fs.promises.mkdir(path.dirname(effect.file), { recursive: true });
      await fs.promises.writeFile(effect.file, effect.content, { flag: 'wx' });
    }
    files.push({ [effect.kind === 'delete' ? 'deleted' : 'created']: effect.file });
  }
  return { backup: backup.fsPath, files };
}

function readOperations(source) {
  if (source === undefined) throw new Error('Informe --ops com um JSON, @arquivo.json ou - para ler da entrada padrão.');
  const value = String(source);
  const raw = value === '-'
    ? fs.readFileSync(0, 'utf8')
    : (value.startsWith('@') ? fs.readFileSync(path.resolve(value.slice(1)), 'utf8') : value);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`--ops não é um JSON válido: ${error.message}`);
  }
  if (Array.isArray(parsed)) return parsed;
  return Array.isArray(parsed?.operations) ? parsed.operations : [parsed];
}

function summarize(findings) {
  const strip = ({ code, message, elementId }) => compact({ code, message, elementId: elementId || undefined });
  const lint = findings.lint ?? [];
  const errors = [...findings.errors, ...lint.filter((item) => item.severity === 'error')];
  const warnings = [...findings.warnings, ...lint.filter((item) => item.severity === 'warning')];
  return { ok: errors.length === 0, errors: errors.map(strip), warnings: warnings.map(strip) };
}

function pick(source, keys) {
  return Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => (
    item !== undefined && item !== '' && !(Array.isArray(item) && item.length === 0)
  )));
}

function requiredFile(positionals) {
  if (!positionals[0]) throw new Error('Informe o arquivo .process.');
  return positionals[0];
}

function parseArguments(argv) {
  const positionals = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--') || argument === '--') {
      positionals.push(argument);
      continue;
    }
    const [name, inline] = argument.slice(2).split(/=(.*)/s);
    if (BOOLEAN_FLAGS.has(name)) {
      flags[name] = true;
    } else if (VALUE_FLAGS.has(name)) {
      const value = inline ?? argv[index += 1];
      if (value === undefined) throw new Error(`--${name} exige um valor.`);
      flags[name] = value;
    } else {
      throw new Error(`Opção desconhecida: --${name}.`);
    }
  }
  return { positionals, flags };
}

/** JSON com uma chave por linha e um item de lista por linha: legível sem gastar uma linha por campo. */
function render(output) {
  const lines = Object.entries(output).map(([key, value]) => {
    if (!Array.isArray(value) || !value.length) return `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`;
    return `  ${JSON.stringify(key)}: [\n${value.map((item) => `    ${JSON.stringify(item)}`).join(',\n')}\n  ]`;
  });
  return `{\n${lines.join(',\n')}\n}`;
}

/**
 * @param {string[]} argv
 * @returns {Promise<{exitCode: number, output: object | string}>}
 */
async function run(argv) {
  try {
    const { positionals, flags } = parseArguments(argv);
    const [command, ...rest] = positionals;
    if (flags.help || !command || command === 'help') return { exitCode: 0, output: USAGE };
    if (!Object.hasOwn(COMMANDS, command)) throw new Error(`Comando desconhecido: ${command}. Rode "fluig-bpmn help".`);
    const { exitCode = 0, ...output } = await COMMANDS[command]({ positionals: rest, flags });
    return { exitCode, output: { ok: exitCode === 0, ...output } };
  } catch (error) {
    return {
      exitCode: 1,
      output: compact({ ok: false, error: error.message, operationIndex: error.operationIndex, passedBefore: error.passedBefore })
    };
  }
}

if (require.main === module) {
  void run(process.argv.slice(2)).then(({ exitCode, output }) => {
    process.stdout.write(`${typeof output === 'string' ? output : render(output)}\n`);
    process.exitCode = exitCode;
  });
}

module.exports = { run };
