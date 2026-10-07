'use strict';

const { normalizeProcessCode } = require('./processIdentity');

function supportsProcessGeneral(element) {
  return element?.tag === 'BpmnProcess';
}

function processGeneralDefinition(element, volumeCatalog = [], expedientCatalog = [], serverCatalog = []) {
  if (!supportsProcessGeneral(element)) return null;
  const attributes = element.attributes ?? {};
  const complementsLevel = String(attributes.complementsLevel ?? '').trim();
  const activeProcessRaw = Object.prototype.hasOwnProperty.call(attributes, 'activeProcess')
    ? String(attributes.activeProcess)
    : '';
  const publicProcessRaw = Object.prototype.hasOwnProperty.call(attributes, 'publicProcess')
    ? String(attributes.publicProcess)
    : '';
  return {
    supported: true,
    code: String(attributes.id ?? element.id ?? ''),
    serverId: String(attributes.serverId ?? ''),
    version: String(attributes.version ?? ''),
    description: String(attributes.name ?? element.name ?? ''),
    instruction: String(attributes.instruction ?? ''),
    category: String(attributes.category ?? ''),
    volume: String(attributes.volume ?? ''),
    expedient: String(attributes.expedient ?? ''),
    deadlineTime: minutesToDuration(attributes.deadlineTime),
    warningTime: minutesToDuration(attributes.warningTime),
    active: activeProcessRaw !== 'false',
    publicProcess: publicProcessRaw === 'true',
    activeProcessLegacy: activeProcessRaw && activeProcessRaw !== 'false' ? activeProcessRaw : '',
    publicProcessLegacy: publicProcessRaw && publicProcessRaw !== 'true' ? publicProcessRaw : '',
    complements: {
      enabled: Boolean(complementsLevel),
      level: complementsLevel || '1',
      legacyLevel: complementsLevel && !['1', '2'].includes(complementsLevel) ? complementsLevel : '',
      notifyResponsible: attributes.notifyResponsibleComplements === 'true',
      notifyRequisitioner: attributes.notifyRequisitionerComplements === 'true',
      notifyManager: attributes.notifyManagerComplements === 'true'
    },
    serverOptions: catalogWithLegacy(serverCatalog, attributes.serverId),
    volumeOptions: catalogWithLegacy(volumeCatalog, attributes.volume),
    expedientOptions: catalogWithLegacy(expedientCatalog, attributes.expedient)
  };
}

function normalizeProcessGeneralConfiguration(configuration, catalogs = {}, current = {}) {
  const requested = configuration ?? {};
  const code = normalizeProcessCode(requested.code ?? current.id ?? '');
  const description = String(requested.description ?? '').trim();
  if (!description) throw new Error('Informe a descrição do processo.');
  const volume = String(requested.volume ?? '').trim();
  const expedient = String(requested.expedient ?? '').trim();
  const serverId = String(requested.serverId ?? current.serverId ?? '').trim();
  const deadlineTime = durationToMinutes(requested.deadlineTime ?? minutesToDuration(current.deadlineTime));
  const warningTime = durationToMinutes(requested.warningTime ?? minutesToDuration(current.warningTime));
  validateCatalogValue(serverId, catalogs.serverCatalog ?? [], String(current.serverId ?? '').trim(), 'servidor');
  validateCatalogValue(volume, catalogs.volumeCatalog ?? [], String(current.volume ?? '').trim(), 'volume');
  validateCatalogValue(expedient, catalogs.expedientCatalog ?? [], String(current.expedient ?? '').trim(), 'expediente');
  const normalized = {
    code,
    serverId,
    description,
    instruction: normalizeLineEndings(requested.instruction),
    category: String(requested.category ?? '').trim(),
    volume,
    expedient,
    deadlineTime,
    warningTime
  };
  if (Object.prototype.hasOwnProperty.call(requested, 'complements')) {
    normalized.complements = normalizeComplements(requested.complements, current);
  }
  if (requested.activeTouched === true) {
    normalized.active = requested.active === true;
  }
  if (requested.publicTouched === true) {
    normalized.publicProcess = requested.publicProcess === true;
  }
  return normalized;
}

function normalizeComplements(configuration, current = {}) {
  const requested = configuration ?? {};
  const enabled = requested.enabled === true;
  const currentLevel = String(current.complementsLevel ?? '').trim();
  const level = String(requested.level ?? currentLevel ?? '').trim();
  if (enabled && !['1', '2'].includes(level) && level !== currentLevel) {
    throw new Error(`Nivel de complementos invalido: "${level || '(vazio)'}".`);
  }
  if (enabled && !level) {
    throw new Error('Selecione quem pode receber complementos no processo.');
  }
  return {
    enabled,
    level,
    notifyResponsible: requested.notifyResponsible === undefined
      ? current.notifyResponsibleComplements === 'true'
      : requested.notifyResponsible === true,
    notifyRequisitioner: requested.notifyRequisitioner === undefined
      ? current.notifyRequisitionerComplements === 'true'
      : requested.notifyRequisitioner === true,
    notifyManager: requested.notifyManager === undefined
      ? current.notifyManagerComplements === 'true'
      : requested.notifyManager === true
  };
}

function minutesToDuration(value) {
  const minutes = Number.parseFloat(String(value ?? '0'));
  const safeMinutes = Number.isFinite(minutes) && minutes >= 0 ? Math.floor(minutes) : 0;
  return `${String(Math.floor(safeMinutes / 60)).padStart(3, '0')}:${String(safeMinutes % 60).padStart(2, '0')}`;
}

function durationToMinutes(value) {
  const input = String(value ?? '').trim();
  const match = input.match(/^(\d{1,6}):([0-5]\d)$/);
  if (!match) {
    throw new Error(`Prazo invalido: "${input}". Use o formato HHH:mm, por exemplo 024:00.`);
  }
  return `${(Number(match[1]) * 60) + Number(match[2])}.0`;
}

function normalizeLineEndings(value) {
  return String(value ?? '').replace(/\r\n|\r|\n/g, '\r\n');
}

function catalogWithLegacy(catalog, currentValue) {
  const values = normalizeCatalog(catalog);
  const current = String(currentValue ?? '').trim();
  if (current && !values.some((item) => item.value === current)) {
    values.push({ value: current, label: `${current} (valor atual)` });
  }
  return values;
}

function normalizeCatalog(catalog) {
  const output = [];
  const seen = new Set();
  for (const entry of catalog ?? []) {
    const value = String(entry?.value ?? '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    output.push({ value, label: String(entry?.label ?? value).trim() || value });
  }
  return output;
}

function validateCatalogValue(value, catalog, currentValue, label) {
  if (!value || value === currentValue) return;
  if (!normalizeCatalog(catalog).some((item) => item.value === value)) {
    throw new Error(`O ${label} "${value}" não foi encontrado no projeto.`);
  }
}

module.exports = {
  durationToMinutes,
  minutesToDuration,
  normalizeComplements,
  normalizeProcessGeneralConfiguration,
  processGeneralDefinition,
  supportsProcessGeneral
};
