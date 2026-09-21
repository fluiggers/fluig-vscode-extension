'use strict';

const { decodeXml, tokenizeXml } = require('./xmlTokenizer');

const TRIGGER_ROOT = 'org.eclipse.bpmn2.documentacional.BpmnTriggerData';
const SUPPORTED_EVENT_TRIGGERS = new Set([
  'BpmnStartEvent:12',
  'BpmnStartEvent:13',
  'BpmnStartEvent:16',
  'BpmnIntermediateEvent:32',
  'BpmnIntermediateEvent:35'
]);
const RUN_TYPES = Object.freeze([
  { value: 'MINUTE', label: 'Por minuto' },
  { value: 'HOUR', label: 'Por hora' },
  { value: 'DAY', label: 'Por dia' },
  { value: 'WORK_DAY', label: 'Todos os dias úteis' },
  { value: 'MONTH', label: 'Por dia do mês' },
  { value: 'WEEK_MONTH', label: 'Por semana do mês' },
  { value: 'WEEK_DAY', label: 'Por dia da semana' }
]);
const WEEKDAYS = Object.freeze([
  { value: 'SUN', label: 'Domingo' },
  { value: 'MON', label: 'Segunda' },
  { value: 'TUE', label: 'Terça' },
  { value: 'WED', label: 'Quarta' },
  { value: 'THU', label: 'Quinta' },
  { value: 'FRI', label: 'Sexta' },
  { value: 'SAT', label: 'Sábado' }
]);
const WEEK_ORDINALS = Object.freeze([
  { value: '1o.', label: '1o.' },
  { value: '2o.', label: '2o.' },
  { value: '3o.', label: '3o.' },
  { value: '4o.', label: '4o.' },
  { value: 'Ult.', label: 'Últ.' }
]);

function supportsEventTrigger(element) {
  return SUPPORTED_EVENT_TRIGGERS.has(`${element?.tag}:${element?.type}`);
}

function parseEventTriggerData(trigger) {
  if (!trigger) throw new Error('Evento sem bloco trigger do Fluig.');
  let document;
  try {
    document = tokenizeXml(String(trigger));
  } catch (error) {
    throw new Error(`Bloco trigger inválido: ${error.message}`);
  }
  const root = document.children[0];
  if (!root || root.name !== TRIGGER_ROOT) {
    throw new Error('Bloco trigger inválido: raiz XStream inesperada.');
  }
  const value = (name) => {
    const nodes = root.children.filter((node) => node.name === name);
    if (nodes.length > 1 || nodes[0]?.selfClosing || nodes[0]?.children.length) {
      throw new Error(`Bloco trigger inválido: campo <${name}> incompatível.`);
    }
    return nodes[0] ? decodeXml(String(trigger).slice(nodes[0].openEnd, nodes[0].closeStart)) : '';
  };
  const runType = value('runType');
  return {
    runType,
    time: displayTime(value('timeTrigger')),
    frequency: value('frequencia'),
    dayOfWeek: value('diaSemana'),
    weekdays: runType === 'WEEK_DAY' ? value('frequencia').split(',').filter(Boolean) : [],
    scriptCondition: value('scriptCondition'),
    isCondition: value('isCondition')
  };
}

function eventTriggerDefinition(element) {
  if (!supportsEventTrigger(element)) return null;
  try {
    const parsed = element.attributes?.trigger
      ? parseEventTriggerData(element.attributes.trigger)
      : defaultEventTriggerData();
    return {
      supported: true,
      ...parsed,
      runTypes: RUN_TYPES,
      weekdays: parsed.weekdays,
      weekdayOptions: WEEKDAYS,
      ordinalOptions: WEEK_ORDINALS
    };
  } catch (error) {
    return {
      supported: false,
      reason: error.message,
      runTypes: RUN_TYPES,
      weekdayOptions: WEEKDAYS,
      ordinalOptions: WEEK_ORDINALS
    };
  }
}

function patchEventTriggerData(trigger, request) {
  const current = trigger ? parseEventTriggerData(trigger) : defaultEventTriggerData();
  const normalized = normalizeEventTriggerRequest(request, current);
  if (!trigger) return serializeEventTriggerData(normalized);
  const document = tokenizeXml(String(trigger));
  const root = document.children[0];
  const patches = [];
  patchSimpleChild(String(trigger), root, 'runType', normalized.runType, patches);
  patchSimpleChild(String(trigger), root, 'timeTrigger', normalized.time, patches);
  patchSimpleChild(String(trigger), root, 'frequencia', normalized.frequency, patches);
  if (normalized.runType === 'WEEK_MONTH') {
    patchSimpleChild(String(trigger), root, 'diaSemana', normalized.dayOfWeek, patches, { insert: true });
  } else {
    removeSimpleChild(String(trigger), root, 'diaSemana', patches);
  }
  return applyPatches(String(trigger), patches);
}

function defaultEventTriggerData() {
  return {
    runType: 'MINUTE',
    time: '00:00:00',
    frequency: '01',
    dayOfWeek: '',
    weekdays: [],
    scriptCondition: '',
    isCondition: 'false'
  };
}

function serializeEventTriggerData(data) {
  const lines = [
    `<${TRIGGER_ROOT}>`,
    `  <runType>${encodeXmlText(data.runType)}</runType>`,
    `  <timeTrigger>${encodeXmlText(data.time)}</timeTrigger>`,
    `  <frequencia>${encodeXmlText(data.frequency)}</frequencia>`
  ];
  if (data.runType === 'WEEK_MONTH') lines.push(`  <diaSemana>${encodeXmlText(data.dayOfWeek)}</diaSemana>`);
  lines.push('  <isCondition>false</isCondition>', `</${TRIGGER_ROOT}>`);
  return lines.join('\n');
}

function normalizeEventTriggerRequest(request, current = {}) {
  const runType = String(request?.runType ?? '').trim();
  if (!RUN_TYPES.some((item) => item.value === runType)) {
    throw new Error('Frequência Quartz inválida.');
  }
  // O Studio oculta o horário em MINUTE/HOUR e normaliza o valor para 0:0:0
  // ao salvar. Não preserve um horário legado invisível nesses dois modos.
  const time = ['MINUTE', 'HOUR'].includes(runType)
    ? '0:0:0'
    : normalizeTime(request?.time ?? current.time ?? '00:00:00');
  let frequency = String(request?.frequency ?? '').trim();
  let dayOfWeek = String(request?.dayOfWeek ?? '').trim();
  if (runType === 'WEEK_DAY') {
    const selected = new Set(Array.isArray(request?.weekdays) ? request.weekdays.map(String) : []);
    const invalid = [...selected].some((day) => !WEEKDAYS.some((item) => item.value === day));
    if (invalid || selected.size === 0) throw new Error('Selecione ao menos um dia da semana.');
    frequency = WEEKDAYS.map((item) => item.value).filter((day) => selected.has(day)).join(',');
  } else if (runType === 'WEEK_MONTH') {
    if (!WEEK_ORDINALS.some((item) => item.value === frequency)) {
      throw new Error('Semana do mês inválida.');
    }
    if (!WEEKDAYS.some((item) => item.value === dayOfWeek)) {
      throw new Error('Dia da semana inválido.');
    }
  } else if (runType !== 'WORK_DAY') {
    const maximum = runType === 'MINUTE' ? 59 : runType === 'HOUR' ? 23 : 31;
    const numeric = Number.parseInt(frequency, 10);
    if (!Number.isInteger(numeric) || numeric < 1 || numeric > maximum) {
      throw new Error(`Valor de frequência inválido para ${runType}.`);
    }
    frequency = String(numeric).padStart(2, '0');
  } else {
    // O Eclipse não mostra este campo em WORK_DAY e conserva o valor anterior.
    frequency = String(current.frequency || frequency || '01');
  }
  return { runType, time, frequency, dayOfWeek };
}

function normalizeTime(value) {
  const match = String(value ?? '').trim().match(/^(\d{1,2}):([0-5]?\d):([0-5]?\d)$/);
  if (!match || Number(match[1]) > 23) throw new Error('Horário inválido. Use HH:mm:ss.');
  return `${Number(match[1])}:${Number(match[2])}:${Number(match[3])}`;
}

function displayTime(value) {
  const match = String(value ?? '').trim().match(/^(\d{1,2}):([0-5]?\d):([0-5]?\d)$/);
  if (!match || Number(match[1]) > 23) return '00:00:00';
  return `${String(Number(match[1])).padStart(2, '0')}:${String(Number(match[2])).padStart(2, '0')}:${String(Number(match[3])).padStart(2, '0')}`;
}

function patchSimpleChild(text, root, name, value, patches, options = {}) {
  const matches = root.children.filter((node) => node.name === name);
  if (matches.length > 1) throw new Error(`Bloco trigger com múltiplos campos <${name}>.`);
  const node = matches[0];
  if (node) {
    if (node.selfClosing || node.children.length) throw new Error(`Campo <${name}> incompatível no trigger.`);
    patches.push({ start: node.openEnd, end: node.closeStart, value: encodeXmlText(value) });
    return;
  }
  if (!options.insert) throw new Error(`Bloco trigger sem o campo <${name}> esperado.`);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lineStart = text.lastIndexOf('\n', root.closeStart - 1) + 1;
  const rootIndent = text.slice(lineStart, root.closeStart).match(/^\s*/)?.[0] ?? '';
  patches.push({
    start: root.closeStart,
    end: root.closeStart,
    value: `  <${name}>${encodeXmlText(value)}</${name}>${eol}${rootIndent}`
  });
}

function removeSimpleChild(text, root, name, patches) {
  const matches = root.children.filter((node) => node.name === name);
  if (matches.length > 1) throw new Error(`Bloco trigger com múltiplos campos <${name}>.`);
  const node = matches[0];
  if (!node) return;
  let start = node.start;
  while (start > root.openEnd && (text[start - 1] === ' ' || text[start - 1] === '\t')) start -= 1;
  let end = node.closeEnd;
  if (text.startsWith('\r\n', end)) end += 2;
  else if (text[end] === '\n') end += 1;
  patches.push({ start, end, value: '' });
}

function encodeXmlText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function applyPatches(text, patches) {
  let output = text;
  for (const patch of [...patches].sort((left, right) => right.start - left.start)) {
    output = output.slice(0, patch.start) + patch.value + output.slice(patch.end);
  }
  return output;
}

module.exports = {
  RUN_TYPES,
  WEEKDAYS,
  WEEK_ORDINALS,
  eventTriggerDefinition,
  defaultEventTriggerData,
  normalizeEventTriggerRequest,
  parseEventTriggerData,
  patchEventTriggerData,
  supportsEventTrigger
};
