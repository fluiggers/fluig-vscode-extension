'use strict';

const { decodeXml, tokenizeXml } = require('./xmlTokenizer');

const FORM_MAP_NODE = 'org.eclipse.bpmn2.impl.BpmnProcessFormMap';
const FORM_MAP_FIELDS = ['processField', 'subProcessField', 'mapFlow'];
const FORM_MAP_DIRECTIONS = Object.freeze([
  { value: '2', label: 'Processo pai → subprocesso' },
  { value: '1', label: 'Processo pai ↔ subprocesso' },
  { value: '0', label: 'Subprocesso → processo pai' }
]);

function supportsSubProcessFormMaps(element) {
  return element?.tag === 'BpmnSubProcess' && String(element.type) === '100';
}

function subProcessFormMapDefinition(element, catalog = {}) {
  if (!supportsSubProcessFormMaps(element)) return null;
  const parsed = safeParseSubProcessFormMaps(element.attributes?.formMaps);
  const mappedParentFields = parsed.maps.map((map) => map.processField);
  const mappedChildFields = parsed.maps.map((map) => map.subProcessField);
  return {
    supported: parsed.supported && catalog.supported !== false,
    reason: parsed.reason || String(catalog.reason ?? ''),
    processId: String(element.attributes?.process ?? '').trim(),
    parentFields: normalizeFieldCatalog([...(catalog.parentFields ?? []), ...mappedParentFields]),
    childFields: normalizeFieldCatalog([...(catalog.childFields ?? []), ...mappedChildFields]),
    directions: FORM_MAP_DIRECTIONS.map((item) => ({ ...item })),
    maps: parsed.maps
  };
}

function safeParseSubProcessFormMaps(value) {
  try {
    return { supported: true, reason: '', maps: parseSubProcessFormMaps(value) };
  } catch (error) {
    return { supported: false, reason: error.message, maps: [] };
  }
}

function parseSubProcessFormMaps(value) {
  if (!String(value ?? '').trim()) return [];
  let document;
  try {
    document = tokenizeXml(String(value));
  } catch (error) {
    throw new Error(`Bloco formMaps invalido: ${error.message}`);
  }
  const root = document.children[0];
  if (!root || root.name !== 'list') throw new Error('Bloco formMaps invalido: raiz <list> esperada.');
  if (root.selfClosing) return [];
  const unexpected = root.children.find((node) => node.name !== FORM_MAP_NODE);
  if (unexpected) throw new Error(`Bloco formMaps contem elemento desconhecido <${unexpected.name}>.`);
  return root.children.map((node) => {
    const values = {};
    for (const field of FORM_MAP_FIELDS) {
      const child = directSimpleChild(node, field);
      values[field] = decodeXml(String(value).slice(child.openEnd, child.closeStart)).trim();
    }
    return normalizeFormMap(values);
  });
}

function normalizeSubProcessFormMaps(requested, parentFields, childFields) {
  if (!Array.isArray(requested)) throw new Error('A lista de mapeamentos de campos e invalida.');
  const parents = new Set(normalizeFieldCatalog(parentFields));
  const children = new Set(normalizeFieldCatalog(childFields));
  if (!parents.size) throw new Error('Os campos do formulario do processo pai nao estao disponiveis.');
  if (!children.size) throw new Error('Os campos do formulario do subprocesso nao estao disponiveis.');
  const maps = requested.map(normalizeFormMap);
  const usedDirections = new Map();
  for (const map of maps) {
    if (!parents.has(map.processField)) {
      throw new Error(`O campo pai "${map.processField}" nao pertence ao formulario do processo.`);
    }
    if (!children.has(map.subProcessField)) {
      throw new Error(`O campo filho "${map.subProcessField}" nao pertence ao formulario do subprocesso.`);
    }
    const coverage = map.mapFlow === '1' ? ['in', 'out'] : map.mapFlow === '2' ? ['out'] : ['in'];
    const used = usedDirections.get(map.processField) ?? new Set();
    if (coverage.some((direction) => used.has(direction))) {
      throw new Error(`O campo pai "${map.processField}" possui mais de um mapeamento na mesma direcao.`);
    }
    coverage.forEach((direction) => used.add(direction));
    usedDirections.set(map.processField, used);
  }
  return maps;
}

function serializeSubProcessFormMaps(maps) {
  if (!maps.length) return '<list/>';
  const lines = ['<list>'];
  for (const map of maps) {
    lines.push(
      `  <${FORM_MAP_NODE}>`,
      `    <processField>${encodeEmbeddedText(map.processField)}</processField>`,
      `    <subProcessField>${encodeEmbeddedText(map.subProcessField)}</subProcessField>`,
      `    <mapFlow>${map.mapFlow}</mapFlow>`,
      `  </${FORM_MAP_NODE}>`
    );
  }
  lines.push('</list>');
  return lines.join('\n');
}

function normalizeFormMap(value) {
  const processField = normalizedField(value?.processField, 'campo do processo pai');
  const subProcessField = normalizedField(value?.subProcessField, 'campo do subprocesso');
  const mapFlow = String(value?.mapFlow ?? '').trim();
  if (!FORM_MAP_DIRECTIONS.some((item) => item.value === mapFlow)) {
    throw new Error(`Direcao de mapeamento invalida: ${mapFlow || '(vazia)'}.`);
  }
  return { processField, subProcessField, mapFlow };
}

function normalizedField(value, label) {
  const field = String(value ?? '').trim();
  if (!field || field.length > 300 || /[<>&\r\n\u0000-\u001f]/.test(field)) {
    throw new Error(`Valor invalido para ${label}.`);
  }
  return field;
}

function normalizeFieldCatalog(fields) {
  return [...new Set((fields ?? []).map((field) => String(field ?? '').trim()).filter(Boolean))];
}

function directSimpleChild(node, name) {
  const unexpected = node.children.find((child) => !FORM_MAP_FIELDS.includes(child.name));
  if (unexpected) throw new Error(`Mapeamento contem campo desconhecido <${unexpected.name}>.`);
  const matches = node.children.filter((child) => child.name === name);
  if (matches.length !== 1 || matches[0].selfClosing || matches[0].children.length) {
    throw new Error(`Bloco formMaps sem o campo simples <${name}> esperado.`);
  }
  return matches[0];
}

function encodeEmbeddedText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\r', '&#xd;');
}

module.exports = {
  FORM_MAP_DIRECTIONS,
  normalizeSubProcessFormMaps,
  parseSubProcessFormMaps,
  safeParseSubProcessFormMaps,
  serializeSubProcessFormMaps,
  subProcessFormMapDefinition,
  supportsSubProcessFormMaps
};
