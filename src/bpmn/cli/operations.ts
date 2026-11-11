'use strict';

const fs = require('node:fs');
const path = require('node:path');
const patcher = require('../processPatcher');
const { parseProcess } = require('../processModel');
const { validateProcess } = require('../processValidator');
const { toWebviewData } = require('../webviewData');
const { projectRootForProcessPath } = require('../nodeReferenceScanner');
const layout = require('./layout');
const { REFERENCE_SENSITIVE_TAGS, findProjectNodeReferences, linkedScripts, scriptPath } = require('./projectFiles');
const { loadCatalogs } = require('./session');

const DELETE_BY_TAG = Object.freeze({
  SequenceFlow: patcher.deleteSequenceFlow,
  BpmnTask: patcher.deleteIsolatedTask,
  BpmnSubProcess: patcher.deleteIsolatedSubProcess,
  BpmnGateway: patcher.deleteIsolatedGateway,
  BpmnStartEvent: patcher.deleteIsolatedEvent,
  BpmnEndEvent: patcher.deleteIsolatedEvent,
  BpmnIntermediateEvent: patcher.deleteIsolatedEvent,
  BpmnPool: patcher.deleteDiagramContainer,
  BpmnSwimLane: patcher.deleteDiagramContainer,
  BpmnAnnotation: patcher.deleteIsolatedArtifact,
  BpmnDatabase: patcher.deleteIsolatedArtifact,
  BpmnDocument: patcher.deleteIsolatedArtifact,
  BpmnGroup: patcher.deleteIsolatedArtifact
});

/**
 * Operações que um agente pode aplicar a um .process. Cada uma leva o mesmo payload que o webview
 * envia ao editor (`covers` lista as mensagens equivalentes) e chama o mesmo patcher, que valida o
 * arquivo antes e depois. Coordenadas e pontos de dobra omitidos são calculados aqui.
 */
const OPERATIONS = {
  updateProperties: {
    summary: 'Edita propriedades simples (nome, instruções, flags). `describe --element` lista as aceitas em editableProperties.',
    example: { elementId: 'task5', changes: { name: 'Aprovar pedido', instrucoes: 'Confira o valor.' } },
    run: (text, op) => patcher.patchProcess(text, op.elementId, op.changes)
  },
  updateProcessGeneral: {
    summary: 'Propriedades gerais do processo. O código não muda por aqui: renomear exige mover scripts e literais.',
    example: { configuration: { description: 'Solicitação de compra', serverId: 'homologacao', category: 'Compras', volume: 'Default', expedient: 'Default', deadlineTime: '045:00', warningTime: '036:00' } },
    run: async (text, op, context) => {
      const model = parseProcess(text);
      const elementId = processId(model, op);
      const { volumeCatalog, expedientCatalog, serverCatalog } = await loadCatalogs(context.session, model);
      const result = patcher.patchProcessGeneral(text, elementId, op.configuration, {
        volumeCatalog,
        expedientCatalog,
        serverCatalog
      });
      if (result.model.process.id !== elementId) {
        throw new Error('Alterar o código do processo renomeia o .process, scripts e literais; faça isso pelo editor visual.');
      }
      return result;
    }
  },
  updateProcessVersion: {
    summary: 'Propriedades da versão do processo.',
    example: { configuration: { instructions: 'Primeira versão', updateAttachment: true, confirmPassword: false, mobileProcess: true } },
    run: (text, op) => patcher.patchProcessVersion(text, processId(parseProcess(text), op), op.configuration)
  },
  updateProcessForm: {
    summary: 'Formulário do processo. `source` é local (pasta em forms/) ou server (cardIndex numérico).',
    example: { configuration: { source: 'local', cardIndex: 'solicitacao_compra', uniqueCardVersion: true, inheritFormSecurity: true, descriptorFields: [{ id: 'solicitante', label: 'Solicitante' }] } },
    run: async (text, op, context) => {
      const model = parseProcess(text);
      const { localFormCatalog } = await loadCatalogs(context.session, model);
      return patcher.patchProcessForm(text, processId(model, op), op.configuration, { localForms: localFormCatalog });
    }
  },
  updateProcessAttachmentSecurity: {
    summary: 'Segurança de anexos do processo. Parta de processAttachmentSecurityEditor em `describe --element <processo>`.',
    example: { configuration: { controlled: false, rules: [] } },
    run: (text, op) => patcher.patchProcessAttachmentSecurity(text, processId(parseProcess(text), op), op.configuration)
  },
  updateProcessManager: {
    summary: 'Gestor do processo, pelo mesmo mecanismo de atribuição das atividades.',
    example: { assignment: { mechanism: 'Papel', mechanismConfiguration: { roleId: 'admin' } } },
    run: (text, op) => patcher.patchProcessManager(text, processId(parseProcess(text), op), op.assignment)
  },
  updateGatewayBranches: {
    summary: 'Condições e fluxo padrão de um gateway exclusivo ou inclusivo. Cada condição aponta para o destino de uma saída do gateway.',
    example: { gatewayId: 'exclusivegateway39', configuration: { defaultFlowId: 'flow49', conditions: [{ sourceIndex: '', order: 1, expression: 'hAPI.getCardValue("aprovado") == "sim"', targetId: 'task12' }] } },
    run: (text, op) => patcher.patchGatewayBranches(text, op.gatewayId, op.configuration)
  },
  updateTaskAssignment: {
    summary: 'Mecanismo de atribuição de uma atividade. `catalog mechanisms|users|roles|groups` lista os valores válidos.',
    example: { elementId: 'task5', assignment: { mechanism: 'Usuário', mechanismConfiguration: { colleagueId: 'daniel.sales' } } },
    run: (text, op) => patcher.patchTaskAssignment(text, op.elementId, op.assignment)
  },
  updateEventTrigger: {
    summary: 'Agenda de um evento temporizador ou condicional.',
    example: { elementId: 'starttimer15', trigger: { runType: 'WEEK_DAY', time: '07:30:00', frequency: '01', dayOfWeek: '', weekdays: ['MON', 'WED'] } },
    run: (text, op) => patcher.patchEventTrigger(text, op.elementId, op.trigger)
  },
  updateEventInitializer: {
    summary: 'Quem pode iniciar o processo por um evento inicial.',
    example: { elementId: 'startevent4', initializer: { mechanism: 'Papel', mechanismConfiguration: { roleId: 'admin' } } },
    run: (text, op) => patcher.patchEventInitializer(text, op.elementId, op.initializer)
  },
  updateTaskNotifications: {
    summary: 'Notificações e avisos de atraso de uma atividade.',
    example: { elementId: 'task5', configuration: { notifyResponsible: true, notifyRequester: false, lateResponsible: true, lateResponsibleTolerance: '002:00', lateResponsibleFrequency: '004:00', lateResponsibleExpiration: '024:00', lateRequester: false, lateRequesterTolerance: '000:00', lateRequesterFrequency: '000:00', lateRequesterExpiration: '000:00' } },
    run: (text, op) => patcher.patchTaskNotifications(text, op.elementId, op.configuration)
  },
  updateTaskJoint: {
    summary: 'Atividade conjunta e consenso.',
    example: { elementId: 'task5', configuration: { joint: true, consensus: '75', neverSelectCollaborators: false } },
    run: (text, op) => patcher.patchTaskJoint(text, op.elementId, op.configuration)
  },
  updateTaskDeadline: {
    summary: 'Expediente e prazo de uma atividade: fixo (HHH:MM) ou lido de um campo do formulário.',
    example: { elementId: 'task5', configuration: { expedient: 'Default', mode: 'fixed', fixedDuration: '024:00', deadlineFieldName: '' } },
    run: async (text, op, context) => {
      const { formFields, expedientCatalog } = await loadCatalogs(context.session, parseProcess(text));
      return patcher.patchTaskDeadline(text, op.elementId, op.configuration, { formFields, expedientCatalog });
    }
  },
  updateTaskMobile: {
    summary: 'Configuração da atividade no aplicativo móvel.',
    example: { elementId: 'task5', configuration: { title: '@[form:solicitante]', highlight: '', description: '', approve: '39', reject: '4' } },
    run: (text, op) => patcher.patchTaskMobile(text, op.elementId, op.configuration)
  },
  updateTaskAttachmentRules: {
    summary: 'Regras de anexo obrigatório de uma atividade. A lista enviada substitui a atual.',
    example: { elementId: 'task5', rules: [{ operator: '1', amount: 2, name: '*.pdf', message: 'Anexe a nota.' }] },
    run: (text, op) => patcher.patchTaskAttachmentRules(text, op.elementId, op.rules)
  },
  updateSubProcessFormMaps: {
    summary: 'Mapa de campos entre o formulário do processo e o do subprocesso. Exige o cache de catálogos do servidor.',
    example: { elementId: 'subprocess35', maps: [{ processField: 'codigo', subProcessField: 'codigo', mapFlow: '1' }] },
    run: async (text, op, context) => {
      const { subProcessFormFieldCatalogs } = await loadCatalogs(context.session, parseProcess(text));
      const catalog = subProcessFormFieldCatalogs[op.elementId];
      if (!catalog?.supported) throw new Error(catalog?.reason || 'Os campos dos formularios nao estao disponiveis.');
      return patcher.patchSubProcessFormMaps(text, op.elementId, op.maps, catalog);
    }
  },
  updateExtendedProperties: {
    summary: 'Atributos de extensão. A lista enviada substitui a atual. type: 0 campo, 1 texto, 2 número, 3 data, 4 checkbox.',
    example: { elementId: 'task5', properties: [{ name: 'centroCusto', type: '0', label: 'Centro de custo', value: '1001' }] },
    run: (text, op) => patcher.patchExtendedProperties(text, op.elementId, op.properties)
  },
  openTaskScript: {
    summary: 'Vincula o script de uma atividade de serviço, negócio ou script e cria o arquivo em workflow/scripts se faltar.',
    example: { elementId: 'scripttask9' },
    run: (text, op, context) => {
      const result = patcher.patchTaskScriptReference(text, op.elementId);
      const file = scriptPath(context.session.filePath, result.fileName, 'atividade');
      return {
        ...result,
        fileEffects: fs.existsSync(file) ? [] : [{ kind: 'create', file, content: result.template }]
      };
    }
  },
  updateLayout: {
    summary: 'Move, redimensiona e redesenha rotas. Mover uma pool exige mover as raias dela junto.',
    example: { layout: { moves: [{ id: 'task5', x: 320, y: 140 }], resizes: [{ id: 'pool1', width: 900, height: 320 }], connections: [{ id: 'flow46', bendpoints: [{ x: 300, y: 168 }] }] } },
    run: (text, op) => patcher.patchLayout(text, op.layout)
  },
  createConnection: {
    summary: 'Liga dois elementos existentes com um fluxo. Sem bendpoints, a rota é calculada.',
    example: { connection: { sourceId: 'task5', targetId: 'endevent8' }, properties: { name: 'Aprovado' } },
    run: (text, op, context) => patcher.createSequenceFlow(text, {
      ...op.connection,
      bendpoints: op.connection?.bendpoints
        ?? layout.routeBetween(context.scene(text), op.connection?.sourceId, op.connection?.targetId),
      templateText: context.templateText
    })
  },
  reconnectSequenceFlow: {
    summary: 'Troca a origem (endpoint: source) ou o destino (endpoint: target) de um fluxo, mantendo o id.',
    example: { reconnection: { flowId: 'flow47', endpoint: 'target', newElementId: 'task12' } },
    run: (text, op, context) => {
      const flow = parseProcess(text).flows.find((item) => item.id === op.reconnection?.flowId);
      const source = op.reconnection?.endpoint === 'source' ? op.reconnection?.newElementId : flow?.attributes.sourceRef;
      const target = op.reconnection?.endpoint === 'target' ? op.reconnection?.newElementId : flow?.attributes.targetRef;
      return patcher.reconnectSequenceFlow(text, {
        ...op.reconnection,
        bendpoints: op.reconnection?.bendpoints ?? layout.routeBetween(context.scene(text), source, target)
      });
    }
  },
  deleteElements: {
    summary: 'Exclui elementos e fluxos, com os fluxos incidentes e os scripts que pertencem a eles. Recusa se scripts ou eventos de formulário citarem o código do elemento.',
    example: { elementIds: ['task12', 'flow47'] },
    covers: [
      'deleteSequenceFlow', 'deleteIsolatedEvent', 'deleteAttachedErrorEvent', 'deleteIsolatedGateway',
      'deleteIsolatedTask', 'deleteIsolatedSubProcess', 'deleteIsolatedArtifact', 'deleteDiagramContainer',
      'deleteMultipleElements'
    ],
    run: deleteElements
  },
  convertTask: {
    summary: 'Muda o tipo de uma atividade. O Fluig recria a atividade: o id e o WKNumState mudam e voltam em newId/newActivityId. targetType: 80 comum, 81 usuário, 82 serviço, 84 e-mail, 85 manual, 86 negócio, 87 script.',
    example: { taskId: 'task5', targetType: '82' },
    run: (text, op) => patcher.convertTaskType(text, op.taskId, String(op.targetType ?? ''))
  },
  createConnectedTask: {
    summary: 'Cria uma atividade comum já ligada à saída de sourceId. Sem x e y, entra na primeira área livre à direita.',
    example: { task: { sourceId: 'startevent4' }, properties: { name: 'Analisar pedido' }, as: 'analise' },
    run: (text, op, context) => createConnected(text, op.task, layout.TASK_SIZE, patcher.createConnectedTask, context)
  },
  createConnectedGateway: {
    summary: 'Cria um gateway exclusivo já ligado à saída de sourceId.',
    example: { gateway: { sourceId: 'task5' }, as: 'decisao' },
    run: (text, op, context) => createConnected(text, op.gateway, layout.GATEWAY_SIZE, patcher.createConnectedGateway, context)
  },
  createConnectedIntermediateEvent: {
    summary: 'Cria um evento intermediário simples já ligado à saída de sourceId.',
    example: { intermediateEvent: { sourceId: 'task5' } },
    run: (text, op, context) => createConnected(text, op.intermediateEvent, layout.EVENT_SIZE, patcher.createConnectedIntermediateEvent, context)
  },
  createConnectedEndEvent: {
    summary: 'Cria um evento final simples já ligado à saída de sourceId.',
    example: { endEvent: { sourceId: 'task5' }, properties: { name: 'Fim' } },
    run: (text, op, context) => createConnected(text, op.endEvent, layout.EVENT_SIZE, patcher.createConnectedEndEvent, context)
  },
  createPool: {
    summary: 'Cria uma pool vazia. Sem x e y, entra abaixo do que já existe.',
    example: { pool: { width: 900, height: 320 }, properties: { name: 'Compras' } },
    run: (text, op, context) => patcher.createPool(text, {
      ...layout.placeContainer(context.scene(text)),
      ...op.pool,
      templateText: context.templateText
    })
  },
  createSwimLane: {
    summary: 'Cria uma raia dentro de poolId (as raias da pool são redistribuídas) ou, sem poolId, uma raia independente.',
    example: { lane: { poolId: 'pool1' }, properties: { name: 'Financeiro' } },
    run: (text, op, context) => patcher.createSwimLane(text, {
      ...(op.lane?.poolId ? {} : layout.placeContainer(context.scene(text))),
      ...op.lane,
      templateText: context.templateText
    })
  },
  createIsolatedNode: {
    summary: 'Cria um elemento solto, para ligar depois com createConnection. kind: start, end, intermediate, task, subprocess, gateway, database, annotation, document. subtype é o código do tipo (por exemplo task 82, gateway 126, end 63).',
    example: { node: { kind: 'gateway', subtype: '126' }, as: 'paralelo' },
    run: (text, op, context) => {
      const size = layout.NODE_SIZES[String(op.node?.kind ?? '')];
      return patcher.createIsolatedNode(text, {
        ...(size ? layout.placeIsolated(context.scene(text), size) : {}),
        ...op.node,
        templateText: context.templateText
      });
    }
  },
  createAttachedErrorEvent: {
    summary: 'Anexa uma captura de erro a uma atividade de serviço automatizada (executionType 1).',
    example: { errorEvent: { taskId: 'servicetask11' } },
    run: (text, op, context) => patcher.createAttachedErrorEvent(text, {
      ...layout.attachedErrorPosition(context.scene(text), op.errorEvent?.taskId),
      ...op.errorEvent,
      templateText: context.templateText
    })
  }
};

// Mensagens do webview que não mudam o arquivo: leitura, navegação e exportações da interface.
const UI_ONLY_MESSAGES = Object.freeze([
  'ready', 'validate', 'openText', 'generateTranslations', 'exportPng', 'pngExportReady', 'pngExportFailed',
  'requestServerForms', 'requestServerFormFields', 'requestServerBusinessPeriods', 'requestServerMechanisms'
]);

function processId(model, op) {
  return String(op.elementId ?? model.process?.id ?? '');
}

function createConnected(text, request, size, create, context) {
  const sourceId = String(request?.sourceId ?? '');
  const explicit = request?.x !== undefined && request?.y !== undefined;
  const placement = explicit ? {} : layout.placeConnected(context.scene(text), sourceId, size);
  const result = create(text, { ...placement, ...request, templateText: context.templateText });
  return placement.outsideContainerId
    ? { ...result, notice: `Sem área livre em ${placement.outsideContainerId}: o elemento ficou fora dela. Aumente-a com updateLayout.` }
    : result;
}

async function deleteElements(text, op, context) {
  const elementIds = [...new Set((op.elementIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))];
  if (!elementIds.length) throw new Error('Informe elementIds com pelo menos um elemento.');
  const model = parseProcess(text);
  let result;
  if (elementIds.length > 1) {
    result = patcher.deleteDiagramElements(text, elementIds);
  } else {
    const element = [...model.elements, ...model.flows].find((item) => item.id === elementIds[0]);
    if (!element) throw new Error(`Elemento não encontrado: ${elementIds[0]}.`);
    const attachedError = element.tag === 'BpmnIntermediateEvent' && String(element.type) === '43';
    const remove = attachedError ? patcher.deleteAttachedErrorEvent : DELETE_BY_TAG[element.tag];
    if (!remove) throw new Error(`${element.tag} não pode ser excluído.`);
    result = remove(text, element.id);
  }

  const sensitive = model.elements.filter((item) => elementIds.includes(item.id) && REFERENCE_SENSITIVE_TAGS.has(item.tag));
  if (!sensitive.length) return result;
  if (!projectRootForProcessPath(context.session.filePath)) {
    return { ...result, notice: 'Fora de workflow/diagrams: referências em scripts e formulários não foram verificadas.' };
  }
  const scripts = await linkedScripts(context.session.filePath, text, elementIds);
  const ownScripts = new Set(scripts.filter((item) => item.exists).map((item) => item.file));
  const references = [];
  for (const element of sensitive) {
    const activityCode = String(element.id).match(/(\d+)$/)?.[1] ?? '';
    for (const reference of await findProjectNodeReferences(context.session.filePath, text, element.id, activityCode)) {
      if (!ownScripts.has(reference.file)) references.push(`${element.id} em ${reference.relativePath}:${reference.line}`);
    }
  }
  if (references.length) {
    throw new Error(`Há referências externas prováveis: ${references.slice(0, 8).join(', ')}. Revise-as antes de excluir.`);
  }
  return { ...result, fileEffects: [...ownScripts].map((file) => ({ kind: 'delete', file })) };
}

/**
 * Aplica as operações em ordem sobre o texto e devolve o texto final, sem tocar no disco.
 * `as` dá nome ao elemento criado, e `$nome` (ou `$nome.flow`) o cita nas operações seguintes.
 * @param {object} session
 * @param {Array<Record<string, unknown>>} requested
 * @param {string} templateText
 */
async function applyOperations(session, requested, templateText) {
  if (!Array.isArray(requested) || !requested.length) throw new Error('Informe uma lista com pelo menos uma operação.');
  const aliases = new Map();
  const outcomes = [];
  const fileEffects = [];
  // Como o editor ao abrir o arquivo: FMT-002 travaria todas as operações.
  const diagramName = patcher.patchDiagramName(session.text);
  let text = diagramName.changed ? diagramName.text : session.text;
  const context = {
    session,
    templateText,
    scene: (current) => {
      const model = parseProcess(current);
      return toWebviewData(model, validateProcess(model), {});
    }
  };
  for (const [index, raw] of requested.entries()) {
    const type = String(raw?.type ?? '');
    const operation = Object.hasOwn(OPERATIONS, type) ? OPERATIONS[type] : null;
    try {
      if (!operation) throw new Error(`Operação desconhecida: ${type || '(sem type)'}. Liste as disponíveis com "ops".`);
      const op = resolveAliases(raw, aliases);
      let result = await operation.run(text, op, context);
      const created = createdIds(result);
      if (op.properties && created.elementId) {
        const named = patcher.patchProcess(result.text, created.elementId, op.properties);
        result = { ...result, text: named.text };
      }
      if (op.flowProperties && created.flowId) {
        const named = patcher.patchProcess(result.text, created.flowId, op.flowProperties);
        result = { ...result, text: named.text };
      }
      if (raw.as) {
        if (!created.elementId) throw new Error(`"as" só nomeia operações que criam um elemento.`);
        aliases.set(String(raw.as), created);
      }
      fileEffects.push(...(result.fileEffects ?? []));
      outcomes.push({ index, type, changed: result.text !== text, ...outcomeDetails(result, created) });
      text = result.text;
    } catch (error) {
      throw Object.assign(new Error(`Operação ${index} (${type || 'sem type'}) recusada: ${error.message} Nada foi gravado.`), {
        operationIndex: index,
        passedBefore: outcomes
      });
    }
  }
  return {
    text,
    outcomes,
    fileEffects,
    aliases: Object.fromEntries(aliases),
    repairs: diagramName.changed ? [`Nome do diagrama ajustado para o código do processo (${diagramName.code}).`] : []
  };
}

function resolveAliases(value, aliases) {
  if (typeof value === 'string') {
    const match = value.match(/^\$([A-Za-z_][A-Za-z0-9_]*)(\.flow)?$/);
    if (!match) return value;
    const created = aliases.get(match[1]);
    if (!created) throw new Error(`Nome não definido por "as": ${value}.`);
    const id = match[2] ? created.flowId : created.elementId;
    if (!id) throw new Error(`${value} não existe: a operação "${match[1]}" não criou fluxo.`);
    return id;
  }
  if (Array.isArray(value)) return value.map((item) => resolveAliases(item, aliases));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === 'as' ? item : resolveAliases(item, aliases)]));
  }
  return value;
}

function createdIds(result) {
  const elementId = result.taskId ?? result.gatewayId ?? result.eventId ?? result.newId ?? result.elementId ?? '';
  const flowId = result.flowId ?? '';
  // createConnection devolve só o fluxo; ele é o elemento criado.
  return elementId ? { elementId, flowId } : { elementId: flowId, flowId };
}

function outcomeDetails(result, created) {
  const details = {};
  if (created.elementId) details.elementId = created.elementId;
  if (created.flowId && created.flowId !== created.elementId) details.flowId = created.flowId;
  for (const key of ['oldId', 'newActivityId', 'removedFlowIds', 'elementIds', 'fileName', 'notice']) {
    if (result[key] !== undefined && result[key] !== '') details[key] = result[key];
  }
  if (result.fileEffects?.length) {
    details.files = result.fileEffects.map((effect) => `${effect.kind} ${path.basename(effect.file)}`);
  }
  return details;
}

module.exports = { OPERATIONS, UI_ONLY_MESSAGES, applyOperations };
