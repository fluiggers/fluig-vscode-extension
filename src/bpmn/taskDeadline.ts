'use strict';

const SUPPORTED_ELEMENT_TYPES = new Set([
  'BpmnTask:80',
  'BpmnTask:81',
  'BpmnStartEvent:10'
]);

function supportsTaskDeadline(element) {
  return SUPPORTED_ELEMENT_TYPES.has(`${element?.tag}:${element?.type}`);
}

function taskDeadlineDefinition(element, formFields = [], expedientCatalog = []) {
  if (!supportsTaskDeadline(element)) return null;
  const attributes = element.attributes ?? {};
  const deadlineFieldName = String(attributes.deadlineFieldName ?? '').trim();
  const prazoConclusao = String(attributes.prazoConclusao ?? '').trim();
  if (deadlineFieldName && prazoConclusao) {
    return {
      supported: false,
      reason: 'O elemento possui prazo fixo e campo de prazo ao mesmo tempo. Corrija o XML antes de editar.',
      expedient: String(attributes.expediente ?? ''),
      mode: 'form',
      fixedDuration: minutesToDuration(prazoConclusao),
      deadlineFieldName,
      expedientOptions: catalogWithLegacy(expedientCatalog, attributes.expediente),
      formFieldOptions: stringCatalogWithLegacy(formFields, deadlineFieldName)
    };
  }
  return {
    supported: true,
    expedient: String(attributes.expediente ?? ''),
    mode: deadlineFieldName ? 'form' : 'fixed',
    fixedDuration: minutesToDuration(prazoConclusao),
    deadlineFieldName,
    expedientOptions: catalogWithLegacy(expedientCatalog, attributes.expediente),
    formFieldOptions: stringCatalogWithLegacy(formFields, deadlineFieldName)
  };
}

function normalizeTaskDeadlineConfiguration(configuration, catalogs = {}, current = {}) {
  const requested = configuration ?? {};
  const expedient = String(requested.expedient ?? '').trim();
  const mode = String(requested.mode ?? '').trim();
  if (!['fixed', 'form'].includes(mode)) {
    throw new Error('Selecione prazo por valor fixo ou por campo do formulário.');
  }
  validateCatalogValue(
    expedient,
    catalogs.expedientCatalog ?? [],
    String(current.expediente ?? '').trim(),
    'expediente'
  );
  if (mode === 'form') {
    const deadlineFieldName = String(requested.deadlineFieldName ?? '').trim();
    if (!deadlineFieldName) throw new Error('Selecione o campo do formulário usado como prazo.');
    const formCatalog = (catalogs.formFields ?? []).map((value) => ({ value, label: value }));
    validateCatalogValue(
      deadlineFieldName,
      formCatalog,
      String(current.deadlineFieldName ?? '').trim(),
      'campo de prazo'
    );
    return { expedient, mode, deadlineFieldName, prazoConclusao: '' };
  }
  const prazoConclusao = durationToMinutes(requested.fixedDuration);
  return {
    expedient,
    mode,
    deadlineFieldName: '',
    prazoConclusao: prazoConclusao === '0.0' ? '' : prazoConclusao
  };
}

function durationToMinutes(value) {
  const input = String(value ?? '').trim();
  const match = input.match(/^(\d{1,6}):([0-5]\d)$/);
  if (!match) throw new Error(`Duração inválida: "${input}". Use o formato HHH:mm, por exemplo 024:00.`);
  return `${(Number(match[1]) * 60) + Number(match[2])}.0`;
}

function minutesToDuration(rawValue) {
  const total = Number.parseFloat(rawValue ?? '0');
  if (!Number.isFinite(total) || total < 0) return '000:00';
  const minutes = Math.round(total);
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(3, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function catalogWithLegacy(catalog, currentValue) {
  const values = normalizeCatalog(catalog);
  const current = String(currentValue ?? '').trim();
  if (current && !values.some((item) => item.value === current)) {
    values.push({ value: current, label: `${current} (valor atual)` });
  }
  return values;
}

function stringCatalogWithLegacy(catalog, currentValue) {
  return catalogWithLegacy((catalog ?? []).map((value) => ({ value, label: value })), currentValue);
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
  if (!value) return;
  if (value === currentValue) return;
  if (!normalizeCatalog(catalog).some((item) => item.value === value)) {
    throw new Error(`O ${label} "${value}" não foi encontrado no projeto.`);
  }
}

module.exports = {
  durationToMinutes,
  minutesToDuration,
  normalizeTaskDeadlineConfiguration,
  supportsTaskDeadline,
  taskDeadlineDefinition
};
