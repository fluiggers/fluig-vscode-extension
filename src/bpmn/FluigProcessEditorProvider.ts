'use strict';

const vscode = require('vscode');
const crypto = require('node:crypto');
const path = require('node:path');
const zlib = require('node:zlib');
const { parseProcess } = require('./processModel');
const {
  convertTaskType,
  createConnectedEndEvent,
  createConnectedGateway,
  createConnectedIntermediateEvent,
  createConnectedTask,
  createAttachedErrorEvent,
  createIsolatedNode,
  createPool,
  createSequenceFlow,
  reconnectSequenceFlow,
  createSwimLane,
  deleteAttachedErrorEvent,
  deleteIsolatedArtifact,
  deleteIsolatedEvent,
  deleteIsolatedGateway,
  deleteIsolatedSubProcess,
  deleteIsolatedTask,
  deleteDiagramContainer,
  deleteDiagramElements,
  deleteSequenceFlow,
  patchGatewayBranches,
  patchEventInitializer,
  patchExtendedProperties,
  patchTaskAttachmentRules,
  patchTaskMobile,
  patchTaskNotifications,
  patchTaskDeadline,
  patchTaskJoint,
  patchEventTrigger,
  patchTaskAssignment,
  patchTaskScriptReference,
  patchSubProcessFormMaps,
  patchLayout,
  patchProcessForm,
  patchProcessAttachmentSecurity,
  patchProcessGeneral,
  patchProcessIdentity,
  patchProcessVersion,
  patchProcessManager,
  patchProcess
} = require('./processPatcher');
const { validateProcess } = require('./processValidator');
const { toWebviewData } = require('./webviewData');
const { getWebviewHtml } = require('./webviewHtml');
const { BackupService } = require('./backupService');
const { discoverFormFields, discoverLocalFormCatalog } = require('./formFields');
const { discoverExpedientCatalog } = require('./expedientCatalog');
const { discoverVolumeCatalog } = require('./volumeCatalog');
const { discoverServerCatalog, resolveServerConfiguration } = require('./serverCatalog');
const { RemoteFormCatalogService } = require('./remoteFormCatalog');
const { discoverMechanismCatalog } = require('./mechanismCatalog');
const { discoverUserCatalog } = require('./userCatalog');
const { findLikelyNodeReferences, projectRootForProcessPath } = require('./nodeReferenceScanner');
const { parseEventTriggerData } = require('./eventTrigger');
const { buildTranslationPlan, LOCALES, validateTranslationPlan } = require('./translationService');
const { TranslationPreviewProvider } = require('./translationPreviewProvider');
const {
  assertDistinctProcessCode,
  processCodeFromFilePath,
  renamedArtifactName
} = require('./processIdentity');

class FluigProcessEditorProvider {
  static viewType = 'fluigBpmn.processEditor';

  /** @param {vscode.ExtensionContext} context */
  constructor(context) {
    this.context = context;
    this.backupService = new BackupService();
    this.remoteFormCatalog = new RemoteFormCatalogService();
    this.translationPreviewProvider = new TranslationPreviewProvider();
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(
      TranslationPreviewProvider.scheme,
      this.translationPreviewProvider
    ));
    /** @type {Map<string, vscode.TextDocument>} */
    this.documents = new Map();
    /** @type {Set<string>} */
    this.internalProcessRenames = new Set();
    /** @type {Map<string, {oldCode:string,newCode:string,relatedCount:number}>} */
    this.externalProcessRenameSummaries = new Map();
    /** @type {Map<string, {oldCode:string,newCode:string,relatedCount:number}>} */
    this.pendingProcessRenames = new Map();
    /** @type {Set<string>} */
    this.processSaveRefactors = new Set();
    /** @type {Promise<string>|undefined} */
    this.creationTemplateTextPromise = undefined;
    context.subscriptions.push(
      vscode.workspace.onWillRenameFiles((event) => {
        event.waitUntil(this.provideExternalProcessRenameEdits(event));
      }),
      vscode.workspace.onDidRenameFiles((event) => {
        this.handleCompletedProcessRenames(event);
      }),
      vscode.workspace.onDidSaveTextDocument((document) => {
        void this.refactorSavedProcessIdentity(document);
      })
    );
  }

  async loadCreationTemplateText() {
    if (!this.creationTemplateTextPromise) {
      this.creationTemplateTextPromise = (async () => {
        const relativeCandidates = [
          ['runtime', 'bpmn', 'creation-template.process.gz.b64'],
          ['test', 'bpmn', 'fixtures', 'toexportbpmnteste.process.gz.b64']
        ];
        for (const segments of relativeCandidates) {
          try {
            const uri = vscode.Uri.joinPath(this.context.extensionUri, ...segments);
            const encoded = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8').trim();
            if (encoded) return zlib.gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');
          } catch {
            // Tenta a proxima localizacao (runtime empacotado ou arvore de desenvolvimento).
          }
        }
        throw new Error('O catálogo visual interno para criação de elementos não foi encontrado.');
      })();
    }
    return this.creationTemplateTextPromise;
  }

  /**
   * @param {vscode.TextDocument} document
   * @param {vscode.WebviewPanel} panel
   */
  async resolveCustomTextEditor(document, panel) {
    this.documents.set(document.uri.toString(), document);
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media', 'bpmn')]
    };
    const webviewNonce = crypto.randomBytes(16).toString('hex');
    const extensionVersion = String(this.context.extension.packageJSON.version ?? 'dev');
    const versionedMediaUri = (fileName) => panel.webview
      .asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'bpmn', fileName))
      .with({ query: `v=${encodeURIComponent(extensionVersion)}-${webviewNonce}` });
    panel.webview.html = getWebviewHtml(
      panel.webview,
      versionedMediaUri('editor.js'),
      versionedMediaUri('editor.css'),
      webviewNonce,
      versionedMediaUri('dragGeometry.js'),
      versionedMediaUri('flowRouter.js')
    );

    const sendModel = async () => {
      try {
        const model = parseProcess(document.getText());
        const validation = validateProcess(model);
        const [formFields, localFormCatalog, mechanismCatalog, userCatalog, roleCatalog, groupCatalog, processCatalog, expedientCatalog, volumeCatalog, serverCatalog] = await Promise.all([
          this.discoverEffectiveFormFields(document, model),
          discoverLocalFormCatalog(vscode, document.uri),
          this.discoverEffectiveMechanismCatalog(document, model),
          this.discoverEffectiveUserCatalog(document, model),
          this.discoverEffectiveRoleCatalog(document, model),
          this.discoverEffectiveGroupCatalog(document, model),
          this.discoverEffectiveProcessCatalog(document, model),
          this.discoverEffectiveExpedientCatalog(document, model),
          this.discoverEffectiveVolumeCatalog(document, model),
          discoverServerCatalog(vscode, document.uri)
        ]);
        const subProcessFormFieldCatalogs = await this.discoverSubProcessFormFieldCatalogs(
          document,
          model,
          formFields
        );
        void panel.webview.postMessage({
          type: 'model',
          data: toWebviewData(model, validation, {
            formFields,
            localFormCatalog,
            mechanismCatalog,
            userCatalog,
            roleCatalog,
            groupCatalog,
            processCatalog,
            subProcessFormFieldCatalogs,
            expedientCatalog,
            volumeCatalog,
            serverCatalog,
            extensionVersion: this.context.extension.packageJSON.version
          })
        });
      } catch (error) {
        void panel.webview.postMessage({ type: 'toast', message: `Falha ao ler o processo: ${error.message}` });
      }
    };
    const changeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() === document.uri.toString()) void sendModel();
    });
    panel.webview.onDidReceiveMessage((message) => {
      if (message.type === 'ready') void sendModel();
      if (message.type === 'validate') this.showValidation(document);
      if (message.type === 'openText') void vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
      if (message.type === 'generateTranslations') void this.generateTranslations(document, panel);
      if (message.type === 'updateProperties') {
        void this.applyPropertyChanges(document, panel, message.elementId, message.changes);
      }
      if (message.type === 'updateProcessGeneral') {
        void this.applyProcessGeneralChanges(document, panel, message.elementId, message.configuration);
      }
      if (message.type === 'updateProcessVersion') {
        void this.applyProcessVersionChanges(document, panel, message.elementId, message.configuration);
      }
      if (message.type === 'updateProcessForm') {
        void this.applyProcessFormChanges(document, panel, message.elementId, message.configuration);
      }
      if (message.type === 'updateProcessAttachmentSecurity') {
        void this.applyProcessAttachmentSecurityChanges(document, panel, message.elementId, message.configuration);
      }
      if (message.type === 'requestServerForms') {
        void this.loadServerForms(document, panel, message.elementId);
      }
      if (message.type === 'requestServerFormFields') {
        void this.loadServerFormFields(document, panel, message.elementId, message.documentId);
      }
      if (message.type === 'requestServerBusinessPeriods') {
        void this.loadServerBusinessPeriods(document, panel, message.elementId, message.serverId);
      }
      if (message.type === 'requestServerMechanisms') {
        void this.loadServerDesignCatalogs(document, panel, message.elementId, message.serverId);
      }
      if (message.type === 'updateProcessManager') {
        void this.applyProcessManagerChanges(document, panel, message.elementId, message.assignment);
      }
      if (message.type === 'updateGatewayBranches') {
        void this.applyGatewayBranchChanges(document, panel, message.gatewayId, message.configuration);
      }
      if (message.type === 'updateTaskAssignment') {
        void this.applyTaskAssignmentChanges(document, panel, message.elementId, message.assignment);
      }
      if (message.type === 'updateEventTrigger') {
        void this.applyEventTriggerChanges(document, panel, message.elementId, message.trigger);
      }
      if (message.type === 'updateEventInitializer') {
        void this.applyEventInitializerChanges(document, panel, message.elementId, message.initializer);
      }
      if (message.type === 'updateTaskNotifications') {
        void this.applyTaskNotificationChanges(document, panel, message.elementId, message.configuration);
      }
      if (message.type === 'updateTaskJoint') {
        void this.applyTaskJointChanges(document, panel, message.elementId, message.configuration);
      }
      if (message.type === 'updateTaskDeadline') {
        void this.applyTaskDeadlineChanges(document, panel, message.elementId, message.configuration);
      }
      if (message.type === 'updateTaskMobile') {
        void this.applyTaskMobileChanges(document, panel, message.elementId, message.configuration);
      }
      if (message.type === 'updateTaskAttachmentRules') {
        void this.applyTaskAttachmentRuleChanges(document, panel, message.elementId, message.rules);
      }
      if (message.type === 'updateSubProcessFormMaps') {
        void this.applySubProcessFormMapChanges(document, panel, message.elementId, message.maps);
      }
      if (message.type === 'updateExtendedProperties') {
        void this.applyExtendedPropertyChanges(document, panel, message.elementId, message.properties);
      }
      if (message.type === 'openTaskScript') {
        void this.openTaskScript(document, panel, message.elementId);
      }
      if (message.type === 'updateLayout') {
        void this.applyLayoutChanges(document, panel, message.layout);
      }
      if (message.type === 'createConnection') {
        void this.applyConnectionCreation(document, panel, message.connection);
      }
      if (message.type === 'reconnectSequenceFlow') {
        void this.applySequenceFlowReconnection(document, panel, message.reconnection);
      }
      if (message.type === 'deleteSequenceFlow') {
        void this.applySequenceFlowDeletion(document, panel, message.flowId);
      }
      if (message.type === 'deleteIsolatedEvent') {
        void this.applyIsolatedEventDeletion(document, panel, message.elementId);
      }
      if (message.type === 'deleteAttachedErrorEvent') {
        void this.applyAttachedErrorEventDeletion(document, panel, message.elementId);
      }
      if (message.type === 'deleteIsolatedGateway') {
        void this.applyIsolatedGatewayDeletion(document, panel, message.elementId);
      }
      if (message.type === 'deleteIsolatedTask') {
        void this.applyIsolatedTaskDeletion(document, panel, message.elementId);
      }
      if (message.type === 'deleteIsolatedSubProcess') {
        void this.applyIsolatedSubProcessDeletion(document, panel, message.elementId);
      }
      if (message.type === 'deleteIsolatedArtifact') {
        void this.applyIsolatedArtifactDeletion(document, panel, message.elementId);
      }
      if (message.type === 'deleteDiagramContainer') {
        void this.applyDiagramContainerDeletion(document, panel, message.elementId);
      }
      if (message.type === 'deleteMultipleElements') {
        void this.applyMultipleElementDeletion(document, panel, message.elementIds);
      }
      if (message.type === 'convertTask') {
        void this.applyTaskConversion(document, panel, message.taskId, message.targetType);
      }
      if (message.type === 'createConnectedTask') {
        void this.applyConnectedTaskCreation(document, panel, message.task);
      }
      if (message.type === 'createConnectedGateway') {
        void this.applyConnectedGatewayCreation(document, panel, message.gateway);
      }
      if (message.type === 'createConnectedIntermediateEvent') {
        void this.applyConnectedIntermediateEventCreation(document, panel, message.intermediateEvent);
      }
      if (message.type === 'createConnectedEndEvent') {
        void this.applyConnectedEndEventCreation(document, panel, message.endEvent);
      }
      if (message.type === 'createPool') {
        void this.applyPoolCreation(document, panel, message.pool);
      }
      if (message.type === 'createSwimLane') {
        void this.applySwimLaneCreation(document, panel, message.lane);
      }
      if (message.type === 'createIsolatedNode') {
        void this.applyIsolatedNodeCreation(document, panel, message.node);
      }
      if (message.type === 'createAttachedErrorEvent') {
        void this.applyAttachedErrorEventCreation(document, panel, message.errorEvent);
      }
    });
    panel.onDidDispose(() => {
      changeSubscription.dispose();
      this.documents.delete(document.uri.toString());
    });
  }

  async validateActiveDocument() {
    const document = [...this.documents.values()][0];
    if (!document) {
      void vscode.window.showInformationMessage('Abra um arquivo .process no editor Fluig BPMN.');
      return;
    }
    this.showValidation(document);
  }

  async generateActiveTranslations() {
    const document = [...this.documents.values()][0];
    if (!document) {
      void vscode.window.showInformationMessage('Abra um arquivo .process no editor Fluig BPMN.');
      return;
    }
    await this.generateTranslations(document);
  }

  /**
   * Gera os três arquivos Java Properties sem alterar o documento .process.
   * @param {vscode.TextDocument} document
   * @param {vscode.WebviewPanel=} panel
   */
  async generateTranslations(document, panel) {
    try {
      const model = parseProcess(document.getText());
      if (!model.supported || !model.process) throw new Error('O arquivo ativo não é um processo Studio XMI suportado.');
      if (!/^[a-z0-9_.-]+$/i.test(model.process.id)) throw new Error('O código do processo não pode ser usado com segurança em um nome de arquivo.');

      const literalsDirectory = vscode.Uri.joinPath(document.uri, '..', '..', 'literals');
      const existingByLocale = {};
      const uris = new Map();
      for (const locale of LOCALES) {
        const uri = vscode.Uri.joinPath(literalsDirectory, `${model.process.id}_${locale}.properties`);
        uris.set(locale, uri);
        const openDocument = vscode.workspace.textDocuments.find((item) => item.uri.toString() === uri.toString());
        if (openDocument) {
          existingByLocale[locale] = openDocument.getText();
          continue;
        }
        try {
          existingByLocale[locale] = new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(uri));
        } catch (error) {
          if (error?.code !== 'FileNotFound') throw error;
        }
      }

      const plan = buildTranslationPlan(model, existingByLocale);
      const validation = validateTranslationPlan(plan);
      if (!validation.ok) throw new Error(validation.errors.join(' '));
      const changed = [...plan.files.values()].filter((file) => file.changed);
      if (!changed.length) {
        const message = 'Os arquivos de tradução já estão sincronizados.';
        void vscode.window.showInformationMessage(`Fluig BPMN: ${message}`);
        if (panel) void panel.webview.postMessage({ type: 'toast', message });
        return;
      }

      for (const existingChange of changed.filter((file) => file.existed)) {
        const previewUri = this.translationPreviewProvider.createUri(
          vscode,
          `${model.process.id}_${existingChange.locale}.properties`,
          existingChange.content
        );
        await vscode.commands.executeCommand(
          'vscode.diff',
          uris.get(existingChange.locale),
          previewUri,
          `Prévia: ${model.process.id}_${existingChange.locale}.properties`
        );
      }

      const created = changed.filter((file) => !file.existed).map((file) => file.locale);
      const updated = changed.filter((file) => file.existed).map((file) => file.locale);
      const details = [
        created.length ? `Criar: ${created.join(', ')}.` : '',
        updated.length ? `Atualizar: ${updated.join(', ')}.` : '',
        plan.orphanKeys.length ? `Chaves não reconhecidas preservadas: ${plan.orphanKeys.join(', ')}.` : '',
        'O arquivo .process não será modificado.'
      ].filter(Boolean).join('\n');
      const confirmed = await vscode.window.showWarningMessage(
        `Gerar traduções do processo ${model.process.id}?`,
        { modal: true, detail: details },
        'Gerar traduções'
      );
      if (confirmed !== 'Gerar traduções') return;

      await vscode.workspace.fs.createDirectory(literalsDirectory);
      for (const file of changed.filter((item) => item.existed)) {
        const translationDocument = await vscode.workspace.openTextDocument(uris.get(file.locale));
        await this.backupService.ensureBackup(vscode, translationDocument);
      }

      const edit = new vscode.WorkspaceEdit();
      for (const file of changed) {
        const uri = uris.get(file.locale);
        if (!file.existed) {
          edit.createFile(uri, { ignoreIfExists: false });
          edit.insert(uri, new vscode.Position(0, 0), file.content);
        } else {
          const translationDocument = await vscode.workspace.openTextDocument(uri);
          const fullRange = new vscode.Range(
            new vscode.Position(0, 0),
            translationDocument.positionAt(translationDocument.getText().length)
          );
          edit.replace(uri, fullRange, file.content);
        }
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a geração dos arquivos.');
      for (const file of changed) {
        const saved = await (await vscode.workspace.openTextDocument(uris.get(file.locale))).save();
        if (!saved) throw new Error(`Não foi possível salvar a tradução ${file.locale}.`);
      }

      const verifiedFiles = new Map();
      for (const locale of LOCALES) {
        const content = new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(uris.get(locale)));
        verifiedFiles.set(locale, { content });
      }
      const postWriteValidation = validateTranslationPlan({ keys: plan.keys, files: verifiedFiles });
      if (!postWriteValidation.ok) {
        throw new Error(`Validação após a gravação falhou: ${postWriteValidation.errors.join(' ')}`);
      }

      const message = `${changed.length} arquivo(s) de tradução sincronizado(s) em workflow/literals.`;
      void vscode.window.showInformationMessage(`Fluig BPMN: ${message}`);
      if (panel) void panel.webview.postMessage({ type: 'toast', message });
    } catch (error) {
      const message = `Falha ao gerar traduções: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      if (panel) void panel.webview.postMessage({ type: 'toast', message });
    }
  }

  /** @param {vscode.TextDocument} document */
  showValidation(document) {
    try {
      const report = validateProcess(parseProcess(document.getText()));
      if (report.ok) {
        void vscode.window.showInformationMessage(`Fluig BPMN: estrutura válida (${report.warnings.length} aviso(s)).`);
      } else {
        void vscode.window.showErrorMessage(`Fluig BPMN: ${report.errors.length} erro(s) estrutural(is).`);
      }
    } catch (error) {
      void vscode.window.showErrorMessage(`Fluig BPMN: ${error.message}`);
    }
  }

  /**
   * @param {vscode.TextDocument} document
   * @param {vscode.WebviewPanel} panel
   * @param {string} elementId
   * @param {Record<string, unknown>} changes
   */
  async applyPropertyChanges(document, panel, elementId, changes) {
    try {
      const result = patchProcess(document.getText(), elementId, changes);
      if (!result.changed) {
        void panel.webview.postMessage({ type: 'toast', message: 'Nenhuma alteração necessária.' });
        return;
      }

      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      const applied = await vscode.workspace.applyEdit(edit);
      if (!applied) throw new Error('O VS Code recusou a alteração no documento.');
      void panel.webview.postMessage({
        type: 'toast',
        message: 'Alteração aplicada.'
      });
    } catch (error) {
      const message = `Alteração recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
    }
  }

  /**
   * Mantem a identidade interna e os arquivos vinculados sincronizados quando
   * o usuario renomeia um .process pelo Explorer do VS Code.
   * @param {vscode.FileWillRenameEvent} event
   */
  async provideExternalProcessRenameEdits(event) {
    try {
      const edit = new vscode.WorkspaceEdit();
      let changed = false;
      const eventRenames = new Map(event.files.map((file) => [
        normalizeUriKey(file.oldUri),
        normalizeUriKey(file.newUri)
      ]));

      for (const file of event.files) {
        if (!isProcessFileRename(file.oldUri, file.newUri)) continue;
        const renameKey = processRenameKey(file.oldUri, file.newUri);
        if (this.internalProcessRenames.has(renameKey)) continue;

        const document = vscode.workspace.textDocuments.find((item) => item.uri.toString() === file.oldUri.toString())
          ?? await vscode.workspace.openTextDocument(file.oldUri);
        const model = parseProcess(document.getText());
        if (!model.supported || !model.process) {
          throw new Error(`${path.basename(file.oldUri.fsPath)} nao e um processo Studio XMI suportado.`);
        }
        const requestedCode = processCodeFromFilePath(file.newUri.fsPath);
        assertDistinctProcessCode(model.process.id, requestedCode);
        const identity = patchProcessIdentity(document.getText(), model.process.id, requestedCode);
        const related = await this.discoverRelatedArtifactRenames(file.oldUri, model.process.id, requestedCode);
        const automatic = [];
        for (const rename of related) {
          const explicitlyRenamedTo = eventRenames.get(normalizeUriKey(rename.oldUri));
          if (explicitlyRenamedTo) {
            if (explicitlyRenamedTo !== normalizeUriKey(rename.newUri)) {
              throw new Error(`O arquivo ${path.basename(rename.oldUri.fsPath)} esta sendo renomeado para um nome incompatível com o novo codigo.`);
            }
            continue;
          }
          automatic.push(rename);
        }
        await this.assertRenameTargetsAvailable(automatic);
        await this.backupService.ensureBackup(vscode, document);
        for (const patch of identity.patches) {
          edit.replace(
            file.oldUri,
            new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
            patch.value
          );
        }
        for (const rename of automatic) {
          edit.renameFile(rename.oldUri, rename.newUri, { overwrite: false, ignoreIfExists: false });
        }
        this.externalProcessRenameSummaries ??= new Map();
        this.externalProcessRenameSummaries.set(renameKey, {
          oldCode: model.process.id,
          newCode: requestedCode,
          relatedCount: related.length
        });
        changed = changed || identity.changed || automatic.length > 0;
      }
      return changed ? edit : undefined;
    } catch (error) {
      void vscode.window.showErrorMessage(`Fluig BPMN: renomeacao do processo recusada: ${error.message}`);
      throw error;
    }
  }

  /** @param {vscode.FileRenameEvent} event */
  handleCompletedProcessRenames(event) {
    for (const file of event.files) {
      if (!isProcessFileRename(file.oldUri, file.newUri)) continue;
      const oldKey = file.oldUri.toString();
      this.documents.delete(oldKey);
      this.pendingProcessRenames.delete(oldKey);
      this.processSaveRefactors.delete(oldKey);
      const renamedDocument = vscode.workspace.textDocuments.find((item) => item.uri.toString() === file.newUri.toString());
      if (renamedDocument) this.documents.set(file.newUri.toString(), renamedDocument);
      this.backupService.forget(file.oldUri);
      const summary = this.externalProcessRenameSummaries?.get(processRenameKey(file.oldUri, file.newUri));
      if (summary) {
        this.externalProcessRenameSummaries.delete(processRenameKey(file.oldUri, file.newUri));
        void vscode.window.showInformationMessage(
          `Fluig BPMN: processo ${summary.oldCode} renomeado para ${summary.newCode}; ${summary.relatedCount} arquivo(s) vinculado(s) sincronizado(s).`
        );
      }
    }
  }

  async discoverRelatedArtifactRenames(processUri, currentCode, requestedCode) {
    if (!projectRootForProcessPath(processUri.fsPath)) {
      throw new Error('O processo deve permanecer em workflow/diagrams para renomear scripts e literais com seguranca.');
    }
    const workflowUri = vscode.Uri.joinPath(processUri, '..', '..');
    const definitions = [
      { kind: 'scripts', directory: vscode.Uri.joinPath(workflowUri, 'scripts') },
      { kind: 'literals', directory: vscode.Uri.joinPath(workflowUri, 'literals') },
      { kind: 'resources', directory: vscode.Uri.joinPath(workflowUri, '.resources') }
    ];
    const renames = [];
    for (const definition of definitions) {
      let entries;
      try {
        entries = await vscode.workspace.fs.readDirectory(definition.directory);
      } catch (error) {
        if (isFileNotFound(error)) continue;
        throw error;
      }
      for (const [fileName, type] of entries) {
        if ((type & vscode.FileType.File) === 0) continue;
        const targetName = renamedArtifactName(definition.kind, fileName, currentCode, requestedCode);
        if (!targetName) continue;
        renames.push({
          kind: definition.kind,
          oldUri: vscode.Uri.joinPath(definition.directory, fileName),
          newUri: vscode.Uri.joinPath(definition.directory, targetName)
        });
      }
    }
    return renames;
  }

  async assertRenameTargetsAvailable(renames) {
    const destinations = new Set();
    for (const rename of renames) {
      const destination = normalizeUriKey(rename.newUri);
      if (destinations.has(destination)) {
        throw new Error(`Mais de um arquivo produziria o mesmo destino: ${path.basename(rename.newUri.fsPath)}.`);
      }
      destinations.add(destination);
      if (normalizeUriKey(rename.oldUri) === destination) continue;
      try {
        await vscode.workspace.fs.stat(rename.newUri);
        throw new Error(`O arquivo de destino ja existe: ${rename.newUri.fsPath}`);
      } catch (error) {
        if (!isFileNotFound(error)) throw error;
      }
    }
  }

  /** @param {vscode.TextDocument} document @param {vscode.WebviewPanel} panel */
  async applyProcessGeneralChanges(document, panel, elementId, configuration) {
    try {
      const model = parseProcess(document.getText());
      const [volumeCatalog, expedientCatalog, serverCatalog] = await Promise.all([
        this.discoverEffectiveVolumeCatalog(document, model, configuration?.serverId),
        this.discoverEffectiveExpedientCatalog(document, model, configuration?.serverId),
        discoverServerCatalog(vscode, document.uri)
      ]);
      const result = patchProcessGeneral(document.getText(), elementId, configuration, {
        volumeCatalog,
        expedientCatalog,
        serverCatalog
      });
      if (!result.changed) {
        void panel.webview.postMessage({ type: 'processGeneralComplete', elementId });
        void panel.webview.postMessage({ type: 'toast', message: 'As propriedades gerais já estão atualizadas.' });
        return;
      }
      if (result.model.process.id !== elementId) {
        await this.applyControlledProcessRename(document, panel, elementId, result);
        return;
      }
      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a edição geral do processo.');
      void panel.webview.postMessage({ type: 'toast', message: `Propriedades gerais de ${elementId} gravadas e validadas.` });
    } catch (error) {
      const message = `Edição geral do processo recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'processGeneralComplete', elementId });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  async applyControlledProcessRename(document, panel, currentCode, result) {
    const requestedCode = assertDistinctProcessCode(currentCode, result.model.process.id);
    if (!projectRootForProcessPath(document.uri.fsPath)) {
      throw new Error('O processo deve estar em workflow/diagrams para uma renomeacao controlada.');
    }
    const fileCode = processCodeFromFilePath(document.uri.fsPath);
    assertDistinctProcessCode(fileCode, requestedCode);
    const processTarget = vscode.Uri.joinPath(document.uri, '..', `${requestedCode}.process`);
    const processFileChanges = fileCode === requestedCode
      ? []
      : [{ kind: 'process', oldUri: document.uri, newUri: processTarget }];
    const related = await this.discoverRelatedArtifactRenames(document.uri, fileCode, requestedCode);
    await this.assertRenameTargetsAvailable([...processFileChanges, ...related]);

    const preview = [...processFileChanges, ...related]
      .slice(0, 12)
      .map((rename) => `${path.basename(rename.oldUri.fsPath)} -> ${path.basename(rename.newUri.fsPath)}`);
    if (processFileChanges.length + related.length > preview.length) {
      preview.push(`... e mais ${(processFileChanges.length + related.length) - preview.length} arquivo(s).`);
    }
    if (processFileChanges.length) {
      const confirmed = await vscode.window.showWarningMessage(
        `Alterar o codigo do processo ${fileCode} para ${requestedCode}?`,
        {
          modal: true,
          detail: [
            'A alteracao sera aplicada ao documento agora. Ao salvar, o arquivo .process, scripts, literais e artefatos gerados vinculados serao renomeados.',
            ...preview
          ].join('\n')
        },
        'Aplicar alteracao'
      );
      if (confirmed !== 'Aplicar alteracao') {
        void panel.webview.postMessage({ type: 'processGeneralComplete', elementId: currentCode });
        void panel.webview.postMessage({ type: 'reloadModel' });
        return;
      }
    }

    await this.backupService.ensureBackup(vscode, document);
    const edit = new vscode.WorkspaceEdit();
    for (const patch of result.patches) {
      edit.replace(
        document.uri,
        new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
        patch.value
      );
    }
    if (!await vscode.workspace.applyEdit(edit)) {
      throw new Error('O VS Code recusou a alteracao do codigo no documento.');
    }
    const documentKey = document.uri.toString();
    if (processFileChanges.length) {
      this.pendingProcessRenames.set(documentKey, {
        oldCode: fileCode,
        newCode: requestedCode,
        relatedCount: related.length
      });
    } else {
      this.pendingProcessRenames.delete(documentKey);
    }
    void panel.webview.postMessage({ type: 'processGeneralComplete', elementId: requestedCode });
    void panel.webview.postMessage({
      type: 'toast',
      message: processFileChanges.length
        ? `Codigo alterado para ${requestedCode}. Salve o .process para concluir a refatoracao de ${related.length} arquivo(s) vinculado(s).`
        : `Codigo interno restaurado para ${requestedCode}.`
    });
  }

  /**
   * Conclui a refatoracao fisica somente depois que o usuario salva o .process.
   * @param {vscode.TextDocument} document
   */
  async refactorSavedProcessIdentity(document) {
    if (path.extname(document.uri.fsPath).toLowerCase() !== '.process') {
      return;
    }
    const documentKey = document.uri.toString();
    if (this.processSaveRefactors.has(documentKey)) {
      return;
    }

    let model;
    try {
      model = parseProcess(document.getText());
    } catch {
      return;
    }
    if (!model.supported || !model.process) {
      return;
    }

    let fileCode;
    try {
      fileCode = processCodeFromFilePath(document.uri.fsPath);
    } catch {
      return;
    }
    const requestedCode = model.process.id;
    if (fileCode === requestedCode) {
      this.pendingProcessRenames.delete(documentKey);
      return;
    }

    this.processSaveRefactors.add(documentKey);
    let renameKey = '';
    try {
      assertDistinctProcessCode(fileCode, requestedCode);
      if (!projectRootForProcessPath(document.uri.fsPath)) {
        throw new Error('O processo deve estar em workflow/diagrams para concluir a refatoracao.');
      }
      const processTarget = vscode.Uri.joinPath(document.uri, '..', `${requestedCode}.process`);
      const related = await this.discoverRelatedArtifactRenames(document.uri, fileCode, requestedCode);
      const processFileChange = { kind: 'process', oldUri: document.uri, newUri: processTarget };
      await this.assertRenameTargetsAvailable([processFileChange, ...related]);

      const approved = this.pendingProcessRenames.get(documentKey);
      if (!approved || approved.oldCode !== fileCode || approved.newCode !== requestedCode) {
        const confirmed = await vscode.window.showWarningMessage(
          `O codigo interno foi alterado para ${requestedCode}. Refatorar os arquivos vinculados agora?`,
          { modal: true, detail: `O arquivo ${path.basename(document.uri.fsPath)} sera renomeado junto com ${related.length} arquivo(s) vinculado(s).` },
          'Refatorar arquivos'
        );
        if (confirmed !== 'Refatorar arquivos') {
          void vscode.window.showWarningMessage(
            `Fluig BPMN: o codigo interno ${requestedCode} ficou diferente do arquivo ${path.basename(document.uri.fsPath)}.`
          );
          return;
        }
      }

      const edit = new vscode.WorkspaceEdit();
      for (const rename of related) {
        edit.renameFile(rename.oldUri, rename.newUri, { overwrite: false, ignoreIfExists: false });
      }
      renameKey = processRenameKey(document.uri, processTarget);
      this.internalProcessRenames.add(renameKey);
      this.externalProcessRenameSummaries.set(renameKey, {
        oldCode: fileCode,
        newCode: requestedCode,
        relatedCount: related.length
      });
      edit.renameFile(document.uri, processTarget, { overwrite: false, ignoreIfExists: false });
      if (!await vscode.workspace.applyEdit(edit)) {
        throw new Error('O VS Code recusou a refatoracao dos arquivos vinculados. Nenhum arquivo foi sobrescrito.');
      }
      this.pendingProcessRenames.delete(documentKey);
    } catch (error) {
      if (renameKey) {
        this.externalProcessRenameSummaries.delete(renameKey);
      }
      void vscode.window.showErrorMessage(`Fluig BPMN: refatoracao ao salvar recusada: ${error.message}`);
    } finally {
      this.processSaveRefactors.delete(documentKey);
      if (renameKey) {
        setTimeout(() => this.internalProcessRenames.delete(renameKey), 0);
      }
    }
  }

  /** @param {vscode.TextDocument} document @param {vscode.WebviewPanel} panel */
  async applyProcessVersionChanges(document, panel, elementId, configuration) {
    try {
      const result = patchProcessVersion(document.getText(), elementId, configuration);
      if (!result.changed) {
        void panel.webview.postMessage({ type: 'processVersionComplete', elementId });
        void panel.webview.postMessage({ type: 'toast', message: 'As propriedades da versão já estão atualizadas.' });
        return;
      }
      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a edição da versão do processo.');
      void panel.webview.postMessage({ type: 'toast', message: `Versão de ${elementId} gravada e validada.` });
    } catch (error) {
      const message = `Edição da versão do processo recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'processVersionComplete', elementId });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /** @param {vscode.TextDocument} document @param {vscode.WebviewPanel} panel */
  async applyProcessFormChanges(document, panel, elementId, configuration) {
    try {
      const localForms = await discoverLocalFormCatalog(vscode, document.uri);
      const result = patchProcessForm(document.getText(), elementId, configuration, { localForms });
      if (!result.changed) {
        void panel.webview.postMessage({ type: 'processFormComplete', elementId });
        void panel.webview.postMessage({ type: 'toast', message: 'O formulário do processo já está atualizado.' });
        return;
      }
      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a edição do formulário do processo.');
      void panel.webview.postMessage({ type: 'toast', message: `Formulário de ${elementId} gravado e validado.` });
    } catch (error) {
      const message = `Edição do formulário recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'processFormComplete', elementId });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /** @param {vscode.TextDocument} document @param {vscode.WebviewPanel} panel */
  async applyProcessAttachmentSecurityChanges(document, panel, elementId, configuration) {
    try {
      const result = patchProcessAttachmentSecurity(document.getText(), elementId, configuration);
      if (!result.changed) {
        void panel.webview.postMessage({ type: 'processAttachmentSecurityComplete', elementId });
        void panel.webview.postMessage({ type: 'toast', message: 'A segurança de anexos já está atualizada.' });
        return;
      }
      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a edição da segurança de anexos.');
      void panel.webview.postMessage({ type: 'toast', message: `Segurança de anexos de ${elementId} gravada e validada.` });
    } catch (error) {
      const message = `Edição da segurança de anexos recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'processAttachmentSecurityComplete', elementId });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /** @param {vscode.TextDocument} document @param {vscode.WebviewPanel} panel */
  async loadServerForms(document, panel, elementId) {
    void panel.webview.postMessage({ type: 'serverFormCatalogLoading', elementId });
    try {
      const model = parseProcess(document.getText());
      const process = model.process;
      if (!process || process.id !== elementId) throw new Error('Selecione o processo para consultar os formulários.');
      const serverId = String(process.attributes?.serverId ?? '').trim();
      if (!serverId) throw new Error('Selecione e aplique um servidor nas propriedades gerais do processo.');
      const server = await resolveServerConfiguration(vscode, document.uri, serverId);
      if (!server) throw new Error(`O servidor "${serverId}" não foi encontrado na configuração do Fluiggers.`);
      const forms = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Fluig BPMN: buscando formulários em ${String(server.name ?? serverId)}`,
          cancellable: false
        },
        () => this.remoteFormCatalog.list(server, vscode.env.machineId)
      );
      void panel.webview.postMessage({ type: 'serverFormCatalogComplete', elementId, serverId, forms });
      const message = `${forms.length} formulário(s) encontrado(s) no servidor.`;
      void panel.webview.postMessage({ type: 'toast', message });
    } catch (error) {
      const message = `Busca de formulários recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'serverFormCatalogComplete', elementId, forms: null });
    }
  }

  /** @param {vscode.TextDocument} document @param {vscode.WebviewPanel} panel */
  async loadServerFormFields(document, panel, elementId, documentId) {
    const normalizedDocumentId = String(documentId ?? '').trim();
    void panel.webview.postMessage({
      type: 'serverFormFieldsLoading',
      elementId,
      documentId: normalizedDocumentId
    });
    try {
      const model = parseProcess(document.getText());
      const process = model.process;
      if (!process || process.id !== elementId) throw new Error('Selecione o processo para consultar os campos do formulário.');
      if (!/^\d+$/.test(normalizedDocumentId) || Number(normalizedDocumentId) <= 0) {
        throw new Error('Informe ou selecione um código numérico de formulário.');
      }
      const serverId = String(process.attributes?.serverId ?? '').trim();
      if (!serverId) throw new Error('Selecione e aplique um servidor nas propriedades gerais do processo.');
      const server = await resolveServerConfiguration(vscode, document.uri, serverId);
      if (!server) throw new Error(`O servidor "${serverId}" não foi encontrado na configuração do Fluiggers.`);
      const fields = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Fluig BPMN: buscando campos do formulário ${normalizedDocumentId}`,
          cancellable: false
        },
        () => this.remoteFormCatalog.fields(server, vscode.env.machineId, normalizedDocumentId)
      );
      void panel.webview.postMessage({
        type: 'serverFormFieldsComplete',
        elementId,
        serverId,
        documentId: normalizedDocumentId,
        fields
      });
      void panel.webview.postMessage({
        type: 'toast',
        message: `${fields.length} campo(s) encontrado(s) no formulário ${normalizedDocumentId}.`
      });
    } catch (error) {
      const message = `Busca de campos recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({
        type: 'serverFormFieldsComplete',
        elementId,
        documentId: normalizedDocumentId,
        fields: null
      });
    }
  }

  /** @param {vscode.TextDocument} document @param {vscode.WebviewPanel} panel */
  async loadServerBusinessPeriods(document, panel, elementId, requestedServerId = '') {
    void panel.webview.postMessage({ type: 'serverBusinessPeriodsLoading', elementId });
    try {
      const model = parseProcess(document.getText());
      const process = model.process;
      if (!process || process.id !== elementId) throw new Error('Selecione o processo para consultar os expedientes.');
      const serverId = String(requestedServerId || process.attributes?.serverId || '').trim();
      if (!serverId) throw new Error('Selecione e aplique um servidor nas propriedades gerais do processo.');
      const server = await resolveServerConfiguration(vscode, document.uri, serverId);
      if (!server) throw new Error(`O servidor "${serverId}" não foi encontrado na configuração do Fluiggers.`);
      const periods = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Fluig BPMN: buscando expedientes em ${String(server.name ?? serverId)}`,
          cancellable: false
        },
        () => this.remoteFormCatalog.businessPeriods(server, vscode.env.machineId, { forceRefresh: true })
      );
      void panel.webview.postMessage({
        type: 'serverBusinessPeriodsComplete',
        elementId,
        serverId,
        periods
      });
      void panel.webview.postMessage({
        type: 'toast',
        message: `${periods.length} expediente(s) encontrado(s) no servidor.`
      });
    } catch (error) {
      const message = `Busca de expedientes recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'serverBusinessPeriodsComplete', elementId, periods: null });
    }
  }

  /** @param {vscode.TextDocument} document @param {vscode.WebviewPanel} panel */
  async loadServerDesignCatalogs(document, panel, elementId, requestedServerId = '') {
    void panel.webview.postMessage({ type: 'serverDesignCatalogsLoading', elementId });
    try {
      const model = parseProcess(document.getText());
      const process = model.process;
      if (!process || process.id !== elementId) throw new Error('Selecione o processo para consultar os mecanismos.');
      const serverId = String(requestedServerId || process.attributes?.serverId || '').trim();
      if (!serverId) throw new Error('Selecione um servidor nas propriedades gerais do processo.');
      const server = await resolveServerConfiguration(vscode, document.uri, serverId);
      if (!server) throw new Error(`O servidor "${serverId}" não foi encontrado na configuração do Fluiggers.`);
      const catalogs = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Fluig BPMN: buscando mecanismos em ${String(server.name ?? serverId)}`,
          cancellable: false
        },
        () => this.remoteFormCatalog.designCatalogs(server, vscode.env.machineId, { forceRefresh: true })
      );
      void panel.webview.postMessage({
        type: 'serverDesignCatalogsComplete',
        elementId,
        serverId,
        mechanisms: catalogs.mechanisms,
        volumes: catalogs.volumes
      });
      void panel.webview.postMessage({
        type: 'toast',
        message: `${catalogs.mechanisms.length} mecanismo(s) customizado(s) e ${catalogs.volumes.length} volume(s) encontrados no servidor.`
      });
    } catch (error) {
      const message = `Busca de mecanismos recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({
        type: 'serverDesignCatalogsComplete',
        elementId,
        mechanisms: null,
        volumes: null
      });
    }
  }

  async discoverEffectiveFormFields(document, model) {
    const localFields = await discoverFormFields(vscode, document.uri, model);
    const process = model.process;
    if (!process || String(process.attributes?.formSource ?? 'local').toLowerCase() !== 'server') return localFields;
    const serverId = String(process.attributes?.serverId ?? '').trim();
    const documentId = String(process.attributes?.cardIndex ?? '').trim();
    if (!serverId || !documentId) return [];
    const server = await resolveServerConfiguration(vscode, document.uri, serverId);
    return server ? this.remoteFormCatalog.cachedFields(server, documentId) : [];
  }

  async discoverEffectiveExpedientCatalog(document, model, requestedServerId = '') {
    const localCatalog = await discoverExpedientCatalog(vscode, document.uri);
    const process = model.process;
    const serverId = String(requestedServerId || process?.attributes?.serverId || '').trim();
    if (!serverId) return localCatalog;
    const server = await resolveServerConfiguration(vscode, document.uri, serverId);
    if (!server) return localCatalog;
    const remoteCatalog = this.remoteFormCatalog.cachedBusinessPeriods(server);
    return remoteCatalog.length ? remoteCatalog : localCatalog;
  }

  async discoverEffectiveMechanismCatalog(document, model, requestedServerId = '') {
    const localCatalog = await discoverMechanismCatalog(vscode, document.uri);
    const process = model.process;
    const serverId = String(requestedServerId || process?.attributes?.serverId || '').trim();
    if (!serverId) return localCatalog;
    const server = await resolveServerConfiguration(vscode, document.uri, serverId);
    if (!server) return localCatalog;
    const remoteCatalog = this.remoteFormCatalog.cachedAttributionMechanisms(server);
    return remoteCatalog.length ? remoteCatalog : localCatalog;
  }

  async discoverEffectiveVolumeCatalog(document, model, requestedServerId = '') {
    const localCatalog = await discoverVolumeCatalog(vscode, document.uri);
    const process = model.process;
    const serverId = String(requestedServerId || process?.attributes?.serverId || '').trim();
    if (!serverId) return localCatalog;
    const server = await resolveServerConfiguration(vscode, document.uri, serverId);
    if (!server) return localCatalog;
    const remoteCatalog = this.remoteFormCatalog.cachedVolumes(server);
    return remoteCatalog.length ? remoteCatalog : localCatalog;
  }

  async discoverEffectiveUserCatalog(document, model, requestedServerId = '') {
    const localCatalog = await discoverUserCatalog(vscode, document.uri);
    const process = model.process;
    const serverId = String(requestedServerId || process?.attributes?.serverId || '').trim();
    if (!serverId) return localCatalog;
    const server = await resolveServerConfiguration(vscode, document.uri, serverId);
    if (!server) return localCatalog;
    const cached = this.remoteFormCatalog.cachedUsers(server);
    if (cached.length) return cached;
    try {
      const remoteCatalog = await this.remoteFormCatalog.users(server, vscode.env.machineId);
      return remoteCatalog.length ? remoteCatalog : localCatalog;
    } catch {
      return localCatalog;
    }
  }

  async discoverEffectiveRoleCatalog(document, model, requestedServerId = '') {
    const process = model.process;
    const serverId = String(requestedServerId || process?.attributes?.serverId || '').trim();
    if (!serverId) return [];
    const server = await resolveServerConfiguration(vscode, document.uri, serverId);
    if (!server) return [];
    const cached = this.remoteFormCatalog.cachedWorkflowRoles(server);
    if (cached.length) return cached;
    try {
      return await this.remoteFormCatalog.workflowRoles(server, vscode.env.machineId);
    } catch {
      return [];
    }
  }

  async discoverEffectiveGroupCatalog(document, model, requestedServerId = '') {
    const process = model.process;
    const serverId = String(requestedServerId || process?.attributes?.serverId || '').trim();
    if (!serverId) return [];
    const server = await resolveServerConfiguration(vscode, document.uri, serverId);
    if (!server) return [];
    const cached = this.remoteFormCatalog.cachedGroups(server);
    if (cached.length) return cached;
    try {
      return await this.remoteFormCatalog.groups(server, vscode.env.machineId);
    } catch {
      return [];
    }
  }

  async discoverEffectiveProcessCatalog(document, model, requestedServerId = '') {
    const process = model.process;
    const serverId = String(requestedServerId || process?.attributes?.serverId || '').trim();
    if (!serverId) return [];
    const server = await resolveServerConfiguration(vscode, document.uri, serverId);
    if (!server) return [];
    const cached = this.remoteFormCatalog.cachedWorkflowProcesses(server);
    if (cached.length) return cached;
    try {
      return await this.remoteFormCatalog.workflowProcesses(server, vscode.env.machineId);
    } catch {
      return [];
    }
  }

  async discoverSubProcessFormFieldCatalogs(document, model, parentFields = []) {
    const catalogs = {};
    const subProcesses = model.elements.filter((element) => (
      element.tag === 'BpmnSubProcess' && String(element.type) === '100'
    ));
    if (!subProcesses.length) return catalogs;
    const process = model.process;
    const serverId = String(process?.attributes?.serverId ?? '').trim();
    const processFormId = String(process?.attributes?.formSource ?? '').toLowerCase() === 'server'
      ? String(process?.attributes?.cardIndex ?? '').trim()
      : '0';
    if (!serverId) {
      for (const child of subProcesses) {
        catalogs[child.id] = {
          supported: false,
          reason: 'Selecione e aplique um servidor nas propriedades gerais do processo.',
          parentFields,
          childFields: []
        };
      }
      return catalogs;
    }
    const server = await resolveServerConfiguration(vscode, document.uri, serverId);
    if (!server) {
      for (const child of subProcesses) {
        catalogs[child.id] = {
          supported: false,
          reason: `O servidor "${serverId}" nao foi encontrado na configuracao do Fluiggers.`,
          parentFields,
          childFields: []
        };
      }
      return catalogs;
    }
    await Promise.all(subProcesses.map(async (child) => {
      const childProcessId = String(child.attributes?.process ?? '').trim();
      if (!childProcessId) {
        catalogs[child.id] = { supported: true, reason: '', parentFields, childFields: [] };
        return;
      }
      try {
        const remote = this.remoteFormCatalog.cachedSubProcessFormFields(server, processFormId, childProcessId)
          ?? await this.remoteFormCatalog.subProcessFormFields(
            server,
            vscode.env.machineId,
            processFormId,
            childProcessId
          );
        catalogs[child.id] = {
          supported: true,
          reason: '',
          parentFields: processFormId === '0' ? parentFields : remote.processFormFields,
          childFields: remote.subProcessFormFields,
          processFormId: remote.processFormId,
          subProcessFormId: remote.subProcessFormId
        };
      } catch (error) {
        catalogs[child.id] = {
          supported: false,
          reason: `Nao foi possivel consultar os campos do subprocesso: ${error.message}`,
          parentFields,
          childFields: []
        };
      }
    }));
    return catalogs;
  }

  async applyProcessManagerChanges(document, panel, elementId, assignment) {
    try {
      const result = patchProcessManager(document.getText(), elementId, assignment);
      if (!result.changed) {
        void panel.webview.postMessage({ type: 'processManagerComplete', elementId });
        void panel.webview.postMessage({ type: 'toast', message: 'O gestor do processo ja esta atualizado.' });
        return;
      }
      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(document.uri, new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)), patch.value);
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a edicao do gestor.');
      void panel.webview.postMessage({ type: 'toast', message: `Gestor de ${elementId} gravado e validado.` });
    } catch (error) {
      const message = `Edicao do gestor recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'processManagerComplete', elementId });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /**
   * @param {vscode.TextDocument} document
   * @param {vscode.WebviewPanel} panel
   * @param {{moves?: Array<{id: string, x: number, y: number}>, resizes?: Array<{id: string, width: number, height: number}>, connections?: Array<{id: string, bendpoints: Array<{x: number, y: number}>}>, canvas?: {width: number, height: number}}} layout
   */
  async applyLayoutChanges(document, panel, layout) {
    try {
      const result = patchLayout(document.getText(), layout);
      if (!result.changed) {
        void panel.webview.postMessage({ type: 'toast', message: 'O layout já estava atualizado.' });
        void panel.webview.postMessage({ type: 'layoutComplete' });
        return;
      }

      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      const applied = await vscode.workspace.applyEdit(edit);
      if (!applied) throw new Error('O VS Code recusou a alteração de layout.');
      void panel.webview.postMessage({
        type: 'toast',
        message: 'Layout gravado no processo.'
      });
    } catch (error) {
      const message = `Alteração de layout recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /**
   * @param {vscode.TextDocument} document
   * @param {vscode.WebviewPanel} panel
   * @param {{sourceId?: string, targetId?: string, bendpoints?: Array<{x: number, y: number}>}} connection
   */
  async applyConnectionCreation(document, panel, connection) {
    try {
      const templateText = await this.loadCreationTemplateText();
      const result = createSequenceFlow(document.getText(), { ...connection, templateText });
      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a criação do fluxo.');
      void panel.webview.postMessage({
        type: 'toast',
        message: result.documentaryAssociation
          ? `Associação visual ${result.flowId} criada e validada.`
          : `Fluxo ${result.flowId} criado e validado.`
      });
    } catch (error) {
      const message = `Criação do fluxo recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /**
   * Atualiza expressões e ramo padrão de um gateway como uma única operação.
   * @param {vscode.TextDocument} document
   * @param {vscode.WebviewPanel} panel
   * @param {string} gatewayId
   * @param {{conditions:Array<object>, defaultFlowId:string}} configuration
   */
  async applyGatewayBranchChanges(document, panel, gatewayId, configuration) {
    try {
      const result = patchGatewayBranches(document.getText(), gatewayId, configuration);
      if (!result.changed) {
        void panel.webview.postMessage({ type: 'gatewayBranchesComplete', gatewayId });
        void panel.webview.postMessage({ type: 'toast', message: 'As condições do gateway já estão atualizadas.' });
        return;
      }
      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a edição das condições.');
      void panel.webview.postMessage({
        type: 'toast',
        message: `Condições de ${result.gatewayId} gravadas e validadas.`
      });
    } catch (error) {
      const message = `Edição das condições recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'gatewayBranchesComplete', gatewayId });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /**
   * Atualiza o mecanismo de atribuição de uma atividade preservando o formato
   * XStream usado pelo Fluig Studio.
   * @param {vscode.TextDocument} document
   * @param {vscode.WebviewPanel} panel
   * @param {string} elementId
   * @param {{mechanism?: string, mechanismConfiguration?: object|null}} assignment
   */
  async applyTaskAssignmentChanges(document, panel, elementId, assignment) {
    try {
      const result = patchTaskAssignment(document.getText(), elementId, assignment);
      if (!result.changed) {
        void panel.webview.postMessage({ type: 'taskAssignmentComplete', elementId });
        void panel.webview.postMessage({ type: 'toast', message: 'O mecanismo de atribuição já está atualizado.' });
        return;
      }
      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a edição do mecanismo de atribuição.');
      void panel.webview.postMessage({
        type: 'toast',
        message: `Mecanismo de atribuição de ${elementId} gravado e validado.`
      });
    } catch (error) {
      const message = `Edição do mecanismo recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'taskAssignmentComplete', elementId });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /**
   * Atualiza a recorrência Quartz de eventos temporizadores e condicionais,
   * mantendo scripts e campos XStream que não fazem parte da agenda.
   * @param {vscode.TextDocument} document
   * @param {vscode.WebviewPanel} panel
   * @param {string} elementId
   * @param {object} trigger
   */
  async applyEventTriggerChanges(document, panel, elementId, trigger) {
    try {
      const result = patchEventTrigger(document.getText(), elementId, trigger);
      if (!result.changed) {
        void panel.webview.postMessage({ type: 'eventTriggerComplete', elementId });
        void panel.webview.postMessage({ type: 'toast', message: 'A agenda Quartz já está atualizada.' });
        return;
      }
      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a edição do temporizador.');
      void panel.webview.postMessage({
        type: 'toast',
        message: `Agenda Quartz de ${elementId} gravada e validada.`
      });
    } catch (error) {
      const message = `Edição do temporizador recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'eventTriggerComplete', elementId });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /** @param {vscode.TextDocument} document @param {vscode.WebviewPanel} panel */
  async applyEventInitializerChanges(document, panel, elementId, initializer) {
    try {
      const result = patchEventInitializer(document.getText(), elementId, initializer);
      if (!result.changed) {
        void panel.webview.postMessage({ type: 'eventInitializerComplete', elementId });
        void panel.webview.postMessage({ type: 'toast', message: 'O inicializador já está atualizado.' });
        return;
      }
      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a edição do inicializador.');
      void panel.webview.postMessage({ type: 'toast', message: `Inicializador de ${elementId} gravado e validado.` });
    } catch (error) {
      const message = `Edição do inicializador recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'eventInitializerComplete', elementId });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /** @param {vscode.TextDocument} document @param {vscode.WebviewPanel} panel */
  async applyTaskNotificationChanges(document, panel, elementId, configuration) {
    try {
      const result = patchTaskNotifications(document.getText(), elementId, configuration);
      if (!result.changed) {
        void panel.webview.postMessage({ type: 'taskNotificationsComplete', elementId });
        void panel.webview.postMessage({ type: 'toast', message: 'Acompanhamento e atraso já estão atualizados.' });
        return;
      }
      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a edição das notificações.');
      void panel.webview.postMessage({ type: 'toast', message: `Acompanhamento e atraso de ${elementId} gravados e validados.` });
    } catch (error) {
      const message = `Edição de acompanhamento e atraso recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'taskNotificationsComplete', elementId });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /** @param {vscode.TextDocument} document @param {vscode.WebviewPanel} panel */
  async applyTaskJointChanges(document, panel, elementId, configuration) {
    try {
      const result = patchTaskJoint(document.getText(), elementId, configuration);
      if (!result.changed) {
        void panel.webview.postMessage({ type: 'taskJointComplete', elementId });
        void panel.webview.postMessage({ type: 'toast', message: 'A atividade conjunta já está atualizada.' });
        return;
      }
      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a edição da atividade conjunta.');
      void panel.webview.postMessage({ type: 'toast', message: `Atividade conjunta de ${elementId} gravada e validada.` });
    } catch (error) {
      const message = `Edição da atividade conjunta recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'taskJointComplete', elementId });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /** @param {vscode.TextDocument} document @param {vscode.WebviewPanel} panel */
  async applyTaskDeadlineChanges(document, panel, elementId, configuration) {
    try {
      const model = parseProcess(document.getText());
      const [formFields, expedientCatalog] = await Promise.all([
        this.discoverEffectiveFormFields(document, model),
        this.discoverEffectiveExpedientCatalog(document, model)
      ]);
      const result = patchTaskDeadline(document.getText(), elementId, configuration, {
        formFields,
        expedientCatalog
      });
      if (!result.changed) {
        void panel.webview.postMessage({ type: 'taskDeadlineComplete', elementId });
        void panel.webview.postMessage({ type: 'toast', message: 'Expediente e prazo já estão atualizados.' });
        return;
      }
      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a edição do expediente e prazo.');
      void panel.webview.postMessage({ type: 'toast', message: `Expediente e prazo de ${elementId} gravados e validados.` });
    } catch (error) {
      const message = `Edição de expediente e prazo recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'taskDeadlineComplete', elementId });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /** @param {vscode.TextDocument} document @param {vscode.WebviewPanel} panel */
  async applyTaskMobileChanges(document, panel, elementId, configuration) {
    try {
      const result = patchTaskMobile(document.getText(), elementId, configuration);
      if (!result.changed) {
        void panel.webview.postMessage({ type: 'taskMobileComplete', elementId });
        void panel.webview.postMessage({ type: 'toast', message: 'A configuração Mobile já está atualizada.' });
        return;
      }
      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a edição Mobile.');
      void panel.webview.postMessage({ type: 'toast', message: `Configuração Mobile de ${elementId} gravada e validada.` });
    } catch (error) {
      const message = `Edição Mobile recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'taskMobileComplete', elementId });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /** @param {vscode.TextDocument} document @param {vscode.WebviewPanel} panel */
  async applyTaskAttachmentRuleChanges(document, panel, elementId, rules) {
    try {
      const result = patchTaskAttachmentRules(document.getText(), elementId, rules);
      if (!result.changed) {
        void panel.webview.postMessage({ type: 'taskAttachmentRulesComplete', elementId });
        void panel.webview.postMessage({ type: 'toast', message: 'As regras de anexo já estão atualizadas.' });
        return;
      }
      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a edição das regras de anexo.');
      void panel.webview.postMessage({ type: 'toast', message: `Regras de anexo de ${elementId} gravadas e validadas.` });
    } catch (error) {
      const message = `Edição de regras de anexo recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'taskAttachmentRulesComplete', elementId });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /** @param {vscode.TextDocument} document @param {vscode.WebviewPanel} panel */
  async applySubProcessFormMapChanges(document, panel, elementId, maps) {
    try {
      const model = parseProcess(document.getText());
      const formFields = await this.discoverEffectiveFormFields(document, model);
      const catalogs = await this.discoverSubProcessFormFieldCatalogs(document, model, formFields);
      const catalog = catalogs[elementId];
      if (!catalog?.supported) throw new Error(catalog?.reason || 'Os campos dos formularios nao estao disponiveis.');
      const result = patchSubProcessFormMaps(document.getText(), elementId, maps, catalog);
      if (!result.changed) {
        void panel.webview.postMessage({ type: 'subProcessFormMapsComplete', elementId });
        void panel.webview.postMessage({ type: 'toast', message: 'Os campos do subprocesso ja estao atualizados.' });
        return;
      }
      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a edicao dos campos do subprocesso.');
      void panel.webview.postMessage({ type: 'toast', message: `Campos de ${elementId} gravados e validados.` });
      void panel.webview.postMessage({ type: 'subProcessFormMapsComplete', elementId });
      void panel.webview.postMessage({ type: 'reloadModel' });
    } catch (error) {
      const message = `Edicao dos campos do subprocesso recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'subProcessFormMapsComplete', elementId });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /** @param {vscode.TextDocument} document @param {vscode.WebviewPanel} panel */
  async applyExtendedPropertyChanges(document, panel, elementId, properties) {
    try {
      const result = patchExtendedProperties(document.getText(), elementId, properties);
      if (!result.changed) {
        void panel.webview.postMessage({ type: 'extendedPropertiesComplete', elementId });
        void panel.webview.postMessage({ type: 'toast', message: 'Os atributos de extensão já estão atualizados.' });
        return;
      }
      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a edição dos atributos de extensão.');
      void panel.webview.postMessage({
        type: 'toast',
        message: `Atributos de extensão de ${elementId} gravados e validados.`
      });
    } catch (error) {
      const message = `Edição de atributos de extensão recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'extendedPropertiesComplete', elementId });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /** @param {vscode.TextDocument} document @param {vscode.WebviewPanel} panel */
  async openTaskScript(document, panel, elementId) {
    try {
      const result = patchTaskScriptReference(document.getText(), elementId);
      const projectRoot = projectRootForProcessPath(document.uri.fsPath);
      if (!projectRoot) throw new Error('O processo deve estar em workflow/diagrams para localizar workflow/scripts.');
      const scriptDirectory = vscode.Uri.file(path.join(projectRoot, 'workflow', 'scripts'));
      const scriptUri = vscode.Uri.joinPath(scriptDirectory, result.fileName);
      await vscode.workspace.fs.createDirectory(scriptDirectory);
      let scriptExists = true;
      try {
        await vscode.workspace.fs.stat(scriptUri);
      } catch (error) {
        if (error?.code !== 'FileNotFound') throw error;
        scriptExists = false;
      }
      if (result.changed) await this.backupService.ensureBackup(vscode, document);
      if (result.changed || !scriptExists) {
        const edit = new vscode.WorkspaceEdit();
        for (const patch of result.patches) {
          edit.replace(
            document.uri,
            new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
            patch.value
          );
        }
        if (!scriptExists) {
          edit.createFile(scriptUri, { overwrite: false, ignoreIfExists: false });
          edit.insert(scriptUri, new vscode.Position(0, 0), result.template);
        }
        if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a criação do script da tarefa.');
      }
      const scriptDocument = await vscode.workspace.openTextDocument(scriptUri);
      if (!scriptExists && !await scriptDocument.save()) throw new Error('Não foi possível salvar o novo script da tarefa.');
      await vscode.window.showTextDocument(scriptDocument, { preview: false });
      void panel.webview.postMessage({
        type: 'toast',
        message: scriptExists ? `Script ${result.fileName} aberto.` : `Script ${result.fileName} criado e aberto.`
      });
    } catch (error) {
      const message = `Abertura do script recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /**
   * Reconecta uma extremidade existente preservando o id do SequenceFlow e sua
   * conexão visual. A mutação lógica e Graphiti é aplicada como uma só edição.
   * @param {vscode.TextDocument} document
   * @param {vscode.WebviewPanel} panel
   * @param {{flowId?: string, endpoint?: 'source'|'target', newElementId?: string, bendpoints?: Array<{x: number, y: number}>}} reconnection
   */
  async applySequenceFlowReconnection(document, panel, reconnection) {
    try {
      const result = reconnectSequenceFlow(document.getText(), reconnection);
      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a reconexão do fluxo.');
      void panel.webview.postMessage({
        type: 'toast',
        message: `Fluxo ${result.flowId} reconectado e validado.`
      });
    } catch (error) {
      const message = `Reconexão do fluxo recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'flowReconnectionCancelled' });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /**
   * Exclui somente um SequenceFlow, preservando ids de atividades e recalculando
   * a cascata posicional Graphiti em uma única edição de workspace.
   * @param {vscode.TextDocument} document
   * @param {vscode.WebviewPanel} panel
   * @param {string} flowId
   */
  async applySequenceFlowDeletion(document, panel, flowId) {
    try {
      const preview = deleteSequenceFlow(document.getText(), flowId);
      const confirmed = await vscode.window.showWarningMessage(
        `Excluir o fluxo ${preview.flowId}?`,
        {
          modal: true,
          detail: `Origem: ${preview.sourceId}\nDestino: ${preview.targetId}\n\nA conexão lógica e visual será removida. Um backup será criado antes da alteração.`
        },
        'Excluir fluxo'
      );
      if (confirmed !== 'Excluir fluxo') {
        void panel.webview.postMessage({ type: 'flowDeletionCancelled' });
        return;
      }

      const result = deleteSequenceFlow(document.getText(), flowId);
      if (result.sourceId !== preview.sourceId || result.targetId !== preview.targetId) {
        throw new Error('O fluxo mudou enquanto a confirmação estava aberta. Tente novamente.');
      }
      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a exclusão do fluxo.');
      void panel.webview.postMessage({
        type: 'toast',
        message: `Fluxo ${result.flowId} excluído e estrutura validada.`
      });
    } catch (error) {
      const message = `Exclusão do fluxo recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'flowDeletionCancelled' });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /**
   * Exclui um evento de início, final ou intermediário e seus fluxos incidentes comuns.
   * O script pertencente a um evento condicional é removido junto; referências
   * nos demais scripts e formulários continuam bloqueando a operação.
   * @param {vscode.TextDocument} document
   * @param {vscode.WebviewPanel} panel
   * @param {string} elementId
   */
  async applyIsolatedEventDeletion(document, panel, elementId) {
    try {
      const preview = deleteIsolatedEvent(document.getText(), elementId);
      const linkedScript = await this.resolveConditionalEventScript(document, preview.elementId);
      const references = this.referencesOutsideLinkedScript(
        await this.findProjectNodeReferences(document, preview.elementId, preview.activityCode),
        linkedScript
      );
      if (references.length) {
        const locations = references.slice(0, 6).map((item) => `${item.relativePath}:${item.line}`).join(', ');
        throw new Error(`O código/WKNumState ${preview.activityCode} possui referência provável em ${locations}. Revise-a antes de excluir o evento.`);
      }
      const label = {
        BpmnStartEvent: 'evento de início',
        BpmnEndEvent: 'evento final',
        BpmnIntermediateEvent: 'evento intermediário'
      }[preview.elementTag] ?? 'evento';
      const removedFlows = preview.removedFlowIds ?? [];
      const flowDetail = removedFlows.length
        ? `\nFluxos removidos junto: ${removedFlows.join(', ')}`
        : '\nO evento não possui fluxos.';
      const scriptDetail = linkedScript?.exists
        ? `\nScript vinculado removido junto: ${linkedScript.relativePath}`
        : (linkedScript ? `\nScript vinculado já ausente: ${linkedScript.relativePath}` : '');
      const removalDetail = linkedScript
        ? 'O elemento lógico, o shape visual, os fluxos incidentes e o script condicional vinculado serão removidos em uma única operação.'
        : 'O elemento lógico, o shape visual e os fluxos incidentes serão removidos em uma única operação.';
      const confirmed = await vscode.window.showWarningMessage(
        `Excluir o evento ${preview.elementId}?`,
        {
          modal: true,
          detail: `Tipo: ${label}\nCódigo/WKNumState: ${preview.activityCode}${flowDetail}${scriptDetail}\n\n${removalDetail} Backups serão criados antes da alteração.`
        },
        'Excluir evento'
      );
      if (confirmed !== 'Excluir evento') {
        void panel.webview.postMessage({ type: 'elementDeletionCancelled' });
        return;
      }

      const currentLinkedScript = await this.resolveConditionalEventScript(document, preview.elementId);
      if (!sameLinkedScript(linkedScript, currentLinkedScript)) {
        throw new Error('O script vinculado ao evento mudou enquanto a confirmação estava aberta. Tente novamente.');
      }
      const currentReferences = this.referencesOutsideLinkedScript(
        await this.findProjectNodeReferences(document, preview.elementId, preview.activityCode),
        currentLinkedScript
      );
      if (currentReferences.length) throw new Error('Uma referência ao evento surgiu enquanto a confirmação estava aberta. Tente novamente.');
      const result = deleteIsolatedEvent(document.getText(), elementId);
      if (result.elementTag !== preview.elementTag
        || result.removedChildIndex !== preview.removedChildIndex
        || JSON.stringify(result.removedFlowIds ?? []) !== JSON.stringify(preview.removedFlowIds ?? [])) {
        throw new Error('O evento mudou enquanto a confirmação estava aberta. Tente novamente.');
      }
      await this.backupService.ensureBackup(vscode, document);
      if (currentLinkedScript?.exists) {
        await this.backupService.createRelatedFileBackup(vscode, document, currentLinkedScript.uri);
      }
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (currentLinkedScript?.exists) {
        edit.deleteFile(currentLinkedScript.uri, { ignoreIfNotExists: false, recursive: false });
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a exclusão do evento.');
      void panel.webview.postMessage({
        type: 'toast',
        message: `Evento ${result.elementId}, ${result.removedFlowIds?.length ?? 0} fluxo(s)${currentLinkedScript?.exists ? ' e o script vinculado' : ''} excluídos; estrutura validada.`
      });
    } catch (error) {
      const message = `Exclusão do evento recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'elementDeletionCancelled' });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /**
   * Exclui uma captura de erro da borda e limpa atomicamente o attachedEvents
   * da atividade de serviço proprietária.
   * @param {vscode.TextDocument} document
   * @param {vscode.WebviewPanel} panel
   * @param {string} elementId
   */
  async applyAttachedErrorEventDeletion(document, panel, elementId) {
    try {
      const preview = deleteAttachedErrorEvent(document.getText(), elementId);
      const references = await this.findProjectNodeReferences(document, preview.elementId, '');
      if (references.length) {
        const locations = references.slice(0, 6).map((item) => `${item.relativePath}:${item.line}`).join(', ');
        throw new Error(`A tratativa ${preview.elementId} possui referência externa em ${locations}. Revise-a antes de excluir.`);
      }
      const confirmed = await vscode.window.showWarningMessage(
        `Excluir a tratativa de erro ${preview.elementId}?`,
        {
          modal: true,
          detail: `Atividade de serviço: ${preview.parentTaskId}\n\nO evento lógico, seu shape visual e o vínculo attachedEvents serão removidos. A atividade e seus fluxos serão preservados. Um backup será criado antes da alteração.`
        },
        'Excluir tratativa'
      );
      if (confirmed !== 'Excluir tratativa') {
        void panel.webview.postMessage({ type: 'elementDeletionCancelled' });
        return;
      }

      const currentReferences = await this.findProjectNodeReferences(document, preview.elementId, '');
      if (currentReferences.length) throw new Error('Uma referência à tratativa surgiu enquanto a confirmação estava aberta. Tente novamente.');
      const result = deleteAttachedErrorEvent(document.getText(), elementId);
      if (result.parentTaskId !== preview.parentTaskId || result.removedChildIndex !== preview.removedChildIndex) {
        throw new Error('A tratativa mudou enquanto a confirmação estava aberta. Tente novamente.');
      }
      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a exclusão da tratativa de erro.');
      void panel.webview.postMessage({
        type: 'toast',
        message: `Tratativa ${result.elementId} excluída de ${result.parentTaskId} e estrutura validada.`
      });
    } catch (error) {
      const message = `Exclusão da tratativa recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'elementDeletionCancelled' });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /**
   * Exclui um gateway com condição vazia e seus fluxos incidentes comuns.
   * Referências por id/WKNumState no projeto bloqueiam a operação.
   * @param {vscode.TextDocument} document
   * @param {vscode.WebviewPanel} panel
   * @param {string} elementId
   */
  async applyIsolatedGatewayDeletion(document, panel, elementId) {
    try {
      const preview = deleteIsolatedGateway(document.getText(), elementId);
      const references = await this.findProjectNodeReferences(document, preview.elementId, preview.activityCode);
      if (references.length) {
        const locations = references.slice(0, 6).map((item) => `${item.relativePath}:${item.line}`).join(', ');
        throw new Error(`O código/WKNumState ${preview.activityCode} possui referência provável em ${locations}. Revise-a antes de excluir o gateway.`);
      }
      const gatewayLabel = {
        '120': 'gateway exclusivo',
        '121': 'gateway inclusivo',
        '126': 'gateway paralelo',
        '127': 'gateway join'
      }[preview.elementType] ?? 'gateway';
      const removedFlows = preview.removedFlowIds ?? [];
      const flowDetail = removedFlows.length
        ? `\nFluxos removidos junto: ${removedFlows.join(', ')}`
        : '\nO gateway não possui fluxos.';
      const confirmed = await vscode.window.showWarningMessage(
        `Excluir o gateway ${preview.elementId}?`,
        {
          modal: true,
          detail: `Tipo: ${gatewayLabel}\nCódigo/WKNumState: ${preview.activityCode}${flowDetail}\n\nO elemento lógico, o shape visual e os fluxos incidentes listados serão removidos atomicamente. Gateways com condição ou ramo padrão permanecem bloqueados. Um backup será criado antes da alteração.`
        },
        'Excluir gateway'
      );
      if (confirmed !== 'Excluir gateway') {
        void panel.webview.postMessage({ type: 'elementDeletionCancelled' });
        return;
      }

      const currentReferences = await this.findProjectNodeReferences(document, preview.elementId, preview.activityCode);
      if (currentReferences.length) throw new Error('Uma referência ao gateway surgiu enquanto a confirmação estava aberta. Tente novamente.');
      const result = deleteIsolatedGateway(document.getText(), elementId);
      if (result.elementType !== preview.elementType
        || result.removedChildIndex !== preview.removedChildIndex
        || JSON.stringify(result.removedFlowIds ?? []) !== JSON.stringify(preview.removedFlowIds ?? [])) {
        throw new Error('O gateway mudou enquanto a confirmação estava aberta. Tente novamente.');
      }
      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a exclusão do gateway.');
      void panel.webview.postMessage({
        type: 'toast',
        message: `Gateway ${result.elementId} e ${result.removedFlowIds?.length ?? 0} fluxo(s) excluídos; estrutura validada.`
      });
    } catch (error) {
      const message = `Exclusão do gateway recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'elementDeletionCancelled' });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /**
   * Exclui uma atividade sem evento anexado e seus fluxos incidentes comuns.
   * O script pertencente à própria atividade é removido junto; referências externas
   * por id/WKNumState nos demais arquivos continuam bloqueando a operação.
   * @param {vscode.TextDocument} document
   * @param {vscode.WebviewPanel} panel
   * @param {string} elementId
   */
  async applyIsolatedTaskDeletion(document, panel, elementId) {
    try {
      const preview = deleteIsolatedTask(document.getText(), elementId);
      const linkedScript = await this.resolveTaskScript(document, preview.elementId);
      const references = this.referencesOutsideLinkedScripts(
        await this.findProjectNodeReferences(document, preview.elementId, preview.activityCode),
        linkedScript ? [linkedScript] : []
      );
      if (references.length) {
        const locations = references.slice(0, 6).map((item) => `${item.relativePath}:${item.line}`).join(', ');
        throw new Error(`O código/WKNumState ${preview.activityCode} possui referência provável em ${locations}. Revise-a antes de excluir a atividade.`);
      }
      const taskLabel = {
        '80': 'atividade comum',
        '81': 'atividade de usuário',
        '82': 'atividade de serviço',
        '84': 'atividade de envio de e-mail',
        '85': 'atividade manual',
        '86': 'atividade de negócio',
        '87': 'atividade de script'
      }[preview.elementType] ?? 'atividade';
      const removedFlows = preview.removedFlowIds ?? [];
      const flowDetail = removedFlows.length
        ? `\nFluxos removidos junto: ${removedFlows.join(', ')}`
        : '\nA atividade não possui fluxos.';
      const scriptDetail = linkedScript?.exists
        ? `\nScript vinculado removido junto: ${linkedScript.relativePath}`
        : (linkedScript ? `\nScript vinculado já ausente: ${linkedScript.relativePath}` : '');
      const confirmed = await vscode.window.showWarningMessage(
        `Excluir a atividade ${preview.elementId}?`,
        {
          modal: true,
          detail: `Tipo: ${taskLabel}\nCódigo/WKNumState: ${preview.activityCode}${flowDetail}${scriptDetail}\n\nO elemento lógico, o shape visual, os fluxos incidentes e o script vinculado serão removidos atomicamente. Eventos anexados permanecem bloqueados. Backups serão criados antes da alteração.`
        },
        'Excluir atividade'
      );
      if (confirmed !== 'Excluir atividade') {
        void panel.webview.postMessage({ type: 'elementDeletionCancelled' });
        return;
      }

      const currentLinkedScript = await this.resolveTaskScript(document, preview.elementId);
      if (!sameLinkedScript(linkedScript, currentLinkedScript)) {
        throw new Error('O script vinculado à atividade mudou enquanto a confirmação estava aberta. Tente novamente.');
      }
      const currentReferences = this.referencesOutsideLinkedScripts(
        await this.findProjectNodeReferences(document, preview.elementId, preview.activityCode),
        currentLinkedScript ? [currentLinkedScript] : []
      );
      if (currentReferences.length) throw new Error('Uma referência à atividade surgiu enquanto a confirmação estava aberta. Tente novamente.');
      const result = deleteIsolatedTask(document.getText(), elementId);
      if (result.elementType !== preview.elementType
        || result.removedChildIndex !== preview.removedChildIndex
        || JSON.stringify(result.removedFlowIds ?? []) !== JSON.stringify(preview.removedFlowIds ?? [])) {
        throw new Error('A atividade mudou enquanto a confirmação estava aberta. Tente novamente.');
      }
      await this.backupService.ensureBackup(vscode, document);
      if (currentLinkedScript?.exists) {
        await this.backupService.createRelatedFileBackup(vscode, document, currentLinkedScript.uri);
      }
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (currentLinkedScript?.exists) {
        edit.deleteFile(currentLinkedScript.uri, { ignoreIfNotExists: false, recursive: false });
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a exclusão da atividade.');
      void panel.webview.postMessage({
        type: 'toast',
        message: `Atividade ${result.elementId}, ${result.removedFlowIds?.length ?? 0} fluxo(s)${currentLinkedScript?.exists ? ' e o script vinculado' : ''} excluídos; estrutura validada.`
      });
    } catch (error) {
      const message = `Exclusão da atividade recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'elementDeletionCancelled' });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /**
   * Exclui um subprocesso comum ou ad-hoc e seus fluxos incidentes comuns.
   * O processo filho é apenas informado ao usuário e nunca é alterado.
   * @param {vscode.TextDocument} document
   * @param {vscode.WebviewPanel} panel
   * @param {string} elementId
   */
  async applyIsolatedSubProcessDeletion(document, panel, elementId) {
    try {
      const preview = deleteIsolatedSubProcess(document.getText(), elementId);
      const references = await this.findProjectNodeReferences(document, preview.elementId, preview.activityCode);
      if (references.length) {
        const locations = references.slice(0, 6).map((item) => `${item.relativePath}:${item.line}`).join(', ');
        throw new Error(`O código/WKNumState ${preview.activityCode} possui referência provável em ${locations}. Revise-a antes de excluir o subprocesso.`);
      }
      const subProcessLabel = preview.elementType === '101' ? 'subprocesso ad-hoc' : 'subprocesso comum';
      const childProcessDetail = preview.childProcessId
        ? `\nProcesso filho: ${preview.childProcessId} (será preservado).`
        : '\nProcesso filho: não informado.';
      const removedFlows = preview.removedFlowIds ?? [];
      const flowDetail = removedFlows.length
        ? `\nFluxos removidos junto: ${removedFlows.join(', ')}`
        : '\nO subprocesso não possui fluxos.';
      const confirmed = await vscode.window.showWarningMessage(
        `Excluir o subprocesso ${preview.elementId}?`,
        {
          modal: true,
          detail: `Tipo: ${subProcessLabel}\nCódigo/WKNumState: ${preview.activityCode}${childProcessDetail}${flowDetail}\n\nO nó lógico, o shape visual e os fluxos incidentes listados serão removidos atomicamente. O processo filho, scripts e formulários serão preservados. Subprocessos com eventos anexados continuam protegidos. Um backup será criado antes da alteração.`
        },
        'Excluir subprocesso'
      );
      if (confirmed !== 'Excluir subprocesso') {
        void panel.webview.postMessage({ type: 'elementDeletionCancelled' });
        return;
      }

      const currentReferences = await this.findProjectNodeReferences(document, preview.elementId, preview.activityCode);
      if (currentReferences.length) throw new Error('Uma referência ao subprocesso surgiu enquanto a confirmação estava aberta. Tente novamente.');
      const result = deleteIsolatedSubProcess(document.getText(), elementId);
      if (result.elementType !== preview.elementType
        || result.removedChildIndex !== preview.removedChildIndex
        || result.childProcessId !== preview.childProcessId
        || JSON.stringify(result.removedFlowIds ?? []) !== JSON.stringify(preview.removedFlowIds ?? [])) {
        throw new Error('O subprocesso mudou enquanto a confirmação estava aberta. Tente novamente.');
      }
      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a exclusão do subprocesso.');
      void panel.webview.postMessage({
        type: 'toast',
        message: `Subprocesso ${result.elementId} e ${result.removedFlowIds?.length ?? 0} fluxo(s) excluídos; estrutura validada.`
      });
    } catch (error) {
      const message = `Exclusão do subprocesso recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'elementDeletionCancelled' });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /**
   * @param {vscode.TextDocument} document
   * @param {vscode.WebviewPanel} panel
   * @param {string} elementId
   */
  async applyIsolatedArtifactDeletion(document, panel, elementId) {
    try {
      const preview = deleteIsolatedArtifact(document.getText(), elementId);
      const metadata = {
        BpmnAnnotation: { noun: 'anotação', action: 'Excluir anotação' },
        BpmnDatabase: { noun: 'database', action: 'Excluir database' },
        BpmnDocument: { noun: 'documento', action: 'Excluir documento' },
        BpmnGroup: { noun: 'grupo', action: 'Excluir grupo' }
      }[preview.elementTag];
      if (!metadata) throw new Error(`Tipo de artefato não suportado: ${preview.elementTag}.`);

      const references = await this.findProjectNodeReferences(document, preview.elementId, '');
      if (references.length) {
        const locations = references.slice(0, 6).map((item) => `${item.relativePath}:${item.line}`).join(', ');
        throw new Error(`O id ${preview.elementId} possui referência provável em ${locations}. Revise-a antes de excluir o ${metadata.noun}.`);
      }
      const resourceDetail = preview.elementTag === 'BpmnDocument'
        ? `\nDocumento GED: ${preview.documentId || 'não informado'} (será preservado).`
        : (preview.elementTag === 'BpmnDatabase'
          ? '\nNenhuma base, dataset ou conexão externa será alterada.'
          : (preview.elementTag === 'BpmnGroup'
            ? '\nElementos dentro ou sobrepostos ao grupo serão preservados.'
            : ''));
      const flowDetail = preview.removedFlowIds?.length
        ? `\nAssociações visuais removidas junto: ${preview.removedFlowIds.join(', ')}.`
        : '\nO artefato não possui associações visuais.';
      const confirmed = await vscode.window.showWarningMessage(
        `Excluir ${metadata.noun} ${preview.elementId}?`,
        {
          modal: true,
          detail: `Nome: ${preview.elementName || '(sem nome)'}\nCódigo do elemento: ${preview.activityCode}${resourceDetail}${flowDetail}\n\nO objeto lógico, seu shape visual e suas associações serão removidos. Scripts, formulários e recursos externos não serão excluídos. Um backup será criado antes da alteração.`
        },
        metadata.action
      );
      if (confirmed !== metadata.action) {
        void panel.webview.postMessage({ type: 'elementDeletionCancelled' });
        return;
      }

      const currentReferences = await this.findProjectNodeReferences(document, preview.elementId, '');
      if (currentReferences.length) throw new Error(`Uma referência ao ${metadata.noun} surgiu enquanto a confirmação estava aberta. Tente novamente.`);
      const result = deleteIsolatedArtifact(document.getText(), elementId);
      if (result.elementTag !== preview.elementTag
        || result.removedChildIndex !== preview.removedChildIndex
        || result.documentId !== preview.documentId
        || JSON.stringify(result.removedFlowIds ?? []) !== JSON.stringify(preview.removedFlowIds ?? [])) {
        throw new Error(`O ${metadata.noun} mudou enquanto a confirmação estava aberta. Tente novamente.`);
      }
      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error(`O VS Code recusou a exclusão do ${metadata.noun}.`);
      void panel.webview.postMessage({
        type: 'toast',
        message: `${metadata.noun[0].toUpperCase()}${metadata.noun.slice(1)} ${result.elementId} excluído e estrutura validada.`
      });
    } catch (error) {
      const message = `Exclusão do artefato recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'elementDeletionCancelled' });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /** Exclui uma pool ou raia preservando os elementos posicionados sobre ela. */
  async applyDiagramContainerDeletion(document, panel, elementId) {
    try {
      const originalText = document.getText();
      const preview = deleteDiagramContainer(originalText, elementId);
      const isPool = preview.elementTag === 'BpmnPool';
      const noun = isPool ? 'pool' : 'raia';
      const nestedDetail = preview.removedNestedLaneIds.length
        ? `\nRaias internas removidas junto: ${preview.removedNestedLaneIds.join(', ')}.`
        : '';
      const action = isPool ? 'Excluir pool' : 'Excluir raia';
      const confirmed = await vscode.window.showWarningMessage(
        `Excluir ${noun} ${preview.elementId}?`,
        {
          modal: true,
          detail: `Nome: ${preview.elementName || '(sem nome)'}${nestedDetail}\n\nSomente o container visual e sua definicao serao removidos. Atividades, eventos, gateways e fluxos serao preservados. As raias restantes serao repartidas igualmente. Um backup sera criado antes da alteracao.`
        },
        action
      );
      if (confirmed !== action) {
        void panel.webview.postMessage({ type: 'elementDeletionCancelled' });
        return;
      }
      if (document.getText() !== originalText) {
        throw new Error('O processo mudou enquanto a confirmacao estava aberta. Tente novamente.');
      }
      const result = deleteDiagramContainer(document.getText(), elementId);
      if (result.elementTag !== preview.elementTag
        || result.parentPoolId !== preview.parentPoolId
        || JSON.stringify(result.removedContainerIds) !== JSON.stringify(preview.removedContainerIds)) {
        throw new Error(`A ${noun} mudou enquanto a confirmacao estava aberta. Tente novamente.`);
      }
      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error(`O VS Code recusou a exclusao da ${noun}.`);
      void panel.webview.postMessage({
        type: 'toast',
        message: `${isPool ? 'Pool' : 'Raia'} ${result.elementId} excluida; atividades e fluxos preservados.`
      });
    } catch (error) {
      const message = `Exclusao do container recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'elementDeletionCancelled' });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /** Exclui em uma única operação os elementos selecionados e seus fluxos incidentes. */
  async applyMultipleElementDeletion(document, panel, elementIds) {
    try {
      const originalText = document.getText();
      const preview = deleteDiagramElements(originalText, elementIds);
      const selectedIds = new Set(preview.elementIds);
      const initialModel = parseProcess(originalText);
      const referenceSensitiveTags = new Set([
        'BpmnTask', 'BpmnSubProcess', 'BpmnGateway',
        'BpmnStartEvent', 'BpmnEndEvent', 'BpmnIntermediateEvent'
      ]);
      const selectedNodes = initialModel.elements.filter((item) => (
        selectedIds.has(item.id) && referenceSensitiveTags.has(item.tag)
      ));
      const linkedScripts = await this.resolveLinkedScriptsForElementIds(document, preview.elementIds);
      const externalReferences = [];
      for (const element of selectedNodes) {
        const activityCode = String(element.id).match(/(\d+)$/)?.[1] ?? '';
        const references = this.referencesOutsideLinkedScripts(
          await this.findProjectNodeReferences(document, element.id, activityCode),
          linkedScripts
        );
        for (const reference of references) externalReferences.push({ ...reference, elementId: element.id });
      }
      if (externalReferences.length) {
        const locations = externalReferences.slice(0, 8)
          .map((item) => `${item.elementId} em ${item.relativePath}:${item.line}`)
          .join(', ');
        throw new Error(`Há referências externas prováveis: ${locations}. Revise-as antes de excluir a seleção.`);
      }

      const existingScripts = linkedScripts.filter((item) => item.exists);
      const removedFlowCount = preview.removedFlowIds.length;
      const confirmed = await vscode.window.showWarningMessage(
        `Excluir ${preview.elementIds.length} elementos selecionados?`,
        {
          modal: true,
          detail: `Elementos: ${preview.elementIds.join(', ')}\nFluxos incidentes removidos: ${removedFlowCount}\nScripts vinculados removidos: ${existingScripts.length}${existingScripts.length ? `\n${existingScripts.map((item) => item.relativePath).join('\n')}` : ''}\n\nA operação é atômica e cria backups antes de alterar o processo.`
        },
        'Excluir seleção'
      );
      if (confirmed !== 'Excluir seleção') {
        void panel.webview.postMessage({ type: 'elementDeletionCancelled' });
        return;
      }

      if (document.getText() !== originalText) {
        throw new Error('O processo mudou enquanto a confirmação estava aberta. Tente novamente.');
      }
      const currentScripts = await this.resolveLinkedScriptsForElementIds(document, preview.elementIds);
      if (!sameLinkedScripts(linkedScripts, currentScripts)) {
        throw new Error('Um script vinculado mudou enquanto a confirmação estava aberta. Tente novamente.');
      }
      const result = deleteDiagramElements(document.getText(), elementIds);
      await this.backupService.ensureBackup(vscode, document);
      for (const script of currentScripts.filter((item) => item.exists)) {
        await this.backupService.createRelatedFileBackup(vscode, document, script.uri);
      }
      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        document.uri,
        new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)),
        result.text
      );
      for (const script of currentScripts.filter((item) => item.exists)) {
        edit.deleteFile(script.uri, { ignoreIfNotExists: false, recursive: false });
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a exclusão múltipla.');
      void panel.webview.postMessage({
        type: 'toast',
        message: `${result.elementIds.length} elementos, ${result.removedFlowIds.length} fluxo(s) e ${existingScripts.length} script(s) excluídos; estrutura validada.`
      });
    } catch (error) {
      const message = `Exclusão múltipla recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'elementDeletionCancelled' });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /**
   * @param {vscode.TextDocument} document
   * @param {string[]} elementIds
   */
  async resolveLinkedScriptsForElementIds(document, elementIds) {
    const requested = new Set(elementIds ?? []);
    const model = parseProcess(document.getText());
    const scripts = [];
    for (const element of model.elements.filter((item) => requested.has(item.id))) {
      let script = null;
      if (element.tag === 'BpmnTask') script = await this.resolveTaskScript(document, element.id);
      else if ((element.tag === 'BpmnStartEvent' && element.type === '13')
        || (element.tag === 'BpmnIntermediateEvent' && element.type === '35')) {
        script = await this.resolveConditionalEventScript(document, element.id);
      }
      if (script) scripts.push(script);
    }
    return [...new Map(scripts.map((item) => [item.uri.toString(), item])).values()];
  }

  /**
   * @param {vscode.TextDocument} document
   * @param {string} elementId
   * @param {string} activityCode
   */
  async findProjectNodeReferences(document, elementId, activityCode) {
    const projectRoot = projectRootForProcessPath(document.uri.fsPath);
    if (!projectRoot) throw new Error('Não foi possível localizar a raiz do projeto a partir de workflow/diagrams.');
    const rootUri = vscode.Uri.file(projectRoot);
    const patterns = [
      'workflow/scripts/**/*.js',
      'forms/**/events/**/*.js'
    ];
    const uris = new Map();
    for (const pattern of patterns) {
      for (const uri of await vscode.workspace.findFiles(new vscode.RelativePattern(rootUri, pattern), '**/{node_modules,.git}/**')) {
        uris.set(uri.toString(), uri);
      }
    }
    const findings = [];
    for (const uri of uris.values()) {
      if (path.basename(uri.fsPath).split('.').includes(elementId)) {
        findings.push({
          kind: 'fileName',
          line: 1,
          excerpt: path.basename(uri.fsPath),
          uri,
          relativePath: vscode.workspace.asRelativePath(uri, false)
        });
      }
      let content;
      try {
        content = new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(uri));
      } catch (error) {
        throw new Error(`Não foi possível verificar referências em ${uri.fsPath}: ${error.message}`);
      }
      for (const finding of findLikelyNodeReferences(content, elementId, activityCode)) {
        findings.push({ ...finding, uri, relativePath: vscode.workspace.asRelativePath(uri, false) });
      }
    }
    return findings;
  }

  /**
   * Localiza com segurança o arquivo pertencente a um evento condicional.
   * @param {vscode.TextDocument} document
   * @param {string} elementId
   */
  async resolveConditionalEventScript(document, elementId) {
    const model = parseProcess(document.getText());
    const element = model.elements.find((item) => item.id === elementId);
    const conditional = (element?.tag === 'BpmnStartEvent' && element.type === '13')
      || (element?.tag === 'BpmnIntermediateEvent' && element.type === '35');
    if (!conditional) return null;

    const fileName = String(parseEventTriggerData(element.attributes.trigger).scriptCondition ?? '').trim();
    if (!fileName) return null;
    return this.resolveLinkedScriptFile(document, fileName, 'evento');
  }

  /**
   * @param {vscode.TextDocument} document
   * @param {string} elementId
   */
  async resolveTaskScript(document, elementId) {
    const model = parseProcess(document.getText());
    const element = model.elements.find((item) => item.id === elementId);
    if (element?.tag !== 'BpmnTask') return null;
    const fileName = String(element.attributes.scriptFileName ?? '').trim();
    if (!fileName) return null;
    return this.resolveLinkedScriptFile(document, fileName, 'atividade');
  }

  /**
   * @param {vscode.TextDocument} document
   * @param {string} fileName
   * @param {string} ownerLabel
   */
  async resolveLinkedScriptFile(document, fileName, ownerLabel) {
    if (path.basename(fileName) !== fileName || !/^[A-Za-z0-9._-]+\.js$/i.test(fileName)) {
      throw new Error(`Referência de script da ${ownerLabel} insegura: ${fileName}.`);
    }

    const projectRoot = projectRootForProcessPath(document.uri.fsPath);
    if (!projectRoot) throw new Error('Não foi possível localizar a raiz do projeto a partir de workflow/diagrams.');
    const uri = vscode.Uri.joinPath(vscode.Uri.file(projectRoot), 'workflow', 'scripts', fileName);
    const relativePath = vscode.workspace.asRelativePath(uri, false);
    const openDocument = vscode.workspace.textDocuments.find((item) => item.uri.toString() === uri.toString());
    if (openDocument?.isDirty) {
      throw new Error(`Salve ou descarte as alterações pendentes em ${relativePath} antes de excluir a ${ownerLabel}.`);
    }

    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      return {
        uri,
        relativePath,
        exists: true,
        digest: crypto.createHash('sha256').update(bytes).digest('hex')
      };
    } catch (error) {
      if (isFileNotFound(error)) return { uri, relativePath, exists: false, digest: '' };
      throw new Error(`Não foi possível verificar o script vinculado ${relativePath}: ${error.message}`);
    }
  }

  referencesOutsideLinkedScript(references, linkedScript) {
    if (!linkedScript?.exists) return references;
    const linkedUri = linkedScript.uri.toString();
    return references.filter((item) => item.uri.toString() !== linkedUri);
  }

  referencesOutsideLinkedScripts(references, linkedScripts) {
    const linkedUris = new Set((linkedScripts ?? [])
      .filter((item) => item?.exists)
      .map((item) => item.uri.toString()));
    return references.filter((item) => !linkedUris.has(item.uri.toString()));
  }

  /**
   * Converte uma atividade reproduzindo a semântica do Fluig Studio: a atividade
   * recebe um novo id/WKNumState e todas as referências internas são religadas.
   * @param {vscode.TextDocument} document
   * @param {vscode.WebviewPanel} panel
   * @param {string} taskId
   * @param {string} targetType
   */
  async applyTaskConversion(document, panel, taskId, targetType) {
    try {
      const result = convertTaskType(document.getText(), taskId, targetType);
      if (!result.changed) {
        void panel.webview.postMessage({ type: 'toast', message: 'A atividade já possui esse tipo.' });
        void panel.webview.postMessage({ type: 'taskConversionCancelled' });
        return;
      }

      const detail = [
        'O Fluig Studio recria a atividade ao mudar seu tipo.',
        `Código/WKNumState: ${result.oldActivityId} → ${result.newActivityId}.`,
        'Fluxos, condições e eventos anexados serão religados automaticamente.',
        'Scripts e eventos de formulário que usam o WKNumState antigo precisam ser revisados.',
        'Arquivos JavaScript não serão criados nem excluídos automaticamente.'
      ].join('\n');
      const confirmed = await vscode.window.showWarningMessage(
        `Mudar ${result.oldId} para ${result.targetLabel}?`,
        { modal: true, detail },
        'Mudar atividade'
      );
      if (confirmed !== 'Mudar atividade') {
        void panel.webview.postMessage({ type: 'taskConversionCancelled' });
        return;
      }

      // O documento pode ter mudado enquanto a confirmação modal estava aberta.
      // Recalcular evita aplicar offsets antigos sobre uma versão mais recente.
      const confirmedResult = convertTaskType(document.getText(), taskId, targetType);
      if (!confirmedResult.changed) {
        void panel.webview.postMessage({ type: 'toast', message: 'A atividade já possui esse tipo.' });
        void panel.webview.postMessage({ type: 'taskConversionCancelled' });
        return;
      }
      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of confirmedResult.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a conversão da atividade.');
      void panel.webview.postMessage({
        type: 'toast',
        message: `Atividade convertida para ${confirmedResult.newId} (WKNumState ${confirmedResult.newActivityId}).`
      });
    } catch (error) {
      const message = `Conversão recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'taskConversionCancelled' });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /**
   * Cria uma atividade comum e seu fluxo de entrada como uma única alteração.
   * @param {vscode.TextDocument} document
   * @param {vscode.WebviewPanel} panel
   * @param {{sourceId?: string, x?: number, y?: number, bendpoints?: Array<{x:number,y:number}>}} task
   */
  async applyConnectedTaskCreation(document, panel, task) {
    try {
      const templateText = await this.loadCreationTemplateText();
      const result = createConnectedTask(document.getText(), { ...task, templateText });
      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a criação da atividade.');
      void panel.webview.postMessage({
        type: 'toast',
        message: `${result.taskId} e ${result.flowId} criados e validados.`
      });
    } catch (error) {
      const message = `Criação da atividade recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'taskCreationCancelled' });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /**
   * Cria um gateway exclusivo e seu fluxo de entrada como uma única alteração.
   * @param {vscode.TextDocument} document
   * @param {vscode.WebviewPanel} panel
   * @param {{sourceId?: string, x?: number, y?: number, bendpoints?: Array<{x:number,y:number}>}} gateway
   */
  async applyConnectedGatewayCreation(document, panel, gateway) {
    try {
      const templateText = await this.loadCreationTemplateText();
      const result = createConnectedGateway(document.getText(), { ...gateway, templateText });
      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a criação do gateway.');
      void panel.webview.postMessage({
        type: 'toast',
        message: `${result.gatewayId} e ${result.flowId} criados e validados.`
      });
    } catch (error) {
      const message = `Criação do gateway recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'taskCreationCancelled' });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /**
   * Cria um evento intermediário normal e seu fluxo de entrada como uma única alteração.
   * @param {vscode.TextDocument} document
   * @param {vscode.WebviewPanel} panel
   * @param {{sourceId?: string, x?: number, y?: number, bendpoints?: Array<{x:number,y:number}>}} intermediateEvent
   */
  async applyConnectedIntermediateEventCreation(document, panel, intermediateEvent) {
    try {
      const templateText = await this.loadCreationTemplateText();
      const result = createConnectedIntermediateEvent(document.getText(), { ...intermediateEvent, templateText });
      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a criação do evento intermediário.');
      void panel.webview.postMessage({
        type: 'toast',
        message: `${result.eventId} e ${result.flowId} criados e validados.`
      });
    } catch (error) {
      const message = `Criação do evento intermediário recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'taskCreationCancelled' });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /**
   * Cria um evento final normal e seu fluxo de entrada como uma única alteração.
   * @param {vscode.TextDocument} document
   * @param {vscode.WebviewPanel} panel
   * @param {{sourceId?: string, x?: number, y?: number, bendpoints?: Array<{x:number,y:number}>}} endEvent
   */
  async applyConnectedEndEventCreation(document, panel, endEvent) {
    try {
      const templateText = await this.loadCreationTemplateText();
      const result = createConnectedEndEvent(document.getText(), { ...endEvent, templateText });
      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('O VS Code recusou a criação do evento final.');
      void panel.webview.postMessage({
        type: 'toast',
        message: `${result.eventId} e ${result.flowId} criados e validados.`
      });
    } catch (error) {
      const message = `Criação do evento final recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'taskCreationCancelled' });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }

  /** Cria uma pool vazia usando a estrutura Graphiti homologada no Eclipse. */
  async applyPoolCreation(document, panel, pool) {
    const templateText = await this.loadCreationTemplateText();
    await this.applyContainerCreation(
      document,
      panel,
      () => createPool(document.getText(), { ...pool, templateText }),
      'pool'
    );
  }

  /** Cria uma raia independente ou redistribui as raias de uma pool existente. */
  async applySwimLaneCreation(document, panel, lane) {
    const templateText = await this.loadCreationTemplateText();
    await this.applyContainerCreation(
      document,
      panel,
      () => createSwimLane(document.getText(), { ...lane, templateText }),
      'raia'
    );
  }

  /** Cria um elemento isolado escolhido na paleta lateral. */
  async applyIsolatedNodeCreation(document, panel, node) {
    const templateText = await this.loadCreationTemplateText();
    await this.applyContainerCreation(
      document,
      panel,
      () => createIsolatedNode(document.getText(), { ...node, templateText }),
      'elemento'
    );
  }

  /** Cria uma captura de erro anexada exclusivamente a uma atividade de serviço automatizada. */
  async applyAttachedErrorEventCreation(document, panel, errorEvent) {
    const templateText = await this.loadCreationTemplateText();
    await this.applyContainerCreation(
      document,
      panel,
      () => createAttachedErrorEvent(document.getText(), { ...errorEvent, templateText }),
      'captura de erro'
    );
  }

  async applyContainerCreation(document, panel, operation, noun) {
    try {
      const result = operation();
      await this.backupService.ensureBackup(vscode, document);
      const edit = new vscode.WorkspaceEdit();
      for (const patch of result.patches) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(patch.start), document.positionAt(patch.end)),
          patch.value
        );
      }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error(`O VS Code recusou a criação da ${noun}.`);
      void panel.webview.postMessage({
        type: 'toast',
        message: `${result.elementId} criada e validada${result.poolId ? ` dentro de ${result.poolId}` : ''}.`
      });
    } catch (error) {
      const message = `Criação da ${noun} recusada: ${error.message}`;
      void vscode.window.showErrorMessage(`Fluig BPMN: ${message}`);
      void panel.webview.postMessage({ type: 'toast', message });
      void panel.webview.postMessage({ type: 'containerCreationCancelled' });
      void panel.webview.postMessage({ type: 'reloadModel' });
    }
  }
}

function isProcessFileRename(oldUri, newUri) {
  if (String(oldUri?.scheme ?? '') !== 'file' || String(newUri?.scheme ?? '') !== 'file') return false;
  if (path.extname(oldUri.fsPath).toLowerCase() !== '.process' || path.extname(newUri.fsPath).toLowerCase() !== '.process') return false;
  if (path.dirname(oldUri.fsPath).toLocaleLowerCase('en-US') !== path.dirname(newUri.fsPath).toLocaleLowerCase('en-US')) return false;
  return path.basename(oldUri.fsPath) !== path.basename(newUri.fsPath);
}

function normalizeUriKey(uri) {
  const value = String(uri?.fsPath ?? uri?.toString?.() ?? '');
  return process.platform === 'win32' ? path.normalize(value).toLocaleLowerCase('en-US') : path.normalize(value);
}

function processRenameKey(oldUri, newUri) {
  return `${normalizeUriKey(oldUri)}=>${normalizeUriKey(newUri)}`;
}

function isFileNotFound(error) {
  return error?.code === 'FileNotFound' || error?.code === 'ENOENT';
}

function sameLinkedScript(left, right) {
  if (!left || !right) return left === right;
  return left.uri.toString() === right.uri.toString()
    && left.exists === right.exists
    && left.digest === right.digest;
}

function sameLinkedScripts(left, right) {
  if ((left?.length ?? 0) !== (right?.length ?? 0)) return false;
  const rightByUri = new Map((right ?? []).map((item) => [item.uri.toString(), item]));
  return (left ?? []).every((item) => sameLinkedScript(item, rightByUri.get(item.uri.toString())));
}

module.exports = { FluigProcessEditorProvider };
