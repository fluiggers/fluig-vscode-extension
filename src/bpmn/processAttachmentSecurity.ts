'use strict';

const { decodeXml, tokenizeXml } = require('./xmlTokenizer');
const {
  availableMechanisms,
  parseAssignmentController,
  serializeTaskAssignmentConfiguration
} = require('./gatewayConditions');

const SECURITY_NODE = 'org.eclipse.bpmn2.ECMProcessAttachmentSecurityImpl';
const SECURITY_FIELDS = new Set([
  'companyId',
  'processId',
  'version',
  'sequence',
  'engineAllocationId',
  'engineAllocationConfiguration',
  'accessLevel',
  'editionMode'
]);
const PERMISSIONS = Object.freeze([
  { key: 'publish', code: 'P', label: 'Publicar anexos' },
  { key: 'readOthers', code: 'R', label: 'Ver anexos de outros usuários' },
  { key: 'editOwn', code: 'M', label: 'Editar anexos próprios' },
  { key: 'editOthers', code: 'O', label: 'Editar anexos de outros usuários' },
  { key: 'removeOwn', code: 'E', label: 'Eliminar anexos próprios' },
  { key: 'removeOthers', code: 'D', label: 'Eliminar anexos de outros usuários' }
]);

function supportsProcessAttachmentSecurity(element) {
  return element?.tag === 'BpmnProcess';
}

function processAttachmentSecurityDefinition(
  element,
  businessById,
  formFields = [],
  mechanismCatalog = [],
  userCatalog = [],
  roleCatalog = []
) {
  if (!supportsProcessAttachmentSecurity(element)) return null;
  const rules = parseProcessAttachmentSecurity(element.attributes?.processAttachmentSecurity);
  return {
    supported: true,
    controlled: isTrue(element.attributes?.controlsAttachmentsSecurity),
    mechanisms: availableMechanisms(rules, businessById, mechanismCatalog),
    formFields: [...formFields],
    userCatalog: [...userCatalog],
    roleCatalog: [...roleCatalog],
    executorNodes: [...businessById.values()]
      .filter((item) => ['BpmnStartEvent', 'BpmnTask', 'BpmnSubProcess'].includes(item.tag))
      .map((item) => ({ id: item.id, name: item.name || item.typeLabel || item.id })),
    permissions: PERMISSIONS.map((permission) => ({ ...permission })),
    rules
  };
}

function parseProcessAttachmentSecurity(value) {
  const xml = String(value ?? '').trim();
  if (!xml || xml === '<list/>') return [];
  let document;
  try {
    document = tokenizeXml(xml);
  } catch (error) {
    throw new Error(`Bloco processAttachmentSecurity inválido: ${error.message}`);
  }
  const root = document.children[0];
  if (!root || root.name !== 'list' || root.selfClosing) {
    throw new Error('Bloco processAttachmentSecurity inválido: raiz <list> esperada.');
  }
  const unexpected = root.children.find((node) => node.name !== SECURITY_NODE);
  if (unexpected) {
    throw new Error(`Bloco processAttachmentSecurity contém elemento desconhecido <${unexpected.name}>.`);
  }
  return root.children.map((node, index) => parseSecurityRule(xml, node, index));
}

function parseSecurityRule(xml, node, index) {
  const unknown = node.children.find((child) => !SECURITY_FIELDS.has(child.name));
  if (unknown) throw new Error(`Regra de segurança contém campo desconhecido <${unknown.name}>.`);
  const mechanism = childText(xml, node, 'engineAllocationId').trim();
  const accessLevel = childText(xml, node, 'accessLevel').trim();
  const configurationNode = directChild(node, 'engineAllocationConfiguration', false);
  const configurationXml = configurationNode
    ? xml.slice(configurationNode.start, configurationNode.closeEnd)
    : '';
  return {
    sourceIndex: index,
    companyId: positiveInteger(childText(xml, node, 'companyId')) || 1,
    // Fluig Studio omits processId; it is filled from the process when the rules are saved.
    processId: directChild(node, 'processId', false) ? childText(xml, node, 'processId').trim() : '',
    version: positiveInteger(childText(xml, node, 'version')) || 1,
    sequence: positiveInteger(childText(xml, node, 'sequence')) || index + 1,
    mechanism,
    mechanismConfiguration: parseAssignmentController(configurationXml),
    permissions: Object.fromEntries(PERMISSIONS.map((permission) => [
      permission.key,
      accessLevel.includes(permission.code)
    ])),
    editionMode: isTrue(childText(xml, node, 'editionMode'))
  };
}

function normalizeProcessAttachmentSecurity(configuration, process) {
  const controlled = configuration?.controlled === true;
  const requestedRules = configuration?.rules;
  if (!Array.isArray(requestedRules)) throw new Error('A lista de segurança de anexos é inválida.');
  if (requestedRules.length > 500) throw new Error('A lista de segurança de anexos excede o limite defensivo de 500 regras.');
  const rules = requestedRules.map((rule, index) => {
    const mechanism = String(rule?.mechanism ?? '').trim();
    if (!mechanism) throw new Error(`Selecione o mecanismo da regra ${index + 1}.`);
    return {
      companyId: positiveInteger(rule?.companyId) || 1,
      processId: String(process?.id ?? '').trim(),
      version: positiveInteger(process?.attributes?.version) || 1,
      sequence: index + 1,
      mechanism,
      mechanismConfiguration: rule?.mechanismConfiguration ?? null,
      permissions: Object.fromEntries(PERMISSIONS.map((permission) => [
        permission.key,
        rule?.permissions?.[permission.key] === true
      ])),
      editionMode: true
    };
  });
  return { controlled, rules: controlled ? rules : [] };
}

function serializeProcessAttachmentSecurity(rules) {
  if (!rules.length) return '<list/>';
  const lines = ['<list>'];
  for (const rule of rules) {
    const controller = serializeSecurityController(rule.mechanism, rule.mechanismConfiguration);
    const accessLevel = PERMISSIONS
      .filter((permission) => rule.permissions[permission.key])
      .map((permission) => permission.code)
      .join('');
    lines.push(
      `  <${SECURITY_NODE}>`,
      `    <companyId>${rule.companyId}</companyId>`,
      `    <processId>${encodeEmbeddedText(rule.processId)}</processId>`,
      `    <version>${rule.version}</version>`,
      `    <sequence>${rule.sequence}</sequence>`,
      `    <engineAllocationId>${encodeEmbeddedText(rule.mechanism)}</engineAllocationId>`,
      ...controller.split('\n').map((line) => `    ${line}`),
      `    <accessLevel>${accessLevel}</accessLevel>`,
      '    <editionMode>true</editionMode>',
      `  </${SECURITY_NODE}>`
    );
  }
  lines.push('</list>');
  return lines.join('\n');
}

function serializeSecurityController(mechanism, configuration) {
  const controller = serializeTaskAssignmentConfiguration(mechanism, configuration);
  const className = controller.match(/^<org\.eclipse\.bpmn2\.impl\.([A-Za-z0-9]+)>/)?.[1];
  if (!className) throw new Error(`Configuração inválida para o mecanismo ${mechanism}.`);
  return decodeNonAsciiNumericEntities(controller
    .replace(
      /^<org\.eclipse\.bpmn2\.impl\.[A-Za-z0-9]+>/,
      `<engineAllocationConfiguration class="org.eclipse.bpmn2.impl.${className}">`
    )
    .replace(
      /<\/org\.eclipse\.bpmn2\.impl\.[A-Za-z0-9]+>$/,
      '</engineAllocationConfiguration>'
    ));
}

function decodeNonAsciiNumericEntities(value) {
  return String(value).replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (entity, hexadecimal, decimal) => {
    const codePoint = Number.parseInt(hexadecimal ?? decimal, hexadecimal ? 16 : 10);
    return Number.isInteger(codePoint) && codePoint > 127
      ? String.fromCodePoint(codePoint)
      : entity;
  });
}

function directChild(node, name, required = true) {
  const matches = node.children.filter((child) => child.name === name);
  if (matches.length > 1 || (required && matches.length !== 1)) {
    throw new Error(`Regra de segurança sem o campo <${name}> esperado.`);
  }
  return matches[0] ?? null;
}

function childText(xml, node, name) {
  const child = directChild(node, name);
  if (child.selfClosing || child.children.length) {
    throw new Error(`O campo <${name}> da regra de segurança não é simples.`);
  }
  return decodeXml(xml.slice(child.openEnd, child.closeStart));
}

function encodeEmbeddedText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\r', '&#xd;');
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function isTrue(value) {
  return value === true || value === 'true' || value === '1';
}

module.exports = {
  PERMISSIONS,
  normalizeProcessAttachmentSecurity,
  parseProcessAttachmentSecurity,
  processAttachmentSecurityDefinition,
  serializeProcessAttachmentSecurity,
  supportsProcessAttachmentSecurity
};
