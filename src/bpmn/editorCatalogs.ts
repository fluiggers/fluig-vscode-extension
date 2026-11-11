'use strict';

const { discoverFormFields, discoverLocalFormCatalog } = require('./formFields');
const { discoverExpedientCatalog } = require('./expedientCatalog');
const { discoverVolumeCatalog } = require('./volumeCatalog');
const { discoverServerCatalog, resolveCatalogServerConfiguration, resolveServerConfiguration } = require('./serverCatalog');
const { discoverMechanismCatalog } = require('./mechanismCatalog');
const { discoverUserCatalog } = require('./userCatalog');

/**
 * Catálogos que alimentam o painel de propriedades. Usa só o subconjunto da API do VS Code recebido
 * em `vscode` (workspace.fs, Uri, env.machineId), então também roda fora do editor.
 */
class EditorCatalogs {
  /**
   * @param {typeof import('vscode')} vscode
   * @param {import('./remoteFormCatalog').RemoteFormCatalogService} remoteFormCatalog
   */
  constructor(vscode, remoteFormCatalog) {
    this.vscode = vscode;
    this.remoteFormCatalog = remoteFormCatalog;
  }

  /** Mesmas opções que `toWebviewData` recebe ao montar o modelo do editor. */
  async all(uri, model) {
    const [formFields, localFormCatalog, mechanismCatalog, userCatalog, roleCatalog, groupCatalog, processCatalog, expedientCatalog, volumeCatalog, serverCatalog] = await Promise.all([
      this.formFields(uri, model),
      discoverLocalFormCatalog(this.vscode, uri),
      this.mechanisms(uri, model),
      this.users(uri, model),
      this.roles(uri, model),
      this.groups(uri, model),
      this.processes(uri, model),
      this.expedients(uri, model),
      this.volumes(uri, model),
      discoverServerCatalog(this.vscode, uri)
    ]);
    const subProcessFormFieldCatalogs = await this.subProcessFormFields(uri, model, formFields);
    return {
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
      serverCatalog
    };
  }

  async formFields(uri, model) {
    const localFields = await discoverFormFields(this.vscode, uri, model);
    const process = model.process;
    if (!process || String(process.attributes?.formSource ?? 'local').toLowerCase() !== 'server') return localFields;
    const serverId = String(process.attributes?.serverId ?? '').trim();
    const documentId = String(process.attributes?.cardIndex ?? '').trim();
    if (!serverId || !documentId) return [];
    const server = await resolveServerConfiguration(this.vscode, uri, serverId);
    return server ? this.remoteFormCatalog.cachedFields(server, documentId) : [];
  }

  async expedients(uri, model, requestedServerId = '') {
    const localCatalog = await discoverExpedientCatalog(this.vscode, uri);
    const server = await this.configuredServer(uri, model, requestedServerId);
    if (!server) return localCatalog;
    const remoteCatalog = this.remoteFormCatalog.cachedBusinessPeriods(server);
    return remoteCatalog.length ? remoteCatalog : localCatalog;
  }

  async mechanisms(uri, model, requestedServerId = '') {
    const localCatalog = await discoverMechanismCatalog(this.vscode, uri);
    const server = await this.configuredServer(uri, model, requestedServerId);
    if (!server) return localCatalog;
    const remoteCatalog = this.remoteFormCatalog.cachedAttributionMechanisms(server);
    return remoteCatalog.length ? remoteCatalog : localCatalog;
  }

  async volumes(uri, model, requestedServerId = '') {
    const localCatalog = await discoverVolumeCatalog(this.vscode, uri);
    const server = await this.configuredServer(uri, model, requestedServerId);
    if (!server) return localCatalog;
    const remoteCatalog = this.remoteFormCatalog.cachedVolumes(server);
    return remoteCatalog.length ? remoteCatalog : localCatalog;
  }

  async users(uri, model, requestedServerId = '') {
    const localCatalog = await discoverUserCatalog(this.vscode, uri);
    const server = await this.catalogServer(uri, model, requestedServerId);
    if (!server) return localCatalog;
    const cached = this.remoteFormCatalog.cachedUsers(server);
    if (cached.length) return cached;
    try {
      const remoteCatalog = await this.remoteFormCatalog.users(server, this.vscode.env.machineId);
      return remoteCatalog.length ? remoteCatalog : localCatalog;
    } catch {
      return localCatalog;
    }
  }

  async roles(uri, model, requestedServerId = '') {
    const server = await this.catalogServer(uri, model, requestedServerId);
    if (!server) return [];
    const cached = this.remoteFormCatalog.cachedWorkflowRoles(server);
    if (cached.length) return cached;
    try {
      return await this.remoteFormCatalog.workflowRoles(server, this.vscode.env.machineId);
    } catch {
      return [];
    }
  }

  async groups(uri, model, requestedServerId = '') {
    const server = await this.catalogServer(uri, model, requestedServerId);
    if (!server) return [];
    const cached = this.remoteFormCatalog.cachedGroups(server);
    if (cached.length) return cached;
    try {
      return await this.remoteFormCatalog.groups(server, this.vscode.env.machineId);
    } catch {
      return [];
    }
  }

  async processes(uri, model, requestedServerId = '') {
    const server = await this.configuredServer(uri, model, requestedServerId);
    if (!server) return [];
    const cached = this.remoteFormCatalog.cachedWorkflowProcesses(server);
    if (cached.length) return cached;
    try {
      return await this.remoteFormCatalog.workflowProcesses(server, this.vscode.env.machineId);
    } catch {
      return [];
    }
  }

  async subProcessFormFields(uri, model, parentFields = []) {
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
    const server = await resolveServerConfiguration(this.vscode, uri, serverId);
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
            this.vscode.env.machineId,
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

  /** Servidor gravado no processo (ou o solicitado); sem um deles não há consulta. */
  async configuredServer(uri, model, requestedServerId) {
    const serverId = String(requestedServerId || model.process?.attributes?.serverId || '').trim();
    return serverId ? resolveServerConfiguration(this.vscode, uri, serverId) : null;
  }

  /** Como `configuredServer`, mas um processo novo sem serverId usa o único servidor configurado. */
  async catalogServer(uri, model, requestedServerId) {
    const serverId = String(requestedServerId || model.process?.attributes?.serverId || '').trim();
    return resolveCatalogServerConfiguration(this.vscode, uri, serverId);
  }
}

module.exports = { EditorCatalogs };
