'use strict';

const { decodeXml, tokenizeXml } = require('./xmlTokenizer');

const SUPPORTED_TASK_TYPES = new Set(['80']);
const RULE_NODE = 'org.eclipse.bpmn2.documentacional.BpmnProcessAttachmentRules';
const RULE_FIELDS = ['id', 'message', 'operator', 'amount', 'name'];
const OPERATOR_OPTIONS = Object.freeze([
  { value: '0', label: 'Nenhum' },
  { value: '1', label: 'Igual' },
  { value: '2', label: 'Maior' },
  { value: '3', label: 'Maior ou igual' },
  { value: '4', label: 'Menor' },
  { value: '5', label: 'Menor ou igual' },
  { value: '6', label: 'Qualquer' }
]);

function supportsTaskAttachmentRules(element) {
  return element?.tag === 'BpmnTask' && SUPPORTED_TASK_TYPES.has(String(element.type));
}

function taskAttachmentRulesDefinition(element, formFields = []) {
  if (!supportsTaskAttachmentRules(element)) return null;
  return {
    rules: attachmentRuleValues(element.attributes?.attachmentRules),
    operatorOptions: OPERATOR_OPTIONS.map((option) => ({ ...option })),
    formFields: [...formFields]
  };
}

function attachmentRuleValues(attachmentRules) {
  if (!attachmentRules) return [];
  let document;
  try {
    document = tokenizeXml(attachmentRules);
  } catch (error) {
    throw new Error(`Bloco attachmentRules inválido: ${error.message}`);
  }
  const root = document.children[0];
  if (!root || root.name !== 'list') throw new Error('Bloco attachmentRules inválido: raiz <list> esperada.');
  const unexpected = root.children.filter((node) => node.name !== RULE_NODE);
  if (unexpected.length) throw new Error(`Bloco attachmentRules contém elemento desconhecido <${unexpected[0].name}>.`);
  return root.children.map((node, index) => {
    const values = {};
    for (const field of RULE_FIELDS) {
      const child = directSimpleChild(node, field);
      values[field] = decodeXml(attachmentRules.slice(child.openEnd, child.closeStart));
    }
    // Fluig Studio does not keep ids in sequence (e.g. saves 0); serialization renumbers them.
    if (!/^\d+$/.test(values.id)) {
      throw new Error(`Bloco attachmentRules possui id inválido na regra ${index + 1}.`);
    }
    if (!OPERATOR_OPTIONS.some((option) => option.value === values.operator)) {
      throw new Error(`Bloco attachmentRules possui operador desconhecido ${values.operator}.`);
    }
    return {
      operator: values.operator,
      amount: normalizedStoredAmount(values.amount, index),
      name: values.name,
      message: values.message
    };
  });
}

function normalizeAttachmentRules(requestedRules) {
  if (!Array.isArray(requestedRules)) throw new Error('A lista de regras de anexo é inválida.');
  if (requestedRules.length > 200) throw new Error('A lista excede o limite de 200 regras de anexo.');
  return requestedRules.map((rule, index) => {
    const operator = String(rule?.operator ?? '0');
    if (!OPERATOR_OPTIONS.some((option) => option.value === operator)) {
      throw new Error(`Operador inválido na regra ${index + 1}.`);
    }
    const amount = ['0', '6'].includes(operator) ? 0 : normalizedInputAmount(rule?.amount, index);
    return {
      operator,
      amount,
      name: normalizedText(rule?.name),
      message: normalizedText(rule?.message)
    };
  });
}

function serializeAttachmentRules(rules) {
  const lines = ['<list>'];
  rules.forEach((rule, index) => {
    lines.push(
      `  <${RULE_NODE}>`,
      `    <id>${index + 1}</id>`,
      `    <message>${encodeEmbeddedText(rule.message)}</message>`,
      `    <operator>${rule.operator}</operator>`,
      `    <amount>${rule.amount}</amount>`,
      `    <name>${encodeEmbeddedText(rule.name)}</name>`,
      `  </${RULE_NODE}>`
    );
  });
  lines.push('</list>');
  return lines.join('\n');
}

function directSimpleChild(node, name) {
  const matches = node.children.filter((child) => child.name === name);
  if (matches.length !== 1 || matches[0].selfClosing || matches[0].children.length) {
    throw new Error(`Bloco attachmentRules sem o campo simples <${name}> esperado.`);
  }
  const unexpected = node.children.filter((child) => !RULE_FIELDS.includes(child.name));
  if (unexpected.length) throw new Error(`Regra de anexo contém campo desconhecido <${unexpected[0].name}>.`);
  return matches[0];
}

function normalizedStoredAmount(value, index) {
  if (!/^\d+$/.test(String(value))) throw new Error(`Quantidade inválida na regra ${index + 1}.`);
  return Number(value);
}

function normalizedInputAmount(value, index) {
  const normalized = String(value ?? '').trim();
  if (!/^\d+$/.test(normalized)) throw new Error(`Quantidade inválida na regra ${index + 1}.`);
  const amount = Number(normalized);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(`Quantidade inválida na regra ${index + 1}.`);
  return amount;
}

function normalizedText(value) {
  return String(value ?? '').replace(/\r\n|\r|\n/g, '\n');
}

function encodeEmbeddedText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\r', '&#xd;');
}

module.exports = {
  OPERATOR_OPTIONS,
  attachmentRuleValues,
  normalizeAttachmentRules,
  serializeAttachmentRules,
  supportsTaskAttachmentRules,
  taskAttachmentRulesDefinition
};
