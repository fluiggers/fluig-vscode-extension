'use strict';

const { decodeXml, encodeXmlAttribute } = require('./xmlTokenizer');

const CONDITION_TAG = 'org.eclipse.bpmn2.impl.ConditionImpl';
const CONDITION_BLOCK_PATTERN = new RegExp(`<${CONDITION_TAG}>[\\s\\S]*?<\\/${CONDITION_TAG}>`, 'g');
const ADVANCED_RULE_TAG = 'com.totvs.tds.ecm.workflow.model.ConditionProcessAutomaticRules';
const ADVANCED_RULE_BLOCK_PATTERN = new RegExp(`<${ADVANCED_RULE_TAG}>[\\s\\S]*?<\\/${ADVANCED_RULE_TAG}>`, 'g');
const MECHANISM_CONFIGURATION_PATTERN = /<mecanismoAtribuicaoConfiguracao\b[^>]*>[\s\S]*?<\/mecanismoAtribuicaoConfiguracao>/;
const ADVANCED_OPERATORS = [
  { value: '0', label: 'Vazio' },
  { value: '1', label: 'Igual' },
  { value: '2', label: 'Diferente' },
  { value: '3', label: 'Maior' },
  { value: '4', label: 'Maior ou igual' },
  { value: '5', label: 'Menor' },
  { value: '6', label: 'Menor ou igual' },
  { value: '7', label: 'Contém' },
  { value: '8', label: 'Não contém' },
  { value: '9', label: 'Qualquer' }
];
const ADVANCED_OPERATOR_VALUES = new Set(ADVANCED_OPERATORS.map((item) => item.value));
const ADVANCED_VALUE_TYPES = [
  { value: '0', label: 'Campo do formulário' },
  { value: '1', label: 'Valor fixo' }
];
const ADVANCED_VALUE_TYPE_VALUES = new Set(ADVANCED_VALUE_TYPES.map((item) => item.value));
const STANDARD_MECHANISMS = [
  { value: '', label: 'Selecione um Mecanismo', kind: 'none' },
  { value: 'Associado', label: 'Atribuição por Associação', kind: 'associated' },
  { value: 'Campo Formulário', label: 'Atribuição por Campo de Formulário', kind: 'formField' },
  { value: 'Executor Atividade', label: 'Atribuição por Executor de Atividade', kind: 'executor' },
  { value: 'Grupo', label: 'Atribuição por Grupo', kind: 'group' },
  { value: 'Grupos Colaborador', label: 'Atribuição por Grupos do Colaborador', kind: 'colleagueGroup' },
  { value: 'Papel', label: 'Atribuição por Papel', kind: 'role' },
  { value: 'Pool Grupo', label: 'Atribuição para um Grupo', kind: 'poolGroup' },
  { value: 'Pool Papel', label: 'Atribuição para um Papel', kind: 'poolRole' },
  { value: 'Usuário', label: 'Atribuição para um Usuário', kind: 'colleague' }
];
const STANDARD_MECHANISM_VALUES = new Set(STANDARD_MECHANISMS.map((item) => item.value));

function parseGatewayConditions(value) {
  const xml = String(value ?? '').trim();
  if (!xml || xml === '<list/>') return { supported: true, conditions: [], xml: '<list/>' };
  if (!/^<list(?:\s[^>]*)?>[\s\S]*<\/list>$/.test(xml)) {
    return { supported: false, reason: 'O payload de condições não usa a lista XStream esperada.', conditions: [], xml };
  }
  const blocks = xml.match(CONDITION_BLOCK_PATTERN) ?? [];
  const remainder = xml
    .replace(/^<list(?:\s[^>]*)?>/, '')
    .replace(/<\/list>$/, '')
    .replace(CONDITION_BLOCK_PATTERN, '')
    .trim();
  if (remainder) {
    return { supported: false, reason: 'O payload possui conteúdo de condição desconhecido.', conditions: [], xml };
  }
  const conditions = blocks.map((raw, index) => {
    const conditionType = tagValue(raw, 'conditionType').trim() || '0';
    const advanced = conditionType === '1' ? parseAdvancedRules(raw) : null;
    return {
      raw,
      index,
      order: positiveInteger(tagValue(raw, 'order')) || index + 1,
      expression: decodeXml(tagValue(raw, 'expression')),
      targetTask: decodeXml(tagValue(raw, 'targetTask')).trim(),
      conditionType,
      mechanism: decodeXml(tagValue(raw, 'mechanism')).trim(),
      mechanismConfiguration: parseMechanismConfiguration(raw),
      rules: advanced?.rules ?? [],
      rulesSupported: advanced?.supported ?? conditionType === '0',
      rulesIssue: advanced?.reason ?? (conditionType === '0' ? '' : `Tipo de condição desconhecido: ${conditionType}.`)
    };
  });
  return { supported: true, conditions, xml };
}

/**
 * Monta o modelo do editor sem colapsar condições pelo destino. O formato do
 * Fluig permite várias ConditionImpl apontando para a mesma atividade.
 */
function gatewayBranchDefinitions(
  gateway,
  flows,
  businessById,
  formFields = [],
  mechanismCatalog = [],
  userCatalog = [],
  roleCatalog = []
) {
  if (gateway?.tag !== 'BpmnGateway' || !['120', '121'].includes(String(gateway.type))) return null;
  const outgoingIds = splitReferences(gateway.attributes.outgoing);
  const outgoingFlows = outgoingIds.map((id) => flows.find((flow) => flow.id === id)).filter(Boolean);
  const parsed = parseGatewayConditions(gateway.attributes.condition);
  if (!parsed.supported) return { supported: false, reason: parsed.reason, destinations: [], conditions: [] };

  const outgoingTargets = new Set(outgoingFlows.map((flow) => flow.attributes.targetRef));
  const orphan = parsed.conditions.find((condition) => !outgoingTargets.has(condition.targetTask));
  if (orphan) {
    return {
      supported: false,
      reason: `A condição de ordem ${orphan.order} aponta para ${orphan.targetTask || '(vazio)'}, que não é saída direta do gateway.`,
      destinations: [],
      conditions: []
    };
  }

  return {
    supported: true,
    reason: '',
    destinations: outgoingFlows.map((flow) => {
      const target = businessById.get(flow.attributes.targetRef);
      return {
        flowId: flow.id,
        targetId: flow.attributes.targetRef,
        targetName: target?.name || target?.typeLabel || flow.attributes.targetRef,
        defaultLink: isTrue(flow.attributes.defaultLink)
      };
    }),
    mechanisms: availableMechanisms(parsed.conditions, businessById, mechanismCatalog),
    formFields: [...formFields],
    userCatalog: [...userCatalog],
    roleCatalog: [...roleCatalog],
    advancedOperators: ADVANCED_OPERATORS.map((item) => ({ ...item })),
    advancedValueTypes: ADVANCED_VALUE_TYPES.map((item) => ({ ...item })),
    executorNodes: [...businessById.values()]
      .filter((element) => ['BpmnStartEvent', 'BpmnTask', 'BpmnSubProcess'].includes(element.tag))
      .map((element) => ({
        id: element.id,
        name: element.name || element.typeLabel || element.id
      })),
    conditions: parsed.conditions.map((condition) => ({
      sourceIndex: condition.index,
      order: condition.order,
      expression: condition.expression,
      targetId: condition.targetTask,
      conditionType: condition.conditionType,
      mechanism: condition.mechanism,
      mechanismConfiguration: condition.mechanismConfiguration,
      rules: condition.rules.map((rule) => ({ ...rule })),
      editable: condition.conditionType === '0' || (condition.conditionType === '1' && condition.rulesSupported),
      issue: condition.conditionType === '0' || condition.rulesSupported ? '' : condition.rulesIssue
    }))
  };
}

/**
 * Reconstrói a lista de ConditionImpl. sourceIndex identifica um bloco já
 * existente; sua ausência representa uma nova condição. Condições simples
 * podem ser incluídas, alteradas, removidas e podem compartilhar o destino.
 */
function buildGatewayConditionXml(currentValue, outgoingFlows, requestedConditions, gatewayId = '') {
  const parsed = parseGatewayConditions(currentValue);
  if (!parsed.supported) throw new Error(parsed.reason);
  if (!Array.isArray(requestedConditions)) throw new Error('Lista de condições inválida.');

  const outgoingTargets = new Set(outgoingFlows.map((flow) => flow.attributes.targetRef));
  for (const condition of parsed.conditions) {
    if (!outgoingTargets.has(condition.targetTask)) {
      throw new Error(`Condição de ordem ${condition.order} aponta para um destino que não é saída direta: ${condition.targetTask || '(vazio)'}.`);
    }
  }

  const output = [];
  const usedOrders = new Set();
  const usedSourceIndexes = new Set();
  for (const requested of requestedConditions) {
    const sourceIndex = optionalIndex(requested?.sourceIndex);
    const existing = sourceIndex === null ? null : parsed.conditions[sourceIndex];
    if (sourceIndex !== null && (!existing || usedSourceIndexes.has(sourceIndex))) {
      throw new Error(`Referência de condição existente inválida ou duplicada: ${sourceIndex}.`);
    }
    if (sourceIndex !== null) usedSourceIndexes.add(sourceIndex);

    const order = positiveInteger(requested?.order);
    if (!order) throw new Error('Toda condição deve possuir uma ordem positiva.');
    if (usedOrders.has(order)) throw new Error(`A ordem ${order} está repetida nas condições do gateway.`);
    usedOrders.add(order);

    const conditionType = String(requested?.conditionType ?? existing?.conditionType ?? '0').trim() || '0';
    if (!['0', '1'].includes(conditionType)) {
      if (!existing || conditionType !== existing.conditionType) throw new Error(`Tipo de condição desconhecido: ${conditionType}.`);
    }
    if (existing && conditionType !== existing.conditionType) {
      throw new Error(`Não é possível trocar o tipo da condição existente de ${existing.conditionType} para ${conditionType}.`);
    }
    const expression = conditionType === '0'
      ? String(requested?.expression ?? '').trim()
      : String(requested?.expression ?? existing?.expression ?? '');
    if (conditionType === '0' && !expression) throw new Error(`Informe a expressão da condição de ordem ${order}.`);
    const targetTask = String(requested?.targetId ?? '').trim();
    if (!outgoingTargets.has(targetTask)) {
      throw new Error(`A condição de ordem ${order} aponta para um destino que não é saída direta: ${targetTask || '(vazio)'}.`);
    }
    const mechanism = Object.hasOwn(requested ?? {}, 'mechanism')
      ? String(requested.mechanism ?? '').trim()
      : (existing?.mechanism ?? '');
    const mechanismConfiguration = requested?.mechanismConfiguration ?? null;

    if (existing && !existing.rulesSupported) {
      const unchanged = order === existing.order
        && expression === existing.expression
        && targetTask === existing.targetTask
        && mechanism === existing.mechanism
        && (mechanismConfiguration === null
          || sameMechanismConfiguration(mechanism, mechanismConfiguration, existing.mechanismConfiguration));
      if (!unchanged) throw new Error(`A condição avançada de ordem ${existing.order} possui estrutura desconhecida e é somente leitura.`);
      output.push({ order: existing.order, raw: existing.raw });
      continue;
    }

    if (conditionType === '1') {
      const unchanged = existing
        && order === existing.order
        && expression === existing.expression
        && targetTask === existing.targetTask
        && mechanism === existing.mechanism
        && sameAdvancedRuleInputs(requested?.rules, existing.rules)
        && (mechanismConfiguration === null
          || sameMechanismConfiguration(mechanism, mechanismConfiguration, existing.mechanismConfiguration));
      if (unchanged) {
        output.push({ order: existing.order, raw: existing.raw });
        continue;
      }
      const sequence = numericSuffix(gatewayId)
        || positiveInteger(existing?.rules?.[0]?.sequence);
      if (!sequence) throw new Error('Não foi possível determinar a sequência numérica do gateway para a condição avançada.');
      const requestedRules = normalizeAdvancedRules(requested?.rules, existing?.rules, sequence, order);
      let raw = serializeAdvancedCondition(order, expression, targetTask, requestedRules);
      if (mechanism) {
        const resolvedConfiguration = mechanismConfiguration ?? existing?.mechanismConfiguration;
        if (!resolvedConfiguration && (!existing || mechanism !== existing.mechanism)) {
          throw new Error(`Configure o mecanismo ${mechanism}.`);
        }
        raw = rewriteConditionMechanism(
          raw,
          mechanism,
          resolvedConfiguration ? serializeMechanismConfiguration(mechanism, resolvedConfiguration) : ''
        );
      }
      output.push({ order, raw });
      continue;
    }

    let raw = existing?.raw ?? serializeScriptCondition(order, expression, targetTask);
    if (existing) {
      raw = replaceTag(raw, 'order', String(order));
      raw = replaceTag(raw, 'expression', encodeConditionText(expression));
      raw = replaceTag(raw, 'targetTask', encodeConditionText(targetTask));
    }
    const preserveExistingMechanism = existing
      && mechanism === existing.mechanism
      && (mechanismConfiguration === null
        || sameMechanismConfiguration(mechanism, mechanismConfiguration, existing.mechanismConfiguration));
    if (!preserveExistingMechanism) {
      const configurationXml = mechanism
        ? serializeMechanismConfiguration(mechanism, mechanismConfiguration)
        : '';
      raw = rewriteConditionMechanism(raw, mechanism, configurationXml);
    }
    output.push({ order, raw });
  }

  const omittedReadOnly = parsed.conditions.find((condition) => (
    !condition.rulesSupported && !usedSourceIndexes.has(condition.index)
  ));
  if (omittedReadOnly) {
    throw new Error(`A condição avançada de ordem ${omittedReadOnly.order} possui estrutura desconhecida e não pode ser removida.`);
  }

  output.sort((left, right) => left.order - right.order);
  if (!output.length) return '<list/>';
  return `<list>\n${output.map((item) => indentBlock(item.raw, '  ')).join('\n')}\n</list>`;
}

function parseAdvancedRules(conditionBlock) {
  const ruleLists = [...String(conditionBlock).matchAll(/<rules(?:\s[^>]*)?>([\s\S]*?)<\/rules>/g)];
  const match = ruleLists[0];
  if (ruleLists.length !== 1) return { supported: false, reason: 'Condição avançada sem uma lista de regras única e reconhecida.', rules: [] };
  const body = match[1];
  const blocks = body.match(ADVANCED_RULE_BLOCK_PATTERN) ?? [];
  const remainder = body.replace(ADVANCED_RULE_BLOCK_PATTERN, '').trim();
  if (remainder || !blocks.length) {
    return { supported: false, reason: 'A lista de regras avançadas possui uma classe ou estrutura desconhecida.', rules: [] };
  }
  const allowedTags = new Set([
    ADVANCED_RULE_TAG, 'processId', 'tenantId', 'version', 'sequence', 'expressionOrder',
    'ruleOrder', 'field', 'value', 'operator', 'valueType'
  ]);
  const rules = [];
  for (const [index, raw] of blocks.entries()) {
    const tagNames = [...raw.matchAll(/<\/?([A-Za-z0-9.]+)(?:\s[^>]*)?>/g)].map((item) => item[1]);
    if (tagNames.some((name) => !allowedTags.has(name))) {
      return { supported: false, reason: `A regra avançada ${index + 1} possui campos desconhecidos.`, rules: [] };
    }
    const required = ['tenantId', 'version', 'sequence', 'expressionOrder', 'ruleOrder', 'field', 'value', 'operator', 'valueType'];
    if (required.some((name) => !hasSingleTag(raw, name))) {
      return { supported: false, reason: `A regra avançada ${index + 1} está incompleta ou possui campos repetidos.`, rules: [] };
    }
    const operator = tagValue(raw, 'operator').trim();
    const valueType = tagValue(raw, 'valueType').trim();
    const tenantId = nonNegativeInteger(tagValue(raw, 'tenantId'));
    const version = nonNegativeInteger(tagValue(raw, 'version'));
    const sequence = nonNegativeInteger(tagValue(raw, 'sequence'));
    const expressionOrder = positiveInteger(tagValue(raw, 'expressionOrder'));
    const ruleOrder = positiveInteger(tagValue(raw, 'ruleOrder'));
    if (tenantId === null || version === null || sequence === null || !expressionOrder || !ruleOrder
      || !ADVANCED_OPERATOR_VALUES.has(operator) || !ADVANCED_VALUE_TYPE_VALUES.has(valueType)) {
      return { supported: false, reason: `A regra avançada ${index + 1} usa metadados, operador ou tipo de valor desconhecido.`, rules: [] };
    }
    rules.push({
      sourceIndex: index,
      processId: decodeXml(tagValue(raw, 'processId')).trim(),
      tenantId,
      version,
      sequence,
      expressionOrder,
      ruleOrder,
      field: decodeXml(tagValue(raw, 'field')).trim(),
      value: decodeXml(tagValue(raw, 'value')),
      operator,
      valueType
    });
  }
  return { supported: true, reason: '', rules };
}

function normalizeAdvancedRules(requestedRules, existingRules, sequence, expressionOrder) {
  if (!Array.isArray(requestedRules) || !requestedRules.length) {
    throw new Error(`Adicione ao menos uma regra à condição avançada de ordem ${expressionOrder}.`);
  }
  return requestedRules.map((rule, index) => {
    const existing = optionalIndex(rule?.sourceIndex) === null
      ? null
      : existingRules?.[optionalIndex(rule?.sourceIndex)];
    const field = String(rule?.field ?? '').trim();
    const operator = String(rule?.operator ?? '').trim();
    const valueType = String(rule?.valueType ?? '').trim();
    let value = String(rule?.value ?? '');
    if (!field) throw new Error(`Informe o campo da regra ${index + 1} da condição de ordem ${expressionOrder}.`);
    if (!ADVANCED_OPERATOR_VALUES.has(operator)) {
      throw new Error(`Operador inválido na regra ${index + 1} da condição de ordem ${expressionOrder}.`);
    }
    if (!ADVANCED_VALUE_TYPE_VALUES.has(valueType)) {
      throw new Error(`Tipo de valor inválido na regra ${index + 1} da condição de ordem ${expressionOrder}.`);
    }
    if (['0', '9'].includes(operator)) value = '';
    if (!['0', '9'].includes(operator) && !value.trim()) {
      throw new Error(`Informe o valor da regra ${index + 1} da condição de ordem ${expressionOrder}.`);
    }
    return {
      sourceIndex: index,
      processId: String(rule?.processId ?? existing?.processId ?? '').trim(),
      tenantId: nonNegativeInteger(rule?.tenantId) ?? existing?.tenantId ?? 0,
      version: nonNegativeInteger(rule?.version) ?? existing?.version ?? 0,
      sequence,
      expressionOrder,
      ruleOrder: index + 1,
      field,
      value,
      operator,
      valueType
    };
  });
}

function serializeAdvancedCondition(order, expression, targetTask, rules) {
  return [
    `<${CONDITION_TAG}>`,
    `  <order>${order}</order>`,
    `  <expression>${encodeConditionText(expression)}</expression>`,
    `  <targetTask>${encodeConditionText(targetTask)}</targetTask>`,
    '  <conditionType>1</conditionType>',
    '  <rules>',
    ...rules.flatMap((rule) => serializeAdvancedRule(rule).split('\n').map((line) => `    ${line}`)),
    '  </rules>',
    `</${CONDITION_TAG}>`
  ].join('\n');
}

function serializeAdvancedRule(rule) {
  return [
    `<${ADVANCED_RULE_TAG}>`,
    ...(rule.processId ? [`  <processId>${encodeConditionText(rule.processId)}</processId>`] : []),
    `  <tenantId>${rule.tenantId}</tenantId>`,
    `  <version>${rule.version}</version>`,
    `  <sequence>${rule.sequence}</sequence>`,
    `  <expressionOrder>${rule.expressionOrder}</expressionOrder>`,
    `  <ruleOrder>${rule.ruleOrder}</ruleOrder>`,
    `  <field>${encodeConditionText(rule.field)}</field>`,
    `  <value>${encodeConditionText(rule.value)}</value>`,
    `  <operator>${rule.operator}</operator>`,
    `  <valueType>${rule.valueType}</valueType>`,
    `</${ADVANCED_RULE_TAG}>`
  ].join('\n');
}

function sameAdvancedRuleInputs(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const keys = ['field', 'value', 'operator', 'valueType'];
  return left.every((rule, index) => keys.every((key) => String(rule[key] ?? '') === String(right[index]?.[key] ?? '')));
}

function availableMechanisms(conditions, businessById, mechanismCatalog = []) {
  const customValues = new Set();
  for (const element of businessById.values()) {
    const value = String(element.attributes?.managerMechanism ?? '').trim();
    if (value && !STANDARD_MECHANISM_VALUES.has(value)) customValues.add(value);
  }
  for (const condition of conditions) {
    if (condition.mechanism && !STANDARD_MECHANISM_VALUES.has(condition.mechanism)) {
      customValues.add(condition.mechanism);
    }
  }
  const standardByValue = new Map(STANDARD_MECHANISMS.map((item) => [item.value, item]));
  const catalogByValue = new Map();
  const catalogCustom = [];
  for (const catalogItem of mechanismCatalog) {
    const value = String(catalogItem?.value ?? '').trim();
    const label = String(catalogItem?.label ?? '').trim();
    if (!value || catalogByValue.has(value)) continue;
    catalogByValue.set(value, { value, label });
    if (!standardByValue.has(value)) catalogCustom.push({ value, label });
  }
  const result = [{ ...STANDARD_MECHANISMS[0] }];
  const included = new Set(['']);
  for (const standard of STANDARD_MECHANISMS.slice(1)) {
    const catalogItem = catalogByValue.get(standard.value);
    result.push({
      ...standard,
      label: catalogItem?.label || standard.label
    });
    included.add(standard.value);
  }
  for (const catalogItem of catalogCustom) {
    result.push({
      value: catalogItem.value,
      label: catalogItem.label || catalogItem.value,
      kind: 'custom'
    });
    included.add(catalogItem.value);
  }
  for (const value of [...customValues].sort((a, b) => a.localeCompare(b))) {
    if (included.has(value)) continue;
    result.push({ value, label: value, kind: 'custom' });
    included.add(value);
  }
  return result;
}

function parseMechanismConfiguration(block) {
  const raw = String(block).match(MECHANISM_CONFIGURATION_PATTERN)?.[0] ?? '';
  if (!raw) return null;
  return parseAssignmentController(raw);
}

function parseAssignmentController(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const className = raw.match(/^<org\.eclipse\.bpmn2\.impl\.([A-Za-z0-9]+)>/)?.[1]
    ?? raw.match(/^<mecanismoAtribuicaoConfiguracao\b[^>]*\bclass="([^"]+)"/)?.[1]
    ?? raw.match(/^<engineAllocationConfiguration\b[^>]*\bclass="org\.eclipse\.bpmn2\.impl\.([^"]+)"/)?.[1]
    ?? '';
  const configuration = {
    className,
    formField: decodeXml(tagValue(raw, 'formField')).trim(),
    idNode: decodeXml(tagValue(raw, 'idNode')).trim(),
    returns: tagValue(raw, 'returns').trim(),
    groupId: decodeXml(tagValue(raw, 'groupId')).trim(),
    roleId: decodeXml(tagValue(raw, 'roleId')).trim(),
    colleagueId: decodeXml(tagValue(raw, 'colleagueId')).trim(),
    onlyWorkGroup: isTrue(tagValue(raw, 'onlyWorkGroup').trim()),
    includeCommunityGroups: isTrue(tagValue(raw, 'includeCommunityGroups').trim())
  };
  if (/AssignmentControllerAssociated$/.test(className)) {
    configuration.associationType = tagValue(raw, 'type').trim() === 'AND' ? 'AND' : 'OR';
    configuration.controllers = parseAssociatedControllers(raw);
  }
  return configuration;
}

function serializeTaskAssignmentConfiguration(mechanism, configuration) {
  const gatewayXml = serializeMechanismConfiguration(mechanism, configuration);
  const className = gatewayXml.match(/\bclass="org\.eclipse\.bpmn2\.impl\.([^"]+)"/)?.[1];
  if (!className) throw new Error(`Classe de atribuição inválida para ${mechanism}.`);
  return gatewayXml
    .replace(/^<mecanismoAtribuicaoConfiguracao\b[^>]*>/, `<org.eclipse.bpmn2.impl.${className}>`)
    .replace(/<\/mecanismoAtribuicaoConfiguracao>$/, `</org.eclipse.bpmn2.impl.${className}>`);
}

function serializeMechanismConfiguration(mechanism, configuration) {
  const config = configuration && typeof configuration === 'object' ? configuration : null;
  if (!config) throw new Error(`Configure o mecanismo ${mechanism}.`);
  let classSuffix = 'AssignmentControllerCustom';
  let fields = [];
  if (mechanism === 'Associado') {
    return serializeAssociatedConfiguration(config, mechanism);
  } else if (mechanism === 'Campo Formulário') {
    classSuffix = 'AssignmentControllerFormField';
    fields = [['formField', requiredValue(config.formField, mechanism)]];
  } else if (mechanism === 'Executor Atividade') {
    classSuffix = 'AssignmentControllerExecutorMechanism';
    fields = [
      ['idNode', requiredValue(config.idNode, mechanism)],
      ['returns', executorReturn(config.returns)]
    ];
  } else if (mechanism === 'Grupo') {
    classSuffix = 'AssignmentControllerGroup';
    fields = [['groupId', requiredValue(config.groupId, mechanism)]];
  } else if (mechanism === 'Grupos Colaborador') {
    classSuffix = 'AssignmentControllerColleagueGroup';
    fields = [
      ['colleagueId', ['1', '2'].includes(String(config.colleagueId)) ? String(config.colleagueId) : '1'],
      ['onlyWorkGroup', config.onlyWorkGroup === true ? 'true' : 'false'],
      ['includeCommunityGroups', config.includeCommunityGroups === true ? 'true' : 'false']
    ];
  } else if (mechanism === 'Papel') {
    classSuffix = 'AssignmentControllerRole';
    fields = [['roleId', requiredValue(config.roleId, mechanism)]];
  } else if (mechanism === 'Pool Grupo') {
    classSuffix = 'AssignmentControllerPoolGroup';
    fields = [['groupId', requiredValue(config.groupId, mechanism)]];
  } else if (mechanism === 'Pool Papel') {
    classSuffix = 'AssignmentControllerPoolRole';
    fields = [['roleId', requiredValue(config.roleId, mechanism)]];
  } else if (mechanism === 'Usuário') {
    classSuffix = 'AssignmentControllerColleague';
    fields = [['colleagueId', requiredValue(config.colleagueId, mechanism)]];
  }
  return [
    `<mecanismoAtribuicaoConfiguracao class="org.eclipse.bpmn2.impl.${classSuffix}">`,
    ...fields.map(([name, value]) => `  <${name}>${encodeConditionText(value)}</${name}>`),
    `  <mechanismName>${encodeConditionText(mechanism)}</mechanismName>`,
    '</mecanismoAtribuicaoConfiguracao>'
  ].join('\n');
}

function rewriteConditionMechanism(rawBlock, mechanism, configurationXml) {
  let block = String(rawBlock)
    .replace(/\r?\n[ \t]*<mechanism>[\s\S]*?<\/mechanism>/, '')
    .replace(/\r?\n[ \t]*<mecanismoAtribuicaoConfiguracao\b[^>]*>[\s\S]*?<\/mecanismoAtribuicaoConfiguracao>/, '');
  if (!mechanism) return block;
  const indentation = block.match(/\r?\n([ \t]*)<conditionType>/)?.[1] ?? '  ';
  const mechanismLine = `${indentation}<mechanism>${encodeConditionText(mechanism)}</mechanism>`;
  block = block.replace(
    /(\r?\n)([ \t]*)<conditionType>/,
    (_match, newline, conditionIndent) => `${newline}${mechanismLine}${newline}${conditionIndent}<conditionType>`
  );
  if (!configurationXml) return block;
  const indentedConfiguration = configurationXml.split('\n').map((line) => `${indentation}${line}`).join('\n');
  return block.replace(
    /(<\/conditionType>)/,
    `$1\n${indentedConfiguration}`
  );
}

function sameMechanismConfiguration(mechanism, left, right) {
  if (!left || !right) return left === right;
  const keysByMechanism = {
    'Campo Formulário': ['formField'],
    'Executor Atividade': ['idNode', 'returns'],
    Grupo: ['groupId'],
    'Grupos Colaborador': ['colleagueId', 'onlyWorkGroup', 'includeCommunityGroups'],
    Papel: ['roleId'],
    'Pool Grupo': ['groupId'],
    'Pool Papel': ['roleId'],
    Usuário: ['colleagueId']
  };
  const keys = keysByMechanism[mechanism] ?? [];
  if (mechanism === 'Associado') {
    return normalizedAssociation(left) === normalizedAssociation(right);
  }
  return keys.every((key) => String(left[key] ?? '') === String(right[key] ?? ''));
}

function parseAssociatedControllers(raw) {
  const controllers = [];
  const pattern = /<org\.eclipse\.bpmn2\.impl\.AssignmentController(Colleague|Group)>([\s\S]*?)<\/org\.eclipse\.bpmn2\.impl\.AssignmentController\1>/g;
  for (const match of String(raw).matchAll(pattern)) {
    const kind = match[1] === 'Group' ? 'group' : 'colleague';
    const value = decodeXml(tagValue(match[2], kind === 'group' ? 'groupId' : 'colleagueId')).trim();
    controllers.push({ kind, value });
  }
  return controllers;
}

function serializeAssociatedConfiguration(config, mechanism) {
  const associationType = config.associationType === 'AND' ? 'AND' : 'OR';
  const controllers = Array.isArray(config.controllers) ? config.controllers : [];
  if (!controllers.length) throw new Error(`Adicione ao menos uma associação ao mecanismo ${mechanism}.`);
  const lines = [
    '<mecanismoAtribuicaoConfiguracao class="org.eclipse.bpmn2.impl.AssignmentControllerAssociated">',
    `  <type>${associationType}</type>`,
    '  <controllers class="list">'
  ];
  for (const controller of controllers) {
    const kind = controller?.kind === 'group' ? 'group' : 'colleague';
    const value = requiredValue(controller?.value, mechanism);
    const classSuffix = kind === 'group' ? 'AssignmentControllerGroup' : 'AssignmentControllerColleague';
    const valueTag = kind === 'group' ? 'groupId' : 'colleagueId';
    const nestedMechanism = kind === 'group' ? 'Grupo' : 'Usuário';
    lines.push(
      `    <org.eclipse.bpmn2.impl.${classSuffix}>`,
      `      <${valueTag}>${encodeConditionText(value)}</${valueTag}>`,
      `      <mechanismName>${encodeConditionText(nestedMechanism)}</mechanismName>`,
      `    </org.eclipse.bpmn2.impl.${classSuffix}>`
    );
  }
  lines.push(
    '  </controllers>',
    '  <mechanismName>Associado</mechanismName>',
    '</mecanismoAtribuicaoConfiguracao>'
  );
  return lines.join('\n');
}

function normalizedAssociation(configuration) {
  const type = configuration?.associationType === 'AND' ? 'AND' : 'OR';
  const controllers = Array.isArray(configuration?.controllers)
    ? configuration.controllers.map((item) => ({
      kind: item?.kind === 'group' ? 'group' : 'colleague',
      value: String(item?.value ?? '')
    }))
    : [];
  return JSON.stringify({ type, controllers });
}

function requiredValue(value, mechanism) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`Preencha a configuração do mecanismo ${mechanism}.`);
  return normalized;
}

function executorReturn(value) {
  const normalized = String(value ?? '');
  if (!['0', '1', '2'].includes(normalized)) throw new Error('Selecione primeira, última ou todas as execuções.');
  return normalized;
}

function serializeScriptCondition(order, expression, targetTask) {
  return [
    `<${CONDITION_TAG}>`,
    `  <order>${order}</order>`,
    `  <expression>${encodeConditionText(expression)}</expression>`,
    `  <targetTask>${encodeConditionText(targetTask)}</targetTask>`,
    '  <conditionType>0</conditionType>',
    `</${CONDITION_TAG}>`
  ].join('\n');
}

function replaceTag(block, name, value) {
  const pattern = new RegExp(`(<${name}>)[\\s\\S]*?(<\\/${name}>)`);
  if (!pattern.test(block)) throw new Error(`Condição existente sem o campo ${name}.`);
  return block.replace(pattern, (_match, opening, closing) => `${opening}${value}${closing}`);
}

function tagValue(block, name) {
  return block.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`))?.[1] ?? '';
}

function hasSingleTag(block, name) {
  return [...String(block).matchAll(new RegExp(`<${name}>[\\s\\S]*?<\\/${name}>`, 'g'))].length === 1;
}

function encodeConditionText(value) {
  return encodeXmlAttribute(String(value)).replaceAll('&#xA;', '&#xA;');
}

function indentBlock(block, indentation) {
  const lines = String(block).split(/\r?\n/);
  const nestedIndents = lines.slice(1)
    .filter((line) => line.trim())
    .map((line) => line.match(/^\s*/)[0].length);
  const removable = nestedIndents.length ? Math.min(...nestedIndents) : 0;
  return lines.map((line, index) => {
    const normalized = index === 0 || !removable ? line : line.slice(Math.min(removable, line.match(/^\s*/)[0].length));
    return `${indentation}${normalized}`;
  }).join('\n');
}

function optionalIndex(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : Number.NaN;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function numericSuffix(value) {
  return positiveInteger(String(value ?? '').match(/(\d+)$/)?.[1]);
}

function splitReferences(value) {
  return String(value ?? '').trim().split(/\s+/).filter(Boolean);
}

function isTrue(value) {
  return value === 'true' || value === '1' || value === true;
}

module.exports = {
  ADVANCED_OPERATORS,
  ADVANCED_VALUE_TYPES,
  availableMechanisms,
  buildGatewayConditionXml,
  gatewayBranchDefinitions,
  parseAdvancedRules,
  parseAssignmentController,
  parseGatewayConditions,
  serializeTaskAssignmentConfiguration
};
