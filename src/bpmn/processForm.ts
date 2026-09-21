'use strict';

const { decodeXml, tokenizeXml } = require('./xmlTokenizer');

const DESCRIPTOR_NODE = 'org.eclipse.bpmn2.impl.BpmnProcessFormField';
const DESCRIPTOR_FIELDS = ['id', 'label', 'cardIndex'];
const MAX_DESCRIPTOR_FIELDS = 15;
const FORM_SOURCES = Object.freeze([
  { value: 'local', label: 'Local' },
  { value: 'server', label: 'Servidor' }
]);

function supportsProcessForm(element) {
  return element?.tag === 'BpmnProcess';
}

function processFormDefinition(element, localForms = []) {
  if (!supportsProcessForm(element)) return null;
  const attributes = element.attributes ?? {};
  const source = normalizedSource(attributes.formSource || 'local');
  const cardIndex = String(attributes.cardIndex ?? '').trim();
  const descriptors = descriptorFieldValues(attributes.descriptorFields);
  const forms = normalizedLocalForms(localForms);
  if (source === 'local' && cardIndex && !forms.some((form) => form.value === cardIndex)) {
    forms.push({
      value: cardIndex,
      label: `${cardIndex} (formulário atual)`,
      fields: descriptors.map((field) => field.id)
    });
  }
  const currentForm = forms.find((form) => form.value === cardIndex);
  if (currentForm) {
    currentForm.fields = [...new Set([...currentForm.fields, ...descriptors.map((field) => field.id)])];
  }
  return {
    supported: true,
    source,
    sourceOptions: FORM_SOURCES.map((option) => ({ ...option })),
    cardIndex,
    uniqueCardVersion: isTrue(attributes.uniquecardversion),
    inheritFormSecurity: isTrue(attributes.inheritFormSecurity),
    descriptorFields: descriptors,
    localForms: forms,
    maxDescriptorFields: MAX_DESCRIPTOR_FIELDS
  };
}

function normalizeProcessFormConfiguration(configuration, localForms = [], current = {}) {
  const requested = configuration ?? {};
  const source = normalizedSource(requested.source);
  const cardIndex = normalizedCardIndex(requested.cardIndex);
  const forms = normalizedLocalForms(localForms);
  if (source === 'local') {
    const isCurrent = String(current.formSource ?? '').toLowerCase() === 'local'
      && String(current.cardIndex ?? '') === cardIndex;
    const form = forms.find((entry) => entry.value === cardIndex);
    if (!form && !isCurrent) throw new Error(`O formulário local "${cardIndex}" não foi encontrado no projeto.`);
  }
  const descriptorFields = normalizeDescriptorFields(requested.descriptorFields, source, cardIndex);
  if (source === 'local') {
    const form = forms.find((entry) => entry.value === cardIndex);
    if (form) {
      const allowed = new Set(form.fields);
      for (const descriptor of descriptorFields) {
        if (!allowed.has(descriptor.id)) {
          throw new Error(`O campo descritor "${descriptor.id}" não pertence ao formulário local ${cardIndex}.`);
        }
      }
    }
  }
  return {
    source,
    cardIndex,
    uniqueCardVersion: requested.uniqueCardVersion === true,
    inheritFormSecurity: requested.inheritFormSecurity === true,
    descriptorFields
  };
}

function descriptorFieldValues(value) {
  if (!value) return [];
  let document;
  try {
    document = tokenizeXml(value);
  } catch (error) {
    throw new Error(`Bloco descriptorFields inválido: ${error.message}`);
  }
  const root = document.children[0];
  if (!root || root.name !== 'list') throw new Error('Bloco descriptorFields inválido: raiz <list> esperada.');
  if (root.selfClosing) return [];
  const unexpected = root.children.filter((node) => node.name !== DESCRIPTOR_NODE);
  if (unexpected.length) throw new Error(`Bloco descriptorFields contém elemento desconhecido <${unexpected[0].name}>.`);
  const descriptors = root.children.map((node) => {
    const values = {};
    for (const field of DESCRIPTOR_FIELDS) {
      const child = directSimpleChild(node, field);
      values[field] = decodeXml(value.slice(child.openEnd, child.closeStart));
    }
    return normalizeDescriptor(values, values.cardIndex);
  });
  assertDescriptorLimit(descriptors);
  assertUniqueDescriptorIds(descriptors);
  return descriptors;
}

function normalizeDescriptorFields(requested, source, processCardIndex) {
  if (!Array.isArray(requested)) throw new Error('A lista de campos descritores é inválida.');
  assertDescriptorLimit(requested);
  const descriptors = requested.map((descriptor) => {
    const cardIndex = source === 'local'
      ? processCardIndex
      : normalizedOptionalText(descriptor?.cardIndex, 300, 'cardIndex do descritor');
    return normalizeDescriptor(descriptor, cardIndex);
  });
  assertUniqueDescriptorIds(descriptors);
  return descriptors;
}

function serializeDescriptorFields(descriptors) {
  if (!descriptors.length) return '<list/>';
  const lines = ['<list>'];
  for (const descriptor of descriptors) {
    lines.push(
      `  <${DESCRIPTOR_NODE}>`,
      `    <id>${encodeEmbeddedText(descriptor.id)}</id>`,
      `    <label>${encodeEmbeddedText(descriptor.label)}</label>`,
      `    <cardIndex>${encodeEmbeddedText(descriptor.cardIndex)}</cardIndex>`,
      `  </${DESCRIPTOR_NODE}>`
    );
  }
  lines.push('</list>');
  return lines.join('\n');
}

function normalizeDescriptor(descriptor, cardIndex) {
  const id = normalizedRequiredText(descriptor?.id, 200, 'id do campo descritor');
  const label = normalizedRequiredText(descriptor?.label || id, 500, `label do campo ${id}`);
  return { id, label, cardIndex: normalizedOptionalText(cardIndex, 300, `cardIndex do campo ${id}`) };
}

function normalizedSource(value) {
  const source = String(value ?? '').trim().toLowerCase();
  if (!FORM_SOURCES.some((option) => option.value === source)) {
    throw new Error(`Origem de formulário inválida: ${source || '(vazia)'}.`);
  }
  return source;
}

function normalizedCardIndex(value) {
  return normalizedRequiredText(value, 300, 'código do formulário');
}

function normalizedRequiredText(value, limit, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized.length > limit || /[<>&\r\n\u0000-\u001f]/.test(normalized)) {
    throw new Error(`Valor inválido para ${label}.`);
  }
  return normalized;
}

function normalizedOptionalText(value, limit, label) {
  const normalized = String(value ?? '').trim();
  if (normalized.length > limit || /[<>&\r\n\u0000-\u001f]/.test(normalized)) {
    throw new Error(`Valor inválido para ${label}.`);
  }
  return normalized;
}

function normalizedLocalForms(forms) {
  const output = [];
  const seen = new Set();
  for (const form of forms ?? []) {
    const value = String(form?.value ?? '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    output.push({
      value,
      label: String(form?.label ?? value).trim() || value,
      fields: [...new Set((form?.fields ?? []).map((field) => String(field).trim()).filter(Boolean))]
    });
  }
  return output;
}

function directSimpleChild(node, name) {
  const matches = node.children.filter((child) => child.name === name);
  if (matches.length !== 1 || matches[0].selfClosing || matches[0].children.length) {
    throw new Error(`Bloco descriptorFields sem o campo simples <${name}> esperado.`);
  }
  const unexpected = node.children.filter((child) => !DESCRIPTOR_FIELDS.includes(child.name));
  if (unexpected.length) throw new Error(`Campo descritor contém campo desconhecido <${unexpected[0].name}>.`);
  return matches[0];
}

function assertDescriptorLimit(descriptors) {
  if (descriptors.length > MAX_DESCRIPTOR_FIELDS) {
    throw new Error(`O Fluig permite no máximo ${MAX_DESCRIPTOR_FIELDS} campos descritores.`);
  }
}

function assertUniqueDescriptorIds(descriptors) {
  const seen = new Set();
  for (const descriptor of descriptors) {
    const id = String(descriptor.id ?? '').trim();
    if (seen.has(id)) throw new Error(`Campo descritor duplicado: ${id}.`);
    seen.add(id);
  }
}

function encodeEmbeddedText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\r', '&#xd;');
}

function isTrue(value) {
  return String(value ?? '').toLowerCase() === 'true';
}

module.exports = {
  FORM_SOURCES,
  MAX_DESCRIPTOR_FIELDS,
  descriptorFieldValues,
  normalizeProcessFormConfiguration,
  processFormDefinition,
  serializeDescriptorFields,
  supportsProcessForm
};
