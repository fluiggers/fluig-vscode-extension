'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { patchGatewayBranches } = require('../../src/bpmn/processPatcher');
const { gatewayBranchDefinitions, parseGatewayConditions } = require('../../src/bpmn/gatewayConditions');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);

function gatewayEditor(model, gatewayId, mechanismCatalog = []) {
  const gateway = model.elements.find((item) => item.id === gatewayId);
  const byId = new Map([...model.elements, ...model.flows].map((item) => [item.id, item]));
  return gatewayBranchDefinitions(gateway, model.flows, byId, [], mechanismCatalog);
}

function currentConfiguration(editor) {
  return {
    defaultFlowId: editor.destinations.find((destination) => destination.defaultLink)?.flowId ?? '',
    conditions: editor.conditions.map((condition) => ({
      sourceIndex: condition.sourceIndex,
      order: condition.order,
      expression: condition.expression,
      targetId: condition.targetId,
      conditionType: condition.conditionType,
      rules: condition.rules,
      mechanism: condition.mechanism,
      mechanismConfiguration: condition.mechanismConfiguration
    }))
  };
}

test('expõe destinos e condições como listas independentes sem colapsar pelo destino', () => {
  const model = parseProcess(fixture);
  const editor = gatewayEditor(model, 'exclusivegateway39');
  assert.equal(editor.supported, true);
  assert.deepEqual(editor.destinations.map((destination) => destination.flowId), ['flow48', 'flow49']);
  assert.equal(editor.conditions.length, 2);
  assert.equal(editor.conditions[1].expression, 'hAPI.getCardValue("campox") != "A"');
  assert.equal(editor.conditions[1].mechanism, 'Executor Atividade');
  assert.equal(editor.destinations[1].defaultLink, true);
  assert.equal(patchGatewayBranches(fixture, 'exclusivegateway39', currentConfiguration(editor)).changed, false);
});

test('aceita várias condições para a mesma atividade destino e preserva mecanismos XStream', () => {
  const editor = gatewayEditor(parseProcess(fixture), 'exclusivegateway39');
  const configuration = currentConfiguration(editor);
  configuration.conditions.push({
    sourceIndex: '',
    order: 3,
    expression: 'hAPI.getCardValue("tipo") == "URGENTE"',
    targetId: 'enderror17'
  });
  const result = patchGatewayBranches(fixture, 'exclusivegateway39', configuration);
  const gateway = result.model.elements.find((item) => item.id === 'exclusivegateway39');
  const parsed = parseGatewayConditions(gateway.attributes.condition);

  assert.equal(result.validation.ok, true);
  assert.equal(parsed.conditions.length, 3);
  assert.equal(parsed.conditions.filter((condition) => condition.targetTask === 'enderror17').length, 2);
  assert.equal(parsed.conditions[2].expression, 'hAPI.getCardValue("tipo") == "URGENTE"');
  assert.match(gateway.attributes.condition, /<mecanismoAtribuicaoConfiguracao\b/);
});

test('edita destino e expressão, remove uma condição e troca o fluxo padrão', () => {
  const editor = gatewayEditor(parseProcess(fixture), 'exclusivegateway39');
  const configuration = currentConfiguration(editor);
  configuration.defaultFlowId = 'flow48';
  configuration.conditions = [{
    sourceIndex: editor.conditions[0].sourceIndex,
    order: 1,
    expression: 'Number(hAPI.getCardValue("valor")) < 10',
    targetId: 'enderror17'
  }];
  const result = patchGatewayBranches(fixture, 'exclusivegateway39', configuration);
  const gateway = result.model.elements.find((item) => item.id === 'exclusivegateway39');
  const parsed = parseGatewayConditions(gateway.attributes.condition);

  assert.equal(parsed.conditions.length, 1);
  assert.equal(parsed.conditions[0].targetTask, 'enderror17');
  assert.equal(parsed.conditions[0].expression, 'Number(hAPI.getCardValue("valor")) < 10');
  assert.equal(result.model.flows.find((item) => item.id === 'flow48').attributes.defaultLink, 'true');
  assert.equal(result.model.flows.find((item) => item.id === 'flow49').attributes.defaultLink, undefined);
  assert.equal(result.text.replaceAll('\r\n', '').includes('\n'), false);
});

test('adiciona e remove todas as condições sem alterar a tripla dos fluxos', () => {
  const added = patchGatewayBranches(fixture, 'exclusivegateway59', {
    defaultFlowId: '',
    conditions: [
      { sourceIndex: '', order: 1, expression: 'a == 1', targetId: 'intermediateevent61' },
      { sourceIndex: '', order: 2, expression: 'b == 2', targetId: 'intermediateevent61' }
    ]
  });
  let gateway = added.model.elements.find((item) => item.id === 'exclusivegateway59');
  assert.equal(parseGatewayConditions(gateway.attributes.condition).conditions.length, 2);
  assert.equal(added.model.flows.find((item) => item.id === 'flow62').attributes.sourceRef, 'exclusivegateway59');

  const removed = patchGatewayBranches(added.text, 'exclusivegateway59', {
    defaultFlowId: '',
    conditions: []
  });
  gateway = removed.model.elements.find((item) => item.id === 'exclusivegateway59');
  assert.equal(gateway.attributes.condition, '<list/>');
  assert.equal(removed.validation.ok, true);
});

test('grava e troca mecanismos de atribuição da condição com a estrutura do Eclipse', () => {
  const group = patchGatewayBranches(fixture, 'exclusivegateway59', {
    defaultFlowId: '',
    conditions: [{
      sourceIndex: '',
      order: 1,
      expression: 'true',
      targetId: 'intermediateevent61',
      mechanism: 'Grupo',
      mechanismConfiguration: { groupId: 'TODOS' }
    }]
  });
  let gateway = group.model.elements.find((item) => item.id === 'exclusivegateway59');
  let parsed = parseGatewayConditions(gateway.attributes.condition).conditions[0];
  assert.equal(parsed.mechanism, 'Grupo');
  assert.equal(parsed.mechanismConfiguration.groupId, 'TODOS');
  assert.match(parsed.raw, /AssignmentControllerGroup/);
  assert.match(parsed.raw, /<mechanismName>Grupo<\/mechanismName>/);

  const executor = patchGatewayBranches(group.text, 'exclusivegateway59', {
    defaultFlowId: '',
    conditions: [{
      sourceIndex: 0,
      order: 1,
      expression: 'true',
      targetId: 'intermediateevent61',
      mechanism: 'Executor Atividade',
      mechanismConfiguration: { idNode: 'task5', returns: '2' }
    }]
  });
  gateway = executor.model.elements.find((item) => item.id === 'exclusivegateway59');
  parsed = parseGatewayConditions(gateway.attributes.condition).conditions[0];
  assert.equal(parsed.mechanismConfiguration.idNode, 'task5');
  assert.equal(parsed.mechanismConfiguration.returns, '2');
  assert.match(parsed.raw, /AssignmentControllerExecutorMechanism/);
  assert.doesNotMatch(parsed.raw, /AssignmentControllerGroup>/);

  const withoutMechanism = patchGatewayBranches(executor.text, 'exclusivegateway59', {
    defaultFlowId: '',
    conditions: [{
      sourceIndex: 0,
      order: 1,
      expression: 'true',
      targetId: 'intermediateevent61',
      mechanism: '',
      mechanismConfiguration: null
    }]
  });
  gateway = withoutMechanism.model.elements.find((item) => item.id === 'exclusivegateway59');
  parsed = parseGatewayConditions(gateway.attributes.condition).conditions[0];
  assert.equal(parsed.mechanism, '');
  assert.equal(parsed.mechanismConfiguration, null);
});

test('recusa mecanismo padrão novo sem configuração obrigatória', () => {
  assert.throws(
    () => patchGatewayBranches(fixture, 'exclusivegateway59', {
      defaultFlowId: '',
      conditions: [{
        sourceIndex: '', order: 1, expression: 'true', targetId: 'intermediateevent61',
        mechanism: 'Campo Formulário', mechanismConfiguration: null
      }]
    }),
    /Configure o mecanismo/
  );
});

test('serializa os mecanismos padrão e mecanismo customizado com as classes canônicas', () => {
  const cases = [
    ['Campo Formulário', { formField: 'campox' }, 'AssignmentControllerFormField'],
    ['Executor Atividade', { idNode: 'task5', returns: '0' }, 'AssignmentControllerExecutorMechanism'],
    ['Grupo', { groupId: 'TODOS' }, 'AssignmentControllerGroup'],
    ['Grupos Colaborador', { colleagueId: '2', onlyWorkGroup: true, includeCommunityGroups: false }, 'AssignmentControllerColleagueGroup'],
    ['Papel', { roleId: 'admin' }, 'AssignmentControllerRole'],
    ['Pool Grupo', { groupId: 'TODOS' }, 'AssignmentControllerPoolGroup'],
    ['Pool Papel', { roleId: 'admin' }, 'AssignmentControllerPoolRole'],
    ['Usuário', { colleagueId: 'daniel.sales' }, 'AssignmentControllerColleague'],
    ['Associado', {
      associationType: 'AND',
      controllers: [
        { kind: 'colleague', value: 'daniel.sales' },
        { kind: 'group', value: 'TODOS' }
      ]
    }, 'AssignmentControllerAssociated'],
    ['mecBuscaAprovadorTP', {}, 'AssignmentControllerCustom']
  ];
  for (const [mechanism, mechanismConfiguration, className] of cases) {
    const result = patchGatewayBranches(fixture, 'exclusivegateway59', {
      defaultFlowId: '',
      conditions: [{
        sourceIndex: '', order: 1, expression: 'true', targetId: 'intermediateevent61',
        mechanism, mechanismConfiguration
      }]
    });
    const gateway = result.model.elements.find((item) => item.id === 'exclusivegateway59');
    const condition = parseGatewayConditions(gateway.attributes.condition).conditions[0];
    assert.equal(condition.mechanism, mechanism);
    assert.match(condition.raw, new RegExp(`org\\.eclipse\\.bpmn2\\.impl\\.${className}`));
  }
});

test('lista catálogo do Eclipse junto aos mecanismos padrão e sem opção customizada genérica', () => {
  const editor = gatewayEditor(parseProcess(fixture), 'exclusivegateway39', [
    { label: 'Atribuição por Associação', value: 'Associado' },
    { label: 'Atribuição por Grupo HelpDesk', value: 'atrib_tratar_chamado' },
    { label: 'Atribuição por Campo de Formulário', value: 'Campo Formulário' }
  ]);
  assert.deepEqual(editor.mechanisms.slice(0, 4), [
    { value: '', label: 'Selecione um Mecanismo', kind: 'none' },
    { value: 'Associado', label: 'Atribuição por Associação', kind: 'associated' },
    { value: 'Campo Formulário', label: 'Atribuição por Campo de Formulário', kind: 'formField' },
    { value: 'Executor Atividade', label: 'Atribuição por Executor de Atividade', kind: 'executor' }
  ]);
  assert.deepEqual(editor.mechanisms.slice(-1), [
    { value: 'atrib_tratar_chamado', label: 'Atribuição por Grupo HelpDesk', kind: 'custom' }
  ]);
  assert.equal(editor.mechanisms.some((item) => item.value === '__custom__'), false);
});

test('lê e regrava atribuição associada com usuários, grupos e tipo lógico', () => {
  const created = patchGatewayBranches(fixture, 'exclusivegateway59', {
    defaultFlowId: '',
    conditions: [{
      sourceIndex: '', order: 1, expression: 'true', targetId: 'intermediateevent61',
      mechanism: 'Associado',
      mechanismConfiguration: {
        associationType: 'OR',
        controllers: [
          { kind: 'colleague', value: 'daniel.sales' },
          { kind: 'group', value: 'TODOS' }
        ]
      }
    }]
  });
  const gateway = created.model.elements.find((item) => item.id === 'exclusivegateway59');
  const condition = parseGatewayConditions(gateway.attributes.condition).conditions[0];
  assert.equal(condition.mechanismConfiguration.associationType, 'OR');
  assert.deepEqual(condition.mechanismConfiguration.controllers, [
    { kind: 'colleague', value: 'daniel.sales' },
    { kind: 'group', value: 'TODOS' }
  ]);
  assert.equal(patchGatewayBranches(created.text, 'exclusivegateway59', {
    defaultFlowId: '',
    conditions: [{
      sourceIndex: 0, order: 1, expression: 'true', targetId: 'intermediateevent61',
      mechanism: 'Associado', mechanismConfiguration: condition.mechanismConfiguration
    }]
  }).changed, false);
});

test('recusa ordem duplicada, destino divergente e alteração ou remoção de condição visual', () => {
  const editor = gatewayEditor(parseProcess(fixture), 'exclusivegateway39');
  const configuration = currentConfiguration(editor);
  assert.throws(
    () => patchGatewayBranches(fixture, 'exclusivegateway39', {
      ...configuration,
      conditions: configuration.conditions.map((condition) => ({ ...condition, order: 1 }))
    }),
    /ordem 1.*repetida/
  );
  assert.throws(
    () => patchGatewayBranches(fixture, 'exclusivegateway39', {
      ...configuration,
      conditions: [{ ...configuration.conditions[0], targetId: 'task5' }, configuration.conditions[1]]
    }),
    /não é saída direta/
  );
  assert.throws(
    () => patchGatewayBranches(fixture, 'exclusivegateway39', { ...configuration, defaultFlowId: 'flow999' }),
    /não pertence/
  );

  const builder = fixture.replace('&lt;conditionType>0&lt;/conditionType>', '&lt;conditionType>1&lt;/conditionType>');
  const builderEditor = gatewayEditor(parseProcess(builder), 'exclusivegateway39');
  const builderConfiguration = currentConfiguration(builderEditor);
  assert.equal(builderEditor.conditions[0].editable, false);
  assert.throws(
    () => patchGatewayBranches(builder, 'exclusivegateway39', {
      ...builderConfiguration,
      conditions: builderConfiguration.conditions.map((condition, index) => (
        index === 0 ? { ...condition, expression: 'true' } : condition
      ))
    }),
    /estrutura desconhecida.*somente leitura/
  );
  assert.throws(
    () => patchGatewayBranches(builder, 'exclusivegateway39', {
      ...builderConfiguration,
      conditions: builderConfiguration.conditions.slice(1)
    }),
    /estrutura desconhecida.*não pode ser removida/
  );
});

test('cria, lê, edita e remove condição avançada com múltiplas regras do Eclipse', () => {
  const created = patchGatewayBranches(fixture, 'exclusivegateway59', {
    defaultFlowId: 'flow62',
    conditions: [{
      sourceIndex: '', order: 1, expression: '', targetId: 'intermediateevent61', conditionType: '1',
      mechanism: 'Grupo', mechanismConfiguration: { groupId: 'TODOS' },
      rules: [
        { sourceIndex: '', field: 'campox', value: 'APROVADO', operator: '1', valueType: '1' },
        { sourceIndex: '', field: 'campox', value: 'outroCampo', operator: '7', valueType: '0' }
      ]
    }]
  });
  let gateway = created.model.elements.find((item) => item.id === 'exclusivegateway59');
  let condition = parseGatewayConditions(gateway.attributes.condition).conditions[0];
  assert.equal(condition.conditionType, '1');
  assert.equal(condition.rulesSupported, true);
  assert.equal(condition.rules.length, 2);
  assert.equal(condition.mechanism, 'Grupo');
  assert.equal(condition.mechanismConfiguration.groupId, 'TODOS');
  assert.deepEqual(condition.rules.map((rule) => ({
    sequence: rule.sequence,
    expressionOrder: rule.expressionOrder,
    ruleOrder: rule.ruleOrder,
    field: rule.field,
    value: rule.value,
    operator: rule.operator,
    valueType: rule.valueType
  })), [
    { sequence: 59, expressionOrder: 1, ruleOrder: 1, field: 'campox', value: 'APROVADO', operator: '1', valueType: '1' },
    { sequence: 59, expressionOrder: 1, ruleOrder: 2, field: 'campox', value: 'outroCampo', operator: '7', valueType: '0' }
  ]);
  const editor = gatewayEditor(created.model, 'exclusivegateway59');
  assert.equal(editor.conditions[0].editable, true);
  assert.equal(patchGatewayBranches(created.text, 'exclusivegateway59', currentConfiguration(editor)).changed, false);
  const legacySequence = created.text.replaceAll('<sequence>59</sequence>', '<sequence>0</sequence>');
  const legacyEditor = gatewayEditor(parseProcess(legacySequence), 'exclusivegateway59');
  assert.equal(legacyEditor.conditions[0].editable, true);
  assert.equal(patchGatewayBranches(legacySequence, 'exclusivegateway59', currentConfiguration(legacyEditor)).changed, false);

  const editedConfiguration = currentConfiguration(editor);
  editedConfiguration.conditions[0].order = 3;
  editedConfiguration.conditions[0].rules[0] = {
    ...editedConfiguration.conditions[0].rules[0], operator: '9', valueType: '0', value: 'ignorado'
  };
  const edited = patchGatewayBranches(created.text, 'exclusivegateway59', editedConfiguration);
  gateway = edited.model.elements.find((item) => item.id === 'exclusivegateway59');
  condition = parseGatewayConditions(gateway.attributes.condition).conditions[0];
  assert.equal(condition.order, 3);
  assert.equal(condition.rules[0].expressionOrder, 3);
  assert.equal(condition.rules[0].operator, '9');
  assert.equal(condition.rules[0].value, '');

  const removed = patchGatewayBranches(edited.text, 'exclusivegateway59', { defaultFlowId: '', conditions: [] });
  gateway = removed.model.elements.find((item) => item.id === 'exclusivegateway59');
  assert.equal(gateway.attributes.condition, '<list/>');
  assert.equal(removed.validation.ok, true);
});

test('reordena condições e sincroniza expressionOrder da regra avançada', () => {
  const created = patchGatewayBranches(fixture, 'exclusivegateway59', {
    defaultFlowId: '',
    conditions: [
      {
        sourceIndex: '', order: 1, expression: '', targetId: 'intermediateevent61', conditionType: '1',
        rules: [{ sourceIndex: '', field: 'campox', value: '123', operator: '1', valueType: '1' }]
      },
      {
        sourceIndex: '', order: 2, expression: 'hAPI.getCardValue("campox") == "OK"',
        targetId: 'intermediateevent61', conditionType: '0', rules: []
      }
    ]
  });
  const editor = gatewayEditor(created.model, 'exclusivegateway59');
  const configuration = currentConfiguration(editor);
  configuration.conditions = [
    { ...configuration.conditions[1], order: 1 },
    { ...configuration.conditions[0], order: 2 }
  ];

  const reordered = patchGatewayBranches(created.text, 'exclusivegateway59', configuration);
  const gateway = reordered.model.elements.find((item) => item.id === 'exclusivegateway59');
  const conditions = parseGatewayConditions(gateway.attributes.condition).conditions;

  assert.deepEqual(conditions.map((condition) => condition.order), [1, 2]);
  assert.equal(conditions[0].conditionType, '0');
  assert.equal(conditions[1].conditionType, '1');
  assert.equal(conditions[1].rules[0].expressionOrder, 2);
  assert.equal(reordered.validation.ok, true);
});

test('recusa regra avançada inválida e protege payload de classe desconhecida', () => {
  assert.throws(() => patchGatewayBranches(fixture, 'exclusivegateway59', {
    defaultFlowId: '',
    conditions: [{
      sourceIndex: '', order: 1, targetId: 'intermediateevent61', conditionType: '1',
      rules: [{ field: 'campox', value: '', operator: '1', valueType: '1' }]
    }]
  }), /Informe o valor da regra 1/);

  const known = patchGatewayBranches(fixture, 'exclusivegateway59', {
    defaultFlowId: '',
    conditions: [{
      sourceIndex: '', order: 1, targetId: 'intermediateevent61', conditionType: '1',
      rules: [{ field: 'campox', value: '', operator: '0', valueType: '0' }]
    }]
  });
  const unknown = known.text.replaceAll(
    'com.totvs.tds.ecm.workflow.model.ConditionProcessAutomaticRules',
    'com.exemplo.RegraDesconhecida'
  );
  const editor = gatewayEditor(parseProcess(unknown), 'exclusivegateway59');
  assert.equal(editor.conditions[0].editable, false);
  assert.match(editor.conditions[0].issue, /estrutura desconhecida/);
  assert.throws(() => patchGatewayBranches(unknown, 'exclusivegateway59', { defaultFlowId: '', conditions: [] }), /não pode ser removida/);
});
