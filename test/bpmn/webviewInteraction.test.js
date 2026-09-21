'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getWebviewHtml } = require('../../src/bpmn/webviewHtml');

test('painel de propriedades inicia recolhido e possui faixa lateral', () => {
  const html = getWebviewHtml(
    { cspSource: 'vscode-resource:' },
    'editor.js',
    'editor.css',
    'nonce'
  );
  assert.match(html, /id="propertiesPanel" class="properties" aria-expanded="false"/);
  assert.match(html, /class="properties-tab"/);
  assert.match(html, /class="raw-properties property-category"/);
  assert.match(html, /id="deleteElement" type="button" class="danger hidden">Excluir fluxo/);
  assert.match(html, /preserveAspectRatio="xMinYMin meet"/);
});

test('painel organiza propriedades em categorias recolhiveis independentes', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.css'), 'utf8');
  assert.match(source, /function organizePropertyCategories\(element\)/);
  assert.match(source, /createPropertyCategory\(element, 'Geral', 'general', generalNodes, true\)/);
  assert.match(source, /document\.createElement\('details'\)/);
  assert.match(source, /state\.propertyCategoryOpen\.set\(stateKey, details\.open\)/);
  assert.match(source, /task-tracking/);
  assert.match(source, /task-late/);
  assert.match(styles, /\.property-category-summary/);
  assert.match(styles, /\.property-category\[open\]/);
});

test('processo edita a categoria Versão com os campos canônicos do Eclipse', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const provider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'FluigProcessEditorProvider.ts'), 'utf8');
  assert.match(source, /function renderProcessVersionEditor\(element\)/);
  assert.match(source, /process-version-update-attachment/);
  assert.match(source, /process-version-confirm-password/);
  assert.match(source, /process-version-mobile/);
  assert.match(source, /type: 'updateProcessVersion'/);
  assert.match(provider, /applyProcessVersionChanges\(document, panel, message\.elementId, message\.configuration\)/);
  assert.match(provider, /patchProcessVersion\(document\.getText\(\), elementId, configuration\)/);
});

test('processo controla segurança de anexos com mecanismos e seis permissões', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.css'), 'utf8');
  const provider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'FluigProcessEditorProvider.ts'), 'utf8');
  assert.match(source, /function renderProcessAttachmentSecurityEditor\(element\)/);
  assert.match(source, /Controlar segurança/);
  assert.match(source, /Não controlar segurança/);
  assert.match(source, /process-attachment-security-permissions/);
  assert.match(source, /function createGatewayConfigCatalogPicker/);
  assert.match(source, /if \(!items\.length\) return createGatewayConfigInput/);
  assert.match(source, /document\.createElement\('select'\)/);
  assert.match(source, /state\.data\?\.userCatalog \?\? \[\]/);
  assert.match(source, /state\.data\?\.roleCatalog \?\? \[\]/);
  assert.match(source, /state\.data\?\.groupCatalog \?\? \[\]/);
  assert.match(source, /function createGatewayAssociationValue/);
  assert.match(source, /type: 'updateProcessAttachmentSecurity'/);
  assert.match(styles, /\.process-attachment-security-rule/);
  assert.match(provider, /applyProcessAttachmentSecurityChanges\(document, panel, message\.elementId, message\.configuration\)/);
  assert.match(provider, /patchProcessAttachmentSecurity\(document\.getText\(\), elementId, configuration\)/);
});

test('atividades comuns editam a configuracao Mobile em secao dedicada', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const provider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'FluigProcessEditorProvider.ts'), 'utf8');
  assert.match(source, /function renderTaskMobileEditor\(element\)/);
  assert.match(source, /className = 'primary task-mobile-apply'/);
  assert.match(source, /type: 'updateTaskMobile', elementId: element\.id, configuration/);
  assert.match(source, /`@\[form:\$\{formField\.value\}\]`/);
  assert.match(provider, /applyTaskMobileChanges\(document, panel, message\.elementId, message\.configuration\)/);
  assert.match(provider, /patchTaskMobile\(document\.getText\(\), elementId, configuration\)/);
});

test('atividades comuns editam multiplas regras de anexo', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const provider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'FluigProcessEditorProvider.ts'), 'utf8');
  assert.match(source, /function renderTaskAttachmentRulesEditor\(element\)/);
  assert.match(source, /function renderSubProcessFormMapEditor\(element\)/);
  assert.match(source, /type: 'updateSubProcessFormMaps', elementId: element\.id, maps/);
  assert.match(provider, /Campos de \$\{elementId\} gravados e validados[\s\S]*subProcessFormMapsComplete[\s\S]*reloadModel/);
  assert.match(source, /let helper = null;\s*if \(editor\.formFields\.length\)/);
  assert.match(source, /function renderExtendedPropertiesEditor\(element\)/);
  assert.match(source, /Adicionar novo atributo/);
  assert.match(source, /type: 'updateExtendedProperties'/);
  assert.match(source, /function extendedDateToIso\(value\)/);
  assert.match(source, /function extendedIsoToDate\(value\)/);
  assert.match(provider, /applyExtendedPropertyChanges\(document, panel, message\.elementId, message\.properties\)/);
  assert.match(provider, /patchExtendedProperties\(document\.getText\(\), elementId, properties\)/);
  assert.match(source, /className = 'task-attachment-rule-add'/);
  assert.match(source, /className = 'primary task-attachment-rules-apply'/);
  assert.match(source, /type: 'updateTaskAttachmentRules', elementId: element\.id, rules/);
  assert.match(provider, /applyTaskAttachmentRuleChanges\(document, panel, message\.elementId, message\.rules\)/);
  assert.match(provider, /patchTaskAttachmentRules\(document\.getText\(\), elementId, rules\)/);
});

test('atividades compatíveis exibem e gravam o seletor de mecanismo de atribuição', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const provider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'FluigProcessEditorProvider.ts'), 'utf8');
  assert.match(source, /function renderTaskAssignmentEditor\(element\)/);
  assert.match(source, /className = 'task-mechanism-select gateway-mechanism-select'/);
  assert.match(source, /selectedKind === 'custom'/);
  assert.match(source, /type: 'updateTaskAssignment', elementId: element\.id, assignment/);
  assert.match(provider, /applyTaskAssignmentChanges\(document, panel, message\.elementId, message\.assignment\)/);
  assert.match(provider, /patchTaskAssignment\(document\.getText\(\), elementId, assignment\)/);
  assert.match(provider, /ensureBackup\(vscode, document\)/);
});

test('eventos temporizadores e condicionais exibem e gravam agenda Quartz', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const provider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'FluigProcessEditorProvider.ts'), 'utf8');
  assert.match(source, /function renderEventTriggerEditor\(element\)/);
  assert.match(source, /className = 'event-trigger-run-type'/);
  assert.match(source, /className = 'event-trigger-weekday-checkbox'/);
  assert.match(source, /timeLabel\.hidden = \['MINUTE', 'HOUR'\]\.includes\(type\)/);
  assert.match(source, /type: 'updateEventTrigger', elementId: element\.id, trigger/);
  assert.match(provider, /applyEventTriggerChanges\(document, panel, message\.elementId, message\.trigger\)/);
  assert.match(provider, /patchEventTrigger\(document\.getText\(\), elementId, trigger\)/);
  assert.match(provider, /ensureBackup\(vscode, document\)/);
  const styles = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.css'), 'utf8');
  assert.match(styles, /\.event-trigger \[hidden\] \{ display: none !important; \}/);
});

test('eventos iniciais compatíveis escolhem ou removem inicializador do cache', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const provider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'FluigProcessEditorProvider.ts'), 'utf8');
  assert.match(source, /function renderEventInitializerEditor\(element\)/);
  assert.match(source, /className = 'event-initializer-user'/);
  assert.match(source, /type: 'updateEventInitializer', elementId: element\.id, initializer/);
  assert.match(provider, /discoverUserCatalog\(vscode, document\.uri\)/);
  assert.match(provider, /applyEventInitializerChanges\(document, panel, message\.elementId, message\.initializer\)/);
  assert.match(provider, /patchEventInitializer\(document\.getText\(\), elementId, initializer\)/);
});

test('atividades comuns editam acompanhamento e atraso em seção dedicada', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const provider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'FluigProcessEditorProvider.ts'), 'utf8');
  assert.match(source, /function renderTaskNotificationsEditor\(element\)/);
  assert.match(source, /className = 'primary task-notifications-apply'/);
  assert.match(source, /type: 'updateTaskNotifications', elementId: element\.id, configuration/);
  assert.match(provider, /applyTaskNotificationChanges\(document, panel, message\.elementId, message\.configuration\)/);
  assert.match(provider, /patchTaskNotifications\(document\.getText\(\), elementId, configuration\)/);
});

test('fluxo selecionado pode ser excluído por botão ou tecla Delete', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const provider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'FluigProcessEditorProvider.ts'), 'utf8');
  assert.match(source, /function requestSelectedFlowDeletion\(\)/);
  assert.match(source, /flow\?\.tag !== 'SequenceFlow'/);
  assert.match(source, /type: 'deleteSequenceFlow', flowId: flow\.id/);
  assert.match(source, /event\.key === 'Delete'/);
  assert.match(source, /isEditableTarget\(event\.target\)/);
  assert.match(provider, /showWarningMessage\(/);
  assert.match(provider, /modal: true/);
  assert.match(provider, /ensureBackup\(vscode, document\)/);
  assert.match(provider, /new vscode\.WorkspaceEdit\(\)/);
});

test('fluxo padrão exibe o traço diagonal junto à origem', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.css'), 'utf8');
  assert.match(source, /element\?\.attributes\.defaultLink === 'true'/);
  assert.match(source, /function addDefaultFlowMarker\(group, points, permitsReturn, automatic\)/);
  assert.match(source, /defaultFlowMarkerSegment\(points\)/);
  assert.match(source, /class: markerClass/);
  assert.match(styles, /\.default-flow-marker \{/);
  assert.match(styles, /\.return-default-flow-marker \{/);
  assert.match(styles, /\.automatic-default-flow-marker \{/);
});

test('evento isolado ou conectado pode ser excluído com verificação cross-arquivo', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const provider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'FluigProcessEditorProvider.ts'), 'utf8');
  assert.match(source, /function isDeletableIsolatedEvent\(element\)/);
  assert.match(source, /BpmnStartEvent: \['10', '12', '13', '14', '16'\]/);
  assert.match(source, /BpmnEndEvent: \['60', '63', '64', '65', '66', '68'\]/);
  assert.match(source, /BpmnIntermediateEvent: \['30', '32', '35', '36', '37', '39', '41', '42'\]/);
  assert.match(source, /&& element\.type !== '43'/);
  assert.match(source, /type: 'deleteIsolatedEvent', elementId: element\.id/);
  assert.match(provider, /applyIsolatedEventDeletion\(document, panel, message\.elementId\)/);
  assert.match(provider, /findProjectNodeReferences\(document, preview\.elementId, preview\.activityCode\)/);
  assert.match(provider, /resolveConditionalEventScript\(document, preview\.elementId\)/);
  assert.match(provider, /referencesOutsideLinkedScript/);
  assert.match(provider, /createRelatedFileBackup\(vscode, document, currentLinkedScript\.uri\)/);
  assert.match(provider, /edit\.deleteFile\(currentLinkedScript\.uri/);
  assert.match(provider, /Código\/WKNumState/);
  assert.match(provider, /Fluxos removidos junto/);
  assert.match(provider, /script condicional vinculado serão removidos em uma única operação/);
  assert.match(provider, /'Excluir evento'/);
});

test('gateway isolado ou conectado com condição vazia pode ser excluído com verificação cross-arquivo', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const provider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'FluigProcessEditorProvider.ts'), 'utf8');
  assert.match(source, /function isDeletableIsolatedGateway\(element\)/);
  assert.match(source, /\['120', '121', '126', '127'\]\.includes\(String\(element\.type\)\)/);
  assert.match(source, /=== '<list\/>'/);
  assert.doesNotMatch(source.slice(source.indexOf('function isDeletableIsolatedGateway'), source.indexOf('function requestSelectedIsolatedTaskDeletion')), /attributes\?\.incoming/);
  assert.doesNotMatch(source.slice(source.indexOf('function isDeletableIsolatedGateway'), source.indexOf('function requestSelectedIsolatedTaskDeletion')), /attributes\?\.outgoing/);
  assert.match(source, /type: 'deleteIsolatedGateway', elementId: element\.id/);
  assert.match(provider, /applyIsolatedGatewayDeletion\(document, panel, message\.elementId\)/);
  assert.match(provider, /deleteIsolatedGateway\(document\.getText\(\), elementId\)/);
  assert.match(provider, /findProjectNodeReferences\(document, preview\.elementId, preview\.activityCode\)/);
  assert.match(provider, /Fluxos removidos junto/);
  assert.match(provider, /fluxos incidentes listados serão removidos atomicamente/);
  assert.match(provider, /'Excluir gateway'/);
});

test('atividade isolada ou conectada pode ser excluída com o seu script e verificação cross-arquivo', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const provider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'FluigProcessEditorProvider.ts'), 'utf8');
  assert.match(source, /function isDeletableIsolatedTask\(element\)/);
  assert.match(source, /element\.tag !== 'BpmnTask'/);
  assert.match(source, /\['80', '81', '82', '84', '85', '86', '87'\]\.includes\(String\(element\.type\)\)/);
  assert.match(source, /attributes\?\.attachedEvents/);
  assert.doesNotMatch(
    source.slice(source.indexOf('function isDeletableIsolatedTask'), source.indexOf('function requestSelectedIsolatedSubProcessDeletion')),
    /attributes\?\.scriptFileName/
  );
  assert.doesNotMatch(source.slice(source.indexOf('function isDeletableIsolatedTask'), source.indexOf('function requestSelectedIsolatedSubProcessDeletion')), /attributes\?\.incoming/);
  assert.doesNotMatch(source.slice(source.indexOf('function isDeletableIsolatedTask'), source.indexOf('function requestSelectedIsolatedSubProcessDeletion')), /attributes\?\.outgoing/);
  assert.match(source, /type: 'deleteIsolatedTask', elementId: element\.id/);
  assert.match(provider, /applyIsolatedTaskDeletion\(document, panel, message\.elementId\)/);
  assert.match(provider, /deleteIsolatedTask\(document\.getText\(\), elementId\)/);
  assert.match(provider, /resolveTaskScript\(document, preview\.elementId\)/);
  assert.match(provider, /createRelatedFileBackup\(vscode, document, currentLinkedScript\.uri\)/);
  assert.match(provider, /edit\.deleteFile\(currentLinkedScript\.uri/);
  assert.match(provider, /Fluxos removidos junto/);
  assert.match(provider, /script vinculado serão removidos atomicamente/);
  assert.match(provider, /'Excluir atividade'/);
});

test('atividades compatíveis criam ou abrem o script da tarefa sem sobrescrever arquivo existente', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const provider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'FluigProcessEditorProvider.ts'), 'utf8');
  assert.match(source, /function renderTaskScriptEditor\(element\)/);
  assert.match(source, /type: 'openTaskScript', elementId: element\.id/);
  assert.match(source, /Editar Script da Tarefa/);
  assert.match(provider, /openTaskScript\(document, panel, message\.elementId\)/);
  assert.match(provider, /patchTaskScriptReference\(document\.getText\(\), elementId\)/);
  assert.match(provider, /edit\.createFile\(scriptUri, \{ overwrite: false, ignoreIfExists: false \}\)/);
  assert.match(provider, /vscode\.window\.showTextDocument\(scriptDocument, \{ preview: false \}\)/);
});

test('atividades humanas editam execução conjunta, consenso e seleção de colaboradores', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const provider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'FluigProcessEditorProvider.ts'), 'utf8');
  assert.match(source, /function renderTaskJointEditor\(element\)/);
  assert.match(source, /className = 'primary task-joint-apply'/);
  assert.match(source, /Quando conjunta, nunca seleciona colaboradores/);
  assert.match(source, /type: 'updateTaskJoint', elementId: element\.id, configuration/);
  assert.match(provider, /applyTaskJointChanges\(document, panel, message\.elementId, message\.configuration\)/);
  assert.match(source, /function renderTaskDeadlineEditor\(element\)/);
  assert.match(source, /type: 'updateTaskDeadline', elementId: element\.id, configuration/);
  assert.match(provider, /applyTaskDeadlineChanges\(document, panel, message\.elementId, message\.configuration\)/);
  assert.match(provider, /patchTaskJoint\(document\.getText\(\), elementId, configuration\)/);
});

test('subprocesso isolado ou conectado pode ser excluído sem alterar o processo filho', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const provider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'FluigProcessEditorProvider.ts'), 'utf8');
  assert.match(source, /function isDeletableIsolatedSubProcess\(element\)/);
  assert.match(source, /element\.tag !== 'BpmnSubProcess'/);
  assert.match(source, /\['100', '101'\]\.includes\(String\(element\.type\)\)/);
  assert.match(source, /type: 'deleteIsolatedSubProcess', elementId: element\.id/);
  assert.match(provider, /applyIsolatedSubProcessDeletion\(document, panel, message\.elementId\)/);
  assert.match(provider, /deleteIsolatedSubProcess\(document\.getText\(\), elementId\)/);
  assert.match(provider, /Processo filho: \$\{preview\.childProcessId\} \(será preservado\)/);
  assert.match(provider, /Fluxos removidos junto/);
  assert.match(provider, /fluxos incidentes listados serão removidos atomicamente/);
  assert.match(provider, /O processo filho, scripts e formulários serão preservados/);
  assert.match(provider, /'Excluir subprocesso'/);
});

test('artefato pode ser excluído com suas associações sem remover recurso externo', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const provider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'FluigProcessEditorProvider.ts'), 'utf8');
  assert.match(source, /function isDeletableIsolatedArtifact\(element\)/);
  assert.match(source, /\['BpmnAnnotation', 'BpmnDatabase', 'BpmnDocument'\]\.includes\(element\.tag\)/);
  assert.match(source, /element\.tag === 'BpmnGroup'/);
  assert.match(source, /type: 'deleteIsolatedArtifact', elementId: element\.id/);
  assert.match(source, /BpmnDocument: 'Excluir documento'/);
  assert.match(provider, /applyIsolatedArtifactDeletion\(document, panel, message\.elementId\)/);
  assert.match(provider, /deleteIsolatedArtifact\(document\.getText\(\), elementId\)/);
  assert.match(provider, /findProjectNodeReferences\(document, preview\.elementId, ''\)/);
  assert.match(provider, /Documento GED: \$\{preview\.documentId \|\| 'não informado'\} \(será preservado\)/);
  assert.match(provider, /Elementos dentro ou sobrepostos ao grupo serão preservados/);
  assert.match(provider, /Associações visuais removidas junto/);
  assert.match(provider, /Scripts, formulários e recursos externos não serão excluídos/);
});

test('seleção múltipla exclui elementos e scripts vinculados em uma operação atômica', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const provider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'FluigProcessEditorProvider.ts'), 'utf8');
  const patcher = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'processPatcher.ts'), 'utf8');
  assert.match(source, /function requestMultipleElementDeletion\(\)/);
  assert.match(source, /type: 'deleteMultipleElements', elementIds/);
  assert.match(provider, /applyMultipleElementDeletion\(document, panel, message\.elementIds\)/);
  assert.match(provider, /resolveLinkedScriptsForElementIds/);
  assert.match(provider, /'Excluir seleção'/);
  assert.match(patcher, /function deleteDiagramElements\(text, elementIds\)/);
});

test('interação contempla seleção múltipla e ocultação durante arraste', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  assert.match(source, /event\.ctrlKey \|\| event\.metaKey \|\| event\.shiftKey/);
  assert.match(source, /state\.selectedIds\.length === 1 && !state\.isDragging/);
  assert.match(source, /function trackPointerInteraction/);
  assert.match(source, /function finishPointerInteraction/);
  assert.match(source, /type: 'updateLayout'/);
  assert.match(source, /layoutCommitPending/);
  assert.match(source, /function beginMarqueeInteraction/);
  assert.match(source, /fullyContained\(shapeBounds\(shape\), rectangle\)/);
});

test('toolbar exibe erros agrupados por elemento e permite navegar ao item', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'webviewHtml.ts'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.css'), 'utf8');
  assert.match(html, /id="showErrors"[^>]*>Erros \(0\)<\/button>/);
  assert.match(html, /id="validationDialog"/);
  assert.match(source, /function validationProblemGroups\(data\)/);
  assert.match(source, /element\.configurationIssues/);
  assert.match(source, /data\.validation\?\.errors/);
  assert.match(source, /function createValidationProblemGroup\(group\)/);
  assert.match(source, /focusDiagramElement\(group\.elementId\)/);
  assert.match(styles, /\.validation-dialog::backdrop/);
  assert.match(styles, /\.validation-problem-group/);
});

test('toolbar alinha dois ou mais elementos e ignora fluxos selecionados', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'webviewHtml.ts'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.css'), 'utf8');

  assert.match(html, /id="alignHorizontal"/);
  assert.match(html, /id="alignVertical"/);
  assert.match(source, /function alignSelectedElements\(orientation\)/);
  assert.match(source, /!\['SequenceFlow', 'BpmnProcess'\]\.includes\(element\.tag\)/);
  assert.match(source, /alignedCenterPositions/);
  assert.match(source, /rootIds\.length < 2/);
  assert.match(source, /type: 'updateLayout'/);
  assert.match(styles, /\.toolbar-icon-button/);
});

test('evento de erro anexado acompanha a atividade e não exibe texto externo', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  assert.match(source, /function attachedDragIds/);
  assert.match(source, /parent\.append\(group\)/);
  assert.match(source, /if \(!isAttachedBoundaryEvent\(element\)\)/);
  assert.match(source, /constrainedAttachedDelta/);
  assert.match(source, /normalizeAttachedShapePositions\(\)/);
});

test('tratativa de erro pode ser excluída pela lixeira do menu flutuante', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.css'), 'utf8');
  const provider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'FluigProcessEditorProvider.ts'), 'utf8');
  assert.match(source, /function isDeletableAttachedErrorEvent\(element\)/);
  assert.match(source, /class: 'context-pad-action context-pad-delete'/);
  assert.match(source, /requestContextPadDeletion\(event, element\)/);
  assert.match(source, /type: 'deleteAttachedErrorEvent', elementId: element\.id/);
  assert.match(styles, /\.context-pad-delete-icon/);
  assert.match(provider, /applyAttachedErrorEventDeletion\(document, panel, message\.elementId\)/);
  assert.match(provider, /deleteAttachedErrorEvent\(document\.getText\(\), elementId\)/);
  assert.match(provider, /'Excluir tratativa'/);
});

test('arraste usa a transformação SVG real e canvas é reajustado ao conteúdo', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  assert.match(source, /viewport\.getScreenCTM/);
  assert.match(source, /snappedPointDelta/);
  assert.match(source, /fittedCanvas\(diagramContentBounds\(\)\)/);
});

test('canvas oferece zoom centralizado pelo cursor com Ctrl e roda do mouse', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  assert.match(source, /canvasScroller\.addEventListener\('wheel', handleCanvasWheel, \{ passive: false \}\)/);
  assert.match(source, /if \(!event\.ctrlKey && !event\.metaKey\) return/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /zoomedScrollPosition/);
  assert.match(source, /event\.deltaY < 0 \? 0\.1 : -0\.1/);
});

test('editor permite escolher e persistir uma cor de fundo com grade contrastante', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'webviewHtml.ts'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.css'), 'utf8');
  assert.match(html, /id="canvasBackgroundColor" type="color" value="#f5f5f5"/);
  assert.match(source, /function setCanvasBackground\(value, persist = true\)/);
  assert.match(source, /canvasBackgroundColor: state\.canvasBackgroundColor/);
  assert.match(source, /--diagram-grid-color/);
  assert.match(styles, /--diagram-background: #f5f5f5/);
  assert.match(styles, /background-color: var\(--diagram-background\)/);
});

test('todos os shapes selecionados recebem o mesmo contorno forte', () => {
  const styles = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.css'), 'utf8');
  assert.match(styles, /\.node:focus \{ outline: none; \}/);
  assert.match(styles, /\.node\.selected > \.body \{ stroke: var\(--accent\) !important; stroke-width: 3 !important; \}/);
});

test('pool e raia oferecem movimento hierarquico e resize seguro', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.css'), 'utf8');
  assert.match(source, /function expandedDragIds/);
  assert.match(source, /function constrainNestedContainers/);
  assert.match(source, /function beginResizeInteraction/);
  assert.match(source, /function updateResizePreview/);
  assert.match(source, /resizes: \[\{ id: pointer\.id, width: primary\.width, height: primary\.height \}\]/);
  assert.match(styles, /\.node\.selected > \.resize-handle/);
  assert.match(styles, /\.node\.pool\.selected, \.node\.lane\.selected, \.node\.dragging \{ filter: none; \}/);
  assert.doesNotMatch(source, /pools com varias raias exigem uma referencia Eclipse homologada/);
  assert.match(source, /lane\.localY = index \* laneHeight/);
  assert.match(source, /lane\.height = laneHeight/);
});

test('paleta cria pool e raia interna ou independente sem duplicar ação na toolbar', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'webviewHtml.ts'), 'utf8');
  const provider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'FluigProcessEditorProvider.ts'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.css'), 'utf8');
  assert.doesNotMatch(html, /id="createPool"/);
  assert.doesNotMatch(html, /id="createLane"/);
  assert.match(html, /id="elementPalette"/);
  assert.match(html, /data-tool="lane"/);
  assert.match(source, /function beginContainerPlacement\(kind\)/);
  assert.match(source, /function trackContainerPlacement\(event\)/);
  assert.match(source, /function finishContainerPlacement\(event\)/);
  assert.match(source, /type: 'createPool', pool: request/);
  assert.match(source, /function finishPaletteLanePlacement\(event, placement\)/);
  assert.match(source, /type: 'createSwimLane', lane: request/);
  assert.match(provider, /createPool\(document\.getText\(\), \{ \.\.\.pool, templateText \}\)/);
  assert.match(provider, /createSwimLane\(document\.getText\(\), \{ \.\.\.lane, templateText \}\)/);
  assert.match(provider, /await this\.backupService\.ensureBackup\(vscode, document\)/);
  assert.match(styles, /\.container-placement-ghost/);
  assert.match(styles, /\.element-palette/);
});

test('pool e raia podem ser excluidas pela lixeira, painel ou tecla Delete', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const provider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'FluigProcessEditorProvider.ts'), 'utf8');
  const patcher = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'processPatcher.ts'), 'utf8');
  assert.match(source, /function isDeletableContainer\(element\)/);
  assert.match(source, /\['BpmnPool', 'BpmnSwimLane'\]\.includes\(element\.tag\)/);
  assert.match(source, /type: 'deleteDiagramContainer', elementId: element\.id/);
  assert.match(source, /if \(event\.key === 'Delete'/);
  assert.match(provider, /applyDiagramContainerDeletion\(document, panel, message\.elementId\)/);
  assert.match(patcher, /function deleteDiagramContainer\(text, elementId\)/);
});

test('toolbar abre propriedades gerais do processo e grava por editor dedicado', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'webviewHtml.ts'), 'utf8');
  const provider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'FluigProcessEditorProvider.ts'), 'utf8');
  assert.match(html, /id="showProcess"/);
  assert.match(source, /element\.tag === 'BpmnProcess'/);
  assert.match(source, /function renderProcessGeneralEditor\(element\)/);
  assert.match(source, /type: 'updateProcessGeneral', elementId: element\.id, configuration/);
  assert.match(provider, /applyProcessGeneralChanges\(document, panel, message\.elementId, message\.configuration\)/);
  assert.match(provider, /patchProcessGeneral\(document\.getText\(\), elementId, configuration/);
  assert.match(source, /Buscar expedientes no servidor/);
  assert.match(source, /type: 'requestServerBusinessPeriods'/);
  assert.match(source, /function applyBusinessPeriodsToData\(data, periods\)/);
  assert.match(provider, /this\.remoteFormCatalog\.businessPeriods\(server, vscode\.env\.machineId, \{ forceRefresh: true \}\)/);
  assert.match(provider, /serverBusinessPeriodsComplete/);
  assert.match(source, /Atualizar mecanismos do servidor/);
  assert.match(source, /type: 'requestServerMechanisms'/);
  assert.match(source, /function applyServerDesignCatalogsToData\(data, mechanisms, volumes\)/);
  assert.match(source, /function refreshRenderedServerDesignCatalogs\(\)/);
  assert.match(source, /result\.push\(\{ \.\.\.item, kind: 'custom' \}\)/);
  assert.match(provider, /this\.remoteFormCatalog\.designCatalogs\(server, vscode\.env\.machineId, \{ forceRefresh: true \}\)/);
  assert.match(provider, /serverDesignCatalogsComplete/);
});

test('aba de formulário limita descritores, descobre formulários locais e grava por editor dedicado', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const provider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'FluigProcessEditorProvider.ts'), 'utf8');
  assert.match(source, /function renderProcessFormEditor\(element\)/);
  assert.match(source, /editor\.maxDescriptorFields/);
  assert.match(source, /O Fluig permite no máximo/);
  assert.match(source, /type: 'updateProcessForm', elementId: element\.id, configuration/);
  assert.match(provider, /discoverLocalFormCatalog\(vscode, document\.uri\)/);
  assert.match(provider, /applyProcessFormChanges\(document, panel, message\.elementId, message\.configuration\)/);
  assert.match(provider, /patchProcessForm\(document\.getText\(\), elementId, configuration/);
  assert.match(source, /Buscar formulários no servidor/);
  assert.match(source, /type: 'requestServerForms', elementId: element\.id/);
  assert.match(source, /function populateServerFormOptions\(container, forms, query, currentValue, onSelect\)/);
  assert.match(source, /remoteFormOptions\.setAttribute\('role', 'listbox'\)/);
  assert.match(source, /remoteFormToggle\.setAttribute\('role', 'combobox'\)/);
  assert.match(source, /Buscar por código, nome ou dataset/);
  assert.match(source, /function filterServerForms\(forms, query\)/);
  assert.match(source, /serverFormDisplayValue\(form\)/);
  assert.match(source, /form\?\.documentDescription/);
  assert.match(source, /form\?\.datasetName/);
  assert.match(provider, /resolveServerConfiguration\(vscode, document\.uri, serverId\)/);
  assert.match(provider, /serverFormCatalogComplete/);
  assert.match(source, /Buscar campos do formulário/);
  assert.match(source, /type: 'requestServerFormFields', elementId: element\.id, documentId/);
  assert.match(source, /function applyFormFieldsToData\(data, fields\)/);
  assert.match(source, /function refreshRenderedFormFieldSelects\(fields\)/);
  assert.match(source, /select\[data-config-key="formField"\]/);
  assert.match(source, /process-form-server-descriptors input:checked/);
  assert.match(provider, /this\.remoteFormCatalog\.fields\(server, vscode\.env\.machineId, normalizedDocumentId\)/);
  assert.match(provider, /serverFormFieldsComplete/);
});

test('paleta fixa oferece criação isolada e ferramenta de seleção por área', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'webviewHtml.ts'), 'utf8');
  const provider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'FluigProcessEditorProvider.ts'), 'utf8');
  for (const tool of ['select', 'marquee', 'start', 'end', 'intermediate', 'task', 'subprocess', 'gateway', 'pool', 'lane', 'database', 'annotation', 'document']) {
    assert.match(html, new RegExp(`data-tool="${tool}"`));
  }
  assert.match(source, /function activatePaletteTool\(tool, subtype/);
  assert.match(source, /function beginPalettePlacement\(kind, subtype/);
  assert.match(source, /function finishPalettePlacement\(event\)/);
  assert.match(source, /type: 'createIsolatedNode', node: request/);
  assert.match(source, /state\.activeTool !== 'marquee'/);
  assert.match(provider, /createIsolatedNode\(document\.getText\(\), \{ \.\.\.node, templateText \}\)/);
  for (const subtype of ['10', '12', '13', '14', '16', '60', '63', '64', '65', '66', '68', '30', '32', '35', '36', '37', '39', '41', '42', '43', '80', '81', '82', '84', '85', '86', '87', '100', '101', '120', '121', '126', '127']) {
    assert.match(html, new RegExp(`data-subtype="${subtype}"`));
  }
});

test('propriedade de cor da raia usa seletor visual e normaliza hexadecimal', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const webviewData = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'webviewData.ts'), 'utf8');
  assert.match(webviewData, /name === 'cores'.*kind: 'color'/);
  assert.match(source, /property\.kind === 'color' \? 'color'/);
  assert.match(source, /control\.type === 'color' \? control\.value\.replace/);
  assert.match(source, /group\.setAttribute\('color', color/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.css'), 'utf8'), /\.node\.lane \.body \{ fill: currentColor; \}/);
  assert.doesNotMatch(source, /style: color \? `fill:/);
});

test('paleta pode ser recolhida e eventos usam miniaturas coloridas completas', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'webviewHtml.ts'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.css'), 'utf8');
  assert.match(html, /id="togglePalette"/);
  assert.doesNotMatch(html, /id="togglePaletteToolbar"/);
  assert.doesNotMatch(source, /paletteToolbarToggle/);
  assert.match(source, /function setPaletteCollapsed\(collapsed, persist = true\)/);
  assert.match(source, /paletteCollapsed: state\.paletteCollapsed/);
  assert.match(html, /function eventPaletteIcon\(kind, type\)/);
  assert.match(html, /class="palette-event-icon \$\{kind\}"/);
  assert.match(styles, /\.palette-event-icon\.start \.event-shell \{ fill: #80ff80; \}/);
  assert.match(styles, /\.palette-event-icon\.end \.event-shell \{ fill: #dc6468;/);
  assert.match(styles, /\.palette-event-icon\.intermediate \.event-shell \{ fill: #ffff83; \}/);
  assert.match(html, /function taskPaletteIcon\(type\)/);
  assert.match(html, /function gatewayPaletteIcon\(type\)/);
  assert.match(source, /if \(tool === 'pool'\)/);
  assert.match(html, /data-subtype="43" title="Arraste para uma atividade de serviço automatizada"/);
  assert.doesNotMatch(html, /data-subtype="43" disabled/);
  assert.match(source, /function finishAttachedErrorPlacement\(event, placement\)/);
  assert.match(source, /String\(element\.attributes\.executionType \?\? ''\) === '1'/);
  assert.match(source, /type: 'createAttachedErrorEvent'/);
});

test('backup continua obrigatório sem expor o caminho em mensagens rotineiras', () => {
  const provider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'FluigProcessEditorProvider.ts'), 'utf8');
  assert.match(provider, /await this\.backupService\.ensureBackup\(vscode, document\)/);
  assert.match(provider, /message: 'Layout gravado no processo\.'/);
  assert.doesNotMatch(provider, /Backup: \$\{backupUri\.fsPath\}/);
});

test('alcas de resize somem durante movimento ou redimensionamento', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.css'), 'utf8');
  assert.doesNotMatch(source, /diagram\.classList\.toggle\('layout-interacting'/);
  assert.match(source, /handle\.setAttribute\('visibility', state\.isDragging \? 'hidden' : 'visible'\)/);
  assert.match(source, /handle\.style\.pointerEvents = state\.isDragging \? 'none' : ''/);
  assert.match(source, /state\.selectedIds\.length === 1 && !state\.isDragging/);
  assert.doesNotMatch(styles, /#diagram\.layout-interacting/);
});

test('resize de pool atualiza somente os containers sem reconstruir o SVG a cada movimento', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const resizePreview = source.slice(
    source.indexOf('function updateResizePreview()'),
    source.indexOf('function updateContainerResizeVisual(id)')
  );
  assert.match(source, /function updateContainerResizeVisual\(id\)/);
  assert.match(source, /pointer\.resizeIds\.forEach\(updateContainerResizeVisual\)/);
  assert.match(source, /syncResizeHandleVisibility\(\)/);
  assert.doesNotMatch(resizePreview, /redrawDiagram\(/);
});

test('menu de contexto inicia fluxo por arraste e destaca somente destino valido', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.css'), 'utf8');
  assert.match(source, /function addContextPad/);
  assert.match(source, /function showContextPad/);
  assert.match(source, /function scheduleContextPadHide/);
  assert.match(source, /}, 500\);/);
  assert.match(source, /function contextPadPosition/);
  assert.match(source, /bestContextPadPosition/);
  assert.match(source, /function beginConnectionInteraction/);
  assert.match(source, /function trackConnectionInteraction/);
  assert.match(source, /function routeNewConnection/);
  assert.match(source, /type: 'createConnection'/);
  assert.match(source, /cancelConnectionInteraction/);
  assert.match(styles, /\.node:hover > \.context-pad/);
  assert.match(styles, /\.node\.context-pad-visible > \.context-pad/);
  assert.match(styles, /\.node\.connection-target > \.body/);
});

test('clique direito oferece novo fluxo e conclui a conexao ao clicar no destino', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  assert.match(source, /addEventListener\('contextmenu', \(event\) => openTaskCreationMenu/);
  assert.match(source, /label: 'Novo fluxo'/);
  assert.match(source, /function beginClickConnectionPlacement/);
  assert.match(source, /clickToPlace: true/);
  assert.match(source, /function finishClickConnectionPlacement/);
  assert.match(source, /requestConnectionCreation\(sourceId, targetId, bendpoints\)/);
});

test('lápis da atividade abre conversão de tipo e envia a escolha ao host', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.css'), 'utf8');
  assert.match(source, /class: 'context-pad-action context-pad-pencil'/);
  assert.match(source, /function openTaskConversionMenu/);
  assert.match(source, /taskConversionOptions\.filter\(\(item\) => item\.type !== element\.type\)/);
  assert.match(source, /type: 'convertTask', taskId, targetType/);
  assert.match(source, /function closeTaskConversionMenu/);
  assert.match(styles, /\.task-convert-menu/);
  assert.match(styles, /\.context-pad-pencil-icon/);
});

test('menu contextual posiciona nova atividade e solicita criação conectada', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.css'), 'utf8');
  assert.match(source, /class: 'context-pad-action context-pad-create'/);
  assert.match(source, /function openTaskCreationMenu/);
  assert.match(source, /function beginTaskPlacement/);
  assert.match(source, /function trackTaskPlacement/);
  assert.match(source, /function routeTaskPlacement/);
  assert.match(source, /type: 'createConnectedTask'/);
  assert.match(source, /label: 'Novo gateway'/);
  assert.match(source, /type: 'createConnectedGateway'/);
  assert.match(source, /newGatewaySize = \{ width: 60, height: 60, collisionHeight: 102 \}/);
  assert.match(source, /label: 'Novo evento intermediário'/);
  assert.match(source, /type: 'createConnectedIntermediateEvent'/);
  assert.match(source, /newIntermediateEventSize = \{ width: 35, height: 35, collisionWidth: 110, collisionHeight: 65 \}/);
  assert.match(source, /label: 'Novo evento final'/);
  assert.match(source, /type: 'createConnectedEndEvent'/);
  assert.match(source, /newEndEventSize = \{ width: 35, height: 35, collisionWidth: 110, collisionHeight: 65 \}/);
  assert.doesNotMatch(source, /label: 'Novo documento'/);
  assert.doesNotMatch(source, /label: 'Novo database'/);
  assert.doesNotMatch(source, /label: 'Nova anotação'/);
  assert.match(source, /cancelTaskPlacement/);
  assert.match(styles, /\.task-placement-ghost/);
});

test('painel do gateway edita condições e preserva o fluxo padrão configurado no próprio fluxo', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.css'), 'utf8');
  const provider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'FluigProcessEditorProvider.ts'), 'utf8');
  const gatewayRowSource = source.slice(
    source.indexOf('function createGatewayConditionRow'),
    source.indexOf('function createGatewayAdvancedRuleRow')
  );
  const attachmentRuleSource = source.slice(
    source.indexOf('function createAttachmentSecurityRuleRow'),
    source.indexOf('function updateAttachmentSecurityRuleLabels')
  );
  assert.match(source, /function renderGatewayConditionEditor/);
  assert.match(source, /function requestGatewayBranchUpdate/);
  assert.match(source, /type: 'updateGatewayBranches'/);
  assert.doesNotMatch(source, /gateway-default-select/);
  assert.match(source, /section\.dataset\.defaultFlowId = editor\.destinations\.find/);
  assert.match(source, /defaultFlowId: section\.dataset\.defaultFlowId \?\? ''/);
  assert.match(source, /gateway-expression-input/);
  assert.match(source, /gateway-destination-select/);
  assert.match(source, /gateway-condition-add/);
  assert.match(source, /gateway-condition-add-advanced/);
  assert.match(source, /add\.textContent = 'Adicionar avançado'/);
  assert.match(source, /addAdvanced\.textContent = 'Adicionar'/);
  assert.match(source, /const hasDestinations = editor\.destinations\.length > 0/);
  assert.match(source, /add\.disabled = !hasDestinations/);
  assert.match(source, /addAdvanced\.disabled = !hasDestinations/);
  assert.match(source, /apply\.disabled = !hasDestinations/);
  assert.doesNotMatch(source, /if \(!editor\.destinations\.length\)[\s\S]*?return;/);
  assert.match(source, /function createGatewayAdvancedRuleRow/);
  assert.match(source, /gateway-advanced-field/);
  assert.match(source, /gateway-advanced-operator/);
  assert.match(source, /gateway-advanced-value-type/);
  assert.match(source, /function readGatewayAdvancedRules/);
  assert.match(source, /conditionType: row\.dataset\.conditionType/);
  assert.match(source, /gateway-condition-remove/);
  assert.match(source, /gateway-condition-move-up/);
  assert.match(source, /gateway-condition-move-down/);
  assert.match(source, /moveUp\.textContent = 'Subir'/);
  assert.match(source, /moveDown\.textContent = 'Descer'/);
  assert.match(source, /orderInput\.readOnly = true/);
  assert.match(source, /function syncGatewayConditionOrderControls/);
  assert.match(source, /order: automaticallyOrdered \? index \+ 1/);
  assert.match(source, /rows\.some\(\(item\) => item\.dataset\.editable !== 'true'\)/);
  assert.match(gatewayRowSource, /const rowActions = document\.createElement\('div'\)/);
  assert.match(gatewayRowSource, /rowActions\.append\(moveUp, moveDown, remove\)/);
  assert.doesNotMatch(attachmentRuleSource, /gateway-condition-move-(?:up|down)/);
  assert.match(source, /gateway-mechanism-select/);
  assert.match(source, /gateway-mechanism-configure/);
  assert.match(source, /function renderGatewayMechanismConfiguration/);
  assert.match(source, /selectedKind === 'custom'/);
  assert.match(source, /if \(kind === 'custom'\) return \{\};/);
  assert.doesNotMatch(source, /Outro mecanismo customizado/);
  assert.match(source, /gateway-association-list/);
  assert.match(source, /Primeira execução/);
  assert.match(source, /Todas as execuções/);
  assert.match(source, /sourceIndex/);
  assert.match(styles, /\.gateway-condition-row/);
  assert.match(styles, /\.gateway-condition-row:nth-child\(odd\)/);
  assert.match(styles, /\.gateway-condition-row:nth-child\(even\)/);
  assert.match(styles, /\.gateway-condition-row-actions/);
  assert.match(styles, /\.gateway-condition-order input\[readonly\]/);
  assert.match(styles, /\.gateway-advanced-rule-row/);
  assert.match(provider, /applyGatewayBranchChanges/);
  assert.match(provider, /patchGatewayBranches/);
});

test('acabamento visual acompanha zoom, posicionamento, hover e telas estreitas', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'webviewHtml.ts'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.css'), 'utf8');

  assert.match(html, /id="zoomReset" class="zoom-level"/);
  assert.match(source, /zoomResetButton\.textContent = `\$\{Math\.round\(state\.zoom \* 100\)\}%`/);
  assert.match(source, /setProperty\('--diagram-grid-size', `\$\{Math\.max\(2, 10 \* state\.zoom\)\}px`\)/);
  assert.match(styles, /background-size: var\(--diagram-grid-size\) var\(--diagram-grid-size\)/);

  assert.match(source, /function setPlacementValidity\(placement, valid\)/);
  assert.match(source, /placement\.ghost\.classList\.toggle\('valid-placement', placement\.valid\)/);
  assert.match(source, /placement\.preview\.classList\.toggle\('invalid-target', !valid\)/);
  assert.match(styles, /\.palette-placement-ghost\.valid-placement \.body/);
  assert.match(styles, /\.palette-placement-ghost\.invalid-placement \.body/);

  assert.match(source, /state\.containerPlacement \?\? state\.palettePlacement/);
  assert.match(source, /else if \(state\.palettePlacement\) trackPalettePlacement/);
  assert.match(styles, /\.node:not\(\.selected\):hover > \.body/);
  assert.match(styles, /\.flow-group:hover \.flow:not\(\.selected\)/);
  assert.match(styles, /@media \(max-width: 980px\)/);
});

test('arraste de processo grande limita o trabalho por quadro e por fluxo incidente', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  assert.match(source, /pointerPreviewFrame: 0/);
  assert.match(source, /function schedulePointerPreview\(\)/);
  assert.match(source, /state\.pointerPreviewFrame = requestAnimationFrame/);
  assert.match(source, /pointer\.routedBendpoints = null/);
  assert.match(source, /refreshConnections\(pointer\.incidentConnectionIds, false\)/);
  assert.doesNotMatch(
    source.match(/function updateDragPreview\(\) \{[\s\S]*?\n  \}\n\n  function dragBounds/)?.[0] ?? '',
    /routeConnections\(/
  );
});

test('roteamento usa indices locais, janela de obstaculos e ajuste global cancelavel', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  assert.match(source, /function rebuildIndexes\(data\)/);
  assert.match(source, /state\.elementById = new Map/);
  assert.match(source, /function findElement\(id\) \{ return state\.elementById\.get\(id\); \}/);
  assert.match(source, /routeInWindow\(120\) \?\? routeInWindow\(260\)/);
  assert.match(source, /async function routeConnectionsAsync/);
  assert.match(source, /await new Promise\(\(resolve\) => requestAnimationFrame\(resolve\)\)/);
  assert.match(source, /Cancelar ajuste/);
});

test('menu contextual usa camada propria sem alterar a ordem visual de pools e atividades', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.css'), 'utf8');
  assert.match(source, /class: 'context-pad-layer'/);
  assert.match(source, /state\.contextPadById\.set\(element\.id, contextPad\)/);
  assert.match(source, /if \(!pad\) return;/);
  const showContextPad = source.match(/function showContextPad\(group\) \{[\s\S]*?\n  \}\n\n  function hideContextPad/)?.[0] ?? '';
  assert.doesNotMatch(showContextPad, /append\(group\)/);
  assert.match(source, /function hideAllContextPads\(\)/);
  assert.match(styles, /\.context-pad\.context-pad-visible/);
  assert.match(styles, /\.context-pad-layer \{ pointer-events: none; \}/);
});

test('fluxos ficam acima de pools e raias e abaixo das atividades', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const renderModel = source.match(/function renderModel\(data\) \{[\s\S]*?\n  \}\n\n  function renderConnections/)?.[0] ?? '';
  const redrawDiagram = source.match(/function redrawDiagram\(updateBounds = true\) \{[\s\S]*?\n  \}/)?.[0] ?? '';

  assert.match(source, /function firstForegroundNode\(\)/);
  assert.match(source, /\.node:not\(\.pool\):not\(\.lane\):not\(\.group\)/);
  assert.ok(renderModel.indexOf('renderShapes(data);') < renderModel.indexOf('renderConnections(data, firstForegroundNode());'));
  assert.ok(redrawDiagram.indexOf('renderShapes(state.data);') < redrawDiagram.indexOf('renderConnections(state.data, firstForegroundNode());'));
  assert.doesNotMatch(source, /renderConnections\(state\.data, viewport\.querySelector\('\.node'\)/);
});

test('processo edita codigo, escolhe servidor cadastrado e configura gestor', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const provider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'FluigProcessEditorProvider.ts'), 'utf8');
  assert.match(source, /process-general-code/);
  assert.match(source, /process-general-server/);
  assert.match(source, /process-general-deadline/);
  assert.match(source, /process-general-warning/);
  assert.match(source, /process-general-active/);
  assert.match(source, /process-general-public/);
  assert.match(source, /activeTouched: section\.querySelector\('\.process-general-active'\)\.dataset\.touched === 'true'/);
  assert.match(source, /publicTouched: section\.querySelector\('\.process-general-public'\)\.dataset\.touched === 'true'/);
  assert.match(source, /process-general-complements-enabled/);
  assert.match(source, /process-general-complements-configure/);
  assert.match(source, /process-general-complements-notify-responsible/);
  assert.match(source, /process-general-complements-notify-requisitioner/);
  assert.match(source, /process-general-complements-notify-manager/);
  assert.match(source, /Todos os usuários do sistema/);
  assert.match(source, /editor\.serverOptions/);
  assert.match(source, /function renderProcessManagerEditor\(element\)/);
  assert.match(source, /type: 'updateProcessManager', elementId: element\.id, assignment/);
  assert.match(provider, /discoverServerCatalog\(vscode, document\.uri\)/);
  assert.match(provider, /patchProcessManager\(document\.getText\(\), elementId, assignment\)/);
  assert.match(provider, /applyControlledProcessRename\(document, panel, elementId, result\)/);
  assert.match(provider, /provideExternalProcessRenameEdits\(event\)/);
  assert.match(provider, /discoverRelatedArtifactRenames/);
  assert.match(provider, /onDidSaveTextDocument\(\(document\) =>/);
  assert.match(provider, /refactorSavedProcessIdentity\(document\)/);
  assert.match(provider, /edit\.renameFile\(document\.uri, processTarget/);
  const applyIdentity = provider.slice(
    provider.indexOf('async applyControlledProcessRename'),
    provider.indexOf('async refactorSavedProcessIdentity')
  );
  assert.doesNotMatch(applyIdentity, /renameFile\(/);
  assert.match(applyIdentity, /Salve o \.process para concluir a refatoracao/);
  assert.match(source, /scripts, literais e artefatos vinculados/);
  const readForm = source.match(/function readForm\(\) \{[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(readForm, /querySelectorAll\('\[data-property-name\]'\)/);
  assert.doesNotMatch(readForm, /propertyForm\.elements/);
});

test('webview invalida cache dos recursos e sempre apresenta Campos no subprocesso comum', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const provider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'FluigProcessEditorProvider.ts'), 'utf8');
  assert.match(provider, /const versionedMediaUri = \(fileName\) => panel\.webview/);
  assert.match(provider, /\.with\(\{ query: `v=\$\{encodeURIComponent\(extensionVersion\)\}-\$\{webviewNonce\}` \}\)/);
  assert.match(provider, /versionedMediaUri\('editor\.js'\)/);
  assert.match(provider, /versionedMediaUri\('editor\.css'\)/);
  assert.match(source, /const commonSubProcess = element\.tag === 'BpmnSubProcess' && String\(element\.type\) === '100'/);
  assert.match(source, /Os dados de mapeamento nao foram recebidos/);
  assert.match(source, /parentFields: Array\.isArray\(receivedEditor\.parentFields\)/);
  assert.match(source, /Nao foi possivel montar um mapeamento salvo/);
  assert.match(source, /Array\.isArray\(options\) \? options : \[\]/);
  const rowBuilder = source.match(/function createSubProcessFormMapRow\([\s\S]*?\n  \}\n\n  function createSubProcessFormMapSelect/)?.[0] ?? '';
  assert.match(rowBuilder, /row\.append\(\s*legend,/);
  assert.match(source, /if \(rowTitle\) rowTitle\.textContent = `Mapeamento \$\{index \+ 1\}`/);
});

test('evento intermediate link exibe o seletor Link no painel geral', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.css'), 'utf8');
  assert.match(source, /if \(name === 'linkId'\) return 'Link'/);
  assert.match(source, /function navigateToLinkedEvent\(elementId\)/);
  assert.match(source, /navigateButton\.textContent = 'Ir para o link selecionado'/);
  assert.match(source, /selectElement\(elementId\)/);
  assert.match(source, /canvasScroller\.scrollTo\(\{/);
  assert.match(styles, /\.link-navigation-controls \{ display: grid; gap: 6px; \}/);
});
