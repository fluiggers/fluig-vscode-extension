'use strict';

const { normalizeProcessCode } = require('./processIdentity');
const { parseProcess } = require('./processModel');
const { validateProcess } = require('./processValidator');
const { buildTranslationPlan, validateTranslationPlan } = require('./translationService');

function buildProcessScaffold(templateText, requestedCode, options = {}) {
  const code = normalizeProcessCode(requestedCode);
  const description = String(options.description ?? code).trim() || code;
  const templateModel = parseProcess(String(templateText ?? ''));
  const templateValidation = validateProcess(templateModel);
  if (!templateValidation.ok) {
    throw new Error(`O template BPMN empacotado possui ${templateValidation.errors.length} erro(s) estrutural(is).`);
  }
  const xmiRoot = templateModel.xml.children.find((node) => node.name === 'xmi:XMI');
  if (!xmiRoot || !templateModel.diagram || !templateModel.process?.node) {
    throw new Error('O template BPMN empacotado nao possui a estrutura Studio XMI esperada.');
  }

  const patches = [];
  for (const node of templateModel.diagram.children) {
    // Styles e cores permanecem como catalogo visual para que o primeiro
    // elemento criado possa reutilizar referencias Graphiti validas.
    if (node.localName === 'children' || node.localName === 'connections') {
      patches.push(wholeLineRemovalPatch(templateText, node));
    }
  }
  for (const node of xmiRoot.children) {
    if (node.name.startsWith('bpmn2:') && node.localName !== 'BpmnProcess') {
      patches.push(wholeLineRemovalPatch(templateText, node));
    }
  }

  replaceAttribute(templateModel.diagram, 'name', code, patches, true);
  removeAttribute(templateText, templateModel.diagram, 'pictogramLinks', patches);
  replaceAttribute(templateModel.process.node, 'id', code, patches, true);
  replaceAttribute(templateModel.process.node, 'name', description, patches, true);
  replaceAttribute(templateModel.process.node, 'version', '1', patches, true);
  for (const attribute of [
    'serverId', 'cardIndex', 'formSource', 'descriptorFields',
    'managerMechanism', 'managerAssignmentController', 'managerAssignmentControllerString'
  ]) {
    removeAttribute(templateText, templateModel.process.node, attribute, patches);
  }

  const text = applyPatches(templateText, deduplicatePatches(patches));
  const model = parseProcess(text);
  const validation = validateProcess(model);
  if (!validation.ok) {
    throw new Error(`O novo processo foi recusado porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }

  const translationPlan = buildTranslationPlan(model, {}, options.translationOptions ?? {});
  const translationValidation = validateTranslationPlan(translationPlan);
  if (!translationValidation.ok) {
    throw new Error(`As traducoes iniciais foram recusadas: ${translationValidation.errors.join(' ')}`);
  }
  return { code, text, model, validation, translationPlan };
}

function replaceAttribute(node, name, value, patches, required = false) {
  const attribute = node?.attributeMap?.[name];
  if (!attribute) {
    if (required) throw new Error(`Atributo obrigatorio ausente no template: ${name}.`);
    return;
  }
  patches.push({
    start: attribute.valueStart,
    end: attribute.valueEnd,
    value: encodeXmlAttribute(value)
  });
}

function removeAttribute(text, node, name, patches) {
  const attribute = node?.attributeMap?.[name];
  if (!attribute) return;
  let start = attribute.nameStart;
  while (start > node.start && /\s/.test(text[start - 1])) start -= 1;
  patches.push({ start, end: attribute.valueEnd + 1, value: '' });
}

function wholeLineRemovalPatch(text, node) {
  let start = text.lastIndexOf('\n', node.start - 1) + 1;
  if (text.slice(start, node.start).trim()) start = node.start;
  let end = node.closeEnd;
  if (text.startsWith('\r\n', end)) end += 2;
  else if (text[end] === '\n') end += 1;
  return { start, end, value: '' };
}

function deduplicatePatches(patches) {
  const unique = new Map();
  for (const patch of patches) unique.set(`${patch.start}:${patch.end}`, patch);
  return [...unique.values()];
}

function applyPatches(text, patches) {
  const ordered = [...patches].sort((left, right) => right.start - left.start || right.end - left.end);
  let output = text;
  let lastStart = text.length + 1;
  for (const patch of ordered) {
    if (patch.end > lastStart) throw new Error('Patches sobrepostos ao criar o novo processo.');
    output = output.slice(0, patch.start) + patch.value + output.slice(patch.end);
    lastStart = patch.start;
  }
  return output;
}

function encodeXmlAttribute(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

module.exports = { buildProcessScaffold };
