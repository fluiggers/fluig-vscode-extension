'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { validateProcess } = require('../../src/bpmn/processValidator');
const { toWebviewData } = require('../../src/bpmn/webviewData');

test('serializa modelo seguro para a webview', () => {
  const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'), 'ascii');
  const model = parseProcess(text);
  const data = toWebviewData(model, validateProcess(model), {
    formFields: ['campox', 'aprovador'],
    expedientCatalog: [{ value: 'Default', label: 'Default' }],
    volumeCatalog: [{ value: 'Default', label: 'Default' }],
    serverCatalog: [{ value: 'future', label: 'Future' }],
    localFormCatalog: [{ value: 't123', label: 't123', fields: ['campox', 'aprovador'] }],
    userCatalog: [{ value: 'daniel.sales', label: 'Daniel Sales (daniel.sales)' }],
    roleCatalog: [{ value: 'analista_sistemas', label: 'Analista de Sistemas (analista_sistemas)' }],
    groupCatalog: [{ value: 'RH', label: 'Recursos Humanos (RH)' }],
    processCatalog: [{ value: 'DadosDoCandidato', label: 'Dados do candidato (DadosDoCandidato)' }],
    subProcessFormFieldCatalogs: {
      subprocess35: { supported: true, parentFields: ['campox'], childFields: ['resultado'] }
    },
    extensionVersion: '0.28.1-test'
  });
  assert.equal(data.supported, true);
  assert.equal(data.extensionVersion, '0.28.1-test');
  assert.equal(data.connections.length, 11);
  const flow47Connection = data.connections.find((connection) => connection.businessObject === 'flow47');
  const taskShape = data.shapes.find((shape) => shape.businessObject === 'task5');
  const gatewayShape = data.shapes.find((shape) => shape.businessObject === 'exclusivegateway39');
  const databaseShape = data.shapes.find((shape) => shape.businessObject === 'databasetask37');
  const documentShape = data.shapes.find((shape) => shape.businessObject === 'documenttask38');
  const poolShape = data.shapes.find((shape) => shape.businessObject === 'pool1');
  const nestedLaneShape = data.shapes.find((shape) => shape.businessObject === 'swimlane3');
  assert.deepEqual(
    {
      x: nestedLaneShape.x,
      localX: nestedLaneShape.localX,
      parentBusinessObject: nestedLaneShape.parentBusinessObject,
      depth: nestedLaneShape.depth
    },
    { x: poolShape.x + 30, localX: 30, parentBusinessObject: 'pool1', depth: 1 }
  );
  assertPointOnRectangle(flow47Connection.source, taskShape);
  assertPointOnDiamond(flow47Connection.target, gatewayShape, 60, 60);
  assert.deepEqual(
    { width: databaseShape.visualWidth, height: databaseShape.visualHeight },
    { width: 70, height: 78 }
  );
  assert.deepEqual(
    { width: documentShape.visualWidth, height: documentShape.visualHeight },
    { width: 85, height: 95 }
  );
  const returnFlow = data.elements.find((element) => element.id === 'flow46');
  const automaticFlow = data.elements.find((element) => element.id === 'flow48');
  assert.equal(returnFlow.attributes.permiteRetorno, 'true');
  assert.equal(automaticFlow.attributes.fluxoAutomatico, 'true');
  assert.ok(data.shapes.some((shape) => shape.businessObject === 'task5'));
  const flow = data.elements.find((element) => element.id === 'flow47');
  assert.ok(flow.editableProperties.some((property) => property.name === 'movementTitle'));
  const task = data.elements.find((element) => element.id === 'task5');
  const process = data.elements.find((element) => element.id === 'toexportbpmnteste');
  const serviceTask = data.elements.find((element) => element.id === 'servicetask11');
  const connectedStart = data.elements.find((element) => element.id === 'startevent4');
  const disconnectedStart = data.elements.find((element) => element.id === 'startsignal13');
  const connectedEnd = data.elements.find((element) => element.id === 'endevent12');
  const connectedErrorEnd = data.elements.find((element) => element.id === 'enderror17');
  const disconnectedEnd = data.elements.find((element) => element.id === 'endcancel18');
  const exclusiveGateway = data.elements.find((element) => element.id === 'exclusivegateway39');
  const connectedIntermediate = data.elements.find((element) => element.id === 'intermediateevent61');
  const connectedIntermediateWithOutgoing = data.elements.find((element) => element.id === 'intermediateevent63');
  assert.equal(data.elements.find((element) => element.id === 'endevent65'), undefined);
  assert.equal(data.counts.diagramElements, model.counts.diagramElements);
  assert.ok(data.elements.filter((element) => element.configurationIssues.length).length >= 33);
  const configuredIssueIds = data.elements
    .filter((element) => ['BpmnTask', 'BpmnSubProcess'].includes(element.tag) && element.configurationIssues.length)
    .map((element) => element.id);
  for (const expectedId of ['servicetask11', 'manualtask52', 'mailtask31', 'manualtask32', 'businessruletask33', 'scripttask34', 'subprocess35', 'adhocsubprocess36', 'servicetask44', 'task53']) {
    assert.ok(configuredIssueIds.includes(expectedId), expectedId);
  }
  assert.deepEqual(task.configurationIssues, []);
  assert.equal(task.code, '5');
  assert.deepEqual(process.editableProperties, []);
  assert.equal(process.processGeneralEditor.description, 'toexportbpmnteste');
  assert.equal(process.processGeneralEditor.serverId, 'future');
  assert.deepEqual(process.processGeneralEditor.serverOptions, [{ value: 'future', label: 'Future' }]);
  assert.equal(process.processFormEditor.source, 'local');
  assert.equal(process.processFormEditor.cardIndex, 't123');
  assert.equal(process.processFormEditor.maxDescriptorFields, 15);
  assert.deepEqual(process.processFormEditor.localForms[0].fields, ['campox', 'aprovador']);
  assert.deepEqual(process.processAttachmentSecurityEditor.userCatalog, [
  ]);
  assert.deepEqual(data.userCatalog, [
    { value: 'daniel.sales', label: 'Daniel Sales (daniel.sales)' }
  ]);
  assert.deepEqual(data.roleCatalog, [
    { value: 'analista_sistemas', label: 'Analista de Sistemas (analista_sistemas)' }
  ]);
  assert.deepEqual(data.groupCatalog, [
    { value: 'RH', label: 'Recursos Humanos (RH)' }
  ]);
  const subprocess = data.elements.find((element) => element.id === 'subprocess35');
  const subprocessProperty = subprocess.editableProperties.find((property) => property.name === 'process');
  assert.equal(subprocessProperty.kind, 'select');
  assert.deepEqual(subprocessProperty.options, [
    { value: '', label: 'Selecione um subprocesso' },
    { value: 'DadosDoCandidato', label: 'Dados do candidato (DadosDoCandidato)' }
  ]);
  assert.ok(process.processManagerEditor);
  assert.equal(process.processManagerEditor.mechanism, '');
  assert.deepEqual(process.processGeneralEditor.volumeOptions, [{ value: 'Default', label: 'Default' }]);
  assert.equal(task.processGeneralEditor, null);
  assert.equal(task.processFormEditor, null);
  assert.equal(serviceTask.code, '11');
  assert.equal(data.elements.find((element) => element.id === 'manualtask52').code, '52');
  assert.equal(data.elements.find((element) => element.id === 'pool1').code, '');
  assert.equal(serviceTask.configurationIssues.length, 1);
  assert.deepEqual(connectedStart.configurationIssues, []);
  assert.equal(disconnectedStart.configurationIssues.length, 1);
  assert.deepEqual(connectedEnd.configurationIssues, []);
  assert.deepEqual(connectedErrorEnd.configurationIssues, []);
  assert.equal(disconnectedEnd.configurationIssues.length, 1);
  assert.deepEqual(exclusiveGateway.configurationIssues, ['Condição do gateway com mecanismo padrão não configurado.']);
  assert.equal(exclusiveGateway.gatewayConditionEditor.supported, true);
  assert.deepEqual(
    exclusiveGateway.gatewayConditionEditor.destinations.map((destination) => ({
      flowId: destination.flowId,
      targetId: destination.targetId,
      defaultLink: destination.defaultLink
    })),
    [
      { flowId: 'flow48', targetId: 'endevent12', defaultLink: false },
      { flowId: 'flow49', targetId: 'enderror17', defaultLink: true }
    ]
  );
  assert.deepEqual(
    exclusiveGateway.gatewayConditionEditor.conditions.map((condition) => condition.targetId),
    ['endevent12', 'enderror17']
  );
  assert.equal(
    exclusiveGateway.gatewayConditionEditor.mechanisms.find((item) => item.value === 'Executor Atividade').label,
    'Atribuição por Executor de Atividade'
  );
  assert.deepEqual(
    exclusiveGateway.gatewayConditionEditor.mechanisms.slice(0, 10).map((item) => item.value),
    ['', 'Associado', 'Campo Formulário', 'Executor Atividade', 'Grupo', 'Grupos Colaborador', 'Papel', 'Pool Grupo', 'Pool Papel', 'Usuário']
  );
  assert.deepEqual(exclusiveGateway.gatewayConditionEditor.formFields, ['campox', 'aprovador']);
  assert.equal(exclusiveGateway.gatewayConditionEditor.conditions[1].mechanismConfiguration.idNode, 'task5');
  assert.equal(task.gatewayConditionEditor, null);
  assert.equal(task.taskAssignmentEditor.mechanism, 'Grupo');
  assert.equal(task.taskAssignmentEditor.mechanismConfiguration.groupId, 'TODOS');
  assert.deepEqual(task.taskAssignmentEditor.formFields, ['campox', 'aprovador']);
  assert.equal(serviceTask.taskAssignmentEditor.mechanism, '');
  assert.equal(data.elements.find((element) => element.id === 'businessruletask33').taskAssignmentEditor.mechanisms[0].value, '');
  assert.equal(data.elements.find((element) => element.id === 'adhocsubprocess36').taskAssignmentEditor.mechanism, '');
  assert.equal(data.elements.find((element) => element.id === 'mailtask31').taskAssignmentEditor, null);
  assert.deepEqual(connectedIntermediate.configurationIssues, []);
  assert.deepEqual(connectedIntermediateWithOutgoing.configurationIssues, ['Elemento sem fluxo de saída.']);
  assert.deepEqual(
    data.elements
      .filter((element) => element.tag === 'BpmnEndEvent' && element.configurationIssues.length)
      .map((element) => element.id),
    ['endcancel18', 'endsignal19', 'endmultiple20', 'endterminate21']
  );
  assert.ok(exclusiveGateway.configurationIssues.some((issue) => issue.includes('mecanismo padrão')));
  assert.equal(task.editableProperties.some((property) => ['prazoConclusao', 'expediente'].includes(property.name)), false);
  assert.equal(task.taskDeadlineEditor.mode, 'fixed');
  assert.equal(task.taskDeadlineEditor.fixedDuration, '024:00');
  assert.equal(task.taskDeadlineEditor.expedient, 'Default');
  assert.deepEqual(task.taskDeadlineEditor.expedientOptions, [{ value: 'Default', label: 'Default' }]);
  assert.equal(connectedStart.taskDeadlineEditor.mode, 'fixed');
  assert.equal(serviceTask.taskDeadlineEditor, null);
  for (const element of data.elements) {
    assert.equal(
      element.editableProperties.some((property) => ['esforcoCalculo', 'esforcoPrevisto'].includes(property.name)),
      false,
      `${element.id} nao deve expor edicao de esforco`
    );
  }
  assert.equal(task.attributes.esforcoCalculo, '0');
  assert.equal(task.attributes.esforcoPrevisto, '563.0');
  assert.equal(task.taskMobileEditor.title, '@[form:campox]');
  assert.equal(task.taskMobileEditor.highlight, 'Destaque Mobile 53 @[form:campox]');
  assert.equal(task.taskMobileEditor.description, 'Descricao Mobile 54');
  assert.equal(task.taskMobileEditor.approve, '');
  assert.equal(task.taskMobileEditor.reject, '4');
  assert.deepEqual(task.taskMobileEditor.actionOptions, [
    { value: '39', label: 'Exclusivo (39)' },
    { value: '4', label: 'VOLTAR_PARA_INICIO (4)' }
  ]);
  assert.equal(data.elements.find((element) => element.id === 'servicetask11').taskMobileEditor, null);
  assert.deepEqual(task.taskAttachmentRulesEditor.rules, []);
  assert.equal(task.taskAttachmentRulesEditor.operatorOptions.length, 7);
  assert.deepEqual(task.taskAttachmentRulesEditor.formFields, ['campox', 'aprovador']);
  assert.equal(data.elements.find((element) => element.id === 'servicetask11').taskAttachmentRulesEditor, null);
  assert.deepEqual(task.extendedPropertiesEditor.properties, []);
  assert.deepEqual(task.extendedPropertiesEditor.typeOptions.map((item) => item.value), ['0', '1', '2', '3', '4']);
  assert.deepEqual(data.elements.find((element) => element.id === 'flow47').extendedPropertiesEditor.properties, []);
  assert.equal(data.elements.find((element) => element.id === 'pool1').extendedPropertiesEditor, null);
  assert.equal(data.elements.find((element) => element.id === 'swimlane3').extendedPropertiesEditor, null);
  assert.equal(data.elements.find((element) => element.id === 'servicetask11').taskScriptEditor.fileName,
    'toexportbpmnteste.servicetask11.js');
  assert.equal(data.elements.find((element) => element.id === 'businessruletask33').taskScriptEditor.referenceValid, true);
  assert.equal(data.elements.find((element) => element.id === 'scripttask34').taskScriptEditor.existsInProcess, true);
  assert.equal(task.taskScriptEditor, null);
  const serviceProperties = data.elements.find((element) => element.id === 'servicetask11').editableProperties;
  const mailProperties = data.elements.find((element) => element.id === 'mailtask31').editableProperties;
  const adhocProperties = data.elements.find((element) => element.id === 'adhocsubprocess36').editableProperties;
  assert.equal(serviceProperties.find((property) => property.name === 'executionType').options.length, 3);
  assert.equal(serviceProperties.find((property) => property.name === 'frequencyType').options.length, 3);
  assert.deepEqual(mailProperties.map((property) => property.name), [
    'name', 'messageType', 'messageReceiver', 'messageSubject', 'messageContent'
  ]);
  assert.equal(mailProperties.find((property) => property.name === 'messageType').value, '2');
  assert.equal(mailProperties.find((property) => property.name === 'messageType').options.length, 2);
  assert.equal(mailProperties.find((property) => property.name === 'messageReceiver').value, 'campox');
  assert.deepEqual(mailProperties.find((property) => property.name === 'messageReceiver').options, [
    { value: 'campox', label: 'campox' },
    { value: 'aprovador', label: 'aprovador' }
  ]);
  assert.equal(mailProperties.find((property) => property.name === 'messageSubject').value, 'Assunto email 84');
  assert.equal(mailProperties.find((property) => property.name === 'messageContent').kind, 'multiline');
  assert.ok(adhocProperties.some((property) => property.name === 'initialTask' && property.kind === 'boolean'));
  const commonSubProcess = data.elements.find((element) => element.id === 'subprocess35');
  assert.equal(commonSubProcess.subProcessFormMapEditor.supported, true);
  assert.deepEqual(commonSubProcess.subProcessFormMapEditor.parentFields, ['campox']);
  assert.deepEqual(commonSubProcess.subProcessFormMapEditor.childFields, ['resultado']);
  const signalProperty = data.elements.find((element) => element.id === 'startsignal13')
    .editableProperties.find((property) => property.name === 'signalId');
  assert.equal(signalProperty.kind, 'select');
  assert.equal(signalProperty.value, '1');
  assert.deepEqual(signalProperty.options, [
    { value: '0', label: 'Selecione um sinal' },
    { value: '1', label: 'SINAL_TESTE_BPMN' }
  ]);
  const timerEditor = data.elements.find((element) => element.id === 'starttimer15').eventTriggerEditor;
  assert.equal(timerEditor.supported, true);
  assert.equal(timerEditor.runType, 'WEEK_DAY');
  assert.deepEqual(timerEditor.weekdays, ['SUN', 'TUE', 'THU']);
  assert.equal(timerEditor.runTypes.length, 7);
  assert.equal(data.elements.find((element) => element.id === 'startevent4').eventTriggerEditor, null);
  const initializerEditor = data.elements.find((element) => element.id === 'starttimer15').eventInitializerEditor;
  assert.equal(initializerEditor.supported, true);
  assert.equal(initializerEditor.userId, 'daniel.sales');
  assert.deepEqual(initializerEditor.options, [
    { value: 'daniel.sales', label: 'Daniel Sales (daniel.sales)' }
  ]);
  const conditionalInitializerEditor = data.elements.find((element) => element.id === 'startconditional16').eventInitializerEditor;
  assert.equal(conditionalInitializerEditor.supported, true);
  assert.equal(conditionalInitializerEditor.userId, '');
  assert.deepEqual(conditionalInitializerEditor.options, [
    { value: 'daniel.sales', label: 'Daniel Sales (daniel.sales)' }
  ]);
  assert.equal(data.elements.find((element) => element.id === 'startevent4').eventInitializerEditor, null);
  const taskNotificationsEditor = data.elements.find((element) => element.id === 'task5').taskNotificationsEditor;
  assert.equal(taskNotificationsEditor.notifyResponsible, false);
  assert.equal(taskNotificationsEditor.lateResponsible, false);
  assert.equal(taskNotificationsEditor.lateResponsibleTolerance, '002:03');
  assert.equal(data.elements.find((element) => element.id === 'servicetask11').taskNotificationsEditor, null);
  assert.deepEqual(task.taskJointEditor, {
    supported: true,
    joint: true,
    consensus: '100',
    neverSelectCollaborators: true
  });
  assert.deepEqual(data.elements.find((element) => element.id === 'task53').taskJointEditor, {
    supported: true,
    joint: false,
    consensus: '100',
    neverSelectCollaborators: false
  });
  assert.equal(serviceTask.taskJointEditor, null);
  assert.equal(data.elements[0].node, undefined);
  assert.doesNotThrow(() => JSON.stringify(data));
});

test('mapeia intermediate link para um seletor de eventos receptores', () => {
  const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'), 'ascii');
  const model = parseProcess(text);
  const data = toWebviewData(model, validateProcess(model));
  const sender = data.elements.find((element) => element.id === 'intermediatelink26');
  const property = sender.editableProperties.find((item) => item.name === 'linkId');

  assert.equal(property.kind, 'select');
  assert.equal(property.value, 'intermediatelinkreceive29');
  assert.deepEqual(property.options.map((item) => item.value), ['', 'intermediatelinkreceive29']);
  assert.match(property.options[1].label, /^intermediatelinkreceive29 - /);
  assert.equal(sender.configurationIssues.some((issue) => issue.includes('receptor')), false);
  assert.equal(
    data.elements.find((element) => element.id === 'intermediatelinkreceive29')
      .editableProperties.some((item) => item.name === 'linkId'),
    false
  );
});

function assertPointOnRectangle(point, shape) {
  const dx = Math.abs(point.x - (shape.x + (shape.width / 2))) / (shape.width / 2);
  const dy = Math.abs(point.y - (shape.y + (shape.height / 2))) / (shape.height / 2);
  assert.ok(Math.abs(Math.max(dx, dy) - 1) < 1e-8);
}

function assertPointOnDiamond(point, shape, width, height) {
  const dx = Math.abs(point.x - (shape.x + (width / 2))) / (width / 2);
  const dy = Math.abs(point.y - (shape.y + (height / 2))) / (height / 2);
  assert.ok(Math.abs((dx + dy) - 1) < 1e-8);
}
