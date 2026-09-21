'use strict';

const { decodeXml, tokenizeXml } = require('./xmlTokenizer');

const PROPERTY_NODE = 'org.eclipse.bpmn2.impl.ExtendedPropertyImpl';
const PROPERTY_FIELDS = [
  'propertyName',
  'propertyType',
  'propertyDescription',
  'propertyValue',
  'isDefaultProperty'
];
const UNSUPPORTED_TAGS = new Set(['BpmnProcess', 'BpmnPool', 'BpmnSwimLane', 'BpmnGroup']);
const EXTENDED_PROPERTY_TYPES = Object.freeze([
  { value: '0', label: 'Campo' },
  { value: '1', label: 'Texto' },
  { value: '2', label: 'Número' },
  { value: '3', label: 'Data' },
  { value: '4', label: 'CheckBox' }
]);

function supportsExtendedProperties(element) {
  return Boolean(element?.node) && !UNSUPPORTED_TAGS.has(String(element.tag ?? ''));
}

function extendedPropertiesDefinition(element) {
  if (!supportsExtendedProperties(element)) return null;
  return {
    properties: extendedPropertyValues(element.attributes?.extendedFields),
    typeOptions: EXTENDED_PROPERTY_TYPES.map((type) => ({ ...type }))
  };
}

function extendedPropertyValues(extendedFields) {
  if (!extendedFields) return [];
  let document;
  try {
    document = tokenizeXml(extendedFields);
  } catch (error) {
    throw new Error(`Bloco extendedFields inválido: ${error.message}`);
  }
  const root = document.children[0];
  if (!root || root.name !== 'list') throw new Error('Bloco extendedFields inválido: raiz <list> esperada.');
  if (root.selfClosing) return [];
  const unexpected = root.children.filter((node) => node.name !== PROPERTY_NODE);
  if (unexpected.length) throw new Error(`Bloco extendedFields contém elemento desconhecido <${unexpected[0].name}>.`);
  const properties = root.children.map((node, index) => {
    const values = {};
    for (const field of PROPERTY_FIELDS) {
      const child = directSimpleChild(node, field);
      values[field] = decodeXml(extendedFields.slice(child.openEnd, child.closeStart));
    }
    if (!EXTENDED_PROPERTY_TYPES.some((type) => type.value === values.propertyType)) {
      throw new Error(`Atributo de extensão ${index + 1} possui tipo desconhecido ${values.propertyType}.`);
    }
    if (values.isDefaultProperty !== 'false') {
      throw new Error(`Atributo de extensão ${index + 1} é uma propriedade padrão não editável.`);
    }
    if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(values.propertyName) || values.propertyName.length > 200) {
      throw new Error(`Nome(id) inválido no atributo ${index + 1}.`);
    }
    if (!values.propertyDescription.trim() || values.propertyDescription.length > 500) {
      throw new Error(`Label inválido no atributo ${index + 1}.`);
    }
    if (values.propertyType === '4' && !['', 'true'].includes(values.propertyValue)) {
      throw new Error(`Atributo CheckBox ${index + 1} possui valor inválido.`);
    }
    if (values.propertyType === '2' && values.propertyValue && !/^-?\d+(?:\.\d+)?$/.test(values.propertyValue)) {
      throw new Error(`Valor numérico inválido no atributo ${index + 1}.`);
    }
    if (values.propertyType === '3' && values.propertyValue && !isValidDate(values.propertyValue)) {
      throw new Error(`Data inválida no atributo ${index + 1}. Use DD/MM/AAAA.`);
    }
    return {
      name: values.propertyName,
      type: values.propertyType,
      label: values.propertyDescription,
      value: values.propertyType === '4' ? values.propertyValue === 'true' : normalizeLineEndings(values.propertyValue)
    };
  });
  assertUniqueNames(properties);
  return properties;
}

function normalizeExtendedProperties(requestedProperties) {
  if (!Array.isArray(requestedProperties)) throw new Error('A lista de atributos de extensão é inválida.');
  if (requestedProperties.length > 200) throw new Error('A lista excede o limite de 200 atributos de extensão.');
  const properties = requestedProperties.map((property, index) => {
    const name = String(property?.name ?? '').trim();
    const label = String(property?.label ?? '').trim();
    const type = String(property?.type ?? '0');
    if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(name) || name.length > 200) {
      throw new Error(`Nome(id) inválido no atributo ${index + 1}.`);
    }
    if (!label || label.length > 500) throw new Error(`Label inválido no atributo ${index + 1}.`);
    if (!EXTENDED_PROPERTY_TYPES.some((option) => option.value === type)) {
      throw new Error(`Tipo inválido no atributo ${index + 1}.`);
    }
    let value = type === '4'
      ? property?.value === true || property?.value === 'true'
      : normalizeLineEndings(property?.value);
    if (type === '2' && value && !/^-?\d+(?:\.\d+)?$/.test(value)) {
      throw new Error(`Valor numérico inválido no atributo ${index + 1}.`);
    }
    if (type === '3' && value && !isValidDate(value)) {
      throw new Error(`Data inválida no atributo ${index + 1}. Use DD/MM/AAAA.`);
    }
    if (type !== '4' && value.length > 20000) throw new Error(`Valor muito longo no atributo ${index + 1}.`);
    return { name, type, label, value };
  });
  assertUniqueNames(properties);
  return properties;
}

function serializeExtendedProperties(properties) {
  if (!properties.length) return '<list/>';
  const lines = ['<list>'];
  for (const property of properties) {
    lines.push(
      `  <${PROPERTY_NODE}>`,
      `    <propertyName>${encodeEmbeddedText(property.name)}</propertyName>`,
      `    <propertyType>${property.type}</propertyType>`,
      `    <propertyDescription>${encodeEmbeddedText(property.label)}</propertyDescription>`,
      `    <propertyValue>${encodeEmbeddedText(property.type === '4' ? (property.value ? 'true' : '') : property.value)}</propertyValue>`,
      '    <isDefaultProperty>false</isDefaultProperty>',
      `  </${PROPERTY_NODE}>`
    );
  }
  lines.push('</list>');
  return lines.join('\n');
}

function directSimpleChild(node, name) {
  const matches = node.children.filter((child) => child.name === name);
  if (matches.length !== 1 || matches[0].selfClosing || matches[0].children.length) {
    throw new Error(`Bloco extendedFields sem o campo simples <${name}> esperado.`);
  }
  const unexpected = node.children.filter((child) => !PROPERTY_FIELDS.includes(child.name));
  if (unexpected.length) throw new Error(`Atributo de extensão contém campo desconhecido <${unexpected[0].name}>.`);
  return matches[0];
}

function assertUniqueNames(properties) {
  const names = new Set();
  for (const property of properties) {
    if (names.has(property.name)) throw new Error(`Nome(id) duplicado: ${property.name}.`);
    names.add(property.name);
  }
}

function normalizeLineEndings(value) {
  return String(value ?? '').replace(/\r\n|\r|\n/g, '\r\n');
}

function isValidDate(value) {
  const match = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return false;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function encodeEmbeddedText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\r', '&#xd;');
}

module.exports = {
  EXTENDED_PROPERTY_TYPES,
  extendedPropertiesDefinition,
  extendedPropertyValues,
  normalizeExtendedProperties,
  serializeExtendedProperties,
  supportsExtendedProperties
};
