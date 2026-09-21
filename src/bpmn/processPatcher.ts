'use strict';

const { decodeXml, descendants, encodeXmlAttribute, tokenizeXml, walk } = require('./xmlTokenizer');
const { parseProcess } = require('./processModel');
const { validateProcess } = require('./processValidator');
const { buildGatewayConditionXml, serializeTaskAssignmentConfiguration } = require('./gatewayConditions');
const { supportsTaskAssignment } = require('./taskAssignment');
const { supportsProcessManager } = require('./processManager');
const { patchEventTriggerData, supportsEventTrigger } = require('./eventTrigger');
const { serializeInitializerConfiguration, supportsEventInitializer } = require('./eventInitializer');
const { supportsTaskNotifications } = require('./taskNotifications');
const { normalizeTaskJointConfiguration, supportsTaskJoint } = require('./taskJoint');
const {
  normalizeTaskDeadlineConfiguration,
  supportsTaskDeadline
} = require('./taskDeadline');
const {
  normalizeTaskMobileConfiguration,
  patchTaskMobileConfiguration,
  serializeTaskMobileConfiguration,
  supportsTaskMobile,
  taskMobileActionOptions,
  taskMobileValues
} = require('./taskMobile');
const {
  attachmentRuleValues,
  normalizeAttachmentRules,
  serializeAttachmentRules,
  supportsTaskAttachmentRules
} = require('./taskAttachmentRules');
const {
  extendedPropertyValues,
  normalizeExtendedProperties,
  serializeExtendedProperties,
  supportsExtendedProperties
} = require('./extendedProperties');
const {
  expectedTaskScriptFileName,
  supportsTaskScript,
  taskScriptTemplate
} = require('./taskScript');
const {
  normalizeProcessGeneralConfiguration,
  supportsProcessGeneral
} = require('./processGeneral');
const { assertDistinctProcessCode } = require('./processIdentity');
const {
  normalizeProcessVersionConfiguration,
  supportsProcessVersion
} = require('./processVersion');
const {
  descriptorFieldValues,
  normalizeProcessFormConfiguration,
  serializeDescriptorFields,
  supportsProcessForm
} = require('./processForm');
const {
  normalizeSubProcessFormMaps,
  parseSubProcessFormMaps,
  serializeSubProcessFormMaps,
  supportsSubProcessFormMaps
} = require('./subProcessFormMap');
const {
  normalizeProcessAttachmentSecurity,
  parseProcessAttachmentSecurity,
  serializeProcessAttachmentSecurity,
  supportsProcessAttachmentSecurity
} = require('./processAttachmentSecurity');

const ALLOWED_PROPERTIES = {
  BpmnProcess: new Set(),
  BpmnPool: new Set(['name']),
  BpmnSwimLane: new Set(['name', 'cores']),
  BpmnTask: new Set([
    'name', 'instrucoes', 'digitalSignature', 'confirmarSenha',
    'inibeOpcaoTransferir'
  ]),
  BpmnGateway: new Set(['name']),
  BpmnStartEvent: new Set(['name']),
  BpmnEndEvent: new Set(['name', 'notificaRequisitante']),
  BpmnIntermediateEvent: new Set(['name']),
  BpmnSubProcess: new Set(['name', 'transferAttachments', 'cancelSubProcess', 'sendToNextTaskInSubProcess']),
  BpmnAnnotation: new Set(['name']),
  BpmnDatabase: new Set(['name']),
  BpmnDocument: new Set(['name', 'documentId']),
  BpmnGroup: new Set(['name']),
  SequenceFlow: new Set([
    'name', 'atividadeFluxo', 'atividadeRetorno', 'permiteRetorno', 'fluxoAutomatico',
    'defaultLink', 'movementTitle', 'movementDescription', 'movementAccessLinkDescription'
  ])
};

const SUBTYPE_ALLOWED_PROPERTIES = new Map([
  ['BpmnStartEvent:14', new Set(['name', 'signalId'])],
  ['BpmnEndEvent:64', new Set(['name', 'notificaRequisitante', 'signalId'])],
  ['BpmnIntermediateEvent:36', new Set(['name', 'linkId'])],
  ['BpmnIntermediateEvent:37', new Set(['name', 'signalId'])],
  ['BpmnIntermediateEvent:41', new Set(['name', 'signalId'])],
  ['BpmnTask:82', new Set([
    'name', 'executionType', 'executionAttempts', 'frequency', 'frequencyType',
    'executionSucessfulMessage', 'serviceName'
  ])],
  ['BpmnTask:84', new Set([
    'name', 'messageType', 'messageReceiver', 'messageSubject', 'messageContent'
  ])],
  ['BpmnTask:85', new Set(['name'])],
  ['BpmnTask:86', new Set(['name', 'authNotify', 'serviceName'])],
  ['BpmnTask:87', new Set(['name', 'authNotify'])],
  ['BpmnSubProcess:100', new Set([
    'name', 'process', 'transferAttachments', 'cancelSubProcess', 'sendToNextTaskInSubProcess'
  ])],
  ['BpmnSubProcess:101', new Set(['name', 'instructions', 'initialTask'])]
]);

// Preserve these attributes in the Fluig XML, but keep them out of the visual
// editor while effort management is disabled. The global deny-list also
// protects element subtypes added in the future.
const DISABLED_EDITABLE_PROPERTIES = new Set([
  'esforcoCalculo',
  'esforcoPrevisto'
]);

const BOOLEAN_PROPERTIES = new Set([
  'authNotify', 'digitalSignature', 'confirmarSenha', 'inibeOpcaoTransferir',
  'atividadeConjunta',
  'notificaRequisitante', 'emAtrasoNotificarResponsavel', 'emAtrasoNotificarRequisitante',
  'transferAttachments', 'cancelSubProcess',
  'sendToNextTaskInSubProcess', 'initialTask', 'permiteRetorno', 'fluxoAutomatico', 'defaultLink',
  'uniquecardversion', 'inheritFormSecurity', 'updateAttachment', 'counterSign', 'mobileReady',
  'controlsAttachmentsSecurity'
]);

const MESSAGE_DATA_PROPERTIES = new Map([
  ['messageType', 'type'],
  ['messageReceiver', 'receiver'],
  ['messageSubject', 'subject'],
  ['messageContent', 'content']
]);

const TASK_TYPE_CONVERSIONS = Object.freeze({
  '80': { prefix: 'task', label: 'atividade', imageId: '' },
  '81': { prefix: 'usertask', label: 'atividade de usuário', imageId: 'com.totvs.tds.ecm.designer.task.user' },
  '82': { prefix: 'servicetask', label: 'atividade de serviço', imageId: 'com.totvs.tds.ecm.designer.task.service' },
  '84': { prefix: 'mailtask', label: 'envio de e-mail', imageId: 'com.totvs.tds.ecm.designer.task.mail' },
  '85': { prefix: 'manualtask', label: 'atividade manual', imageId: 'com.totvs.tds.ecm.designer.task.manual' },
  '86': { prefix: 'businessruletask', label: 'atividade de negócio', imageId: 'com.totvs.tds.ecm.designer.task.businessrule' },
  '87': { prefix: 'scripttask', label: 'atividade de script', imageId: 'com.totvs.tds.ecm.designer.task.script' }
});

function allowedPropertiesFor(element) {
  const configured = SUBTYPE_ALLOWED_PROPERTIES.get(`${element.tag}:${element.type}`)
    ?? ALLOWED_PROPERTIES[element.tag]
    ?? new Set();
  return new Set([...configured].filter((property) => !DISABLED_EDITABLE_PROPERTIES.has(property)));
}

function patchProcess(text, elementId, requestedChanges) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da edição.`);
  }

  const element = [...model.elements, ...model.flows].find((item) => item.id === elementId);
  if (!element) throw new Error(`Elemento não encontrado: ${elementId}.`);
  const allowed = allowedPropertiesFor(element);
  const changes = Object.entries(requestedChanges ?? {});
  if (changes.length === 0) return { text, changed: false, model, validation: beforeValidation, patches: [] };

  const patches = [];
  const messageChanges = new Map();
  for (const [property, inputValue] of changes) {
    if (!allowed.has(property)) {
      throw new Error(`Propriedade ${property} não pode ser editada em ${element.tag}.`);
    }
    const value = property === 'linkId'
      ? normalizeIntermediateLinkTarget(model, element, inputValue)
      : normalizeValue(property, inputValue);
    if (MESSAGE_DATA_PROPERTIES.has(property)) {
      messageChanges.set(MESSAGE_DATA_PROPERTIES.get(property), value);
      continue;
    }
    if (property === 'linkId' && value === '' && element.node.attributeMap.linkId) {
      patches.push(removalPatch(text, element.node, element.node.attributeMap.linkId));
    } else {
      patchAttribute(text, element.node, property, value, patches);
    }

    if (property === 'cores' && element.tag === 'BpmnSwimLane') {
      patchSwimLaneVisualColor(text, model, element, value, patches);
    }

    if (property === 'name' && element.tag === 'SequenceFlow') {
      patchAttribute(text, element.connection?.labelNode, 'value', value, patches, { required: true });
    } else if (property === 'name') {
      patchMaterializedShapeLabel(text, element, value, patches);
    }
  }

  if (messageChanges.size) {
    const messageData = element.attributes.messageData;
    if (!messageData) throw new Error('A atividade de e-mail não possui o bloco messageData do Fluig.');
    patchAttribute(text, element.node, 'messageData', patchMessageData(messageData, messageChanges), patches);
  }

  const uniquePatches = deduplicatePatches(coalesceNotificationPatches(patches));
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`A edição foi recusada porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  return {
    text: updatedText,
    changed: updatedText !== text,
    model: updatedModel,
    validation,
    patches: uniquePatches
  };
}

function normalizeIntermediateLinkTarget(model, element, inputValue) {
  if (element.tag !== 'BpmnIntermediateEvent' || element.type !== '36') {
    throw new Error('Somente o evento intermediário de envio de link pode selecionar um receptor.');
  }
  const linkId = String(inputValue ?? '').trim();
  if (!linkId || linkId === '0') return '';
  const target = model.elements.find((item) => item.id === linkId);
  if (!target || target.tag !== 'BpmnIntermediateEvent' || target.type !== '42') {
    throw new Error(`Evento receptor de link inválido: ${linkId}. Selecione um evento intermediário de recebimento de link.`);
  }
  return linkId;
}

function patchProcessManager(text, elementId, requestedAssignment) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da edicao do gestor.`);
  }
  const element = model.process;
  if (!element || element.id !== String(elementId ?? '') || !supportsProcessManager(element)) {
    throw new Error(`Processo nao encontrado: ${elementId || '(sem id)'}.`);
  }
  const mechanism = String(requestedAssignment?.mechanism ?? '').trim();
  const configuration = requestedAssignment?.mechanismConfiguration ?? null;
  const patches = [];
  patchAttribute(text, element.node, 'managerMechanism', mechanism, patches, { required: true });
  if (mechanism) {
    patchAttribute(
      text,
      element.node,
      'managerAssignmentController',
      serializeTaskAssignmentConfiguration(mechanism, configuration),
      patches,
      { required: true }
    );
  } else {
    removeAttribute(text, element.node, 'managerAssignmentController', patches);
  }
  const uniquePatches = deduplicatePatches(coalesceNotificationPatches(patches));
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`O gestor foi recusado porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  return { text: updatedText, changed: updatedText !== text, model: updatedModel, validation, patches: uniquePatches };
}

function patchProcessGeneral(text, elementId, requestedConfiguration, catalogs = {}) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da edição geral do processo.`);
  }
  const element = model.process;
  if (!element || element.id !== String(elementId ?? '') || !supportsProcessGeneral(element)) {
    throw new Error(`Processo não encontrado: ${elementId || '(sem id)'}.`);
  }
  const normalized = normalizeProcessGeneralConfiguration(
    requestedConfiguration,
    catalogs,
    element.attributes
  );
  const patches = [];
  patchAttribute(text, element.node, 'id', normalized.code, patches, { required: true });
  patchAttribute(text, model.diagram, 'name', normalized.code, patches, { required: true });
  patchAttribute(text, element.node, 'serverId', normalized.serverId, patches, { required: true });
  patchAttribute(text, element.node, 'name', normalized.description, patches, { required: true });
  patchAttribute(text, element.node, 'instruction', normalized.instruction, patches, { required: true });
  patchAttribute(text, element.node, 'category', normalized.category, patches, { required: true });
  patchAttribute(text, element.node, 'volume', normalized.volume, patches, { required: true });
  patchAttribute(text, element.node, 'expedient', normalized.expedient, patches, { required: true });
  patchOptionalProcessDuration(text, element.node, 'deadlineTime', normalized.deadlineTime, patches);
  patchOptionalProcessDuration(text, element.node, 'warningTime', normalized.warningTime, patches);
  if (normalized.complements) {
    patchProcessComplements(text, element.node, normalized.complements, patches);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, 'active')) {
    if (normalized.active) removeAttribute(text, element.node, 'activeProcess', patches);
    else patchAttribute(text, element.node, 'activeProcess', 'false', patches);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, 'publicProcess')) {
    patchOptionalTrueAttribute(text, element.node, 'publicProcess', normalized.publicProcess, patches);
  }
  const uniquePatches = deduplicatePatches(coalesceNotificationPatches(patches));
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`As propriedades gerais foram recusadas porque produziriam ${validation.errors.length} erro(s) estrutural(is).`);
  }
  return { text: updatedText, changed: updatedText !== text, model: updatedModel, validation, patches: uniquePatches };
}

function patchProcessIdentity(text, expectedCode, requestedCode) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da renomeacao do processo.`);
  }
  const element = model.process;
  if (!element || element.id !== String(expectedCode ?? '') || !supportsProcessGeneral(element)) {
    throw new Error(`Processo nao encontrado: ${expectedCode || '(sem id)'}.`);
  }
  const code = assertDistinctProcessCode(element.id, requestedCode);
  if (code === element.id) {
    return { text, changed: false, model, validation: beforeValidation, patches: [] };
  }
  const patches = [];
  patchAttribute(text, element.node, 'id', code, patches, { required: true });
  patchAttribute(text, model.diagram, 'name', code, patches, { required: true });
  const uniquePatches = deduplicatePatches(patches);
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`A renomeacao foi recusada porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  return { text: updatedText, changed: true, model: updatedModel, validation, patches: uniquePatches };
}

function patchProcessComplements(text, node, complements, patches) {
  if (!complements.enabled) {
    // The Studio hides these settings when complements are disabled. Preserve
    // them so toggling the main option does not silently erase user choices.
    removeAttribute(text, node, 'complementsLevel', patches);
    return;
  }
  patchAttribute(text, node, 'complementsLevel', complements.level, patches);
  patchOptionalTrueAttribute(text, node, 'notifyResponsibleComplements', complements.notifyResponsible, patches);
  patchOptionalTrueAttribute(text, node, 'notifyRequisitionerComplements', complements.notifyRequisitioner, patches);
  patchOptionalTrueAttribute(text, node, 'notifyManagerComplements', complements.notifyManager, patches);
}

function patchOptionalTrueAttribute(text, node, name, enabled, patches) {
  if (enabled) patchAttribute(text, node, name, 'true', patches);
  else removeAttribute(text, node, name, patches);
}

function patchProcessVersion(text, elementId, requestedConfiguration) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da edição da versão.`);
  }
  const element = model.process;
  if (!element || element.id !== String(elementId ?? '') || !supportsProcessVersion(element)) {
    throw new Error(`Processo não encontrado: ${elementId || '(sem id)'}.`);
  }
  const normalized = normalizeProcessVersionConfiguration(requestedConfiguration);
  const patches = [];
  patchAttribute(text, element.node, 'descriptionVersion', normalized.instructions, patches);
  patchAttribute(text, element.node, 'updateAttachment', normalized.updateAttachment ? 'true' : 'false', patches);
  patchAttribute(text, element.node, 'counterSign', normalized.confirmPassword ? 'true' : 'false', patches);
  patchAttribute(text, element.node, 'mobileReady', normalized.mobileProcess ? 'true' : 'false', patches);
  const uniquePatches = deduplicatePatches(coalesceNotificationPatches(patches));
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`As propriedades da versão foram recusadas porque produziriam ${validation.errors.length} erro(s) estrutural(is).`);
  }
  return { text: updatedText, changed: updatedText !== text, model: updatedModel, validation, patches: uniquePatches };
}

function patchProcessForm(text, elementId, requestedConfiguration, catalogs = {}) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da edição do formulário.`);
  }
  const element = model.process;
  if (!element || element.id !== String(elementId ?? '') || !supportsProcessForm(element)) {
    throw new Error(`Processo não encontrado: ${elementId || '(sem id)'}.`);
  }
  if (element.attributes.descriptorFields !== undefined) {
    // Recusa reserializar estruturas XStream desconhecidas.
    descriptorFieldValues(element.attributes.descriptorFields);
  }
  const normalized = normalizeProcessFormConfiguration(
    requestedConfiguration,
    catalogs.localForms ?? [],
    element.attributes
  );
  const patches = [];
  patchAttribute(text, element.node, 'formSource', normalized.source, patches, { required: true });
  patchAttribute(text, element.node, 'cardIndex', normalized.cardIndex, patches, { required: true });
  patchAttribute(text, element.node, 'uniquecardversion', normalized.uniqueCardVersion ? 'true' : 'false', patches);
  patchAttribute(text, element.node, 'inheritFormSecurity', normalized.inheritFormSecurity ? 'true' : 'false', patches);
  if (normalized.descriptorFields.length) {
    patchAttribute(
      text,
      element.node,
      'descriptorFields',
      serializeDescriptorFields(normalized.descriptorFields),
      patches,
      { required: true, preserveGreaterThan: true }
    );
  } else {
    removeAttribute(text, element.node, 'descriptorFields', patches);
  }
  const uniquePatches = deduplicatePatches(coalesceNotificationPatches(patches));
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`O formulário do processo foi recusado porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  return { text: updatedText, changed: updatedText !== text, model: updatedModel, validation, patches: uniquePatches };
}

function patchProcessAttachmentSecurity(text, elementId, requestedConfiguration) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da edição da segurança de anexos.`);
  }
  const element = model.process;
  if (!element || element.id !== String(elementId ?? '') || !supportsProcessAttachmentSecurity(element)) {
    throw new Error(`Processo não encontrado: ${elementId || '(sem id)'}.`);
  }
  if (element.attributes.processAttachmentSecurity !== undefined) {
    parseProcessAttachmentSecurity(element.attributes.processAttachmentSecurity);
  }
  const normalized = normalizeProcessAttachmentSecurity(requestedConfiguration, element);
  const patches = [];
  patchAttribute(
    text,
    element.node,
    'controlsAttachmentsSecurity',
    normalized.controlled ? 'true' : 'false',
    patches
  );
  if (normalized.controlled) {
    patchAttribute(
      text,
      element.node,
      'processAttachmentSecurity',
      serializeProcessAttachmentSecurity(normalized.rules),
      patches,
      { required: true, preserveGreaterThan: true }
    );
  } else {
    removeAttribute(text, element.node, 'processAttachmentSecurity', patches);
  }
  const uniquePatches = deduplicatePatches(coalesceNotificationPatches(patches));
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`A segurança de anexos foi recusada porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  return { text: updatedText, changed: updatedText !== text, model: updatedModel, validation, patches: uniquePatches };
}

function patchOptionalProcessDuration(text, node, name, value, patches) {
  if (value === '0.0') {
    removeAttribute(text, node, name, patches);
    return;
  }
  patchAttribute(text, node, name, value, patches, { required: true });
}

function patchTaskScriptReference(text, elementId) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da criação do script.`);
  }
  const element = model.elements.find((item) => item.id === String(elementId ?? ''));
  if (!element || !supportsTaskScript(element)) {
    throw new Error(`O elemento ${elementId || '(sem id)'} não aceita script de tarefa.`);
  }
  const processId = String(model.process?.id ?? '').trim();
  const fileName = expectedTaskScriptFileName(processId, element.id);
  const configured = String(element.attributes.scriptFileName ?? '').trim();
  if (configured && configured !== fileName) {
    throw new Error(`A referência scriptFileName de ${element.id} diverge do padrão seguro ${fileName}.`);
  }
  const patches = [];
  if (!configured) patchAttribute(text, element.node, 'scriptFileName', fileName, patches);
  const uniquePatches = deduplicatePatches(patches);
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`A referência do script foi recusada porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  return {
    text: updatedText,
    changed: updatedText !== text,
    fileName,
    template: taskScriptTemplate(element),
    model: updatedModel,
    validation,
    patches: uniquePatches
  };
}

function patchTaskAssignment(text, elementId, requestedAssignment) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da edição da atribuição.`);
  }
  const element = model.elements.find((item) => item.id === String(elementId ?? ''));
  if (!element || !supportsTaskAssignment(element)) {
    throw new Error(`O elemento ${elementId || '(sem id)'} não aceita mecanismo de atribuição nesta configuração.`);
  }
  const mechanism = String(requestedAssignment?.mechanism ?? '').trim();
  const configuration = requestedAssignment?.mechanismConfiguration ?? null;
  const patches = [];
  patchAttribute(text, element.node, 'managerMechanism', mechanism, patches);
  if (mechanism) {
    const serialized = serializeTaskAssignmentConfiguration(mechanism, configuration);
    patchAttribute(text, element.node, 'managerAssignmentControllerString', serialized, patches);
  } else {
    removeAttribute(text, element.node, 'managerAssignmentControllerString', patches);
  }
  const uniquePatches = deduplicatePatches(patches);
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`A atribuição foi recusada porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  return {
    text: updatedText,
    changed: updatedText !== text,
    model: updatedModel,
    validation,
    patches: uniquePatches
  };
}

function patchEventTrigger(text, elementId, requestedTrigger) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da edição do temporizador.`);
  }
  const element = model.elements.find((item) => item.id === String(elementId ?? ''));
  if (!element || !supportsEventTrigger(element)) {
    throw new Error(`O elemento ${elementId || '(sem id)'} não aceita agenda Quartz.`);
  }
  const patches = [];
  patchAttribute(
    text,
    element.node,
    'trigger',
    patchEventTriggerData(element.attributes.trigger, requestedTrigger),
    patches,
    { required: true }
  );
  const uniquePatches = deduplicatePatches(patches);
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`A agenda foi recusada porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  return {
    text: updatedText,
    changed: updatedText !== text,
    model: updatedModel,
    validation,
    patches: uniquePatches
  };
}

function patchEventInitializer(text, elementId, requestedInitializer) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da edição do inicializador.`);
  }
  const element = model.elements.find((item) => item.id === String(elementId ?? ''));
  if (!element || !supportsEventInitializer(element)) {
    throw new Error(`O elemento ${elementId || '(sem id)'} não aceita inicializador.`);
  }
  const userId = String(requestedInitializer?.userId ?? '').trim();
  const patches = [];
  if (userId) {
    patchAttribute(
      text,
      element.node,
      'initializerConfiguration',
      serializeInitializerConfiguration(userId),
      patches,
      { required: true }
    );
  } else {
    removeAttribute(text, element.node, 'initializerConfiguration', patches);
  }
  const uniquePatches = deduplicatePatches(patches);
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`O inicializador foi recusado porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  return {
    text: updatedText,
    changed: updatedText !== text,
    model: updatedModel,
    validation,
    patches: uniquePatches
  };
}

function patchTaskNotifications(text, elementId, requestedConfiguration) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da edição das notificações.`);
  }
  const element = model.elements.find((item) => item.id === String(elementId ?? ''));
  if (!element || !supportsTaskNotifications(element)) {
    throw new Error(`O elemento ${elementId || '(sem id)'} não aceita acompanhamento e atraso.`);
  }
  const requested = requestedConfiguration ?? {};
  const patches = [];
  patchDefaultFalseBoolean(text, element.node, 'authNotify', requested.notifyResponsible, patches);
  patchDefaultFalseBoolean(text, element.node, 'notificaRequisitante', requested.notifyRequester, patches);

  const responsibleTimingNames = [
    ['emAtrasoNotificarResponsavelTolerancia', 'lateResponsibleTolerance'],
    ['emAtrasoNotificarResponsavelFrequencia', 'lateResponsibleFrequency'],
    ['noticeExpirationAuthorityTime', 'lateResponsibleExpiration']
  ];
  const requesterTimingNames = [
    ['emAtrasoNotificarRequisitanteTolerancia', 'lateRequesterTolerance'],
    ['emAtrasoNotificarRequisitanteFrequencia', 'lateRequesterFrequency'],
    ['noticeExpirationRequisitionerTime', 'lateRequesterExpiration']
  ];
  const responsibleTimingPresent = responsibleTimingNames.some(([attribute]) => element.attributes[attribute] !== undefined);
  const lateResponsibleEnabled = requested.lateResponsible === true || requested.lateResponsible === 'true';
  const lateRequesterEnabled = requested.lateRequester === true || requested.lateRequester === 'true';
  patchDefaultTrueBoolean(
    text,
    element.node,
    'emAtrasoNotificarResponsavel',
    lateResponsibleEnabled,
    responsibleTimingPresent,
    patches
  );
  patchDefaultFalseBoolean(text, element.node, 'emAtrasoNotificarRequisitante', requested.lateRequester, patches);
  patchNotificationTimings(text, element, responsibleTimingNames, requested, lateResponsibleEnabled, patches);
  patchNotificationTimings(text, element, requesterTimingNames, requested, lateRequesterEnabled, patches);

  const uniquePatches = coalesceNotificationPatches(patches);
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`A edição foi recusada porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  return { text: updatedText, changed: updatedText !== text, model: updatedModel, validation, patches: uniquePatches };
}

function patchTaskJoint(text, elementId, requestedConfiguration) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da edição conjunta.`);
  }
  const element = model.elements.find((item) => item.id === String(elementId ?? ''));
  if (!element || !supportsTaskJoint(element)) {
    throw new Error(`O elemento ${elementId || '(sem id)'} não aceita atividade conjunta.`);
  }
  const currentSelectionMode = String(element.attributes.selecionaColaboradores ?? '1');
  if (!['1', '2'].includes(currentSelectionMode)) {
    throw new Error(`Modo selecionaColaboradores desconhecido: ${currentSelectionMode}.`);
  }
  const configuration = normalizeTaskJointConfiguration(requestedConfiguration);
  const patches = [];
  patchAttribute(text, element.node, 'atividadeConjunta', configuration.joint ? 'true' : 'false', patches);
  if (configuration.joint) {
    patchAttribute(text, element.node, 'consenso', configuration.consensus, patches);
  } else {
    removeAttribute(text, element.node, 'consenso', patches);
  }
  patchAttribute(text, element.node, 'selecionaColaboradores', configuration.selectionMode, patches, { required: true });

  const uniquePatches = coalesceNotificationPatches(patches);
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`A atividade conjunta foi recusada porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  return { text: updatedText, changed: updatedText !== text, model: updatedModel, validation, patches: uniquePatches };
}

function patchTaskDeadline(text, elementId, requestedConfiguration, catalogs = {}) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da edição do prazo.`);
  }
  const element = model.elements.find((item) => item.id === String(elementId ?? ''));
  if (!element || !supportsTaskDeadline(element)) {
    throw new Error(`O elemento ${elementId || '(sem id)'} não aceita expediente e prazo de conclusão.`);
  }
  if (element.attributes.deadlineFieldName && element.attributes.prazoConclusao) {
    throw new Error('O elemento possui prazo fixo e campo de prazo ao mesmo tempo. Corrija o XML antes de editar.');
  }
  const configuration = normalizeTaskDeadlineConfiguration(
    requestedConfiguration,
    catalogs,
    element.attributes
  );
  const patches = [];
  patchAttribute(text, element.node, 'expediente', configuration.expedient, patches, { required: true });
  if (configuration.mode === 'form') {
    removeAttribute(text, element.node, 'prazoConclusao', patches);
    patchAttribute(text, element.node, 'deadlineFieldName', configuration.deadlineFieldName, patches, { required: true });
  } else {
    removeAttribute(text, element.node, 'deadlineFieldName', patches);
    if (configuration.prazoConclusao) {
      patchAttribute(text, element.node, 'prazoConclusao', configuration.prazoConclusao, patches);
    } else {
      removeAttribute(text, element.node, 'prazoConclusao', patches);
    }
  }
  const uniquePatches = coalesceNotificationPatches(patches);
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`O prazo foi recusado porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  return { text: updatedText, changed: updatedText !== text, model: updatedModel, validation, patches: uniquePatches };
}

function patchTaskMobile(text, elementId, requestedConfiguration) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da edição Mobile.`);
  }
  const element = model.elements.find((item) => item.id === String(elementId ?? ''));
  if (!element || !supportsTaskMobile(element)) {
    throw new Error(`O elemento ${elementId || '(sem id)'} não aceita configuração Mobile.`);
  }
  const businessById = new Map([...model.elements, ...model.flows].map((item) => [item.id, item]));
  const options = taskMobileActionOptions(element, model.flows, businessById);
  const current = element.attributes.appsConfiguration;
  const currentValues = taskMobileValues(current);
  for (const value of [currentValues.approve, currentValues.reject]) {
    if (value && !options.some((option) => option.value === value)) options.push({ value, label: value });
  }
  const configuration = normalizeTaskMobileConfiguration(requestedConfiguration, options);
  const serialized = current
    ? patchTaskMobileConfiguration(current, configuration)
    : serializeTaskMobileConfiguration(configuration);
  const patches = [];
  patchAttribute(text, element.node, 'appsConfiguration', serialized, patches, { required: true });
  const uniquePatches = deduplicatePatches(patches);
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`A edição Mobile foi recusada porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  return { text: updatedText, changed: updatedText !== text, model: updatedModel, validation, patches: uniquePatches };
}

function patchTaskAttachmentRules(text, elementId, requestedRules) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da edição das regras de anexo.`);
  }
  const element = model.elements.find((item) => item.id === String(elementId ?? ''));
  if (!element || !supportsTaskAttachmentRules(element)) {
    throw new Error(`O elemento ${elementId || '(sem id)'} não aceita regras de anexo.`);
  }
  if (element.attributes.attachmentRules) attachmentRuleValues(element.attributes.attachmentRules);
  const rules = normalizeAttachmentRules(requestedRules);
  const patches = [];
  if (rules.length) {
    patchAttribute(text, element.node, 'attachmentRules', serializeAttachmentRules(rules), patches, { required: true });
  } else {
    removeAttribute(text, element.node, 'attachmentRules', patches);
  }
  const uniquePatches = deduplicatePatches(patches);
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`As regras de anexo foram recusadas porque produziriam ${validation.errors.length} erro(s) estrutural(is).`);
  }
  return { text: updatedText, changed: updatedText !== text, model: updatedModel, validation, patches: uniquePatches };
}

function patchSubProcessFormMaps(text, elementId, requestedMaps, catalogs = {}) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da edicao dos campos do subprocesso.`);
  }
  const element = model.elements.find((item) => item.id === String(elementId ?? ''));
  if (!element || !supportsSubProcessFormMaps(element)) {
    throw new Error(`O elemento ${elementId || '(sem id)'} nao aceita mapeamento de campos de subprocesso.`);
  }
  if (!String(element.attributes.process ?? '').trim()) {
    throw new Error('Selecione e aplique primeiro o subprocesso de destino.');
  }
  if (element.attributes.formMaps !== undefined) parseSubProcessFormMaps(element.attributes.formMaps);
  const maps = normalizeSubProcessFormMaps(
    requestedMaps,
    catalogs.parentFields,
    catalogs.childFields
  );
  const patches = [];
  if (maps.length) {
    patchAttribute(text, element.node, 'formMaps', serializeSubProcessFormMaps(maps), patches, { required: true });
  } else {
    removeAttribute(text, element.node, 'formMaps', patches);
  }
  const uniquePatches = deduplicatePatches(patches);
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`Os campos do subprocesso foram recusados porque produziriam ${validation.errors.length} erro(s) estrutural(is).`);
  }
  return { text: updatedText, changed: updatedText !== text, model: updatedModel, validation, patches: uniquePatches };
}

function patchExtendedProperties(text, elementId, requestedProperties) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da edição dos atributos de extensão.`);
  }
  const element = [...model.elements, ...model.flows]
    .find((item) => item.id === String(elementId ?? ''));
  if (!element || !supportsExtendedProperties(element)) {
    throw new Error(`O elemento ${elementId || '(sem id)'} não aceita atributos de extensão.`);
  }
  const current = element.attributes.extendedFields;
  if (current !== undefined) extendedPropertyValues(current);
  const properties = normalizeExtendedProperties(requestedProperties);
  const patches = [];
  if (properties.length || current !== undefined) {
    patchAttribute(text, element.node, 'extendedFields', serializeExtendedProperties(properties), patches, { required: true });
  }
  const uniquePatches = deduplicatePatches(patches);
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`Os atributos de extensão foram recusados porque produziriam ${validation.errors.length} erro(s) estrutural(is).`);
  }
  return { text: updatedText, changed: updatedText !== text, model: updatedModel, validation, patches: uniquePatches };
}

function coalesceNotificationPatches(patches) {
  const bySpan = new Map();
  for (const patch of patches) {
    const key = `${patch.start}:${patch.end}`;
    const existing = bySpan.get(key);
    if (existing && patch.start === patch.end) {
      existing.value += patch.value;
    } else {
      bySpan.set(key, { ...patch });
    }
  }
  return [...bySpan.values()];
}

function patchNotificationTimings(text, element, definitions, requested, enabled, patches) {
  const hasExisting = definitions.some(([attribute]) => element.attributes[attribute] !== undefined);
  if (!enabled && !hasExisting) return;
  for (const [attribute, property] of definitions) {
    patchAttribute(text, element.node, attribute, durationToMinutes(requested[property]), patches);
  }
}

function patchDefaultFalseBoolean(text, node, name, enabled, patches) {
  patchAttribute(text, node, name, enabled ? 'true' : 'false', patches);
}

function patchDefaultTrueBoolean(text, node, name, enabled, materializeFalse, patches) {
  const attribute = node.attributeMap[name];
  if (enabled) {
    if (attribute) patches.push(removalPatch(text, node, attribute));
    return;
  }
  if (attribute) {
    patches.push({ start: attribute.valueStart, end: attribute.valueEnd, value: 'false' });
    return;
  }
  if (!materializeFalse) return;
  let insertion = node.openEnd - 1;
  while (insertion > node.start && /\s/.test(text[insertion - 1])) insertion -= 1;
  if (text[insertion - 1] === '/') insertion -= 1;
  patches.push({ start: insertion, end: insertion, value: ` ${name}="false"` });
}

function patchGatewayBranches(text, gatewayId, requestedConfiguration) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da edição do gateway.`);
  }
  const gateway = model.elements.find((item) => item.id === String(gatewayId ?? ''));
  if (!gateway || gateway.tag !== 'BpmnGateway') throw new Error(`Gateway não encontrado: ${gatewayId || '(sem id)'}.`);
  if (!['120', '121'].includes(String(gateway.type))) {
    throw new Error('Somente gateways exclusivos e inclusivos possuem condições editáveis.');
  }
  if (!requestedConfiguration || !Array.isArray(requestedConfiguration.conditions)) {
    throw new Error('Configuração de condições do gateway inválida.');
  }
  const outgoingIds = splitReferences(gateway.attributes.outgoing);
  const outgoingFlows = outgoingIds.map((id) => model.flows.find((flow) => flow.id === id));
  if (outgoingFlows.some((flow) => !flow)) throw new Error('O gateway possui referência de saída sem SequenceFlow correspondente.');
  const defaultFlowId = String(requestedConfiguration.defaultFlowId ?? '').trim();
  if (defaultFlowId && !outgoingFlows.some((flow) => flow.id === defaultFlowId)) {
    throw new Error(`O fluxo padrão ${defaultFlowId} não pertence às saídas do gateway.`);
  }
  for (const requested of requestedConfiguration.conditions) {
    if (String(requested?.mechanism ?? '') !== 'Executor Atividade' || !requested?.mechanismConfiguration) continue;
    const executor = model.elements.find((element) => element.id === String(requested.mechanismConfiguration.idNode ?? ''));
    if (!executor || !['BpmnStartEvent', 'BpmnTask', 'BpmnSubProcess'].includes(executor.tag)) {
      throw new Error(`A atividade executora ${requested.mechanismConfiguration.idNode || '(vazia)'} não existe no processo.`);
    }
  }

  const condition = buildGatewayConditionXml(
    gateway.attributes.condition,
    outgoingFlows,
    requestedConfiguration.conditions,
    gateway.id
  );
  const patches = [];
  if (condition !== String(gateway.attributes.condition ?? '<list/>')) {
    patchAttribute(text, gateway.node, 'condition', condition, patches, { required: true });
  }
  for (const flow of outgoingFlows) {
    const desired = flow.id === defaultFlowId ? 'true' : 'false';
    if (isTrueAttribute(flow.attributes.defaultLink) !== (desired === 'true')) {
      patchAttribute(text, flow.node, 'defaultLink', desired, patches);
    }
  }

  const uniquePatches = deduplicatePatches(patches);
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`A edição do gateway foi recusada porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  return {
    text: updatedText,
    changed: updatedText !== text,
    gatewayId: gateway.id,
    model: updatedModel,
    validation,
    patches: uniquePatches
  };
}

function patchLayout(text, requestedLayout) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da movimentação.`);
  }
  if (!model.canvas?.node) throw new Error('O diagrama não possui um canvas Graphiti editável.');

  const moves = Array.isArray(requestedLayout?.moves) ? requestedLayout.moves : [];
  const resizes = Array.isArray(requestedLayout?.resizes) ? requestedLayout.resizes : [];
  const connectionUpdates = Array.isArray(requestedLayout?.connections) ? requestedLayout.connections : [];
  const explicitConnectionIds = new Set(connectionUpdates.map((item) => String(item?.id ?? '')));
  const patches = [];
  const deltas = new Map();
  const desiredPositions = new Map();
  const seen = new Set();
  for (const move of moves) {
    const id = String(move?.id ?? '');
    if (!id || seen.has(id)) throw new Error(`Movimentação inválida ou duplicada para ${id || '(sem id)'}.`);
    seen.add(id);
    const element = model.elements.find((item) => item.id === id);
    if (!element) throw new Error(`Elemento não encontrado: ${id}.`);
    if (element.tag === 'BpmnProcess') {
      throw new Error(`${element.typeLabel} ainda não pode ser movimentado.`);
    }
    const shape = model.shapeById.get(id);
    if (!shape?.graphicsNode) throw new Error(`Shape não encontrado para ${id}.`);
    const x = layoutCoordinate(move.x, `${id}.x`);
    const y = layoutCoordinate(move.y, `${id}.y`);
    const dx = x - shape.x;
    const dy = y - shape.y;
    desiredPositions.set(id, { x, y });
    if (!dx && !dy) continue;
    deltas.set(id, { x: dx, y: dy });
  }

  validateContainerMoveSet(model, deltas);

  for (const [id, position] of desiredPositions) {
    const shape = model.shapeById.get(id);
    const parentShape = shape.parentBusinessObject ? model.shapeById.get(shape.parentBusinessObject) : null;
    if (shape.parentBusinessObject && !parentShape) {
      throw new Error(`Pai visual nao encontrado para ${id}: ${shape.parentBusinessObject}.`);
    }
    const parentPosition = parentShape
      ? (desiredPositions.get(parentShape.businessObject) ?? { x: parentShape.x, y: parentShape.y })
      : { x: 0, y: 0 };
    const localX = layoutCoordinate(position.x - parentPosition.x, `${id}.localX`);
    const localY = layoutCoordinate(position.y - parentPosition.y, `${id}.localY`);
    patchNumberAttribute(text, shape.graphicsNode, 'x', localX, patches);
    patchNumberAttribute(text, shape.graphicsNode, 'y', localY, patches);
  }

  const { sizes: requestedSizes, localPositions: resizedLocalPositions } = normalizeContainerResizes(model, resizes);
  for (const [id, position] of resizedLocalPositions) {
    const shape = model.shapeById.get(id);
    patchNumberAttribute(text, shape.graphicsNode, 'x', position.x, patches);
    patchNumberAttribute(text, shape.graphicsNode, 'y', position.y, patches);
  }
  for (const [id, size] of requestedSizes) {
    const element = model.elements.find((item) => item.id === id);
    const shape = model.shapeById.get(id);
    const minimum = minimumContainerSize(model, shape, element);
    if (size.width < minimum.width || size.height < minimum.height) {
      throw new Error(`${element.typeLabel} ${id} exige no minimo ${minimum.width}x${minimum.height} para preservar seu conteudo.`);
    }
    patchNumberAttribute(text, shape.graphicsNode, 'width', size.width, patches);
    patchNumberAttribute(text, shape.graphicsNode, 'height', size.height, patches);
    patchContainerLabelHeight(text, shape, size.height, patches);
  }

  for (const connection of model.connections) {
    if (explicitConnectionIds.has(connection.businessObject)) continue;
    const sourceDelta = deltas.get(connection.sourceRef);
    const targetDelta = deltas.get(connection.targetRef);
    if (!sourceDelta || !targetDelta || sourceDelta.x !== targetDelta.x || sourceDelta.y !== targetDelta.y) continue;
    connection.bendpointNodes.forEach((node) => {
      patchNumberAttribute(text, node, 'x', numberAttribute(node, 'x') + sourceDelta.x, patches);
      patchNumberAttribute(text, node, 'y', numberAttribute(node, 'y') + sourceDelta.y, patches);
    });
  }

  const seenConnections = new Set();
  for (const update of connectionUpdates) {
    const id = String(update?.id ?? '');
    if (!id || seenConnections.has(id)) throw new Error(`Ajuste de fluxo inválido ou duplicado para ${id || '(sem id)'}.`);
    seenConnections.add(id);
    const connection = model.connections.find((item) => item.businessObject === id);
    if (!connection) throw new Error(`Conexão visual não encontrada para ${id}.`);
    const bendpoints = normalizeLayoutBendpoints(update.bendpoints, id);
    if (sameBendpoints(connection.bendpoints, bendpoints)) continue;
    patchConnectionBendpoints(text, connection, bendpoints, patches);
  }

  const requestedCanvas = requestedLayout?.canvas ?? {};
  const requiredWidth = movedDiagramExtent(model, deltas, requestedSizes, 'x');
  const requiredHeight = movedDiagramExtent(model, deltas, requestedSizes, 'y');
  const width = Math.max(
    1000,
    optionalLayoutNumber(requestedCanvas.width, 'canvas.width', model.canvas.width),
    requiredWidth
  );
  const height = Math.max(
    800,
    optionalLayoutNumber(requestedCanvas.height, 'canvas.height', model.canvas.height),
    requiredHeight
  );
  patchNumberAttribute(text, model.canvas.node, 'width', width, patches);
  patchNumberAttribute(text, model.canvas.node, 'height', height, patches);

  const uniquePatches = deduplicatePatches(patches);
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`A movimentação foi recusada porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  return {
    text: updatedText,
    changed: updatedText !== text,
    model: updatedModel,
    validation,
    patches: uniquePatches
  };
}

function createSequenceFlow(text, request) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da conexão.`);
  }
  const sourceId = String(request?.sourceId ?? '');
  const targetId = String(request?.targetId ?? '');
  const source = model.elements.find((item) => item.id === sourceId);
  const target = model.elements.find((item) => item.id === targetId);
  validateConnectionEndpoints(source, target, model);
  const documentaryAssociation = ['BpmnAnnotation', 'BpmnDatabase', 'BpmnDocument'].includes(source.tag);
  if (model.flows.some((flow) => flow.attributes.sourceRef === sourceId && flow.attributes.targetRef === targetId)) {
    throw new Error('Já existe um fluxo direto entre estes elementos.');
  }

  const diagramShapes = model.diagram.children.filter((node) => node.localName === 'children');
  const sourceShape = model.shapeById.get(sourceId);
  const targetShape = model.shapeById.get(targetId);
  const sourceIndex = diagramShapes.indexOf(sourceShape?.node);
  const targetIndex = diagramShapes.indexOf(targetShape?.node);
  if (sourceIndex < 0 || targetIndex < 0) {
    throw new Error('A conexão exige shapes Graphiti diretos no diagrama.');
  }
  const sourceAnchor = sourceShape.node.children.find((node) => node.localName === 'anchors');
  const targetAnchor = targetShape.node.children.find((node) => node.localName === 'anchors');
  if (!sourceAnchor || !targetAnchor) throw new Error('Origem ou destino sem ChopboxAnchor compatível.');

  const visualConnections = model.diagram.children.filter((node) => node.localName === 'connections');
  const templateSource = resolveCreationTemplate(
    text,
    model,
    request,
    (candidateModel) => findRegularConnectionTemplate(candidateModel)
  );
  const template = templateSource?.template;
  if (!template) throw new Error('O diagrama não possui um fluxo regular que possa servir de template visual seguro.');
  const connectionIndex = visualConnections.length;
  const connectionRef = `/0/@connections.${connectionIndex}`;
  const flowId = nextBusinessId(model, 'flow');
  const bendpoints = normalizeLayoutBendpoints(request?.bendpoints ?? [], flowId);
  const connectionXml = cloneRegularConnection(templateSource.text, template, {
    flowId,
    start: `/0/@children.${sourceIndex}/@anchors.0`,
    end: `/0/@children.${targetIndex}/@anchors.0`,
    bendpoints
  });

  const xmiRoot = model.xml.children.find((node) => node.name === 'xmi:XMI');
  if (!xmiRoot) throw new Error('Estrutura XMI/Graphiti sem ponto de inserção seguro.');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const logicalFlow = `  <bpmn2:SequenceFlow id="${flowId}" name="" sourceRef="${sourceId}" targetRef="${targetId}" atividadeFluxo="" atividadeRetorno=""/>`;
  const connectionInsertionOffset = diagramInsertionOffset(model, 'connections');
  const patches = [
    {
      start: connectionInsertionOffset,
      end: connectionInsertionOffset,
      value: `${visualConnections.length ? `${eol}    ` : ''}${connectionXml}${eol}    `
    },
    { start: xmiRoot.closeStart, end: xmiRoot.closeStart, value: `${logicalFlow}${eol}` }
  ];
  patchAttribute(text, source.node, 'outgoing', appendReference(source.attributes.outgoing, flowId), patches, { required: true });
  patchAttribute(text, target.node, 'incoming', appendReference(target.attributes.incoming, flowId), patches, { required: true });
  patchAttribute(text, sourceAnchor, 'outgoingConnections', appendReference(sourceAnchor.attributeMap.outgoingConnections?.value, connectionRef), patches, { required: true });
  patchAttribute(text, targetAnchor, 'incomingConnections', appendReference(targetAnchor.attributeMap.incomingConnections?.value, connectionRef), patches, { required: true });
  patchAttribute(
    text,
    model.diagram,
    'pictogramLinks',
    appendReference(model.diagram.attributeMap.pictogramLinks?.value, `${connectionRef}/@link`),
    patches,
    { required: true }
  );

  const uniquePatches = deduplicatePatches(patches);
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`A conexão foi recusada porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  return {
    text: updatedText,
    changed: true,
    flowId,
    documentaryAssociation,
    model: updatedModel,
    validation,
    patches: uniquePatches
  };
}

function reconnectSequenceFlow(text, request) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da reconexão.`);
  }

  const flowId = String(request?.flowId ?? '');
  const endpoint = String(request?.endpoint ?? '');
  const newElementId = String(request?.newElementId ?? '');
  if (!flowId) throw new Error('Selecione um fluxo para reconectar.');
  if (!['source', 'target'].includes(endpoint)) throw new Error('Extremidade de fluxo inválida.');
  const matches = model.flows.filter((item) => item.id === flowId);
  if (matches.length !== 1) throw new Error(`Fluxo não encontrado ou duplicado: ${flowId}.`);
  const flow = matches[0];
  const oldSource = model.elements.find((item) => item.id === flow.attributes.sourceRef);
  const oldTarget = model.elements.find((item) => item.id === flow.attributes.targetRef);
  const replacement = model.elements.find((item) => item.id === newElementId);
  const newSource = endpoint === 'source' ? replacement : oldSource;
  const newTarget = endpoint === 'target' ? replacement : oldTarget;
  validateConnectionEndpoints(newSource, newTarget, model);
  const oldElement = endpoint === 'source' ? oldSource : oldTarget;
  if (!oldElement) throw new Error('A extremidade atual do fluxo não foi encontrada.');
  if (oldElement.id === replacement.id) throw new Error('Solte a extremidade sobre um elemento diferente do atual.');
  if (model.flows.some((item) => item.id !== flowId
    && item.attributes.sourceRef === newSource.id && item.attributes.targetRef === newTarget.id)) {
    throw new Error('Já existe um fluxo direto entre estes elementos.');
  }
  if (endpoint === 'source' && isTrueAttribute(flow.attributes.defaultLink)) {
    throw new Error(`O fluxo ${flowId} é um ramo padrão. Altere o gateway antes de mudar sua origem.`);
  }
  if (endpoint === 'source' && oldSource.tag === 'BpmnGateway' && gatewayConditionTargets(oldSource, oldTarget.id)) {
    throw new Error(`O gateway ${oldSource.id} possui condição associada a este fluxo. Altere a condição antes de mudar sua origem.`);
  }

  const connectionMatches = model.connections.filter((item) => item.businessObject === flowId);
  if (connectionMatches.length !== 1) throw new Error(`O fluxo ${flowId} não possui uma conexão Graphiti bijetiva.`);
  const connection = connectionMatches[0];
  const visualConnections = model.diagram?.children.filter((node) => node.localName === 'connections') ?? [];
  const connectionIndex = visualConnections.indexOf(connection.node);
  const diagramShapes = model.diagram?.children.filter((node) => node.localName === 'children') ?? [];
  if (connectionIndex < 0) throw new Error(`A conexão visual de ${flowId} não é filha direta do diagrama.`);

  const oldShape = model.shapeById.get(oldElement.id);
  const newShape = model.shapeById.get(replacement.id);
  const oldAnchor = findChopboxAnchor(oldShape?.node);
  const newAnchor = findChopboxAnchor(newShape?.node);
  const newShapeIndex = diagramShapes.indexOf(newShape?.node);
  if (!oldAnchor || !newAnchor || newShapeIndex < 0) {
    throw new Error('A reconexão exige shapes Graphiti diretos com ChopboxAnchor compatível.');
  }
  const connectionRef = `/0/@connections.${connectionIndex}`;
  const directionAttribute = endpoint === 'source' ? 'outgoing' : 'incoming';
  const anchorDirectionAttribute = endpoint === 'source' ? 'outgoingConnections' : 'incomingConnections';
  if (!splitReferences(oldElement.attributes[directionAttribute]).includes(flowId)) {
    throw new Error(`${oldElement.id}.${directionAttribute} não referencia ${flowId}.`);
  }
  if (!splitReferences(oldAnchor.attributeMap[anchorDirectionAttribute]?.value).includes(connectionRef)) {
    throw new Error(`A âncora de ${endpoint === 'source' ? 'origem' : 'destino'} não referencia ${connectionRef}.`);
  }

  const patches = [];
  patchAttribute(text, flow.node, endpoint === 'source' ? 'sourceRef' : 'targetRef', replacement.id, patches, { required: true });
  patchReferenceListAttribute(text, oldElement.node, directionAttribute, flowId, patches);
  patchAttribute(
    text,
    replacement.node,
    directionAttribute,
    appendReference(replacement.attributes[directionAttribute], flowId),
    patches,
    { required: true }
  );
  patchReferenceListAttribute(text, oldAnchor, anchorDirectionAttribute, connectionRef, patches);
  patchAttribute(
    text,
    newAnchor,
    anchorDirectionAttribute,
    appendReference(newAnchor.attributeMap[anchorDirectionAttribute]?.value, connectionRef),
    patches,
    { required: true }
  );
  patchAttribute(
    text,
    connection.node,
    endpoint === 'source' ? 'start' : 'end',
    `/0/@children.${newShapeIndex}/@anchors.0`,
    patches,
    { required: true }
  );

  if (endpoint === 'target' && oldSource.tag === 'BpmnGateway' && gatewayConditionTargets(oldSource, oldTarget.id)) {
    const escaped = oldTarget.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const updatedCondition = String(oldSource.attributes.condition ?? '').replace(
      new RegExp(`(<targetTask>\\s*)${escaped}(\\s*</targetTask>)`, 'g'),
      (_match, prefix, suffix) => `${prefix}${replacement.id}${suffix}`
    );
    patchAttribute(text, oldSource.node, 'condition', updatedCondition, patches, { required: true });
  }

  if (request?.bendpoints !== undefined) {
    const bendpoints = normalizeLayoutBendpoints(request.bendpoints, flowId);
    if (!sameBendpoints(connection.bendpoints, bendpoints)) patchConnectionBendpoints(text, connection, bendpoints, patches);
  }

  const uniquePatches = deduplicatePatches(patches);
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`A reconexão foi recusada porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  return {
    text: updatedText,
    changed: updatedText !== text,
    flowId,
    endpoint,
    oldElementId: oldElement.id,
    newElementId: replacement.id,
    model: updatedModel,
    validation,
    patches: uniquePatches
  };
}

function deleteSequenceFlow(text, flowId) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da exclusão.`);
  }

  const requestedId = String(flowId ?? '');
  if (!requestedId) throw new Error('Selecione um fluxo para excluir.');
  const matches = model.flows.filter((item) => item.id === requestedId);
  if (matches.length !== 1) throw new Error(`Fluxo não encontrado ou duplicado: ${requestedId}.`);
  const flow = matches[0];
  const source = model.elements.find((item) => item.id === flow.attributes.sourceRef);
  const target = model.elements.find((item) => item.id === flow.attributes.targetRef);
  if (!source || !target) throw new Error(`O fluxo ${requestedId} possui origem ou destino inexistente.`);
  if (isTrueAttribute(flow.attributes.defaultLink)) {
    throw new Error(`O fluxo ${requestedId} é o ramo padrão de um gateway e não pode ser excluído nesta etapa.`);
  }
  if (source.tag === 'BpmnGateway' && gatewayConditionTargets(source, target.id)) {
    throw new Error(`O gateway ${source.id} possui uma condição que aponta para ${target.id}. Edite a condição antes de excluir o fluxo.`);
  }

  const visualConnections = model.diagram?.children.filter((node) => node.localName === 'connections') ?? [];
  const connectionMatches = model.connections.filter((item) => item.businessObject === requestedId);
  if (connectionMatches.length !== 1) {
    throw new Error(`O fluxo ${requestedId} não possui uma conexão Graphiti bijetiva.`);
  }
  const connection = connectionMatches[0];
  const connectionIndex = visualConnections.indexOf(connection.node);
  if (connectionIndex < 0 || connection.node.parent !== model.diagram) {
    throw new Error(`A conexão visual de ${requestedId} não é filha direta do diagrama.`);
  }

  const sourceShape = model.shapeById.get(source.id);
  const targetShape = model.shapeById.get(target.id);
  const sourceAnchor = findChopboxAnchor(sourceShape?.node);
  const targetAnchor = findChopboxAnchor(targetShape?.node);
  const connectionRef = `/0/@connections.${connectionIndex}`;
  if (!splitReferences(source.attributes.outgoing).includes(requestedId)
    || !splitReferences(target.attributes.incoming).includes(requestedId)) {
    throw new Error(`A tripla lógica do fluxo ${requestedId} está incompleta.`);
  }
  if (!sourceAnchor || !splitReferences(sourceAnchor.attributeMap.outgoingConnections?.value).includes(connectionRef)) {
    throw new Error(`A âncora de origem não referencia ${connectionRef}.`);
  }
  if (!targetAnchor || !splitReferences(targetAnchor.attributeMap.incomingConnections?.value).includes(connectionRef)) {
    throw new Error(`A âncora de destino não referencia ${connectionRef}.`);
  }
  if (!splitReferences(model.diagram.attributeMap.pictogramLinks?.value).includes(`${connectionRef}/@link`)) {
    throw new Error(`O pictogramLinks não referencia a conexão visual de ${requestedId}.`);
  }

  const patches = [wholeLineRemovalPatch(text, flow.node), wholeLineRemovalPatch(text, connection.node)];
  patchReferenceListAttribute(text, source.node, 'outgoing', requestedId, patches);
  patchReferenceListAttribute(text, target.node, 'incoming', requestedId, patches);

  walk(model.xml, (node) => {
    if (isInsideNode(node, connection.node) || isInsideNode(node, flow.node)) return;
    for (const attribute of node.attributes) {
      if (!attribute.value.includes('/0/@connections.')) continue;
      const remapped = remapConnectionReferences(attribute.value, connectionIndex);
      if (!remapped.changed) continue;
      if (remapped.value) patchAttribute(text, node, attribute.name, remapped.value, patches, { required: true });
      else removeAttribute(text, node, attribute.name, patches);
    }
  });

  const uniquePatches = deduplicatePatches(patches);
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`A exclusão foi recusada porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  if (updatedModel.flows.some((item) => item.id === requestedId)
    || updatedModel.connections.some((item) => item.businessObject === requestedId)) {
    throw new Error(`A exclusão de ${requestedId} não removeu todas as representações do fluxo.`);
  }
  assertConnectionReferenceBounds(updatedModel);
  return {
    text: updatedText,
    changed: true,
    flowId: requestedId,
    sourceId: source.id,
    targetId: target.id,
    removedConnectionIndex: connectionIndex,
    model: updatedModel,
    validation,
    patches: uniquePatches
  };
}

function deleteIsolatedEvent(text, elementId) {
  const initialModel = parseProcess(text);
  const requestedId = String(elementId ?? '');
  const matches = initialModel.elements.filter((item) => item.id === requestedId);
  if (matches.length !== 1) {
    return deleteIsolatedDiagramNode(text, elementId, eventDeletionOptions());
  }
  const incidentFlows = initialModel.flows.filter((flow) => (
    flow.attributes.sourceRef === requestedId || flow.attributes.targetRef === requestedId
  ));
  if (incidentFlows.length) return deleteEventWithIncidentFlows(text, requestedId);
  return deleteIsolatedDiagramNode(text, requestedId, eventDeletionOptions());
}

function eventDeletionOptions() {
  return {
    noun: 'evento',
    selectionMessage: 'Selecione um evento isolado para excluir.',
    assertAllowed(element) {
      assertDeletableEventType(element);
    },
    assertIsolatedPayload(element) {
      assertDeletableEventPayload(element);
    }
  };
}

function assertDeletableEventType(element) {
  const allowedTypes = {
    BpmnStartEvent: new Set(['10', '12', '13', '14', '16']),
    BpmnEndEvent: new Set(['60', '63', '64', '65', '66', '68']),
    BpmnIntermediateEvent: new Set(['30', '32', '35', '36', '37', '39', '41', '42'])
  };
  if (!(allowedTypes[element.tag]?.has(element.type) ?? false)) {
    throw new Error('Somente eventos de início, finais e intermediários podem ser excluídos por esta operação.');
  }
}

function assertDeletableEventPayload(element) {
  if (element.tag === 'BpmnIntermediateEvent'
    && element.type === '36'
    && !['', '0'].includes(String(element.attributes.linkId ?? '').trim())) {
    throw new Error(`O evento ${element.id} ainda possui vínculo de envio de link.`);
  }
}

function deleteEventWithIncidentFlows(text, elementId) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da exclusão.`);
  }
  const matches = model.elements.filter((item) => item.id === elementId);
  if (matches.length !== 1) throw new Error(`Elemento não encontrado ou duplicado: ${elementId}.`);
  const element = matches[0];
  assertDeletableEventType(element);
  assertDeletableEventPayload(element);

  const incidentFlows = model.flows.filter((flow) => (
    flow.attributes.sourceRef === elementId || flow.attributes.targetRef === elementId
  ));
  const removedFlowIds = new Set(incidentFlows.map((flow) => flow.id));
  for (const flow of incidentFlows) {
    if (isTrueAttribute(flow.attributes.defaultLink)) {
      throw new Error(`O fluxo ${flow.id} é o ramo padrão de um gateway. Remova o fluxo padrão antes de excluir o evento.`);
    }
    const source = model.elements.find((item) => item.id === flow.attributes.sourceRef);
    const target = model.elements.find((item) => item.id === flow.attributes.targetRef);
    if (!source || !target) throw new Error(`O fluxo ${flow.id} possui origem ou destino inexistente.`);
    if (source.tag === 'BpmnGateway' && gatewayConditionTargets(source, target.id)) {
      throw new Error(`O gateway ${source.id} possui uma condição que aponta para ${target.id}. Remova a condição antes de excluir o evento.`);
    }
  }

  const diagramShapes = model.diagram?.children.filter((node) => node.localName === 'children') ?? [];
  const shapeMatches = model.shapes.filter((shape) => shape.businessObject === elementId);
  if (shapeMatches.length !== 1) throw new Error(`O evento ${elementId} não possui um shape Graphiti bijetivo.`);
  const shape = shapeMatches[0];
  const childIndex = diagramShapes.indexOf(shape.node);
  if (childIndex < 0 || shape.node.parent !== model.diagram) {
    throw new Error(`O shape de ${elementId} não é filho direto do diagrama.`);
  }

  const visualConnections = model.diagram?.children.filter((node) => node.localName === 'connections') ?? [];
  const removedConnections = [];
  for (const flow of incidentFlows) {
    const connectionMatches = model.connections.filter((item) => item.businessObject === flow.id);
    if (connectionMatches.length !== 1) {
      throw new Error(`O fluxo ${flow.id} não possui uma conexão Graphiti bijetiva.`);
    }
    const connection = connectionMatches[0];
    const connectionIndex = visualConnections.indexOf(connection.node);
    if (connectionIndex < 0 || connection.node.parent !== model.diagram) {
      throw new Error(`A conexão visual de ${flow.id} não é filha direta do diagrama.`);
    }
    removedConnections.push({ connection, connectionIndex, reference: `/0/@connections.${connectionIndex}` });
  }

  const removedRoots = [element.node, shape.node, ...incidentFlows.map((flow) => flow.node), ...removedConnections.map((item) => item.connection.node)];
  walk(model.xml, (node) => {
    if (removedRoots.some((root) => isInsideNode(node, root))) return;
    for (const attribute of node.attributes) {
      if (attributeReferencesIdentifier(attribute.value, elementId)) {
        throw new Error(`${elementId} ainda é referenciado por ${node.localName}.${attribute.name}.`);
      }
    }
  });

  const removedConnectionRefs = new Set(removedConnections.map((item) => item.reference));
  const removedConnectionIndices = removedConnections.map((item) => item.connectionIndex).sort((a, b) => b - a);
  const patches = removedRoots.map((node) => wholeLineRemovalPatch(text, node));
  walk(model.xml, (node) => {
    if (removedRoots.some((root) => isInsideNode(node, root))) return;
    for (const attribute of node.attributes) {
      let value = attribute.value;
      if (['incoming', 'outgoing'].includes(attribute.name)) {
        value = splitReferences(value).filter((reference) => !removedFlowIds.has(reference)).join(' ');
      }
      if (['incomingConnections', 'outgoingConnections'].includes(attribute.name)) {
        value = splitReferences(value).filter((reference) => !removedConnectionRefs.has(reference)).join(' ');
      }
      for (const index of removedConnectionIndices) value = remapConnectionReferences(value, index).value;
      value = remapChildReferences(value, childIndex).value;
      if (value === attribute.value) continue;
      if (value) patchAttribute(text, node, attribute.name, value, patches, { required: true });
      else removeAttribute(text, node, attribute.name, patches);
    }
  });

  const uniquePatches = deduplicatePatches(patches);
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`A exclusão foi recusada porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  if (updatedModel.elements.some((item) => item.id === elementId)
    || updatedModel.shapes.some((item) => item.businessObject === elementId)
    || updatedModel.flows.some((flow) => removedFlowIds.has(flow.id))
    || updatedModel.connections.some((connection) => removedFlowIds.has(connection.businessObject))) {
    throw new Error(`A exclusão de ${elementId} não removeu todas as representações do evento e de seus fluxos.`);
  }
  assertChildReferenceBounds(updatedModel);
  assertConnectionReferenceBounds(updatedModel);
  return {
    text: updatedText,
    changed: true,
    elementId,
    elementTag: element.tag,
    elementType: element.type,
    elementName: element.name,
    activityCode: numericSuffix(elementId),
    removedChildIndex: childIndex,
    removedFlowIds: [...removedFlowIds],
    removedConnectionIndices: removedConnections.map((item) => item.connectionIndex),
    model: updatedModel,
    validation,
    patches: uniquePatches
  };
}

function deleteAttachedErrorEvent(text, elementId) {
  let parentTask = null;
  const result = deleteIsolatedDiagramNode(text, elementId, {
    noun: 'tratativa de erro',
    selectionMessage: 'Selecione uma tratativa de erro anexada para excluir.',
    assertAllowed(element) {
      if (element.tag !== 'BpmnIntermediateEvent' || element.type !== '43') {
        throw new Error('Somente eventos de captura de erro anexados podem ser excluídos por esta operação.');
      }
    },
    assertIsolatedPayload(element, model) {
      const parentTaskId = String(element.attributes.parentTask ?? '').trim();
      parentTask = model.elements.find((item) => item.id === parentTaskId) ?? null;
      if (!parentTask || parentTask.tag !== 'BpmnTask' || parentTask.type !== '82') {
        throw new Error(`A tratativa ${element.id} não possui uma atividade de serviço proprietária válida.`);
      }
      const attached = splitReferences(parentTask.attributes.attachedEvents);
      if (attached.filter((id) => id === element.id).length !== 1) {
        throw new Error(`A atividade ${parentTask.id} não referencia unicamente a tratativa ${element.id}.`);
      }
      if (String(element.attributes.sequenceAttached ?? '') !== numericSuffix(parentTask.id)) {
        throw new Error(`A tratativa ${element.id} possui sequenceAttached incompatível com ${parentTask.id}.`);
      }
    },
    allowIdentifierReference(node, attribute, element) {
      return node === parentTask?.node
        && attribute.name === 'attachedEvents'
        && splitReferences(attribute.value).includes(element.id);
    },
    patchReferences(textValue, element, _model, patches) {
      const remaining = splitReferences(parentTask.attributes.attachedEvents).filter((id) => id !== element.id);
      if (remaining.length) {
        patchAttribute(textValue, parentTask.node, 'attachedEvents', remaining.join(' '), patches, { required: true });
      } else {
        removeAttribute(textValue, parentTask.node, 'attachedEvents', patches);
      }
    },
    resultFields() {
      return { parentTaskId: parentTask.id };
    }
  });
  const updatedParent = result.model.elements.find((item) => item.id === result.parentTaskId);
  if (!updatedParent || splitReferences(updatedParent.attributes.attachedEvents).includes(result.elementId)) {
    throw new Error(`A exclusão de ${result.elementId} não removeu a referência da atividade proprietária.`);
  }
  return result;
}

function deleteIsolatedGateway(text, elementId) {
  const initialModel = parseProcess(text);
  const requestedId = String(elementId ?? '');
  const matches = initialModel.elements.filter((item) => item.id === requestedId);
  if (matches.length === 1) {
    const incidentFlows = initialModel.flows.filter((flow) => (
      flow.attributes.sourceRef === requestedId || flow.attributes.targetRef === requestedId
    ));
    if (incidentFlows.length) return deleteGatewayWithIncidentFlows(text, requestedId);
  }
  return deleteIsolatedDiagramNode(text, elementId, {
    noun: 'gateway',
    selectionMessage: 'Selecione um gateway isolado para excluir.',
    assertAllowed(element) {
      const allowedTypes = new Set(['120', '121', '126', '127']);
      if (element.tag !== 'BpmnGateway' || !allowedTypes.has(element.type)) {
        throw new Error('Nesta etapa somente gateways exclusivos, inclusivos, paralelos e join podem ser excluídos.');
      }
    },
    assertIsolatedPayload(element) {
      const normalizedCondition = String(element.attributes.condition ?? '').replace(/\s+/g, '');
      if (normalizedCondition !== '<list/>') {
        throw new Error(`O gateway ${element.id} possui condição ou configuração não vazia.`);
      }
    }
  });
}

function deleteGatewayWithIncidentFlows(text, elementId) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da exclusão.`);
  }
  const matches = model.elements.filter((item) => item.id === elementId);
  if (matches.length !== 1) throw new Error(`Elemento não encontrado ou duplicado: ${elementId}.`);
  const element = matches[0];
  const allowedTypes = new Set(['120', '121', '126', '127']);
  if (element.tag !== 'BpmnGateway' || !allowedTypes.has(element.type)) {
    throw new Error('Nesta etapa somente gateways exclusivos, inclusivos, paralelos e join podem ser excluídos.');
  }
  const normalizedCondition = String(element.attributes.condition ?? '').replace(/\s+/g, '');
  if (normalizedCondition !== '<list/>') {
    throw new Error(`O gateway ${element.id} possui condição ou configuração não vazia.`);
  }

  const incidentFlows = model.flows.filter((flow) => (
    flow.attributes.sourceRef === elementId || flow.attributes.targetRef === elementId
  ));
  const removedFlowIds = new Set(incidentFlows.map((flow) => flow.id));
  for (const flow of incidentFlows) {
    if (isTrueAttribute(flow.attributes.defaultLink)) {
      throw new Error(`O fluxo ${flow.id} é o ramo padrão de um gateway. Remova a marcação de fluxo padrão antes de excluir o gateway.`);
    }
    const source = model.elements.find((item) => item.id === flow.attributes.sourceRef);
    const target = model.elements.find((item) => item.id === flow.attributes.targetRef);
    if (!source || !target) throw new Error(`O fluxo ${flow.id} possui origem ou destino inexistente.`);
  }

  const diagramShapes = model.diagram?.children.filter((node) => node.localName === 'children') ?? [];
  const shapeMatches = model.shapes.filter((shape) => shape.businessObject === elementId);
  if (shapeMatches.length !== 1) throw new Error(`O gateway ${elementId} não possui um shape Graphiti bijetivo.`);
  const shape = shapeMatches[0];
  const childIndex = diagramShapes.indexOf(shape.node);
  if (childIndex < 0 || shape.node.parent !== model.diagram) {
    throw new Error(`O shape de ${elementId} não é filho direto do diagrama.`);
  }

  const visualConnections = model.diagram?.children.filter((node) => node.localName === 'connections') ?? [];
  const removedConnections = [];
  for (const flow of incidentFlows) {
    const connectionMatches = model.connections.filter((item) => item.businessObject === flow.id);
    if (connectionMatches.length !== 1) {
      throw new Error(`O fluxo ${flow.id} não possui uma conexão Graphiti bijetiva.`);
    }
    const connection = connectionMatches[0];
    const connectionIndex = visualConnections.indexOf(connection.node);
    if (connectionIndex < 0 || connection.node.parent !== model.diagram) {
      throw new Error(`A conexão visual de ${flow.id} não é filha direta do diagrama.`);
    }
    removedConnections.push({ connection, connectionIndex, reference: `/0/@connections.${connectionIndex}` });
  }

  const removedRoots = [
    element.node,
    shape.node,
    ...incidentFlows.map((flow) => flow.node),
    ...removedConnections.map((item) => item.connection.node)
  ];
  walk(model.xml, (node) => {
    if (removedRoots.some((root) => isInsideNode(node, root))) return;
    for (const attribute of node.attributes) {
      if (attributeReferencesIdentifier(attribute.value, elementId)) {
        throw new Error(`${elementId} ainda é referenciado por ${node.localName}.${attribute.name}.`);
      }
    }
  });

  const removedConnectionRefs = new Set(removedConnections.map((item) => item.reference));
  const removedConnectionIndices = removedConnections.map((item) => item.connectionIndex).sort((a, b) => b - a);
  const patches = removedRoots.map((node) => wholeLineRemovalPatch(text, node));
  walk(model.xml, (node) => {
    if (removedRoots.some((root) => isInsideNode(node, root))) return;
    for (const attribute of node.attributes) {
      let value = attribute.value;
      if (['incoming', 'outgoing'].includes(attribute.name)) {
        value = splitReferences(value).filter((reference) => !removedFlowIds.has(reference)).join(' ');
      }
      if (['incomingConnections', 'outgoingConnections'].includes(attribute.name)) {
        value = splitReferences(value).filter((reference) => !removedConnectionRefs.has(reference)).join(' ');
      }
      for (const index of removedConnectionIndices) value = remapConnectionReferences(value, index).value;
      value = remapChildReferences(value, childIndex).value;
      if (value === attribute.value) continue;
      if (value) patchAttribute(text, node, attribute.name, value, patches, { required: true });
      else removeAttribute(text, node, attribute.name, patches);
    }
  });

  const uniquePatches = deduplicatePatches(patches);
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`A exclusão foi recusada porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  if (updatedModel.elements.some((item) => item.id === elementId)
    || updatedModel.shapes.some((item) => item.businessObject === elementId)
    || updatedModel.flows.some((flow) => removedFlowIds.has(flow.id))
    || updatedModel.connections.some((connection) => removedFlowIds.has(connection.businessObject))) {
    throw new Error(`A exclusão de ${elementId} não removeu todas as representações do gateway e de seus fluxos.`);
  }
  assertChildReferenceBounds(updatedModel);
  assertConnectionReferenceBounds(updatedModel);
  return {
    text: updatedText,
    changed: true,
    elementId,
    elementTag: element.tag,
    elementType: element.type,
    elementName: element.name,
    activityCode: numericSuffix(elementId),
    removedChildIndex: childIndex,
    removedFlowIds: [...removedFlowIds],
    removedConnectionIndices: removedConnections.map((item) => item.connectionIndex),
    model: updatedModel,
    validation,
    patches: uniquePatches
  };
}

function deleteIsolatedTask(text, elementId) {
  const initialModel = parseProcess(text);
  const requestedId = String(elementId ?? '');
  const matches = initialModel.elements.filter((item) => item.id === requestedId);
  if (matches.length === 1) {
    const incidentFlows = initialModel.flows.filter((flow) => (
      flow.attributes.sourceRef === requestedId || flow.attributes.targetRef === requestedId
    ));
    if (incidentFlows.length) return deleteTaskWithIncidentFlows(text, requestedId);
  }
  return deleteIsolatedDiagramNode(text, elementId, {
    noun: 'atividade',
    selectionMessage: 'Selecione uma atividade isolada para excluir.',
    assertAllowed(element) {
      const allowedTypes = new Set(['80', '81', '82', '84', '85', '86', '87']);
      if (element.tag !== 'BpmnTask' || !allowedTypes.has(element.type)) {
        throw new Error('Nesta etapa somente atividades comuns, de usuário, serviço, envio, manuais, de negócio e de script podem ser excluídas.');
      }
    },
    assertIsolatedPayload(element) {
      if (splitReferences(element.attributes.attachedEvents).length) {
        throw new Error(`A atividade ${element.id} possui evento anexado.`);
      }
    },
    resultFields(element) {
      return { scriptFileName: String(element.attributes.scriptFileName ?? '').trim() };
    }
  });
}

function deleteTaskWithIncidentFlows(text, elementId) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da exclusão.`);
  }
  const matches = model.elements.filter((item) => item.id === elementId);
  if (matches.length !== 1) throw new Error(`Elemento não encontrado ou duplicado: ${elementId}.`);
  const element = matches[0];
  const allowedTypes = new Set(['80', '81', '82', '84', '85', '86', '87']);
  if (element.tag !== 'BpmnTask' || !allowedTypes.has(element.type)) {
    throw new Error('Nesta etapa somente atividades comuns, de usuário, serviço, envio, manuais, de negócio e de script podem ser excluídas.');
  }
  if (splitReferences(element.attributes.attachedEvents).length) {
    throw new Error(`A atividade ${element.id} possui evento anexado.`);
  }
  const incidentFlows = model.flows.filter((flow) => (
    flow.attributes.sourceRef === elementId || flow.attributes.targetRef === elementId
  ));
  const removedFlowIds = new Set(incidentFlows.map((flow) => flow.id));
  for (const flow of incidentFlows) {
    if (isTrueAttribute(flow.attributes.defaultLink)) {
      throw new Error(`O fluxo ${flow.id} é o ramo padrão de um gateway. Remova o fluxo padrão antes de excluir a atividade.`);
    }
    const source = model.elements.find((item) => item.id === flow.attributes.sourceRef);
    const target = model.elements.find((item) => item.id === flow.attributes.targetRef);
    if (!source || !target) throw new Error(`O fluxo ${flow.id} possui origem ou destino inexistente.`);
    if (source.tag === 'BpmnGateway' && gatewayConditionTargets(source, target.id)) {
      throw new Error(`O gateway ${source.id} possui uma condição que aponta para ${target.id}. Remova a condição antes de excluir a atividade.`);
    }
  }

  const diagramShapes = model.diagram?.children.filter((node) => node.localName === 'children') ?? [];
  const shapeMatches = model.shapes.filter((shape) => shape.businessObject === elementId);
  if (shapeMatches.length !== 1) throw new Error(`A atividade ${elementId} não possui um shape Graphiti bijetivo.`);
  const shape = shapeMatches[0];
  const childIndex = diagramShapes.indexOf(shape.node);
  if (childIndex < 0 || shape.node.parent !== model.diagram) {
    throw new Error(`O shape de ${elementId} não é filho direto do diagrama.`);
  }

  const visualConnections = model.diagram?.children.filter((node) => node.localName === 'connections') ?? [];
  const removedConnections = [];
  for (const flow of incidentFlows) {
    const connectionMatches = model.connections.filter((item) => item.businessObject === flow.id);
    if (connectionMatches.length !== 1) {
      throw new Error(`O fluxo ${flow.id} não possui uma conexão Graphiti bijetiva.`);
    }
    const connection = connectionMatches[0];
    const connectionIndex = visualConnections.indexOf(connection.node);
    if (connectionIndex < 0 || connection.node.parent !== model.diagram) {
      throw new Error(`A conexão visual de ${flow.id} não é filha direta do diagrama.`);
    }
    removedConnections.push({ connection, connectionIndex, reference: `/0/@connections.${connectionIndex}` });
  }

  const removedRoots = [
    element.node,
    shape.node,
    ...incidentFlows.map((flow) => flow.node),
    ...removedConnections.map((item) => item.connection.node)
  ];
  walk(model.xml, (node) => {
    if (removedRoots.some((root) => isInsideNode(node, root))) return;
    for (const attribute of node.attributes) {
      if (attributeReferencesIdentifier(attribute.value, elementId)) {
        throw new Error(`${elementId} ainda é referenciado por ${node.localName}.${attribute.name}.`);
      }
    }
  });

  const removedConnectionRefs = new Set(removedConnections.map((item) => item.reference));
  const removedConnectionIndices = removedConnections.map((item) => item.connectionIndex).sort((a, b) => b - a);
  const patches = removedRoots.map((node) => wholeLineRemovalPatch(text, node));
  walk(model.xml, (node) => {
    if (removedRoots.some((root) => isInsideNode(node, root))) return;
    for (const attribute of node.attributes) {
      let value = attribute.value;
      if (['incoming', 'outgoing'].includes(attribute.name)) {
        value = splitReferences(value).filter((reference) => !removedFlowIds.has(reference)).join(' ');
      }
      if (['incomingConnections', 'outgoingConnections'].includes(attribute.name)) {
        value = splitReferences(value).filter((reference) => !removedConnectionRefs.has(reference)).join(' ');
      }
      for (const index of removedConnectionIndices) value = remapConnectionReferences(value, index).value;
      value = remapChildReferences(value, childIndex).value;
      if (value === attribute.value) continue;
      if (value) patchAttribute(text, node, attribute.name, value, patches, { required: true });
      else removeAttribute(text, node, attribute.name, patches);
    }
  });

  const uniquePatches = deduplicatePatches(patches);
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`A exclusão foi recusada porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  if (updatedModel.elements.some((item) => item.id === elementId)
    || updatedModel.shapes.some((item) => item.businessObject === elementId)
    || updatedModel.flows.some((flow) => removedFlowIds.has(flow.id))
    || updatedModel.connections.some((connection) => removedFlowIds.has(connection.businessObject))) {
    throw new Error(`A exclusão de ${elementId} não removeu todas as representações da atividade e de seus fluxos.`);
  }
  assertChildReferenceBounds(updatedModel);
  assertConnectionReferenceBounds(updatedModel);
  return {
    text: updatedText,
    changed: true,
    elementId,
    elementTag: element.tag,
    elementType: element.type,
    elementName: element.name,
    scriptFileName: String(element.attributes.scriptFileName ?? '').trim(),
    activityCode: numericSuffix(elementId),
    removedChildIndex: childIndex,
    removedFlowIds: [...removedFlowIds],
    removedConnectionIndices: removedConnections.map((item) => item.connectionIndex),
    model: updatedModel,
    validation,
    patches: uniquePatches
  };
}

function deleteIsolatedSubProcess(text, elementId) {
  const initialModel = parseProcess(text);
  const requestedId = String(elementId ?? '');
  const matches = initialModel.elements.filter((item) => item.id === requestedId);
  if (matches.length === 1) {
    const incidentFlows = initialModel.flows.filter((flow) => (
      flow.attributes.sourceRef === requestedId || flow.attributes.targetRef === requestedId
    ));
    if (incidentFlows.length) return deleteSubProcessWithIncidentFlows(text, requestedId);
  }
  return deleteIsolatedDiagramNode(text, elementId, {
    noun: 'subprocesso',
    selectionMessage: 'Selecione um subprocesso isolado para excluir.',
    assertAllowed(element) {
      const allowedTypes = new Set(['100', '101']);
      if (element.tag !== 'BpmnSubProcess' || !allowedTypes.has(element.type)) {
        throw new Error('Nesta etapa somente subprocessos comuns e ad-hoc podem ser excluídos.');
      }
    },
    assertIsolatedPayload(element) {
      if (splitReferences(element.attributes.attachedEvents).length) {
        throw new Error(`O subprocesso ${element.id} possui evento anexado.`);
      }
    }
  });
}

function deleteSubProcessWithIncidentFlows(text, elementId) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da exclusão.`);
  }
  const matches = model.elements.filter((item) => item.id === elementId);
  if (matches.length !== 1) throw new Error(`Elemento não encontrado ou duplicado: ${elementId}.`);
  const element = matches[0];
  const allowedTypes = new Set(['100', '101']);
  if (element.tag !== 'BpmnSubProcess' || !allowedTypes.has(element.type)) {
    throw new Error('Nesta etapa somente subprocessos comuns e ad-hoc podem ser excluídos.');
  }
  if (splitReferences(element.attributes.attachedEvents).length) {
    throw new Error(`O subprocesso ${element.id} possui evento anexado.`);
  }

  const incidentFlows = model.flows.filter((flow) => (
    flow.attributes.sourceRef === elementId || flow.attributes.targetRef === elementId
  ));
  const removedFlowIds = new Set(incidentFlows.map((flow) => flow.id));
  for (const flow of incidentFlows) {
    if (isTrueAttribute(flow.attributes.defaultLink)) {
      throw new Error(`O fluxo ${flow.id} é o ramo padrão de um gateway. Remova o fluxo padrão antes de excluir o subprocesso.`);
    }
    const source = model.elements.find((item) => item.id === flow.attributes.sourceRef);
    const target = model.elements.find((item) => item.id === flow.attributes.targetRef);
    if (!source || !target) throw new Error(`O fluxo ${flow.id} possui origem ou destino inexistente.`);
    if (source.tag === 'BpmnGateway' && gatewayConditionTargets(source, target.id)) {
      throw new Error(`O gateway ${source.id} possui uma condição que aponta para ${target.id}. Remova a condição antes de excluir o subprocesso.`);
    }
  }

  const diagramShapes = model.diagram?.children.filter((node) => node.localName === 'children') ?? [];
  const shapeMatches = model.shapes.filter((shape) => shape.businessObject === elementId);
  if (shapeMatches.length !== 1) throw new Error(`O subprocesso ${elementId} não possui um shape Graphiti bijetivo.`);
  const shape = shapeMatches[0];
  const childIndex = diagramShapes.indexOf(shape.node);
  if (childIndex < 0 || shape.node.parent !== model.diagram) {
    throw new Error(`O shape de ${elementId} não é filho direto do diagrama.`);
  }

  const visualConnections = model.diagram?.children.filter((node) => node.localName === 'connections') ?? [];
  const removedConnections = [];
  for (const flow of incidentFlows) {
    const connectionMatches = model.connections.filter((item) => item.businessObject === flow.id);
    if (connectionMatches.length !== 1) {
      throw new Error(`O fluxo ${flow.id} não possui uma conexão Graphiti bijetiva.`);
    }
    const connection = connectionMatches[0];
    const connectionIndex = visualConnections.indexOf(connection.node);
    if (connectionIndex < 0 || connection.node.parent !== model.diagram) {
      throw new Error(`A conexão visual de ${flow.id} não é filha direta do diagrama.`);
    }
    removedConnections.push({ connection, connectionIndex, reference: `/0/@connections.${connectionIndex}` });
  }

  const removedRoots = [
    element.node,
    shape.node,
    ...incidentFlows.map((flow) => flow.node),
    ...removedConnections.map((item) => item.connection.node)
  ];
  walk(model.xml, (node) => {
    if (removedRoots.some((root) => isInsideNode(node, root))) return;
    for (const attribute of node.attributes) {
      if (attributeReferencesIdentifier(attribute.value, elementId)) {
        throw new Error(`${elementId} ainda é referenciado por ${node.localName}.${attribute.name}.`);
      }
    }
  });

  const removedConnectionRefs = new Set(removedConnections.map((item) => item.reference));
  const removedConnectionIndices = removedConnections.map((item) => item.connectionIndex).sort((a, b) => b - a);
  const patches = removedRoots.map((node) => wholeLineRemovalPatch(text, node));
  walk(model.xml, (node) => {
    if (removedRoots.some((root) => isInsideNode(node, root))) return;
    for (const attribute of node.attributes) {
      let value = attribute.value;
      if (['incoming', 'outgoing'].includes(attribute.name)) {
        value = splitReferences(value).filter((reference) => !removedFlowIds.has(reference)).join(' ');
      }
      if (['incomingConnections', 'outgoingConnections'].includes(attribute.name)) {
        value = splitReferences(value).filter((reference) => !removedConnectionRefs.has(reference)).join(' ');
      }
      for (const index of removedConnectionIndices) value = remapConnectionReferences(value, index).value;
      value = remapChildReferences(value, childIndex).value;
      if (value === attribute.value) continue;
      if (value) patchAttribute(text, node, attribute.name, value, patches, { required: true });
      else removeAttribute(text, node, attribute.name, patches);
    }
  });

  const uniquePatches = deduplicatePatches(patches);
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`A exclusão foi recusada porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  if (updatedModel.elements.some((item) => item.id === elementId)
    || updatedModel.shapes.some((item) => item.businessObject === elementId)
    || updatedModel.flows.some((flow) => removedFlowIds.has(flow.id))
    || updatedModel.connections.some((connection) => removedFlowIds.has(connection.businessObject))) {
    throw new Error(`A exclusão de ${elementId} não removeu todas as representações do subprocesso e de seus fluxos.`);
  }
  assertChildReferenceBounds(updatedModel);
  assertConnectionReferenceBounds(updatedModel);
  return {
    text: updatedText,
    changed: true,
    elementId,
    elementTag: element.tag,
    elementType: element.type,
    elementName: element.name,
    childProcessId: String(element.attributes.process ?? '').trim(),
    activityCode: numericSuffix(elementId),
    removedChildIndex: childIndex,
    removedFlowIds: [...removedFlowIds],
    removedConnectionIndices: removedConnections.map((item) => item.connectionIndex),
    model: updatedModel,
    validation,
    patches: uniquePatches
  };
}

function deleteIsolatedArtifact(text, elementId) {
  const initialModel = parseProcess(text);
  const requestedId = String(elementId ?? '');
  const matches = initialModel.elements.filter((item) => item.id === requestedId);
  if (matches.length === 1) {
    const incidentFlows = initialModel.flows.filter((flow) => (
      flow.attributes.sourceRef === requestedId || flow.attributes.targetRef === requestedId
    ));
    if (incidentFlows.length) {
      let updatedText = text;
      const removedFlowIds = [];
      for (const flow of incidentFlows) {
        const result = deleteSequenceFlow(updatedText, flow.id);
        updatedText = result.text;
        removedFlowIds.push(flow.id);
      }
      const result = deleteIsolatedArtifact(updatedText, requestedId);
      return {
        ...result,
        text: result.text,
        removedFlowIds,
        patches: [{ start: 0, end: text.length, value: result.text }]
      };
    }
  }
  return deleteIsolatedDiagramNode(text, elementId, {
    noun: 'artefato',
    selectionMessage: 'Selecione uma anotação, database, documento ou grupo isolado para excluir.',
    assertAllowed(element) {
      const typedArtifacts = new Set(['BpmnAnnotation', 'BpmnDatabase', 'BpmnDocument']);
      const allowed = (typedArtifacts.has(element.tag) && element.type === '0')
        || (element.tag === 'BpmnGroup' && !element.type);
      if (!allowed) {
        throw new Error('Nesta etapa somente anotações, databases, documentos e grupos podem ser excluídos.');
      }
    }
  });
}

function deleteDiagramElements(text, elementIds) {
  const requestedIds = [...new Set((elementIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))];
  if (requestedIds.length < 2) throw new Error('Selecione pelo menos dois elementos para a exclusão múltipla.');
  const initialModel = parseProcess(text);
  const beforeValidation = validateProcess(initialModel);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da exclusão.`);
  }
  const initialById = new Map([...initialModel.elements, ...initialModel.flows].map((item) => [item.id, item]));
  const missing = requestedIds.filter((id) => !initialById.has(id));
  if (missing.length) throw new Error(`Elementos não encontrados: ${missing.join(', ')}.`);
  const unsupported = requestedIds.filter((id) => {
    const element = initialById.get(id);
    if (element.tag === 'SequenceFlow') return false;
    if (element.tag === 'BpmnTask') return !['80', '81', '82', '84', '85', '86', '87'].includes(String(element.type));
    if (element.tag === 'BpmnSubProcess') return !['100', '101'].includes(String(element.type));
    if (element.tag === 'BpmnGateway') return !['120', '121', '126', '127'].includes(String(element.type));
    if (element.tag === 'BpmnStartEvent') return !['10', '12', '13', '14', '16'].includes(String(element.type));
    if (element.tag === 'BpmnEndEvent') return !['60', '63', '64', '65', '66', '68'].includes(String(element.type));
    if (element.tag === 'BpmnIntermediateEvent') return !['30', '32', '35', '36', '37', '39', '41', '42', '43'].includes(String(element.type));
    if (['BpmnPool', 'BpmnSwimLane'].includes(element.tag)) return false;
    if (['BpmnAnnotation', 'BpmnDatabase', 'BpmnDocument', 'BpmnGroup'].includes(element.tag)) return false;
    return true;
  });
  if (unsupported.length) throw new Error(`A exclusão múltipla não aceita: ${unsupported.join(', ')}.`);

  const priority = (id) => {
    const element = initialById.get(id);
    if (element.tag === 'BpmnPool') return 0;
    if (element.tag === 'BpmnIntermediateEvent' && String(element.type) === '43') return 0;
    if (element.tag === 'SequenceFlow') return 3;
    return 1;
  };
  const orderedIds = [...requestedIds].sort((left, right) => priority(left) - priority(right));
  let updatedText = text;
  const outcomes = [];
  const removedFlowIds = new Set();
  for (const id of orderedIds) {
    const currentModel = parseProcess(updatedText);
    const element = [...currentModel.elements, ...currentModel.flows].find((item) => item.id === id);
    if (!element) continue;
    let result;
    if (element.tag === 'SequenceFlow') result = deleteSequenceFlow(updatedText, id);
    else if (element.tag === 'BpmnIntermediateEvent' && String(element.type) === '43') result = deleteAttachedErrorEvent(updatedText, id);
    else if (element.tag === 'BpmnTask') result = deleteIsolatedTask(updatedText, id);
    else if (element.tag === 'BpmnSubProcess') result = deleteIsolatedSubProcess(updatedText, id);
    else if (element.tag === 'BpmnGateway') result = deleteIsolatedGateway(updatedText, id);
    else if (['BpmnStartEvent', 'BpmnEndEvent', 'BpmnIntermediateEvent'].includes(element.tag)) result = deleteIsolatedEvent(updatedText, id);
    else if (['BpmnPool', 'BpmnSwimLane'].includes(element.tag)) result = deleteDiagramContainer(updatedText, id);
    else result = deleteIsolatedArtifact(updatedText, id);
    updatedText = result.text;
    outcomes.push(result);
    for (const flowId of result.removedFlowIds ?? []) removedFlowIds.add(flowId);
    if (element.tag === 'SequenceFlow') removedFlowIds.add(id);
  }

  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`A exclusão múltipla foi recusada porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  const remainingIds = new Set([...updatedModel.elements, ...updatedModel.flows].map((item) => item.id));
  const notRemoved = requestedIds.filter((id) => remainingIds.has(id));
  if (notRemoved.length) throw new Error(`A exclusão múltipla não removeu: ${notRemoved.join(', ')}.`);
  return {
    text: updatedText,
    changed: updatedText !== text,
    elementIds: requestedIds,
    removedFlowIds: [...removedFlowIds],
    outcomes,
    model: updatedModel,
    validation,
    patches: [{ start: 0, end: text.length, value: updatedText }]
  };
}

function deleteDiagramContainer(text, elementId) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da exclusao.`);
  }

  const requestedId = String(elementId ?? '').trim();
  const element = model.elements.find((item) => item.id === requestedId);
  if (!element || !['BpmnPool', 'BpmnSwimLane'].includes(element.tag)) {
    throw new Error('Selecione uma pool ou raia valida para excluir.');
  }
  const shapeMatches = model.shapes.filter((shape) => shape.businessObject === requestedId);
  if (shapeMatches.length !== 1) throw new Error(`O container ${requestedId} nao possui um shape Graphiti bijetivo.`);
  const shape = shapeMatches[0];
  const directShapes = model.diagram?.children.filter((node) => node.localName === 'children') ?? [];
  const directIndex = directShapes.indexOf(shape.node);
  const nested = Boolean(shape.parentBusinessObject);
  let poolShape = null;
  let poolIndex = -1;
  let nestedIndex = -1;
  if (nested) {
    poolShape = model.shapeById.get(shape.parentBusinessObject);
    poolIndex = directShapes.indexOf(poolShape?.node);
    const nestedShapes = poolShape?.node.children.filter((node) => node.localName === 'children') ?? [];
    nestedIndex = nestedShapes.indexOf(shape.node);
    if (!poolShape || poolIndex < 0 || nestedIndex < 0) {
      throw new Error(`A raia ${requestedId} nao possui uma pool visual direta valida.`);
    }
  } else if (directIndex < 0 || shape.node.parent !== model.diagram) {
    throw new Error(`O shape de ${requestedId} nao e filho direto do diagrama.`);
  }

  const nestedLaneIds = element.tag === 'BpmnPool'
    ? model.shapes
      .filter((candidate) => candidate.parentBusinessObject === requestedId)
      .map((candidate) => model.elements.find((item) => item.id === candidate.businessObject))
      .filter((item) => item?.tag === 'BpmnSwimLane')
      .map((item) => item.id)
    : [];
  const removedContainerIds = [requestedId, ...nestedLaneIds];
  const removedIds = new Set(removedContainerIds);
  const removedElements = model.elements.filter((item) => removedIds.has(item.id));
  if (removedElements.length !== removedIds.size) {
    throw new Error(`A estrutura logica de ${requestedId} esta incompleta.`);
  }
  if (model.flows.some((flow) => removedIds.has(flow.attributes.sourceRef) || removedIds.has(flow.attributes.targetRef))) {
    throw new Error(`O container ${requestedId} possui fluxo logico inesperado.`);
  }

  const childRef = nested
    ? `/0/@children.${poolIndex}/@children.${nestedIndex}`
    : `/0/@children.${directIndex}`;
  const pictogramLink = `${childRef}/@link`;
  const pictogramLinks = splitReferences(model.diagram.attributeMap.pictogramLinks?.value);
  if (pictogramLinks.filter((reference) => reference === pictogramLink).length !== 1) {
    throw new Error(`O pictogramLinks nao referencia unicamente o shape de ${requestedId}.`);
  }

  const patches = [wholeLineRemovalPatch(text, shape.node)];
  for (const removedElement of removedElements) patches.push(wholeLineRemovalPatch(text, removedElement.node));

  if (nested) {
    const remainingLanes = nestedLaneShapes(model, shape.parentBusinessObject)
      .filter((candidate) => candidate.businessObject !== requestedId)
      .sort((left, right) => left.localY - right.localY);
    if (remainingLanes.length) {
      const laneHeight = Math.max(40, Math.round(poolShape.height / remainingLanes.length));
      const poolHeight = laneHeight * remainingLanes.length;
      patchNumberAttribute(text, poolShape.graphicsNode, 'height', poolHeight, patches);
      patchContainerLabelHeight(text, poolShape, poolHeight, patches);
      for (const [index, lane] of remainingLanes.entries()) {
        patchNumberAttribute(text, lane.graphicsNode, 'x', 30, patches);
        patchNumberAttribute(text, lane.graphicsNode, 'y', index * laneHeight, patches);
        patchNumberAttribute(text, lane.graphicsNode, 'width', poolShape.width - 30, patches);
        patchNumberAttribute(text, lane.graphicsNode, 'height', laneHeight, patches);
        patchContainerLabelHeight(text, lane, laneHeight, patches);
      }
    }
  }

  walk(model.xml, (node) => {
    if (isInsideNode(node, shape.node) || removedElements.some((item) => isInsideNode(node, item.node))) return;
    for (const attribute of node.attributes) {
      for (const removedId of removedIds) {
        if (attributeReferencesIdentifier(attribute.value, removedId)) {
          throw new Error(`${removedId} ainda e referenciado por ${node.localName}.${attribute.name}.`);
        }
      }
      const remapped = nested
        ? remapNestedChildReferences(attribute.value, poolIndex, nestedIndex)
        : remapChildReferences(attribute.value, directIndex);
      if (!remapped.changed) continue;
      if (remapped.value) patchAttribute(text, node, attribute.name, remapped.value, patches, { required: true });
      else removeAttribute(text, node, attribute.name, patches);
    }
  });

  const uniquePatches = deduplicatePatches(patches);
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`A exclusao foi recusada porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  if (removedContainerIds.some((id) => updatedModel.elements.some((item) => item.id === id)
    || updatedModel.shapes.some((item) => item.businessObject === id))) {
    throw new Error(`A exclusao de ${requestedId} nao removeu todas as representacoes do container.`);
  }
  if (updatedModel.flows.length !== model.flows.length || updatedModel.connections.length !== model.connections.length) {
    throw new Error(`A exclusao de ${requestedId} alterou fluxos indevidamente.`);
  }
  assertChildReferenceBounds(updatedModel);
  return {
    text: updatedText,
    changed: true,
    elementId: requestedId,
    elementTag: element.tag,
    elementName: element.name,
    removedContainerIds,
    removedNestedLaneIds: nestedLaneIds,
    removedChildIndex: nested ? nestedIndex : directIndex,
    parentPoolId: nested ? shape.parentBusinessObject : '',
    model: updatedModel,
    validation,
    patches: uniquePatches
  };
}

function deleteIsolatedDiagramNode(text, elementId, options) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da exclusão.`);
  }

  const requestedId = String(elementId ?? '');
  if (!requestedId) throw new Error(options.selectionMessage);
  const matches = model.elements.filter((item) => item.id === requestedId);
  if (matches.length !== 1) throw new Error(`Elemento não encontrado ou duplicado: ${requestedId}.`);
  const element = matches[0];
  options.assertAllowed(element);
  if (splitReferences(element.attributes.incoming).length || splitReferences(element.attributes.outgoing).length) {
    throw new Error(`O ${options.noun} ${requestedId} possui fluxo de entrada ou saída.`);
  }
  if (model.flows.some((flow) => flow.attributes.sourceRef === requestedId || flow.attributes.targetRef === requestedId)) {
    throw new Error(`O ${options.noun} ${requestedId} ainda é referenciado por um SequenceFlow.`);
  }
  options.assertIsolatedPayload?.(element, model);

  const diagramShapes = model.diagram?.children.filter((node) => node.localName === 'children') ?? [];
  const shapeMatches = model.shapes.filter((shape) => shape.businessObject === requestedId);
  if (shapeMatches.length !== 1) throw new Error(`O ${options.noun} ${requestedId} não possui um shape Graphiti bijetivo.`);
  const shape = shapeMatches[0];
  const childIndex = diagramShapes.indexOf(shape.node);
  if (childIndex < 0 || shape.node.parent !== model.diagram) {
    throw new Error(`O shape de ${requestedId} não é filho direto do diagrama.`);
  }
  const shapeLinks = descendants(shape.node, (node) => (
    node.localName === 'link' && node.attributeMap.businessObjects?.value === requestedId
  ));
  if (shapeLinks.length !== 1) throw new Error(`O shape de ${requestedId} não possui um único link lógico.`);

  const childRef = `/0/@children.${childIndex}`;
  const pictogramLink = `${childRef}/@link`;
  const pictogramLinks = splitReferences(model.diagram.attributeMap.pictogramLinks?.value);
  if (pictogramLinks.filter((reference) => reference === pictogramLink).length !== 1) {
    throw new Error(`O pictogramLinks não referencia unicamente o shape de ${requestedId}.`);
  }

  walk(model.xml, (node) => {
    if (isInsideNode(node, element.node) || isInsideNode(node, shape.node)) return;
    for (const attribute of node.attributes) {
      if (attributeReferencesIdentifier(attribute.value, requestedId)
        && !options.allowIdentifierReference?.(node, attribute, element, model)) {
        throw new Error(`${requestedId} ainda é referenciado por ${node.localName}.${attribute.name}.`);
      }
      if (!attributeReferencesChildIndex(attribute.value, childIndex)) continue;
      const allowedPictogramReference = node === model.diagram
        && attribute.name === 'pictogramLinks'
        && splitReferences(attribute.value)
          .filter((reference) => attributeReferencesChildIndex(reference, childIndex))
          .every((reference) => reference === pictogramLink);
      if (!allowedPictogramReference) {
        throw new Error(`${childRef} ainda é referenciado por ${node.localName}.${attribute.name}.`);
      }
    }
  });

  const patches = [wholeLineRemovalPatch(text, element.node), wholeLineRemovalPatch(text, shape.node)];
  options.patchReferences?.(text, element, model, patches);
  walk(model.xml, (node) => {
    if (isInsideNode(node, element.node) || isInsideNode(node, shape.node)) return;
    for (const attribute of node.attributes) {
      if (!attribute.value.includes('/0/@children.')) continue;
      const remapped = remapChildReferences(attribute.value, childIndex);
      if (!remapped.changed) continue;
      if (remapped.value) patchAttribute(text, node, attribute.name, remapped.value, patches, { required: true });
      else removeAttribute(text, node, attribute.name, patches);
    }
  });

  const uniquePatches = deduplicatePatches(patches);
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`A exclusão foi recusada porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  if (updatedModel.elements.some((item) => item.id === requestedId)
    || updatedModel.shapes.some((item) => item.businessObject === requestedId)) {
    throw new Error(`A exclusão de ${requestedId} não removeu todas as representações do ${options.noun}.`);
  }
  if (updatedModel.flows.length !== model.flows.length || updatedModel.connections.length !== model.connections.length) {
    throw new Error(`A exclusão de ${requestedId} alterou fluxos indevidamente.`);
  }
  assertChildReferenceBounds(updatedModel);
  return {
    text: updatedText,
    changed: true,
    elementId: requestedId,
    elementTag: element.tag,
    elementType: element.type,
    elementName: element.name,
    childProcessId: element.tag === 'BpmnSubProcess' ? String(element.attributes.process ?? '').trim() : '',
    documentId: element.tag === 'BpmnDocument' ? String(element.attributes.documentId ?? '').trim() : '',
    activityCode: numericSuffix(requestedId),
    removedChildIndex: childIndex,
    ...(options.resultFields?.(element, model) ?? {}),
    model: updatedModel,
    validation,
    patches: uniquePatches
  };
}

function createPool(text, request) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da criação.`);
  }
  if (!model.diagram || !model.canvas?.node) throw new Error('O diagrama não possui canvas Graphiti editável.');
  const diagramShapes = model.diagram.children.filter((node) => node.localName === 'children');
  const xmiRoot = model.xml.children.find((node) => node.name === 'xmi:XMI');
  const templateSource = resolveCreationTemplate(text, model, request, findPoolTemplate);
  const template = templateSource?.template;
  if (!template || !xmiRoot) {
    throw new Error('O diagrama não possui um template de pool compatível com o Fluig Studio.');
  }

  const x = layoutNumber(request?.x, 'novaPool.x');
  const y = layoutNumber(request?.y, 'novaPool.y');
  const width = request?.width === undefined ? 430 : layoutDimension(request.width, 'novaPool.width');
  const height = request?.height === undefined ? 290 : layoutDimension(request.height, 'novaPool.height');
  if (width < 150 || height < 100) throw new Error('A nova pool deve ter no mínimo 150×100.');

  const poolNumber = nextGlobalNumber(model);
  const poolId = `${preferredBusinessPrefix(model, 'BpmnPool', 'pool')}${poolNumber}`;
  const styles = model.diagram.children.filter((node) => node.localName === 'styles');
  const colors = model.diagram.children.filter((node) => node.localName === 'colors');
  const styleNodes = containerStyleNodes(templateSource.model, template);
  if (!styleNodes || !styles.length || !colors.length) {
    throw new Error('O template da pool não possui styles/colors compatíveis.');
  }
  const bodyStyleIndex = styles.length;
  const labelStyleIndex = styles.length + 1;
  const colorIndex = colors.length;
  const shapeRef = '/0/@children.0';
  const poolShapeXml = cloneContainerShape(templateSource.text, template, {
    businessObject: poolId,
    shapeRef,
    x,
    y,
    width,
    height,
    bodyStyleRef: `/0/@styles.${bodyStyleIndex}`,
    labelStyleRef: `/0/@styles.${labelStyleIndex}`,
    backgroundRef: `/0/@colors.${colorIndex}`,
    label: 'Pool',
    removeLinkedChildren: true
  });
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const styleXml = styleNodes.map((node) => templateSource.text.slice(node.start, node.closeEnd)).join(`${eol}    `);
  const colorXml = '<colors red="255" green="255" blue="255"/>';
  const patches = [];

  remapDirectChildReferencesForInsertion(text, model, 0, patches, `${shapeRef}/@link`);
  const shapeInsertionOffset = diagramShapes[0]?.start ?? diagramInsertionOffset(model, 'children');
  patches.push({
    start: shapeInsertionOffset,
    end: shapeInsertionOffset,
    value: `${poolShapeXml}${eol}    `
  });
  patches.push({ start: styles.at(-1).closeEnd, end: styles.at(-1).closeEnd, value: `${eol}    ${styleXml}` });
  patches.push({ start: colors.at(-1).closeEnd, end: colors.at(-1).closeEnd, value: `${eol}    ${colorXml}` });
  patches.push({
    start: xmiRoot.closeStart,
    end: xmiRoot.closeStart,
    value: `  <bpmn2:BpmnPool id="${poolId}" name="Pool" cores="FFFFFF"/>${eol}`
  });
  patchNumberAttribute(text, model.canvas.node, 'width', Math.max(model.canvas.width, x + width + 120), patches);
  patchNumberAttribute(text, model.canvas.node, 'height', Math.max(model.canvas.height, y + height + 120), patches);

  return validateCreationResult(text, patches, model, {
    elementId: poolId,
    elementTag: 'BpmnPool',
    expectedShapeDelta: 1
  });
}

function createSwimLane(text, request) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da criação.`);
  }
  if (!model.diagram || !model.canvas?.node) throw new Error('O diagrama não possui canvas Graphiti editável.');
  const poolId = String(request?.poolId ?? '');
  return poolId ? createNestedSwimLane(text, model, request, poolId) : createStandaloneSwimLane(text, model, request);
}

function createIsolatedNode(text, request) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da criação.`);
  }
  if (!model.diagram || !model.canvas?.node) throw new Error('O diagrama não possui canvas Graphiti editável.');
  const definition = isolatedNodeDefinition(String(request?.kind ?? ''), String(request?.subtype ?? ''));
  const diagramShapes = model.diagram.children.filter((node) => node.localName === 'children');
  const templateSource = resolveCreationTemplate(text, model, request, definition.findTemplate);
  const template = templateSource?.template;
  const xmiRoot = model.xml.children.find((node) => node.name === 'xmi:XMI');
  if (!template || !xmiRoot) {
    throw new Error(`O diagrama não possui template visual seguro para criar ${definition.label}.`);
  }
  const x = layoutNumber(request?.x, `${definition.kind}.x`);
  const y = layoutNumber(request?.y, `${definition.kind}.y`);
  const number = nextGlobalNumber(model);
  const elementId = `${definition.prefix}${number}`;
  const shapeIndex = diagramShapes.length;
  const shapeRef = `/0/@children.${shapeIndex}`;
  const shapeXml = cloneIsolatedDirectShape(templateSource.text, templateSource.model, template, {
    elementId,
    shapeRef,
    x,
    y,
    name: definition.name,
    taskImageId: definition.taskImageId
  });
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const logicalXml = definition.logical(elementId);
  const shapeInsertionOffset = diagramInsertionOffset(model, 'children');
  const patches = [
    {
      start: shapeInsertionOffset,
      end: shapeInsertionOffset,
      value: `${diagramShapes.length ? `${eol}    ` : ''}${shapeXml}${eol}    `
    },
    { start: xmiRoot.closeStart, end: xmiRoot.closeStart, value: `  ${logicalXml}${eol}` }
  ];
  patchAttribute(
    text,
    model.diagram,
    'pictogramLinks',
    appendReference(model.diagram.attributeMap.pictogramLinks?.value, `${shapeRef}/@link`),
    patches,
    { required: true }
  );
  patchNumberAttribute(text, model.canvas.node, 'width', Math.max(model.canvas.width, x + template.width + 120), patches);
  patchNumberAttribute(text, model.canvas.node, 'height', Math.max(model.canvas.height, y + template.height + 120), patches);
  return validateCreationResult(text, patches, model, {
    elementId,
    elementTag: definition.tag,
    expectedShapeDelta: 1
  });
}

function createAttachedErrorEvent(text, request) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da criação.`);
  }
  if (!model.diagram || !model.canvas?.node) throw new Error('O diagrama não possui canvas Graphiti editável.');

  const taskId = String(request?.taskId ?? '').trim();
  const task = model.elements.find((element) => element.id === taskId);
  if (!task || task.tag !== 'BpmnTask' || task.type !== '82') {
    throw new Error('A captura de erro deve ser anexada a uma atividade de serviço.');
  }
  if (String(task.attributes.executionType ?? '') !== '1') {
    throw new Error('A captura de erro só pode ser anexada a uma atividade de serviço automatizada.');
  }
  if (splitReferences(task.attributes.attachedEvents).length) {
    throw new Error('A atividade de serviço já possui uma tratativa de erro anexada.');
  }

  const diagramShapes = model.diagram.children.filter((node) => node.localName === 'children');
  const templateSource = resolveCreationTemplate(
    text,
    model,
    request,
    (candidateModel, candidateShapes) => findTypedElementTemplate(
      candidateModel,
      candidateShapes,
      'BpmnIntermediateEvent',
      '43'
    )
  );
  const template = templateSource?.template;
  const lastShape = diagramShapes.at(-1);
  const xmiRoot = model.xml.children.find((node) => node.name === 'xmi:XMI');
  if (!template || !lastShape || !xmiRoot) {
    throw new Error('O diagrama não possui um template visual seguro de captura de erro.');
  }

  const x = layoutNumber(request?.x, 'capturaErro.x');
  const y = layoutNumber(request?.y, 'capturaErro.y');
  const number = nextGlobalNumber(model);
  const prefix = String(template.businessObject || '').replace(/\d+$/, '') || 'intermediateerror';
  const elementId = `${prefix}${number}`;
  const shapeIndex = diagramShapes.length;
  const shapeRef = `/0/@children.${shapeIndex}`;
  const shapeXml = cloneIsolatedDirectShape(templateSource.text, templateSource.model, template, {
    elementId,
    shapeRef,
    x,
    y,
    name: 'Tratativa de erro'
  });
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const logicalXml = `<bpmn2:BpmnIntermediateEvent id="${elementId}" name="Tratativa de erro" type="43" sequenceAttached="${numericSuffix(taskId)}" signalId="0" parentTask="${encodeXmlAttribute(taskId)}"/>`;
  const patches = [
    { start: lastShape.closeEnd, end: lastShape.closeEnd, value: `${eol}    ${shapeXml}` },
    { start: xmiRoot.closeStart, end: xmiRoot.closeStart, value: `  ${logicalXml}${eol}` }
  ];
  patchAttribute(text, task.node, 'attachedEvents', elementId, patches, { required: true });
  patchAttribute(
    text,
    model.diagram,
    'pictogramLinks',
    appendReference(model.diagram.attributeMap.pictogramLinks?.value, `${shapeRef}/@link`),
    patches,
    { required: true }
  );
  patchNumberAttribute(text, model.canvas.node, 'width', Math.max(model.canvas.width, x + template.width + 120), patches);
  patchNumberAttribute(text, model.canvas.node, 'height', Math.max(model.canvas.height, y + template.height + 120), patches);

  const result = validateCreationResult(text, patches, model, {
    elementId,
    elementTag: 'BpmnIntermediateEvent',
    expectedShapeDelta: 1
  });
  const created = result.model.elements.find((element) => element.id === elementId);
  const updatedTask = result.model.elements.find((element) => element.id === taskId);
  if (created?.attributes.parentTask !== taskId
    || created?.attributes.sequenceAttached !== numericSuffix(taskId)
    || !splitReferences(updatedTask?.attributes.attachedEvents).includes(elementId)) {
    throw new Error('A criação não preservou o vínculo bidirecional da tratativa de erro.');
  }
  return { ...result, parentTaskId: taskId };
}

function isolatedNodeDefinition(kind, requestedSubtype = '') {
  const subtypeCatalog = {
    start: {
      defaultType: '10', tag: 'BpmnStartEvent',
      types: {
        '10': { prefix: 'startevent', name: 'Início', label: 'evento inicial simples' },
        '12': { prefix: 'starttimer', name: 'Início', label: 'evento inicial temporizador' },
        '13': { prefix: 'startconditional', name: 'Início', label: 'evento inicial condicional' },
        '14': { prefix: 'startsignal', name: 'Início', label: 'evento inicial por sinal' },
        '16': { prefix: 'startmultiple', name: 'Início', label: 'evento inicial múltiplo' }
      },
      logical: (id, type, name) => `<bpmn2:BpmnStartEvent id="${id}" name="${encodeXmlAttribute(name)}" type="${type}" signalId="0" expediente="" selecionaColaboradores="1" esforcoCalculo="0"/>`
    },
    end: {
      defaultType: '60', tag: 'BpmnEndEvent',
      types: {
        '60': { prefix: 'endevent', name: 'Fim', label: 'evento final simples' },
        '63': { prefix: 'enderror', name: 'Final com erro', label: 'evento final com erro' },
        '64': { prefix: 'endsignal', name: 'Fim com envio de sinal', label: 'evento final com sinal' },
        '65': { prefix: 'endcancel', name: 'Fim com cancelamento de processo', label: 'evento final cancelado' },
        '66': { prefix: 'endmultiple', name: 'Fim múltiplo', label: 'evento final múltiplo' },
        '68': { prefix: 'endterminate', name: 'Terminação imediata de processo', label: 'evento final de terminação' }
      },
      logical: (id, type, name) => `<bpmn2:BpmnEndEvent id="${id}" name="${encodeXmlAttribute(name)}" type="${type}" signalId="0"/>`
    },
    intermediate: {
      defaultType: '30', tag: 'BpmnIntermediateEvent',
      types: {
        '30': { prefix: 'intermediateevent', name: 'Intermediário', label: 'evento intermediário simples' },
        '32': { prefix: 'intermediatetimer', name: 'Intermediário', label: 'evento intermediário temporizador' },
        '35': { prefix: 'intermediateconditional', name: 'Intermediário', label: 'evento intermediário condicional' },
        '36': { prefix: 'intermediatelink', name: 'Intermediário', label: 'evento intermediário de link' },
        '37': { prefix: 'intermediatesignal', name: 'Intermediário', label: 'evento intermediário de envio de sinal' },
        '39': { prefix: 'intermediatemultiple', name: 'Intermediário', label: 'evento intermediário múltiplo' },
        '41': { prefix: 'intermediatesignalreceive', name: 'Intermediário', label: 'evento intermediário de recebimento de sinal' },
        '42': { prefix: 'intermediatelinkreceive', name: 'Intermediário', label: 'evento intermediário de recebimento de link' }
      },
      logical: (id, type, name) => `<bpmn2:BpmnIntermediateEvent id="${id}" name="${encodeXmlAttribute(name)}" type="${type}" sequenceAttached="0" signalId="0"/>`
    },
    task: {
      defaultType: '80', tag: 'BpmnTask',
      types: Object.fromEntries(Object.entries(TASK_TYPE_CONVERSIONS).map(([type, value]) => [type, {
        prefix: value.prefix,
        name: value.label.charAt(0).toUpperCase() + value.label.slice(1),
        label: value.label,
        taskImageId: value.imageId
      }])),
      logical: (id, type, name) => `<bpmn2:BpmnTask id="${id}" name="${encodeXmlAttribute(name)}" type="${type}" loopType="0" authNotify="true" expediente="" selecionaColaboradores="1" esforcoCalculo="0" executionAttempts="0" frequency="0"/>`
    },
    subprocess: {
      defaultType: '100', tag: 'BpmnSubProcess',
      types: {
        '100': { prefix: 'subprocess', name: 'Subprocesso', label: 'subprocesso comum' },
        '101': { prefix: 'adhocsubprocess', name: 'Ad-Hoc', label: 'subprocesso ad-hoc' }
      },
      logical: (id, type, name) => type === '101'
        ? `<bpmn2:BpmnSubProcess id="${id}" name="${encodeXmlAttribute(name)}" type="101" managerMechanism="" loopType="0" instructions="" initialTask="false" selectColleague="1"/>`
        : `<bpmn2:BpmnSubProcess id="${id}" name="${encodeXmlAttribute(name)}" type="100" process="" loopType="0" transferAttachments="false" selectColleague="1" cancelSubProcess="false" sendToNextTaskInSubProcess="false"/>`
    },
    gateway: {
      defaultType: '120', tag: 'BpmnGateway',
      types: {
        '120': { prefix: 'exclusivegateway', name: 'Exclusivo', label: 'gateway exclusivo' },
        '121': { prefix: 'inclusivegateway', name: 'Inclusivo', label: 'gateway inclusivo' },
        '126': { prefix: 'parallelgateway', name: 'Paralelo', label: 'gateway paralelo' },
        '127': { prefix: 'joingateway', name: 'Join', label: 'gateway join' }
      },
      logical: (id, type, name) => `<bpmn2:BpmnGateway id="${id}" name="${encodeXmlAttribute(name)}" type="${type}" condition="&lt;list/>"/>`
    }
  };
  const subtypeGroup = subtypeCatalog[kind];
  if (subtypeGroup) {
    const subtype = requestedSubtype || subtypeGroup.defaultType;
    const selected = subtypeGroup.types[subtype];
    if (!selected) throw new Error(`Subtipo ${subtype || '(vazio)'} não suportado para ${kind}.`);
    return {
      kind,
      tag: subtypeGroup.tag,
      subtype,
      ...selected,
      findTemplate: (model, shapes) => findTypedElementTemplate(
        model,
        shapes,
        subtypeGroup.tag,
        subtype,
        kind === 'task' ? '80' : (kind === 'subprocess' ? (subtype === '100' ? '101' : '100') : '')
      ),
      logical: (id) => subtypeGroup.logical(id, subtype, selected.name)
    };
  }
  const definitions = {
    database: {
      kind: 'database', label: 'database', tag: 'BpmnDatabase', prefix: 'databasetask', name: 'Database',
      findTemplate: (model, shapes) => findArtifactTemplate(model, shapes, 'BpmnDatabase'),
      logical: (id) => `<bpmn2:BpmnDatabase id="${id}" name="Database" type="0"/>`
    },
    annotation: {
      kind: 'annotation', label: 'anotação', tag: 'BpmnAnnotation', prefix: 'annotationtask', name: 'Anotação',
      findTemplate: (model, shapes) => findArtifactTemplate(model, shapes, 'BpmnAnnotation'),
      logical: (id) => `<bpmn2:BpmnAnnotation id="${id}" name="${encodeXmlAttribute('Anotação')}" type="0"/>`
    },
    document: {
      kind: 'document', label: 'documento', tag: 'BpmnDocument', prefix: 'documenttask', name: 'Documento',
      findTemplate: (model, shapes) => findArtifactTemplate(model, shapes, 'BpmnDocument'),
      logical: (id) => `<bpmn2:BpmnDocument id="${id}" name="Documento" type="0"/>`
    }
  };
  const definition = definitions[kind];
  if (!definition) throw new Error(`Tipo de elemento isolado não suportado: ${kind || '(vazio)'}.`);
  return definition;
}

function createNestedSwimLane(text, model, request, poolId) {
  const pool = model.elements.find((element) => element.id === poolId && element.tag === 'BpmnPool');
  const poolShape = model.shapeById.get(poolId);
  const diagramShapes = model.diagram.children.filter((node) => node.localName === 'children');
  const poolIndex = diagramShapes.indexOf(poolShape?.node);
  if (!pool || !poolShape || poolIndex < 0 || poolShape.parentBusinessObject) {
    throw new Error('A nova raia exige uma pool direta e editável.');
  }
  const nestedLanes = nestedLaneShapes(model, poolId).sort((left, right) => left.localY - right.localY);
  const poolChildren = poolShape.node.children.filter((node) => node.localName === 'children');
  const insertionNode = poolChildren[0];
  const xmiRoot = model.xml.children.find((node) => node.name === 'xmi:XMI');
  const templateSource = resolveCreationTemplate(
    text,
    model,
    request,
    (candidateModel) => findSwimLaneTemplate(candidateModel, true)
  );
  const template = templateSource?.template;
  if (!template || !insertionNode || !xmiRoot) {
    throw new Error('A pool não possui estrutura/template compatível para receber uma raia.');
  }
  if (poolShape.width <= 30 || poolShape.height < 80) throw new Error('A pool é pequena demais para receber uma raia.');

  const laneNumber = nextGlobalNumber(model);
  const laneId = `${preferredBusinessPrefix(model, 'BpmnSwimLane', 'swimlane')}${laneNumber}`;
  const styles = model.diagram.children.filter((node) => node.localName === 'styles');
  const colors = model.diagram.children.filter((node) => node.localName === 'colors');
  const styleNodes = containerStyleNodes(templateSource.model, template);
  if (!styleNodes || !styles.length || !colors.length) throw new Error('O template da raia não possui styles/colors compatíveis.');

  const visualOrder = [...nestedLanes, { businessObject: laneId }];
  const baseHeight = Math.floor(poolShape.height / visualOrder.length);
  if (baseHeight < 40) throw new Error('A pool não possui altura suficiente para dividir suas raias com segurança.');
  let currentY = 0;
  const patches = [];
  for (let index = 0; index < nestedLanes.length; index += 1) {
    const shape = nestedLanes[index];
    const height = index === visualOrder.length - 1 ? poolShape.height - currentY : baseHeight;
    patchNumberAttribute(text, shape.graphicsNode, 'x', 30, patches);
    patchNumberAttribute(text, shape.graphicsNode, 'y', currentY, patches);
    patchNumberAttribute(text, shape.graphicsNode, 'width', poolShape.width - 30, patches);
    patchNumberAttribute(text, shape.graphicsNode, 'height', height, patches);
    patchContainerLabelHeight(text, shape, height, patches);
    currentY += height;
  }
  const newHeight = poolShape.height - currentY;
  const palette = lanePalette(nestedLanes.length, true);
  const color = ensureVisualColor(text, colors, palette, patches);
  const bodyStyleIndex = styles.length;
  const labelStyleIndex = styles.length + 1;
  const poolRef = `/0/@children.${poolIndex}`;
  const laneRef = `${poolRef}/@children.0`;
  const laneShapeXml = cloneContainerShape(templateSource.text, template, {
    businessObject: laneId,
    shapeRef: laneRef,
    x: 30,
    y: currentY,
    width: poolShape.width - 30,
    height: newHeight,
    bodyStyleRef: `/0/@styles.${bodyStyleIndex}`,
    labelStyleRef: `/0/@styles.${labelStyleIndex}`,
    backgroundRef: `/0/@colors.${color.index}`,
    label: 'SwimLane',
    removeLinkedChildren: true
  });
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const styleXml = styleNodes.map((node) => templateSource.text.slice(node.start, node.closeEnd)).join(`${eol}    `);

  remapNestedChildReferencesForInsertion(text, model, poolIndex, 0, patches, `${laneRef}/@link`);
  patches.push({ start: insertionNode.start, end: insertionNode.start, value: `${laneShapeXml}${eol}      ` });
  patches.push({ start: styles.at(-1).closeEnd, end: styles.at(-1).closeEnd, value: `${eol}    ${styleXml}` });
  patches.push({
    start: xmiRoot.closeStart,
    end: xmiRoot.closeStart,
    value: `  <bpmn2:BpmnSwimLane id="${laneId}" name="SwimLane" cores="${palette}"/>${eol}`
  });

  return validateCreationResult(text, patches, model, {
    elementId: laneId,
    elementTag: 'BpmnSwimLane',
    expectedShapeDelta: 1,
    poolId
  });
}

function createStandaloneSwimLane(text, model, request) {
  const diagramShapes = model.diagram.children.filter((node) => node.localName === 'children');
  const xmiRoot = model.xml.children.find((node) => node.name === 'xmi:XMI');
  const templateSource = resolveCreationTemplate(
    text,
    model,
    request,
    (candidateModel) => findSwimLaneTemplate(candidateModel, false)
  );
  const template = templateSource?.template;
  if (!template || !xmiRoot) {
    throw new Error('O diagrama não possui um template de raia independente compatível.');
  }
  const x = layoutNumber(request?.x, 'novaRaia.x');
  const y = layoutNumber(request?.y, 'novaRaia.y');
  const width = request?.width === undefined ? 301 : layoutDimension(request.width, 'novaRaia.width');
  const height = request?.height === undefined ? 145 : layoutDimension(request.height, 'novaRaia.height');
  if (width < 120 || height < 80) throw new Error('A nova raia deve ter no mínimo 120×80.');

  const laneNumber = nextGlobalNumber(model);
  const laneId = `${preferredBusinessPrefix(model, 'BpmnSwimLane', 'swimlane')}${laneNumber}`;
  const styles = model.diagram.children.filter((node) => node.localName === 'styles');
  const colors = model.diagram.children.filter((node) => node.localName === 'colors');
  const styleNodes = containerStyleNodes(templateSource.model, template);
  if (!styleNodes || !styles.length || !colors.length) throw new Error('O template da raia não possui styles/colors compatíveis.');
  const palette = lanePalette(0, false);
  const patches = [];
  const color = ensureVisualColor(text, colors, palette, patches);
  const shapeRef = '/0/@children.0';
  const laneShapeXml = cloneContainerShape(templateSource.text, template, {
    businessObject: laneId,
    shapeRef,
    x,
    y,
    width,
    height,
    bodyStyleRef: `/0/@styles.${styles.length}`,
    labelStyleRef: `/0/@styles.${styles.length + 1}`,
    backgroundRef: `/0/@colors.${color.index}`,
    label: 'SwimLane',
    removeLinkedChildren: true
  });
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const styleXml = styleNodes.map((node) => templateSource.text.slice(node.start, node.closeEnd)).join(`${eol}    `);
  remapDirectChildReferencesForInsertion(text, model, 0, patches, `${shapeRef}/@link`);
  const shapeInsertionOffset = diagramShapes[0]?.start ?? diagramInsertionOffset(model, 'children');
  patches.push({
    start: shapeInsertionOffset,
    end: shapeInsertionOffset,
    value: `${laneShapeXml}${eol}    `
  });
  patches.push({ start: styles.at(-1).closeEnd, end: styles.at(-1).closeEnd, value: `${eol}    ${styleXml}` });
  patches.push({
    start: xmiRoot.closeStart,
    end: xmiRoot.closeStart,
    value: `  <bpmn2:BpmnSwimLane id="${laneId}" name="SwimLane" cores="${palette}"/>${eol}`
  });
  patchNumberAttribute(text, model.canvas.node, 'width', Math.max(model.canvas.width, x + width + 120), patches);
  patchNumberAttribute(text, model.canvas.node, 'height', Math.max(model.canvas.height, y + height + 120), patches);
  return validateCreationResult(text, patches, model, {
    elementId: laneId,
    elementTag: 'BpmnSwimLane',
    expectedShapeDelta: 1
  });
}

function createConnectedTask(text, request) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da criação.`);
  }
  const sourceId = String(request?.sourceId ?? '');
  const source = model.elements.find((item) => item.id === sourceId);
  if (!source || !['BpmnStartEvent', 'BpmnTask', 'BpmnSubProcess', 'BpmnGateway', 'BpmnIntermediateEvent'].includes(source.tag)) {
    throw new Error('A nova atividade exige uma origem executável existente.');
  }
  const sourceShape = model.shapeById.get(sourceId);
  const diagramShapes = model.diagram.children.filter((node) => node.localName === 'children');
  const sourceIndex = diagramShapes.indexOf(sourceShape?.node);
  if (sourceIndex < 0) throw new Error('A origem precisa ter um shape Graphiti direto no diagrama.');
  const sourceAnchor = sourceShape.node.children.find((node) => (
    node.localName === 'anchors' && node.attributeMap['xsi:type']?.value === 'pi:ChopboxAnchor'
  )) ?? sourceShape.node.children.find((node) => node.localName === 'anchors');
  if (!sourceAnchor) throw new Error('A origem não possui ChopboxAnchor compatível.');
  const sourceAnchors = sourceShape.node.children.filter((node) => node.localName === 'anchors');
  if (sourceAnchors.indexOf(sourceAnchor) !== 0) {
    throw new Error('A origem usa uma âncora Graphiti incompatível com a criação segura.');
  }

  const visualConnections = model.diagram.children.filter((node) => node.localName === 'connections');
  const connectionTemplateSource = resolveCreationTemplate(
    text,
    model,
    request,
    (candidateModel) => findRegularConnectionTemplate(candidateModel)
  );
  const taskTemplateSource = resolveCreationTemplate(text, model, request, findDefaultTaskTemplate);
  const connectionTemplate = connectionTemplateSource?.template;
  const taskTemplate = taskTemplateSource?.template;
  const lastShape = diagramShapes.at(-1);
  const xmiRoot = model.xml.children.find((node) => node.name === 'xmi:XMI');
  if (!connectionTemplate || !taskTemplate || !lastShape || !xmiRoot) {
    throw new Error('O diagrama não possui templates visuais seguros para criar atividade e fluxo.');
  }
  const templateAnchors = taskTemplate.node.children.filter((node) => node.localName === 'anchors');
  if (templateAnchors[0]?.attributeMap['xsi:type']?.value !== 'pi:ChopboxAnchor') {
    throw new Error('O template da atividade não possui ChopboxAnchor na posição esperada.');
  }

  const x = layoutNumber(request?.x, 'novaAtividade.x');
  const y = layoutNumber(request?.y, 'novaAtividade.y');
  const taskNumber = nextGlobalNumber(model);
  const taskId = `task${taskNumber}`;
  const flowId = `flow${taskNumber + 1}`;
  const shapeIndex = diagramShapes.length;
  const connectionIndex = visualConnections.length;
  const shapeRef = `/0/@children.${shapeIndex}`;
  const connectionRef = `/0/@connections.${connectionIndex}`;
  const taskShapeXml = cloneDefaultTaskShape(taskTemplateSource.text, taskTemplate, {
    taskId,
    shapeRef,
    connectionRef,
    x,
    y,
    name: 'Atividade'
  });
  const bendpoints = normalizeLayoutBendpoints(request?.bendpoints ?? [], flowId);
  const connectionXml = cloneRegularConnection(connectionTemplateSource.text, connectionTemplate, {
    flowId,
    start: `/0/@children.${sourceIndex}/@anchors.0`,
    end: `${shapeRef}/@anchors.0`,
    bendpoints
  });
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const logicalTask = `  <bpmn2:BpmnTask id="${taskId}" name="Atividade" incoming="${flowId}" type="80" loopType="0" authNotify="true" expediente="" selecionaColaboradores="1" esforcoCalculo="0" executionAttempts="0" frequency="0"/>`;
  const logicalFlow = `  <bpmn2:SequenceFlow id="${flowId}" name="" sourceRef="${sourceId}" targetRef="${taskId}" atividadeFluxo=""/>`;
  const connectionInsertionOffset = diagramInsertionOffset(model, 'connections');
  const patches = [
    { start: lastShape.closeEnd, end: lastShape.closeEnd, value: `${eol}    ${taskShapeXml}` },
    {
      start: connectionInsertionOffset,
      end: connectionInsertionOffset,
      value: `${visualConnections.length ? `${eol}    ` : ''}${connectionXml}${eol}    `
    },
    { start: xmiRoot.closeStart, end: xmiRoot.closeStart, value: `${logicalTask}${eol}${logicalFlow}${eol}` }
  ];
  patchAttribute(text, source.node, 'outgoing', appendReference(source.attributes.outgoing, flowId), patches, { required: true });
  patchAttribute(text, sourceAnchor, 'outgoingConnections', appendReference(sourceAnchor.attributeMap.outgoingConnections?.value, connectionRef), patches, { required: true });
  patchAttribute(
    text,
    model.diagram,
    'pictogramLinks',
    appendReference(appendReference(model.diagram.attributeMap.pictogramLinks?.value, `${shapeRef}/@link`), `${connectionRef}/@link`),
    patches,
    { required: true }
  );
  patchNumberAttribute(text, model.canvas.node, 'width', Math.max(model.canvas.width, x + taskTemplate.width + 120), patches);
  patchNumberAttribute(text, model.canvas.node, 'height', Math.max(model.canvas.height, y + taskTemplate.height + 120), patches);

  const uniquePatches = deduplicatePatches(patches);
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`A criação foi recusada porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  return {
    text: updatedText,
    changed: true,
    taskId,
    activityId: String(taskNumber),
    flowId,
    model: updatedModel,
    validation,
    patches: uniquePatches
  };
}

function createConnectedGateway(text, request) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da criação.`);
  }
  const sourceId = String(request?.sourceId ?? '');
  const source = model.elements.find((item) => item.id === sourceId);
  if (!source || !['BpmnStartEvent', 'BpmnTask', 'BpmnSubProcess', 'BpmnGateway', 'BpmnIntermediateEvent'].includes(source.tag)) {
    throw new Error('O novo gateway exige uma origem executável existente.');
  }
  const sourceShape = model.shapeById.get(sourceId);
  const diagramShapes = model.diagram.children.filter((node) => node.localName === 'children');
  const sourceIndex = diagramShapes.indexOf(sourceShape?.node);
  if (sourceIndex < 0) throw new Error('A origem precisa ter um shape Graphiti direto no diagrama.');
  const sourceAnchor = sourceShape.node.children.find((node) => (
    node.localName === 'anchors' && node.attributeMap['xsi:type']?.value === 'pi:ChopboxAnchor'
  )) ?? sourceShape.node.children.find((node) => node.localName === 'anchors');
  if (!sourceAnchor) throw new Error('A origem não possui ChopboxAnchor compatível.');
  const sourceAnchors = sourceShape.node.children.filter((node) => node.localName === 'anchors');
  if (sourceAnchors.indexOf(sourceAnchor) !== 0) {
    throw new Error('A origem usa uma âncora Graphiti incompatível com a criação segura.');
  }

  const visualConnections = model.diagram.children.filter((node) => node.localName === 'connections');
  const connectionTemplateSource = resolveCreationTemplate(
    text,
    model,
    request,
    (candidateModel) => findRegularConnectionTemplate(candidateModel)
  );
  const gatewayTemplateSource = resolveCreationTemplate(text, model, request, findExclusiveGatewayTemplate);
  const connectionTemplate = connectionTemplateSource?.template;
  const gatewayTemplate = gatewayTemplateSource?.template;
  const lastShape = diagramShapes.at(-1);
  const xmiRoot = model.xml.children.find((node) => node.name === 'xmi:XMI');
  if (!connectionTemplate || !gatewayTemplate || !lastShape || !xmiRoot) {
    throw new Error('O diagrama não possui templates visuais seguros para criar gateway e fluxo.');
  }
  const templateAnchors = gatewayTemplate.node.children.filter((node) => node.localName === 'anchors');
  if (templateAnchors[0]?.attributeMap['xsi:type']?.value !== 'pi:ChopboxAnchor') {
    throw new Error('O template do gateway não possui ChopboxAnchor na posição esperada.');
  }

  const x = layoutNumber(request?.x, 'novoGateway.x');
  const y = layoutNumber(request?.y, 'novoGateway.y');
  const gatewayNumber = nextGlobalNumber(model);
  const gatewayId = `exclusivegateway${gatewayNumber}`;
  const flowId = `flow${gatewayNumber + 1}`;
  const shapeIndex = diagramShapes.length;
  const connectionIndex = visualConnections.length;
  const shapeRef = `/0/@children.${shapeIndex}`;
  const connectionRef = `/0/@connections.${connectionIndex}`;
  const gatewayShapeXml = cloneExclusiveGatewayShape(gatewayTemplateSource.text, gatewayTemplate, {
    gatewayId,
    shapeRef,
    connectionRef,
    x,
    y
  });
  const bendpoints = normalizeLayoutBendpoints(request?.bendpoints ?? [], flowId);
  const connectionXml = cloneRegularConnection(connectionTemplateSource.text, connectionTemplate, {
    flowId,
    start: `/0/@children.${sourceIndex}/@anchors.0`,
    end: `${shapeRef}/@anchors.0`,
    bendpoints
  });
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const logicalGateway = `  <bpmn2:BpmnGateway id="${gatewayId}" name="Exclusivo" incoming="${flowId}" type="120" condition="&lt;list/>"/>`;
  const logicalFlow = `  <bpmn2:SequenceFlow id="${flowId}" name="" sourceRef="${sourceId}" targetRef="${gatewayId}" atividadeFluxo=""/>`;
  const connectionInsertionOffset = diagramInsertionOffset(model, 'connections');
  const patches = [
    { start: lastShape.closeEnd, end: lastShape.closeEnd, value: `${eol}    ${gatewayShapeXml}` },
    {
      start: connectionInsertionOffset,
      end: connectionInsertionOffset,
      value: `${visualConnections.length ? `${eol}    ` : ''}${connectionXml}${eol}    `
    },
    { start: xmiRoot.closeStart, end: xmiRoot.closeStart, value: `${logicalGateway}${eol}${logicalFlow}${eol}` }
  ];
  patchAttribute(text, source.node, 'outgoing', appendReference(source.attributes.outgoing, flowId), patches, { required: true });
  patchAttribute(text, sourceAnchor, 'outgoingConnections', appendReference(sourceAnchor.attributeMap.outgoingConnections?.value, connectionRef), patches, { required: true });
  patchAttribute(
    text,
    model.diagram,
    'pictogramLinks',
    appendReference(appendReference(model.diagram.attributeMap.pictogramLinks?.value, `${shapeRef}/@link`), `${connectionRef}/@link`),
    patches,
    { required: true }
  );
  patchNumberAttribute(text, model.canvas.node, 'width', Math.max(model.canvas.width, x + gatewayTemplate.width + 120), patches);
  patchNumberAttribute(text, model.canvas.node, 'height', Math.max(model.canvas.height, y + gatewayTemplate.height + 120), patches);

  const uniquePatches = deduplicatePatches(patches);
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`A criação foi recusada porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  return {
    text: updatedText,
    changed: true,
    gatewayId,
    activityId: String(gatewayNumber),
    flowId,
    model: updatedModel,
    validation,
    patches: uniquePatches
  };
}

function createConnectedIntermediateEvent(text, request) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da criação.`);
  }
  const sourceId = String(request?.sourceId ?? '');
  const source = model.elements.find((item) => item.id === sourceId);
  if (!source || !['BpmnStartEvent', 'BpmnTask', 'BpmnSubProcess', 'BpmnGateway', 'BpmnIntermediateEvent'].includes(source.tag)) {
    throw new Error('O novo evento intermediário exige uma origem executável existente.');
  }
  const sourceShape = model.shapeById.get(sourceId);
  const diagramShapes = model.diagram.children.filter((node) => node.localName === 'children');
  const sourceIndex = diagramShapes.indexOf(sourceShape?.node);
  if (sourceIndex < 0) throw new Error('A origem precisa ter um shape Graphiti direto no diagrama.');
  const sourceAnchor = sourceShape.node.children.find((node) => (
    node.localName === 'anchors' && node.attributeMap['xsi:type']?.value === 'pi:ChopboxAnchor'
  )) ?? sourceShape.node.children.find((node) => node.localName === 'anchors');
  if (!sourceAnchor) throw new Error('A origem não possui ChopboxAnchor compatível.');
  const sourceAnchors = sourceShape.node.children.filter((node) => node.localName === 'anchors');
  if (sourceAnchors.indexOf(sourceAnchor) !== 0) {
    throw new Error('A origem usa uma âncora Graphiti incompatível com a criação segura.');
  }

  const visualConnections = model.diagram.children.filter((node) => node.localName === 'connections');
  const connectionTemplateSource = resolveCreationTemplate(
    text,
    model,
    request,
    (candidateModel) => findRegularConnectionTemplate(candidateModel)
  );
  const eventTemplateSource = resolveCreationTemplate(text, model, request, findIntermediateEventTemplate);
  const connectionTemplate = connectionTemplateSource?.template;
  const eventTemplate = eventTemplateSource?.template;
  const lastShape = diagramShapes.at(-1);
  const xmiRoot = model.xml.children.find((node) => node.name === 'xmi:XMI');
  if (!connectionTemplate || !eventTemplate || !lastShape || !xmiRoot) {
    throw new Error('O diagrama não possui templates visuais seguros para criar evento intermediário e fluxo.');
  }
  const templateAnchors = eventTemplate.node.children.filter((node) => node.localName === 'anchors');
  if (templateAnchors[0]?.attributeMap['xsi:type']?.value !== 'pi:ChopboxAnchor') {
    throw new Error('O template do evento intermediário não possui ChopboxAnchor na posição esperada.');
  }

  const x = layoutNumber(request?.x, 'novoEventoIntermediario.x');
  const y = layoutNumber(request?.y, 'novoEventoIntermediario.y');
  const eventNumber = nextGlobalNumber(model);
  const eventId = `intermediateevent${eventNumber}`;
  const flowId = `flow${eventNumber + 1}`;
  const shapeIndex = diagramShapes.length;
  const connectionIndex = visualConnections.length;
  const shapeRef = `/0/@children.${shapeIndex}`;
  const connectionRef = `/0/@connections.${connectionIndex}`;
  const eventShapeXml = cloneIntermediateEventShape(eventTemplateSource.text, eventTemplate, {
    eventId,
    shapeRef,
    connectionRef,
    x,
    y
  });
  const bendpoints = normalizeLayoutBendpoints(request?.bendpoints ?? [], flowId);
  const connectionXml = cloneRegularConnection(connectionTemplateSource.text, connectionTemplate, {
    flowId,
    start: `/0/@children.${sourceIndex}/@anchors.0`,
    end: `${shapeRef}/@anchors.0`,
    bendpoints
  });
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const name = encodeXmlAttribute('Intermediário');
  const logicalEvent = `  <bpmn2:BpmnIntermediateEvent id="${eventId}" name="${name}" incoming="${flowId}" type="30" sequenceAttached="0" signalId="0"/>`;
  const logicalFlow = `  <bpmn2:SequenceFlow id="${flowId}" name="" sourceRef="${sourceId}" targetRef="${eventId}" atividadeFluxo=""/>`;
  const connectionInsertionOffset = diagramInsertionOffset(model, 'connections');
  const patches = [
    { start: lastShape.closeEnd, end: lastShape.closeEnd, value: `${eol}    ${eventShapeXml}` },
    {
      start: connectionInsertionOffset,
      end: connectionInsertionOffset,
      value: `${visualConnections.length ? `${eol}    ` : ''}${connectionXml}${eol}    `
    },
    { start: xmiRoot.closeStart, end: xmiRoot.closeStart, value: `${logicalEvent}${eol}${logicalFlow}${eol}` }
  ];
  patchAttribute(text, source.node, 'outgoing', appendReference(source.attributes.outgoing, flowId), patches, { required: true });
  patchAttribute(text, sourceAnchor, 'outgoingConnections', appendReference(sourceAnchor.attributeMap.outgoingConnections?.value, connectionRef), patches, { required: true });
  patchAttribute(
    text,
    model.diagram,
    'pictogramLinks',
    appendReference(appendReference(model.diagram.attributeMap.pictogramLinks?.value, `${shapeRef}/@link`), `${connectionRef}/@link`),
    patches,
    { required: true }
  );
  patchNumberAttribute(text, model.canvas.node, 'width', Math.max(model.canvas.width, x + eventTemplate.width + 120), patches);
  patchNumberAttribute(text, model.canvas.node, 'height', Math.max(model.canvas.height, y + eventTemplate.height + 120), patches);

  const uniquePatches = deduplicatePatches(patches);
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`A criação foi recusada porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  return {
    text: updatedText,
    changed: true,
    eventId,
    activityId: String(eventNumber),
    flowId,
    model: updatedModel,
    validation,
    patches: uniquePatches
  };
}

function createConnectedEndEvent(text, request) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da criação.`);
  }
  const sourceId = String(request?.sourceId ?? '');
  const source = model.elements.find((item) => item.id === sourceId);
  if (!source || !['BpmnStartEvent', 'BpmnTask', 'BpmnSubProcess', 'BpmnGateway', 'BpmnIntermediateEvent'].includes(source.tag)) {
    throw new Error('O novo evento final exige uma origem executável existente.');
  }
  const sourceShape = model.shapeById.get(sourceId);
  const diagramShapes = model.diagram.children.filter((node) => node.localName === 'children');
  const sourceIndex = diagramShapes.indexOf(sourceShape?.node);
  if (sourceIndex < 0) throw new Error('A origem precisa ter um shape Graphiti direto no diagrama.');
  const sourceAnchor = sourceShape.node.children.find((node) => (
    node.localName === 'anchors' && node.attributeMap['xsi:type']?.value === 'pi:ChopboxAnchor'
  )) ?? sourceShape.node.children.find((node) => node.localName === 'anchors');
  if (!sourceAnchor) throw new Error('A origem não possui ChopboxAnchor compatível.');
  const sourceAnchors = sourceShape.node.children.filter((node) => node.localName === 'anchors');
  if (sourceAnchors.indexOf(sourceAnchor) !== 0) {
    throw new Error('A origem usa uma âncora Graphiti incompatível com a criação segura.');
  }

  const visualConnections = model.diagram.children.filter((node) => node.localName === 'connections');
  const connectionTemplateSource = resolveCreationTemplate(
    text,
    model,
    request,
    (candidateModel) => findRegularConnectionTemplate(candidateModel)
  );
  const eventTemplateSource = resolveCreationTemplate(text, model, request, findEndEventTemplate);
  const connectionTemplate = connectionTemplateSource?.template;
  const eventTemplate = eventTemplateSource?.template;
  const lastShape = diagramShapes.at(-1);
  const xmiRoot = model.xml.children.find((node) => node.name === 'xmi:XMI');
  if (!connectionTemplate || !eventTemplate || !lastShape || !xmiRoot) {
    throw new Error('O diagrama não possui templates visuais seguros para criar evento final e fluxo.');
  }
  const templateAnchors = eventTemplate.node.children.filter((node) => node.localName === 'anchors');
  if (templateAnchors[0]?.attributeMap['xsi:type']?.value !== 'pi:ChopboxAnchor') {
    throw new Error('O template do evento final não possui ChopboxAnchor na posição esperada.');
  }

  const x = layoutNumber(request?.x, 'novoEventoFinal.x');
  const y = layoutNumber(request?.y, 'novoEventoFinal.y');
  const eventNumber = nextGlobalNumber(model);
  const eventId = `endevent${eventNumber}`;
  const flowId = `flow${eventNumber + 1}`;
  const shapeIndex = diagramShapes.length;
  const connectionIndex = visualConnections.length;
  const shapeRef = `/0/@children.${shapeIndex}`;
  const connectionRef = `/0/@connections.${connectionIndex}`;
  const eventShapeXml = cloneEndEventShape(eventTemplateSource.text, eventTemplate, {
    eventId,
    shapeRef,
    connectionRef,
    x,
    y
  });
  const bendpoints = normalizeLayoutBendpoints(request?.bendpoints ?? [], flowId);
  const connectionXml = cloneRegularConnection(connectionTemplateSource.text, connectionTemplate, {
    flowId,
    start: `/0/@children.${sourceIndex}/@anchors.0`,
    end: `${shapeRef}/@anchors.0`,
    bendpoints
  });
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const logicalEvent = `  <bpmn2:BpmnEndEvent id="${eventId}" name="Fim" incoming="${flowId}" type="60" signalId="0"/>`;
  const logicalFlow = `  <bpmn2:SequenceFlow id="${flowId}" name="" sourceRef="${sourceId}" targetRef="${eventId}" atividadeFluxo=""/>`;
  const connectionInsertionOffset = diagramInsertionOffset(model, 'connections');
  const patches = [
    { start: lastShape.closeEnd, end: lastShape.closeEnd, value: `${eol}    ${eventShapeXml}` },
    {
      start: connectionInsertionOffset,
      end: connectionInsertionOffset,
      value: `${visualConnections.length ? `${eol}    ` : ''}${connectionXml}${eol}    `
    },
    { start: xmiRoot.closeStart, end: xmiRoot.closeStart, value: `${logicalEvent}${eol}${logicalFlow}${eol}` }
  ];
  patchAttribute(text, source.node, 'outgoing', appendReference(source.attributes.outgoing, flowId), patches, { required: true });
  patchAttribute(text, sourceAnchor, 'outgoingConnections', appendReference(sourceAnchor.attributeMap.outgoingConnections?.value, connectionRef), patches, { required: true });
  patchAttribute(
    text,
    model.diagram,
    'pictogramLinks',
    appendReference(appendReference(model.diagram.attributeMap.pictogramLinks?.value, `${shapeRef}/@link`), `${connectionRef}/@link`),
    patches,
    { required: true }
  );
  patchNumberAttribute(text, model.canvas.node, 'width', Math.max(model.canvas.width, x + eventTemplate.width + 120), patches);
  patchNumberAttribute(text, model.canvas.node, 'height', Math.max(model.canvas.height, y + eventTemplate.height + 120), patches);

  const uniquePatches = deduplicatePatches(patches);
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`A criação foi recusada porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  return {
    text: updatedText,
    changed: true,
    eventId,
    activityId: String(eventNumber),
    flowId,
    model: updatedModel,
    validation,
    patches: uniquePatches
  };
}

function convertTaskType(text, taskId, targetType) {
  const model = parseProcess(text);
  const beforeValidation = validateProcess(model);
  if (!beforeValidation.ok) {
    throw new Error(`O arquivo possui ${beforeValidation.errors.length} erro(s) estrutural(is) antes da conversão.`);
  }
  const task = model.elements.find((item) => item.id === String(taskId ?? ''));
  if (!task || task.tag !== 'BpmnTask') throw new Error('A conversão exige uma atividade BPMN existente.');
  const target = TASK_TYPE_CONVERSIONS[String(targetType ?? '')];
  if (!target) throw new Error(`Tipo de atividade não suportado: ${targetType}.`);
  if (task.type === String(targetType)) {
    return { text, changed: false, oldId: task.id, newId: task.id, model, validation: beforeValidation, patches: [] };
  }
  const shape = model.shapeById.get(task.id);
  if (!shape?.node || !shape.linkNode) throw new Error(`A atividade ${task.id} não possui shape Graphiti editável.`);

  const oldId = task.id;
  const oldType = task.type;
  const newId = nextBusinessId(model, target.prefix);
  const newActivityId = numericSuffix(newId);
  const patches = [];
  patchAttribute(text, task.node, 'id', newId, patches, { required: true });
  patchAttribute(text, task.node, 'type', String(targetType), patches, { required: true });
  patchAttribute(text, shape.linkNode, 'businessObjects', newId, patches, { required: true });

  if (String(targetType) === '85') {
    patchAttribute(text, task.node, 'managerMechanism', '', patches);
    removeAttribute(text, task.node, 'managerAssignmentControllerString', patches);
  }
  if (String(targetType) !== '84') removeAttribute(text, task.node, 'messageData', patches);
  if (!['82', '86'].includes(String(targetType))) removeAttribute(text, task.node, 'serviceName', patches);
  if (['82', '86', '87'].includes(oldType)) removeAttribute(text, task.node, 'scriptFileName', patches);

  for (const element of [...model.elements, ...model.flows]) {
    for (const attribute of element.node.attributes) {
      if (attribute.name === 'id') continue;
      if (['sourceRef', 'targetRef', 'parentTask'].includes(attribute.name) && attribute.value === oldId) {
        patchAttribute(text, element.node, attribute.name, newId, patches, { required: true });
        continue;
      }
      const reference = `>${oldId}<`;
      if (attribute.value.includes(reference)) {
        patchAttribute(
          text,
          element.node,
          attribute.name,
          attribute.value.split(reference).join(`>${newId}<`),
          patches,
          { required: true }
        );
      }
    }
    if (element.attributes.parentTask === oldId && element.attributes.sequenceAttached !== undefined) {
      patchAttribute(text, element.node, 'sequenceAttached', newActivityId, patches, { required: true });
    }
  }

  patchTaskImage(text, shape.node, target.imageId, patches);
  const uniquePatches = deduplicatePatches(patches);
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`A conversão foi recusada porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  if (!updatedModel.elements.some((item) => item.id === newId && item.type === String(targetType))) {
    throw new Error('A atividade convertida não pôde ser relida com o novo id e tipo.');
  }
  return {
    text: updatedText,
    changed: true,
    oldId,
    newId,
    oldActivityId: numericSuffix(oldId),
    newActivityId,
    targetLabel: target.label,
    model: updatedModel,
    validation,
    patches: uniquePatches
  };
}

function patchTaskImage(text, shapeNode, imageId, patches) {
  const imageWrapper = shapeNode.children.find((child) => descendants(child, (node) => (
    node.localName === 'graphicsAlgorithm' && node.attributeMap['xsi:type']?.value === 'al:Image'
  )).length > 0);
  const imageNode = imageWrapper && descendants(imageWrapper, (node) => (
    node.localName === 'graphicsAlgorithm' && node.attributeMap['xsi:type']?.value === 'al:Image'
  ))[0];
  if (!imageId) {
    if (imageWrapper) patches.push(wholeLineRemovalPatch(text, imageWrapper));
    return;
  }
  if (imageNode) {
    patchAttribute(text, imageNode, 'id', imageId, patches, { required: true });
    return;
  }
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lineStart = text.lastIndexOf('\n', shapeNode.closeStart - 1) + 1;
  const closingIndent = text.slice(lineStart, shapeNode.closeStart);
  const value = [
    '  <children visible="true">',
    `${closingIndent}    <graphicsAlgorithm xsi:type="al:Image" lineWidth="1" transparency="0.0" width="16" height="16" x="5" y="5" id="${imageId}" stretchH="false" stretchV="false" proportional="false"/>`,
    `${closingIndent}  </children>`,
    closingIndent
  ].join(eol);
  patches.push({ start: shapeNode.closeStart, end: shapeNode.closeStart, value });
}

function removeAttribute(text, node, name, patches) {
  const attribute = node?.attributeMap?.[name];
  if (attribute) patches.push(removalPatch(text, node, attribute));
}

function numericSuffix(id) {
  return String(id ?? '').match(/(\d+)$/)?.[1] ?? '';
}

function validateConnectionEndpoints(source, target, model) {
  if (!source) throw new Error('Elemento de origem não encontrado.');
  if (!target) throw new Error('Elemento de destino não encontrado.');
  if (source.id === target.id) throw new Error('Um fluxo não pode ligar o elemento a ele mesmo.');
  const documentaryArtifacts = new Set(['BpmnAnnotation', 'BpmnDatabase', 'BpmnDocument']);
  if (documentaryArtifacts.has(source.tag)) {
    if (!['BpmnTask', 'BpmnSubProcess'].includes(target.tag)) {
      throw new Error(`${source.typeLabel} somente pode criar uma associação visual com uma atividade ou subprocesso.`);
    }
    if (!model.shapeById.has(source.id) || !model.shapeById.has(target.id)) {
      throw new Error('Origem ou destino não possui representação visual.');
    }
    return;
  }
  const sourceTags = new Set(['BpmnStartEvent', 'BpmnTask', 'BpmnSubProcess', 'BpmnGateway', 'BpmnIntermediateEvent']);
  const targetTags = new Set(['BpmnTask', 'BpmnSubProcess', 'BpmnGateway', 'BpmnIntermediateEvent', 'BpmnEndEvent']);
  if (!sourceTags.has(source.tag)) throw new Error(`${source.typeLabel} não pode iniciar um fluxo executável.`);
  if (!targetTags.has(target.tag)) throw new Error(`${target.typeLabel} não pode receber um fluxo executável.`);
  if (!model.shapeById.has(source.id) || !model.shapeById.has(target.id)) {
    throw new Error('Origem ou destino não possui representação visual.');
  }
}

function nextBusinessId(model, prefix) {
  const ids = [...model.elements, ...model.flows]
    .filter((item) => item.tag !== 'BpmnProcess')
    .map((item) => item.id);
  const existing = new Set(ids);
  let number = nextGlobalNumber(model);
  while (existing.has(`${prefix}${number}`)) number += 1;
  return `${prefix}${number}`;
}

function nextGlobalNumber(model) {
  return [...model.elements, ...model.flows]
    .filter((item) => item.tag !== 'BpmnProcess')
    .reduce((current, item) => {
      const suffix = String(item.id).match(/(\d+)$/)?.[1];
      return suffix ? Math.max(current, Number(suffix)) : current;
    }, 0) + 1;
}

function findRegularConnectionTemplate(model) {
  return model.connections.find((connection) => {
    const flow = model.flows.find((item) => item.id === connection.businessObject);
    if (!flow || ['true', '1'].includes(flow.attributes.permiteRetorno)
      || ['true', '1'].includes(flow.attributes.fluxoAutomatico)
      || ['true', '1'].includes(flow.attributes.defaultLink)) return false;
    const decorators = connection.node.children.filter((node) => node.localName === 'connectionDecorators');
    const hasLabel = decorators.some((node) => node.attributeMap.location?.value === '0.5');
    const hasArrow = decorators.some((node) => node.attributeMap.location?.value === '1.0');
    return decorators.length === 2 && hasLabel && hasArrow && connection.labelNode;
  });
}

function findDefaultTaskTemplate(model, diagramShapes) {
  return model.elements
    .filter((element) => element.tag === 'BpmnTask' && element.type === '80')
    .map((element) => model.shapeById.get(element.id))
    .filter((shape) => shape?.node && diagramShapes.includes(shape.node))
    .filter((shape) => !descendants(shape.node, (node) => (
      node.localName === 'graphicsAlgorithm' && node.attributeMap['xsi:type']?.value === 'al:Image'
    )).length)
    .sort((left, right) => (left.width * left.height) - (right.width * right.height))[0];
}

function findTypedElementTemplate(model, diagramShapes, tag, type, fallbackType = '') {
  const findType = (candidateType) => model.elements
    .filter((element) => element.tag === tag && element.type === candidateType)
    .map((element) => model.shapeById.get(element.id))
    .filter((shape) => shape?.node && diagramShapes.includes(shape.node))
    .sort((left, right) => (left.width * left.height) - (right.width * right.height))[0];
  return findType(type) ?? (fallbackType ? findType(fallbackType) : undefined);
}

function findExclusiveGatewayTemplate(model, diagramShapes) {
  return model.elements
    .filter((element) => element.tag === 'BpmnGateway' && element.type === '120')
    .map((element) => model.shapeById.get(element.id))
    .filter((shape) => shape?.node && diagramShapes.includes(shape.node))
    .filter((shape) => descendants(shape.node, (node) => (
      node.attributeMap['xsi:type']?.value === 'al:Polygon'
    )).length)
    .sort((left, right) => (left.width * left.height) - (right.width * right.height))[0];
}

function findIntermediateEventTemplate(model, diagramShapes) {
  return model.elements
    .filter((element) => element.tag === 'BpmnIntermediateEvent' && element.type === '30')
    .map((element) => model.shapeById.get(element.id))
    .filter((shape) => shape?.node && diagramShapes.includes(shape.node))
    .filter((shape) => descendants(shape.node, (node) => (
      node.attributeMap['xsi:type']?.value === 'al:Ellipse'
    )).length >= 2)
    .sort((left, right) => (left.width * left.height) - (right.width * right.height))[0];
}

function findStartEventTemplate(model, diagramShapes) {
  return model.elements
    .filter((element) => element.tag === 'BpmnStartEvent' && element.type === '10')
    .map((element) => model.shapeById.get(element.id))
    .filter((shape) => shape?.node && diagramShapes.includes(shape.node))
    .filter((shape) => descendants(shape.node, (node) => (
      node.attributeMap['xsi:type']?.value === 'al:Ellipse'
    )).length >= 2)
    .sort((left, right) => (left.width * left.height) - (right.width * right.height))[0];
}

function findEndEventTemplate(model, diagramShapes) {
  return model.elements
    .filter((element) => element.tag === 'BpmnEndEvent' && element.type === '60')
    .map((element) => model.shapeById.get(element.id))
    .filter((shape) => shape?.node && diagramShapes.includes(shape.node))
    .filter((shape) => descendants(shape.node, (node) => (
      node.attributeMap['xsi:type']?.value === 'al:Ellipse'
    )).length >= 2)
    .sort((left, right) => (left.width * left.height) - (right.width * right.height))[0];
}

function findArtifactTemplate(model, diagramShapes, tag) {
  return model.elements
    .filter((element) => element.tag === tag)
    .map((element) => model.shapeById.get(element.id))
    .filter((shape) => shape?.node && diagramShapes.includes(shape.node))
    .sort((left, right) => (left.width * left.height) - (right.width * right.height))[0];
}

function findPoolTemplate(model, diagramShapes) {
  return model.elements
    .filter((element) => element.tag === 'BpmnPool')
    .map((element) => model.shapeById.get(element.id))
    .find((shape) => shape?.node && diagramShapes.includes(shape.node)
      && shape.graphicsNode?.attributeMap['xsi:type']?.value === 'al:Rectangle');
}

function findSwimLaneTemplate(model, nested) {
  const candidates = model.elements
    .filter((element) => element.tag === 'BpmnSwimLane')
    .map((element) => model.shapeById.get(element.id))
    .filter((shape) => shape?.node && shape.graphicsNode?.attributeMap['xsi:type']?.value === 'al:Rectangle');
  return candidates.find((shape) => Boolean(shape.parentBusinessObject) === nested) ?? candidates[0];
}

/**
 * Resolve um molde visual no documento atual ou, quando o ultimo exemplar foi
 * excluido, no catalogo interno fornecido pelo host da extensao.
 *
 * O texto de fallback nunca e gravado no processo. Somente o shape escolhido e
 * clonado, preservando o restante do arquivo do usuario.
 */
function resolveCreationTemplate(text, model, request, finder) {
  const diagramShapes = model.diagram?.children.filter((node) => node.localName === 'children') ?? [];
  const localTemplate = finder(model, diagramShapes);
  if (localTemplate) return { text, model, template: localTemplate };

  const fallbackText = String(request?.templateText ?? '');
  if (!fallbackText) return null;
  const fallbackModel = parseProcess(fallbackText);
  const fallbackShapes = fallbackModel.diagram?.children.filter((node) => node.localName === 'children') ?? [];
  const fallbackTemplate = finder(fallbackModel, fallbackShapes);
  return fallbackTemplate ? { text: fallbackText, model: fallbackModel, template: fallbackTemplate } : null;
}

function diagramInsertionOffset(model, kind) {
  const nodes = model.diagram?.children ?? [];
  const matching = nodes.filter((node) => node.localName === kind);
  if (matching.length) return matching.at(-1).closeEnd;
  const order = kind === 'children'
    ? ['connections', 'styles', 'fonts', 'colors']
    : ['styles', 'fonts', 'colors'];
  return nodes.find((node) => order.includes(node.localName))?.start ?? model.diagram?.closeStart;
}

function preferredBusinessPrefix(model, tag, fallback) {
  const identifier = model.elements.find((element) => element.tag === tag)?.id ?? '';
  const prefix = identifier.replace(/\d+$/, '');
  return prefix || fallback;
}

function containerStyleNodes(model, template) {
  const label = containerLabelGraphics(template.node);
  const bodyStyle = referencedDiagramNode(model, template.graphicsNode?.attributeMap.style?.value, 'styles');
  const labelStyle = referencedDiagramNode(model, label?.attributeMap.style?.value, 'styles');
  return bodyStyle && labelStyle ? [bodyStyle, labelStyle] : null;
}

function referencedDiagramNode(model, reference, localName) {
  const match = String(reference ?? '').match(new RegExp(`/0/@${localName}\\.(\\d+)$`));
  if (!match) return null;
  return model.diagram.children.filter((node) => node.localName === localName)[Number(match[1])] ?? null;
}

function containerLabelGraphics(shapeNode) {
  for (const child of shapeNode?.children.filter((node) => node.localName === 'children') ?? []) {
    if (child.children.some((node) => node.localName === 'link')) continue;
    const label = descendants(child, (node) => (
      node.localName === 'graphicsAlgorithm'
      && ['al:Text', 'al:MultiText'].includes(node.attributeMap['xsi:type']?.value)
    ))[0];
    if (label) return label;
  }
  return null;
}

function cloneContainerShape(text, template, options) {
  let cloned = text.slice(template.node.start, template.node.closeEnd);
  let shape = tokenizeXml(cloned).children[0];
  if (!shape) throw new Error('Template de container inválido.');
  if (options.removeLinkedChildren) {
    const removals = shape.children
      .filter((node) => node.localName === 'children')
      .filter((node) => node.children.some((child) => child.localName === 'link'))
      .map((node) => wholeLineRemovalPatch(cloned, node));
    if (removals.length) {
      cloned = applyPatches(cloned, removals);
      shape = tokenizeXml(cloned).children[0];
    }
  }
  const graphics = shape.children.find((node) => node.localName === 'graphicsAlgorithm');
  const link = shape.children.find((node) => node.localName === 'link');
  const label = containerLabelGraphics(shape);
  const anchors = shape.children.filter((node) => node.localName === 'anchors');
  if (!graphics || !link || !label || anchors.length !== 3) {
    throw new Error('Template de container incompleto: esperado retângulo, link, título e três anchors.');
  }
  const patches = [];
  patchNumberAttribute(cloned, graphics, 'x', options.x, patches);
  patchNumberAttribute(cloned, graphics, 'y', options.y, patches);
  patchNumberAttribute(cloned, graphics, 'width', options.width, patches);
  patchNumberAttribute(cloned, graphics, 'height', options.height, patches);
  patchAttribute(cloned, graphics, 'style', options.bodyStyleRef, patches, { required: true });
  patchAttribute(cloned, graphics, 'background', options.backgroundRef, patches, { required: true });
  patchAttribute(cloned, link, 'businessObjects', options.businessObject, patches, { required: true });
  for (const anchor of anchors) {
    removeAttribute(cloned, anchor, 'incomingConnections', patches);
    removeAttribute(cloned, anchor, 'outgoingConnections', patches);
    if (anchor.attributeMap.referencedGraphicsAlgorithm) {
      patchAttribute(cloned, anchor, 'referencedGraphicsAlgorithm', `${options.shapeRef}/@graphicsAlgorithm`, patches, { required: true });
    }
  }
  patchNumberAttribute(cloned, label, 'width', 30, patches);
  patchNumberAttribute(cloned, label, 'height', options.height, patches);
  patchAttribute(cloned, label, 'style', options.labelStyleRef, patches, { required: true });
  patchAttribute(cloned, label, 'value', options.label, patches, { required: true });
  return applyPatches(cloned, deduplicatePatches(patches));
}

function lanePalette(existingCount, nested) {
  if (!nested) return '82b0b7';
  return ['adc9ac', 'd0daae', '82b0b7', 'f1e6a8'][existingCount % 4];
}

function ensureVisualColor(text, colorNodes, hex, patches) {
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const index = colorNodes.findIndex((node) => (
    Number(node.attributeMap.red?.value ?? 0) === red
    && Number(node.attributeMap.green?.value ?? 0) === green
    && Number(node.attributeMap.blue?.value ?? 0) === blue
  ));
  if (index >= 0) return { index, appended: false };
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  patches.push({
    start: colorNodes.at(-1).closeEnd,
    end: colorNodes.at(-1).closeEnd,
    value: `${eol}    ${serializeVisualColor(red, green, blue)}`
  });
  return { index: colorNodes.length, appended: true };
}

function serializeVisualColor(red, green, blue) {
  const attributes = [];
  if (red) attributes.push(`red="${red}"`);
  if (green) attributes.push(`green="${green}"`);
  if (blue) attributes.push(`blue="${blue}"`);
  return attributes.length ? `<colors ${attributes.join(' ')}/>` : '<colors/>';
}

function patchSwimLaneVisualColor(text, model, element, hex, patches) {
  const shape = model.shapeById.get(element.id);
  if (!shape?.graphicsNode) throw new Error(`A raia ${element.id} não possui shape visual editável.`);
  const colors = model.diagram.children.filter((node) => node.localName === 'colors');
  if (!colors.length) throw new Error('O diagrama não possui paleta visual de cores editável.');
  const color = ensureVisualColor(text, colors, hex, patches);
  patchAttribute(text, shape.graphicsNode, 'background', `/0/@colors.${color.index}`, patches, { required: true });
}

function remapDirectChildReferencesForInsertion(text, model, insertionIndex, patches, newPictogramLink) {
  walk(model.xml, (node) => {
    for (const attribute of node.attributes) {
      if (!attribute.value.includes('/0/@children.')) continue;
      const remapped = attribute.value.replace(/\/0\/@children\.(\d+)/g, (match, digits) => {
        const index = Number(digits);
        return index >= insertionIndex ? `/0/@children.${index + 1}` : match;
      });
      const value = node === model.diagram && attribute.name === 'pictogramLinks'
        ? appendReference(remapped, newPictogramLink)
        : remapped;
      if (value !== attribute.value) patchAttribute(text, node, attribute.name, value, patches, { required: true });
    }
  });
}

function remapNestedChildReferencesForInsertion(text, model, poolIndex, insertionIndex, patches, newPictogramLink) {
  const prefix = `/0/@children.${poolIndex}/@children.`;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escaped}(\\d+)`, 'g');
  walk(model.xml, (node) => {
    for (const attribute of node.attributes) {
      if (!attribute.value.includes(prefix)) continue;
      const remapped = attribute.value.replace(pattern, (match, digits) => {
        const index = Number(digits);
        return index >= insertionIndex ? `${prefix}${index + 1}` : match;
      });
      const value = node === model.diagram && attribute.name === 'pictogramLinks'
        ? appendReference(remapped, newPictogramLink)
        : remapped;
      if (value !== attribute.value) patchAttribute(text, node, attribute.name, value, patches, { required: true });
    }
  });
  const pictogram = model.diagram.attributeMap.pictogramLinks;
  if (pictogram && !pictogram.value.includes(prefix)) {
    patchAttribute(text, model.diagram, 'pictogramLinks', appendReference(pictogram.value, newPictogramLink), patches, { required: true });
  }
}

function validateCreationResult(text, patches, originalModel, expected) {
  const uniquePatches = deduplicatePatches(patches);
  const updatedText = applyPatches(text, uniquePatches);
  const updatedModel = parseProcess(updatedText);
  const validation = validateProcess(updatedModel);
  if (!validation.ok) {
    throw new Error(`A criação foi recusada porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  const created = updatedModel.elements.filter((element) => element.id === expected.elementId && element.tag === expected.elementTag);
  const shapes = updatedModel.shapes.filter((shape) => shape.businessObject === expected.elementId);
  if (created.length !== 1 || shapes.length !== 1) throw new Error('A criação não produziu uma bijeção lógica/visual para o container.');
  if (updatedModel.shapes.length !== originalModel.shapes.length + expected.expectedShapeDelta) {
    throw new Error('A criação alterou a quantidade de shapes de forma inesperada.');
  }
  if (updatedModel.flows.length !== originalModel.flows.length || updatedModel.connections.length !== originalModel.connections.length) {
    throw new Error('A criação do container alterou fluxos ou conexões indevidamente.');
  }
  assertChildReferenceBounds(updatedModel);
  return {
    text: updatedText,
    changed: true,
    elementId: expected.elementId,
    elementTag: expected.elementTag,
    poolId: expected.poolId ?? '',
    activityCode: numericSuffix(expected.elementId),
    model: updatedModel,
    validation,
    patches: uniquePatches
  };
}

function cloneIsolatedDirectShape(text, model, template, options) {
  const diagramShapes = model.diagram.children.filter((node) => node.localName === 'children');
  const templateIndex = diagramShapes.indexOf(template.node);
  if (templateIndex < 0) throw new Error('O template precisa ser um shape direto do diagrama.');
  let cloned = text.slice(template.node.start, template.node.closeEnd);
  const shape = tokenizeXml(cloned).children[0];
  const graphics = shape.children.find((node) => node.localName === 'graphicsAlgorithm');
  const link = shape.children.find((node) => node.localName === 'link');
  if (!graphics || !link) throw new Error('Template visual incompleto: graphicsAlgorithm/link ausente.');
  const oldShapeRef = `/0/@children.${templateIndex}`;
  const templateName = model.elements.find((item) => item.id === template.businessObject)?.name ?? '';
  const patches = [];
  patchNumberAttribute(cloned, graphics, 'x', options.x, patches);
  patchNumberAttribute(cloned, graphics, 'y', options.y, patches);
  patchAttribute(cloned, link, 'businessObjects', options.elementId, patches, { required: true });
  walk(shape, (node) => {
    if (node.localName === 'anchors') {
      removeAttribute(cloned, node, 'incomingConnections', patches);
      removeAttribute(cloned, node, 'outgoingConnections', patches);
    }
    for (const attribute of node.attributes) {
      if (!attribute.value.includes(oldShapeRef)) continue;
      patchAttribute(cloned, node, attribute.name, attribute.value.replaceAll(oldShapeRef, options.shapeRef), patches, { required: true });
    }
  });
  for (const label of descendants(shape, (node) => {
    const type = node.attributeMap['xsi:type']?.value;
    return node.localName === 'graphicsAlgorithm'
      && ['al:Text', 'al:MultiText'].includes(type)
      && node.attributeMap.value;
  })) {
    if (label.attributeMap.value.value === templateName) {
      patchAttribute(cloned, label, 'value', options.name, patches, { required: true });
    }
  }
  if (options.taskImageId !== undefined) patchTaskImage(cloned, shape, options.taskImageId, patches);
  return applyPatches(cloned, deduplicatePatches(patches));
}

function cloneDefaultTaskShape(text, template, options) {
  let cloned = text.slice(template.node.start, template.node.closeEnd);
  const shape = tokenizeXml(cloned).children[0];
  const graphics = shape.children.find((node) => node.localName === 'graphicsAlgorithm');
  const link = shape.children.find((node) => node.localName === 'link');
  const anchors = shape.children.filter((node) => node.localName === 'anchors');
  const chopbox = anchors.find((node) => node.attributeMap['xsi:type']?.value === 'pi:ChopboxAnchor') ?? anchors[0];
  const label = descendants(shape, (node) => (
    node.localName === 'graphicsAlgorithm'
    && ['al:Text', 'al:MultiText'].includes(node.attributeMap['xsi:type']?.value)
    && node.attributeMap.value
  ))[0];
  if (!graphics || !link || !chopbox || !label) throw new Error('Template de atividade incompleto.');
  const patches = [];
  patchNumberAttribute(cloned, graphics, 'x', options.x, patches);
  patchNumberAttribute(cloned, graphics, 'y', options.y, patches);
  patchAttribute(cloned, link, 'businessObjects', options.taskId, patches, { required: true });
  patchAttribute(cloned, chopbox, 'incomingConnections', options.connectionRef, patches, { required: true });
  removeAttribute(cloned, chopbox, 'outgoingConnections', patches);
  for (const anchor of anchors) {
    if (anchor.attributeMap.referencedGraphicsAlgorithm) {
      patchAttribute(cloned, anchor, 'referencedGraphicsAlgorithm', `${options.shapeRef}/@graphicsAlgorithm`, patches, { required: true });
    }
  }
  patchAttribute(cloned, label, 'value', options.name, patches, { required: true });
  return applyPatches(cloned, deduplicatePatches(patches));
}

function cloneExclusiveGatewayShape(text, template, options) {
  let cloned = text.slice(template.node.start, template.node.closeEnd);
  const shape = tokenizeXml(cloned).children[0];
  const graphics = shape.children.find((node) => node.localName === 'graphicsAlgorithm');
  const link = shape.children.find((node) => node.localName === 'link');
  const anchors = shape.children.filter((node) => node.localName === 'anchors');
  const chopbox = anchors.find((node) => node.attributeMap['xsi:type']?.value === 'pi:ChopboxAnchor') ?? anchors[0];
  if (!graphics || !link || !chopbox) throw new Error('Template de gateway incompleto.');
  const patches = [];
  patchNumberAttribute(cloned, graphics, 'x', options.x, patches);
  patchNumberAttribute(cloned, graphics, 'y', options.y, patches);
  patchAttribute(cloned, link, 'businessObjects', options.gatewayId, patches, { required: true });
  patchAttribute(cloned, chopbox, 'incomingConnections', options.connectionRef, patches, { required: true });
  removeAttribute(cloned, chopbox, 'outgoingConnections', patches);
  for (const anchor of anchors) {
    if (anchor.attributeMap.referencedGraphicsAlgorithm) {
      patchAttribute(
        cloned,
        anchor,
        'referencedGraphicsAlgorithm',
        `${options.shapeRef}/@graphicsAlgorithm/@graphicsAlgorithmChildren.0`,
        patches,
        { required: true }
      );
    }
  }
  return applyPatches(cloned, deduplicatePatches(patches));
}

function cloneIntermediateEventShape(text, template, options) {
  let cloned = text.slice(template.node.start, template.node.closeEnd);
  const shape = tokenizeXml(cloned).children[0];
  const graphics = shape.children.find((node) => node.localName === 'graphicsAlgorithm');
  const link = shape.children.find((node) => node.localName === 'link');
  const anchors = shape.children.filter((node) => node.localName === 'anchors');
  const chopbox = anchors.find((node) => node.attributeMap['xsi:type']?.value === 'pi:ChopboxAnchor') ?? anchors[0];
  if (!graphics || !link || !chopbox) throw new Error('Template de evento intermediário incompleto.');
  const patches = [];
  patchNumberAttribute(cloned, graphics, 'x', options.x, patches);
  patchNumberAttribute(cloned, graphics, 'y', options.y, patches);
  patchAttribute(cloned, link, 'businessObjects', options.eventId, patches, { required: true });
  patchAttribute(cloned, chopbox, 'incomingConnections', options.connectionRef, patches, { required: true });
  removeAttribute(cloned, chopbox, 'outgoingConnections', patches);
  for (const anchor of anchors) {
    if (anchor.attributeMap.referencedGraphicsAlgorithm) {
      patchAttribute(
        cloned,
        anchor,
        'referencedGraphicsAlgorithm',
        `${options.shapeRef}/@graphicsAlgorithm/@graphicsAlgorithmChildren.0`,
        patches,
        { required: true }
      );
    }
  }
  return applyPatches(cloned, deduplicatePatches(patches));
}

function cloneEndEventShape(text, template, options) {
  let cloned = text.slice(template.node.start, template.node.closeEnd);
  const shape = tokenizeXml(cloned).children[0];
  const graphics = shape.children.find((node) => node.localName === 'graphicsAlgorithm');
  const link = shape.children.find((node) => node.localName === 'link');
  const anchors = shape.children.filter((node) => node.localName === 'anchors');
  const chopbox = anchors.find((node) => node.attributeMap['xsi:type']?.value === 'pi:ChopboxAnchor') ?? anchors[0];
  if (!graphics || !link || !chopbox) throw new Error('Template de evento final incompleto.');
  const patches = [];
  patchNumberAttribute(cloned, graphics, 'x', options.x, patches);
  patchNumberAttribute(cloned, graphics, 'y', options.y, patches);
  patchAttribute(cloned, link, 'businessObjects', options.eventId, patches, { required: true });
  patchAttribute(cloned, chopbox, 'incomingConnections', options.connectionRef, patches, { required: true });
  removeAttribute(cloned, chopbox, 'outgoingConnections', patches);
  for (const anchor of anchors) {
    if (anchor.attributeMap.referencedGraphicsAlgorithm) {
      patchAttribute(
        cloned,
        anchor,
        'referencedGraphicsAlgorithm',
        `${options.shapeRef}/@graphicsAlgorithm/@graphicsAlgorithmChildren.0`,
        patches,
        { required: true }
      );
    }
  }
  return applyPatches(cloned, deduplicatePatches(patches));
}

function cloneRegularConnection(text, template, options) {
  let cloned = text.slice(template.node.start, template.node.closeEnd);
  const parsed = tokenizeXml(cloned);
  const connection = parsed.children[0];
  const link = connection.children.find((node) => node.localName === 'link');
  const label = descendants(connection, (node) => node.localName === 'graphicsAlgorithm')
    .find((node) => node.attributeMap['xsi:type']?.value === 'al:Text');
  const patches = [];
  patchAttribute(cloned, connection, 'start', options.start, patches, { required: true });
  patchAttribute(cloned, connection, 'end', options.end, patches, { required: true });
  patchAttribute(cloned, link, 'businessObjects', options.flowId, patches, { required: true });
  patchAttribute(cloned, label, 'value', '', patches, { required: true });
  for (const point of connection.children.filter((node) => node.localName === 'bendpoints')) {
    patches.push(wholeLineRemovalPatch(cloned, point));
  }
  cloned = applyPatches(cloned, deduplicatePatches(patches));
  if (!options.bendpoints.length) return cloned;
  const refreshed = tokenizeXml(cloned).children[0];
  const lineStart = cloned.lastIndexOf('\n', refreshed.closeStart - 1) + 1;
  const closingIndent = cloned.slice(lineStart, refreshed.closeStart);
  const childIndent = `${closingIndent}  `;
  const eol = cloned.includes('\r\n') ? '\r\n' : '\n';
  const serialized = options.bendpoints
    .map((point) => `<bendpoints x="${point.x}" y="${point.y}"/>`)
    .join(`${eol}${childIndent}`);
  return applyPatches(cloned, [{
    start: refreshed.closeStart,
    end: refreshed.closeStart,
    value: `  ${serialized}${eol}${closingIndent}`
  }]);
}

function wholeLineRemovalPatch(text, node) {
  let start = text.lastIndexOf('\n', node.start - 1) + 1;
  if (text.slice(start, node.start).trim()) start = node.start;
  let end = node.closeEnd;
  if (text.startsWith('\r\n', end)) end += 2;
  else if (text[end] === '\n') end += 1;
  return { start, end, value: '' };
}

function splitReferences(value) {
  return String(value ?? '').trim().split(/\s+/).filter(Boolean);
}

function patchReferenceListAttribute(text, node, name, reference, patches) {
  const values = splitReferences(node?.attributeMap?.[name]?.value);
  if (!values.includes(reference)) throw new Error(`${node?.attributeMap?.id?.value || node?.localName || 'Elemento'}.${name} não referencia ${reference}.`);
  const updated = values.filter((item) => item !== reference).join(' ');
  if (updated) patchAttribute(text, node, name, updated, patches, { required: true });
  else removeAttribute(text, node, name, patches);
}

function findChopboxAnchor(shapeNode) {
  if (!shapeNode) return null;
  const anchors = shapeNode.children.filter((node) => node.localName === 'anchors');
  const chopbox = anchors.find((node) => node.attributeMap['xsi:type']?.value === 'pi:ChopboxAnchor') ?? anchors[0];
  return anchors.indexOf(chopbox) === 0 ? chopbox : null;
}

function isTrueAttribute(value) {
  return value === 'true' || value === '1';
}

function gatewayConditionTargets(gateway, targetId) {
  const escapedTarget = String(targetId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`<targetTask>\\s*${escapedTarget}\\s*</targetTask>`).test(gateway.attributes.condition ?? '');
}

function isInsideNode(node, parent) {
  return node.start >= parent.start && node.closeEnd <= parent.closeEnd;
}

function remapConnectionReferences(value, deletedIndex) {
  let changed = false;
  const mapped = [];
  for (const token of splitReferences(value)) {
    let removeToken = false;
    const next = token.replace(/\/0\/@connections\.(\d+)/g, (match, digits) => {
      const index = Number(digits);
      if (index === deletedIndex) {
        changed = true;
        removeToken = true;
        return match;
      }
      if (index > deletedIndex) {
        changed = true;
        return `/0/@connections.${index - 1}`;
      }
      return match;
    });
    if (!removeToken) mapped.push(next);
  }
  return { changed, value: mapped.join(' ') };
}

function remapChildReferences(value, deletedIndex) {
  let changed = false;
  const mapped = [];
  for (const token of splitReferences(value)) {
    let removeToken = false;
    const next = token.replace(/\/0\/@children\.(\d+)/g, (match, digits) => {
      const index = Number(digits);
      if (index === deletedIndex) {
        changed = true;
        removeToken = true;
        return match;
      }
      if (index > deletedIndex) {
        changed = true;
        return `/0/@children.${index - 1}`;
      }
      return match;
    });
    if (!removeToken) mapped.push(next);
  }
  return { changed, value: mapped.join(' ') };
}

function remapNestedChildReferences(value, poolIndex, deletedIndex) {
  let changed = false;
  const mapped = [];
  const prefix = `/0/@children.${poolIndex}/@children.`;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escaped}(\\d+)`, 'g');
  for (const token of splitReferences(value)) {
    let removeToken = false;
    const next = token.replace(pattern, (match, digits) => {
      const index = Number(digits);
      if (index === deletedIndex) {
        changed = true;
        removeToken = true;
        return match;
      }
      if (index > deletedIndex) {
        changed = true;
        return `${prefix}${index - 1}`;
      }
      return match;
    });
    if (!removeToken) mapped.push(next);
  }
  return { changed, value: mapped.join(' ') };
}

function attributeReferencesIdentifier(value, identifier) {
  const escaped = String(identifier).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const text = String(value ?? '');
  return new RegExp(`(^|[^A-Za-z0-9_.-])${escaped}(?=$|[^A-Za-z0-9_.-])`).test(text)
    || new RegExp(`(^|\\.)${escaped}(?=\\.|$)`).test(text);
}

function attributeReferencesChildIndex(value, childIndex) {
  for (const match of String(value ?? '').matchAll(/\/0\/@children\.(\d+)/g)) {
    if (Number(match[1]) === childIndex) return true;
  }
  return false;
}

function numericSuffix(identifier) {
  return String(identifier ?? '').match(/(\d+)$/)?.[1] ?? '';
}

function assertConnectionReferenceBounds(model) {
  const count = model.connections.length;
  walk(model.xml, (node) => {
    for (const attribute of node.attributes) {
      for (const match of attribute.value.matchAll(/\/0\/@connections\.(\d+)/g)) {
        if (Number(match[1]) >= count) {
          throw new Error(`Referência Graphiti fora da faixa após a exclusão: ${match[0]}.`);
        }
      }
    }
  });
}

function assertChildReferenceBounds(model) {
  const count = model.diagram?.children.filter((node) => node.localName === 'children').length ?? 0;
  walk(model.xml, (node) => {
    for (const attribute of node.attributes) {
      for (const match of attribute.value.matchAll(/\/0\/@children\.(\d+)/g)) {
        if (Number(match[1]) >= count) {
          throw new Error(`Referência Graphiti fora da faixa após a exclusão: ${match[0]}.`);
        }
      }
    }
  });
}

function appendReference(value, reference) {
  const references = String(value ?? '').trim().split(/\s+/).filter(Boolean);
  if (!references.includes(reference)) references.push(reference);
  return references.join(' ');
}

function normalizeContainerResizes(model, resizes) {
  const sizes = new Map();
  const localPositions = new Map();
  const explicit = [];
  for (const resize of resizes) {
    const id = String(resize?.id ?? '');
    if (!id || sizes.has(id)) throw new Error(`Redimensionamento invalido ou duplicado para ${id || '(sem id)'}.`);
    const element = model.elements.find((item) => item.id === id);
    const shape = model.shapeById.get(id);
    if (!element || !shape?.graphicsNode) throw new Error(`Container nao encontrado: ${id}.`);
    if (!['BpmnPool', 'BpmnSwimLane'].includes(element.tag)) {
      throw new Error(`Somente pools e raias podem ser redimensionadas nesta etapa: ${id}.`);
    }
    const size = {
      width: layoutDimension(resize?.width, `${id}.width`),
      height: layoutDimension(resize?.height, `${id}.height`)
    };
    sizes.set(id, size);
    explicit.push({ id, element, shape, size });
  }

  for (const item of explicit) {
    if (item.element.tag === 'BpmnPool') {
      const lanes = nestedLaneShapes(model, item.id).sort((left, right) => left.localY - right.localY);
      const laneHeight = lanes.length ? Math.max(1, Math.round(item.size.height / lanes.length)) : 0;
      if (lanes.length) item.size.height = laneHeight * lanes.length;
      for (const [index, lane] of lanes.entries()) {
        setDerivedContainerSize(sizes, lane.businessObject, {
          width: item.size.width - lane.localX,
          height: laneHeight
        });
        localPositions.set(lane.businessObject, { x: lane.localX, y: index * laneHeight });
      }
    } else if (item.shape.parentBusinessObject) {
      const parent = model.elements.find((element) => element.id === item.shape.parentBusinessObject);
      if (parent?.tag !== 'BpmnPool') throw new Error(`Pai visual incompativel para a raia ${item.id}.`);
      const siblings = nestedLaneShapes(model, parent.id);
      if (siblings.length !== 1) {
        throw new Error(`A pool ${parent.id} possui multiplas raias; o resize exige uma referencia Eclipse homologada.`);
      }
      setDerivedContainerSize(sizes, parent.id, {
        width: item.size.width + item.shape.localX,
        height: item.size.height + item.shape.localY
      });
    }
  }
  return { sizes, localPositions };
}

function patchContainerLabelHeight(text, shape, height, patches) {
  const labelGraphics = shape.node?.children
    .filter((node) => node.localName === 'children')
    .map((node) => node.children.find((child) => child.localName === 'graphicsAlgorithm'))
    .find((node) => ['al:Text', 'al:MultiText'].includes(node?.attributeMap['xsi:type']?.value));
  if (labelGraphics) patchNumberAttribute(text, labelGraphics, 'height', height, patches);
}

function validateContainerMoveSet(model, deltas) {
  for (const [id, delta] of deltas) {
    const element = model.elements.find((item) => item.id === id);
    const container = model.shapeById.get(id);
    if (!container || !['BpmnPool', 'BpmnSwimLane'].includes(element?.tag)) continue;
    const bounds = shapeRectangle(container);
    for (const shape of model.shapes) {
      if (shape.businessObject === id) continue;
      const nested = shape.parentBusinessObject === id;
      if (!nested && !rectangleContains(bounds, shapeRectangle(shape))) continue;
      const childDelta = deltas.get(shape.businessObject);
      if (!childDelta || childDelta.x !== delta.x || childDelta.y !== delta.y) {
        throw new Error(`O movimento de ${id} deve incluir ${shape.businessObject} com o mesmo deslocamento.`);
      }
    }
  }
}

function nestedLaneShapes(model, poolId) {
  return model.shapes.filter((shape) => {
    if (shape.parentBusinessObject !== poolId) return false;
    return model.elements.find((element) => element.id === shape.businessObject)?.tag === 'BpmnSwimLane';
  });
}

function setDerivedContainerSize(sizes, id, size) {
  if (size.width <= 0 || size.height <= 0) throw new Error(`Dimensao derivada invalida para ${id}.`);
  const normalized = { width: Math.round(size.width), height: Math.round(size.height) };
  const current = sizes.get(id);
  if (current && (current.width !== normalized.width || current.height !== normalized.height)) {
    throw new Error(`Dimensoes contraditorias para ${id}.`);
  }
  sizes.set(id, normalized);
}

function minimumContainerSize(model, containerShape, element) {
  const margin = 10;
  let width = element.tag === 'BpmnPool' ? 150 : 120;
  let height = element.tag === 'BpmnPool' ? 100 : 80;
  const bounds = shapeRectangle(containerShape);
  for (const shape of model.shapes) {
    if (shape.businessObject === containerShape.businessObject) continue;
    const childElement = model.elements.find((item) => item.id === shape.businessObject);
    if (['BpmnPool', 'BpmnSwimLane'].includes(childElement?.tag)) continue;
    if (!rectangleContains(bounds, shapeRectangle(shape), 1)) continue;
    width = Math.max(width, Math.ceil(shape.x + shape.width - containerShape.x + margin));
    height = Math.max(height, Math.ceil(shape.y + shape.height - containerShape.y + margin));
  }
  return { width, height };
}

function shapeRectangle(shape) {
  return { left: shape.x, top: shape.y, right: shape.x + shape.width, bottom: shape.y + shape.height };
}

function rectangleContains(outer, inner, tolerance = 0) {
  return inner.left >= outer.left - tolerance
    && inner.top >= outer.top - tolerance
    && inner.right <= outer.right + tolerance
    && inner.bottom <= outer.bottom + tolerance;
}

function movedDiagramExtent(model, deltas, sizes, axis) {
  const dimension = axis === 'x' ? 'width' : 'height';
  let extent = 0;
  for (const shape of model.shapes) {
    const delta = deltas.get(shape.businessObject) ?? { x: 0, y: 0 };
    const size = sizes.get(shape.businessObject);
    extent = Math.max(extent, shape[axis] + delta[axis] + (size?.[dimension] ?? shape[dimension]) + 120);
  }
  return Math.ceil(extent);
}

function layoutDimension(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 10000000) {
    throw new Error(`Dimensao invalida em ${label}.`);
  }
  return Math.round(number);
}

function layoutNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 10000000) {
    throw new Error(`Coordenada inválida em ${label}.`);
  }
  return Math.round(number);
}

function layoutCoordinate(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > 10000000) {
    throw new Error(`Coordenada inválida em ${label}.`);
  }
  return Math.round(number);
}

function optionalLayoutNumber(value, label, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return layoutNumber(value, label);
}

function numberAttribute(node, name) {
  const value = Number(node?.attributeMap?.[name]?.value ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function patchNumberAttribute(text, node, name, value, patches) {
  const normalized = String(Math.round(value));
  const current = node?.attributeMap?.[name]?.value;
  if ((current === undefined && normalized === '0') || current === normalized) return;
  patchAttribute(text, node, name, normalized, patches, { required: true });
}

function normalizeLayoutBendpoints(value, id) {
  if (!Array.isArray(value)) throw new Error(`Bendpoints inválidos para ${id}.`);
  const points = [];
  for (const point of value) {
    const normalized = {
      x: layoutCoordinate(point?.x, `${id}.bendpoint.x`),
      y: layoutCoordinate(point?.y, `${id}.bendpoint.y`)
    };
    const previous = points.at(-1);
    if (!previous || previous.x !== normalized.x || previous.y !== normalized.y) points.push(normalized);
  }
  for (let index = points.length - 2; index > 0; index -= 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    if ((previous.x === current.x && current.x === next.x) || (previous.y === current.y && current.y === next.y)) {
      points.splice(index, 1);
    }
  }
  return points;
}

function sameBendpoints(left, right) {
  return left.length === right.length && left.every((point, index) => (
    Math.round(point.x) === right[index].x && Math.round(point.y) === right[index].y
  ));
}

function patchConnectionBendpoints(text, connection, bendpoints, patches) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const existing = connection.bendpointNodes;
  const referenceNode = existing[0] ?? connection.node;
  const referenceOffset = existing[0]?.start ?? connection.node.closeStart;
  const lineStart = text.lastIndexOf('\n', referenceOffset - 1) + 1;
  const indent = text.slice(lineStart, referenceOffset);
  const serialized = bendpoints.map((point) => `<bendpoints x="${point.x}" y="${point.y}"/>`).join(`${eol}${indent}`);
  if (existing.length) {
    patches.push({ start: existing[0].start, end: existing.at(-1).closeEnd, value: serialized });
    return;
  }
  if (!referenceNode?.closeStart) throw new Error(`Conexão ${connection.businessObject} sem ponto seguro para bendpoints.`);
  if (serialized) {
    const childIndent = `${indent}  `;
    const appended = bendpoints.map((point) => `<bendpoints x="${point.x}" y="${point.y}"/>`).join(`${eol}${childIndent}`);
    patches.push({
      start: connection.node.closeStart,
      end: connection.node.closeStart,
      value: `  ${appended}${eol}${indent}`
    });
  }
}

function normalizeValue(property, value) {
  if (BOOLEAN_PROPERTIES.has(property)) return value === true || value === 'true' ? 'true' : 'false';
  if (['prazoConclusao', 'esforcoPrevisto'].includes(property)) return durationToMinutes(value);
  if (property === 'signalId') {
    const signalId = String(value ?? '').trim();
    if (!/^\d+$/.test(signalId)) throw new Error('Sinal inválido. Selecione um código de sinal existente.');
    return String(Number(signalId));
  }
  if (property === 'cores') {
    const hex = String(value ?? '').trim().replace(/^#/, '').toUpperCase();
    if (!/^[0-9A-F]{6}$/.test(hex)) throw new Error('Cor inválida. Informe seis dígitos hexadecimais, por exemplo FF0000.');
    return hex;
  }
  return String(value ?? '');
}

function messageDataValues(messageData) {
  if (!messageData) return {};
  const document = parseMessageData(messageData);
  const values = {};
  for (const [property, tag] of MESSAGE_DATA_PROPERTIES) {
    const node = findMessageDataNode(document, tag);
    values[property] = decodeXml(messageData.slice(node.openEnd, node.closeStart));
  }
  return values;
}

function patchMessageData(messageData, changes) {
  const document = parseMessageData(messageData);
  const patches = [];
  for (const [tag, inputValue] of changes) {
    const node = findMessageDataNode(document, tag);
    const value = tag === 'content' ? normalizeEmbeddedLineEndings(inputValue) : inputValue;
    patches.push({
      start: node.openEnd,
      end: node.closeStart,
      value: encodeXmlText(value)
    });
  }
  return applyPatches(messageData, patches);
}

function parseMessageData(messageData) {
  try {
    const document = tokenizeXml(messageData);
    const root = document.children[0];
    if (!root || root.name !== 'org.eclipse.bpmn2.documentacional.BpmnMessageData') {
      throw new Error('raiz XStream inesperada');
    }
    return document;
  } catch (error) {
    throw new Error(`Bloco messageData inválido: ${error.message}`);
  }
}

function findMessageDataNode(document, tag) {
  const matches = descendants(document, (node) => node.name === tag);
  if (matches.length !== 1 || matches[0].selfClosing || matches[0].children.length) {
    throw new Error(`Bloco messageData sem o campo simples <${tag}> esperado.`);
  }
  return matches[0];
}

function normalizeEmbeddedLineEndings(value) {
  return String(value ?? '').replace(/\r\n|\r|\n/g, '\r\n');
}

function encodeXmlText(value) {
  let output = '';
  for (const char of String(value ?? '')) {
    if (char === '&') output += '&amp;';
    else if (char === '<') output += '&lt;';
    else if (char === '>') output += '&gt;';
    else if (char === '\r') output += '&#xd;';
    else output += char;
  }
  return output;
}

function durationToMinutes(value) {
  const input = String(value ?? '').trim();
  const match = input.match(/^(\d{1,6}):([0-5]\d)$/);
  if (!match) throw new Error(`Duração inválida: "${input}". Use o formato HHH:mm, por exemplo 024:00.`);
  return `${(Number(match[1]) * 60) + Number(match[2])}.0`;
}

function patchAttribute(text, node, name, value, patches, options = {}) {
  if (!node) {
    if (options.required) throw new Error(`Nó visual obrigatório ausente para ${name}.`);
    return;
  }
  const attribute = node.attributeMap[name];
  if (attribute) {
    if (BOOLEAN_PROPERTIES.has(name) && value === 'false') {
      patches.push(removalPatch(text, node, attribute));
    } else {
      patches.push({
        start: attribute.valueStart,
        end: attribute.valueEnd,
        value: encodeXmlAttributeLike(value, attribute.rawValue)
      });
    }
    return;
  }
  if (value === '' || (BOOLEAN_PROPERTIES.has(name) && value === 'false')) return;

  let insertion = node.openEnd - 1;
  while (insertion > node.start && /\s/.test(text[insertion - 1])) insertion -= 1;
  if (text[insertion - 1] === '/') insertion -= 1;
  let encoded = encodeXmlAttribute(value);
  if (options.preserveGreaterThan) encoded = encoded.replaceAll('&gt;', '>');
  patches.push({ start: insertion, end: insertion, value: ` ${name}="${encoded}"` });
}

function encodeXmlAttributeLike(value, originalRawValue) {
  let encoded = encodeXmlAttribute(value);
  if (!String(originalRawValue).includes('&gt;')) encoded = encoded.replaceAll('&gt;', '>');
  if (!String(originalRawValue).includes('&apos;')) encoded = encoded.replaceAll('&apos;', "'");
  return encoded;
}

function removalPatch(text, node, attribute) {
  let start = attribute.nameStart;
  while (start > node.start && /\s/.test(text[start - 1])) start -= 1;
  return { start, end: attribute.valueEnd + 1, value: '' };
}

function patchMaterializedShapeLabel(text, element, value, patches) {
  if (!element.shape?.node) return;
  const labels = descendants(element.shape.node, (node) => {
    if (node.localName !== 'graphicsAlgorithm') return false;
    const type = node.attributeMap['xsi:type']?.value ?? '';
    return (type === 'al:Text' || type === 'al:MultiText') && node.attributeMap.value;
  });
  const matching = labels.find((node) => node.attributeMap.value.value === element.name);
  if (matching) patchAttribute(text, matching, 'value', value, patches);
}

function deduplicatePatches(patches) {
  const bySpan = new Map();
  for (const patch of patches) bySpan.set(`${patch.start}:${patch.end}`, patch);
  return [...bySpan.values()];
}

function applyPatches(text, patches) {
  const ordered = [...patches].sort((a, b) => b.start - a.start || b.end - a.end);
  let output = text;
  let lastStart = text.length + 1;
  for (const patch of ordered) {
    if (patch.end > lastStart) throw new Error('Patches XML sobrepostos.');
    output = output.slice(0, patch.start) + patch.value + output.slice(patch.end);
    lastStart = patch.start;
  }
  return output;
}

module.exports = {
  ALLOWED_PROPERTIES,
  BOOLEAN_PROPERTIES,
  allowedPropertiesFor,
  durationToMinutes,
  messageDataValues,
  TASK_TYPE_CONVERSIONS,
  convertTaskType,
  createConnectedEndEvent,
  createConnectedGateway,
  createConnectedIntermediateEvent,
  createConnectedTask,
  createAttachedErrorEvent,
  createIsolatedNode,
  createPool,
  createSequenceFlow,
  reconnectSequenceFlow,
  createSwimLane,
  deleteAttachedErrorEvent,
  deleteIsolatedArtifact,
  deleteIsolatedEvent,
  deleteIsolatedGateway,
  deleteIsolatedSubProcess,
  deleteIsolatedTask,
  deleteDiagramContainer,
  deleteDiagramElements,
  deleteSequenceFlow,
  patchLayout,
  patchProcessForm,
  patchProcessAttachmentSecurity,
  patchProcessGeneral,
  patchProcessIdentity,
  patchProcessVersion,
  patchProcessManager,
  patchEventInitializer,
  patchExtendedProperties,
  patchTaskAttachmentRules,
  patchTaskMobile,
  patchTaskNotifications,
  patchTaskDeadline,
  patchTaskJoint,
  patchEventTrigger,
  patchGatewayBranches,
  patchTaskAssignment,
  patchTaskScriptReference,
  patchSubProcessFormMaps,
  patchProcess
};
