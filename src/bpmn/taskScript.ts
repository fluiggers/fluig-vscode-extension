'use strict';

const TASK_SCRIPT_TYPES = Object.freeze({
  '82': { label: 'atividade de serviço', parameters: 'attempt, message' },
  '86': { label: 'atividade de negócio', parameters: '' },
  '87': { label: 'atividade de script', parameters: '' }
});

function supportsTaskScript(element) {
  return element?.tag === 'BpmnTask' && Boolean(TASK_SCRIPT_TYPES[String(element.type ?? '')]);
}

function expectedTaskScriptFileName(processId, elementId) {
  const process = safeFileNamePart(processId, 'código do processo');
  const task = safeIdentifier(elementId, 'id da atividade');
  return `${process}.${task}.js`;
}

function taskScriptDefinition(element, processId) {
  if (!supportsTaskScript(element)) return null;
  const expectedFileName = expectedTaskScriptFileName(processId, element.id);
  const configuredFileName = String(element.attributes?.scriptFileName ?? '').trim();
  return {
    fileName: configuredFileName || expectedFileName,
    expectedFileName,
    referenceValid: !configuredFileName || configuredFileName === expectedFileName,
    existsInProcess: Boolean(configuredFileName)
  };
}

function taskScriptTemplate(element) {
  if (!supportsTaskScript(element)) throw new Error('O elemento não aceita script de tarefa.');
  const id = safeIdentifier(element.id, 'id da atividade');
  const parameters = TASK_SCRIPT_TYPES[String(element.type)].parameters;
  return `function ${id}(${parameters}) {\n}`;
}

function safeIdentifier(value, label) {
  const normalized = String(value ?? '').trim();
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(normalized) || normalized.includes('..')) {
    throw new Error(`${label} inválido para gerar o script.`);
  }
  return normalized;
}

function safeFileNamePart(value, label) {
  const normalized = String(value ?? '').trim();
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(normalized) || normalized.includes('..')) {
    throw new Error(`${label} inválido para gerar o script.`);
  }
  return normalized;
}

module.exports = {
  TASK_SCRIPT_TYPES,
  expectedTaskScriptFileName,
  supportsTaskScript,
  taskScriptDefinition,
  taskScriptTemplate
};
