(function () {
  'use strict';

  const vscode = acquireVsCodeApi();
  const {
    alignedCenterPositions, bestContextPadPosition, canvasViewBox, constrainedAttachedDelta, constrainedInsideDelta, edgeScrollVelocity, expandedCanvas, fittedCanvas, fullyContained,
    normalizedRectangle, snappedPointDelta, snappedResizeSize, zoomedScrollPosition
  } = window.FluigDragGeometry;
  const { defaultFlowMarkerSegment, findOrthogonalCrossings, routeOrthogonal } = window.FluigFlowRouter;
  const state = {
    data: null,
    elementById: new Map(),
    shapeById: new Map(),
    connectionById: new Map(),
    visualById: new Map(),
    contextPadById: new Map(),
    selectedId: '',
    selectedIds: [],
    zoom: 1,
    canvasBackgroundColor: '#f5f5f5',
    formInitial: {},
    remoteFormCatalogByProcess: new Map(),
    remoteFormFieldCatalogByProcess: new Map(),
    remoteBusinessPeriodCatalogByProcess: new Map(),
    remoteDesignCatalogByProcess: new Map(),
    propertyCategoryOpen: new Map(),
    renderedPropertyId: '',
    isDragging: false,
    pointerInteraction: null,
    flowEditInteraction: null,
    connectionInteraction: null,
    taskConversionMenu: null,
    taskConversionPending: false,
    taskCreationMenu: null,
    taskPlacement: null,
    containerPlacement: null,
    palettePlacement: null,
    paletteCollapsed: false,
    activeTool: 'select',
    activeSubtype: '',
    marqueeInteraction: null,
    suppressClickId: '',
    suppressCanvasClick: false,
    autoPanFrame: 0,
    pointerPreviewFrame: 0,
    routeAdjustment: null,
    canvasWidth: 0,
    canvasHeight: 0,
    canvasMinX: 0,
    canvasMinY: 0,
    layoutPreviewDirty: false,
    layoutCommitPending: false
  };
  const diagram = document.getElementById('diagram');
  const viewport = document.getElementById('viewport');
  const canvasScroller = document.getElementById('canvasScroller');
  const workspace = document.querySelector('.workspace');
  const status = document.getElementById('status');
  const propertyForm = document.getElementById('propertyForm');
  const propertiesPanel = document.getElementById('propertiesPanel');
  const elementPalette = document.getElementById('elementPalette');
  const paletteToggle = document.getElementById('togglePalette');
  const alignHorizontalButton = document.getElementById('alignHorizontal');
  const alignVerticalButton = document.getElementById('alignVertical');
  const zoomResetButton = document.getElementById('zoomReset');
  const canvasBackgroundColorInput = document.getElementById('canvasBackgroundColor');
  const routeFlowsButton = document.getElementById('routeFlows');
  const showErrorsButton = document.getElementById('showErrors');
  const validationDialog = document.getElementById('validationDialog');
  const validationDialogSummary = document.getElementById('validationDialogSummary');
  const validationProblemList = document.getElementById('validationProblemList');
  const propertyFields = document.getElementById('propertyFields');
  const rawPropertyList = document.getElementById('rawPropertyList');
  const applyButton = document.getElementById('apply');
  const deleteButton = document.getElementById('deleteElement');
  const dirtyHint = document.getElementById('dirtyHint');
  const emptyState = document.getElementById('emptyState');
  const contextPadHideTimers = new WeakMap();
  const newTaskSize = { width: 106, height: 56 };
  const newGatewaySize = { width: 60, height: 60, collisionHeight: 102 };
  const newIntermediateEventSize = { width: 35, height: 35, collisionWidth: 110, collisionHeight: 65 };
  const newEndEventSize = { width: 35, height: 35, collisionWidth: 110, collisionHeight: 65 };
  const newPoolSize = { width: 430, height: 290 };
  const newStandaloneLaneSize = { width: 301, height: 145 };
  const paletteTools = new Set(['start', 'end', 'intermediate', 'task', 'subprocess', 'gateway', 'lane', 'database', 'annotation', 'document']);
  const paletteToolDefinitions = {
    start: { label: 'Início', size: newIntermediateEventSize, visual: 'start-event' },
    end: { label: 'Fim', size: newEndEventSize, visual: 'end-event' },
    intermediate: { label: 'Intermediário', size: newIntermediateEventSize, visual: 'intermediate-event' },
    task: { label: 'Atividade', size: newTaskSize, visual: 'task' },
    subprocess: { label: 'Subprocesso', size: newTaskSize, visual: 'subprocess' },
    gateway: { label: 'Exclusivo', size: newGatewaySize, visual: 'gateway' },
    lane: { label: 'SwimLane', size: newStandaloneLaneSize, visual: 'lane' },
    database: { label: 'Database', size: { width: 70, height: 141 }, visual: 'artifact' },
    annotation: { label: 'Anotação', size: { width: 105, height: 55 }, visual: 'artifact' },
    document: { label: 'Documento', size: { width: 85, height: 115 }, visual: 'artifact' }
  };
  const paletteSubtypeDefinitions = {
    start: { '10': 'Início simples', '12': 'Início temporizador', '13': 'Início condicional', '14': 'Início por sinal', '16': 'Início múltiplo' },
    end: { '60': 'Fim simples', '63': 'Fim com erro', '64': 'Fim com sinal', '65': 'Fim cancelado', '66': 'Fim múltiplo', '68': 'Terminação imediata' },
    intermediate: { '30': 'Intermediário simples', '32': 'Timer intermediário', '35': 'Condicional intermediário', '36': 'Link intermediário', '37': 'Envio de sinal', '39': 'Múltiplo intermediário', '41': 'Recebimento de sinal', '42': 'Recebimento de link', '43': 'Captura de erro' },
    task: { '80': 'Atividade', '81': 'Atividade de usuário', '82': 'Atividade de serviço', '84': 'Envio de e-mail', '85': 'Atividade manual', '86': 'Atividade de negócio', '87': 'Atividade de script' },
    subprocess: { '100': 'Subprocesso', '101': 'Ad-Hoc' },
    gateway: { '120': 'Gateway exclusivo', '121': 'Gateway inclusivo', '126': 'Gateway paralelo', '127': 'Gateway join' }
  };
  const taskConversionOptions = [
    { type: '80', label: 'Mudar para atividade', icon: '▭' },
    { type: '81', label: 'Mudar para usuário', icon: '♙' },
    { type: '82', label: 'Mudar para serviço', icon: '⚙' },
    { type: '84', label: 'Mudar para envio', icon: '✉' },
    { type: '85', label: 'Mudar para manual', icon: '✋' },
    { type: '86', label: 'Mudar para negócio', icon: '▦' },
    { type: '87', label: 'Mudar para script', icon: '⟨⟩' }
  ];

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'model') renderModel(message.data);
    if (message.type === 'toast') showToast(message.message);
    if (message.type === 'layoutComplete') {
      state.layoutCommitPending = false;
      updateAlignmentButtons();
    }
    if (message.type === 'taskConversionCancelled') state.taskConversionPending = false;
    if (message.type === 'taskCreationCancelled') state.layoutCommitPending = false;
    if (message.type === 'containerCreationCancelled') state.layoutCommitPending = false;
    if (message.type === 'flowDeletionCancelled') {
      state.layoutCommitPending = false;
      deleteButton.disabled = false;
    }
    if (message.type === 'flowReconnectionCancelled') state.layoutCommitPending = false;
    if (message.type === 'gatewayBranchesComplete') {
      state.layoutCommitPending = false;
      propertyFields.querySelector('.gateway-conditions-apply')?.removeAttribute('disabled');
    }
    if (message.type === 'taskAssignmentComplete') {
      state.layoutCommitPending = false;
      propertyFields.querySelector('.task-assignment-apply')?.removeAttribute('disabled');
    }
    if (message.type === 'eventTriggerComplete') {
      state.layoutCommitPending = false;
      propertyFields.querySelector('.event-trigger-apply')?.removeAttribute('disabled');
    }
    if (message.type === 'eventInitializerComplete') {
      state.layoutCommitPending = false;
      propertyFields.querySelector('.event-initializer-apply')?.removeAttribute('disabled');
    }
    if (message.type === 'taskNotificationsComplete') {
      state.layoutCommitPending = false;
      propertyFields.querySelectorAll('.task-notifications-apply').forEach((button) => {
        button.removeAttribute('disabled');
      });
    }
    if (message.type === 'taskJointComplete') {
      state.layoutCommitPending = false;
      propertyFields.querySelector('.task-joint-apply')?.removeAttribute('disabled');
    }
    if (message.type === 'taskDeadlineComplete') {
      state.layoutCommitPending = false;
      propertyFields.querySelector('.task-deadline-apply')?.removeAttribute('disabled');
    }
    if (message.type === 'processGeneralComplete') {
      state.layoutCommitPending = false;
      propertyFields.querySelector('.process-general-apply')?.removeAttribute('disabled');
    }
    if (message.type === 'processVersionComplete') {
      state.layoutCommitPending = false;
      propertyFields.querySelector('.process-version-apply')?.removeAttribute('disabled');
    }
    if (message.type === 'processFormComplete') {
      state.layoutCommitPending = false;
      propertyFields.querySelector('.process-form-apply')?.removeAttribute('disabled');
    }
    if (message.type === 'processAttachmentSecurityComplete') {
      state.layoutCommitPending = false;
      propertyFields.querySelector('.process-attachment-security-apply')?.removeAttribute('disabled');
    }
    if (message.type === 'serverFormCatalogLoading') updateServerFormCatalogControls(message.elementId, null, true);
    if (message.type === 'serverFormCatalogComplete') {
      if (Array.isArray(message.forms)) {
        state.remoteFormCatalogByProcess.set(message.elementId, {
          serverId: String(message.serverId ?? ''),
          forms: message.forms
        });
      }
      updateServerFormCatalogControls(message.elementId, message.forms, false);
    }
    if (message.type === 'serverFormFieldsLoading') {
      updateServerFormFieldControls(message.elementId, message.documentId, null, true);
    }
    if (message.type === 'serverFormFieldsComplete') {
      if (Array.isArray(message.fields)) {
        state.remoteFormFieldCatalogByProcess.set(message.elementId, {
          serverId: String(message.serverId ?? ''),
          documentId: String(message.documentId ?? ''),
          fields: [...message.fields]
        });
        if (state.data) applyFormFieldsToData(state.data, message.fields);
        refreshRenderedFormFieldSelects(message.fields);
      }
      updateServerFormFieldControls(message.elementId, message.documentId, message.fields, false);
    }
    if (message.type === 'serverBusinessPeriodsLoading') {
      updateServerBusinessPeriodControls(message.elementId, null, true);
    }
    if (message.type === 'serverBusinessPeriodsComplete') {
      if (Array.isArray(message.periods)) {
        state.remoteBusinessPeriodCatalogByProcess.set(message.elementId, {
          serverId: String(message.serverId ?? ''),
          periods: message.periods.map((period) => ({ ...period }))
        });
        if (state.data) applyBusinessPeriodsToData(state.data, message.periods);
        refreshRenderedBusinessPeriodSelects(message.periods);
      }
      updateServerBusinessPeriodControls(message.elementId, message.periods, false);
    }
    if (message.type === 'serverDesignCatalogsLoading') {
      updateServerDesignCatalogControls(message.elementId, null, null, true);
    }
    if (message.type === 'serverDesignCatalogsComplete') {
      if (Array.isArray(message.mechanisms) && Array.isArray(message.volumes)) {
        state.remoteDesignCatalogByProcess.set(message.elementId, {
          serverId: String(message.serverId ?? ''),
          mechanisms: message.mechanisms.map((item) => ({ ...item })),
          volumes: message.volumes.map((item) => ({ ...item }))
        });
        if (state.data) applyServerDesignCatalogsToData(state.data, message.mechanisms, message.volumes);
        refreshRenderedServerDesignCatalogs();
      }
      updateServerDesignCatalogControls(message.elementId, message.mechanisms, message.volumes, false);
    }
    if (message.type === 'processManagerComplete') {
      state.layoutCommitPending = false;
      propertyFields.querySelector('.process-manager-apply')?.removeAttribute('disabled');
    }
    if (message.type === 'taskMobileComplete') {
      state.layoutCommitPending = false;
      propertyFields.querySelector('.task-mobile-apply')?.removeAttribute('disabled');
    }
    if (message.type === 'taskAttachmentRulesComplete') {
      state.layoutCommitPending = false;
      propertyFields.querySelector('.task-attachment-rules-apply')?.removeAttribute('disabled');
    }
    if (message.type === 'subProcessFormMapsComplete') {
      state.layoutCommitPending = false;
      propertyFields.querySelector('.subprocess-form-maps-apply')?.removeAttribute('disabled');
    }
    if (message.type === 'extendedPropertiesComplete') {
      state.layoutCommitPending = false;
      propertyFields.querySelector('.extended-properties-apply')?.removeAttribute('disabled');
    }
    if (message.type === 'elementDeletionCancelled') {
      state.layoutCommitPending = false;
      deleteButton.disabled = false;
    }
    if (message.type === 'reloadModel') vscode.postMessage({ type: 'ready' });
  });

  document.getElementById('zoomIn').addEventListener('click', () => setZoom(state.zoom + 0.1));
  alignHorizontalButton.addEventListener('click', () => alignSelectedElements('horizontal'));
  alignVerticalButton.addEventListener('click', () => alignSelectedElements('vertical'));
  document.getElementById('showProcess').addEventListener('click', () => {
    const process = state.data?.elements?.find((element) => element.tag === 'BpmnProcess');
    if (process) selectElement(process.id);
  });
  document.getElementById('zoomOut').addEventListener('click', () => setZoom(state.zoom - 0.1));
  zoomResetButton.addEventListener('click', fitDiagram);
  canvasBackgroundColorInput.addEventListener('input', () => setCanvasBackground(canvasBackgroundColorInput.value, false));
  canvasBackgroundColorInput.addEventListener('change', () => setCanvasBackground(canvasBackgroundColorInput.value));
  routeFlowsButton.addEventListener('click', adjustFlows);
  document.getElementById('generateTranslations').addEventListener('click', () => vscode.postMessage({ type: 'generateTranslations' }));
  showErrorsButton.addEventListener('click', showValidationProblems);
  document.getElementById('closeValidationDialog').addEventListener('click', () => validationDialog.close());
  validationDialog.addEventListener('click', (event) => {
    if (event.target === validationDialog) validationDialog.close();
  });
  document.getElementById('validate').addEventListener('click', () => vscode.postMessage({ type: 'validate' }));
  document.getElementById('openText').addEventListener('click', () => vscode.postMessage({ type: 'openText' }));
  document.getElementById('search').addEventListener('input', filterDiagram);
  paletteToggle.addEventListener('click', () => setPaletteCollapsed(!state.paletteCollapsed));
  propertyForm.addEventListener('input', updateDirtyState);
  propertyForm.addEventListener('change', updateDependentFields);
  propertyForm.addEventListener('change', updateDirtyState);
  propertyForm.addEventListener('submit', submitProperties);
  deleteButton.addEventListener('click', requestSelectedDeletion);
  for (const button of elementPalette.querySelectorAll('.palette-tool')) {
    button.addEventListener('click', () => activatePaletteTool(button.dataset.tool, button.dataset.subtype));
  }
  diagram.addEventListener('click', handleCanvasClick);
  diagram.addEventListener('pointerdown', beginMarqueeInteraction);
  window.addEventListener('pointermove', trackPointerInteraction);
  window.addEventListener('pointermove', trackFlowEditInteraction);
  diagram.addEventListener('pointermove', trackMarqueeInteraction);
  canvasScroller.addEventListener('wheel', handleCanvasWheel, { passive: false });
  window.addEventListener('pointerup', finishPointerInteraction);
  window.addEventListener('pointerup', finishFlowEditInteraction);
  window.addEventListener('pointerup', finishMarqueeInteraction);
  window.addEventListener('pointermove', trackConnectionInteraction);
  window.addEventListener('pointermove', trackTaskPlacement);
  window.addEventListener('pointermove', trackContainerPlacement);
  window.addEventListener('pointermove', trackPalettePlacement);
  window.addEventListener('pointerup', finishPalettePlacement);
  window.addEventListener('pointerup', finishConnectionInteraction);
  window.addEventListener('pointercancel', finishPointerInteraction);
  window.addEventListener('pointercancel', finishFlowEditInteraction);
  window.addEventListener('pointercancel', finishMarqueeInteraction);
  window.addEventListener('pointercancel', finishConnectionInteraction);
  window.addEventListener('pointercancel', () => cancelPalettePlacement(false));
  window.addEventListener('pointerdown', handleGlobalPointerDown, true);
  window.addEventListener('keydown', handleKeyDown);

  const savedViewState = vscode.getState() ?? {};
  setPaletteCollapsed(Boolean(savedViewState.paletteCollapsed), false);
  setCanvasBackground(savedViewState.canvasBackgroundColor || '#f5f5f5', false);

  vscode.postMessage({ type: 'ready' });

  function renderModel(data) {
    if (state.routeAdjustment) state.routeAdjustment.cancelled = true;
    if (validationDialog.open) validationDialog.close();
    closeTaskConversionMenu();
    closeTaskCreationMenu();
    cancelTaskPlacement(false);
    cancelContainerPlacement(false);
    cancelPalettePlacement(false);
    cancelFlowEditInteraction(false);
    setActivePaletteTool('select');
    hydrateCachedRemoteFormFields(data);
    state.data = data;
    rebuildIndexes(data);
    updateValidationProblemsButton(data);
    state.taskConversionPending = false;
    normalizeAttachedShapePositions();
    state.canvasWidth = 0;
    state.canvasHeight = 0;
    state.canvasMinX = 0;
    state.canvasMinY = 0;
    state.layoutPreviewDirty = false;
    state.layoutCommitPending = false;
    state.visualById.clear();
    state.contextPadById.clear();
    viewport.replaceChildren();
    if (!data.supported) {
      emptyState.textContent = `Formato não suportado: ${data.format}. Abra como XML para inspecionar o conteúdo.`;
      emptyState.classList.remove('hidden');
      setStatus('Formato não suportado', 'error');
      clearSelection();
      return;
    }
    emptyState.classList.add('hidden');
    renderShapes(data);
    renderConnections(data, firstForegroundNode());
    updateCanvasBounds(data);
    renderStatus(data);
    state.renderedPropertyId = '';
    const saved = vscode.getState() ?? {};
    const previousSelection = state.selectedIds.length
      ? state.selectedIds
      : Array.isArray(saved.selectedIds) ? saved.selectedIds : saved.selectedId ? [saved.selectedId] : [];
    setSelection(previousSelection.filter((id) => findElement(id)), false);
  }

  function hydrateCachedRemoteFormFields(data) {
    const process = data?.elements?.find((element) => element.tag === 'BpmnProcess');
    if (!process) return;
    if (String(process.processFormEditor?.source ?? '') === 'server') {
      const cached = state.remoteFormFieldCatalogByProcess.get(process.id);
      if (cached
        && cached.serverId === String(process.processGeneralEditor?.serverId ?? '')
        && cached.documentId === String(process.processFormEditor?.cardIndex ?? '')) {
        applyFormFieldsToData(data, cached.fields);
      }
    }
    const cachedPeriods = state.remoteBusinessPeriodCatalogByProcess.get(process.id);
    if (cachedPeriods?.serverId === String(process.processGeneralEditor?.serverId ?? '')) {
      applyBusinessPeriodsToData(data, cachedPeriods.periods);
    }
    const cachedDesignCatalog = state.remoteDesignCatalogByProcess.get(process.id);
    if (cachedDesignCatalog?.serverId === String(process.processGeneralEditor?.serverId ?? '')) {
      applyServerDesignCatalogsToData(data, cachedDesignCatalog.mechanisms, cachedDesignCatalog.volumes);
    }
  }

  function applyFormFieldsToData(data, fields) {
    const catalog = [...new Set((fields ?? []).map((field) => String(field ?? '').trim()).filter(Boolean))];
    for (const element of data?.elements ?? []) {
      for (const editorName of [
        'gatewayConditionEditor',
        'taskAssignmentEditor',
        'processManagerEditor',
        'taskMobileEditor',
        'taskAttachmentRulesEditor'
      ]) {
        if (element[editorName]) element[editorName].formFields = [...catalog];
      }
      if (element.taskDeadlineEditor) {
        const current = String(element.taskDeadlineEditor.deadlineFieldName ?? '');
        const values = [...catalog];
        if (current && !values.includes(current)) values.unshift(current);
        element.taskDeadlineEditor.formFieldOptions = values.map((value) => ({ value, label: value }));
      }
      for (const property of element.editableProperties ?? []) {
        if (property.name !== 'messageReceiver') continue;
        const values = [...catalog];
        const current = String(property.value ?? '');
        if (current && !values.includes(current)) values.unshift(current);
        property.options = values.map((value) => ({ value, label: value }));
      }
    }
  }

  function refreshRenderedFormFieldSelects(fields) {
    const catalog = [...new Set((fields ?? []).map((field) => String(field ?? '').trim()).filter(Boolean))];
    for (const select of propertyFields.querySelectorAll('select[data-config-key="formField"]')) {
      const current = String(select.value ?? '');
      select.replaceChildren();
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = catalog.length ? 'Selecione um campo' : 'Nenhum campo encontrado no formulário';
      select.append(empty);
      for (const field of catalog) {
        const option = document.createElement('option');
        option.value = field;
        option.textContent = field;
        select.append(option);
      }
      if (current && !catalog.includes(current)) {
        const legacy = document.createElement('option');
        legacy.value = current;
        legacy.textContent = `${current} (valor atual)`;
        select.append(legacy);
      }
      select.value = current;
    }
  }

  function applyBusinessPeriodsToData(data, periods) {
    const catalog = normalizeBusinessPeriodOptions(periods);
    for (const element of data?.elements ?? []) {
      if (element.processGeneralEditor) {
        element.processGeneralEditor.expedientOptions = catalogWithCurrentOption(
          catalog,
          element.processGeneralEditor.expedient
        );
      }
      if (element.taskDeadlineEditor) {
        element.taskDeadlineEditor.expedientOptions = catalogWithCurrentOption(
          catalog,
          element.taskDeadlineEditor.expedient
        );
      }
    }
  }

  function normalizeBusinessPeriodOptions(periods) {
    const output = [];
    const seen = new Set();
    for (const period of periods ?? []) {
      const value = String(period?.value ?? '').trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      output.push({ value, label: String(period?.label ?? value).trim() || value });
    }
    return output;
  }

  function catalogWithCurrentOption(catalog, currentValue) {
    const values = catalog.map((item) => ({ ...item }));
    const current = String(currentValue ?? '').trim();
    if (current && !values.some((item) => item.value === current)) {
      values.push({ value: current, label: `${current} (valor atual)` });
    }
    return values;
  }

  function refreshRenderedBusinessPeriodSelects(periods) {
    const catalog = normalizeBusinessPeriodOptions(periods);
    for (const select of propertyFields.querySelectorAll('.process-general-expedient, .task-deadline-expedient')) {
      const current = String(select.value ?? '');
      select.replaceChildren();
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = catalog.length ? 'Selecione um expediente' : 'Nenhum expediente encontrado no servidor';
      select.append(empty);
      appendSelectOptions(select, catalogWithCurrentOption(catalog, current));
      select.value = current;
    }
  }

  function applyServerDesignCatalogsToData(data, mechanisms, volumes) {
    const mechanismCatalog = normalizeCatalogOptions(mechanisms);
    const volumeCatalog = normalizeCatalogOptions(volumes);
    for (const element of data?.elements ?? []) {
      for (const editorName of ['processManagerEditor', 'taskAssignmentEditor', 'processAttachmentSecurityEditor']) {
        const editor = element[editorName];
        if (!editor) continue;
        const usedMechanisms = editor.rules
          ? editor.rules.map((rule) => rule.mechanism)
          : [editor.mechanism];
        editor.mechanisms = mergeMechanismOptions(editor.mechanisms, mechanismCatalog, usedMechanisms);
      }
      const gatewayEditor = element.gatewayConditionEditor;
      if (gatewayEditor?.mechanisms) {
        gatewayEditor.mechanisms = mergeMechanismOptions(
          gatewayEditor.mechanisms,
          mechanismCatalog,
          (gatewayEditor.conditions ?? []).map((condition) => condition.mechanism)
        );
      }
      if (element.processGeneralEditor) {
        element.processGeneralEditor.volumeOptions = catalogWithCurrentOption(
          volumeCatalog,
          element.processGeneralEditor.volume
        );
      }
    }
  }

  function normalizeCatalogOptions(items) {
    const output = [];
    const seen = new Set();
    for (const item of items ?? []) {
      const value = String(item?.value ?? '').trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      output.push({ value, label: String(item?.label ?? value).trim() || value });
    }
    return output;
  }

  function mergeMechanismOptions(existingOptions, remoteCatalog, usedValues) {
    const standards = (existingOptions ?? []).filter((item) => item.kind !== 'custom');
    const standardByValue = new Map(standards.map((item) => [String(item.value ?? ''), item]));
    const result = standards.map((item) => ({ ...item }));
    const included = new Set(result.map((item) => String(item.value ?? '')));
    for (const item of remoteCatalog) {
      const standard = standardByValue.get(item.value);
      if (standard) {
        const target = result.find((entry) => entry.value === item.value);
        if (target && item.label) target.label = item.label;
        continue;
      }
      if (included.has(item.value)) continue;
      included.add(item.value);
      result.push({ ...item, kind: 'custom' });
    }
    for (const rawValue of usedValues ?? []) {
      const value = String(rawValue ?? '').trim();
      if (!value || included.has(value)) continue;
      included.add(value);
      result.push({ value, label: `${value} (valor atual)`, kind: 'custom' });
    }
    return result;
  }

  function refreshRenderedServerDesignCatalogs() {
    if (state.selectedIds.length !== 1) return;
    const element = findElement(state.selectedIds[0]);
    const editor = element?.processManagerEditor
      ?? element?.taskAssignmentEditor
      ?? element?.processAttachmentSecurityEditor
      ?? element?.gatewayConditionEditor;
    const mechanisms = editor?.mechanisms ?? [];
    for (const select of propertyFields.querySelectorAll('.gateway-mechanism-select')) {
      const current = String(select.value ?? '');
      select.replaceChildren();
      for (const mechanism of mechanisms) {
        const option = document.createElement('option');
        option.value = mechanism.value;
        option.dataset.kind = mechanism.kind;
        option.textContent = mechanism.label;
        select.append(option);
      }
      if (current && !mechanisms.some((item) => item.value === current)) {
        const legacy = document.createElement('option');
        legacy.value = current;
        legacy.dataset.kind = 'custom';
        legacy.textContent = `${current} (valor atual)`;
        select.append(legacy);
      }
      select.value = current;
      const configure = select.closest('.gateway-condition-mechanism')?.querySelector('.gateway-mechanism-configure');
      if (configure) {
        configure.disabled = select.disabled || !select.value || select.selectedOptions[0]?.dataset.kind === 'custom';
      }
    }
    const volume = propertyFields.querySelector('.process-general-volume');
    const volumeOptions = element?.processGeneralEditor?.volumeOptions ?? [];
    if (volume) {
      const current = String(volume.value ?? '');
      volume.replaceChildren();
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = volumeOptions.length ? 'Selecione um volume' : 'Nenhum volume encontrado no servidor';
      volume.append(empty);
      appendSelectOptions(volume, catalogWithCurrentOption(volumeOptions, current));
      volume.value = current;
    }
  }

  function renderConnections(data, beforeNode = null, connectionIds = null, renderBridges = true) {
    const selected = connectionIds ? new Set(connectionIds) : null;
    const connections = selected
      ? data.connections.filter((connection) => selected.has(connection.businessObject))
      : data.connections;
    const routes = connections.map((connection) => ({
      id: connection.businessObject,
      connection,
      points: connectionPoints(connection)
    })).filter((route) => route.points.length >= 2);
    const crossings = renderBridges ? findOrthogonalCrossings(routes) : new Map();
    for (const route of routes) {
      const { connection, points } = route;
      const pathData = bridgedPathData(points, crossings.get(route.id) ?? []);
      const hitboxData = straightPathData(points);
      const element = findElement(connection.businessObject);
      const permitsReturn = element?.attributes.permiteRetorno === 'true';
      const automatic = element?.attributes.fluxoAutomatico === 'true';
      const defaultLink = element?.attributes.defaultLink === 'true';
      const sourceElement = findElement(connection.sourceRef);
      const documentaryAssociation = ['BpmnAnnotation', 'BpmnDatabase', 'BpmnDocument'].includes(sourceElement?.tag);
      const flowClass = `flow${documentaryAssociation ? ' documentary-association' : ''}${permitsReturn ? ' return-flow' : ''}${automatic ? ' automatic-flow' : ''}`;
      const marker = documentaryAssociation ? '' : (automatic ? 'url(#arrowAutomatic)' : permitsReturn ? 'url(#arrowReturn)' : 'url(#arrow)');
      const group = svg('g', { class: 'flow-group', 'data-id': connection.businessObject });
      const hitbox = svg('path', { d: hitboxData, class: 'flow-hitbox' });
      const pathAttributes = { d: pathData, class: flowClass, id: `visual-${connection.businessObject}` };
      if (marker) pathAttributes['marker-end'] = marker;
      if (permitsReturn && marker) pathAttributes['marker-start'] = marker;
      const path = svg('path', pathAttributes);
      group.append(path, hitbox);
      if (defaultLink) addDefaultFlowMarker(group, points, permitsReturn, automatic);
      const middle = polylineMidpoint(points);
      if (automatic) addAutomaticClock(group, middle);
      if (element?.name) {
        const labelClass = `flow-label${permitsReturn ? ' return-flow-label' : ''}${automatic ? ' automatic-flow-label' : ''}`;
        const label = svg('text', { x: middle.x, y: middle.y - 9, class: labelClass });
        label.textContent = element.name;
        group.append(label);
      }
      group.addEventListener('click', (event) => handleElementClick(event, connection.businessObject));
      state.visualById.set(connection.businessObject, group);
      if (beforeNode) viewport.insertBefore(group, beforeNode); else viewport.append(group);
    }
  }

  function addDefaultFlowMarker(group, points, permitsReturn, automatic) {
    const segment = defaultFlowMarkerSegment(points);
    if (!segment) return;
    const markerClass = `default-flow-marker${permitsReturn ? ' return-default-flow-marker' : ''}${automatic ? ' automatic-default-flow-marker' : ''}`;
    group.append(svg('line', {
      x1: segment.start.x,
      y1: segment.start.y,
      x2: segment.end.x,
      y2: segment.end.y,
      class: markerClass
    }));
  }

  function straightPathData(points) {
    return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  }

  function bridgedPathData(points, crossings) {
    const bySegment = new Map();
    for (const crossing of crossings) {
      const values = bySegment.get(crossing.segmentIndex) ?? [];
      values.push(crossing.point);
      bySegment.set(crossing.segmentIndex, values);
    }
    let data = `M ${points[0].x} ${points[0].y}`;
    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1];
      const to = points[index];
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy);
      const unitX = length ? dx / length : 0;
      const unitY = length ? dy / length : 0;
      let normalX = -unitY;
      let normalY = unitX;
      const flipNormal = Math.abs(normalY) > 0.1 ? normalY > 0 : normalX < 0;
      if (flipNormal) {
        normalX *= -1;
        normalY *= -1;
      }
      const ordered = [...(bySegment.get(index - 1) ?? [])].sort((left, right) => (
        (((left.x - from.x) * unitX) + ((left.y - from.y) * unitY))
          - (((right.x - from.x) * unitX) + ((right.y - from.y) * unitY))
      ));
      for (const point of ordered) {
        data += ` L ${point.x - (unitX * 6)} ${point.y - (unitY * 6)}`;
        data += ` Q ${point.x + (normalX * 6)} ${point.y + (normalY * 6)} ${point.x + (unitX * 6)} ${point.y + (unitY * 6)}`;
      }
      data += ` L ${to.x} ${to.y}`;
    }
    return data;
  }

  function connectionPoints(connection) {
    const sourceShape = previewShape(findShape(connection.sourceRef), connection.sourceRef);
    const targetShape = previewShape(findShape(connection.targetRef), connection.targetRef);
    if (!sourceShape || !targetShape) {
      return connection.source && connection.target
        ? [connection.source, ...connection.bendpoints, connection.target]
        : [];
    }

    const pointer = state.pointerInteraction;
    const movingSource = pointer?.moved && pointer.dragIds.includes(connection.sourceRef);
    const movingTarget = pointer?.moved && pointer.dragIds.includes(connection.targetRef);
    const routed = pointer?.routedBendpoints?.get(connection.businessObject);
    const sourceBendpoints = routed ?? connection.bendpoints;
    const bendpoints = sourceBendpoints.map((point) => (
      !routed && movingSource && movingTarget
        ? { x: point.x + pointer.delta.x, y: point.y + pointer.delta.y }
        : { ...point }
    ));
    const sourceElement = findElement(connection.sourceRef);
    const targetElement = findElement(connection.targetRef);
    const sourceCenter = shapeCenter(sourceShape, sourceElement);
    const targetCenter = shapeCenter(targetShape, targetElement);
    const firstDirection = bendpoints[0] ?? targetCenter;
    const lastDirection = bendpoints.at(-1) ?? sourceCenter;
    return [
      clientBoundaryPoint(sourceShape, sourceElement, firstDirection),
      ...bendpoints,
      clientBoundaryPoint(targetShape, targetElement, lastDirection)
    ];
  }

  function previewShape(shape, id) {
    if (!shape) return null;
    const pointer = state.pointerInteraction;
    if (!pointer?.moved || !pointer.dragIds.includes(id)) return shape;
    return { ...shape, x: shape.x + pointer.delta.x, y: shape.y + pointer.delta.y };
  }

  function shapeCenter(shape, element) {
    const size = effectiveSize(shape, element);
    return { x: shape.x + size.width / 2, y: shape.y + size.height / 2 };
  }

  function clientBoundaryPoint(shape, element, toward) {
    const size = effectiveSize(shape, element);
    const origin = shapeCenter(shape, element);
    const dx = toward.x - origin.x;
    const dy = toward.y - origin.y;
    if (dx === 0 && dy === 0) return origin;
    let scale;
    if (element?.tag?.includes('Event')) {
      scale = (Math.min(size.width, size.height) / 2) / Math.hypot(dx, dy);
    } else if (element?.tag === 'BpmnGateway') {
      scale = 1 / ((Math.abs(dx) / (size.width / 2)) + (Math.abs(dy) / (size.height / 2)));
    } else {
      const horizontal = dx === 0 ? Number.POSITIVE_INFINITY : (size.width / 2) / Math.abs(dx);
      const vertical = dy === 0 ? Number.POSITIVE_INFINITY : (size.height / 2) / Math.abs(dy);
      scale = Math.min(horizontal, vertical);
    }
    return { x: origin.x + (dx * scale), y: origin.y + (dy * scale) };
  }

  function polylineMidpoint(points) {
    const segments = points.slice(1).map((point, index) => ({
      from: points[index],
      to: point,
      length: Math.hypot(point.x - points[index].x, point.y - points[index].y)
    }));
    const total = segments.reduce((sum, segment) => sum + segment.length, 0);
    let remaining = total / 2;
    for (const segment of segments) {
      if (remaining <= segment.length) {
        const ratio = segment.length === 0 ? 0 : remaining / segment.length;
        return {
          x: segment.from.x + ((segment.to.x - segment.from.x) * ratio),
          y: segment.from.y + ((segment.to.y - segment.from.y) * ratio)
        };
      }
      remaining -= segment.length;
    }
    return points[0] ?? { x: 0, y: 0 };
  }

  function addAutomaticClock(group, point) {
    group.append(svg('circle', { cx: point.x, cy: point.y, r: 9, class: 'automatic-clock' }));
    group.append(svg('line', { x1: point.x, y1: point.y, x2: point.x, y2: point.y - 5, class: 'automatic-clock-hand' }));
    group.append(svg('line', { x1: point.x, y1: point.y, x2: point.x + 4, y2: point.y + 2, class: 'automatic-clock-hand' }));
  }

  function addErrorBadge(group, x, y) {
    const badge = svg('g', { class: 'validation-error-badge', 'aria-label': 'Elemento com erro de configuração' });
    badge.append(svg('circle', { cx: x, cy: y, r: 7.5 }));
    badge.append(svg('line', { x1: x - 3.3, y1: y - 3.3, x2: x + 3.3, y2: y + 3.3 }));
    badge.append(svg('line', { x1: x + 3.3, y1: y - 3.3, x2: x - 3.3, y2: y + 3.3 }));
    group.append(badge);
  }

  function renderShapes(data) {
    const layers = [...data.shapes].sort((a, b) => shapeLayer(a.businessObject) - shapeLayer(b.businessObject));
    const groups = new Map();
    const contextPads = [];
    for (const shape of layers) {
      const element = findElement(shape.businessObject);
      if (!element) continue;
      const group = svg('g', { class: `node ${shapeClass(element)}`, 'data-id': element.id, tabindex: '0' });
      const parentId = attachedParentId(element);
      if (parentId) {
        group.classList.add('attached-boundary-event');
        group.setAttribute('data-parent-id', parentId);
      }
      const issueDetails = element.configurationIssues?.length ? `\nErros:\n- ${element.configurationIssues.join('\n- ')}` : '';
      group.setAttribute('aria-label', `${element.typeLabel}: ${element.name || element.id} (${element.id})${issueDetails}`);
      drawShape(group, shape, element);
      addElementCode(group, shape, element);
      addResizeHandle(group, shape, element);
      if (element.configurationIssues?.length) {
        const badgePosition = errorBadgePosition(shape, element);
        addErrorBadge(group, badgePosition.x, badgePosition.y);
      }
      const contextPad = addContextPad(group, shape, element);
      if (contextPad) {
        contextPads.push(contextPad);
        state.contextPadById.set(element.id, contextPad);
        group.addEventListener('pointerenter', () => showContextPad(group));
        group.addEventListener('pointerleave', () => scheduleContextPadHide(group));
        group.addEventListener('focus', () => showContextPad(group));
        group.addEventListener('blur', () => scheduleContextPadHide(group));
      }
      group.addEventListener('pointerdown', (event) => beginPointerInteraction(event, element.id));
      group.addEventListener('click', (event) => handleElementClick(event, element.id));
      if (canStartConnection(element)) {
        group.addEventListener('contextmenu', (event) => openTaskCreationMenu(event, element, group));
      }
      group.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') selectElement(element.id, selectionModifier(event));
      });
      groups.set(element.id, group);
      state.visualById.set(element.id, group);
    }
    for (const shape of layers) {
      const element = findElement(shape.businessObject);
      const group = groups.get(shape.businessObject);
      if (!element || !group) continue;
      const parent = groups.get(attachedParentId(element));
      if (parent) parent.append(group); else viewport.append(group);
    }
    if (contextPads.length) {
      const overlay = svg('g', { class: 'context-pad-layer', 'aria-label': 'Ações dos elementos' });
      overlay.append(...contextPads);
      viewport.append(overlay);
    }
  }

  function addResizeHandle(group, shape, element) {
    if (!['BpmnPool', 'BpmnSwimLane'].includes(element.tag)) return;
    const { width, height } = effectiveSize(shape, element);
    const x = shape.x + width;
    const y = shape.y + height;
    const handle = svg('g', {
      class: 'resize-handle',
      'aria-label': `Redimensionar ${element.typeLabel}`,
      role: 'button'
    });
    handle.append(svg('rect', { x: x - 8, y: y - 8, width: 16, height: 16, rx: 2 }));
    handle.append(svg('path', { d: `M ${x - 4} ${y + 4} L ${x + 4} ${y - 4} M ${x} ${y + 4} L ${x + 4} ${y}` }));
    handle.addEventListener('pointerdown', (event) => beginResizeInteraction(event, element.id));
    group.append(handle);
  }

  function addContextPad(group, shape, element) {
    const canConnect = canStartConnection(element);
    const canDelete = isContextPadDeletable(element);
    if (!canConnect && !canDelete) return null;
    const { width, height } = effectiveSize(shape, element);
    const taskActions = element.tag === 'BpmnTask';
    const padWidth = (taskActions ? 32 : 0) + (canConnect ? 64 : 0) + (canDelete ? 32 : 0);
    const padPosition = contextPadPosition(shape, element, padWidth, { width, height });
    const { x, y } = padPosition;
    const pad = svg('g', {
      class: 'context-pad',
      'aria-label': `Ações de ${element.name || element.id}`
    });
    pad.append(svg('rect', { x, y, width: padWidth, height: 24, rx: 5, ry: 5, class: 'context-pad-body' }));
    let createX = x;
    if (canDelete) {
      const trashX = createX;
      createX += 32;
      const trash = svg('g', {
        class: 'context-pad-action context-pad-delete',
        role: 'button',
        'aria-label': `Excluir ${element.name || element.id}`
      });
      trash.append(svg('rect', { x: trashX, y, width: 32, height: 24, class: 'context-pad-hit' }));
      trash.append(svg('path', {
        d: `M ${trashX + 11} ${y + 8} L ${trashX + 21} ${y + 8} L ${trashX + 20} ${y + 19} L ${trashX + 12} ${y + 19} Z M ${trashX + 9} ${y + 6} L ${trashX + 23} ${y + 6} M ${trashX + 14} ${y + 4} L ${trashX + 18} ${y + 4}`,
        class: 'context-pad-delete-icon'
      }));
      trash.addEventListener('pointerdown', stopContextAction);
      trash.addEventListener('click', (event) => requestContextPadDeletion(event, element));
      pad.append(trash);
      if (taskActions || canConnect) {
        pad.append(svg('line', { x1: createX, y1: y + 2, x2: createX, y2: y + 22, class: 'context-pad-separator' }));
      }
    }
    if (taskActions) {
      const pencilX = createX;
      createX += 32;
      pad.append(svg('line', { x1: createX, y1: y + 2, x2: createX, y2: y + 22, class: 'context-pad-separator' }));
      const pencil = svg('g', {
        class: 'context-pad-action context-pad-pencil',
        role: 'button',
        'aria-label': `Mudar o tipo de ${element.name || element.id}`
      });
      pencil.append(svg('rect', { x: pencilX, y, width: 32, height: 24, class: 'context-pad-hit' }));
      pencil.append(svg('path', {
        d: `M ${pencilX + 9} ${y + 17} L ${pencilX + 11} ${y + 11} L ${pencilX + 20} ${y + 4} L ${pencilX + 24} ${y + 8} L ${pencilX + 15} ${y + 15} Z`,
        class: 'context-pad-pencil-icon'
      }));
      pencil.addEventListener('pointerdown', stopContextAction);
      pencil.addEventListener('click', (event) => openTaskConversionMenu(event, element, group));
      pad.append(pencil);
    }
    if (canConnect) {
    const create = svg('g', {
      class: 'context-pad-action context-pad-create',
      role: 'button',
      'aria-label': `Criar novo elemento conectado a ${element.name || element.id}`
    });
    create.append(svg('rect', { x: createX, y, width: 32, height: 24, class: 'context-pad-hit' }));
    create.append(svg('rect', { x: createX + 8, y: y + 6, width: 14, height: 11, rx: 1, class: 'context-pad-create-icon' }));
    create.append(svg('line', { x1: createX + 19, y1: y + 4, x2: createX + 19, y2: y + 10, class: 'context-pad-create-plus' }));
    create.append(svg('line', { x1: createX + 16, y1: y + 7, x2: createX + 22, y2: y + 7, class: 'context-pad-create-plus' }));
    create.addEventListener('pointerdown', stopContextAction);
    create.addEventListener('click', (event) => openTaskCreationMenu(event, element, group));
    pad.append(create);
    const arrowX = createX + 33;
    pad.append(svg('line', { x1: arrowX, y1: y + 2, x2: arrowX, y2: y + 22, class: 'context-pad-separator' }));
    const arrow = svg('g', {
      class: 'context-pad-action context-pad-connect',
      role: 'button',
      'aria-label': `Criar fluxo a partir de ${element.name || element.id}`
    });
    arrow.append(svg('rect', { x: arrowX, y, width: 31, height: 24, class: 'context-pad-hit' }));
    arrow.append(svg('line', { x1: arrowX + 7, y1: y + 12, x2: arrowX + 22, y2: y + 12, class: 'context-pad-arrow' }));
    arrow.append(svg('polyline', { points: `${arrowX + 17},${y + 7} ${arrowX + 23},${y + 12} ${arrowX + 17},${y + 17}`, class: 'context-pad-arrow' }));
    arrow.addEventListener('pointerdown', (event) => beginConnectionInteraction(event, element.id));
    pad.append(arrow);
    }
    pad.addEventListener('pointerenter', () => showContextPad(group));
    pad.addEventListener('pointerleave', () => scheduleContextPadHide(group));
    return pad;
  }

  function contextPadPosition(shape, element, padWidth, size) {
    if (!isAttachedBoundaryEvent(element)) {
      return { x: shape.x + size.width - padWidth, y: shape.y + size.height, placement: 'bottom' };
    }
    const parentShape = findShape(attachedParentId(element));
    const anchor = shapeBounds(shape);
    const parentBounds = parentShape ? shapeBounds(parentShape) : null;
    const preferredEdge = parentBounds ? nearestContainingEdge(anchor, parentBounds) : 'left';
    const obstacles = (state.data?.shapes ?? [])
      .filter((candidate) => candidate.businessObject !== shape.businessObject)
      .filter((candidate) => !['BpmnPool', 'BpmnSwimLane', 'BpmnGroup'].includes(findElement(candidate.businessObject)?.tag))
      .map(shapeBounds);
    return bestContextPadPosition({
      anchor,
      panel: { width: padWidth, height: 24 },
      obstacles,
      preferredEdge,
      canvas: {
        right: Math.max(1000, state.canvasWidth || 0, Number(state.data?.canvas?.width) || 0),
        bottom: Math.max(800, state.canvasHeight || 0, Number(state.data?.canvas?.height) || 0)
      }
    });
  }

  function nearestContainingEdge(child, parent) {
    const distances = [
      ['left', Math.abs(child.left - parent.left)],
      ['right', Math.abs(child.right - parent.right)],
      ['top', Math.abs(child.top - parent.top)],
      ['bottom', Math.abs(child.bottom - parent.bottom)]
    ];
    distances.sort((first, second) => first[1] - second[1]);
    return distances[0][0];
  }

  function requestContextPadDeletion(event, element) {
    event.preventDefault();
    event.stopPropagation();
    if (state.layoutCommitPending || state.isDragging) return;
    if (!(state.selectedIds.length > 1 && state.selectedIds.includes(element.id))) selectElement(element.id);
    requestSelectedDeletion();
  }

  function stopContextAction(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function openTaskConversionMenu(event, element, group) {
    event.preventDefault();
    event.stopPropagation();
    if (state.layoutCommitPending || state.taskConversionPending) return;
    selectElement(element.id);
    closeTaskConversionMenu();
    showContextPad(group);
    const menu = document.createElement('div');
    menu.className = 'task-convert-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', `Mudar o tipo de ${element.name || element.id}`);
    for (const option of taskConversionOptions.filter((item) => item.type !== element.type)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.targetType = option.type;
      button.setAttribute('role', 'menuitem');
      const icon = document.createElement('span');
      icon.className = 'task-convert-menu-icon';
      icon.textContent = option.icon;
      const label = document.createElement('span');
      label.textContent = option.label;
      button.append(icon, label);
      button.addEventListener('pointerdown', (pointerEvent) => pointerEvent.stopPropagation());
      button.addEventListener('click', () => requestTaskConversion(element.id, option.type));
      menu.append(button);
    }
    document.body.append(menu);
    const left = Math.max(8, Math.min(event.clientX, window.innerWidth - menu.offsetWidth - 8));
    const top = Math.max(8, Math.min(event.clientY + 6, window.innerHeight - menu.offsetHeight - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    state.taskConversionMenu = { node: menu, group };
  }

  function requestTaskConversion(taskId, targetType) {
    if (state.taskConversionPending) return;
    state.taskConversionPending = true;
    closeTaskConversionMenu();
    vscode.postMessage({ type: 'convertTask', taskId, targetType });
    showToast('Aguardando confirmação para mudar o tipo da atividade...');
  }

  function closeTaskConversionMenu() {
    state.taskConversionMenu?.node?.remove();
    state.taskConversionMenu = null;
  }

  function openTaskCreationMenu(event, element, group) {
    event.preventDefault();
    event.stopPropagation();
    if (state.layoutCommitPending || state.connectionInteraction || state.taskPlacement || state.containerPlacement) return;
    selectElement(element.id);
    closeTaskConversionMenu();
    closeTaskCreationMenu();
    showContextPad(group);
    const menu = document.createElement('div');
    menu.className = 'task-convert-menu task-create-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', `Criar elemento conectado a ${element.name || element.id}`);
    const options = [
      { kind: 'flow', icon: '→', label: 'Novo fluxo' },
      { kind: 'task', icon: '▭', label: 'Nova atividade' },
      { kind: 'gateway', icon: '◇', label: 'Novo gateway' },
      { kind: 'intermediate-event', icon: '◎', label: 'Novo evento intermediário' },
      { kind: 'end-event', icon: '●', label: 'Novo evento final' }
    ];
    for (const option of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      const icon = document.createElement('span');
      icon.className = 'task-convert-menu-icon';
      icon.textContent = option.icon;
      const label = document.createElement('span');
      label.textContent = option.label;
      button.append(icon, label);
      button.addEventListener('pointerdown', (pointerEvent) => pointerEvent.stopPropagation());
      button.addEventListener('click', (clickEvent) => {
        if (option.kind === 'flow') beginClickConnectionPlacement(clickEvent, element.id);
        else beginTaskPlacement(element.id, option.kind);
      });
      menu.append(button);
    }
    document.body.append(menu);
    const left = Math.max(8, Math.min(event.clientX, window.innerWidth - menu.offsetWidth - 8));
    const top = Math.max(8, Math.min(event.clientY + 6, window.innerHeight - menu.offsetHeight - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    state.taskCreationMenu = { node: menu, group };
  }

  function closeTaskCreationMenu() {
    state.taskCreationMenu?.node?.remove();
    state.taskCreationMenu = null;
  }

  function beginLaneCreation() {
    if (!state.data?.supported || state.layoutCommitPending || state.isDragging) return;
    const selected = state.selectedIds.length === 1 ? findElement(state.selectedIds[0]) : null;
    const selectedShape = selected ? findShape(selected.id) : null;
    const poolId = selected?.tag === 'BpmnPool'
      ? selected.id
      : (selected?.tag === 'BpmnSwimLane' ? selectedShape?.parentBusinessObject : '');
    if (poolId) {
      state.layoutCommitPending = true;
      vscode.postMessage({ type: 'createSwimLane', lane: { poolId } });
      showToast(`Criando uma nova raia e redistribuindo o espaço de ${poolId}...`);
      return;
    }
    beginContainerPlacement('lane');
  }

  function beginContainerPlacement(kind) {
    if (!state.data?.supported || state.layoutCommitPending || state.isDragging) return;
    cancelTaskPlacement(false);
    cancelContainerPlacement(false);
    cancelPalettePlacement(false);
    setActivePaletteTool('select');
    const size = kind === 'pool' ? newPoolSize : newStandaloneLaneSize;
    const ghost = svg('g', {
      class: `node ${kind === 'pool' ? 'pool' : 'lane'} container-placement-ghost`,
      'aria-label': kind === 'pool' ? 'Posição da nova pool' : 'Posição da nova raia independente'
    });
    const body = svg('rect', { width: size.width, height: size.height, class: 'body' });
    const separator = svg('line', { x1: 30, y1: 0, x2: 30, y2: size.height, class: 'container-placement-separator' });
    const label = svg('text', { class: 'label container-label', 'text-anchor': 'middle' });
    label.textContent = kind === 'pool' ? 'Pool' : 'SwimLane';
    ghost.append(body, separator, label);
    viewport.append(ghost);
    state.containerPlacement = {
      kind,
      size,
      currentPointer: { x: 0, y: 0 },
      position: null,
      ghost,
      body,
      separator,
      label
    };
    state.isDragging = true;
    updatePropertiesVisibility();
    showToast(`Mova o mouse e clique em uma área livre para posicionar ${kind === 'pool' ? 'a nova pool' : 'a nova raia'}. Escape cancela.`);
  }

  function trackContainerPlacement(event) {
    const placement = state.containerPlacement;
    if (!placement) return;
    placement.currentPointer = { x: event.clientX, y: event.clientY };
    const point = diagramPointFromClient(placement.currentPointer);
    const x = Math.max(0, Math.round((point.x - (placement.size.width / 2)) / 10) * 10);
    const y = Math.max(0, Math.round((point.y - (placement.size.height / 2)) / 10) * 10);
    placement.position = { x, y };
    placement.body.setAttribute('x', String(x));
    placement.body.setAttribute('y', String(y));
    placement.separator.setAttribute('x1', String(x + 30));
    placement.separator.setAttribute('x2', String(x + 30));
    placement.separator.setAttribute('y1', String(y));
    placement.separator.setAttribute('y2', String(y + placement.size.height));
    const labelX = x + 15;
    const labelY = y + (placement.size.height / 2);
    placement.label.setAttribute('x', String(labelX));
    placement.label.setAttribute('y', String(labelY));
    placement.label.setAttribute('transform', `rotate(-90 ${labelX} ${labelY})`);
    setPlacementValidity(placement, !containerPlacementCollision(placement.position, placement.size));
    scheduleAutoPan();
  }

  function finishContainerPlacement(event) {
    const placement = state.containerPlacement;
    if (!placement || !placement.position) return false;
    if (containerPlacementCollision(placement.position, placement.size)) {
      showToast('Escolha uma área livre, sem sobrepor elementos existentes.');
      return true;
    }
    const request = { ...placement.position, ...placement.size };
    const kind = placement.kind;
    completeContainerPlacement();
    state.layoutCommitPending = true;
    if (kind === 'pool') {
      vscode.postMessage({ type: 'createPool', pool: request });
      showToast('Criando a pool vazia no arquivo .process...');
    } else {
      vscode.postMessage({ type: 'createSwimLane', lane: request });
      showToast('Criando a raia independente no arquivo .process...');
    }
    event?.preventDefault?.();
    event?.stopPropagation?.();
    return true;
  }

  function containerPlacementCollision(position, size) {
    const candidate = { left: position.x, top: position.y, right: position.x + size.width, bottom: position.y + size.height };
    return state.data.shapes.some((shape) => {
      const bounds = shapeBounds(shape);
      return candidate.left < bounds.right
        && candidate.right > bounds.left
        && candidate.top < bounds.bottom
        && candidate.bottom > bounds.top;
    });
  }

  function completeContainerPlacement() {
    if (!state.containerPlacement) return;
    cancelAutoPan();
    state.containerPlacement.ghost.remove();
    state.containerPlacement = null;
    state.isDragging = false;
    updatePropertiesVisibility();
  }

  function cancelContainerPlacement(showMessage = true) {
    if (!state.containerPlacement) return false;
    completeContainerPlacement();
    if (showMessage) showToast('Criação do container cancelada.');
    return true;
  }

  function activatePaletteTool(tool, subtype = '') {
    if (!tool || !state.data?.supported || state.layoutCommitPending) return;
    if (tool === 'pool') {
      beginContainerPlacement('pool');
      return;
    }
    cancelTaskPlacement(false);
    cancelContainerPlacement(false);
    cancelPalettePlacement(false);
    closeTaskCreationMenu();
    closeTaskConversionMenu();
    setActivePaletteTool(tool, subtype);
    if (paletteTools.has(tool)) beginPalettePlacement(tool, subtype);
  }

  function setActivePaletteTool(tool, subtype = '') {
    state.activeTool = tool;
    state.activeSubtype = String(subtype || '');
    for (const button of elementPalette.querySelectorAll('.palette-tool')) {
      const sameTool = button.dataset.tool === tool;
      const sameSubtype = String(button.dataset.subtype || '') === state.activeSubtype;
      button.classList.toggle('active', sameTool && sameSubtype);
    }
    canvasScroller.classList.toggle('tool-place', paletteTools.has(tool));
    canvasScroller.classList.toggle('tool-marquee', tool === 'marquee');
  }

  function beginPalettePlacement(kind, subtype = '') {
    const baseDefinition = paletteToolDefinitions[kind];
    const normalizedSubtype = String(subtype || defaultPaletteSubtype(kind));
    const definition = baseDefinition && {
      ...baseDefinition,
      label: paletteSubtypeDefinitions[kind]?.[normalizedSubtype] || baseDefinition.label
    };
    if (!definition) return;
    const ghost = svg('g', {
      class: `node palette-placement-ghost ${definition.visual}`,
      'aria-label': `Posição do novo elemento ${definition.label}`
    });
    const body = createPalettePlacementBody(definition);
    const external = ['gateway', 'start-event', 'end-event', 'intermediate-event'].includes(definition.visual);
    const label = svg('text', { class: `label${external ? ' external-label' : ''}`, 'text-anchor': 'middle' });
    label.textContent = definition.label;
    ghost.append(body);
    addPalettePlacementMarker(ghost, kind, normalizedSubtype, definition.size);
    ghost.append(label);
    viewport.append(ghost);
    state.palettePlacement = {
      kind,
      subtype: normalizedSubtype,
      definition,
      size: definition.size,
      currentPointer: { x: 0, y: 0 },
      position: null,
      ghost,
      label
    };
    state.isDragging = true;
    updatePropertiesVisibility();
    showToast(`Posicione ${definition.label} em uma área livre do diagrama. Escape cancela.`);
  }

  function defaultPaletteSubtype(kind) {
    return ({ start: '10', end: '60', intermediate: '30', task: '80', subprocess: '100', gateway: '120' })[kind] || '';
  }

  function addPalettePlacementMarker(group, kind, subtype, size) {
    const centerX = size.width / 2;
    const centerY = size.height / 2;
    if (kind === 'start') addEventMarker(group, { tag: 'BpmnStartEvent', type: subtype }, centerX, centerY);
    if (kind === 'end') addEventMarker(group, { tag: 'BpmnEndEvent', type: subtype }, centerX, centerY);
    if (kind === 'intermediate') addEventMarker(group, { tag: 'BpmnIntermediateEvent', type: subtype }, centerX, centerY);
    if (kind === 'gateway') addGatewayMarker(group, { type: subtype }, centerX, centerY);
    if (kind === 'task') addTaskMarker(group, { type: subtype }, 12, 12);
    if (kind === 'subprocess') addSubProcessMarker(group, { type: subtype }, size.width / 2, size.height - 7);
  }

  function createPalettePlacementBody(definition) {
    const { width, height } = definition.size;
    if (definition.visual === 'gateway') {
      return svg('polygon', { points: `${width / 2},0 ${width},${height / 2} ${width / 2},${height} 0,${height / 2}`, class: 'body' });
    }
    if (definition.visual === 'start-event') {
      return svg('circle', { cx: width / 2, cy: height / 2, r: 15.5, class: 'body event-outer palette-start-event' });
    }
    if (definition.visual === 'end-event') {
      return svg('circle', { cx: width / 2, cy: height / 2, r: 15.5, class: 'body event-outer palette-end-event' });
    }
    if (definition.visual === 'intermediate-event') {
      const group = svg('g', { class: 'event-placement-body' });
      group.append(
        svg('circle', { cx: width / 2, cy: height / 2, r: 15.5, class: 'body event-outer palette-intermediate-event' }),
        svg('circle', { cx: width / 2, cy: height / 2, r: 12, class: 'event-inner' })
      );
      return group;
    }
    const attributes = { width, height, class: 'body' };
    if (definition.visual === 'task' || definition.visual === 'subprocess') attributes.rx = 6;
    return svg('rect', attributes);
  }

  function trackPalettePlacement(event) {
    const placement = state.palettePlacement;
    if (!placement) return;
    placement.currentPointer = { x: event.clientX, y: event.clientY };
    const point = diagramPointFromClient(placement.currentPointer);
    const x = Math.max(0, Math.round((point.x - (placement.size.width / 2)) / 10) * 10);
    const y = Math.max(0, Math.round((point.y - (placement.size.height / 2)) / 10) * 10);
    placement.position = { x, y };
    placement.ghost.setAttribute('transform', `translate(${x} ${y})`);
    const external = ['gateway', 'start-event', 'end-event', 'intermediate-event'].includes(placement.definition.visual);
    placement.label.setAttribute('x', String(placement.size.width / 2));
    placement.label.setAttribute('y', String(external ? placement.size.height + 17 : (placement.size.height / 2) + 4));
    if (isAttachedErrorPlacement(placement)) {
      updateAttachedErrorDropTarget(placement, point);
      setPlacementValidity(placement, Boolean(placement.targetTaskId));
    } else if (placement.kind === 'lane') {
      setPlacementValidity(placement, Boolean(poolAtPoint({
        x: x + (placement.size.width / 2),
        y: y + (placement.size.height / 2)
      })) || !containerPlacementCollision(placement.position, placement.size));
    } else {
      setPlacementValidity(placement, !taskPlacementCollision(placement.position, '', placement));
    }
    scheduleAutoPan();
  }

  function setPlacementValidity(placement, valid) {
    placement.valid = Boolean(valid);
    placement.ghost.classList.toggle('valid-placement', placement.valid);
    placement.ghost.classList.toggle('invalid-placement', !placement.valid);
  }

  function poolAtPoint(point) {
    return state.data.shapes.find((shape) => {
      if (findElement(shape.businessObject)?.tag !== 'BpmnPool') return false;
      const bounds = shapeBounds(shape);
      return point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom;
    });
  }

  function finishPalettePlacement(event) {
    const placement = state.palettePlacement;
    if (!placement || event?.type === 'pointercancel' || !placement.position) return false;
    if (!canvasScroller.contains(event.target)) return false;
    if (isAttachedErrorPlacement(placement)) return finishAttachedErrorPlacement(event, placement);
    if (placement.kind === 'lane') return finishPaletteLanePlacement(event, placement);
    if (taskPlacementCollision(placement.position, '', placement)) {
      showToast('Escolha uma área livre, sem sobrepor outro elemento.');
      return true;
    }
    const request = { kind: placement.kind, subtype: placement.subtype, ...placement.position };
    const label = placement.definition.label;
    completePalettePlacement();
    setActivePaletteTool('select');
    state.layoutCommitPending = true;
    state.suppressCanvasClick = true;
    vscode.postMessage({ type: 'createIsolatedNode', node: request });
    showToast(`Criando ${label} no arquivo .process...`);
    event.preventDefault?.();
    event.stopPropagation?.();
    return true;
  }

  function isAttachedErrorPlacement(placement) {
    return placement?.kind === 'intermediate' && placement.subtype === '43';
  }

  function updateAttachedErrorDropTarget(placement, point) {
    clearAttachedErrorDropTarget();
    const target = automatedServiceAtPoint(point);
    placement.targetTaskId = target?.element.id || '';
    if (!target) return;
    viewport.querySelector(`.node[data-id="${cssEscape(target.element.id)}"]`)?.classList.add('boundary-error-target');
  }

  function clearAttachedErrorDropTarget() {
    viewport.querySelectorAll('.boundary-error-target').forEach((node) => node.classList.remove('boundary-error-target'));
  }

  function automatedServiceAtPoint(point) {
    return (state.data?.shapes ?? [])
      .map((shape) => ({ shape, element: findElement(shape.businessObject) }))
      .filter(({ element }) => element?.tag === 'BpmnTask'
        && element.type === '82'
        && String(element.attributes.executionType ?? '') === '1'
        && !String(element.attributes.attachedEvents ?? '').trim())
      .filter(({ shape }) => {
        const bounds = shapeBounds(shape);
        return point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom;
      })
      .sort((left, right) => (left.shape.width * left.shape.height) - (right.shape.width * right.shape.height))[0];
  }

  function attachedErrorPosition(taskShape, point) {
    const bounds = shapeBounds(taskShape);
    const half = 15;
    const edges = [
      { edge: 'left', distance: Math.abs(point.x - bounds.left) },
      { edge: 'right', distance: Math.abs(point.x - bounds.right) },
      { edge: 'top', distance: Math.abs(point.y - bounds.top) },
      { edge: 'bottom', distance: Math.abs(point.y - bounds.bottom) }
    ].sort((left, right) => left.distance - right.distance);
    const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
    let x = clamp(point.x - half, bounds.left - half, bounds.right - half);
    let y = clamp(point.y - half, bounds.top - half, bounds.bottom - half);
    if (edges[0].edge === 'left') x = bounds.left - half;
    if (edges[0].edge === 'right') x = bounds.right - half;
    if (edges[0].edge === 'top') y = bounds.top - half;
    if (edges[0].edge === 'bottom') y = bounds.bottom - half;
    return { x: Math.round(x / 5) * 5, y: Math.round(y / 5) * 5 };
  }

  function finishAttachedErrorPlacement(event, placement) {
    const taskId = placement.targetTaskId;
    const taskShape = taskId ? findShape(taskId) : null;
    if (!taskId || !taskShape) {
      showToast('Solte a captura de erro sobre uma atividade de serviço automatizada e sem outra tratativa anexada.');
      return true;
    }
    const position = attachedErrorPosition(taskShape, diagramPointFromClient({ x: event.clientX, y: event.clientY }));
    completePalettePlacement();
    setActivePaletteTool('select');
    state.layoutCommitPending = true;
    state.suppressCanvasClick = true;
    vscode.postMessage({
      type: 'createAttachedErrorEvent',
      errorEvent: { taskId, ...position }
    });
    showToast(`Criando captura de erro anexada a ${taskId}...`);
    event.preventDefault?.();
    event.stopPropagation?.();
    return true;
  }

  function finishPaletteLanePlacement(event, placement) {
    const center = {
      x: placement.position.x + (placement.size.width / 2),
      y: placement.position.y + (placement.size.height / 2)
    };
    const pool = poolAtPoint(center);
    if (!pool && containerPlacementCollision(placement.position, placement.size)) {
      showToast('Escolha uma área livre ou posicione a raia dentro de uma pool.');
      return true;
    }
    const request = pool
      ? { poolId: pool.businessObject }
      : { ...placement.position, width: placement.size.width, height: placement.size.height };
    completePalettePlacement();
    setActivePaletteTool('select');
    state.layoutCommitPending = true;
    state.suppressCanvasClick = true;
    vscode.postMessage({ type: 'createSwimLane', lane: request });
    showToast(pool ? `Criando e distribuindo uma nova raia em ${pool.businessObject}...` : 'Criando uma raia independente...');
    event.preventDefault?.();
    event.stopPropagation?.();
    return true;
  }

  function completePalettePlacement() {
    if (!state.palettePlacement) return;
    cancelAutoPan();
    clearAttachedErrorDropTarget();
    state.palettePlacement.ghost.remove();
    state.palettePlacement = null;
    state.isDragging = false;
    updatePropertiesVisibility();
  }

  function cancelPalettePlacement(showMessage = true) {
    if (!state.palettePlacement) return false;
    completePalettePlacement();
    setActivePaletteTool('select');
    if (showMessage) showToast('Criação pela paleta cancelada.');
    return true;
  }

  function beginTaskPlacement(sourceId, kind = 'task') {
    closeTaskCreationMenu();
    const source = findElement(sourceId);
    if (!source || !canStartConnection(source)) return;
    const isGateway = kind === 'gateway';
    const isIntermediateEvent = kind === 'intermediate-event';
    const isEndEvent = kind === 'end-event';
    const isEvent = isIntermediateEvent || isEndEvent;
    const size = isGateway ? newGatewaySize : (isIntermediateEvent
      ? newIntermediateEventSize
      : (isEndEvent ? newEndEventSize : newTaskSize));
    const preview = svg('path', { class: 'connection-preview valid-target', 'marker-end': 'url(#arrow)' });
    const ghost = svg('g', {
      class: `node ${isGateway ? 'gateway' : (isIntermediateEvent ? 'event intermediate-event' : (isEndEvent ? 'event end-event' : 'task'))} task-placement-ghost`,
      'aria-label': isGateway
        ? 'Posição do novo gateway'
        : (isIntermediateEvent
          ? 'Posição do novo evento intermediário'
          : (isEndEvent ? 'Posição do novo evento final' : 'Posição da nova atividade'))
    });
    let body;
    if (isGateway) {
      body = svg('polygon', { points: '30,0 60,30 30,60 0,30', class: 'body' });
    } else if (isIntermediateEvent) {
      body = svg('g', { class: 'event-placement-body' });
      body.append(
        svg('circle', { cx: 17.5, cy: 17.5, r: 15.5, class: 'body event-outer' }),
        svg('circle', { cx: 17.5, cy: 17.5, r: 12, class: 'event-inner' })
      );
    } else if (isEndEvent) {
      body = svg('g', { class: 'event-placement-body' });
      body.append(svg('circle', { cx: 17.5, cy: 17.5, r: 15.5, class: 'body event-outer' }));
    } else {
      body = svg('rect', { width: size.width, height: size.height, rx: 6, class: 'body' });
    }
    const label = svg('text', {
      class: `label${isGateway || isEvent ? ' external-label' : ''}`,
      'text-anchor': 'middle'
    });
    label.textContent = isGateway ? 'Exclusivo' : (isIntermediateEvent ? 'Intermediário' : (isEndEvent ? 'Fim' : 'Atividade'));
    ghost.append(body, label);
    viewport.append(preview, ghost);
    state.taskPlacement = {
      sourceId,
      kind,
      size,
      currentPointer: { x: 0, y: 0 },
      position: null,
      route: null,
      preview,
      ghost,
      body,
      label
    };
    state.isDragging = true;
    viewport.querySelector(`.node[data-id="${cssEscape(sourceId)}"]`)?.classList.add('connecting-source');
    updatePropertiesVisibility();
    const placementLabel = isGateway
      ? 'o novo gateway'
      : (isIntermediateEvent ? 'o novo evento intermediário' : (isEndEvent ? 'o novo evento final' : 'a nova atividade'));
    showToast(`Mova o mouse e clique em uma área livre para posicionar ${placementLabel}. Escape cancela.`);
  }

  function trackTaskPlacement(event) {
    const placement = state.taskPlacement;
    if (!placement) return;
    placement.currentPointer = { x: event.clientX, y: event.clientY };
    const point = diagramPointFromClient(placement.currentPointer);
    const x = Math.max(0, Math.round((point.x - (placement.size.width / 2)) / 10) * 10);
    const y = Math.max(0, Math.round((point.y - (placement.size.height / 2)) / 10) * 10);
    placement.position = { x, y };
    if (placement.kind === 'gateway') {
      placement.body.setAttribute('points', `${x + 30},${y} ${x + 60},${y + 30} ${x + 30},${y + 60} ${x},${y + 30}`);
    } else if (placement.kind === 'intermediate-event' || placement.kind === 'end-event') {
      placement.body.setAttribute('transform', `translate(${x} ${y})`);
    } else {
      placement.body.setAttribute('x', String(x));
      placement.body.setAttribute('y', String(y));
    }
    placement.label.setAttribute('x', String(x + (placement.size.width / 2)));
    placement.label.setAttribute('y', String(y + (placement.kind === 'gateway'
      ? 75
      : (placement.kind === 'intermediate-event' || placement.kind === 'end-event' ? 50 : 32))));
    placement.route = routeTaskPlacement(placement.sourceId, {
      x,
      y,
      width: placement.size.width,
      height: placement.size.height
    });
    placement.preview.setAttribute('d', placement.route ? straightPathData(placement.route.points) : '');
    const valid = Boolean(placement.route) && !taskPlacementCollision(placement.position, placement.sourceId, placement);
    setPlacementValidity(placement, valid);
    placement.preview.classList.toggle('valid-target', valid);
    placement.preview.classList.toggle('invalid-target', !valid);
    scheduleAutoPan();
  }

  function routeTaskPlacement(sourceId, targetShape) {
    const sourceShape = findShape(sourceId);
    if (!sourceShape) return null;
    const sourceElement = findElement(sourceId);
    const existingPaths = state.data.connections
      .map((item) => routingConnectionPoints(item, item.bendpoints, false))
      .filter((points) => points.length >= 2);
    const obstacles = state.data.shapes.flatMap((shape) => {
      if (shape.businessObject === sourceId) return [];
      const element = findElement(shape.businessObject);
      if (!element || ['BpmnPool', 'BpmnSwimLane', 'BpmnGroup'].includes(element.tag)) return [];
      const bounds = shapeBounds(shape);
      if ((element.tag.includes('Event') && !isAttachedBoundaryEvent(element))
        || element.tag === 'BpmnGateway' || element.tag === 'BpmnDatabase' || element.tag === 'BpmnDocument') {
        bounds.bottom += 28;
      }
      return [bounds];
    });
    return routeOrthogonal({
      sourceBounds: shapeBounds(sourceShape),
      targetBounds: {
        left: targetShape.x,
        top: targetShape.y,
        right: targetShape.x + targetShape.width,
        bottom: targetShape.y + targetShape.height
      },
      obstacles,
      existingPaths,
      clearance: 16,
      obstacleMargin: 12,
      sourceElement
    });
  }

  function finishTaskPlacement(event) {
    const placement = state.taskPlacement;
    if (!placement || !placement.position || !placement.route) return false;
    const hitNode = event.target.closest?.('.node[data-id]');
    const hitElement = hitNode ? findElement(hitNode.dataset.id) : null;
    if ((hitElement && !['BpmnPool', 'BpmnSwimLane', 'BpmnGroup'].includes(hitElement.tag))
      || taskPlacementCollision(placement.position, placement.sourceId, placement)) {
      showToast('Escolha uma área livre, sem sobrepor outro elemento.');
      return true;
    }
    const request = {
      sourceId: placement.sourceId,
      x: placement.position.x,
      y: placement.position.y,
      bendpoints: placement.route.bendpoints.map((point) => ({ x: point.x, y: point.y }))
    };
    const kind = placement.kind;
    completeTaskPlacement();
    state.layoutCommitPending = true;
    if (kind === 'gateway') {
      vscode.postMessage({ type: 'createConnectedGateway', gateway: request });
      showToast('Criando o gateway e o fluxo no arquivo .process...');
    } else if (kind === 'intermediate-event') {
      vscode.postMessage({ type: 'createConnectedIntermediateEvent', intermediateEvent: request });
      showToast('Criando o evento intermediário e o fluxo no arquivo .process...');
    } else if (kind === 'end-event') {
      vscode.postMessage({ type: 'createConnectedEndEvent', endEvent: request });
      showToast('Criando o evento final e o fluxo no arquivo .process...');
    } else {
      vscode.postMessage({ type: 'createConnectedTask', task: request });
      showToast('Criando a atividade e o fluxo no arquivo .process...');
    }
    return true;
  }

  function taskPlacementCollision(position, sourceId, placement) {
    const collisionWidth = placement.size.collisionWidth ?? placement.size.width;
    const horizontalOffset = (collisionWidth - placement.size.width) / 2;
    const candidate = {
      left: position.x - horizontalOffset,
      top: position.y,
      right: position.x + placement.size.width + horizontalOffset,
      bottom: position.y + (placement.size.collisionHeight ?? placement.size.height)
    };
    return state.data.shapes.some((shape) => {
      if (shape.businessObject === sourceId) return false;
      const element = findElement(shape.businessObject);
      if (!element || ['BpmnPool', 'BpmnSwimLane', 'BpmnGroup'].includes(element.tag)) return false;
      const bounds = shapeBounds(shape);
      return candidate.left < bounds.right
        && candidate.right > bounds.left
        && candidate.top < bounds.bottom
        && candidate.bottom > bounds.top;
    });
  }

  function completeTaskPlacement() {
    const placement = state.taskPlacement;
    if (!placement) return;
    cancelAutoPan();
    placement.preview.remove();
    placement.ghost.remove();
    const sourceGroup = viewport.querySelector(`.node[data-id="${cssEscape(placement.sourceId)}"]`);
    sourceGroup?.classList.remove('connecting-source');
    hideContextPad(sourceGroup);
    state.taskPlacement = null;
    state.isDragging = false;
    updatePropertiesVisibility();
  }

  function cancelTaskPlacement(showMessage = true) {
    if (!state.taskPlacement) return false;
    completeTaskPlacement();
    if (showMessage) showToast('Criação do elemento cancelada.');
    return true;
  }

  function handleGlobalPointerDown(event) {
    const conversionMenu = state.taskConversionMenu?.node;
    if (conversionMenu && !conversionMenu.contains(event.target) && !event.target.closest?.('.context-pad-pencil')) {
      closeTaskConversionMenu();
    }
    const creationMenu = state.taskCreationMenu?.node;
    if (creationMenu && !creationMenu.contains(event.target) && !event.target.closest?.('.context-pad-create')) {
      closeTaskCreationMenu();
    }
  }

  function showContextPad(group) {
    const pad = state.contextPadById.get(group.dataset.id);
    if (!pad) return;
    const pending = contextPadHideTimers.get(group);
    if (pending) clearTimeout(pending);
    contextPadHideTimers.delete(group);
    group.classList.add('context-pad-visible');
    pad.classList.add('context-pad-visible');
    if (pad.parentElement?.lastElementChild !== pad) pad.parentElement?.append(pad);
  }

  function hideContextPad(group) {
    if (!group) return;
    group.classList.remove('context-pad-visible');
    state.contextPadById.get(group.dataset.id)?.classList.remove('context-pad-visible');
  }

  function hideAllContextPads() {
    for (const group of viewport.querySelectorAll('.node.context-pad-visible')) hideContextPad(group);
  }

  function scheduleContextPadHide(group) {
    const pending = contextPadHideTimers.get(group);
    if (pending) clearTimeout(pending);
    const timer = setTimeout(() => {
      if (state.connectionInteraction?.sourceId === group.dataset.id || state.taskPlacement?.sourceId === group.dataset.id) return;
      hideContextPad(group);
      contextPadHideTimers.delete(group);
    }, 500);
    contextPadHideTimers.set(group, timer);
  }

  function canStartConnection(element) {
    return Boolean(element) && [
      'BpmnStartEvent', 'BpmnTask', 'BpmnSubProcess', 'BpmnGateway', 'BpmnIntermediateEvent',
      'BpmnAnnotation', 'BpmnDatabase', 'BpmnDocument'
    ].includes(element.tag);
  }

  function isContextPadDeletable(element) {
    return isDeletableContainer(element)
      || isDeletableAttachedErrorEvent(element)
      || isDeletableIsolatedTask(element)
      || isDeletableIsolatedSubProcess(element)
      || isDeletableIsolatedArtifact(element)
      || isDeletableIsolatedEvent(element)
      || isDeletableIsolatedGateway(element);
  }

  function canReceiveConnection(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return false;
    const source = findElement(sourceId);
    const target = findElement(targetId);
    const documentaryAssociation = ['BpmnAnnotation', 'BpmnDatabase', 'BpmnDocument'].includes(source?.tag);
    if (documentaryAssociation) {
      if (!target || !['BpmnTask', 'BpmnSubProcess'].includes(target.tag)) return false;
      return !state.data.connections.some((connection) => (
        connection.sourceRef === sourceId && connection.targetRef === targetId
      ));
    }
    if (!target || ![
      'BpmnTask', 'BpmnSubProcess', 'BpmnGateway', 'BpmnIntermediateEvent', 'BpmnEndEvent'
    ].includes(target.tag)) return false;
    return !state.data.connections.some((connection) => (
      connection.sourceRef === sourceId && connection.targetRef === targetId
    ));
  }

  function beginConnectionInteraction(event, sourceId) {
    if (event.button !== 0 || state.layoutCommitPending || state.isDragging) return;
    const source = findElement(sourceId);
    const sourceShape = findShape(sourceId);
    if (!canStartConnection(source) || !sourceShape) return;
    event.preventDefault();
    event.stopPropagation();
    selectElement(sourceId);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const preview = svg('path', {
      class: ['BpmnAnnotation', 'BpmnDatabase', 'BpmnDocument'].includes(source.tag)
        ? 'connection-preview documentary-association-preview'
        : 'connection-preview',
      ...(['BpmnAnnotation', 'BpmnDatabase', 'BpmnDocument'].includes(source.tag) ? {} : { 'marker-end': 'url(#arrow)' })
    });
    viewport.append(preview);
    state.connectionInteraction = {
      sourceId,
      targetId: '',
      pointerId: event.pointerId,
      captureTarget: event.currentTarget,
      clickToPlace: false,
      currentPointer: { x: event.clientX, y: event.clientY },
      preview,
      route: null
    };
    state.isDragging = true;
    viewport.querySelector(`.node[data-id="${cssEscape(sourceId)}"]`)?.classList.add('connecting-source');
    updatePropertiesVisibility();
    updateConnectionPreview();
    scheduleAutoPan();
  }

  function beginClickConnectionPlacement(event, sourceId) {
    closeTaskCreationMenu();
    if (state.layoutCommitPending || state.isDragging) return;
    const source = findElement(sourceId);
    const sourceShape = findShape(sourceId);
    if (!canStartConnection(source) || !sourceShape) return;
    const documentaryAssociation = ['BpmnAnnotation', 'BpmnDatabase', 'BpmnDocument'].includes(source.tag);
    const preview = svg('path', {
      class: documentaryAssociation
        ? 'connection-preview documentary-association-preview'
        : 'connection-preview',
      ...(documentaryAssociation ? {} : { 'marker-end': 'url(#arrow)' })
    });
    viewport.append(preview);
    state.connectionInteraction = {
      sourceId,
      targetId: '',
      pointerId: null,
      captureTarget: null,
      clickToPlace: true,
      currentPointer: { x: event.clientX, y: event.clientY },
      preview,
      route: null
    };
    state.isDragging = true;
    viewport.querySelector(`.node[data-id="${cssEscape(sourceId)}"]`)?.classList.add('connecting-source');
    updatePropertiesVisibility();
    updateConnectionPreview();
    showToast('Clique na atividade, evento ou gateway de destino. Escape cancela.');
  }

  function trackConnectionInteraction(event) {
    const interaction = state.connectionInteraction;
    if (!interaction || (interaction.pointerId !== null && event.pointerId !== undefined && event.pointerId !== interaction.pointerId)) return;
    interaction.currentPointer = { x: event.clientX, y: event.clientY };
    const candidate = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.node[data-id]');
    const targetId = candidate?.dataset.id || '';
    interaction.targetId = canReceiveConnection(interaction.sourceId, targetId) ? targetId : '';
    viewport.querySelectorAll('.connection-target').forEach((node) => node.classList.remove('connection-target'));
    if (interaction.targetId) candidate.classList.add('connection-target');
    updateConnectionPreview();
  }

  function finishConnectionInteraction(event) {
    const interaction = state.connectionInteraction;
    if (!interaction || (interaction.pointerId !== null && event?.pointerId !== undefined && event.pointerId !== interaction.pointerId)) return;
    if (interaction.clickToPlace && event?.type === 'pointerup') return;
    const commit = event?.type !== 'pointercancel' && Boolean(interaction.targetId && interaction.route);
    const sourceId = interaction.sourceId;
    const targetId = interaction.targetId;
    const bendpoints = interaction.route?.bendpoints?.map((point) => ({ x: point.x, y: point.y })) ?? [];
    completeConnectionInteraction();
    if (!commit) {
      showToast(event?.type === 'pointercancel'
        ? 'Criação do fluxo cancelada.'
        : 'Solte a seta sobre uma atividade, evento ou gateway válido.');
      return;
    }
    requestConnectionCreation(sourceId, targetId, bendpoints);
  }

  function finishClickConnectionPlacement(targetId) {
    const interaction = state.connectionInteraction;
    if (!interaction?.clickToPlace) return false;
    if (!canReceiveConnection(interaction.sourceId, targetId)) {
      showToast('Escolha uma atividade, evento ou gateway de destino válido.');
      return true;
    }
    const route = routeNewConnection(interaction.sourceId, targetId);
    if (!route) {
      showToast('Não foi possível calcular uma rota segura para o novo fluxo.');
      return true;
    }
    const sourceId = interaction.sourceId;
    const bendpoints = route.bendpoints.map((point) => ({ x: point.x, y: point.y }));
    completeConnectionInteraction();
    requestConnectionCreation(sourceId, targetId, bendpoints);
    return true;
  }

  function requestConnectionCreation(sourceId, targetId, bendpoints) {
    state.layoutCommitPending = true;
    renderStatus(state.data);
    vscode.postMessage({
      type: 'createConnection',
      connection: { sourceId, targetId, bendpoints }
    });
    const source = findElement(sourceId);
    showToast(['BpmnAnnotation', 'BpmnDatabase', 'BpmnDocument'].includes(source?.tag)
      ? 'Gravando a associação visual no arquivo .process...'
      : 'Gravando o novo fluxo no arquivo .process...');
  }

  function cancelConnectionInteraction() {
    if (!state.connectionInteraction) return false;
    completeConnectionInteraction();
    return true;
  }

  function completeConnectionInteraction() {
    const interaction = state.connectionInteraction;
    if (!interaction) return;
    cancelAutoPan();
    if (interaction.pointerId !== null) interaction.captureTarget?.releasePointerCapture?.(interaction.pointerId);
    interaction.preview?.remove();
    viewport.querySelectorAll('.connecting-source, .connection-target').forEach((node) => {
      node.classList.remove('connecting-source', 'connection-target');
    });
    hideContextPad(viewport.querySelector(`.node[data-id="${cssEscape(interaction.sourceId)}"]`));
    state.connectionInteraction = null;
    state.isDragging = false;
    updatePropertiesVisibility();
  }

  function updateConnectionPreview() {
    const interaction = state.connectionInteraction;
    if (!interaction) return;
    const sourceShape = findShape(interaction.sourceId);
    const sourceElement = findElement(interaction.sourceId);
    if (!sourceShape || !sourceElement) return;
    if (interaction.targetId) {
      interaction.route = routeNewConnection(interaction.sourceId, interaction.targetId);
      if (interaction.route) {
        interaction.preview.setAttribute('d', straightPathData(interaction.route.points));
        interaction.preview.classList.add('valid-target');
        return;
      }
    }
    interaction.route = null;
    interaction.preview.classList.remove('valid-target');
    const pointer = diagramPointFromClient(interaction.currentPointer);
    const start = clientBoundaryPoint(sourceShape, sourceElement, pointer);
    interaction.preview.setAttribute('d', straightPathData([start, pointer]));
  }

  function routeNewConnection(sourceId, targetId) {
    const sourceShape = findShape(sourceId);
    const targetShape = findShape(targetId);
    if (!sourceShape || !targetShape) return null;
    const context = routingContext(new Set(), false);
    const sourceBounds = shapeBounds(sourceShape);
    const targetBounds = shapeBounds(targetShape);
    const routeInWindow = (padding) => {
      const windowBounds = routingWindow(sourceBounds, targetBounds, padding);
      return routeOrthogonal({
        sourceBounds,
        targetBounds,
        obstacles: context.obstacles
          .filter((item) => item.id !== sourceId && item.id !== targetId && boundsIntersect(item.bounds, windowBounds))
          .map((item) => item.bounds),
        existingPaths: context.occupiedPaths
          .filter((item) => boundsIntersect(item.bounds, windowBounds))
          .map((item) => item.points),
        clearance: 16,
        obstacleMargin: 12
      });
    };
    return routeInWindow(120) ?? routeInWindow(260);
  }

  function addElementCode(group, shape, element) {
    if (!element.code) return;
    const { width, height } = effectiveSize(shape, element);
    const badgeWidth = Math.max(16, (String(element.code).length * 6) + 6);
    const badgeHeight = 13;
    const right = shape.x + width - 3;
    const bottom = shape.y + height - 3;
    const badge = svg('g', { class: 'element-code', 'aria-label': `Código ${element.code}` });
    badge.append(svg('rect', {
      x: right - badgeWidth,
      y: bottom - badgeHeight,
      width: badgeWidth,
      height: badgeHeight,
      rx: 3,
      ry: 3
    }));
    const text = svg('text', {
      x: right - (badgeWidth / 2),
      y: bottom - 3,
      'text-anchor': 'middle'
    });
    text.textContent = element.code;
    badge.append(text);
    group.append(badge);
  }

  function drawShape(group, shape, element) {
    const x = shape.x;
    const y = shape.y;
    const { width, height } = effectiveSize(shape, element);
    if (element.tag === 'BpmnPool' || element.tag === 'BpmnSwimLane') {
      const color = safeHexColor(element.attributes.cores);
      const attributes = { x, y, width, height, class: 'body' };
      if (element.tag === 'BpmnSwimLane') group.setAttribute('color', color || '#e4f4f5');
      group.append(svg('rect', attributes));
      addVerticalLabel(group, element.name || element.typeLabel, x + Math.min(15, width / 2), y + height / 2);
      return;
    }
    if (element.tag === 'BpmnGateway') {
      const points = `${x + width / 2},${y} ${x + width},${y + height / 2} ${x + width / 2},${y + height} ${x},${y + height / 2}`;
      group.append(svg('polygon', { points, class: 'body' }));
      addGatewayMarker(group, element, x + width / 2, y + height / 2);
      addLabel(group, element.name || element.typeLabel, x + width / 2, y + height + 15, Math.max(width + 30, 90));
      return;
    }
    if (element.tag.includes('Event')) {
      const radius = Math.max(8, Math.min(width, height) / 2 - 2);
      group.append(svg('circle', { cx: x + width / 2, cy: y + height / 2, r: radius, class: 'body event-outer' }));
      if (element.tag === 'BpmnIntermediateEvent') {
        group.append(svg('circle', { cx: x + width / 2, cy: y + height / 2, r: radius - 3.5, class: 'event-inner' }));
      }
      addEventMarker(group, element, x + width / 2, y + height / 2);
      if (!isAttachedBoundaryEvent(element)) {
        addLabel(group, element.name || element.typeLabel, x + width / 2, y + height + 15, 110, 'external-label');
      }
      return;
    }
    if (element.tag === 'BpmnDatabase') {
      const cap = Math.min(12, height / 5);
      const bodyPath = `M ${x} ${y + cap} V ${y + height - cap} A ${width / 2} ${cap} 0 0 0 ${x + width} ${y + height - cap} V ${y + cap} A ${width / 2} ${cap} 0 0 1 ${x} ${y + cap} Z`;
      group.append(svg('path', { d: bodyPath, class: 'body database-body' }));
      group.append(svg('ellipse', { cx: x + width / 2, cy: y + cap, rx: width / 2, ry: cap, class: 'body database-cap' }));
      for (const offset of [cap + 7, cap + 14]) {
        if (offset < height - cap) {
          group.append(svg('path', { d: `M ${x} ${y + offset} A ${width / 2} ${cap} 0 0 0 ${x + width} ${y + offset}`, class: 'database-ring' }));
        }
      }
      addLabel(group, element.name || element.typeLabel, x + width / 2, y + height + 17, width + 24, 'artifact-label');
      return;
    }
    if (element.tag === 'BpmnDocument') {
      const fold = Math.min(18, width / 4);
      const points = `${x},${y} ${x + width - fold},${y} ${x + width},${y + fold} ${x + width},${y + height} ${x},${y + height}`;
      group.append(svg('polygon', { points, class: 'body document-body' }));
      group.append(svg('polyline', { points: `${x + width - fold},${y} ${x + width - fold},${y + fold} ${x + width},${y + fold}`, class: 'document-fold' }));
      addLabel(group, element.attributes.documentId || element.name || element.typeLabel, x + width / 2, y + height + 16, width + 20, 'artifact-label');
      return;
    }
    if (element.tag === 'BpmnAnnotation') {
      group.append(svg('rect', { x, y, width, height, rx: 2, class: 'body annotation-body' }));
      addLabel(group, element.name || element.typeLabel, x + width / 2, y + height / 2, width - 8);
      return;
    }
    const rx = element.tag === 'BpmnTask' || element.tag === 'BpmnSubProcess' ? 6 : 0;
    group.append(svg('rect', { x, y, width, height, rx, class: 'body' }));
    if (element.tag === 'BpmnTask') addTaskMarker(group, element, x + 12, y + 12);
    if (element.tag === 'BpmnSubProcess') addSubProcessMarker(group, element, x + width / 2, y + height - 7);
    addLabel(group, element.name || element.typeLabel, x + width / 2, y + height / 2, Math.max(width - 10, 70));
  }

  function addEventMarker(group, element, x, y) {
    const key = `${element.tag}:${element.type}`;
    const marker = svg('g', { class: 'event-marker' });
    if (['BpmnStartEvent:12', 'BpmnIntermediateEvent:32'].includes(key)) {
      marker.append(svg('circle', { cx: x, cy: y, r: 8 }));
      marker.append(svg('line', { x1: x, y1: y, x2: x, y2: y - 5 }));
      marker.append(svg('line', { x1: x, y1: y, x2: x + 4, y2: y + 2 }));
      for (const angle of [0, 90, 180, 270]) {
        const radians = angle * Math.PI / 180;
        marker.append(svg('line', { x1: x + Math.cos(radians) * 6, y1: y + Math.sin(radians) * 6, x2: x + Math.cos(radians) * 8, y2: y + Math.sin(radians) * 8 }));
      }
    } else if (['BpmnStartEvent:13', 'BpmnIntermediateEvent:35'].includes(key)) {
      marker.append(svg('rect', { x: x - 7, y: y - 9, width: 14, height: 18, rx: 1 }));
      for (const offset of [-4, 0, 4]) marker.append(svg('line', { x1: x - 4, y1: y + offset, x2: x + 4, y2: y + offset }));
    } else if (['BpmnStartEvent:14', 'BpmnEndEvent:64', 'BpmnIntermediateEvent:37', 'BpmnIntermediateEvent:41'].includes(key)) {
      const filled = ['BpmnEndEvent:64', 'BpmnIntermediateEvent:37'].includes(key);
      marker.append(svg('polygon', { points: `${x},${y - 9} ${x + 9},${y + 7} ${x - 9},${y + 7}`, class: filled ? 'filled' : '' }));
    } else if (['BpmnStartEvent:16', 'BpmnEndEvent:66', 'BpmnIntermediateEvent:39'].includes(key)) {
      const points = Array.from({ length: 5 }, (_, index) => {
        const angle = (-90 + (index * 72)) * Math.PI / 180;
        return `${x + Math.cos(angle) * 9},${y + Math.sin(angle) * 9}`;
      }).join(' ');
      marker.append(svg('polygon', { points, class: key === 'BpmnStartEvent:16' ? '' : 'filled' }));
    } else if (['BpmnEndEvent:63', 'BpmnIntermediateEvent:43'].includes(key)) {
      marker.append(svg('polyline', { points: `${x + 3},${y - 10} ${x - 4},${y - 1} ${x + 1},${y + 1} ${x - 3},${y + 10} ${x + 6},${y - 2} ${x + 1},${y - 3}` }));
    } else if (key === 'BpmnEndEvent:65') {
      marker.append(svg('line', { x1: x - 7, y1: y - 7, x2: x + 7, y2: y + 7 }));
      marker.append(svg('line', { x1: x + 7, y1: y - 7, x2: x - 7, y2: y + 7 }));
    } else if (key === 'BpmnEndEvent:68') {
      marker.append(svg('circle', { cx: x, cy: y, r: 9, class: 'filled' }));
    } else if (['BpmnIntermediateEvent:36', 'BpmnIntermediateEvent:42'].includes(key)) {
      const forward = key.endsWith(':36');
      const d = forward
        ? `M ${x - 9} ${y - 5} H ${x + 1} V ${y - 9} L ${x + 10} ${y} L ${x + 1} ${y + 9} V ${y + 5} H ${x - 9} Z`
        : `M ${x + 9} ${y - 5} H ${x - 1} V ${y - 9} L ${x - 10} ${y} L ${x - 1} ${y + 9} V ${y + 5} H ${x + 9} Z`;
      marker.append(svg('path', { d, class: 'filled' }));
    } else {
      return;
    }
    group.append(marker);
  }

  function addGatewayMarker(group, element, x, y) {
    const marker = svg('g', { class: 'gateway-marker' });
    if (element.type === '121') marker.append(svg('circle', { cx: x, cy: y, r: 15 }));
    if (element.type === '126') {
      marker.append(svg('line', { x1: x - 15, y1: y - 6, x2: x + 15, y2: y - 6 }));
      marker.append(svg('line', { x1: x - 15, y1: y + 6, x2: x + 15, y2: y + 6 }));
    }
    if (element.type === '127') {
      marker.append(svg('line', { x1: x - 16, y1: y, x2: x + 16, y2: y }));
      marker.append(svg('line', { x1: x, y1: y - 16, x2: x, y2: y + 16 }));
    }
    group.append(marker);
  }

  function addTaskMarker(group, element, x, y) {
    const marker = svg('g', { class: 'task-marker' });
    if (element.type === '81') {
      marker.append(svg('circle', { cx: x, cy: y - 3, r: 3 }));
      marker.append(svg('path', { d: `M ${x - 6} ${y + 7} Q ${x} ${y} ${x + 6} ${y + 7}` }));
    } else if (element.type === '82') {
      marker.append(svg('circle', { cx: x, cy: y, r: 4 }));
      for (const angle of [0, 45, 90, 135]) {
        const radians = angle * Math.PI / 180;
        marker.append(svg('line', { x1: x - Math.cos(radians) * 7, y1: y - Math.sin(radians) * 7, x2: x + Math.cos(radians) * 7, y2: y + Math.sin(radians) * 7 }));
      }
    } else if (element.type === '84') {
      marker.append(svg('rect', { x: x - 7, y: y - 5, width: 14, height: 10 }));
      marker.append(svg('polyline', { points: `${x - 7},${y - 5} ${x},${y + 1} ${x + 7},${y - 5}` }));
    } else if (element.type === '85') {
      marker.append(svg('path', {
        d: 'M23 5.5V18c0 3.3-2.7 6-6 6h-4.5c-1.6 0-3.1-.6-4.2-1.7L1.7 15.7c-.9-.9-.9-2.3 0-3.2.9-.9 2.3-.9 3.2 0L7 14.6V4c0-1.1.9-2 2-2s2 .9 2 2v7h1V2c0-1.1.9-2 2-2s2 .9 2 2v9h1V3c0-1.1.9-2 2-2s2 .9 2 2v8h1V5.5c0-1.1.9-2 2-2s2 .9 2 2Z',
        class: 'manual-hand',
        transform: `translate(${x - 8} ${y - 8}) scale(.65)`
      }));
    } else if (element.type === '86') {
      marker.append(svg('rect', { x: x - 7, y: y - 7, width: 14, height: 14 }));
      marker.append(svg('line', { x1: x - 7, y1: y - 2, x2: x + 7, y2: y - 2 }));
      marker.append(svg('line', { x1: x - 2, y1: y - 2, x2: x - 2, y2: y + 7 }));
    } else if (element.type === '87') {
      marker.append(svg('polyline', { points: `${x - 2},${y - 7} ${x - 7},${y} ${x - 2},${y + 7}` }));
      marker.append(svg('polyline', { points: `${x + 2},${y - 7} ${x + 7},${y} ${x + 2},${y + 7}` }));
    }
    if (marker.childNodes.length) group.append(marker);
  }

  function addSubProcessMarker(group, element, x, y) {
    group.append(svg('rect', { x: x - 6, y: y - 6, width: 12, height: 12, class: 'subprocess-marker-box' }));
    group.append(svg('line', { x1: x - 4, y1: y, x2: x + 4, y2: y, class: 'subprocess-marker-line' }));
    group.append(svg('line', { x1: x, y1: y - 4, x2: x, y2: y + 4, class: 'subprocess-marker-line' }));
    if (element.type === '101') {
      const adhoc = svg('text', { x: x + 13, y: y + 4, class: 'adhoc-marker' });
      adhoc.textContent = '~';
      group.append(adhoc);
    }
  }

  function addLabel(group, value, x, y, maxWidth, className = '') {
    const words = String(value).trim().split(/\s+/);
    const lines = [];
    let line = '';
    const maxChars = Math.max(8, Math.floor(maxWidth / 7));
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > maxChars && line) { lines.push(line); line = word; }
      else line = candidate;
    }
    if (line) lines.push(line);
    const text = svg('text', { x, y: y - ((lines.length - 1) * 7), class: `label ${className}`.trim() });
    lines.slice(0, 4).forEach((item, index) => {
      const tspan = svg('tspan', { x, dy: index ? 14 : 0 });
      tspan.textContent = item;
      text.append(tspan);
    });
    group.append(text);
  }

  function addVerticalLabel(group, value, x, y) {
    const text = svg('text', { x, y, class: 'label container-label', transform: `rotate(-90 ${x} ${y})` });
    text.textContent = String(value || '');
    group.append(text);
  }

  function handleElementClick(event, id) {
    event.stopPropagation();
    if (finishClickConnectionPlacement(id)) {
      event.preventDefault();
      return;
    }
    if (state.containerPlacement) {
      finishContainerPlacement(event);
      return;
    }
    if (state.taskPlacement) {
      finishTaskPlacement(event);
      return;
    }
    if (state.suppressCanvasClick) {
      state.suppressCanvasClick = false;
      return;
    }
    if (state.suppressClickId === id) {
      state.suppressClickId = '';
      return;
    }
    selectElement(id, selectionModifier(event));
  }

  function handleCanvasClick(event) {
    if (state.connectionInteraction?.clickToPlace) {
      event.preventDefault();
      event.stopPropagation();
      cancelConnectionInteraction();
      showToast('Criação do fluxo cancelada.');
      return;
    }
    if (state.palettePlacement) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (finishContainerPlacement(event)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (finishTaskPlacement(event)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (state.suppressCanvasClick) {
      state.suppressCanvasClick = false;
      event.stopPropagation();
      return;
    }
    if (state.suppressClickId) {
      state.suppressClickId = '';
      event.stopPropagation();
      return;
    }
    clearSelection();
  }

  function selectionModifier(event) {
    return event.ctrlKey || event.metaKey || event.shiftKey;
  }

  function selectElement(id, additive = false) {
    const selected = new Set(state.selectedIds);
    if (additive) {
      if (selected.has(id)) selected.delete(id); else selected.add(id);
    } else {
      selected.clear();
      selected.add(id);
    }
    setSelection([...selected]);
  }

  function navigateToLinkedEvent(elementId) {
    const target = findElement(elementId);
    if (!target || target.tag !== 'BpmnIntermediateEvent' || String(target.type) !== '42' || !findShape(elementId)) {
      showToast('O evento receptor de link selecionado nao esta disponivel no diagrama.');
      return;
    }

    focusDiagramElement(elementId);
  }

  function focusDiagramElement(elementId) {
    const target = findElement(elementId);
    if (!target) {
      showToast('O elemento selecionado não está disponível no diagrama.');
      return false;
    }
    selectElement(elementId);
    requestAnimationFrame(() => {
      const visual = viewport.querySelector(`[data-id="${cssEscape(elementId)}"]`);
      if (!visual) return;
      const scrollerRect = canvasScroller.getBoundingClientRect();
      const visualRect = visual.getBoundingClientRect();
      const left = canvasScroller.scrollLeft
        + visualRect.left + (visualRect.width / 2)
        - scrollerRect.left - (canvasScroller.clientWidth / 2);
      const top = canvasScroller.scrollTop
        + visualRect.top + (visualRect.height / 2)
        - scrollerRect.top - (canvasScroller.clientHeight / 2);
      canvasScroller.scrollTo({
        left: Math.max(0, left),
        top: Math.max(0, top),
        behavior: 'smooth'
      });
      visual.focus({ preventScroll: true });
    });
    return true;
  }

  function setSelection(ids, persist = true) {
    state.selectedIds = [...new Set(ids)];
    state.selectedId = state.selectedIds.length === 1 ? state.selectedIds[0] : '';
    renderSelectionStyles();
    updatePropertiesVisibility();
    updateAlignmentButtons();
    if (persist) persistViewState();
  }

  function selectedAlignmentIds() {
    return state.selectedIds.filter((id) => {
      const element = findElement(id);
      return Boolean(findShape(id)) && element && !['SequenceFlow', 'BpmnProcess'].includes(element.tag);
    });
  }

  function independentAlignmentIds(ids) {
    const dependencies = new Map(ids.map((id) => [id, new Set(expandedDragIds([id]))]));
    return ids.filter((id) => !ids.some((candidate) => (
      candidate !== id && dependencies.get(candidate)?.has(id)
    )));
  }

  function updateAlignmentButtons() {
    const available = Boolean(state.data?.supported)
      && !state.layoutCommitPending
      && !state.isDragging
      && independentAlignmentIds(selectedAlignmentIds()).length >= 2;
    alignHorizontalButton.disabled = !available;
    alignVerticalButton.disabled = !available;
  }

  function alignSelectedElements(orientation) {
    if (state.layoutCommitPending || state.isDragging || state.pointerInteraction || state.flowEditInteraction) return;
    const selectedIds = selectedAlignmentIds();
    const rootIds = independentAlignmentIds(selectedIds);
    if (rootIds.length < 2) {
      showToast('Selecione pelo menos dois elementos independentes; fluxos nao entram no alinhamento.');
      return;
    }
    const aligned = alignedCenterPositions(rootIds.map((id) => {
      const shape = findShape(id);
      const size = effectiveSize(shape, findElement(id));
      return { id, x: shape.x, y: shape.y, width: size.width, height: size.height };
    }), orientation);
    const moves = new Map();
    for (const position of aligned) {
      const root = findShape(position.id);
      const delta = { x: position.x - root.x, y: position.y - root.y };
      for (const id of expandedDragIds([position.id])) {
        const shape = findShape(id);
        if (!shape) continue;
        const move = { id, x: shape.x + delta.x, y: shape.y + delta.y };
        const previous = moves.get(id);
        if (previous && (previous.x !== move.x || previous.y !== move.y)) {
          showToast('Alinhamento recusado: os elementos selecionados possuem dependencias visuais conflitantes.');
          return;
        }
        moves.set(id, move);
      }
    }
    const changedMoves = [...moves.values()].filter((move) => {
      const shape = findShape(move.id);
      return shape && (shape.x !== move.x || shape.y !== move.y);
    });
    if (!changedMoves.length) {
      showToast(`Os ${rootIds.length} elementos ja estao alinhados.`);
      return;
    }
    for (const move of changedMoves) {
      const shape = findShape(move.id);
      shape.x = move.x;
      shape.y = move.y;
    }
    const connectionIds = incidentConnectionIds(changedMoves.map((move) => move.id));
    const routed = routeConnections(connectionIds, false);
    applyRoutedBendpoints(routed);
    const canvas = fittedCanvas(diagramContentBounds());
    state.data.canvas = { ...canvas };
    redrawDiagram();
    state.layoutCommitPending = true;
    updateAlignmentButtons();
    renderStatus(state.data);
    vscode.postMessage({
      type: 'updateLayout',
      layout: {
        moves: changedMoves,
        connections: [...routed].map(([id, bendpoints]) => ({ id, bendpoints })),
        canvas
      }
    });
    const direction = orientation === 'horizontal' ? 'horizontalmente' : 'verticalmente';
    showToast(`Alinhando ${rootIds.length} elementos ${direction} no arquivo .process...`);
  }

  function renderSelectionStyles() {
    for (const overlay of viewport.querySelectorAll('.resize-overlay')) overlay.remove();
    for (const overlay of viewport.querySelectorAll('.flow-edit-overlay')) overlay.remove();
    syncResizeHandleVisibility();
    for (const selected of viewport.querySelectorAll('.selected')) selected.classList.remove('selected');
    for (const id of state.selectedIds) {
      const visual = viewport.querySelector(`[data-id="${cssEscape(id)}"]`);
      visual?.querySelector('.flow')?.classList.add('selected');
      if (visual?.classList.contains('node')) visual.classList.add('selected');
    }
    if (state.selectedIds.length === 1 && !state.isDragging) renderResizeOverlay(state.selectedIds[0]);
    if (state.selectedIds.length === 1 && !state.isDragging) renderFlowEditOverlay(state.selectedIds[0]);
  }

  function syncResizeHandleVisibility() {
    for (const handle of viewport.querySelectorAll('.resize-handle')) {
      handle.setAttribute('visibility', state.isDragging ? 'hidden' : 'visible');
      handle.style.pointerEvents = state.isDragging ? 'none' : '';
    }
  }

  function renderResizeOverlay(id) {
    const shape = findShape(id);
    const element = findElement(id);
    if (!shape || !['BpmnPool', 'BpmnSwimLane'].includes(element?.tag)) return;
    const { width, height } = effectiveSize(shape, element);
    const x = shape.x + width;
    const y = shape.y + height;
    const overlay = svg('g', {
      class: 'resize-handle resize-overlay',
      'aria-label': `Redimensionar ${element.typeLabel}`,
      role: 'button'
    });
    overlay.append(svg('rect', { x: x - 8, y: y - 8, width: 16, height: 16, rx: 2 }));
    overlay.append(svg('path', { d: `M ${x - 4} ${y + 4} L ${x + 4} ${y - 4} M ${x} ${y + 4} L ${x + 4} ${y}` }));
    overlay.addEventListener('pointerdown', (event) => beginResizeInteraction(event, id));
    viewport.append(overlay);
  }

  function renderFlowEditOverlay(id) {
    const connection = state.connectionById.get(id);
    if (!connection || state.layoutCommitPending || state.flowEditInteraction) return;
    const points = connectionPoints(connection);
    if (points.length < 2) return;
    const overlay = svg('g', { class: 'flow-edit-overlay', 'data-flow-id': id });
    const endpointDefinitions = [
      { endpoint: 'source', point: points[0], label: 'Reconectar origem do fluxo' },
      { endpoint: 'target', point: points.at(-1), label: 'Reconectar destino do fluxo' }
    ];
    for (const definition of endpointDefinitions) {
      const handle = svg('circle', {
        cx: definition.point.x,
        cy: definition.point.y,
        r: 7,
        class: `flow-endpoint-handle ${definition.endpoint}`,
        'aria-label': definition.label
      });
      handle.addEventListener('pointerdown', (event) => beginFlowEditInteraction(event, id, definition.endpoint, -1));
      overlay.append(handle);
    }
    connection.bendpoints.forEach((point, index) => {
      const control = svg('g', {
        class: 'flow-bendpoint-control',
        'data-bendpoint-index': index
      });
      control.append(svg('rect', {
        x: point.x - 8,
        y: point.y - 25,
        width: 32,
        height: 34,
        rx: 6,
        class: 'flow-bendpoint-hover-zone'
      }));
      const handle = svg('circle', {
        cx: point.x,
        cy: point.y,
        r: 5,
        class: 'flow-bendpoint-handle',
        'aria-label': 'Mover ponto do fluxo'
      });
      handle.addEventListener('pointerdown', (event) => beginFlowEditInteraction(event, id, 'bendpoint', index));
      control.append(handle);
      const deleteX = point.x + 15;
      const deleteY = point.y - 15;
      const deleteButton = svg('g', {
        class: 'flow-bendpoint-delete',
        role: 'button',
        tabindex: '0',
        'aria-label': 'Excluir ponto do fluxo'
      });
      deleteButton.append(svg('circle', {
        cx: deleteX,
        cy: deleteY,
        r: 8,
        class: 'flow-bendpoint-delete-body'
      }));
      deleteButton.append(svg('path', {
        d: `M ${deleteX - 3} ${deleteY - 3} L ${deleteX + 3} ${deleteY - 3} L ${deleteX + 2.5} ${deleteY + 4} L ${deleteX - 2.5} ${deleteY + 4} Z M ${deleteX - 4.5} ${deleteY - 5} L ${deleteX + 4.5} ${deleteY - 5} M ${deleteX - 1.5} ${deleteY - 7} L ${deleteX + 1.5} ${deleteY - 7}`,
        class: 'flow-bendpoint-delete-icon'
      }));
      deleteButton.addEventListener('pointerdown', stopContextAction);
      deleteButton.addEventListener('click', (event) => deleteFlowBendpoint(event, id, index));
      deleteButton.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') deleteFlowBendpoint(event, id, index);
      });
      control.append(deleteButton);
      overlay.append(control);
    });
    for (let index = 0; index < points.length - 1; index += 1) {
      const from = points[index];
      const to = points[index + 1];
      if (Math.hypot(to.x - from.x, to.y - from.y) < 24) continue;
      const x = (from.x + to.x) / 2;
      const y = (from.y + to.y) / 2;
      const handle = svg('rect', {
        x: x - 4,
        y: y - 4,
        width: 8,
        height: 8,
        transform: `rotate(45 ${x} ${y})`,
        class: 'flow-segment-handle',
        'aria-label': 'Mover segmento do fluxo'
      });
      handle.addEventListener('pointerdown', (event) => beginFlowEditInteraction(event, id, 'segment', index));
      overlay.append(handle);
    }
    viewport.append(overlay);
  }

  function deleteFlowBendpoint(event, connectionId, index) {
    event.preventDefault();
    event.stopPropagation();
    if (state.layoutCommitPending || state.pointerInteraction || state.flowEditInteraction) return;
    const connection = state.connectionById.get(connectionId);
    if (!connection || index < 0 || index >= connection.bendpoints.length) return;
    connection.bendpoints = connection.bendpoints
      .filter((_, candidateIndex) => candidateIndex !== index)
      .map((point) => ({ ...point }));
    state.layoutCommitPending = true;
    renderStatus(state.data);
    redrawDiagram(false);
    vscode.postMessage({
      type: 'updateLayout',
      layout: {
        moves: [],
        connections: [{ id: connectionId, bendpoints: connection.bendpoints.map((point) => ({ ...point })) }],
        canvas: state.data.canvas
      }
    });
    showToast('Gravando a remocao do ponto e redesenhando o fluxo...');
  }

  function beginFlowEditInteraction(event, connectionId, kind, index) {
    if (event.button !== 0 || state.layoutCommitPending || state.pointerInteraction || state.flowEditInteraction) return;
    const connection = state.connectionById.get(connectionId);
    if (!connection) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const endpointEdit = kind === 'source' || kind === 'target';
    const preview = endpointEdit ? svg('path', {
      class: 'connection-preview endpoint-reconnection-preview',
      'marker-end': 'url(#arrow)'
    }) : null;
    if (preview) viewport.append(preview);
    state.flowEditInteraction = {
      connectionId,
      kind,
      index,
      pointerId: event.pointerId,
      startPointer: { x: event.clientX, y: event.clientY },
      originalBendpoints: connection.bendpoints.map((point) => ({ ...point })),
      originalPoints: connectionPoints(connection).map((point) => ({ ...point })),
      sourceId: connection.sourceRef,
      targetId: connection.targetRef,
      candidateId: '',
      currentPointer: { x: event.clientX, y: event.clientY },
      route: null,
      preview,
      moved: false
    };
    if (endpointEdit) scheduleAutoPan();
  }

  function trackFlowEditInteraction(event) {
    const interaction = state.flowEditInteraction;
    if (!interaction || (interaction.pointerId !== undefined && event.pointerId !== interaction.pointerId)) return;
    interaction.currentPointer = { x: event.clientX, y: event.clientY };
    if (!interaction.moved) {
      if (Math.hypot(event.clientX - interaction.startPointer.x, event.clientY - interaction.startPointer.y) < 3) return;
      interaction.moved = true;
      state.isDragging = true;
      for (const overlay of viewport.querySelectorAll('.flow-edit-overlay')) overlay.remove();
      updatePropertiesVisibility();
    }
    if (interaction.kind === 'source' || interaction.kind === 'target') {
      trackFlowEndpointReconnection(interaction, event);
      return;
    }
    const point = diagramPointFromClient({ x: event.clientX, y: event.clientY });
    const snapped = {
      x: Math.max(0, Math.round(point.x / 10) * 10),
      y: Math.max(0, Math.round(point.y / 10) * 10)
    };
    const connection = state.connectionById.get(interaction.connectionId);
    if (!connection) return;
    if (interaction.kind === 'bendpoint') {
      connection.bendpoints = interaction.originalBendpoints.map((item, index) => (
        index === interaction.index ? snapped : { ...item }
      ));
    } else {
      connection.bendpoints = shiftedFlowSegment(interaction.originalPoints, interaction.index, snapped);
    }
    refreshConnections([interaction.connectionId], false);
  }

  function trackFlowEndpointReconnection(interaction, event) {
    const candidate = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.node[data-id]');
    const candidateId = candidate?.dataset.id || '';
    interaction.candidateId = canReconnectFlowEndpoint(interaction, candidateId) ? candidateId : '';
    viewport.querySelectorAll('.connection-target').forEach((node) => node.classList.remove('connection-target'));
    if (interaction.candidateId) candidate.classList.add('connection-target');

    const sourceId = interaction.kind === 'source' ? interaction.candidateId : interaction.sourceId;
    const targetId = interaction.kind === 'target' ? interaction.candidateId : interaction.targetId;
    interaction.route = sourceId && targetId ? routeNewConnection(sourceId, targetId) : null;
    if (interaction.route) {
      interaction.preview.setAttribute('d', straightPathData(interaction.route.points));
      interaction.preview.classList.add('valid-target');
      return;
    }

    interaction.preview.classList.remove('valid-target');
    const pointer = diagramPointFromClient(interaction.currentPointer);
    const fixedId = interaction.kind === 'source' ? interaction.targetId : interaction.sourceId;
    const fixedShape = findShape(fixedId);
    const fixedElement = findElement(fixedId);
    if (!fixedShape || !fixedElement) return;
    const boundary = clientBoundaryPoint(fixedShape, fixedElement, pointer);
    const points = interaction.kind === 'source' ? [pointer, boundary] : [boundary, pointer];
    interaction.preview.setAttribute('d', straightPathData(points));
  }

  function canReconnectFlowEndpoint(interaction, candidateId) {
    if (!candidateId) return false;
    const sourceId = interaction.kind === 'source' ? candidateId : interaction.sourceId;
    const targetId = interaction.kind === 'target' ? candidateId : interaction.targetId;
    if (sourceId === interaction.sourceId && targetId === interaction.targetId) return false;
    if (sourceId === targetId || !canStartConnection(findElement(sourceId))) return false;
    const target = findElement(targetId);
    if (!target || !['BpmnTask', 'BpmnSubProcess', 'BpmnGateway', 'BpmnIntermediateEvent', 'BpmnEndEvent'].includes(target.tag)) return false;
    return !state.data.connections.some((connection) => (
      connection.businessObject !== interaction.connectionId
      && connection.sourceRef === sourceId
      && connection.targetRef === targetId
    ));
  }

  function shiftedFlowSegment(points, segmentIndex, pointer) {
    const from = points[segmentIndex];
    const to = points[segmentIndex + 1];
    if (!from || !to) return points.slice(1, -1).map((point) => ({ ...point }));
    const horizontal = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
    const shiftedFrom = horizontal ? { x: from.x, y: pointer.y } : { x: pointer.x, y: from.y };
    const shiftedTo = horizontal ? { x: to.x, y: pointer.y } : { x: pointer.x, y: to.y };
    const bendpoints = points.slice(1, -1).map((point) => ({ ...point }));
    if (segmentIndex === 0) bendpoints.unshift(shiftedFrom);
    else bendpoints[segmentIndex - 1] = shiftedFrom;
    if (segmentIndex + 1 === points.length - 1) bendpoints.push(shiftedTo);
    else bendpoints[segmentIndex === 0 ? 1 : segmentIndex] = shiftedTo;
    return bendpoints.filter((point, index, values) => (
      index === 0 || point.x !== values[index - 1].x || point.y !== values[index - 1].y
    ));
  }

  function finishFlowEditInteraction(event) {
    const interaction = state.flowEditInteraction;
    if (!interaction || (interaction.pointerId !== undefined && event?.pointerId !== interaction.pointerId)) return;
    const endpointEdit = interaction.kind === 'source' || interaction.kind === 'target';
    const commit = event?.type !== 'pointercancel' && interaction.moved
      && (!endpointEdit || Boolean(interaction.candidateId && interaction.route));
    const connection = state.connectionById.get(interaction.connectionId);
    if (!commit && connection) connection.bendpoints = interaction.originalBendpoints.map((point) => ({ ...point }));
    cancelAutoPan();
    interaction.preview?.remove();
    viewport.querySelectorAll('.connection-target').forEach((node) => node.classList.remove('connection-target'));
    state.flowEditInteraction = null;
    state.isDragging = false;
    redrawDiagram(false);
    updatePropertiesVisibility();
    if (!commit || !connection) return;
    state.layoutCommitPending = true;
    renderStatus(state.data);
    if (endpointEdit) {
      vscode.postMessage({
        type: 'reconnectSequenceFlow',
        reconnection: {
          flowId: interaction.connectionId,
          endpoint: interaction.kind,
          newElementId: interaction.candidateId,
          bendpoints: interaction.route.bendpoints.map((point) => ({ x: point.x, y: point.y }))
        }
      });
      showToast('Gravando a reconexão do fluxo no arquivo .process...');
      return;
    }
    vscode.postMessage({
      type: 'updateLayout',
      layout: {
        moves: [],
        connections: [{ id: interaction.connectionId, bendpoints: connection.bendpoints.map((point) => ({ ...point })) }],
        canvas: state.data.canvas
      }
    });
    showToast('Gravando o ajuste manual do fluxo no arquivo .process...');
  }

  function cancelFlowEditInteraction(redraw = true) {
    const interaction = state.flowEditInteraction;
    if (!interaction) return false;
    const connection = state.connectionById.get(interaction.connectionId);
    if (connection) connection.bendpoints = interaction.originalBendpoints.map((point) => ({ ...point }));
    cancelAutoPan();
    interaction.preview?.remove();
    viewport.querySelectorAll('.connection-target').forEach((node) => node.classList.remove('connection-target'));
    state.flowEditInteraction = null;
    state.isDragging = false;
    if (redraw && state.data) redrawDiagram(false);
    updatePropertiesVisibility();
    return true;
  }

  function clearSelection() {
    setSelection([]);
  }

  function updatePropertiesVisibility() {
    const shouldShow = state.selectedIds.length === 1 && !state.isDragging;
    workspace.classList.toggle('properties-open', shouldShow);
    propertiesPanel.classList.toggle('open', shouldShow);
    propertiesPanel.setAttribute('aria-expanded', String(shouldShow));
    if (!shouldShow) return;
    const id = state.selectedIds[0];
    if (state.renderedPropertyId !== id) renderProperties(findElement(id));
  }

  function beginMarqueeInteraction(event) {
    if (state.activeTool !== 'marquee') return;
    if (event.button !== 0 || state.pointerInteraction || state.taskPlacement || state.containerPlacement || state.palettePlacement || state.layoutCommitPending) return;
    if (event.target.closest?.('.flow-group')) return;
    const hitNode = event.target.closest?.('.node');
    const hitElement = hitNode ? findElement(hitNode.getAttribute('data-id')) : null;
    if (hitNode && !['BpmnPool', 'BpmnSwimLane'].includes(hitElement?.tag)) return;
    const point = diagramPoint(event);
    state.marqueeInteraction = {
      pointerId: event.pointerId,
      startPointer: { x: event.clientX, y: event.clientY },
      start: point,
      current: point,
      originalIds: [...state.selectedIds],
      additive: selectionModifier(event),
      moved: false,
      visual: null
    };
    diagram.setPointerCapture?.(event.pointerId);
  }

  function trackMarqueeInteraction(event) {
    const marquee = state.marqueeInteraction;
    if (!marquee || event.pointerId !== marquee.pointerId) return;
    if (!marquee.moved) {
      if (Math.hypot(event.clientX - marquee.startPointer.x, event.clientY - marquee.startPointer.y) < 4) return;
      marquee.moved = true;
      state.isDragging = true;
      updatePropertiesVisibility();
      marquee.visual = svg('rect', { class: 'selection-marquee' });
      viewport.append(marquee.visual);
    }
    event.preventDefault();
    marquee.current = diagramPoint(event);
    const rectangle = normalizedRectangle(marquee.start, marquee.current);
    setAttributes(marquee.visual, {
      x: rectangle.left,
      y: rectangle.top,
      width: rectangle.width,
      height: rectangle.height
    });
    const enclosed = state.data.shapes
      .filter((shape) => fullyContained(shapeBounds(shape), rectangle))
      .map((shape) => shape.businessObject);
    const selected = marquee.additive
      ? [...new Set([...marquee.originalIds, ...enclosed])]
      : enclosed;
    setSelection(selected, false);
  }

  function finishMarqueeInteraction(event) {
    const marquee = state.marqueeInteraction;
    if (!marquee || (event?.pointerId !== undefined && event.pointerId !== marquee.pointerId)) return;
    const cancelled = event?.type === 'pointercancel';
    if (cancelled) setSelection(marquee.originalIds, false);
    marquee.visual?.remove();
    diagram.releasePointerCapture?.(marquee.pointerId);
    state.marqueeInteraction = null;
    if (!marquee.moved) return;
    state.isDragging = false;
    state.suppressCanvasClick = true;
    setTimeout(() => { state.suppressCanvasClick = false; }, 0);
    updatePropertiesVisibility();
    persistViewState();
    if (!cancelled) showToast(`${state.selectedIds.length} elemento(s) selecionado(s) pela área.`);
  }

  function cancelMarqueeInteraction() {
    const marquee = state.marqueeInteraction;
    if (!marquee?.moved) return false;
    setSelection(marquee.originalIds, false);
    marquee.visual?.remove();
    diagram.releasePointerCapture?.(marquee.pointerId);
    state.marqueeInteraction = null;
    state.isDragging = false;
    updatePropertiesVisibility();
    persistViewState();
    return true;
  }

  function diagramPoint(event) {
    return diagramPointFromClient({ x: event.clientX, y: event.clientY });
  }

  function diagramPointFromClient(clientPoint) {
    const matrix = viewport.getScreenCTM?.();
    if (matrix) {
      const point = diagram.createSVGPoint();
      point.x = clientPoint.x;
      point.y = clientPoint.y;
      const transformed = point.matrixTransform(matrix.inverse());
      return { x: transformed.x, y: transformed.y };
    }
    const rect = diagram.getBoundingClientRect();
    const viewBox = diagram.viewBox?.baseVal;
    const rootScale = viewBox?.width > 0 && rect.width > 0 ? rect.width / viewBox.width : 1;
    const scale = (state.zoom > 0 ? state.zoom : 1) * rootScale;
    return {
      x: (((clientPoint.x - rect.left) / rootScale) + (viewBox?.x || 0)) / (state.zoom > 0 ? state.zoom : 1),
      y: (((clientPoint.y - rect.top) / rootScale) + (viewBox?.y || 0)) / (state.zoom > 0 ? state.zoom : 1)
    };
  }

  function shapeBounds(shape) {
    const size = effectiveSize(shape, findElement(shape.businessObject));
    return {
      left: shape.x,
      top: shape.y,
      right: shape.x + size.width,
      bottom: shape.y + size.height
    };
  }

  function setAttributes(element, attributes) {
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  }

  function beginPointerInteraction(event, id) {
    if (event.button !== 0 || state.connectionInteraction || state.taskPlacement || state.containerPlacement || state.palettePlacement || state.activeTool !== 'select') return;
    if (!isDraggableElement(id)) return;
    if (!selectionModifier(event) && !state.selectedIds.includes(id)) selectElement(id);
    const dragIds = expandedDragIds(state.selectedIds.filter(isDraggableElement));
    if (!dragIds.includes(id)) return;
    const shapes = dragIds.map(findShape).filter(Boolean);
    const anchor = findShape(id);
    if (!anchor || !shapes.length) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    state.pointerInteraction = {
      kind: 'move',
      id,
      pointerId: event.pointerId,
      startPointer: { x: event.clientX, y: event.clientY },
      currentPointer: { x: event.clientX, y: event.clientY },
      startPoint: diagramPoint(event),
      dragIds,
      incidentConnectionIds: incidentConnectionIds(dragIds),
      anchor: { x: anchor.x, y: anchor.y },
      minimum: {
        x: Math.min(...shapes.map((shape) => shape.x)) - state.canvasMinX,
        y: Math.min(...shapes.map((shape) => shape.y)) - state.canvasMinY
      },
      delta: { x: 0, y: 0 },
      moved: false,
      baseCanvas: {
        width: state.data.canvas?.width || state.canvasWidth,
        height: state.data.canvas?.height || state.canvasHeight
      },
      baseViewCanvas: { width: state.canvasWidth, height: state.canvasHeight }
    };
  }

  function beginResizeInteraction(event, id) {
    if (event.button !== 0 || state.layoutCommitPending || state.taskPlacement || state.containerPlacement || state.palettePlacement || state.activeTool !== 'select') return;
    const element = findElement(id);
    const shape = findShape(id);
    if (!shape || !['BpmnPool', 'BpmnSwimLane'].includes(element?.tag)) return;
    if (state.selectedIds.length !== 1 || state.selectedIds[0] !== id) selectElement(id);
    const resizeIds = linkedResizeIds(id);
    if (!resizeIds) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const startSizes = new Map(resizeIds.map((resizeId) => {
      const candidate = findShape(resizeId);
      return [resizeId, {
        x: candidate.x,
        y: candidate.y,
        localX: candidate.localX,
        localY: candidate.localY,
        width: candidate.width,
        height: candidate.height
      }];
    }));
    state.pointerInteraction = {
      kind: 'resize',
      id,
      pointerId: event.pointerId,
      startPointer: { x: event.clientX, y: event.clientY },
      currentPointer: { x: event.clientX, y: event.clientY },
      startPoint: diagramPoint(event),
      resizeIds,
      startSizes,
      minimum: resizeMinimum(id),
      resizes: [],
      moved: false,
      baseCanvas: {
        width: state.data.canvas?.width || state.canvasWidth,
        height: state.data.canvas?.height || state.canvasHeight
      },
      baseViewCanvas: { width: state.canvasWidth, height: state.canvasHeight }
    };
  }

  function linkedResizeIds(id) {
    const element = findElement(id);
    const shape = findShape(id);
    if (element?.tag === 'BpmnPool') {
      const lanes = nestedLaneShapes(id).sort((left, right) => left.localY - right.localY);
      return [id, ...lanes.map((lane) => lane.businessObject)];
    }
    if (element?.tag === 'BpmnSwimLane' && shape?.parentBusinessObject) {
      const parent = findElement(shape.parentBusinessObject);
      const lanes = nestedLaneShapes(shape.parentBusinessObject);
      if (parent?.tag !== 'BpmnPool' || lanes.length !== 1) {
        showToast('Resize recusado: hierarquia de raias ainda nao homologada.');
        return null;
      }
      return [id, parent.id];
    }
    return [id];
  }

  function nestedLaneShapes(poolId) {
    return (state.data?.shapes ?? []).filter((shape) => (
      shape.parentBusinessObject === poolId && findElement(shape.businessObject)?.tag === 'BpmnSwimLane'
    ));
  }

  function resizeMinimum(id) {
    const element = findElement(id);
    const shape = findShape(id);
    let minimum = containerContentMinimum(shape, element);
    if (element?.tag === 'BpmnPool') {
      const lanes = nestedLaneShapes(id).sort((left, right) => left.localY - right.localY);
      let laneMinimumHeight = 0;
      for (const lane of lanes) {
        const laneMinimum = containerContentMinimum(lane, findElement(lane.businessObject));
        minimum.width = Math.max(minimum.width, lane.localX + laneMinimum.width);
        laneMinimumHeight = Math.max(laneMinimumHeight, laneMinimum.height);
      }
      if (lanes.length) minimum.height = Math.max(minimum.height, laneMinimumHeight * lanes.length);
    } else if (shape?.parentBusinessObject) {
      const parent = findShape(shape.parentBusinessObject);
      const parentMinimum = containerContentMinimum(parent, findElement(parent?.businessObject));
      minimum = {
        width: Math.max(minimum.width, parentMinimum.width - shape.localX),
        height: Math.max(minimum.height, parentMinimum.height - shape.localY)
      };
    }
    return minimum;
  }

  function containerContentMinimum(containerShape, element) {
    let width = element?.tag === 'BpmnPool' ? 150 : 120;
    let height = element?.tag === 'BpmnPool' ? 100 : 80;
    if (!containerShape) return { width, height };
    const bounds = shapeBounds(containerShape);
    for (const shape of state.data?.shapes ?? []) {
      if (shape.businessObject === containerShape.businessObject) continue;
      if (['BpmnPool', 'BpmnSwimLane'].includes(findElement(shape.businessObject)?.tag)) continue;
      const childBounds = shapeBounds(shape);
      if (!fullyContained(childBounds, {
        left: bounds.left - 1,
        top: bounds.top - 1,
        right: bounds.right + 1,
        bottom: bounds.bottom + 1
      })) continue;
      width = Math.max(width, Math.ceil(childBounds.right - containerShape.x + 10));
      height = Math.max(height, Math.ceil(childBounds.bottom - containerShape.y + 10));
    }
    return { width, height };
  }

  function trackPointerInteraction(event) {
    const pointer = state.pointerInteraction;
    if (!pointer) return;
    pointer.currentPointer = { x: event.clientX, y: event.clientY };
    if (!pointer.moved) {
      if (Math.hypot(event.clientX - pointer.startPointer.x, event.clientY - pointer.startPointer.y) < 4) return;
      pointer.moved = true;
      state.isDragging = true;
      hideAllContextPads();
      syncResizeHandleVisibility();
      if (pointer.kind === 'move') {
        for (const overlay of viewport.querySelectorAll('.resize-overlay')) overlay.remove();
      }
      updatePropertiesVisibility();
      scheduleAutoPan();
    }
    schedulePointerPreview();
  }

  function schedulePointerPreview() {
    if (state.pointerPreviewFrame) return;
    state.pointerPreviewFrame = requestAnimationFrame(() => {
      state.pointerPreviewFrame = 0;
      const pointer = state.pointerInteraction;
      if (!pointer?.moved) return;
      if (pointer.kind === 'resize') updateResizePreview();
      else updateDragPreview();
    });
  }

  function flushPointerPreview() {
    if (state.pointerPreviewFrame) {
      cancelAnimationFrame(state.pointerPreviewFrame);
      state.pointerPreviewFrame = 0;
    }
    const pointer = state.pointerInteraction;
    if (!pointer?.moved) return;
    if (pointer.kind === 'resize') updateResizePreview();
    else updateDragPreview();
  }

  function cancelPointerPreview() {
    if (!state.pointerPreviewFrame) return;
    cancelAnimationFrame(state.pointerPreviewFrame);
    state.pointerPreviewFrame = 0;
  }

  function finishPointerInteraction(event) {
    const pointer = state.pointerInteraction;
    if (!pointer) return;
    if (event?.type === 'pointercancel') return completePointerInteraction(false);
    if (!pointer.moved) {
      state.pointerInteraction = null;
      return;
    }
    if (Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)) {
      pointer.currentPointer = { x: event.clientX, y: event.clientY };
    }
    flushPointerPreview();
    completePointerInteraction(true);
  }

  function cancelPointerInteraction(event) {
    if (event.key !== 'Escape') return;
    if (cancelTaskPlacement()) {
      event.preventDefault();
      return;
    }
    if (cancelContainerPlacement()) {
      event.preventDefault();
      return;
    }
    if (cancelPalettePlacement()) {
      event.preventDefault();
      return;
    }
    if (state.taskCreationMenu) {
      event.preventDefault();
      closeTaskCreationMenu();
      return;
    }
    if (state.taskConversionMenu) {
      event.preventDefault();
      closeTaskConversionMenu();
      return;
    }
    if (cancelConnectionInteraction()) {
      event.preventDefault();
      showToast('Criação do fluxo cancelada.');
      return;
    }
    if (cancelMarqueeInteraction()) {
      event.preventDefault();
      showToast('Seleção por área cancelada.');
      return;
    }
    if (!state.pointerInteraction?.moved) return;
    event.preventDefault();
    completePointerInteraction(false);
    showToast('Movimentação cancelada; nenhuma posição foi alterada.');
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape' && cancelFlowEditInteraction()) {
      event.preventDefault();
      showToast('Ajuste manual do fluxo cancelado.');
      return;
    }
    if (event.key === 'Delete' && !isEditableTarget(event.target)) {
      if (requestSelectedDeletion()) event.preventDefault();
      return;
    }
    cancelPointerInteraction(event);
  }

  function isEditableTarget(target) {
    return Boolean(target?.isContentEditable || target?.closest?.('input, textarea, select, button, [contenteditable="true"]'));
  }

  function completePointerInteraction(commitPreview) {
    const pointer = state.pointerInteraction;
    if (!pointer) return;
    cancelPointerPreview();
    if (pointer.kind === 'resize') return completeResizeInteraction(pointer, commitPreview);
    const blockedNestedLane = commitPreview
      && pointer.delta?.x === 0
      && pointer.delta?.y === 0
      && findElement(pointer.id)?.tag === 'BpmnSwimLane'
      && Boolean(findShape(pointer.id)?.parentBusinessObject);
    if (blockedNestedLane) {
      cancelAutoPan();
      state.pointerInteraction = null;
      state.isDragging = false;
      redrawDiagram();
      updatePropertiesVisibility();
      showToast('A raia ocupa toda a area util da pool. Mova a pool para deslocar o conjunto.');
      return;
    }
    cancelAutoPan();
    state.suppressClickId = pointer.id;
    setTimeout(() => { if (state.suppressClickId === pointer.id) state.suppressClickId = ''; }, 0);
    let persistentCanvas = pointer.baseViewCanvas;
    let routedConnections = [];
    if (commitPreview) {
      applyDragToClientModel(pointer);
      const routed = routeConnections(incidentConnectionIds(pointer.dragIds), false);
      applyRoutedBendpoints(routed);
      routedConnections = [...routed].map(([id, bendpoints]) => ({ id, bendpoints }));
      persistentCanvas = fittedCanvas(diagramContentBounds());
      state.data.canvas = { ...persistentCanvas };
    }
    else setCanvasDimensions(pointer.baseViewCanvas.width, pointer.baseViewCanvas.height);
    state.pointerInteraction = null;
    state.isDragging = false;
    redrawDiagram();
    updatePropertiesVisibility();
    if (commitPreview) {
      state.layoutPreviewDirty = false;
      state.layoutCommitPending = true;
      renderStatus(state.data);
      const moves = pointer.dragIds.map((id) => {
        const shape = findShape(id);
        return { id, x: shape.x, y: shape.y };
      });
      vscode.postMessage({
        type: 'updateLayout',
        layout: { moves, connections: routedConnections, canvas: persistentCanvas }
      });
      showToast('Gravando a nova posição no arquivo .process...');
    }
  }

  function completeResizeInteraction(pointer, commitPreview) {
    cancelAutoPan();
    state.suppressClickId = pointer.id;
    setTimeout(() => { if (state.suppressClickId === pointer.id) state.suppressClickId = ''; }, 0);
    let persistentCanvas = pointer.baseViewCanvas;
    if (!commitPreview) {
      for (const [id, size] of pointer.startSizes) {
        const shape = findShape(id);
        if (shape) Object.assign(shape, size);
      }
      setCanvasDimensions(pointer.baseViewCanvas.width, pointer.baseViewCanvas.height);
    } else {
      persistentCanvas = fittedCanvas(diagramContentBounds());
      state.data.canvas = { ...persistentCanvas };
    }
    const primary = findShape(pointer.id);
    state.pointerInteraction = null;
    state.isDragging = false;
    redrawDiagram();
    updatePropertiesVisibility();
    if (!commitPreview || !primary) return;
    state.layoutPreviewDirty = false;
    state.layoutCommitPending = true;
    renderStatus(state.data);
    vscode.postMessage({
      type: 'updateLayout',
      layout: {
        moves: [],
        resizes: [{ id: pointer.id, width: primary.width, height: primary.height }],
        connections: [],
        canvas: persistentCanvas
      }
    });
    showToast('Gravando o novo tamanho no arquivo .process...');
  }

  function updateResizePreview() {
    const pointer = state.pointerInteraction;
    if (!pointer?.moved || pointer.kind !== 'resize') return;
    const primaryShape = findShape(pointer.id);
    const primaryElement = findElement(pointer.id);
    const startSize = pointer.startSizes.get(pointer.id);
    if (!primaryShape || !startSize) return;
    const size = snappedResizeSize({
      startSize,
      startPoint: pointer.startPoint,
      currentPoint: diagramPointFromClient(pointer.currentPointer),
      minimum: pointer.minimum,
      grid: 10
    });
    for (const [id, original] of pointer.startSizes) {
      const shape = findShape(id);
      if (shape) Object.assign(shape, original);
    }
    if (primaryElement?.tag === 'BpmnPool') {
      const lanes = nestedLaneShapes(pointer.id).sort((left, right) => left.localY - right.localY);
      const laneHeight = lanes.length ? Math.max(1, Math.round(size.height / lanes.length)) : 0;
      primaryShape.width = size.width;
      primaryShape.height = lanes.length ? laneHeight * lanes.length : size.height;
      lanes.forEach((lane, index) => {
        lane.localY = index * laneHeight;
        lane.y = primaryShape.y + lane.localY;
        lane.width = size.width - lane.localX;
        lane.height = laneHeight;
      });
    } else if (primaryShape.parentBusinessObject) {
      primaryShape.width = size.width;
      primaryShape.height = size.height;
      const parent = findShape(primaryShape.parentBusinessObject);
      if (parent) {
        parent.width = size.width + primaryShape.localX;
        parent.height = size.height + primaryShape.localY;
      }
    } else {
      primaryShape.width = size.width;
      primaryShape.height = size.height;
    }
    pointer.resizes = pointer.resizeIds.map((id) => {
      const shape = findShape(id);
      return { id, width: shape.width, height: shape.height };
    });
    const bounds = diagramContentBounds();
    const expanded = expandedCanvas(state.canvasWidth, state.canvasHeight, bounds);
    if (expanded.width !== state.canvasWidth || expanded.height !== state.canvasHeight) {
      setCanvasDimensions(expanded.width, expanded.height);
    }
    pointer.resizeIds.forEach(updateContainerResizeVisual);
  }

  function updateContainerResizeVisual(id) {
    const shape = findShape(id);
    const element = findElement(id);
    const visual = state.visualById.get(id);
    if (!shape || !visual || !['BpmnPool', 'BpmnSwimLane'].includes(element?.tag)) return;
    const width = shape.width;
    const height = shape.height;
    const body = [...visual.children].find((child) => child.classList?.contains('body'));
    if (body) setAttributes(body, { x: shape.x, y: shape.y, width, height });
    const label = [...visual.children].find((child) => child.classList?.contains('container-label'));
    if (label) {
      const labelX = shape.x + Math.min(15, width / 2);
      const labelY = shape.y + height / 2;
      setAttributes(label, { x: labelX, y: labelY, transform: `rotate(-90 ${labelX} ${labelY})` });
    }
    const badge = [...visual.children].find((child) => child.classList?.contains('element-code'));
    if (!badge || !element.code) return;
    const badgeWidth = Math.max(16, (String(element.code).length * 6) + 6);
    const right = shape.x + width - 3;
    const bottom = shape.y + height - 3;
    const badgeRect = badge.querySelector('rect');
    const badgeText = badge.querySelector('text');
    if (badgeRect) setAttributes(badgeRect, { x: right - badgeWidth, y: bottom - 13, width: badgeWidth, height: 13 });
    if (badgeText) setAttributes(badgeText, { x: right - (badgeWidth / 2), y: bottom - 3 });
  }

  function updateDragPreview() {
    const pointer = state.pointerInteraction;
    if (!pointer?.moved) return;
    pointer.delta = snappedPointDelta({
      startPoint: pointer.startPoint,
      currentPoint: diagramPointFromClient(pointer.currentPointer),
      anchor: pointer.anchor,
      minimum: pointer.minimum,
      grid: 10
    });
    pointer.delta = constrainAttachedEvents(pointer.dragIds, pointer.delta);
    pointer.delta = constrainNestedContainers(pointer.dragIds, pointer.delta);
    pointer.routedBendpoints = null;
    const visualDragIds = pointer.dragIds.filter((id) => {
      const parentId = attachedParentId(findElement(id));
      return !parentId || !pointer.dragIds.includes(parentId);
    });
    for (const id of visualDragIds) {
      const visual = state.visualById.get(id);
      if (!visual) continue;
      visual.setAttribute('transform', `translate(${pointer.delta.x} ${pointer.delta.y})`);
      visual.classList.add('dragging');
    }
    const bounds = dragBounds(pointer.dragIds, pointer.delta);
    const expanded = expandedCanvas(state.canvasWidth, state.canvasHeight, bounds);
    setCanvasDimensions(expanded.width, expanded.height);
    refreshConnections(pointer.incidentConnectionIds, false);
  }

  function dragBounds(ids, delta) {
    const shapes = ids.map(findShape).filter(Boolean);
    return {
      left: Math.min(...shapes.map((shape) => shape.x + delta.x)),
      top: Math.min(...shapes.map((shape) => shape.y + delta.y)),
      right: Math.max(...shapes.map((shape) => {
        const size = effectiveSize(shape, findElement(shape.businessObject));
        return shape.x + delta.x + size.width;
      })),
      bottom: Math.max(...shapes.map((shape) => {
        const size = effectiveSize(shape, findElement(shape.businessObject));
        return shape.y + delta.y + size.height;
      }))
    };
  }

  function attachedDragIds(ids) {
    const expanded = new Set(ids);
    for (const element of state.data?.elements ?? []) {
      const parentId = attachedParentId(element);
      if (parentId && expanded.has(parentId) && isDraggableElement(element.id)) expanded.add(element.id);
    }
    return [...expanded];
  }

  function expandedDragIds(ids) {
    const expanded = new Set(ids);
    let changed = true;
    while (changed) {
      changed = false;
      for (const element of state.data?.elements ?? []) {
        const parentId = attachedParentId(element);
        if (parentId && expanded.has(parentId) && isDraggableElement(element.id) && !expanded.has(element.id)) {
          expanded.add(element.id);
          changed = true;
        }
      }
      for (const containerId of [...expanded]) {
        const container = findElement(containerId);
        const containerShape = findShape(containerId);
        if (!containerShape || !['BpmnPool', 'BpmnSwimLane'].includes(container?.tag)) continue;
        const bounds = shapeBounds(containerShape);
        for (const shape of state.data?.shapes ?? []) {
          if (shape.businessObject === containerId || !isDraggableElement(shape.businessObject)) continue;
          const visuallyNested = shape.parentBusinessObject === containerId;
          if (!visuallyNested && !fullyContained(shapeBounds(shape), bounds)) continue;
          if (!expanded.has(shape.businessObject)) {
            expanded.add(shape.businessObject);
            changed = true;
          }
        }
      }
    }
    return [...expanded];
  }

  function constrainNestedContainers(ids, delta) {
    let constrained = delta;
    for (const id of ids) {
      const shape = findShape(id);
      const element = findElement(id);
      if (element?.tag !== 'BpmnSwimLane' || !shape?.parentBusinessObject || ids.includes(shape.parentBusinessObject)) continue;
      const parentShape = findShape(shape.parentBusinessObject);
      const parentElement = findElement(shape.parentBusinessObject);
      if (!parentShape || parentElement?.tag !== 'BpmnPool') continue;
      constrained = constrainedInsideDelta(
        constrained,
        shapeBounds(shape),
        shapeBounds(parentShape),
        { left: 30 }
      );
    }
    return constrained;
  }

  function constrainAttachedEvents(ids, delta) {
    let constrained = delta;
    for (const id of ids) {
      const element = findElement(id);
      const parentId = attachedParentId(element);
      if (!parentId || ids.includes(parentId)) continue;
      const childShape = findShape(id);
      const parentShape = findShape(parentId);
      if (!childShape || !parentShape) continue;
      constrained = constrainedAttachedDelta(
        constrained,
        shapeBounds(childShape),
        shapeBounds(parentShape)
      );
    }
    return constrained;
  }

  function normalizeAttachedShapePositions() {
    for (const element of state.data?.elements ?? []) {
      const parentId = attachedParentId(element);
      if (!parentId) continue;
      const childShape = findShape(element.id);
      const parentShape = findShape(parentId);
      if (!childShape || !parentShape) continue;
      const correction = constrainedAttachedDelta(
        { x: 0, y: 0 },
        shapeBounds(childShape),
        shapeBounds(parentShape)
      );
      childShape.x += correction.x;
      childShape.y += correction.y;
    }
  }

  function diagramContentBounds() {
    const bounds = state.data?.shapes.map(shapeBounds) ?? [];
    const connectionPoints = (state.data?.connections ?? []).flatMap((connection) => (
      [connection.source, ...(connection.bendpoints ?? []), connection.target]
        .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
    ));
    if (!bounds.length && !connectionPoints.length) return { left: 0, top: 0, right: 0, bottom: 0 };
    return {
      left: Math.min(...bounds.map((item) => item.left), ...connectionPoints.map((point) => point.x)),
      top: Math.min(...bounds.map((item) => item.top), ...connectionPoints.map((point) => point.y)),
      right: Math.max(...bounds.map((item) => item.right), ...connectionPoints.map((point) => point.x)),
      bottom: Math.max(...bounds.map((item) => item.bottom), ...connectionPoints.map((point) => point.y))
    };
  }

  function scheduleAutoPan() {
    if (state.autoPanFrame) return;
    state.autoPanFrame = requestAnimationFrame(autoPanStep);
  }

  function autoPanStep() {
    state.autoPanFrame = 0;
    const pointer = state.pointerInteraction ?? state.flowEditInteraction ?? state.connectionInteraction ?? state.taskPlacement ?? state.containerPlacement ?? state.palettePlacement;
    if (!state.isDragging || !pointer) return;
    const rect = canvasScroller.getBoundingClientRect();
    const velocityX = edgeScrollVelocity(pointer.currentPointer.x - rect.left, rect.width);
    const velocityY = edgeScrollVelocity(pointer.currentPointer.y - rect.top, rect.height);
    if (velocityX > 0 && canvasScroller.scrollLeft + canvasScroller.clientWidth >= canvasScroller.scrollWidth - 2) {
      setCanvasDimensions(state.canvasWidth + 200, state.canvasHeight);
    }
    if (velocityY > 0 && canvasScroller.scrollTop + canvasScroller.clientHeight >= canvasScroller.scrollHeight - 2) {
      setCanvasDimensions(state.canvasWidth, state.canvasHeight + 200);
    }
    const previousX = canvasScroller.scrollLeft;
    const previousY = canvasScroller.scrollTop;
    canvasScroller.scrollLeft += velocityX;
    canvasScroller.scrollTop += velocityY;
    if (canvasScroller.scrollLeft !== previousX || canvasScroller.scrollTop !== previousY) {
      if (state.flowEditInteraction && ['source', 'target'].includes(state.flowEditInteraction.kind)) {
        trackFlowEndpointReconnection(state.flowEditInteraction, pointer.currentPointer);
      } else if (state.connectionInteraction) updateConnectionPreview();
      else if (state.taskPlacement) trackTaskPlacement({ clientX: pointer.currentPointer.x, clientY: pointer.currentPointer.y });
      else if (state.containerPlacement) trackContainerPlacement({ clientX: pointer.currentPointer.x, clientY: pointer.currentPointer.y });
      else if (state.palettePlacement) trackPalettePlacement({ clientX: pointer.currentPointer.x, clientY: pointer.currentPointer.y });
      else schedulePointerPreview();
    }
    scheduleAutoPan();
  }

  function cancelAutoPan() {
    if (!state.autoPanFrame) return;
    cancelAnimationFrame(state.autoPanFrame);
    state.autoPanFrame = 0;
  }

  function applyDragToClientModel(pointer) {
    for (const id of pointer.dragIds) {
      const shape = findShape(id);
      if (!shape) continue;
      shape.x += pointer.delta.x;
      shape.y += pointer.delta.y;
    }
    for (const connection of state.data.connections) {
      if (!pointer.dragIds.includes(connection.sourceRef) || !pointer.dragIds.includes(connection.targetRef)) continue;
      connection.bendpoints = connection.bendpoints.map((point) => ({
        x: point.x + pointer.delta.x,
        y: point.y + pointer.delta.y
      }));
    }
  }

  async function adjustFlows() {
    if (state.routeAdjustment) {
      state.routeAdjustment.cancelled = true;
      routeFlowsButton.textContent = 'Cancelando...';
      showToast('Cancelando o ajuste de fluxos...');
      return;
    }
    if (!state.data?.supported || state.layoutCommitPending || state.isDragging) return;
    const ids = routingScopeConnectionIds();
    if (!ids.length) {
      showToast('Nenhum fluxo disponível para ajustar.');
      return;
    }
    const operation = { cancelled: false, committed: false };
    state.routeAdjustment = operation;
    state.layoutCommitPending = true;
    routeFlowsButton.textContent = `Cancelar ajuste (0/${ids.length})`;
    try {
      const routed = await routeConnectionsAsync(ids, false, operation, (completed, total) => {
        if (!operation.cancelled) routeFlowsButton.textContent = `Cancelar ajuste (${completed}/${total})`;
      });
      if (operation.cancelled) {
        showToast('Ajuste de fluxos cancelado; nenhuma rota foi gravada.');
        return;
      }
      if (!routed.size) {
        showToast('Não foi possível encontrar uma rota segura para os fluxos selecionados.');
        return;
      }
      applyRoutedBendpoints(routed);
      const canvas = fittedCanvas(diagramContentBounds());
      state.data.canvas = { ...canvas };
      redrawDiagram();
      operation.committed = true;
      vscode.postMessage({
        type: 'updateLayout',
        layout: {
          moves: [],
          connections: [...routed].map(([id, bendpoints]) => ({ id, bendpoints })),
          canvas
        }
      });
      showToast(`Ajustando ${routed.size} fluxo(s) no arquivo .process...`);
    } catch (error) {
      showToast(`Falha ao ajustar fluxos: ${error?.message ?? error}`);
    } finally {
      if (!operation.committed) state.layoutCommitPending = false;
      if (state.routeAdjustment === operation) state.routeAdjustment = null;
      routeFlowsButton.textContent = 'Ajustar fluxos';
    }
  }

  function routingScopeConnectionIds() {
    const selectedFlows = state.selectedIds.filter((id) => findElement(id)?.tag === 'SequenceFlow');
    if (selectedFlows.length) return selectedFlows;
    const selectedNodes = state.selectedIds.filter((id) => findElement(id)?.tag !== 'SequenceFlow');
    return selectedNodes.length ? incidentConnectionIds(selectedNodes) : state.data.connections.map((item) => item.businessObject);
  }

  function incidentConnectionIds(elementIds) {
    const selected = new Set(elementIds);
    return state.data.connections
      .filter((connection) => selected.has(connection.sourceRef) || selected.has(connection.targetRef))
      .map((connection) => connection.businessObject);
  }

  function routeConnections(connectionIds, preview) {
    const requested = new Set(connectionIds);
    const routed = new Map();
    const context = routingContext(requested, preview);
    for (const connection of state.data.connections) {
      if (!requested.has(connection.businessObject)) continue;
      routeConnectionInto(connection, preview, context, routed);
    }
    return routed;
  }

  async function routeConnectionsAsync(connectionIds, preview, operation, onProgress) {
    const requested = new Set(connectionIds);
    const routed = new Map();
    const context = routingContext(requested, preview);
    const connections = state.data.connections.filter((connection) => requested.has(connection.businessObject));
    let frameStarted = performance.now();
    for (let index = 0; index < connections.length; index += 1) {
      if (operation.cancelled) break;
      routeConnectionInto(connections[index], preview, context, routed);
      if (performance.now() - frameStarted >= 32 && index < connections.length - 1) {
        onProgress?.(index + 1, connections.length);
        await new Promise((resolve) => requestAnimationFrame(resolve));
        frameStarted = performance.now();
      }
    }
    onProgress?.(connections.length, connections.length);
    return routed;
  }

  function routingContext(requested, preview) {
    const occupiedPaths = state.data.connections
      .filter((connection) => !requested.has(connection.businessObject))
      .map((connection) => routingConnectionPoints(connection, connection.bendpoints, preview))
      .filter((points) => points.length >= 2)
      .map((points) => ({ points, bounds: polylineBounds(points) }));
    const obstacles = state.data.shapes.flatMap((shape) => {
      const element = findElement(shape.businessObject);
      if (!element || ['BpmnPool', 'BpmnSwimLane', 'BpmnGroup'].includes(element.tag)) return [];
      const current = routingShape(shape.businessObject, preview);
      const bounds = shapeBounds(current);
      if ((element.tag.includes('Event') && !isAttachedBoundaryEvent(element))
        || element.tag === 'BpmnGateway' || element.tag === 'BpmnDatabase' || element.tag === 'BpmnDocument') {
        bounds.bottom += 28;
      }
      return [{ id: shape.businessObject, bounds }];
    });
    return { occupiedPaths, obstacles };
  }

  function routeConnectionInto(connection, preview, context, routed) {
    const sourceShape = routingShape(connection.sourceRef, preview);
    const targetShape = routingShape(connection.targetRef, preview);
    if (!sourceShape || !targetShape) return;
    const sourceBounds = shapeBounds(sourceShape);
    const targetBounds = shapeBounds(targetShape);
    const routeInWindow = (padding) => {
      const windowBounds = routingWindow(sourceBounds, targetBounds, padding);
      return routeOrthogonal({
        sourceBounds,
        targetBounds,
        obstacles: context.obstacles
          .filter((item) => item.id !== connection.sourceRef && item.id !== connection.targetRef && boundsIntersect(item.bounds, windowBounds))
          .map((item) => item.bounds),
        existingPaths: context.occupiedPaths
          .filter((item) => boundsIntersect(item.bounds, windowBounds))
          .map((item) => item.points),
        clearance: 16,
        obstacleMargin: 12
      });
    };
    const result = routeInWindow(120) ?? routeInWindow(260);
    if (!result) return;
    routed.set(connection.businessObject, result.bendpoints);
    context.occupiedPaths.push({ points: result.points, bounds: polylineBounds(result.points) });
  }

  function routingWindow(sourceBounds, targetBounds, padding) {
    return {
      left: Math.min(sourceBounds.left, targetBounds.left) - padding,
      top: Math.min(sourceBounds.top, targetBounds.top) - padding,
      right: Math.max(sourceBounds.right, targetBounds.right) + padding,
      bottom: Math.max(sourceBounds.bottom, targetBounds.bottom) + padding
    };
  }

  function boundsIntersect(first, second) {
    return first.left <= second.right && first.right >= second.left
      && first.top <= second.bottom && first.bottom >= second.top;
  }

  function polylineBounds(points) {
    return {
      left: Math.min(...points.map((point) => point.x)),
      top: Math.min(...points.map((point) => point.y)),
      right: Math.max(...points.map((point) => point.x)),
      bottom: Math.max(...points.map((point) => point.y))
    };
  }

  function routingShape(id, preview) {
    const shape = findShape(id);
    if (!shape || !preview) return shape;
    const pointer = state.pointerInteraction;
    return pointer?.moved && pointer.dragIds.includes(id)
      ? { ...shape, x: shape.x + pointer.delta.x, y: shape.y + pointer.delta.y }
      : shape;
  }

  function routingConnectionPoints(connection, bendpoints, preview) {
    const sourceShape = routingShape(connection.sourceRef, preview);
    const targetShape = routingShape(connection.targetRef, preview);
    if (!sourceShape || !targetShape) return [];
    const sourceElement = findElement(connection.sourceRef);
    const targetElement = findElement(connection.targetRef);
    const sourceCenter = shapeCenter(sourceShape, sourceElement);
    const targetCenter = shapeCenter(targetShape, targetElement);
    const firstDirection = bendpoints[0] ?? targetCenter;
    const lastDirection = bendpoints.at(-1) ?? sourceCenter;
    return [
      clientBoundaryPoint(sourceShape, sourceElement, firstDirection),
      ...bendpoints,
      clientBoundaryPoint(targetShape, targetElement, lastDirection)
    ];
  }

  function applyRoutedBendpoints(routed) {
    for (const [id, bendpoints] of routed) {
      const connection = state.connectionById.get(id);
      if (connection) connection.bendpoints = bendpoints.map((point) => ({ ...point }));
    }
  }

  function refreshConnections(connectionIds = null, renderBridges = true) {
    if (!connectionIds) {
      for (const group of viewport.querySelectorAll('.flow-group')) group.remove();
      for (const connection of state.data.connections) state.visualById.delete(connection.businessObject);
      renderConnections(state.data, firstForegroundNode(), null, renderBridges);
      renderSelectionStyles();
      return;
    }
    const uniqueIds = [...new Set(connectionIds)];
    for (const id of uniqueIds) {
      state.visualById.get(id)?.remove();
      state.visualById.delete(id);
    }
    renderConnections(state.data, firstForegroundNode(), uniqueIds, renderBridges);
  }

  function firstForegroundNode() {
    return [...viewport.children].find((node) => (
      node.matches('.node:not(.pool):not(.lane):not(.group)')
    )) ?? viewport.querySelector('.context-pad-layer');
  }

  function redrawDiagram(updateBounds = true) {
    state.visualById.clear();
    state.contextPadById.clear();
    viewport.replaceChildren();
    renderShapes(state.data);
    renderConnections(state.data, firstForegroundNode());
    if (updateBounds) updateCanvasBounds(state.data);
    renderSelectionStyles();
    updateAlignmentButtons();
  }

  function isDraggableElement(id) {
    if (state.layoutCommitPending) return false;
    const element = findElement(id);
    return Boolean(findShape(id)) && element?.tag !== 'BpmnProcess';
  }

  function persistViewState() {
    vscode.setState({
      ...(vscode.getState() ?? {}),
      selectedId: state.selectedId,
      selectedIds: state.selectedIds,
      zoom: state.zoom,
      canvasBackgroundColor: state.canvasBackgroundColor,
      paletteCollapsed: state.paletteCollapsed
    });
  }

  function setCanvasBackground(value, persist = true) {
    const color = /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value).toLowerCase() : '#f5f5f5';
    const red = Number.parseInt(color.slice(1, 3), 16);
    const green = Number.parseInt(color.slice(3, 5), 16);
    const blue = Number.parseInt(color.slice(5, 7), 16);
    const luminance = ((red * 299) + (green * 587) + (blue * 114)) / 1000;
    state.canvasBackgroundColor = color;
    canvasBackgroundColorInput.value = color;
    canvasScroller.style.setProperty('--diagram-background', color);
    canvasScroller.style.setProperty('--diagram-grid-color', luminance < 128 ? 'rgba(255, 255, 255, .14)' : 'rgba(0, 0, 0, .1)');
    if (persist) persistViewState();
  }

  function setPaletteCollapsed(collapsed, persist = true) {
    state.paletteCollapsed = Boolean(collapsed);
    elementPalette.classList.toggle('collapsed', state.paletteCollapsed);
    elementPalette.setAttribute('aria-expanded', String(!state.paletteCollapsed));
    workspace.classList.toggle('palette-collapsed', state.paletteCollapsed);
    paletteToggle.textContent = state.paletteCollapsed ? '›' : '‹';
    const action = state.paletteCollapsed ? 'Exibir paleta' : 'Ocultar paleta';
    paletteToggle.title = action;
    paletteToggle.setAttribute('aria-label', action);
    if (persist) persistViewState();
  }

  function renderProperties(element) {
    if (!element) return clearSelection();
    state.renderedPropertyId = element.id;
    propertyForm.classList.remove('hidden');
    document.getElementById('propertyKind').textContent = element.typeLabel;
    document.getElementById('propertyTitle').textContent = element.name || element.typeLabel;
    document.getElementById('propertyCode').textContent = element.id;
    const canDeleteFlow = element.tag === 'SequenceFlow';
    const canDeleteAttachedError = isDeletableAttachedErrorEvent(element);
    const canDeleteEvent = isDeletableIsolatedEvent(element);
    const canDeleteGateway = isDeletableIsolatedGateway(element);
    const canDeleteTask = isDeletableIsolatedTask(element);
    const canDeleteSubProcess = isDeletableIsolatedSubProcess(element);
    const canDeleteArtifact = isDeletableIsolatedArtifact(element);
    const canDeleteContainer = isDeletableContainer(element);
    deleteButton.classList.toggle('hidden', !canDeleteFlow && !canDeleteAttachedError && !canDeleteEvent && !canDeleteGateway && !canDeleteTask && !canDeleteSubProcess && !canDeleteArtifact && !canDeleteContainer);
    deleteButton.textContent = canDeleteFlow
      ? 'Excluir fluxo'
      : (canDeleteAttachedError
        ? 'Excluir tratativa de erro'
        : (canDeleteTask
        ? 'Excluir atividade'
        : (canDeleteSubProcess
          ? 'Excluir subprocesso'
          : (canDeleteArtifact
            ? artifactDeleteLabel(element)
            : (canDeleteContainer
              ? (element.tag === 'BpmnPool' ? 'Excluir pool' : 'Excluir raia')
              : (canDeleteGateway ? 'Excluir gateway' : 'Excluir evento'))))));
    deleteButton.disabled = false;
    propertyFields.replaceChildren();
    state.formInitial = {};
    for (const property of element.editableProperties) {
      const value = property.value;
      state.formInitial[property.name] = value;
      propertyFields.append(createField(property, value));
    }
    renderProcessGeneralEditor(element);
    renderProcessVersionEditor(element);
    renderProcessFormEditor(element);
    renderProcessAttachmentSecurityEditor(element);
    renderProcessManagerEditor(element);
    renderEventTriggerEditor(element);
    renderEventInitializerEditor(element);
    renderTaskAssignmentEditor(element);
    renderTaskDeadlineEditor(element);
    renderTaskJointEditor(element);
    renderTaskNotificationsEditor(element);
    renderTaskMobileEditor(element);
    renderTaskAttachmentRulesEditor(element);
    renderSubProcessFormMapEditor(element);
    renderGatewayConditionEditor(element);
    renderTaskScriptEditor(element);
    renderExtendedPropertiesEditor(element);
    organizePropertyCategories(element);
    rawPropertyList.replaceChildren();
    Object.entries(element.attributes).sort(([a], [b]) => a.localeCompare(b)).forEach(([name, value]) => {
      const dt = document.createElement('dt'); dt.textContent = name;
      const dd = document.createElement('dd'); dd.textContent = value || '∅';
      rawPropertyList.append(dt, dd);
    });
    updateDirtyState();
  }

  function organizePropertyCategories(element) {
    const children = [...propertyFields.children];
    const generalNodes = [];
    const categorySections = [];
    const generalSectionClasses = [
      'process-general',
      'process-manager',
      'event-trigger',
      'event-initializer',
      'task-assignment',
      'task-deadline',
      'task-joint',
      'task-script',
      'gateway-conditions'
    ];

    for (const child of children) {
      const isGeneralSection = child.tagName === 'SECTION'
        && generalSectionClasses.some((className) => child.classList.contains(className));
      if (child.tagName !== 'SECTION' || isGeneralSection) {
        generalNodes.push(child);
      } else {
        categorySections.push(child);
      }
    }

    propertyFields.replaceChildren();
    if (generalNodes.length) {
      propertyFields.append(createPropertyCategory(element, 'Geral', 'general', generalNodes, true));
    }

    for (const section of categorySections) {
      const heading = section.querySelector(':scope > h3');
      const title = heading?.textContent?.trim() || 'Propriedades';
      heading?.remove();
      const key = [...section.classList].find((className) => className !== 'task-notifications') || title;
      propertyFields.append(createPropertyCategory(element, title, key, [section], false));
    }
  }

  function createPropertyCategory(element, title, key, nodes, openByDefault) {
    const details = document.createElement('details');
    details.className = `property-category property-category-${propertyCategorySlug(key)}`;
    const stateKey = `${element.type}:${key}`;
    details.open = state.propertyCategoryOpen.has(stateKey)
      ? state.propertyCategoryOpen.get(stateKey)
      : openByDefault;

    const summary = document.createElement('summary');
    summary.className = 'property-category-summary';
    const label = document.createElement('span');
    label.textContent = title;
    const action = document.createElement('span');
    action.className = 'property-category-action';
    action.setAttribute('aria-hidden', 'true');
    summary.append(label, action);

    const body = document.createElement('div');
    body.className = 'property-category-body';
    body.append(...nodes);
    details.append(summary, body);
    details.addEventListener('toggle', () => {
      state.propertyCategoryOpen.set(stateKey, details.open);
    });
    return details;
  }

  function propertyCategorySlug(value) {
    return String(value ?? 'properties')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
  }

  function renderProcessGeneralEditor(element) {
    const editor = element.processGeneralEditor;
    if (!editor) return;
    const section = document.createElement('section');
    section.className = 'process-general';
    const title = document.createElement('h3');
    title.textContent = 'Geral do processo';
    section.append(title);

    const readOnlyField = (labelText, value, className) => {
      const label = document.createElement('label');
      label.className = 'process-general-field';
      label.append(document.createTextNode(labelText));
      const input = document.createElement('input');
      input.type = 'text';
      input.readOnly = true;
      input.className = className;
      input.value = value;
      label.append(input);
      return label;
    };
    const textField = (labelText, value, className, multiline = false) => {
      const label = document.createElement('label');
      label.className = 'process-general-field';
      label.append(document.createTextNode(labelText));
      const input = document.createElement(multiline ? 'textarea' : 'input');
      if (!multiline) input.type = 'text';
      input.className = className;
      input.value = value;
      label.append(input);
      return label;
    };
    const selectField = (labelText, currentValue, definitions, className, emptyText) => {
      const label = document.createElement('label');
      label.className = 'process-general-field';
      label.append(document.createTextNode(labelText));
      const select = document.createElement('select');
      select.className = className;
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = emptyText;
      select.append(empty);
      appendSelectOptions(select, definitions);
      select.value = currentValue;
      label.append(select);
      return label;
    };
    const durationField = (labelText, value, className) => {
      const label = textField(labelText, value, className);
      const input = label.querySelector('input');
      input.placeholder = '000:00';
      input.inputMode = 'numeric';
      input.pattern = '\\d{1,6}:[0-5]\\d';
      const unit = document.createElement('small');
      unit.textContent = ' hora(s)';
      label.append(unit);
      return label;
    };
    const expedientField = selectField(
      'Expediente',
      editor.expedient,
      editor.expedientOptions,
      'process-general-expedient',
      'Selecione um expediente'
    );
    const findServerBusinessPeriods = document.createElement('button');
    findServerBusinessPeriods.type = 'button';
    findServerBusinessPeriods.className = 'process-general-find-expedients';
    findServerBusinessPeriods.textContent = 'Buscar expedientes no servidor';
    findServerBusinessPeriods.addEventListener('click', () => {
      const serverId = section.querySelector('.process-general-server').value;
      if (!serverId) {
        showToast('Selecione um servidor para consultar os expedientes.');
        return;
      }
      findServerBusinessPeriods.disabled = true;
      findServerBusinessPeriods.textContent = 'Buscando expedientes...';
      vscode.postMessage({
        type: 'requestServerBusinessPeriods',
        elementId: element.id,
        serverId
      });
    });
    const findServerMechanisms = document.createElement('button');
    findServerMechanisms.type = 'button';
    findServerMechanisms.className = 'process-general-find-mechanisms';
    findServerMechanisms.textContent = 'Atualizar mecanismos do servidor';
    findServerMechanisms.addEventListener('click', () => {
      const serverId = section.querySelector('.process-general-server').value;
      if (!serverId) {
        showToast('Selecione um servidor para consultar os mecanismos.');
        return;
      }
      findServerMechanisms.disabled = true;
      findServerMechanisms.textContent = 'Buscando mecanismos...';
      vscode.postMessage({
        type: 'requestServerMechanisms',
        elementId: element.id,
        serverId
      });
    });
    const complements = editor.complements ?? {
      enabled: false,
      level: '1',
      legacyLevel: '',
      notifyResponsible: false,
      notifyRequisitioner: false,
      notifyManager: false
    };
    const complementsBlock = document.createElement('div');
    complementsBlock.className = 'process-complements';
    const complementsToolbar = document.createElement('div');
    complementsToolbar.className = 'process-complements-toolbar';
    const complementsLabel = document.createElement('label');
    complementsLabel.className = 'process-general-field';
    complementsLabel.append(document.createTextNode('Complementos'));
    const complementsEnabled = document.createElement('select');
    complementsEnabled.className = 'process-general-complements-enabled';
    appendSelectOptions(complementsEnabled, [
      { value: 'true', label: 'Sim' },
      { value: 'false', label: 'Não' }
    ]);
    complementsEnabled.value = complements.enabled ? 'true' : 'false';
    complementsLabel.append(complementsEnabled);
    const configureComplements = document.createElement('button');
    configureComplements.type = 'button';
    configureComplements.className = 'process-general-complements-configure';
    configureComplements.textContent = 'Configurar';
    configureComplements.disabled = !complements.enabled;
    complementsToolbar.append(complementsLabel, configureComplements);

    const complementsPanel = document.createElement('div');
    complementsPanel.className = 'process-complements-panel';
    complementsPanel.hidden = true;
    const levelTitle = document.createElement('strong');
    levelTitle.textContent = 'Quem pode receber complementos';
    complementsPanel.append(levelTitle);
    const currentLevel = complements.level || '1';
    const levelDefinitions = [
      { value: '1', label: 'O solicitante, responsáveis por atividades e gestor' },
      { value: '2', label: 'Todos os participantes do processo e gestor' },
      { value: '3', label: 'Todos os usuários do sistema', disabled: true }
    ];
    for (const definition of levelDefinitions) {
      const label = document.createElement('label');
      label.className = 'process-complements-option';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `process-complements-level-${element.id}`;
      radio.value = definition.value;
      radio.checked = definition.value === currentLevel;
      radio.disabled = definition.disabled;
      label.append(radio, document.createTextNode(definition.label));
      complementsPanel.append(label);
    }
    const legacyLevel = document.createElement('p');
    legacyLevel.className = 'process-complements-legacy';
    legacyLevel.hidden = !complements.legacyLevel;
    legacyLevel.textContent = complements.legacyLevel
      ? `Nível legado ${complements.legacyLevel} preservado. Selecione uma opção para substituí-lo.`
      : '';
    complementsPanel.append(legacyLevel);
    const notificationsTitle = document.createElement('strong');
    notificationsTitle.textContent = 'Notificações';
    complementsPanel.append(notificationsTitle);
    const notificationDefinitions = [
      ['responsible', 'Notifica responsável', complements.notifyResponsible],
      ['requisitioner', 'Notifica requisitante', complements.notifyRequisitioner],
      ['manager', 'Notifica gestor', complements.notifyManager]
    ];
    for (const [key, labelText, checked] of notificationDefinitions) {
      const label = document.createElement('label');
      label.className = 'process-complements-option';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = `process-general-complements-notify-${key}`;
      checkbox.checked = checked;
      label.append(checkbox, document.createTextNode(labelText));
      complementsPanel.append(label);
    }
    configureComplements.addEventListener('click', () => {
      complementsPanel.hidden = !complementsPanel.hidden;
      configureComplements.textContent = complementsPanel.hidden ? 'Configurar' : 'Ocultar configuração';
    });
    complementsEnabled.addEventListener('change', () => {
      const enabled = complementsEnabled.value === 'true';
      configureComplements.disabled = !enabled;
      if (!enabled) {
        complementsPanel.hidden = true;
        configureComplements.textContent = 'Configurar';
      }
    });
    complementsBlock.append(complementsToolbar, complementsPanel);

    const processStateBlock = document.createElement('div');
    processStateBlock.className = 'process-state-options';
    const stateDefinitions = [
      ['active', 'Ativo', editor.active, editor.activeProcessLegacy],
      ['public', 'Público', editor.publicProcess, editor.publicProcessLegacy]
    ];
    for (const [key, labelText, checked, legacyValue] of stateDefinitions) {
      const label = document.createElement('label');
      label.className = 'process-state-option';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = `process-general-${key}`;
      checkbox.checked = checked;
      checkbox.dataset.touched = 'false';
      checkbox.addEventListener('change', () => { checkbox.dataset.touched = 'true'; });
      label.append(checkbox, document.createTextNode(labelText));
      processStateBlock.append(label);
      if (legacyValue) {
        const warning = document.createElement('small');
        warning.className = 'process-state-legacy';
        warning.textContent = `${labelText}: valor legado "${legacyValue}" preservado até este controle ser alterado.`;
        processStateBlock.append(warning);
      }
    }
    const processCodeField = textField('Código', editor.code, 'process-general-code');
    const processCodeHint = document.createElement('small');
    processCodeHint.textContent = 'Ao aplicar, o código será atualizado no documento. Ao salvar, o .process, scripts, literais e artefatos vinculados serão renomeados.';
    processCodeField.append(processCodeHint);
    section.append(
      processCodeField,
      selectField('Servidor', editor.serverId, editor.serverOptions, 'process-general-server', 'Selecione um servidor'),
      readOnlyField('Versão', editor.version, 'process-general-version'),
      textField('Descrição', editor.description, 'process-general-description'),
      textField('Instruções', editor.instruction, 'process-general-instruction', true),
      textField('Categoria', editor.category, 'process-general-category'),
      selectField('Volume', editor.volume, editor.volumeOptions, 'process-general-volume', 'Selecione um volume'),
      findServerMechanisms,
      expedientField,
      findServerBusinessPeriods,
      durationField('Prazo de expiração', editor.deadlineTime, 'process-general-deadline'),
      durationField('Prazo de aviso', editor.warningTime, 'process-general-warning'),
      processStateBlock,
      complementsBlock
    );

    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'primary process-general-apply';
    apply.textContent = 'Aplicar propriedades gerais';
    apply.disabled = true;
    const markDirty = () => { apply.disabled = false; };
    section.addEventListener('input', markDirty);
    section.addEventListener('change', markDirty);
    apply.addEventListener('click', () => requestProcessGeneralUpdate(element, section, apply));
    section.append(apply);
    propertyFields.append(section);
  }

  function renderProcessVersionEditor(element) {
    const editor = element.processVersionEditor;
    if (!editor) return;
    const section = document.createElement('section');
    section.className = 'process-version';
    const title = document.createElement('h3');
    title.textContent = 'Versão';

    const versionLabel = document.createElement('label');
    versionLabel.className = 'process-version-field';
    versionLabel.append(document.createTextNode('Versão'));
    const version = document.createElement('input');
    version.type = 'text';
    version.readOnly = true;
    version.className = 'process-version-number';
    version.value = editor.version;
    versionLabel.append(version);

    const instructionsLabel = document.createElement('label');
    instructionsLabel.className = 'process-version-field';
    instructionsLabel.append(document.createTextNode('Instruções'));
    const instructions = document.createElement('textarea');
    instructions.className = 'process-version-instructions';
    instructions.value = editor.instructions;
    instructionsLabel.append(instructions);

    const updateAttachment = createTaskNotificationCheckbox(
      'Atualiza Anexo', 'process-version-update-attachment', editor.updateAttachment
    );
    const confirmPassword = createTaskNotificationCheckbox(
      'Confirma Senha', 'process-version-confirm-password', editor.confirmPassword
    );
    const mobileProcess = createTaskNotificationCheckbox(
      'Processo Mobile', 'process-version-mobile', editor.mobileProcess
    );
    const flags = document.createElement('div');
    flags.className = 'process-version-options';
    flags.append(updateAttachment, confirmPassword, mobileProcess);

    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'primary process-version-apply';
    apply.textContent = 'Aplicar versão';
    apply.disabled = true;
    const markDirty = () => { apply.disabled = false; };
    section.addEventListener('input', markDirty);
    section.addEventListener('change', markDirty);
    apply.addEventListener('click', () => requestProcessVersionUpdate(element, section, apply));
    section.append(title, versionLabel, instructionsLabel, flags, apply);
    propertyFields.append(section);
  }

  function renderProcessFormEditor(element) {
    const editor = element.processFormEditor;
    if (!editor) return;
    const section = document.createElement('section');
    section.className = 'process-form';
    const title = document.createElement('h3');
    title.textContent = 'Formulário';
    section.append(title);

    const sourceLabel = document.createElement('label');
    sourceLabel.className = 'process-general-field';
    sourceLabel.append(document.createTextNode('Definição de formulário'));
    const source = document.createElement('select');
    source.className = 'process-form-source';
    appendSelectOptions(source, editor.sourceOptions);
    source.value = editor.source;
    sourceLabel.append(source);

    const localLabel = document.createElement('label');
    localLabel.className = 'process-general-field process-form-local';
    localLabel.append(document.createTextNode('Formulário local'));
    const localForm = document.createElement('select');
    localForm.className = 'process-form-local-card';
    const localEmpty = document.createElement('option');
    localEmpty.value = '';
    localEmpty.textContent = editor.localForms.length ? 'Selecione um formulário' : 'Nenhum formulário local encontrado';
    localForm.append(localEmpty);
    appendSelectOptions(localForm, editor.localForms);
    localForm.value = editor.source === 'local' ? editor.cardIndex : '';
    localLabel.append(localForm);

    const serverLabel = document.createElement('label');
    serverLabel.className = 'process-general-field process-form-server';
    serverLabel.append(document.createTextNode('Código do formulário no servidor'));
    const serverCard = document.createElement('input');
    serverCard.type = 'text';
    serverCard.className = 'process-form-server-card';
    serverCard.value = editor.source === 'server' ? editor.cardIndex : '';
    serverCard.placeholder = 'Informe o código/cardIndex';
    const findServerForms = document.createElement('button');
    findServerForms.type = 'button';
    findServerForms.className = 'process-form-find-server';
    findServerForms.textContent = 'Buscar formulários no servidor';
    const remoteFormCombobox = document.createElement('div');
    remoteFormCombobox.className = 'process-form-remote-combobox hidden';
    const remoteFormToggle = document.createElement('button');
    remoteFormToggle.type = 'button';
    remoteFormToggle.className = 'process-form-remote-toggle';
    remoteFormToggle.setAttribute('role', 'combobox');
    remoteFormToggle.setAttribute('aria-expanded', 'false');
    remoteFormToggle.setAttribute('aria-haspopup', 'listbox');
    const remoteFormSelected = document.createElement('span');
    remoteFormSelected.className = 'process-form-remote-selected';
    remoteFormSelected.textContent = 'Selecione um formulário encontrado';
    const remoteFormArrow = document.createElement('span');
    remoteFormArrow.className = 'process-form-remote-arrow';
    remoteFormArrow.textContent = '⌄';
    remoteFormToggle.append(remoteFormSelected, remoteFormArrow);
    const remoteFormPanel = document.createElement('div');
    remoteFormPanel.className = 'process-form-remote-panel hidden';
    const remoteFormSearch = document.createElement('input');
    remoteFormSearch.type = 'search';
    remoteFormSearch.className = 'process-form-remote-search';
    remoteFormSearch.placeholder = 'Buscar por código, nome ou dataset';
    remoteFormSearch.setAttribute('aria-label', 'Buscar formulário do servidor');
    const remoteFormOptions = document.createElement('div');
    remoteFormOptions.className = 'process-form-remote-options';
    remoteFormOptions.setAttribute('role', 'listbox');
    remoteFormPanel.append(remoteFormSearch, remoteFormOptions);
    remoteFormCombobox.append(remoteFormToggle, remoteFormPanel);
    const findServerFields = document.createElement('button');
    findServerFields.type = 'button';
    findServerFields.className = 'process-form-find-fields';
    findServerFields.textContent = 'Buscar campos do formulário';
    findServerForms.addEventListener('click', () => {
      findServerForms.disabled = true;
      findServerForms.textContent = 'Buscando formulários...';
      vscode.postMessage({ type: 'requestServerForms', elementId: element.id });
    });
    serverLabel.append(serverCard, findServerForms, remoteFormCombobox, findServerFields);

    let remoteForms = [];
    const closeRemoteForms = () => {
      remoteFormPanel.classList.add('hidden');
      remoteFormToggle.setAttribute('aria-expanded', 'false');
    };
    const updateRemoteFormSelection = () => {
      const selected = remoteForms.find((form) => String(form.documentId ?? '') === serverCard.value.trim());
      remoteFormSelected.textContent = selected
        ? serverFormDisplayValue(selected)
        : 'Selecione um formulário encontrado';
      remoteFormToggle.title = selected ? serverFormDisplayValue(selected) : '';
    };
    const selectRemoteForm = (form) => {
      const documentId = String(form?.documentId ?? '').trim();
      if (!documentId) return;
      serverCard.value = documentId;
      serverCard.dispatchEvent(new Event('input', { bubbles: true }));
      closeRemoteForms();
      requestServerFields();
    };
    const renderRemoteFormOptions = () => {
      populateServerFormOptions(
        remoteFormOptions,
        remoteForms,
        remoteFormSearch.value,
        serverCard.value,
        selectRemoteForm
      );
    };
    const populateRemoteForms = (forms) => {
      remoteForms = Array.isArray(forms) ? forms : [];
      remoteFormSearch.value = '';
      updateRemoteFormSelection();
      renderRemoteFormOptions();
      remoteFormCombobox.classList.remove('hidden');
    };
    section._populateServerForms = populateRemoteForms;

    const cachedRemoteForms = state.remoteFormCatalogByProcess.get(element.id);
    if (cachedRemoteForms?.serverId === String(element.processGeneralEditor?.serverId ?? '')) {
      populateRemoteForms(cachedRemoteForms.forms);
    }
    remoteFormToggle.addEventListener('click', () => {
      const opening = remoteFormPanel.classList.contains('hidden');
      remoteFormPanel.classList.toggle('hidden', !opening);
      remoteFormToggle.setAttribute('aria-expanded', String(opening));
      if (opening) {
        remoteFormSearch.value = '';
        renderRemoteFormOptions();
        remoteFormSearch.focus();
      }
    });
    remoteFormSearch.addEventListener('input', renderRemoteFormOptions);
    remoteFormSearch.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeRemoteForms();
      remoteFormToggle.focus();
    });
    remoteFormCombobox.addEventListener('focusout', () => {
      setTimeout(() => {
        if (!remoteFormCombobox.contains(document.activeElement)) closeRemoteForms();
      }, 0);
    });

    const options = document.createElement('div');
    options.className = 'process-form-options';
    const unique = checkboxField('Versão única do formulário', 'process-form-unique', editor.uniqueCardVersion);
    const inherit = checkboxField('Registros do formulário herdam segurança', 'process-form-inherit', editor.inheritFormSecurity);
    options.append(unique, inherit);

    const descriptors = document.createElement('div');
    descriptors.className = 'process-form-descriptors';
    const descriptorHeading = document.createElement('div');
    descriptorHeading.className = 'process-form-descriptor-heading';
    const descriptorTitle = document.createElement('strong');
    descriptorTitle.textContent = 'Campos descritores';
    const counter = document.createElement('span');
    counter.className = 'process-form-descriptor-count';
    descriptorHeading.append(descriptorTitle, counter);
    const localDescriptorList = document.createElement('div');
    localDescriptorList.className = 'process-form-local-descriptors';
    const serverDescriptorList = document.createElement('div');
    serverDescriptorList.className = 'process-form-server-descriptors';
    descriptors.append(descriptorHeading, localDescriptorList, serverDescriptorList);

    const existingById = new Map(editor.descriptorFields.map((field) => [field.id, field]));
    const renderCounter = () => {
      const count = source.value === 'local'
        ? localDescriptorList.querySelectorAll('input:checked').length
        : serverDescriptorList.querySelectorAll('input:checked').length;
      counter.textContent = `${count}/${editor.maxDescriptorFields}`;
      for (const checkbox of [...localDescriptorList.querySelectorAll('input[type="checkbox"]'), ...serverDescriptorList.querySelectorAll('input[type="checkbox"]')]) {
        checkbox.disabled = count >= editor.maxDescriptorFields && !checkbox.checked;
      }
    };
    const renderLocalDescriptors = () => {
      localDescriptorList.replaceChildren();
      const selected = editor.localForms.find((form) => form.value === localForm.value);
      if (!selected || !selected.fields.length) {
        const empty = document.createElement('p');
        empty.className = 'process-form-empty';
        empty.textContent = selected ? 'O formulário não possui campos HTML identificáveis.' : 'Selecione um formulário local.';
        localDescriptorList.append(empty);
        renderCounter();
        return;
      }
      for (const field of selected.fields) {
        const label = document.createElement('label');
        label.className = 'process-form-descriptor-option';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = field;
        checkbox.checked = editor.source === 'local'
          && editor.cardIndex === localForm.value
          && existingById.has(field);
        checkbox.addEventListener('change', renderCounter);
        label.append(checkbox, document.createTextNode(field));
        localDescriptorList.append(label);
      }
      renderCounter();
    };
    const renderServerDescriptors = (remoteFields = []) => {
      serverDescriptorList.replaceChildren();
      const selectedCard = serverCard.value.trim();
      const preserveExisting = editor.source === 'server' && editor.cardIndex === selectedCard;
      const fields = [...new Set((remoteFields ?? []).map((field) => String(field ?? '').trim()).filter(Boolean))];
      if (preserveExisting) {
        for (const field of editor.descriptorFields) {
          if (field.id && !fields.includes(field.id)) fields.push(field.id);
        }
      }
      if (!fields.length) {
        const empty = document.createElement('p');
        empty.className = 'process-form-empty';
        empty.textContent = selectedCard
          ? 'Use "Buscar campos do formulário" para carregar o catálogo.'
          : 'Informe ou selecione um formulário do servidor.';
        serverDescriptorList.append(empty);
        renderCounter();
        return;
      }
      for (const field of fields) {
        const current = preserveExisting ? existingById.get(field) : null;
        const label = document.createElement('label');
        label.className = 'process-form-descriptor-option process-form-server-descriptor';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = field;
        checkbox.checked = Boolean(current);
        checkbox.dataset.label = current?.label || field;
        checkbox.dataset.cardIndex = selectedCard;
        checkbox.addEventListener('change', renderCounter);
        label.append(checkbox, document.createTextNode(field));
        serverDescriptorList.append(label);
      }
      renderCounter();
    };
    section._renderServerDescriptors = renderServerDescriptors;

    const requestServerFields = () => {
      const documentId = serverCard.value.trim();
      if (!/^\d+$/.test(documentId) || Number(documentId) <= 0) {
        showToast('Informe ou selecione um código numérico de formulário.');
        return;
      }
      findServerFields.disabled = true;
      findServerFields.textContent = 'Buscando campos...';
      vscode.postMessage({ type: 'requestServerFormFields', elementId: element.id, documentId });
    };
    findServerFields.addEventListener('click', requestServerFields);
    serverCard.addEventListener('input', () => {
      const cached = state.remoteFormFieldCatalogByProcess.get(element.id);
      const fields = cached?.serverId === String(element.processGeneralEditor?.serverId ?? '')
        && cached.documentId === serverCard.value.trim()
        ? cached.fields
        : [];
      renderServerDescriptors(fields);
      updateRemoteFormSelection();
    });

    const cachedRemoteFields = state.remoteFormFieldCatalogByProcess.get(element.id);
    renderServerDescriptors(
      cachedRemoteFields?.serverId === String(element.processGeneralEditor?.serverId ?? '')
        && cachedRemoteFields.documentId === serverCard.value.trim()
        ? cachedRemoteFields.fields
        : []
    );

    const refreshMode = () => {
      const local = source.value === 'local';
      localLabel.classList.toggle('hidden', !local);
      localDescriptorList.classList.toggle('hidden', !local);
      serverLabel.classList.toggle('hidden', local);
      serverDescriptorList.classList.toggle('hidden', local);
      renderCounter();
    };
    source.addEventListener('change', refreshMode);
    localForm.addEventListener('change', renderLocalDescriptors);
    renderLocalDescriptors();
    refreshMode();

    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'primary process-form-apply';
    apply.textContent = 'Aplicar formulário';
    apply.disabled = true;
    const markDirty = () => { apply.disabled = false; };
    section.addEventListener('input', markDirty);
    section.addEventListener('change', markDirty);
    apply.addEventListener('click', () => requestProcessFormUpdate(element, section, apply));
    section.append(sourceLabel, localLabel, serverLabel, options, descriptors, apply);
    propertyFields.append(section);
  }

  function renderProcessAttachmentSecurityEditor(element) {
    const editor = element.processAttachmentSecurityEditor;
    if (!editor) return;
    const section = document.createElement('section');
    section.className = 'process-attachment-security';
    const title = document.createElement('h3');
    title.textContent = 'Segurança Anexos';

    const mode = document.createElement('div');
    mode.className = 'process-attachment-security-mode';
    const radioName = `attachment-security-${element.id}`;
    const control = createAttachmentSecurityRadio(radioName, 'control', 'Controlar segurança', editor.controlled);
    const doNotControl = createAttachmentSecurityRadio(radioName, 'none', 'Não controlar segurança', !editor.controlled);
    mode.append(control, doNotControl);

    const body = document.createElement('div');
    body.className = 'process-attachment-security-body';
    const addBar = document.createElement('div');
    addBar.className = 'process-attachment-security-add';
    const mechanism = document.createElement('select');
    mechanism.className = 'process-attachment-security-new-mechanism gateway-mechanism-select';
    appendMechanismOptions(mechanism, editor.mechanisms, '');
    const add = document.createElement('button');
    add.type = 'button';
    add.textContent = 'Incluir';
    add.addEventListener('click', () => {
      const selected = mechanism.value;
      if (!selected) {
        showToast('Selecione um mecanismo para incluir a regra.');
        return;
      }
      const kind = mechanism.selectedOptions[0]?.dataset.kind ?? 'custom';
      const rule = {
        companyId: 1,
        mechanism: selected,
        mechanismConfiguration: kind === 'custom'
          ? {}
          : defaultGatewayMechanismConfiguration(kind, editor),
        permissions: Object.fromEntries(editor.permissions.map((permission) => [permission.key, true]))
      };
      list.append(createAttachmentSecurityRuleRow(rule, editor, list));
      updateAttachmentSecurityRuleLabels(list);
      mechanism.value = '';
    });
    addBar.append(mechanism, add);

    const list = document.createElement('div');
    list.className = 'process-attachment-security-list';
    for (const rule of editor.rules) {
      list.append(createAttachmentSecurityRuleRow(rule, editor, list));
    }
    updateAttachmentSecurityRuleLabels(list);
    body.append(addBar, list);

    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'primary process-attachment-security-apply';
    apply.textContent = 'Aplicar segurança de anexos';
    apply.disabled = true;
    const markDirty = () => { apply.disabled = false; };
    const refreshMode = () => {
      body.hidden = section.querySelector('input[name="' + radioName + '"]:checked')?.value !== 'control';
      markDirty();
    };
    control.querySelector('input').addEventListener('change', refreshMode);
    doNotControl.querySelector('input').addEventListener('change', refreshMode);
    section.addEventListener('input', markDirty);
    section.addEventListener('change', markDirty);
    apply.addEventListener('click', () => requestProcessAttachmentSecurityUpdate(element, section, apply));
    body.hidden = !editor.controlled;
    section.append(title, mode, body, apply);
    propertyFields.append(section);
  }

  function createAttachmentSecurityRadio(name, value, labelText, checked) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = value;
    input.checked = checked;
    label.append(input, document.createTextNode(` ${labelText}`));
    return label;
  }

  function appendMechanismOptions(select, mechanisms, current) {
    for (const item of mechanisms) {
      const option = document.createElement('option');
      option.value = item.value;
      option.dataset.kind = item.kind;
      option.textContent = item.label;
      option.selected = item.value === current;
      select.append(option);
    }
  }

  function createAttachmentSecurityRuleRow(rule, editor, list) {
    const row = document.createElement('article');
    row.className = 'process-attachment-security-rule';
    row.dataset.companyId = String(rule.companyId || 1);
    const heading = document.createElement('div');
    heading.className = 'process-attachment-security-rule-heading';
    const label = document.createElement('strong');
    label.className = 'process-attachment-security-rule-label';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remover';
    remove.addEventListener('click', () => {
      row.remove();
      updateAttachmentSecurityRuleLabels(list);
    });
    heading.append(label, remove);

    const mechanismLabel = document.createElement('label');
    mechanismLabel.className = 'process-attachment-security-field';
    mechanismLabel.append(document.createTextNode('Atribuição'));
    const mechanism = document.createElement('select');
    mechanism.className = 'process-attachment-security-mechanism gateway-mechanism-select';
    appendMechanismOptions(mechanism, editor.mechanisms, rule.mechanism);
    mechanismLabel.append(mechanism);

    const configuration = document.createElement('div');
    configuration.className = 'gateway-mechanism-configuration process-attachment-security-configuration';
    const renderConfiguration = (value) => {
      const kind = mechanism.selectedOptions[0]?.dataset.kind ?? 'custom';
      renderGatewayMechanismConfiguration(configuration, mechanism.value, value, editor);
      configuration.hidden = !mechanism.value || kind === 'custom';
      row.dataset.mechanismConfigured = mechanism.value ? 'true' : 'false';
    };
    renderConfiguration(rule.mechanismConfiguration);
    mechanism.addEventListener('change', () => {
      renderConfiguration(null);
      updateAttachmentSecurityRuleLabels(list);
    });

    const permissions = document.createElement('fieldset');
    permissions.className = 'process-attachment-security-permissions';
    const legend = document.createElement('legend');
    legend.textContent = 'Permissões';
    permissions.append(legend);
    for (const permission of editor.permissions) {
      const permissionLabel = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.permissionKey = permission.key;
      input.checked = rule.permissions?.[permission.key] === true;
      permissionLabel.append(input, document.createTextNode(` ${permission.label}`));
      permissions.append(permissionLabel);
    }
    row.append(heading, mechanismLabel, configuration, permissions);
    return row;
  }

  function updateAttachmentSecurityRuleLabels(list) {
    [...list.querySelectorAll('.process-attachment-security-rule')].forEach((row, index) => {
      const select = row.querySelector('.process-attachment-security-mechanism');
      const mechanism = select?.selectedOptions[0]?.textContent || 'Mecanismo';
      row.querySelector('.process-attachment-security-rule-label').textContent = `Regra ${index + 1} — ${mechanism}`;
    });
  }

  function serverFormDisplayValue(form) {
    const documentId = String(form?.documentId ?? '').trim();
    const description = String(form?.documentDescription ?? '').trim();
    const dataset = String(form?.datasetName ?? '').trim();
    return `${documentId}${description ? ` — ${description}` : ''}${dataset ? ` [${dataset}]` : ''}`;
  }

  function normalizeServerFormSearch(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-BR')
      .trim();
  }

  function filterServerForms(forms, query) {
    const catalog = Array.isArray(forms) ? forms : [];
    const terms = normalizeServerFormSearch(query).split(/\s+/).filter(Boolean);
    if (!terms.length) return catalog;
    return catalog.filter((form) => {
      const searchable = normalizeServerFormSearch(serverFormDisplayValue(form));
      return terms.every((term) => searchable.includes(term));
    });
  }

  function populateServerFormOptions(container, forms, query, currentValue, onSelect) {
    container.replaceChildren();
    const catalog = Array.isArray(forms) ? forms : [];
    const filtered = filterServerForms(catalog, query);
    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'process-form-remote-empty';
      empty.textContent = catalog.length ? 'Nenhum formulário corresponde à busca.' : 'Nenhum formulário encontrado.';
      container.append(empty);
      return;
    }
    const current = String(currentValue ?? '');
    for (const form of filtered) {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'process-form-remote-option';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(String(form.documentId ?? '') === current));
      option.textContent = serverFormDisplayValue(form);
      option.title = option.textContent;
      option.addEventListener('click', () => onSelect(form));
      container.append(option);
    }
  }

  function updateServerFormCatalogControls(elementId, forms, loading) {
    if (state.selectedIds.length !== 1 || state.selectedIds[0] !== elementId) return;
    const section = propertyFields.querySelector('.process-form');
    if (!section) return;
    const button = section.querySelector('.process-form-find-server');
    if (button) {
      button.disabled = loading;
      button.textContent = loading ? 'Buscando formulários...' : 'Buscar formulários no servidor';
    }
    if (!loading && Array.isArray(forms) && typeof section._populateServerForms === 'function') {
      section._populateServerForms(forms);
    }
  }

  function updateServerFormFieldControls(elementId, documentId, fields, loading) {
    if (state.selectedIds.length !== 1 || state.selectedIds[0] !== elementId) return;
    const section = propertyFields.querySelector('.process-form');
    if (!section) return;
    const button = section.querySelector('.process-form-find-fields');
    const card = section.querySelector('.process-form-server-card');
    if (button) {
      button.disabled = loading;
      button.textContent = loading ? 'Buscando campos...' : 'Buscar campos do formulário';
    }
    if (!loading
      && Array.isArray(fields)
      && String(card?.value ?? '').trim() === String(documentId ?? '').trim()
      && typeof section._renderServerDescriptors === 'function') {
      section._renderServerDescriptors(fields);
    }
  }

  function updateServerBusinessPeriodControls(elementId, periods, loading) {
    if (state.selectedIds.length !== 1 || state.selectedIds[0] !== elementId) return;
    const section = propertyFields.querySelector('.process-general');
    if (!section) return;
    const button = section.querySelector('.process-general-find-expedients');
    if (button) {
      button.disabled = loading;
      button.textContent = loading ? 'Buscando expedientes...' : 'Buscar expedientes no servidor';
    }
    if (!loading && Array.isArray(periods)) refreshRenderedBusinessPeriodSelects(periods);
  }

  function updateServerDesignCatalogControls(elementId, mechanisms, volumes, loading) {
    if (state.selectedIds.length !== 1 || state.selectedIds[0] !== elementId) return;
    const section = propertyFields.querySelector('.process-general');
    if (!section) return;
    const button = section.querySelector('.process-general-find-mechanisms');
    if (button) {
      button.disabled = loading;
      button.textContent = loading ? 'Buscando mecanismos...' : 'Atualizar mecanismos do servidor';
    }
    if (!loading && Array.isArray(mechanisms) && Array.isArray(volumes)) {
      refreshRenderedServerDesignCatalogs();
    }
  }

  function checkboxField(labelText, className, checked) {
    const label = document.createElement('label');
    label.className = 'process-form-checkbox';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = className;
    input.checked = checked;
    label.append(input, document.createTextNode(labelText));
    return label;
  }

  function renderEventTriggerEditor(element) {
    const editor = element.eventTriggerEditor;
    if (!editor) return;
    const section = document.createElement('section');
    section.className = 'event-trigger';
    const title = document.createElement('h3');
    title.textContent = 'Agendamento Quartz';
    section.append(title);
    if (!editor.supported) {
      const warning = document.createElement('p');
      warning.className = 'event-trigger-warning';
      warning.textContent = editor.reason;
      section.append(warning);
      propertyFields.append(section);
      return;
    }

    const runTypeLabel = document.createElement('label');
    runTypeLabel.className = 'event-trigger-field';
    runTypeLabel.append(document.createTextNode('Frequência'));
    const runType = document.createElement('select');
    runType.className = 'event-trigger-run-type';
    for (const definition of editor.runTypes) {
      const option = document.createElement('option');
      option.value = definition.value;
      option.textContent = definition.label;
      option.selected = definition.value === editor.runType;
      runType.append(option);
    }
    runTypeLabel.append(runType);

    const intervalLabel = document.createElement('label');
    intervalLabel.className = 'event-trigger-field event-trigger-interval';
    const intervalCaption = document.createElement('span');
    const interval = document.createElement('select');
    interval.className = 'event-trigger-frequency';
    intervalLabel.append(intervalCaption, interval);

    const ordinalLabel = document.createElement('label');
    ordinalLabel.className = 'event-trigger-field event-trigger-ordinal';
    ordinalLabel.append(document.createTextNode('No'));
    const ordinal = document.createElement('select');
    ordinal.className = 'event-trigger-frequency-ordinal';
    for (const definition of editor.ordinalOptions) {
      const option = document.createElement('option');
      option.value = definition.value;
      option.textContent = definition.label;
      ordinal.append(option);
    }
    ordinal.value = editor.frequency;
    ordinalLabel.append(ordinal);

    const weekdayLabel = document.createElement('label');
    weekdayLabel.className = 'event-trigger-field event-trigger-weekday';
    weekdayLabel.append(document.createTextNode('Dia da semana'));
    const weekday = document.createElement('select');
    weekday.className = 'event-trigger-day-of-week';
    for (const definition of editor.weekdayOptions) {
      const option = document.createElement('option');
      option.value = definition.value;
      option.textContent = definition.label;
      weekday.append(option);
    }
    weekday.value = editor.dayOfWeek || 'SUN';
    weekdayLabel.append(weekday);

    const weekdays = document.createElement('fieldset');
    weekdays.className = 'event-trigger-weekdays';
    const weekdaysLegend = document.createElement('legend');
    weekdaysLegend.textContent = 'Dias da semana';
    weekdays.append(weekdaysLegend);
    const selectedDays = new Set(editor.weekdays || []);
    for (const definition of editor.weekdayOptions) {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = definition.value;
      checkbox.className = 'event-trigger-weekday-checkbox';
      checkbox.checked = selectedDays.has(definition.value);
      label.append(checkbox, document.createTextNode(definition.label));
      weekdays.append(label);
    }

    const timeLabel = document.createElement('label');
    timeLabel.className = 'event-trigger-field event-trigger-time-field';
    timeLabel.append(document.createTextNode('Horário'));
    const time = document.createElement('input');
    time.type = 'time';
    time.step = '1';
    time.className = 'event-trigger-time';
    time.value = editor.time || '00:00:00';
    timeLabel.append(time);

    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'primary event-trigger-apply';
    apply.textContent = 'Aplicar agendamento';
    apply.disabled = true;
    const markDirty = () => { apply.disabled = false; };
    const refresh = () => {
      const type = runType.value;
      const intervalVisible = ['MINUTE', 'HOUR', 'DAY', 'MONTH'].includes(type);
      intervalLabel.hidden = !intervalVisible;
      ordinalLabel.hidden = type !== 'WEEK_MONTH';
      weekdayLabel.hidden = type !== 'WEEK_MONTH';
      weekdays.hidden = type !== 'WEEK_DAY';
      timeLabel.hidden = ['MINUTE', 'HOUR'].includes(type);
      const maximum = type === 'MINUTE' ? 59 : type === 'HOUR' ? 23 : 31;
      const previous = Number.parseInt(interval.value || editor.frequency, 10);
      interval.replaceChildren();
      for (let value = 1; value <= maximum; value += 1) {
        const option = document.createElement('option');
        option.value = String(value).padStart(2, '0');
        option.textContent = option.value;
        interval.append(option);
      }
      interval.value = String(Math.min(Math.max(previous || 1, 1), maximum)).padStart(2, '0');
      intervalCaption.textContent = type === 'MONTH' ? 'Dia' : 'A cada';
    };
    runType.addEventListener('change', () => { refresh(); markDirty(); });
    section.addEventListener('input', markDirty);
    section.addEventListener('change', markDirty);
    apply.addEventListener('click', () => requestEventTriggerUpdate(element, section, apply));

    section.append(runTypeLabel, intervalLabel, ordinalLabel, weekdayLabel, weekdays, timeLabel, apply);
    propertyFields.append(section);
    refresh();
    apply.disabled = true;
  }

  function renderEventInitializerEditor(element) {
    const editor = element.eventInitializerEditor;
    if (!editor) return;
    const section = document.createElement('section');
    section.className = 'event-initializer';
    const title = document.createElement('h3');
    title.textContent = 'Inicializador';
    section.append(title);
    if (!editor.supported) {
      const warning = document.createElement('p');
      warning.className = 'event-initializer-warning';
      warning.textContent = editor.reason;
      section.append(warning);
      propertyFields.append(section);
      return;
    }
    const label = document.createElement('label');
    label.className = 'event-initializer-field';
    label.append(document.createTextNode('Usuário'));
    const select = document.createElement('select');
    select.className = 'event-initializer-user';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = editor.options.length ? 'Selecione um usuário' : 'Nenhum usuário encontrado no cache';
    select.append(empty);
    for (const definition of editor.options) {
      const option = document.createElement('option');
      option.value = definition.value;
      option.textContent = definition.label;
      select.append(option);
    }
    select.value = editor.userId;
    label.append(select);
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'primary event-initializer-apply';
    apply.textContent = editor.userId ? 'Alterar inicializador' : 'Aplicar inicializador';
    apply.disabled = true;
    select.addEventListener('change', () => { apply.disabled = false; });
    apply.addEventListener('click', () => requestEventInitializerUpdate(element, section, apply));
    section.append(label, apply);
    propertyFields.append(section);
  }

  function renderTaskNotificationsEditor(element) {
    const editor = element.taskNotificationsEditor;
    if (!editor) return;
    const trackingSection = document.createElement('section');
    trackingSection.className = 'task-notifications task-tracking';

    const trackingTitle = document.createElement('h3');
    trackingTitle.textContent = 'Acompanhamento';
    const notifyResponsible = createTaskNotificationCheckbox(
      'Notificar responsável', 'task-notify-responsible', editor.notifyResponsible
    );
    const notifyRequester = createTaskNotificationCheckbox(
      'Notificar requisitante', 'task-notify-requester', editor.notifyRequester
    );

    const trackingApply = document.createElement('button');
    trackingApply.type = 'button';
    trackingApply.className = 'primary task-notifications-apply';
    trackingApply.textContent = 'Aplicar acompanhamento';
    trackingApply.disabled = true;
    trackingSection.addEventListener('input', () => { trackingApply.disabled = false; });
    trackingSection.addEventListener('change', () => { trackingApply.disabled = false; });
    trackingApply.addEventListener('click', () => requestTaskNotificationsUpdate(element, propertyFields, trackingApply));
    trackingSection.append(trackingTitle, notifyResponsible, notifyRequester, trackingApply);

    const lateSection = document.createElement('section');
    lateSection.className = 'task-notifications task-late';
    const lateTitle = document.createElement('h3');
    lateTitle.textContent = 'Atraso';
    const responsible = createTaskLateGroup('Responsável', 'responsible', editor);
    const requester = createTaskLateGroup('Requisitante', 'requester', editor);
    const lateApply = document.createElement('button');
    lateApply.type = 'button';
    lateApply.className = 'primary task-notifications-apply';
    lateApply.textContent = 'Aplicar atraso';
    lateApply.disabled = true;
    lateSection.addEventListener('input', () => { lateApply.disabled = false; });
    lateSection.addEventListener('change', () => { lateApply.disabled = false; });
    lateApply.addEventListener('click', () => requestTaskNotificationsUpdate(element, propertyFields, lateApply));
    lateSection.append(lateTitle, responsible, requester, lateApply);

    propertyFields.append(trackingSection, lateSection);
  }

  function renderTaskJointEditor(element) {
    const editor = element.taskJointEditor;
    if (!editor) return;
    const section = document.createElement('section');
    section.className = 'task-joint';
    const title = document.createElement('h3');
    title.textContent = 'Execução conjunta';
    section.append(title);
    if (!editor.supported) {
      const warning = document.createElement('p');
      warning.className = 'task-joint-warning';
      warning.textContent = editor.reason;
      section.append(warning);
      propertyFields.append(section);
      return;
    }

    const joint = createTaskNotificationCheckbox('Atividade conjunta', 'task-joint-enabled', editor.joint);
    const consensusLabel = document.createElement('label');
    consensusLabel.className = 'task-joint-consensus-field';
    consensusLabel.append(document.createTextNode('% Consenso'));
    const consensus = document.createElement('input');
    consensus.type = 'number';
    consensus.min = '1';
    consensus.max = '100';
    consensus.step = '1';
    consensus.className = 'task-joint-consensus';
    consensus.value = editor.consensus;
    consensusLabel.append(consensus);
    const neverSelect = createTaskNotificationCheckbox(
      'Quando conjunta, nunca seleciona colaboradores',
      'task-joint-never-select',
      editor.neverSelectCollaborators
    );
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'primary task-joint-apply';
    apply.textContent = 'Aplicar execução conjunta';
    apply.disabled = true;
    const markDirty = () => { apply.disabled = false; };
    const refresh = () => {
      const neverSelectInput = neverSelect.querySelector('input');
      const jointInput = joint.querySelector('input');
      if (neverSelectInput.checked) jointInput.checked = true;
      if (!jointInput.checked) neverSelectInput.checked = false;
      consensus.disabled = !jointInput.checked;
    };
    joint.querySelector('input').addEventListener('change', () => { refresh(); markDirty(); });
    neverSelect.querySelector('input').addEventListener('change', () => { refresh(); markDirty(); });
    consensus.addEventListener('input', markDirty);
    apply.addEventListener('click', () => requestTaskJointUpdate(element, section, apply));
    section.append(joint, consensusLabel, neverSelect, apply);
    propertyFields.append(section);
    refresh();
    apply.disabled = true;
  }

  function renderTaskDeadlineEditor(element) {
    const editor = element.taskDeadlineEditor;
    if (!editor) return;
    const section = document.createElement('section');
    section.className = 'task-deadline';
    const title = document.createElement('h3');
    title.textContent = 'Expediente e prazo de conclusão';
    section.append(title);
    if (!editor.supported) {
      const warning = document.createElement('p');
      warning.className = 'task-deadline-warning';
      warning.textContent = editor.reason;
      section.append(warning);
      propertyFields.append(section);
      return;
    }

    const expedientLabel = document.createElement('label');
    expedientLabel.className = 'task-deadline-field';
    expedientLabel.append(document.createTextNode('Expediente'));
    const expedient = document.createElement('select');
    expedient.className = 'task-deadline-expedient';
    const emptyExpedient = document.createElement('option');
    emptyExpedient.value = '';
    emptyExpedient.textContent = editor.expedientOptions.length
      ? 'Selecione um expediente'
      : 'Nenhum expediente encontrado no cache';
    expedient.append(emptyExpedient);
    appendSelectOptions(expedient, editor.expedientOptions);
    expedient.value = editor.expedient;
    expedientLabel.append(expedient);

    const modeLabel = document.createElement('label');
    modeLabel.className = 'task-deadline-field';
    modeLabel.append(document.createTextNode('Prazo de conclusão'));
    const mode = document.createElement('select');
    mode.className = 'task-deadline-mode';
    appendSelectOptions(mode, [
      { value: 'fixed', label: 'Valor fixo' },
      { value: 'form', label: 'Campo de formulário' }
    ]);
    mode.value = editor.mode;
    modeLabel.append(mode);

    const fixedLabel = document.createElement('label');
    fixedLabel.className = 'task-deadline-field task-deadline-fixed-field';
    fixedLabel.append(document.createTextNode('Horas (HHH:mm)'));
    const fixed = document.createElement('input');
    fixed.type = 'text';
    fixed.inputMode = 'numeric';
    fixed.placeholder = '000:00';
    fixed.className = 'task-deadline-fixed';
    fixed.value = editor.fixedDuration;
    fixedLabel.append(fixed);

    const formLabel = document.createElement('label');
    formLabel.className = 'task-deadline-field task-deadline-form-field';
    formLabel.append(document.createTextNode('Campo do formulário'));
    const formField = document.createElement('select');
    formField.className = 'task-deadline-form';
    const emptyField = document.createElement('option');
    emptyField.value = '';
    emptyField.textContent = editor.formFieldOptions.length
      ? 'Selecione um campo'
      : 'Nenhum campo encontrado no formulário';
    formField.append(emptyField);
    appendSelectOptions(formField, editor.formFieldOptions);
    formField.value = editor.deadlineFieldName;
    formLabel.append(formField);

    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'primary task-deadline-apply';
    apply.textContent = 'Aplicar expediente e prazo';
    apply.disabled = true;
    const markDirty = () => { apply.disabled = false; };
    const refresh = () => {
      fixedLabel.hidden = mode.value !== 'fixed';
      formLabel.hidden = mode.value !== 'form';
    };
    mode.addEventListener('change', () => { refresh(); markDirty(); });
    section.addEventListener('input', markDirty);
    section.addEventListener('change', markDirty);
    apply.addEventListener('click', () => requestTaskDeadlineUpdate(element, section, apply));
    section.append(expedientLabel, modeLabel, fixedLabel, formLabel, apply);
    propertyFields.append(section);
    refresh();
    apply.disabled = true;
  }

  function appendSelectOptions(select, definitions) {
    for (const definition of definitions) {
      const option = document.createElement('option');
      option.value = definition.value;
      option.textContent = definition.label;
      select.append(option);
    }
  }

  function renderTaskMobileEditor(element) {
    const editor = element.taskMobileEditor;
    if (!editor) return;
    const section = document.createElement('section');
    section.className = 'task-mobile';
    const title = document.createElement('h3');
    title.textContent = 'Mobile';
    section.append(title);

    const titleInput = createTaskMobileTextField(section, 'Título', 'title', editor.title, editor.limits.title, false);
    const highlightInput = createTaskMobileTextField(section, 'Destaque', 'highlight', editor.highlight, editor.limits.highlight, false);
    const descriptionInput = createTaskMobileTextField(section, 'Descrição', 'description', editor.description, editor.limits.description, true);
    let activeTextField = titleInput;
    for (const input of [titleInput, highlightInput, descriptionInput]) {
      input.addEventListener('focus', () => { activeTextField = input; });
    }

    let helper = null;
    if (editor.formFields.length) {
      helper = document.createElement('div');
      helper.className = 'task-mobile-form-helper';
      const formField = document.createElement('select');
      formField.className = 'task-mobile-form-field';
      for (const field of editor.formFields) {
        const option = document.createElement('option');
        option.value = field;
        option.textContent = field;
        formField.append(option);
      }
      const insert = document.createElement('button');
      insert.type = 'button';
      insert.textContent = 'Inserir campo';
      insert.addEventListener('click', () => {
        const token = `@[form:${formField.value}]`;
        const start = activeTextField.selectionStart ?? activeTextField.value.length;
        const end = activeTextField.selectionEnd ?? start;
        const next = activeTextField.value.slice(0, start) + token + activeTextField.value.slice(end);
        const maximum = Number(activeTextField.dataset.mobileLimit);
        const literalLength = next.replace(/@\[form:[^\]]+\]/g, '').length;
        if (literalLength > maximum) {
          showToast(`O campo aceita no máximo ${maximum} caracteres de texto, além dos campos do formulário.`);
          return;
        }
        activeTextField.value = next;
        activeTextField.focus();
        activeTextField.setSelectionRange(start + token.length, start + token.length);
        activeTextField.dispatchEvent(new Event('input', { bubbles: true }));
      });
      helper.append(formField, insert);
      section.append(helper);
    }

    const actionsTitle = document.createElement('h4');
    actionsTitle.textContent = 'Ações';
    section.append(
      actionsTitle,
      createTaskMobileActionField('Rejeitar', 'reject', editor.reject, editor.actionOptions),
      createTaskMobileActionField('Aprovar', 'approve', editor.approve, editor.actionOptions)
    );

    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'primary task-mobile-apply';
    apply.textContent = 'Aplicar configuração Mobile';
    apply.disabled = true;
    section.addEventListener('input', () => { apply.disabled = false; });
    section.addEventListener('change', () => { apply.disabled = false; });
    apply.addEventListener('click', () => requestTaskMobileUpdate(element, section, apply));
    section.append(apply);
    propertyFields.append(section);
  }

  function createTaskMobileTextField(section, labelText, name, value, maximum, multiline) {
    const label = document.createElement('label');
    label.className = 'task-mobile-field';
    const caption = document.createElement('span');
    caption.textContent = `${labelText} (máx. ${maximum})`;
    const input = document.createElement(multiline ? 'textarea' : 'input');
    if (!multiline) input.type = 'text';
    input.className = `task-mobile-${name}`;
    input.value = value;
    input.dataset.mobileLimit = String(maximum);
    label.append(caption, input);
    section.append(label);
    return input;
  }

  function createTaskMobileActionField(labelText, name, value, options) {
    const label = document.createElement('label');
    label.className = 'task-mobile-field';
    label.append(document.createTextNode(labelText));
    const select = document.createElement('select');
    select.className = `task-mobile-${name}`;
    const disabled = document.createElement('option');
    disabled.value = '';
    disabled.textContent = 'Desabilitar';
    select.append(disabled);
    for (const definition of options) {
      const option = document.createElement('option');
      option.value = definition.value;
      option.textContent = definition.label;
      select.append(option);
    }
    select.value = value;
    label.append(select);
    return label;
  }

  function renderTaskAttachmentRulesEditor(element) {
    const editor = element.taskAttachmentRulesEditor;
    if (!editor) return;
    const section = document.createElement('section');
    section.className = 'task-attachment-rules';
    const title = document.createElement('h3');
    title.textContent = 'Regras de anexo';
    const hint = document.createElement('p');
    hint.className = 'task-attachment-rules-hint';
    hint.textContent = 'As regras são verificadas quando o usuário movimenta esta atividade.';
    const list = document.createElement('div');
    list.className = 'task-attachment-rule-list';
    const markDirty = () => { section.querySelector('.task-attachment-rules-apply').disabled = false; };
    const refreshTitles = () => {
      [...list.querySelectorAll('.task-attachment-rule')].forEach((row, index) => {
        row.querySelector('.task-attachment-rule-title').textContent = `Regra ${index + 1}`;
      });
    };
    for (const rule of editor.rules) {
      list.append(createTaskAttachmentRuleRow(rule, editor, markDirty, refreshTitles));
    }
    refreshTitles();
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'task-attachment-rule-add';
    add.textContent = 'Adicionar regra';
    add.addEventListener('click', () => {
      list.append(createTaskAttachmentRuleRow(
        { operator: '0', amount: 0, name: '', message: '' }, editor, markDirty, refreshTitles
      ));
      refreshTitles();
      markDirty();
    });
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'primary task-attachment-rules-apply';
    apply.textContent = 'Aplicar regras de anexo';
    apply.disabled = true;
    section.addEventListener('input', markDirty);
    section.addEventListener('change', markDirty);
    apply.addEventListener('click', () => requestTaskAttachmentRulesUpdate(element, section, apply));
    section.append(title, hint, list, add, apply);
    propertyFields.append(section);
  }

  function createTaskAttachmentRuleRow(rule, editor, markDirty, refreshTitles) {
    const row = document.createElement('fieldset');
    row.className = 'task-attachment-rule';
    const legend = document.createElement('legend');
    const rowTitle = document.createElement('span');
    rowTitle.className = 'task-attachment-rule-title';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'task-attachment-rule-remove';
    remove.textContent = 'Remover';
    remove.addEventListener('click', () => {
      row.remove();
      refreshTitles();
      markDirty();
    });
    legend.append(rowTitle, remove);

    const operatorLabel = document.createElement('label');
    operatorLabel.append(document.createTextNode('Operação'));
    const operator = document.createElement('select');
    operator.className = 'task-attachment-rule-operator';
    for (const definition of editor.operatorOptions) {
      const option = document.createElement('option');
      option.value = definition.value;
      option.textContent = definition.label;
      operator.append(option);
    }
    operator.value = rule.operator;
    operatorLabel.append(operator);

    const amountLabel = document.createElement('label');
    amountLabel.append(document.createTextNode('Quantidade'));
    const amount = document.createElement('input');
    amount.type = 'number';
    amount.min = '0';
    amount.step = '1';
    amount.className = 'task-attachment-rule-amount';
    amount.value = String(rule.amount);
    amountLabel.append(amount);

    const nameLabel = document.createElement('label');
    nameLabel.className = 'task-attachment-rule-wide';
    nameLabel.append(document.createTextNode('Valor (nome, extensão ou campo do formulário)'));
    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'task-attachment-rule-name';
    name.value = rule.name;
    nameLabel.append(name);

    let helper = null;
    if (editor.formFields.length) {
      helper = document.createElement('div');
      helper.className = 'task-attachment-rule-form-helper task-attachment-rule-wide';
      const formField = document.createElement('select');
      for (const field of editor.formFields) {
        const option = document.createElement('option');
        option.value = field;
        option.textContent = field;
        formField.append(option);
      }
      const insert = document.createElement('button');
      insert.type = 'button';
      insert.textContent = 'Usar campo';
      insert.addEventListener('click', () => {
        name.value = `@[form:${formField.value}]`;
        name.dispatchEvent(new Event('input', { bubbles: true }));
        name.focus();
      });
      helper.append(formField, insert);
    }

    const messageLabel = document.createElement('label');
    messageLabel.className = 'task-attachment-rule-wide';
    messageLabel.append(document.createTextNode('Mensagem'));
    const message = document.createElement('textarea');
    message.className = 'task-attachment-rule-message';
    message.value = rule.message;
    messageLabel.append(message);
    const refreshAmount = () => {
      amount.disabled = ['0', '6'].includes(operator.value);
      if (amount.disabled) amount.value = '0';
    };
    operator.addEventListener('change', refreshAmount);
    row.append(legend, operatorLabel, amountLabel, nameLabel);
    if (helper) row.append(helper);
    row.append(messageLabel);
    refreshAmount();
    return row;
  }

  function renderSubProcessFormMapEditor(element) {
    const commonSubProcess = element.tag === 'BpmnSubProcess' && String(element.type) === '100';
    const receivedEditor = element.subProcessFormMapEditor ?? (commonSubProcess ? {
      supported: false,
      reason: 'Os dados de mapeamento nao foram recebidos. Reabra o editor para atualizar os recursos da extensao.',
      processId: String(element.attributes?.process ?? ''),
      parentFields: [],
      childFields: [],
      directions: [],
      maps: []
    } : null);
    if (!receivedEditor) return;
    const editor = {
      ...receivedEditor,
      parentFields: Array.isArray(receivedEditor.parentFields) ? receivedEditor.parentFields : [],
      childFields: Array.isArray(receivedEditor.childFields) ? receivedEditor.childFields : [],
      directions: Array.isArray(receivedEditor.directions) ? receivedEditor.directions : [],
      maps: Array.isArray(receivedEditor.maps) ? receivedEditor.maps : []
    };
    const section = document.createElement('section');
    section.className = 'subprocess-form-maps';
    const title = document.createElement('h3');
    title.textContent = 'Campos';
    const hint = document.createElement('p');
    hint.className = editor.supported ? 'subprocess-form-maps-hint' : 'subprocess-form-maps-warning';
    if (!editor.supported) {
      hint.textContent = editor.reason || 'Este bloco formMaps nao pode ser editado com seguranca.';
      section.append(title, hint);
      propertyFields.append(section);
      return;
    }
    if (!editor.processId) {
      hint.textContent = 'Selecione e aplique primeiro o subprocesso na categoria Geral.';
      section.append(title, hint);
      propertyFields.append(section);
      return;
    }
    if (!editor.parentFields.length || !editor.childFields.length) {
      hint.textContent = !editor.parentFields.length
        ? 'O formulario do processo pai nao possui campos disponiveis.'
        : 'O formulario do subprocesso nao possui campos disponiveis.';
      section.append(title, hint);
      propertyFields.append(section);
      return;
    }
    hint.textContent = 'Relacione os campos do formulario pai com os campos do subprocesso.';
    const list = document.createElement('div');
    list.className = 'subprocess-form-map-list';
    const markDirty = () => { section.querySelector('.subprocess-form-maps-apply').disabled = false; };
    const refreshTitles = () => {
      [...list.querySelectorAll('.subprocess-form-map-row')].forEach((row, index) => {
        const rowTitle = row.querySelector('.subprocess-form-map-title');
        if (rowTitle) rowTitle.textContent = `Mapeamento ${index + 1}`;
      });
    };
    for (const map of editor.maps) {
      try {
        list.append(createSubProcessFormMapRow(map, editor, markDirty, refreshTitles));
      } catch (error) {
        const warning = document.createElement('p');
        warning.className = 'subprocess-form-maps-warning';
        warning.textContent = `Nao foi possivel montar um mapeamento salvo: ${error?.message ?? error}`;
        list.append(warning);
      }
    }
    refreshTitles();
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'subprocess-form-map-add';
    add.textContent = 'Novo mapeamento';
    add.addEventListener('click', () => {
      list.append(createSubProcessFormMapRow({
        processField: editor.parentFields[0],
        subProcessField: editor.childFields[0],
        mapFlow: '2'
      }, editor, markDirty, refreshTitles));
      refreshTitles();
      markDirty();
    });
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'primary subprocess-form-maps-apply';
    apply.textContent = 'Aplicar campos';
    apply.disabled = true;
    section.addEventListener('input', markDirty);
    section.addEventListener('change', markDirty);
    apply.addEventListener('click', () => requestSubProcessFormMapUpdate(element, section, apply));
    section.append(title, hint, list, add, apply);
    propertyFields.append(section);
  }

  function createSubProcessFormMapRow(map, editor, markDirty, refreshTitles) {
    const row = document.createElement('fieldset');
    row.className = 'subprocess-form-map-row';
    const legend = document.createElement('legend');
    const rowTitle = document.createElement('span');
    rowTitle.className = 'subprocess-form-map-title';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'subprocess-form-map-remove';
    remove.textContent = 'Remover';
    remove.addEventListener('click', () => {
      row.remove();
      refreshTitles();
      markDirty();
    });
    legend.append(rowTitle, remove);
    row.append(
      legend,
      createSubProcessFormMapSelect('Campo do processo pai', 'subprocess-form-map-parent', map.processField, editor.parentFields),
      createSubProcessFormMapSelect('Direcao', 'subprocess-form-map-direction', map.mapFlow, editor.directions),
      createSubProcessFormMapSelect('Campo do subprocesso', 'subprocess-form-map-child', map.subProcessField, editor.childFields)
    );
    return row;
  }

  function createSubProcessFormMapSelect(labelText, className, value, options) {
    const label = document.createElement('label');
    label.append(document.createTextNode(labelText));
    const select = document.createElement('select');
    select.className = className;
    const normalizedOptions = (Array.isArray(options) ? options : []).map((option) => (
      typeof option === 'string' ? { value: option, label: option } : option
    ));
    if (value && !normalizedOptions.some((option) => option.value === value)) {
      normalizedOptions.push({ value, label: `${value} (valor atual)` });
    }
    for (const definition of normalizedOptions) {
      const option = document.createElement('option');
      option.value = definition.value;
      option.textContent = definition.label;
      select.append(option);
    }
    select.value = value;
    label.append(select);
    return label;
  }

  function renderExtendedPropertiesEditor(element) {
    const editor = element.extendedPropertiesEditor;
    if (!editor) return;
    const section = document.createElement('section');
    section.className = 'extended-properties';
    const title = document.createElement('h3');
    title.textContent = 'Extensão';
    const hint = document.createElement('p');
    hint.className = 'extended-properties-hint';
    hint.textContent = 'Atributos personalizados gravados no elemento selecionado.';
    const list = document.createElement('div');
    list.className = 'extended-property-list';
    const markDirty = () => {
      section.querySelector('.extended-properties-apply')?.removeAttribute('disabled');
    };
    const refreshTitles = () => {
      [...list.querySelectorAll('.extended-property')].forEach((row, index) => {
        const name = row.querySelector('.extended-property-name')?.value.trim();
        const label = row.querySelector('.extended-property-label')?.value.trim();
        row.querySelector('.extended-property-title').textContent = label || name || `Atributo ${index + 1}`;
      });
    };
    for (const property of editor.properties) {
      list.append(createExtendedPropertyRow(property, editor, markDirty, refreshTitles));
    }
    refreshTitles();
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'extended-property-add';
    add.textContent = 'Adicionar novo atributo';
    add.addEventListener('click', () => {
      const row = createExtendedPropertyRow(
        { name: '', type: '0', label: '', value: '' }, editor, markDirty, refreshTitles
      );
      list.append(row);
      refreshTitles();
      markDirty();
      row.querySelector('.extended-property-name')?.focus();
    });
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'primary extended-properties-apply';
    apply.textContent = 'Aplicar atributos de extensão';
    apply.disabled = true;
    section.addEventListener('input', () => { refreshTitles(); markDirty(); });
    section.addEventListener('change', () => { refreshTitles(); markDirty(); });
    apply.addEventListener('click', () => requestExtendedPropertiesUpdate(element, section, apply));
    section.append(title, hint, list, add, apply);
    propertyFields.append(section);
  }

  function renderTaskScriptEditor(element) {
    const editor = element.taskScriptEditor;
    if (!editor) return;
    const section = document.createElement('section');
    section.className = 'task-script';
    const title = document.createElement('h3');
    title.textContent = 'Script da tarefa';
    const file = document.createElement('code');
    file.className = 'task-script-file';
    file.textContent = editor.fileName;
    const hint = document.createElement('p');
    hint.className = 'task-script-hint';
    hint.textContent = editor.existsInProcess
      ? 'O arquivo existente será aberto sem alterar seu conteúdo.'
      : 'O arquivo e a referência scriptFileName serão criados no primeiro acesso.';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'task-script-open';
    open.textContent = 'Editar Script da Tarefa';
    open.disabled = !editor.referenceValid;
    if (!editor.referenceValid) {
      hint.textContent = `Referência divergente. Esperado: ${editor.expectedFileName}`;
      hint.classList.add('warning');
    }
    open.addEventListener('click', () => {
      vscode.postMessage({ type: 'openTaskScript', elementId: element.id });
    });
    section.append(title, file, hint, open);
    propertyFields.append(section);
  }

  function createExtendedPropertyRow(property, editor, markDirty, refreshTitles) {
    const row = document.createElement('fieldset');
    row.className = 'extended-property';
    row.dataset.extendedType = property.type;
    const legend = document.createElement('legend');
    const rowTitle = document.createElement('span');
    rowTitle.className = 'extended-property-title';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'extended-property-remove';
    remove.textContent = 'Remover';
    remove.addEventListener('click', () => {
      row.remove();
      refreshTitles();
      markDirty();
    });
    legend.append(rowTitle, remove);

    const nameLabel = document.createElement('label');
    nameLabel.append(document.createTextNode('Nome(id)'));
    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'extended-property-name';
    name.value = property.name;
    name.autocomplete = 'off';
    nameLabel.append(name);

    const labelField = document.createElement('label');
    labelField.append(document.createTextNode('Label'));
    const label = document.createElement('input');
    label.type = 'text';
    label.className = 'extended-property-label';
    label.value = property.label;
    labelField.append(label);

    const typeLabel = document.createElement('label');
    typeLabel.append(document.createTextNode('Tipo'));
    const type = document.createElement('select');
    type.className = 'extended-property-type';
    for (const definition of editor.typeOptions) {
      const option = document.createElement('option');
      option.value = definition.value;
      option.textContent = definition.label;
      type.append(option);
    }
    type.value = property.type;
    typeLabel.append(type);

    const valueHost = document.createElement('div');
    valueHost.className = 'extended-property-value-host extended-property-wide';
    const renderValue = (propertyType, value) => {
      valueHost.replaceChildren(createExtendedPropertyValueControl(propertyType, value));
      row.dataset.extendedType = propertyType;
    };
    renderValue(property.type, property.value);
    type.addEventListener('change', () => {
      const previous = readExtendedPropertyValue(row, row.dataset.extendedType);
      const nextValue = type.value === '4' ? previous === true || previous === 'true' : String(previous ?? '');
      renderValue(type.value, nextValue);
      markDirty();
    });
    row.append(legend, nameLabel, labelField, typeLabel, valueHost);
    return row;
  }

  function createExtendedPropertyValueControl(type, value) {
    const label = document.createElement('label');
    label.className = type === '4' ? 'extended-property-checkbox' : '';
    const caption = document.createElement('span');
    caption.textContent = 'Valor';
    let input;
    if (type === '1') {
      input = document.createElement('textarea');
      input.value = String(value ?? '');
    } else {
      input = document.createElement('input');
      input.type = type === '2' ? 'number' : type === '3' ? 'date' : type === '4' ? 'checkbox' : 'text';
      if (type === '2') input.step = 'any';
      if (type === '3') input.value = extendedDateToIso(String(value ?? ''));
      else if (type === '4') input.checked = value === true || value === 'true';
      else input.value = String(value ?? '');
    }
    input.className = 'extended-property-value';
    if (type === '4') label.append(input, caption);
    else label.append(caption, input);
    return label;
  }

  function readExtendedPropertyValue(row, typeOverride) {
    const type = typeOverride ?? row.querySelector('.extended-property-type')?.value ?? row.dataset.extendedType;
    const input = row.querySelector('.extended-property-value');
    if (!input) return '';
    if (type === '4') return input.checked;
    if (type === '3') return extendedIsoToDate(input.value);
    return input.value;
  }

  function extendedDateToIso(value) {
    const match = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
  }

  function extendedIsoToDate(value) {
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
  }

  function createTaskNotificationCheckbox(labelText, className, checked) {
    const label = document.createElement('label');
    label.className = 'task-notification-checkbox';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = className;
    input.checked = Boolean(checked);
    label.append(input, document.createTextNode(labelText));
    return label;
  }

  function createTaskLateGroup(title, channel, editor) {
    const group = document.createElement('fieldset');
    group.className = `task-late-group task-late-${channel}`;
    const legend = document.createElement('legend');
    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.className = 'task-late-enabled';
    enabled.checked = Boolean(editor[`late${capitalize(channel)}`]);
    legend.append(enabled, document.createTextNode(` Notificar ${title.toLocaleLowerCase('pt-BR')}`));
    group.append(legend);
    const definitions = [
      ['Tolerância', 'Tolerance'],
      ['Frequência', 'Frequency'],
      ['Expiração', 'Expiration']
    ];
    for (const [caption, suffix] of definitions) {
      const label = document.createElement('label');
      label.className = 'task-late-duration';
      label.append(document.createTextNode(caption));
      const input = document.createElement('input');
      input.type = 'text';
      input.className = `task-late-${suffix.toLocaleLowerCase('en-US')}`;
      input.value = editor[`late${capitalize(channel)}${suffix}`];
      input.placeholder = '000:00';
      input.pattern = '\\d{1,6}:[0-5]\\d';
      input.disabled = !enabled.checked;
      label.append(input);
      group.append(label);
    }
    enabled.addEventListener('change', () => {
      group.querySelectorAll('.task-late-duration input').forEach((input) => { input.disabled = !enabled.checked; });
    });
    return group;
  }

  function capitalize(value) {
    return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
  }

  function renderTaskAssignmentEditor(element) {
    renderAssignmentEditor(element, element.taskAssignmentEditor, {
      sectionClass: 'task-assignment',
      title: 'Mecanismo de atribuição',
      applyText: 'Aplicar atribuição',
      applyClass: 'task-assignment-apply',
      request: requestTaskAssignmentUpdate
    });
  }

  function renderProcessManagerEditor(element) {
    renderAssignmentEditor(element, element.processManagerEditor, {
      sectionClass: 'process-manager',
      title: 'Gestor',
      applyText: 'Aplicar gestor',
      applyClass: 'process-manager-apply',
      request: requestProcessManagerUpdate
    });
  }

  function renderAssignmentEditor(element, editor, options) {
    if (!editor) return;
    const section = document.createElement('section');
    section.className = `task-assignment ${options.sectionClass}`;
    const title = document.createElement('h3');
    title.textContent = options.title;

    const mechanismField = document.createElement('div');
    mechanismField.className = 'gateway-condition-mechanism';
    const mechanismLabel = document.createElement('label');
    mechanismLabel.append(document.createTextNode('Mecanismo'));
    const mechanismSelect = document.createElement('select');
    mechanismSelect.className = 'task-mechanism-select gateway-mechanism-select';
    for (const mechanism of editor.mechanisms) {
      const option = document.createElement('option');
      option.value = mechanism.value;
      option.dataset.kind = mechanism.kind;
      option.textContent = mechanism.label;
      option.selected = mechanism.value === editor.mechanism;
      mechanismSelect.append(option);
    }
    mechanismLabel.append(mechanismSelect);

    const configure = document.createElement('button');
    configure.type = 'button';
    configure.className = 'gateway-mechanism-configure task-mechanism-configure';
    configure.textContent = 'Configurar';
    const initialKind = editor.mechanisms.find((item) => item.value === editor.mechanism)?.kind;
    configure.disabled = !editor.mechanism || initialKind === 'custom';
    mechanismField.append(mechanismLabel, configure);

    const mechanismConfiguration = document.createElement('div');
    mechanismConfiguration.className = 'gateway-mechanism-configuration task-assignment-configuration';
    mechanismConfiguration.hidden = true;
    section.dataset.mechanismConfigured = editor.mechanismConfiguration ? 'true' : 'false';
    renderGatewayMechanismConfiguration(
      mechanismConfiguration,
      editor.mechanism,
      editor.mechanismConfiguration,
      editor
    );

    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = `primary ${options.applyClass}`;
    apply.textContent = options.applyText;
    apply.disabled = true;
    const markDirty = () => { apply.disabled = false; };

    configure.addEventListener('click', () => {
      mechanismConfiguration.hidden = !mechanismConfiguration.hidden;
      if (!mechanismConfiguration.hidden && section.dataset.mechanismConfigured !== 'true') {
        section.dataset.mechanismConfigured = 'true';
        markDirty();
      }
    });
    mechanismSelect.addEventListener('change', () => {
      const selectedKind = mechanismSelect.selectedOptions[0]?.dataset.kind;
      section.dataset.mechanismConfigured = mechanismSelect.value ? 'true' : 'false';
      configure.disabled = !mechanismSelect.value || selectedKind === 'custom';
      renderGatewayMechanismConfiguration(mechanismConfiguration, mechanismSelect.value, null, editor);
      mechanismConfiguration.hidden = !mechanismSelect.value || selectedKind === 'custom';
      markDirty();
    });
    section.addEventListener('input', markDirty);
    section.addEventListener('change', markDirty);
    section.addEventListener('click', (event) => {
      if (event.target.closest('.gateway-association-add, .gateway-association-remove')) markDirty();
    });
    apply.addEventListener('click', () => options.request(element, section, apply));

    section.append(title, mechanismField, mechanismConfiguration, apply);
    propertyFields.append(section);
  }

  function renderGatewayConditionEditor(element) {
    const editor = element.gatewayConditionEditor;
    if (!editor) return;
    const section = document.createElement('section');
    section.className = 'gateway-conditions';
    const title = document.createElement('h3');
    title.textContent = 'Condições dos ramos';
    section.append(title);
    if (!editor.supported) {
      const warning = document.createElement('p');
      warning.className = 'gateway-condition-warning';
      warning.textContent = editor.reason;
      section.append(warning);
      propertyFields.append(section);
      return;
    }
    const hasDestinations = editor.destinations.length > 0;
    section.dataset.defaultFlowId = editor.destinations.find((destination) => destination.defaultLink)?.flowId ?? '';
    if (!hasDestinations) {
      const empty = document.createElement('p');
      empty.className = 'gateway-condition-empty';
      empty.textContent = 'Crie ao menos um fluxo de saída para adicionar ou aplicar condições.';
      section.append(empty);
    }

    const list = document.createElement('div');
    list.className = 'gateway-condition-list';
    for (const condition of editor.conditions) {
      list.append(createGatewayConditionRow(condition, editor, list));
    }
    syncGatewayConditionOrderControls(list);

    const actions = document.createElement('div');
    actions.className = 'gateway-condition-actions';
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'gateway-condition-add';
    add.textContent = 'Adicionar avançado';
    add.disabled = !hasDestinations;
    add.addEventListener('click', () => {
      const condition = {
        sourceIndex: '',
        order: nextGatewayConditionOrder(list),
        expression: '',
        targetId: editor.destinations[0].targetId,
        conditionType: '0',
        mechanism: '',
        mechanismConfiguration: null,
        editable: true,
        issue: ''
      };
      const row = createGatewayConditionRow(condition, editor, list);
      list.append(row);
      syncGatewayConditionOrderControls(list);
      row.querySelector('.gateway-expression-input')?.focus();
    });
    const addAdvanced = document.createElement('button');
    addAdvanced.type = 'button';
    addAdvanced.className = 'gateway-condition-add-advanced';
    addAdvanced.textContent = 'Adicionar';
    addAdvanced.disabled = !hasDestinations;
    addAdvanced.addEventListener('click', () => {
      const condition = {
        sourceIndex: '',
        order: nextGatewayConditionOrder(list),
        expression: '',
        targetId: editor.destinations[0].targetId,
        conditionType: '1',
        mechanism: '',
        mechanismConfiguration: null,
        rules: [{
          sourceIndex: '',
          tenantId: 0,
          version: 0,
          field: editor.formFields[0] ?? '',
          value: '',
          operator: '1',
          valueType: '1'
        }],
        editable: true,
        issue: ''
      };
      const row = createGatewayConditionRow(condition, editor, list);
      list.append(row);
      syncGatewayConditionOrderControls(list);
      row.querySelector('.gateway-advanced-field')?.focus();
    });
    actions.append(add, addAdvanced);

    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'primary gateway-conditions-apply';
    apply.textContent = 'Aplicar condições';
    apply.disabled = !hasDestinations;
    apply.addEventListener('click', () => requestGatewayBranchUpdate(element, section, apply));
    section.append(list, actions, apply);
    propertyFields.append(section);
  }

  function createGatewayConditionRow(condition, editor, list) {
    const row = document.createElement('article');
    row.className = 'gateway-condition-row';
    row.dataset.sourceIndex = condition.sourceIndex ?? '';
    row.dataset.editable = condition.editable ? 'true' : 'false';
    row.dataset.conditionType = condition.conditionType ?? '0';

    const heading = document.createElement('div');
    heading.className = 'gateway-condition-heading';
    const title = document.createElement('strong');
    title.className = 'gateway-condition-title';
    const type = document.createElement('code');
    type.textContent = condition.conditionType === '0' ? 'Expressão' : 'Builder visual';
    heading.append(title, type);

    const rowActions = document.createElement('div');
    rowActions.className = 'gateway-condition-row-actions';
    const moveUp = document.createElement('button');
    moveUp.type = 'button';
    moveUp.className = 'gateway-condition-move-up';
    moveUp.textContent = 'Subir';
    moveUp.disabled = !condition.editable;
    moveUp.addEventListener('click', () => moveGatewayConditionRow(list, row, -1));
    const moveDown = document.createElement('button');
    moveDown.type = 'button';
    moveDown.className = 'gateway-condition-move-down';
    moveDown.textContent = 'Descer';
    moveDown.disabled = !condition.editable;
    moveDown.addEventListener('click', () => moveGatewayConditionRow(list, row, 1));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'gateway-condition-remove';
    remove.textContent = 'Remover';
    remove.disabled = !condition.editable;
    remove.addEventListener('click', () => {
      row.remove();
      syncGatewayConditionOrderControls(list);
    });
    rowActions.append(moveUp, moveDown, remove);

    const orderLabel = document.createElement('label');
    orderLabel.className = 'gateway-condition-order';
    orderLabel.append(document.createTextNode('Ordem automática'));
    const orderInput = document.createElement('input');
    orderInput.type = 'number';
    orderInput.className = 'gateway-order-input';
    orderInput.min = '1';
    orderInput.step = '1';
    orderInput.value = String(condition.order);
    orderInput.readOnly = true;
    orderInput.disabled = !condition.editable;
    orderLabel.append(orderInput);

    const destinationLabel = document.createElement('label');
    destinationLabel.className = 'gateway-condition-destination';
    destinationLabel.append(document.createTextNode('Atividade destino'));
    const destinationSelect = document.createElement('select');
    destinationSelect.className = 'gateway-destination-select';
    destinationSelect.disabled = !condition.editable;
    const uniqueTargets = new Set();
    for (const destination of editor.destinations) {
      if (uniqueTargets.has(destination.targetId)) continue;
      uniqueTargets.add(destination.targetId);
      const option = document.createElement('option');
      option.value = destination.targetId;
      option.textContent = `${destination.targetName} (${destination.targetId})`;
      option.selected = destination.targetId === condition.targetId;
      destinationSelect.append(option);
    }
    destinationLabel.append(destinationSelect);

    const expressionLabel = document.createElement('label');
    expressionLabel.className = 'gateway-condition-expression';
    expressionLabel.append(document.createTextNode('Expressão JavaScript'));
    const expressionInput = document.createElement('textarea');
    expressionInput.className = 'gateway-expression-input';
    expressionInput.value = condition.expression;
    expressionInput.placeholder = 'Ex.: hAPI.getCardValue("status") == "APROVADO"';
    expressionInput.disabled = !condition.editable;
    expressionLabel.append(expressionInput);
    expressionLabel.hidden = condition.conditionType === '1';

    const advancedRules = document.createElement('div');
    advancedRules.className = 'gateway-advanced-rules';
    advancedRules.hidden = condition.conditionType !== '1';
    if (condition.conditionType === '1') {
      const rulesList = document.createElement('div');
      rulesList.className = 'gateway-advanced-rule-list';
      for (const rule of condition.rules ?? []) {
        rulesList.append(createGatewayAdvancedRuleRow(rule, editor, condition.editable));
      }
      const addRule = document.createElement('button');
      addRule.type = 'button';
      addRule.className = 'gateway-advanced-rule-add';
      addRule.textContent = 'Adicionar regra';
      addRule.disabled = !condition.editable;
      addRule.addEventListener('click', () => {
        rulesList.append(createGatewayAdvancedRuleRow({
          sourceIndex: '', tenantId: 0, version: 0,
          field: editor.formFields[0] ?? '', value: '', operator: '1', valueType: '1'
        }, editor, true));
      });
      advancedRules.append(rulesList, addRule);
    }

    const mechanismField = document.createElement('div');
    mechanismField.className = 'gateway-condition-mechanism';
    const mechanismLabel = document.createElement('label');
    mechanismLabel.append(document.createTextNode('Mecanismo'));
    const mechanismSelect = document.createElement('select');
    mechanismSelect.className = 'gateway-mechanism-select';
    mechanismSelect.disabled = !condition.editable;
    for (const mechanism of editor.mechanisms) {
      const option = document.createElement('option');
      option.value = mechanism.value;
      option.dataset.kind = mechanism.kind;
      option.textContent = mechanism.label;
      option.selected = mechanism.value === condition.mechanism;
      mechanismSelect.append(option);
    }
    mechanismLabel.append(mechanismSelect);
    const configure = document.createElement('button');
    configure.type = 'button';
    configure.className = 'gateway-mechanism-configure';
    configure.textContent = 'Configurar';
    const initialMechanismKind = editor.mechanisms.find((item) => item.value === condition.mechanism)?.kind;
    configure.disabled = !condition.editable || !condition.mechanism || initialMechanismKind === 'custom';
    mechanismField.append(mechanismLabel, configure);

    const mechanismConfiguration = document.createElement('div');
    mechanismConfiguration.className = 'gateway-mechanism-configuration';
    mechanismConfiguration.hidden = true;
    row.dataset.mechanismConfigured = condition.mechanismConfiguration ? 'true' : 'false';
    renderGatewayMechanismConfiguration(
      mechanismConfiguration,
      condition.mechanism,
      condition.mechanismConfiguration,
      editor
    );
    configure.addEventListener('click', () => {
      mechanismConfiguration.hidden = !mechanismConfiguration.hidden;
      if (!mechanismConfiguration.hidden && row.dataset.mechanismConfigured !== 'true') {
        row.dataset.mechanismConfigured = 'true';
      }
    });
    mechanismSelect.addEventListener('change', () => {
      row.dataset.mechanismConfigured = mechanismSelect.value ? 'true' : 'false';
      const selectedKind = mechanismSelect.selectedOptions[0]?.dataset.kind;
      configure.disabled = !mechanismSelect.value || selectedKind === 'custom';
      renderGatewayMechanismConfiguration(mechanismConfiguration, mechanismSelect.value, null, editor);
      mechanismConfiguration.hidden = !mechanismSelect.value || selectedKind === 'custom';
    });

    row.append(
      heading,
      rowActions,
      orderLabel,
      destinationLabel,
      expressionLabel,
      advancedRules,
      mechanismField,
      mechanismConfiguration
    );
    if (condition.issue) {
      const issue = document.createElement('small');
      issue.className = 'gateway-condition-warning';
      issue.textContent = condition.issue;
      row.append(issue);
    }
    return row;
  }

  function createGatewayAdvancedRuleRow(rule, editor, editable) {
    const row = document.createElement('div');
    row.className = 'gateway-advanced-rule-row';
    row.dataset.sourceIndex = rule?.sourceIndex ?? '';
    row.dataset.processId = rule?.processId ?? '';
    row.dataset.tenantId = String(rule?.tenantId ?? 0);
    row.dataset.version = String(rule?.version ?? 0);

    const field = createGatewayAdvancedCatalogControl(
      'Campo', 'gateway-advanced-field', rule?.field ?? '', editor.formFields ?? [], 'Nome do campo'
    );
    const operator = createGatewayAdvancedSelect(
      'Operação', 'gateway-advanced-operator', rule?.operator ?? '1', editor.advancedOperators ?? []
    );
    const valueType = createGatewayAdvancedSelect(
      'Tipo do valor', 'gateway-advanced-value-type', rule?.valueType ?? '1', editor.advancedValueTypes ?? []
    );
    const valueSlot = document.createElement('div');
    valueSlot.className = 'gateway-advanced-value-slot';
    let value = createGatewayAdvancedValueControl(rule?.value ?? '', valueType.querySelector('select').value, editor);
    valueSlot.append(value);

    const syncRuleControls = () => {
      const noValue = ['0', '9'].includes(operator.querySelector('select').value);
      valueType.hidden = noValue;
      valueSlot.hidden = noValue;
      if (noValue) value.value = '';
    };
    operator.querySelector('select').addEventListener('change', syncRuleControls);
    valueType.querySelector('select').addEventListener('change', () => {
      const replacement = createGatewayAdvancedValueControl(value.value, valueType.querySelector('select').value, editor);
      replacement.disabled = !editable;
      value.replaceWith(replacement);
      value = replacement;
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'gateway-advanced-rule-remove';
    remove.textContent = 'Remover regra';
    remove.disabled = !editable;
    remove.addEventListener('click', () => row.remove());
    row.append(field, operator, valueType, valueSlot, remove);
    row.querySelectorAll('input, select, button').forEach((control) => { control.disabled = !editable; });
    syncRuleControls();
    return row;
  }

  function createGatewayAdvancedSelect(labelText, className, current, options) {
    const label = document.createElement('label');
    label.append(document.createTextNode(labelText));
    const select = document.createElement('select');
    select.className = className;
    for (const item of options) {
      const option = document.createElement('option');
      option.value = String(item.value);
      option.textContent = item.label;
      option.selected = String(item.value) === String(current ?? '');
      select.append(option);
    }
    label.append(select);
    return label;
  }

  function createGatewayAdvancedCatalogControl(labelText, className, current, items, placeholder) {
    const label = document.createElement('label');
    label.append(document.createTextNode(labelText));
    let control;
    if (items.length) {
      control = document.createElement('select');
      appendGatewayAdvancedCatalogOptions(control, current, items, `Selecione ${labelText.toLocaleLowerCase('pt-BR')}`);
    } else {
      control = document.createElement('input');
      control.type = 'text';
      control.value = current ?? '';
      control.placeholder = placeholder;
    }
    control.className = className;
    label.append(control);
    return label;
  }

  function appendGatewayAdvancedCatalogOptions(select, current, items, emptyLabel) {
    const normalizedCurrent = String(current ?? '').trim();
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = emptyLabel;
    select.append(empty);
    const values = new Set(items.map((item) => String(item?.value ?? item ?? '').trim()).filter(Boolean));
    if (normalizedCurrent && !values.has(normalizedCurrent)) {
      const legacy = document.createElement('option');
      legacy.value = normalizedCurrent;
      legacy.textContent = `${normalizedCurrent} (valor atual)`;
      select.append(legacy);
    }
    for (const item of items) {
      const value = String(item?.value ?? item ?? '').trim();
      if (!value) continue;
      const option = document.createElement('option');
      option.value = value;
      option.textContent = String(item?.label ?? value).trim() || value;
      select.append(option);
    }
    select.value = normalizedCurrent;
  }

  function createGatewayAdvancedValueControl(current, valueType, editor) {
    let control;
    if (valueType === '0' && editor.formFields?.length) {
      control = document.createElement('select');
      appendGatewayAdvancedCatalogOptions(control, current, editor.formFields, 'Selecione um campo');
    } else {
      control = document.createElement('input');
      control.type = 'text';
      control.value = current ?? '';
      control.placeholder = valueType === '0' ? 'Nome do campo' : 'Valor informado';
    }
    control.className = 'gateway-advanced-value';
    return control;
  }

  function renderGatewayMechanismConfiguration(container, mechanism, configuration, editor) {
    container.replaceChildren();
    if (!mechanism) return;
    const selected = editor.mechanisms.find((item) => item.value === mechanism);
    const kind = selected?.kind ?? 'custom';
    const config = configuration ?? defaultGatewayMechanismConfiguration(kind, editor);
    container.dataset.mechanismKind = kind;
    if (kind === 'associated') {
      container.append(createGatewayConfigSelect('Tipo da associação', 'associationType', config.associationType, [
        { value: 'OR', label: 'TODOS os usuários selecionados em qualquer um dos mecanismos' },
        { value: 'AND', label: 'SOMENTE os usuários selecionados em todos os mecanismos' }
      ]));
      const associations = document.createElement('div');
      associations.className = 'gateway-association-list';
      for (const controller of config.controllers ?? []) {
        associations.append(createGatewayAssociationRow(controller, editor));
      }
      const addAssociation = document.createElement('button');
      addAssociation.type = 'button';
      addAssociation.className = 'gateway-association-add';
      addAssociation.textContent = 'Adicionar associação';
      addAssociation.addEventListener('click', () => {
        associations.append(createGatewayAssociationRow({ kind: 'colleague', value: '' }, editor));
      });
      container.append(associations, addAssociation);
    } else if (kind === 'formField') {
      const fields = [...editor.formFields];
      if (config.formField && !fields.includes(config.formField)) fields.unshift(config.formField);
      const values = fields.length
        ? fields.map((field) => ({ value: field, label: field }))
        : [{ value: '', label: 'Nenhum campo local encontrado' }];
      container.append(createGatewayConfigSelect('Campo do formulário', 'formField', config.formField, values));
    } else if (kind === 'executor') {
      const nodes = [...editor.executorNodes];
      if (config.idNode && !nodes.some((node) => node.id === config.idNode)) {
        nodes.unshift({ id: config.idNode, name: config.idNode });
      }
      container.append(
        createGatewayConfigSelect(
          'Atividade executora',
          'idNode',
          config.idNode,
          nodes.map((node) => ({ value: node.id, label: `${node.name} (${node.id})` }))
        ),
        createGatewayConfigSelect('Execução', 'returns', config.returns, [
          { value: '0', label: 'Primeira execução' },
          { value: '1', label: 'Última execução' },
          { value: '2', label: 'Todas as execuções' }
        ])
      );
    } else if (['group', 'poolGroup'].includes(kind)) {
      container.append(createGatewayConfigCatalogPicker(
        'Grupo',
        'groupId',
        config.groupId,
        state.data?.groupCatalog ?? [],
        'Código do grupo'
      ));
    } else if (['role', 'poolRole'].includes(kind)) {
      container.append(createGatewayConfigCatalogPicker(
        'Papel',
        'roleId',
        config.roleId,
        editor.roleCatalog?.length ? editor.roleCatalog : (state.data?.roleCatalog ?? []),
        'Código do papel'
      ));
    } else if (kind === 'colleague') {
      container.append(createGatewayConfigCatalogPicker(
        'Usuário',
        'colleagueId',
        config.colleagueId,
        editor.userCatalog?.length ? editor.userCatalog : (state.data?.userCatalog ?? []),
        'Matrícula do usuário'
      ));
    } else if (kind === 'colleagueGroup') {
      container.append(
        createGatewayConfigSelect('Buscar grupos', 'colleagueId', config.colleagueId, [
          { value: '1', label: 'do Solicitante' },
          { value: '2', label: 'do Usuário corrente' }
        ]),
        createGatewayConfigCheckbox('Apenas grupos de trabalho', 'onlyWorkGroup', config.onlyWorkGroup),
        createGatewayConfigCheckbox('Incluir grupos de comunidades', 'includeCommunityGroups', config.includeCommunityGroups)
      );
    }
  }

  function defaultGatewayMechanismConfiguration(kind, editor) {
    return {
      formField: editor.formFields[0] ?? '',
      idNode: editor.executorNodes[0]?.id ?? '',
      returns: '0',
      groupId: '',
      roleId: '',
      colleagueId: kind === 'colleagueGroup' ? '1' : '',
      onlyWorkGroup: false,
      includeCommunityGroups: false,
      associationType: 'OR',
      controllers: []
    };
  }

  function createGatewayAssociationRow(controller, editor) {
    const row = document.createElement('div');
    row.className = 'gateway-association-row';
    const kind = document.createElement('select');
    kind.className = 'gateway-association-kind';
    for (const item of [
      { value: 'colleague', label: 'Usuário' },
      { value: 'group', label: 'Grupo' }
    ]) {
      const option = document.createElement('option');
      option.value = item.value;
      option.textContent = item.label;
      option.selected = item.value === controller?.kind;
      kind.append(option);
    }
    let value = createGatewayAssociationValue(kind.value, controller?.value ?? '', editor);
    kind.addEventListener('change', () => {
      const replacement = createGatewayAssociationValue(kind.value, '', editor);
      value.replaceWith(replacement);
      value = replacement;
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'gateway-association-remove';
    remove.textContent = 'Remover';
    remove.addEventListener('click', () => row.remove());
    row.append(kind, value, remove);
    return row;
  }

  function createGatewayAssociationValue(kind, current, editor) {
    const catalog = kind === 'group'
      ? (state.data?.groupCatalog ?? [])
      : (editor.userCatalog?.length ? editor.userCatalog : (state.data?.userCatalog ?? []));
    let control;
    if (catalog.length) {
      control = document.createElement('select');
      const normalizedCurrent = String(current ?? '').trim();
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = kind === 'group' ? 'Selecione um grupo' : 'Selecione um usuário';
      control.append(empty);
      const seen = new Set();
      if (normalizedCurrent && !catalog.some((item) => String(item?.value ?? '').trim() === normalizedCurrent)) {
        const legacy = document.createElement('option');
        legacy.value = normalizedCurrent;
        legacy.textContent = `${normalizedCurrent} (valor atual)`;
        legacy.selected = true;
        control.append(legacy);
        seen.add(normalizedCurrent);
      }
      for (const item of catalog) {
        const itemValue = String(item?.value ?? '').trim();
        if (!itemValue || seen.has(itemValue)) continue;
        seen.add(itemValue);
        const option = document.createElement('option');
        option.value = itemValue;
        option.textContent = String(item?.label ?? '').trim() || itemValue;
        option.selected = itemValue === normalizedCurrent;
        control.append(option);
      }
    } else {
      control = document.createElement('input');
      control.type = 'text';
      control.value = current ?? '';
      control.placeholder = kind === 'group' ? 'Código do grupo' : 'Matrícula do usuário';
    }
    control.className = 'gateway-association-value';
    return control;
  }

  function createGatewayConfigInput(labelText, key, value, placeholder = '') {
    const label = document.createElement('label');
    label.append(document.createTextNode(labelText));
    const input = document.createElement('input');
    input.type = 'text';
    input.dataset.configKey = key;
    input.value = value ?? '';
    input.placeholder = placeholder;
    label.append(input);
    return label;
  }

  function createGatewayConfigCatalogPicker(labelText, key, value, items, emptyPlaceholder) {
    if (!items.length) return createGatewayConfigInput(labelText, key, value, emptyPlaceholder);
    const label = document.createElement('label');
    label.append(document.createTextNode(labelText));
    const select = document.createElement('select');
    select.dataset.configKey = key;
    const seen = new Set();
    const current = String(value ?? '').trim();
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = `Selecione ${labelText.toLocaleLowerCase('pt-BR')}`;
    empty.selected = !current;
    select.append(empty);
    if (current && !items.some((item) => String(item?.value ?? '').trim() === current)) {
      const option = document.createElement('option');
      option.value = current;
      option.textContent = `${current} (valor atual)`;
      option.selected = true;
      select.append(option);
      seen.add(current);
    }
    for (const item of items) {
      const itemValue = String(item?.value ?? '').trim();
      if (!itemValue || seen.has(itemValue)) continue;
      seen.add(itemValue);
      const option = document.createElement('option');
      option.value = itemValue;
      option.textContent = String(item?.label ?? '').trim() || itemValue;
      option.selected = itemValue === current;
      select.append(option);
    }
    label.append(select);
    return label;
  }

  function createGatewayConfigSelect(labelText, key, value, options) {
    const label = document.createElement('label');
    label.append(document.createTextNode(labelText));
    const select = document.createElement('select');
    select.dataset.configKey = key;
    for (const item of options) {
      const option = document.createElement('option');
      option.value = item.value;
      option.textContent = item.label;
      option.selected = item.value === String(value ?? '');
      select.append(option);
    }
    label.append(select);
    return label;
  }

  function createGatewayConfigCheckbox(labelText, key, checked) {
    const label = document.createElement('label');
    label.className = 'gateway-config-checkbox';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.configKey = key;
    input.checked = checked === true;
    label.append(input, document.createTextNode(` ${labelText}`));
    return label;
  }

  function readGatewayMechanismConfiguration(row) {
    const mechanismSelect = row.querySelector('.gateway-mechanism-select');
    const selection = mechanismSelect.value;
    if (!selection || row.dataset.mechanismConfigured !== 'true') return null;
    const kind = mechanismSelect.selectedOptions[0]?.dataset.kind;
    if (kind === 'custom') return {};
    const result = {};
    row.querySelectorAll('.gateway-mechanism-configuration [data-config-key]').forEach((input) => {
      result[input.dataset.configKey] = input.type === 'checkbox' ? input.checked : input.value;
    });
    if (kind === 'associated') {
      result.controllers = [...row.querySelectorAll('.gateway-association-row')].map((association) => ({
        kind: association.querySelector('.gateway-association-kind').value,
        value: association.querySelector('.gateway-association-value').value
      }));
    }
    return result;
  }

  function readGatewayMechanism(row) {
    return row.querySelector('.gateway-mechanism-select').value;
  }

  function readTaskMechanismConfiguration(section) {
    const mechanismSelect = section.querySelector('.task-mechanism-select');
    const selection = mechanismSelect.value;
    if (!selection || section.dataset.mechanismConfigured !== 'true') return null;
    const kind = mechanismSelect.selectedOptions[0]?.dataset.kind;
    if (kind === 'custom') return {};
    const result = {};
    section.querySelectorAll('.task-assignment-configuration [data-config-key]').forEach((input) => {
      result[input.dataset.configKey] = input.type === 'checkbox' ? input.checked : input.value;
    });
    if (kind === 'associated') {
      result.controllers = [...section.querySelectorAll('.gateway-association-row')].map((association) => ({
        kind: association.querySelector('.gateway-association-kind').value,
        value: association.querySelector('.gateway-association-value').value
      }));
    }
    return result;
  }

  function requestTaskAssignmentUpdate(element, section, applyButtonForAssignment) {
    if (state.layoutCommitPending || state.isDragging) return;
    const mechanismSelect = section.querySelector('.task-mechanism-select');
    const assignment = {
      mechanism: mechanismSelect.value,
      mechanismConfiguration: readTaskMechanismConfiguration(section)
    };
    state.layoutCommitPending = true;
    applyButtonForAssignment.disabled = true;
    renderStatus(state.data);
    vscode.postMessage({ type: 'updateTaskAssignment', elementId: element.id, assignment });
    showToast('Gravando mecanismo de atribuição no arquivo .process...');
  }

  function requestProcessManagerUpdate(element, section, applyButtonForManager) {
    if (state.layoutCommitPending || state.isDragging) return;
    const mechanismSelect = section.querySelector('.task-mechanism-select');
    const assignment = {
      mechanism: mechanismSelect.value,
      mechanismConfiguration: readTaskMechanismConfiguration(section)
    };
    state.layoutCommitPending = true;
    applyButtonForManager.disabled = true;
    renderStatus(state.data);
    vscode.postMessage({ type: 'updateProcessManager', elementId: element.id, assignment });
    showToast('Gravando gestor no arquivo .process...');
  }

  function requestEventTriggerUpdate(element, section, applyButtonForTrigger) {
    if (state.layoutCommitPending || state.isDragging) return;
    const runType = section.querySelector('.event-trigger-run-type').value;
    const trigger = {
      runType,
      time: ['MINUTE', 'HOUR'].includes(runType)
        ? '00:00:00'
        : (section.querySelector('.event-trigger-time').value || '00:00:00'),
      frequency: runType === 'WEEK_MONTH'
        ? section.querySelector('.event-trigger-frequency-ordinal').value
        : section.querySelector('.event-trigger-frequency').value,
      dayOfWeek: section.querySelector('.event-trigger-day-of-week').value,
      weekdays: [...section.querySelectorAll('.event-trigger-weekday-checkbox:checked')]
        .map((checkbox) => checkbox.value)
    };
    if (runType === 'WEEK_DAY' && trigger.weekdays.length === 0) {
      showToast('Selecione ao menos um dia da semana.');
      return;
    }
    state.layoutCommitPending = true;
    applyButtonForTrigger.disabled = true;
    renderStatus(state.data);
    vscode.postMessage({ type: 'updateEventTrigger', elementId: element.id, trigger });
    showToast('Gravando agendamento Quartz no arquivo .process...');
  }

  function requestEventInitializerUpdate(element, section, applyButtonForInitializer) {
    if (state.layoutCommitPending || state.isDragging) return;
    const initializer = { userId: section.querySelector('.event-initializer-user').value };
    state.layoutCommitPending = true;
    applyButtonForInitializer.disabled = true;
    renderStatus(state.data);
    vscode.postMessage({ type: 'updateEventInitializer', elementId: element.id, initializer });
    showToast(initializer.userId
      ? 'Gravando inicializador no arquivo .process...'
      : 'Removendo inicializador do arquivo .process...');
  }

  function requestTaskNotificationsUpdate(element, section, applyButtonForNotifications) {
    if (state.layoutCommitPending || state.isDragging) return;
    const readChannel = (channel) => {
      const group = section.querySelector(`.task-late-${channel}`);
      return {
        enabled: group.querySelector('.task-late-enabled').checked,
        tolerance: group.querySelector('.task-late-tolerance').value,
        frequency: group.querySelector('.task-late-frequency').value,
        expiration: group.querySelector('.task-late-expiration').value
      };
    };
    const responsible = readChannel('responsible');
    const requester = readChannel('requester');
    const configuration = {
      notifyResponsible: section.querySelector('.task-notify-responsible').checked,
      notifyRequester: section.querySelector('.task-notify-requester').checked,
      lateResponsible: responsible.enabled,
      lateResponsibleTolerance: responsible.tolerance,
      lateResponsibleFrequency: responsible.frequency,
      lateResponsibleExpiration: responsible.expiration,
      lateRequester: requester.enabled,
      lateRequesterTolerance: requester.tolerance,
      lateRequesterFrequency: requester.frequency,
      lateRequesterExpiration: requester.expiration
    };
    state.layoutCommitPending = true;
    applyButtonForNotifications.disabled = true;
    renderStatus(state.data);
    vscode.postMessage({ type: 'updateTaskNotifications', elementId: element.id, configuration });
    showToast('Gravando acompanhamento e atraso no arquivo .process...');
  }

  function requestTaskJointUpdate(element, section, applyButtonForJoint) {
    if (state.layoutCommitPending || state.isDragging) return;
    const joint = section.querySelector('.task-joint-enabled').checked;
    const neverSelectCollaborators = section.querySelector('.task-joint-never-select').checked;
    const consensus = section.querySelector('.task-joint-consensus').value.trim();
    if ((joint || neverSelectCollaborators)
      && (!/^\d{1,3}$/.test(consensus) || Number(consensus) < 1 || Number(consensus) > 100)) {
      showToast('Informe um consenso inteiro entre 1 e 100.');
      return;
    }
    const configuration = { joint, consensus, neverSelectCollaborators };
    state.layoutCommitPending = true;
    applyButtonForJoint.disabled = true;
    renderStatus(state.data);
    vscode.postMessage({ type: 'updateTaskJoint', elementId: element.id, configuration });
    showToast('Gravando execução conjunta no arquivo .process...');
  }

  function requestTaskDeadlineUpdate(element, section, applyButtonForDeadline) {
    if (state.layoutCommitPending || state.isDragging) return;
    const mode = section.querySelector('.task-deadline-mode').value;
    const fixedDuration = section.querySelector('.task-deadline-fixed').value.trim();
    const deadlineFieldName = section.querySelector('.task-deadline-form').value;
    if (mode === 'fixed' && !/^\d{1,6}:[0-5]\d$/.test(fixedDuration)) {
      showToast('Informe o prazo no formato HHH:mm, por exemplo 024:00.');
      return;
    }
    if (mode === 'form' && !deadlineFieldName) {
      showToast('Selecione o campo do formulário usado como prazo.');
      return;
    }
    const configuration = {
      expedient: section.querySelector('.task-deadline-expedient').value,
      mode,
      fixedDuration,
      deadlineFieldName
    };
    state.layoutCommitPending = true;
    applyButtonForDeadline.disabled = true;
    renderStatus(state.data);
    vscode.postMessage({ type: 'updateTaskDeadline', elementId: element.id, configuration });
    showToast('Gravando expediente e prazo no arquivo .process...');
  }

  function requestProcessGeneralUpdate(element, section, applyButtonForProcess) {
    if (state.layoutCommitPending || state.isDragging) return;
    const description = section.querySelector('.process-general-description').value.trim();
    if (!description) {
      showToast('Informe a descrição do processo.');
      return;
    }
    const configuration = {
      code: section.querySelector('.process-general-code').value.trim(),
      serverId: section.querySelector('.process-general-server').value,
      description,
      instruction: section.querySelector('.process-general-instruction').value,
      category: section.querySelector('.process-general-category').value,
      volume: section.querySelector('.process-general-volume').value,
      expedient: section.querySelector('.process-general-expedient').value,
      deadlineTime: section.querySelector('.process-general-deadline').value,
      warningTime: section.querySelector('.process-general-warning').value,
      active: section.querySelector('.process-general-active').checked,
      activeTouched: section.querySelector('.process-general-active').dataset.touched === 'true',
      publicProcess: section.querySelector('.process-general-public').checked,
      publicTouched: section.querySelector('.process-general-public').dataset.touched === 'true',
      complements: {
        enabled: section.querySelector('.process-general-complements-enabled').value === 'true',
        level: section.querySelector('input[name^="process-complements-level-"]:checked')?.value
          ?? element.processGeneralEditor.complements?.level
          ?? '1',
        notifyResponsible: section.querySelector('.process-general-complements-notify-responsible').checked,
        notifyRequisitioner: section.querySelector('.process-general-complements-notify-requisitioner').checked,
        notifyManager: section.querySelector('.process-general-complements-notify-manager').checked
      }
    };
    state.layoutCommitPending = true;
    applyButtonForProcess.disabled = true;
    renderStatus(state.data);
    vscode.postMessage({ type: 'updateProcessGeneral', elementId: element.id, configuration });
    showToast('Gravando propriedades gerais no arquivo .process...');
  }

  function requestProcessVersionUpdate(element, section, applyButtonForVersion) {
    if (state.layoutCommitPending || state.isDragging) return;
    const configuration = {
      instructions: section.querySelector('.process-version-instructions').value,
      updateAttachment: section.querySelector('.process-version-update-attachment').checked,
      confirmPassword: section.querySelector('.process-version-confirm-password').checked,
      mobileProcess: section.querySelector('.process-version-mobile').checked
    };
    state.layoutCommitPending = true;
    applyButtonForVersion.disabled = true;
    renderStatus(state.data);
    vscode.postMessage({ type: 'updateProcessVersion', elementId: element.id, configuration });
    showToast('Gravando propriedades da versão no arquivo .process...');
  }

  function requestProcessFormUpdate(element, section, applyButtonForForm) {
    if (state.layoutCommitPending || state.isDragging) return;
    const source = section.querySelector('.process-form-source').value;
    const cardIndex = source === 'local'
      ? section.querySelector('.process-form-local-card').value
      : section.querySelector('.process-form-server-card').value.trim();
    if (!cardIndex) {
      showToast(source === 'local' ? 'Selecione um formulário local.' : 'Informe o código do formulário no servidor.');
      return;
    }
    let descriptorFields;
    if (source === 'local') {
      const existing = new Map(element.processFormEditor.descriptorFields.map((field) => [field.id, field]));
      descriptorFields = [...section.querySelectorAll('.process-form-local-descriptors input:checked')].map((input) => ({
        id: input.value,
        label: existing.get(input.value)?.label || input.value,
        cardIndex
      }));
    } else {
      descriptorFields = [...section.querySelectorAll('.process-form-server-descriptors input:checked')].map((input) => ({
        id: input.value,
        label: input.dataset.label || input.value,
        cardIndex: input.dataset.cardIndex || cardIndex
      }));
    }
    const max = element.processFormEditor.maxDescriptorFields;
    if (descriptorFields.length > max) {
      showToast(`O Fluig permite no máximo ${max} campos descritores.`);
      return;
    }
    const configuration = {
      source,
      cardIndex,
      uniqueCardVersion: section.querySelector('.process-form-unique').checked,
      inheritFormSecurity: section.querySelector('.process-form-inherit').checked,
      descriptorFields
    };
    state.layoutCommitPending = true;
    applyButtonForForm.disabled = true;
    renderStatus(state.data);
    vscode.postMessage({ type: 'updateProcessForm', elementId: element.id, configuration });
    showToast('Gravando formulário e campos descritores no arquivo .process...');
  }

  function readAttachmentSecurityMechanismConfiguration(row) {
    const select = row.querySelector('.process-attachment-security-mechanism');
    if (!select.value || row.dataset.mechanismConfigured !== 'true') return null;
    const kind = select.selectedOptions[0]?.dataset.kind;
    if (kind === 'custom') return {};
    const result = {};
    row.querySelectorAll('.process-attachment-security-configuration [data-config-key]').forEach((input) => {
      result[input.dataset.configKey] = input.type === 'checkbox' ? input.checked : input.value;
    });
    if (kind === 'associated') {
      result.controllers = [...row.querySelectorAll('.gateway-association-row')].map((association) => ({
        kind: association.querySelector('.gateway-association-kind').value,
        value: association.querySelector('.gateway-association-value').value
      }));
    }
    return result;
  }

  function requestProcessAttachmentSecurityUpdate(element, section, applyButtonForSecurity) {
    if (state.layoutCommitPending || state.isDragging) return;
    const controlled = section.querySelector('.process-attachment-security-mode input:checked')?.value === 'control';
    const rules = [...section.querySelectorAll('.process-attachment-security-rule')].map((row) => ({
      companyId: Number(row.dataset.companyId) || 1,
      mechanism: row.querySelector('.process-attachment-security-mechanism').value,
      mechanismConfiguration: readAttachmentSecurityMechanismConfiguration(row),
      permissions: Object.fromEntries(
        [...row.querySelectorAll('[data-permission-key]')]
          .map((input) => [input.dataset.permissionKey, input.checked])
      )
    }));
    state.layoutCommitPending = true;
    applyButtonForSecurity.disabled = true;
    renderStatus(state.data);
    vscode.postMessage({
      type: 'updateProcessAttachmentSecurity',
      elementId: element.id,
      configuration: { controlled, rules }
    });
    showToast('Gravando segurança de anexos no arquivo .process...');
  }

  function requestTaskMobileUpdate(element, section, applyButtonForMobile) {
    if (state.layoutCommitPending || state.isDragging) return;
    const configuration = {
      title: section.querySelector('.task-mobile-title').value,
      highlight: section.querySelector('.task-mobile-highlight').value,
      description: section.querySelector('.task-mobile-description').value,
      reject: section.querySelector('.task-mobile-reject').value,
      approve: section.querySelector('.task-mobile-approve').value
    };
    state.layoutCommitPending = true;
    applyButtonForMobile.disabled = true;
    renderStatus(state.data);
    vscode.postMessage({ type: 'updateTaskMobile', elementId: element.id, configuration });
    showToast('Gravando configuração Mobile no arquivo .process...');
  }

  function requestTaskAttachmentRulesUpdate(element, section, applyButtonForRules) {
    if (state.layoutCommitPending || state.isDragging) return;
    const rules = [...section.querySelectorAll('.task-attachment-rule')].map((row) => ({
      operator: row.querySelector('.task-attachment-rule-operator').value,
      amount: row.querySelector('.task-attachment-rule-amount').value,
      name: row.querySelector('.task-attachment-rule-name').value,
      message: row.querySelector('.task-attachment-rule-message').value
    }));
    state.layoutCommitPending = true;
    applyButtonForRules.disabled = true;
    renderStatus(state.data);
    vscode.postMessage({ type: 'updateTaskAttachmentRules', elementId: element.id, rules });
    showToast('Gravando regras de anexo no arquivo .process...');
  }

  function requestSubProcessFormMapUpdate(element, section, applyButtonForMaps) {
    if (state.layoutCommitPending || state.isDragging) return;
    const maps = [...section.querySelectorAll('.subprocess-form-map-row')].map((row) => ({
      processField: row.querySelector('.subprocess-form-map-parent').value,
      subProcessField: row.querySelector('.subprocess-form-map-child').value,
      mapFlow: row.querySelector('.subprocess-form-map-direction').value
    }));
    state.layoutCommitPending = true;
    applyButtonForMaps.disabled = true;
    renderStatus(state.data);
    vscode.postMessage({ type: 'updateSubProcessFormMaps', elementId: element.id, maps });
    showToast('Gravando campos do subprocesso no arquivo .process...');
  }

  function requestExtendedPropertiesUpdate(element, section, applyButtonForExtendedProperties) {
    if (state.layoutCommitPending || state.isDragging) return;
    const properties = [...section.querySelectorAll('.extended-property')].map((row) => ({
      name: row.querySelector('.extended-property-name').value,
      type: row.querySelector('.extended-property-type').value,
      label: row.querySelector('.extended-property-label').value,
      value: readExtendedPropertyValue(row)
    }));
    const incomplete = properties.find((property) => !property.name.trim() || !property.label.trim());
    if (incomplete) {
      showToast('Preencha Nome(id) e Label de todos os atributos de extensão.');
      return;
    }
    state.layoutCommitPending = true;
    applyButtonForExtendedProperties.disabled = true;
    renderStatus(state.data);
    vscode.postMessage({ type: 'updateExtendedProperties', elementId: element.id, properties });
    showToast('Gravando atributos de extensão no arquivo .process...');
  }

  function nextGatewayConditionOrder(list) {
    const orders = [...list.querySelectorAll('.gateway-order-input')]
      .map((input) => Number(input.value))
      .filter((order) => Number.isInteger(order) && order > 0);
    return orders.length ? Math.max(...orders) + 1 : 1;
  }

  function moveGatewayConditionRow(list, row, direction) {
    const rows = [...list.querySelectorAll('.gateway-condition-row')];
    if (!rows.length || rows.some((item) => item.dataset.editable !== 'true')) return;
    const index = rows.indexOf(row);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= rows.length) return;
    if (direction < 0) list.insertBefore(row, rows[targetIndex]);
    else list.insertBefore(rows[targetIndex], row);
    syncGatewayConditionOrderControls(list);
  }

  function syncGatewayConditionOrderControls(list) {
    const rows = [...list.querySelectorAll('.gateway-condition-row')];
    const canReorder = rows.every((row) => row.dataset.editable === 'true');
    rows.forEach((row, index) => {
      const title = row.querySelector('.gateway-condition-title');
      if (title) title.textContent = `Condição ${index + 1}`;
      const order = row.querySelector('.gateway-order-input');
      if (order && canReorder) order.value = String(index + 1);
      const moveUp = row.querySelector('.gateway-condition-move-up');
      const moveDown = row.querySelector('.gateway-condition-move-down');
      if (moveUp) moveUp.disabled = !canReorder || index === 0;
      if (moveDown) moveDown.disabled = !canReorder || index === rows.length - 1;
      const warning = canReorder ? '' : 'A reordenação foi bloqueada porque existe uma condição com estrutura desconhecida.';
      if (moveUp) moveUp.title = warning;
      if (moveDown) moveDown.title = warning;
    });
  }

  function requestGatewayBranchUpdate(element, section, applyButtonForConditions) {
    if (state.layoutCommitPending || state.isDragging) return;
    const list = section.querySelector('.gateway-condition-list');
    syncGatewayConditionOrderControls(list);
    const rows = [...list.querySelectorAll('.gateway-condition-row')];
    const automaticallyOrdered = rows.every((row) => row.dataset.editable === 'true');
    const conditions = rows.map((row, index) => {
      return {
        sourceIndex: row.dataset.sourceIndex,
        order: automaticallyOrdered ? index + 1 : Number(row.querySelector('.gateway-order-input').value),
        targetId: row.querySelector('.gateway-destination-select').value,
        expression: row.querySelector('.gateway-expression-input').value,
        conditionType: row.dataset.conditionType,
        rules: readGatewayAdvancedRules(row),
        mechanism: readGatewayMechanism(row),
        mechanismConfiguration: readGatewayMechanismConfiguration(row)
      };
    });
    const invalid = conditions.find((condition) => (
      !Number.isInteger(condition.order) || condition.order < 1
      || !condition.targetId
      || (condition.conditionType === '0' && !condition.expression.trim())
      || (condition.conditionType === '1' && !condition.rules.length)
    ));
    if (invalid) {
      showToast('Preencha ordem, atividade destino e a expressão ou as regras da condição.');
      return;
    }
    const invalidRule = conditions
      .filter((condition) => condition.conditionType === '1')
      .flatMap((condition) => condition.rules)
      .find((rule) => (
        !rule.field || !rule.operator || !rule.valueType
        || (!['0', '9'].includes(rule.operator) && !rule.value.trim())
      ));
    if (invalidRule) {
      showToast('Preencha campo, operação, tipo e valor de todas as regras avançadas.');
      return;
    }
    const orders = conditions.map((condition) => condition.order);
    if (new Set(orders).size !== orders.length) {
      showToast('Cada condição deve possuir uma ordem diferente.');
      return;
    }
    const configuration = {
      conditions,
      defaultFlowId: section.dataset.defaultFlowId ?? ''
    };
    state.layoutCommitPending = true;
    applyButtonForConditions.disabled = true;
    renderStatus(state.data);
    vscode.postMessage({ type: 'updateGatewayBranches', gatewayId: element.id, configuration });
    showToast('Gravando condições e fluxo padrão no arquivo .process...');
  }

  function readGatewayAdvancedRules(conditionRow) {
    if (conditionRow.dataset.conditionType !== '1') return [];
    return [...conditionRow.querySelectorAll('.gateway-advanced-rule-row')].map((row) => ({
      sourceIndex: row.dataset.sourceIndex,
      processId: row.dataset.processId,
      tenantId: Number(row.dataset.tenantId || 0),
      version: Number(row.dataset.version || 0),
      field: row.querySelector('.gateway-advanced-field').value,
      operator: row.querySelector('.gateway-advanced-operator').value,
      valueType: row.querySelector('.gateway-advanced-value-type').value,
      value: row.querySelector('.gateway-advanced-value').value
    }));
  }

  function requestSelectedFlowDeletion() {
    if (!state.data?.supported || state.layoutCommitPending || state.isDragging || state.selectedIds.length !== 1) return false;
    const flow = findElement(state.selectedIds[0]);
    if (flow?.tag !== 'SequenceFlow') return false;
    state.layoutCommitPending = true;
    deleteButton.disabled = true;
    vscode.postMessage({ type: 'deleteSequenceFlow', flowId: flow.id });
    showToast(`Aguardando confirmação para excluir ${flow.id}...`);
    return true;
  }

  function requestSelectedDeletion() {
    if (!state.data?.supported || state.layoutCommitPending || state.isDragging || !state.selectedIds.length) return false;
    if (state.selectedIds.length > 1) return requestMultipleElementDeletion();
    const element = findElement(state.selectedIds[0]);
    if (element?.tag === 'SequenceFlow') return requestSelectedFlowDeletion();
    if (isDeletableAttachedErrorEvent(element)) return requestSelectedAttachedErrorDeletion(element);
    if (isDeletableIsolatedTask(element)) return requestSelectedIsolatedTaskDeletion(element);
    if (isDeletableIsolatedSubProcess(element)) return requestSelectedIsolatedSubProcessDeletion(element);
    if (isDeletableIsolatedArtifact(element)) return requestSelectedIsolatedArtifactDeletion(element);
    if (isDeletableIsolatedEvent(element)) return requestSelectedIsolatedEventDeletion(element);
    if (isDeletableIsolatedGateway(element)) return requestSelectedIsolatedGatewayDeletion(element);
    if (isDeletableContainer(element)) return requestSelectedContainerDeletion(element);
    return false;
  }

  function requestMultipleElementDeletion() {
    const elementIds = state.selectedIds.filter((id) => isSupportedMultipleDeletion(findElement(id)));
    if (elementIds.length !== state.selectedIds.length) {
      showToast('A seleção contém o processo ou outro elemento que não pode ser excluído em conjunto.');
      return false;
    }
    state.layoutCommitPending = true;
    deleteButton.disabled = true;
    vscode.postMessage({ type: 'deleteMultipleElements', elementIds });
    showToast(`Aguardando confirmação para excluir ${elementIds.length} elementos...`);
    return true;
  }

  function isSupportedMultipleDeletion(element) {
    if (!element) return false;
    if (element.tag === 'SequenceFlow') return true;
    if (element.tag === 'BpmnTask') return ['80', '81', '82', '84', '85', '86', '87'].includes(String(element.type));
    if (element.tag === 'BpmnSubProcess') return ['100', '101'].includes(String(element.type));
    if (element.tag === 'BpmnGateway') return ['120', '121', '126', '127'].includes(String(element.type));
    if (element.tag === 'BpmnStartEvent') return ['10', '12', '13', '14', '16'].includes(String(element.type));
    if (element.tag === 'BpmnEndEvent') return ['60', '63', '64', '65', '66', '68'].includes(String(element.type));
    if (element.tag === 'BpmnIntermediateEvent') return ['30', '32', '35', '36', '37', '39', '41', '42', '43'].includes(String(element.type));
    if (['BpmnPool', 'BpmnSwimLane'].includes(element.tag)) return true;
    return ['BpmnAnnotation', 'BpmnDatabase', 'BpmnDocument', 'BpmnGroup'].includes(element.tag);
  }

  function requestSelectedContainerDeletion(element) {
    if (!isDeletableContainer(element)) return false;
    state.layoutCommitPending = true;
    deleteButton.disabled = true;
    vscode.postMessage({ type: 'deleteDiagramContainer', elementId: element.id });
    showToast(`Aguardando confirmação para excluir ${element.id}...`);
    return true;
  }

  function isDeletableContainer(element) {
    return Boolean(element) && ['BpmnPool', 'BpmnSwimLane'].includes(element.tag);
  }

  function requestSelectedAttachedErrorDeletion(element) {
    if (!isDeletableAttachedErrorEvent(element)) return false;
    state.layoutCommitPending = true;
    deleteButton.disabled = true;
    vscode.postMessage({ type: 'deleteAttachedErrorEvent', elementId: element.id });
    showToast(`Aguardando confirmação para excluir a tratativa ${element.id}...`);
    return true;
  }

  function isDeletableAttachedErrorEvent(element) {
    if (!element || element.tag !== 'BpmnIntermediateEvent' || element.type !== '43') return false;
    const parentTaskId = String(element.attributes?.parentTask ?? '').trim();
    const parentTask = findElement(parentTaskId);
    return Boolean(parentTask)
      && parentTask.tag === 'BpmnTask'
      && parentTask.type === '82'
      && String(parentTask.attributes?.attachedEvents ?? '').trim().split(/\s+/).includes(element.id)
      && !String(element.attributes?.incoming ?? '').trim()
      && !String(element.attributes?.outgoing ?? '').trim();
  }

  function requestSelectedIsolatedEventDeletion(element) {
    if (!isDeletableIsolatedEvent(element)) return false;
    state.layoutCommitPending = true;
    deleteButton.disabled = true;
    vscode.postMessage({ type: 'deleteIsolatedEvent', elementId: element.id });
    showToast(`Aguardando confirmação para excluir ${element.id}...`);
    return true;
  }

  function isDeletableIsolatedEvent(element) {
    if (!element) return false;
    const allowedTypes = {
      BpmnStartEvent: ['10', '12', '13', '14', '16'],
      BpmnEndEvent: ['60', '63', '64', '65', '66', '68'],
      BpmnIntermediateEvent: ['30', '32', '35', '36', '37', '39', '41', '42']
    };
    const allowed = allowedTypes[element.tag]?.includes(String(element.type)) ?? false;
    const linkedSendEvent = element.tag === 'BpmnIntermediateEvent'
      && element.type === '36'
      && !['', '0'].includes(String(element.attributes?.linkId ?? '').trim());
    return allowed
      && !linkedSendEvent
      && element.type !== '43';
  }

  function requestSelectedIsolatedGatewayDeletion(element) {
    if (!isDeletableIsolatedGateway(element)) return false;
    state.layoutCommitPending = true;
    deleteButton.disabled = true;
    vscode.postMessage({ type: 'deleteIsolatedGateway', elementId: element.id });
    showToast(`Aguardando confirmação para excluir ${element.id}...`);
    return true;
  }

  function isDeletableIsolatedGateway(element) {
    if (!element || element.tag !== 'BpmnGateway') return false;
    const allowedType = ['120', '121', '126', '127'].includes(String(element.type));
    const emptyCondition = String(element.attributes?.condition ?? '').replace(/\s+/g, '') === '<list/>';
    return allowedType
      && emptyCondition;
  }

  function requestSelectedIsolatedTaskDeletion(element) {
    if (!isDeletableIsolatedTask(element)) return false;
    state.layoutCommitPending = true;
    deleteButton.disabled = true;
    vscode.postMessage({ type: 'deleteIsolatedTask', elementId: element.id });
    showToast(`Aguardando confirmação para excluir ${element.id}...`);
    return true;
  }

  function isDeletableIsolatedTask(element) {
    if (!element || element.tag !== 'BpmnTask') return false;
    const allowedType = ['80', '81', '82', '84', '85', '86', '87'].includes(String(element.type));
    return allowedType
      && !String(element.attributes?.attachedEvents ?? '').trim();
  }

  function requestSelectedIsolatedSubProcessDeletion(element) {
    if (!isDeletableIsolatedSubProcess(element)) return false;
    state.layoutCommitPending = true;
    deleteButton.disabled = true;
    vscode.postMessage({ type: 'deleteIsolatedSubProcess', elementId: element.id });
    showToast(`Aguardando confirmação para excluir ${element.id}...`);
    return true;
  }

  function isDeletableIsolatedSubProcess(element) {
    if (!element || element.tag !== 'BpmnSubProcess') return false;
    const allowedType = ['100', '101'].includes(String(element.type));
    return allowedType
      && !String(element.attributes?.attachedEvents ?? '').trim();
  }

  function requestSelectedIsolatedArtifactDeletion(element) {
    if (!isDeletableIsolatedArtifact(element)) return false;
    state.layoutCommitPending = true;
    deleteButton.disabled = true;
    vscode.postMessage({ type: 'deleteIsolatedArtifact', elementId: element.id });
    showToast(`Aguardando confirmação para excluir ${element.id}...`);
    return true;
  }

  function isDeletableIsolatedArtifact(element) {
    if (!element) return false;
    const typedArtifact = ['BpmnAnnotation', 'BpmnDatabase', 'BpmnDocument'].includes(element.tag)
      && String(element.type) === '0';
    const visualGroup = element.tag === 'BpmnGroup' && !String(element.type ?? '');
    return typedArtifact || (visualGroup
      && !String(element.attributes?.incoming ?? '').trim()
      && !String(element.attributes?.outgoing ?? '').trim());
  }

  function artifactDeleteLabel(element) {
    return {
      BpmnAnnotation: 'Excluir anotação',
      BpmnDatabase: 'Excluir database',
      BpmnDocument: 'Excluir documento',
      BpmnGroup: 'Excluir grupo'
    }[element?.tag] || 'Excluir artefato';
  }

  function createField(property, value) {
    const label = document.createElement('label');
    label.className = `field ${property.kind === 'boolean' ? 'checkbox' : ''}`;
    label.dataset.propertyName = property.name;
    const caption = document.createElement('span'); caption.textContent = propertyLabel(property.name);
    let input;
    if (property.kind === 'multiline') {
      input = document.createElement('textarea'); input.value = value;
    } else if (property.kind === 'recipient') {
      input = createRecipientControl(property, value);
    } else if (property.kind === 'select') {
      input = document.createElement('select');
      for (const optionDefinition of property.options || []) {
        const option = document.createElement('option');
        option.value = optionDefinition.value;
        option.textContent = optionDefinition.label;
        input.append(option);
      }
      input.value = value;
    } else {
      input = document.createElement('input');
      input.type = property.kind === 'boolean' ? 'checkbox' : property.kind === 'number' ? 'number' : property.kind === 'color' ? 'color' : 'text';
      if (property.kind === 'boolean') input.checked = value === true;
      else if (property.kind === 'color') input.value = safeHexColor(value) || '#ffffff';
      else input.value = value;
      if (property.kind === 'duration') { input.placeholder = '000:00'; input.pattern = '\\d{1,6}:[0-5]\\d'; }
      if (property.kind === 'number') {
        if (property.min !== undefined) input.min = String(property.min);
        if (property.step !== undefined) input.step = String(property.step);
      }
    }
    input.name = property.name;
    if (property.name === 'linkId' && property.kind === 'select') {
      const controls = document.createElement('div');
      controls.className = 'link-navigation-controls';
      const navigateButton = document.createElement('button');
      navigateButton.type = 'button';
      navigateButton.className = 'link-navigation-button';
      navigateButton.textContent = 'Ir para o link selecionado';
      navigateButton.title = 'Selecionar e centralizar o evento receptor deste link';
      const updateNavigationAvailability = () => {
        const target = findElement(input.value);
        navigateButton.disabled = !target
          || target.tag !== 'BpmnIntermediateEvent'
          || String(target.type) !== '42'
          || !findShape(input.value);
      };
      input.addEventListener('change', updateNavigationAvailability);
      navigateButton.addEventListener('click', () => navigateToLinkedEvent(input.value));
      updateNavigationAvailability();
      controls.append(input, navigateButton);
      label.append(caption, controls);
    } else if (property.kind === 'boolean') label.append(input, caption); else label.append(caption, input);
    return label;
  }

  function createRecipientControl(property, value) {
    const messageType = propertyForm.elements.namedItem('messageType')?.value ?? state.formInitial.messageType;
    if (messageType !== '2') {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = value;
      return input;
    }

    const select = document.createElement('select');
    const options = [...(property.options || [])];
    if (value && !options.some((option) => option.value === value)) {
      options.unshift({ value, label: `${value} (atual; não encontrado no formulário)` });
    }
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = options.length ? 'Selecione um campo' : 'Nenhum campo encontrado';
    select.append(placeholder);
    for (const optionDefinition of options) {
      const option = document.createElement('option');
      option.value = optionDefinition.value;
      option.textContent = optionDefinition.label;
      select.append(option);
    }
    select.value = value;
    return select;
  }

  function updateDependentFields(event) {
    if (event.target.name !== 'messageType') return;
    const receiverField = propertyFields.querySelector('[data-property-name="messageReceiver"]');
    const receiverProperty = findElement(state.selectedId)?.editableProperties
      .find((property) => property.name === 'messageReceiver');
    if (!receiverField || !receiverProperty) return;
    const currentReceiver = propertyForm.elements.namedItem('messageReceiver')?.value ?? '';
    receiverField.replaceWith(createField(receiverProperty, currentReceiver));
  }

  function updateDirtyState() {
    const current = readForm();
    const dirty = Object.keys(current).some((key) => current[key] !== state.formInitial[key]);
    applyButton.disabled = !dirty;
    dirtyHint.textContent = dirty ? 'Alterações não aplicadas' : '';
  }

  function submitProperties(event) {
    event.preventDefault();
    const current = readForm();
    const changes = Object.fromEntries(Object.entries(current).filter(([key, value]) => value !== state.formInitial[key]));
    if (Object.keys(changes).length === 0) return;
    applyButton.disabled = true;
    dirtyHint.textContent = 'Aplicando...';
    vscode.postMessage({ type: 'updateProperties', elementId: state.selectedId, changes });
  }

  function readForm() {
    const values = {};
    for (const field of propertyFields.querySelectorAll('[data-property-name]')) {
      const control = field.querySelector('[name]');
      if (!control?.name) continue;
      values[control.name] = control.type === 'checkbox'
        ? control.checked
        : (control.type === 'color' ? control.value.replace(/^#/, '').toUpperCase() : control.value);
    }
    return values;
  }

  function filterDiagram(event) {
    const term = event.target.value.trim().toLocaleLowerCase('pt-BR');
    viewport.querySelectorAll('.search-hit').forEach((item) => item.classList.remove('search-hit'));
    if (!term) return;
    state.data.elements.filter((element) => `${element.id} ${element.name} ${element.typeLabel}`.toLocaleLowerCase('pt-BR').includes(term))
      .forEach((element) => viewport.querySelector(`[data-id="${cssEscape(element.id)}"]`)?.classList.add('search-hit'));
  }

  function renderStatus(data) {
    const errors = data.validation.errors.length;
    const warnings = data.validation.warnings.length;
    const fp = data.fingerprint;
    const preview = state.layoutPreviewDirty ? ' · layout em prévia' : '';
    const editorVersion = data.extensionVersion ? `editor ${data.extensionVersion} · ` : '';
    const summary = `${editorVersion}${fp.version || 'versão ?'} · ${fp.encoding} · ${data.counts.diagramElements} elementos · ${data.connections.length} conexões${preview}`;
    if (errors) setStatus(`${summary} · ${errors} erro(s)`, 'error');
    else if (warnings) setStatus(`${summary} · ${warnings} aviso(s)`, 'warning');
    else setStatus(`${summary} · estrutura válida`, 'ok');
  }

  function updateValidationProblemsButton(data) {
    const groups = validationProblemGroups(data);
    const errors = groups.reduce((total, group) => total + group.items.filter((item) => item.severity === 'error').length, 0);
    const warnings = groups.reduce((total, group) => total + group.items.filter((item) => item.severity === 'warning').length, 0);
    showErrorsButton.textContent = `Erros (${errors})`;
    showErrorsButton.title = errors || warnings
      ? `Exibir ${errors} erro(s) e ${warnings} aviso(s), agrupados por elemento`
      : 'Nenhum erro ou aviso encontrado';
    showErrorsButton.disabled = !groups.length;
    showErrorsButton.classList.toggle('has-errors', errors > 0);
    showErrorsButton.classList.toggle('has-warnings', warnings > 0);
  }

  function showValidationProblems() {
    const groups = validationProblemGroups(state.data);
    validationProblemList.replaceChildren();
    const errorCount = groups.reduce((total, group) => total + group.items.filter((item) => item.severity === 'error').length, 0);
    const warningCount = groups.reduce((total, group) => total + group.items.filter((item) => item.severity === 'warning').length, 0);
    validationDialogSummary.textContent = `${groups.length} elemento(s) · ${errorCount} erro(s) · ${warningCount} aviso(s)`;
    if (!groups.length) {
      const empty = document.createElement('div');
      empty.className = 'validation-problem-empty';
      empty.textContent = 'Nenhum erro ou aviso encontrado.';
      validationProblemList.append(empty);
    }
    for (const group of groups) validationProblemList.append(createValidationProblemGroup(group));
    if (!validationDialog.open) validationDialog.showModal();
  }

  function validationProblemGroups(data) {
    if (!data?.supported) return [];
    const groups = new Map();
    const addProblem = (elementId, item) => {
      const key = String(elementId || '__process__');
      if (!groups.has(key)) groups.set(key, { elementId: key === '__process__' ? '' : key, items: [], keys: new Set() });
      const group = groups.get(key);
      const problemKey = `${item.severity}|${item.code || ''}|${item.message}`;
      if (group.keys.has(problemKey)) return;
      group.keys.add(problemKey);
      group.items.push(item);
    };
    for (const element of data.elements ?? []) {
      for (const message of element.configurationIssues ?? []) {
        addProblem(element.id, { severity: 'error', code: 'CONFIG', message });
      }
    }
    for (const finding of data.validation?.errors ?? []) {
      addProblem(finding.elementId, { severity: 'error', code: finding.code, message: finding.message });
    }
    for (const finding of data.validation?.warnings ?? []) {
      addProblem(finding.elementId, { severity: 'warning', code: finding.code, message: finding.message });
    }
    return [...groups.values()]
      .map((group) => ({ ...group, element: group.elementId ? findElement(group.elementId) : null }))
      .sort((left, right) => {
        if (!left.elementId) return -1;
        if (!right.elementId) return 1;
        const leftCode = Number(left.element?.code || Number.MAX_SAFE_INTEGER);
        const rightCode = Number(right.element?.code || Number.MAX_SAFE_INTEGER);
        return leftCode - rightCode || left.elementId.localeCompare(right.elementId, 'pt-BR');
      });
  }

  function createValidationProblemGroup(group) {
    const container = document.createElement('section');
    container.className = 'validation-problem-group';
    const target = document.createElement('button');
    target.type = 'button';
    target.className = 'validation-problem-target';
    const title = document.createElement('span');
    title.className = 'validation-problem-title';
    title.textContent = group.element
      ? `${group.element.code ? `${group.element.code} · ` : ''}${group.element.name || group.element.typeLabel} (${group.element.id})`
      : (group.elementId ? `Elemento ${group.elementId}` : 'Processo / estrutura');
    const count = document.createElement('span');
    count.className = 'validation-problem-count';
    count.textContent = String(group.items.length);
    target.append(title, count);
    const navigable = Boolean(group.element && (findShape(group.elementId) || findConnection(group.elementId) || group.element.tag === 'BpmnProcess'));
    target.disabled = !navigable;
    target.title = navigable ? 'Selecionar e centralizar este elemento' : 'Não há representação visual para este item';
    if (navigable) target.addEventListener('click', () => {
      validationDialog.close();
      focusDiagramElement(group.elementId);
    });
    const items = document.createElement('ul');
    items.className = 'validation-problem-items';
    for (const problem of group.items) {
      const item = document.createElement('li');
      item.className = `validation-problem-item ${problem.severity}`;
      const code = document.createElement('span');
      code.className = 'validation-problem-code';
      code.textContent = problem.code || (problem.severity === 'warning' ? 'AVISO' : 'ERRO');
      item.append(code, document.createTextNode(problem.message));
      items.append(item);
    }
    container.append(target, items);
    return container;
  }

  function setStatus(message, kind) { status.textContent = message; status.className = `status ${kind}`; }

  function updateCanvasBounds(data) {
    const fitted = fittedCanvas(diagramContentBounds());
    setCanvasDimensions(fitted.width, fitted.height);
    const saved = vscode.getState();
    if (saved?.zoom) setZoom(saved.zoom); else fitDiagram();
  }

  function setCanvasDimensions(width, height) {
    state.canvasWidth = Math.max(1000, Math.ceil(width));
    state.canvasHeight = Math.max(800, Math.ceil(height));
    const view = canvasViewBox(state.canvasWidth, state.canvasHeight, diagramContentBounds());
    state.canvasMinX = view.x;
    state.canvasMinY = view.y;
    diagram.setAttribute('viewBox', `${view.x} ${view.y} ${view.width} ${view.height}`);
    diagram.style.width = `${view.width}px`;
    diagram.style.height = `${view.height}px`;
  }

  function fitDiagram() {
    const width = Number(diagram.getAttribute('viewBox').split(' ')[2]) || 1000;
    setZoom(Math.min(1, Math.max(.25, (canvasScroller.clientWidth - 24) / width)));
  }

  function handleCanvasWheel(event) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    if (!state.data?.supported || event.deltaY === 0) return;
    const previousZoom = state.zoom;
    const rect = canvasScroller.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    setZoom(previousZoom + (event.deltaY < 0 ? 0.1 : -0.1));
    if (state.zoom === previousZoom) return;
    const nextScroll = zoomedScrollPosition({
      scrollLeft: canvasScroller.scrollLeft,
      scrollTop: canvasScroller.scrollTop,
      pointerX,
      pointerY,
      previousZoom,
      nextZoom: state.zoom
    });
    canvasScroller.scrollLeft = nextScroll.left;
    canvasScroller.scrollTop = nextScroll.top;
  }

  function setZoom(value) {
    state.zoom = Math.min(2.5, Math.max(.2, Math.round(value * 10) / 10));
    viewport.setAttribute('transform', `scale(${state.zoom})`);
    canvasScroller.style.setProperty('--diagram-grid-size', `${Math.max(2, 10 * state.zoom)}px`);
    zoomResetButton.textContent = `${Math.round(state.zoom * 100)}%`;
    zoomResetButton.title = `Zoom atual: ${Math.round(state.zoom * 100)}%. Clique para ajustar o diagrama.`;
    persistViewState();
  }

  function rebuildIndexes(data) {
    state.elementById = new Map((data?.elements ?? []).map((item) => [item.id, item]));
    state.shapeById = new Map((data?.shapes ?? []).map((item) => [item.businessObject, item]));
    state.connectionById = new Map((data?.connections ?? []).map((item) => [item.businessObject, item]));
  }

  function findElement(id) { return state.elementById.get(id); }
  function findShape(id) { return state.shapeById.get(id); }
  function shapeLayer(id) { const tag = findElement(id)?.tag; return tag === 'BpmnPool' ? 0 : tag === 'BpmnSwimLane' || tag === 'BpmnGroup' ? 1 : 2; }
  function shapeClass(element) {
    const typeClass = element.type ? `type-${element.type}` : '';
    if (element.tag === 'BpmnTask') return `task ${typeClass}`;
    if (element.tag === 'BpmnSubProcess') return `task subprocess ${typeClass}`;
    if (element.tag === 'BpmnGateway') return `gateway ${typeClass}`;
    if (element.tag === 'BpmnStartEvent') return `event start-event ${typeClass}`;
    if (element.tag === 'BpmnIntermediateEvent') return `event intermediate-event ${typeClass}`;
    if (element.tag === 'BpmnEndEvent') return `event end-event ${typeClass}`;
    if (element.tag === 'BpmnPool') return 'pool';
    if (element.tag === 'BpmnSwimLane') return 'lane';
    if (element.tag === 'BpmnGroup') return 'group';
    return `artifact ${element.tag.replace(/^Bpmn/, '').toLowerCase()} ${typeClass}`;
  }
  function defaultSize(element) {
    if (element.tag === 'BpmnGateway') return { width: 60, height: 60 };
    if (element.tag.includes('Event')) return { width: 35, height: 35 };
    if (element.tag === 'BpmnTask' || element.tag === 'BpmnSubProcess') return { width: 106, height: 70 };
    return { width: 20, height: 20 };
  }
  function effectiveSize(shape, element) {
    const fallback = defaultSize(element);
    return {
      width: shape.visualWidth > 0 ? shape.visualWidth : shape.width > 0 ? shape.width : fallback.width,
      height: shape.visualHeight > 0 ? shape.visualHeight : shape.height > 0 ? shape.height : fallback.height
    };
  }
  function errorBadgePosition(shape, element) {
    const { width } = effectiveSize(shape, element);
    const activity = element.tag === 'BpmnTask' || element.tag === 'BpmnSubProcess';
    return { x: activity ? shape.x + width - 9 : shape.x + 9, y: shape.y + 9 };
  }
  function attachedParentId(element) {
    if (!isAttachedBoundaryEvent(element)) return '';
    const parentId = String(element.attributes.parentTask || '');
    const parent = findElement(parentId);
    return parent?.tag === 'BpmnTask' && parent.type === '82' ? parentId : '';
  }
  function isAttachedBoundaryEvent(element) {
    return element?.tag === 'BpmnIntermediateEvent'
      && element.type === '43'
      && Boolean(element.attributes.parentTask);
  }
  function safeHexColor(value) {
    const normalized = String(value || '').trim().replace(/^#/, '');
    return /^[0-9a-f]{6}$/i.test(normalized) ? `#${normalized}` : '';
  }
  function propertyLabel(name) {
    if (name === 'cores') return 'Cor';
    if (name === 'signalId') return 'Sinal';
    if (name === 'linkId') return 'Link';
    return ({ name: 'Nome', instrucoes: 'Instruções', instructions: 'Instruções', authNotify: 'Notificar responsável', digitalSignature: 'Assinatura digital', confirmarSenha: 'Confirmar senha', inibeOpcaoTransferir: 'Inibir transferência', prazoConclusao: 'Prazo de conclusão', expediente: 'Expediente', esforcoCalculo: 'Cálculo do esforço', esforcoPrevisto: 'Esforço previsto', executionType: 'Execução', executionAttempts: 'Tentativas', frequency: 'A cada', frequencyType: 'Unidade', executionSucessfulMessage: 'Mensagem de sucesso', serviceName: 'Serviço', messageType: 'Tipo do destinatário', messageReceiver: 'Destinatário', messageSubject: 'Assunto', messageContent: 'Conteúdo', process: 'Subprocesso', initialTask: 'Atividade inicial', notificaRequisitante: 'Notificar requisitante', transferAttachments: 'Transferir anexos', cancelSubProcess: 'Cancelamento conjunto', sendToNextTaskInSubProcess: 'Movimentar próxima atividade', atividadeFluxo: 'Atividade do fluxo', atividadeRetorno: 'Atividade de retorno', permiteRetorno: 'Permite retorno', fluxoAutomatico: 'Fluxo automático', defaultLink: 'Fluxo padrão', movementTitle: 'Título da movimentação', movementDescription: 'Descrição da movimentação', movementAccessLinkDescription: 'Título do link da movimentação', documentId: 'Documento' })[name] || name;
  }
  function svg(name, attributes) { const node = document.createElementNS('http://www.w3.org/2000/svg', name); Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value))); return node; }
  function cssEscape(value) { return window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/[^\w-]/g, '\\$&'); }
  function showToast(message) { const toast = document.getElementById('toast'); toast.textContent = message; toast.classList.remove('hidden'); setTimeout(() => toast.classList.add('hidden'), 3500); }
}());
