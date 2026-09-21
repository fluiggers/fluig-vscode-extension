'use strict';

const crypto = require('node:crypto');
const zlib = require('node:zlib');

const CATALOG_TTL_MS = 60_000;
const FIELD_CATALOG_TTL_MS = 10 * 60_000;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_FORMS = 10_000;
const PAGE_SIZE = 100;
const SOAP_NAMESPACE = 'http://ws.dm.webdesk.technology.datasul.com/';
const BUSINESS_PERIOD_SOAP_NAMESPACE = 'http://ws.foundation.webdesk.technology.datasul.com/';
const COLLEAGUE_SOAP_NAMESPACE = 'http://ws.foundation.ecm.technology.totvs.com/';
const WORKFLOW_ROLE_SOAP_NAMESPACE = 'http://ws.workflow.webdesk.technology.datasul.com/';
const WORKFLOW_ENGINE_SOAP_NAMESPACE = 'http://ws.workflow.ecm.technology.totvs.com/';
const GROUP_SOAP_NAMESPACE = 'http://ws.foundation.webdesk.technology.datasul.com/';
const MAX_USERS = 10_000;
const MAX_WORKFLOW_ROLES = 10_000;
const MAX_GROUPS = 10_000;
const MAX_PROCESSES = 10_000;
const MAX_GROUP_PAYLOAD_BYTES = 20 * 1024 * 1024;

class RemoteRequestError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'RemoteRequestError';
    this.status = status;
  }
}

function decryptFluiggersPassword(encrypted, machineId) {
  try {
    const encoded = String(encrypted ?? '').trim();
    if (!encoded || !machineId) throw new Error('missing credential');
    const payload = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    if (!/^[0-9a-f]{32}$/i.test(payload.iv ?? '')
      || !/^[0-9a-f]{32}$/i.test(payload.salt ?? '')
      || !/^(?:[0-9a-f]{2})+$/i.test(payload.text ?? '')) {
      throw new Error('invalid credential');
    }
    const key = crypto.scryptSync(machineId, Buffer.from(payload.salt, 'hex'), 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(payload.iv, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(payload.text, 'hex')),
      decipher.final()
    ]).toString('utf8');
  } catch {
    throw new Error('A credencial do servidor está ausente, inválida ou pertence a outra máquina.');
  }
}

function serverBaseUrl(server) {
  const configuredHost = String(server?.host ?? '').trim();
  if (!configuredHost) throw new Error('O servidor selecionado não possui host configurado.');
  let url;
  if (/^https?:\/\//i.test(configuredHost)) {
    url = new URL(configuredHost);
  } else {
    url = new URL(`${server?.ssl ? 'https' : 'http'}://${configuredHost}`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('O protocolo do servidor Fluig não é suportado.');
  const port = Number(server?.port ?? 0);
  if (port > 0 && port <= 65535 && !url.port && !([80, 443].includes(port))) url.port = String(port);
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function responseSetCookies(headers) {
  const values = typeof headers?.getSetCookie === 'function'
    ? headers.getSetCookie()
    : [headers?.get?.('set-cookie') ?? ''];
  const cookies = [];
  for (const value of values) {
    const source = String(value ?? '');
    const pattern = /(?:^|,\s*)(JSESSIONIDSSO|jwt\.token|JSESSIONID)=([^;,]+)/gi;
    let match;
    while ((match = pattern.exec(source))) cookies.push(`${match[1]}=${match[2]}`);
  }
  return [...new Set(cookies)].join('; ');
}

async function fetchWithTimeout(fetchImpl, url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('A consulta ao Fluig excedeu o tempo limite.');
    throw new Error('Não foi possível conectar ao servidor Fluig.');
  } finally {
    clearTimeout(timer);
  }
}

async function authenticate(fetchImpl, server, machineId) {
  if (server?.hasBrowser) {
    throw new Error('Este servidor usa autenticação pelo navegador. Use uma conexão Fluiggers com usuário e senha ou informe o cardIndex manualmente.');
  }
  const username = String(server?.username ?? '').trim();
  if (!username) throw new Error('O servidor selecionado não possui usuário configurado.');
  const password = decryptFluiggersPassword(server?.password, machineId);
  const response = await fetchWithTimeout(
    fetchImpl,
    `${serverBaseUrl(server)}/portal/api/servlet/login.do`,
    {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ j_username: username, j_password: password }).toString()
    }
  );
  const cookies = responseSetCookies(response.headers);
  if (!response.ok && ![301, 302, 303, 307, 308].includes(response.status)) {
    throw new RemoteRequestError('O Fluig recusou a autenticação da conexão cadastrada.', response.status);
  }
  if (!cookies) throw new Error('O Fluig não retornou um cookie de sessão válido. Confira a conexão cadastrada.');
  return cookies;
}

async function getJson(fetchImpl, url, cookies) {
  const response = await fetchWithTimeout(fetchImpl, url, {
    method: 'GET',
    headers: { Accept: 'application/json', Cookie: cookies }
  });
  if (!response.ok) throw new RemoteRequestError(`Consulta de formulários recusada (HTTP ${response.status}).`, response.status);
  try {
    return await response.json();
  } catch {
    throw new Error('O servidor retornou uma resposta de formulários inválida.');
  }
}

function encodeXmlText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function decodeXmlText(value) {
  return String(value ?? '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');
}

function soapEnvelope(operation, fields, namespace = SOAP_NAMESPACE) {
  const values = Object.entries(fields)
    .map(([name, value]) => `<${name}>${encodeXmlText(value)}</${name}>`)
    .join('');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"',
    ` xmlns:ws="${namespace}">`,
    '<soapenv:Header/>',
    `<soapenv:Body><ws:${operation}>${values}</ws:${operation}></soapenv:Body>`,
    '</soapenv:Envelope>'
  ].join('');
}

function soapTagValues(xml, tagName) {
  const pattern = new RegExp(`<(?:[A-Za-z_][\\w.-]*:)?${tagName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w.-]*:)?${tagName}>`, 'gi');
  return [...String(xml ?? '').matchAll(pattern)].map((match) => (
    decodeXmlText(match[1].replace(/<[^>]*>/g, '')).trim()
  ));
}

function soapFaultMessage(xml) {
  if (!/<(?:[A-Za-z_][\w.-]*:)?Fault\b/i.test(String(xml ?? ''))) return '';
  return soapTagValues(xml, 'faultstring')[0]
    || soapTagValues(xml, 'Text')[0]
    || 'O serviço SOAP do Fluig recusou a operação.';
}

async function postSoap(fetchImpl, url, operation, fields, namespace = SOAP_NAMESPACE) {
  const response = await fetchWithTimeout(fetchImpl, url, {
    method: 'POST',
    headers: {
      Accept: 'text/xml',
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: `"${operation}"`
    },
    body: soapEnvelope(operation, fields, namespace)
  });
  let body;
  try {
    body = await response.text();
  } catch {
    throw new Error('O servidor retornou uma resposta SOAP inválida.');
  }
  const fault = soapFaultMessage(body);
  if (!response.ok || fault) {
    throw new RemoteRequestError(`Consulta SOAP recusada${response.status ? ` (HTTP ${response.status})` : ''}.`, response.status);
  }
  return body;
}

async function requestSoapToken(fetchImpl, baseUrl, server, machineId) {
  if (server?.hasBrowser) {
    throw new Error('Este servidor usa autenticação pelo navegador. Use uma conexão Fluiggers com usuário e senha.');
  }
  const login = String(server?.username ?? '').trim();
  if (!login) throw new Error('O servidor selecionado não possui usuário configurado.');
  const password = decryptFluiggersPassword(server?.password, machineId);
  const xml = await postSoap(fetchImpl, `${baseUrl}/webdesk/TokenService`, 'getToken', { login, password });
  const token = soapTagValues(xml, 'result')[0] ?? '';
  if (!token || token.includes('UT010031')) throw new Error('O Fluig não retornou um token SOAP válido. Confira a conexão cadastrada.');
  return token;
}

function normalizeFormFields(values) {
  const fields = [];
  const seen = new Set();
  for (const value of values ?? []) {
    const field = String(value ?? '').trim();
    if (!field || seen.has(field)) continue;
    seen.add(field);
    fields.push(field);
  }
  return fields;
}

function normalizeProcessFormFieldList(values) {
  const source = Array.isArray(values) ? values : [];
  return normalizeFormFields(source.map((value) => {
    if (typeof value === 'string' || typeof value === 'number') return value;
    return value?.fieldName ?? value?.name ?? value?.id ?? value?.value ?? '';
  }));
}

function normalizeSubProcessFormFields(payload) {
  const content = payload?.content ?? payload ?? {};
  return {
    processFormId: String(content.processFormId ?? '').trim(),
    processFormFields: normalizeProcessFormFieldList(content.processFormFields),
    subProcessFormId: String(content.subProcessFormId ?? '').trim(),
    subProcessFormFields: normalizeProcessFormFieldList(content.subProcessFormFields)
  };
}

async function fetchRemoteSubProcessFormFields(fetchImpl, server, machineId, processFormId, subProcessId) {
  const parentId = Number.parseInt(String(processFormId ?? '0'), 10);
  if (!Number.isSafeInteger(parentId) || parentId < 0) {
    throw new Error('O codigo do formulario do processo pai e invalido.');
  }
  const childId = String(subProcessId ?? '').trim();
  if (!childId || childId.length > 300 || /[\u0000-\u001f]/.test(childId)) {
    throw new Error('Selecione um subprocesso valido para consultar seus campos.');
  }
  const baseUrl = serverBaseUrl(server);
  const cookies = await authenticate(fetchImpl, server, machineId);
  const payload = await getJson(
    fetchImpl,
    `${baseUrl}/ecm/api/rest/ecm/processform/listFields/${parentId}/${encodeURIComponent(childId)}`,
    cookies
  );
  return normalizeSubProcessFormFields(payload);
}

async function fetchRemoteFormFields(fetchImpl, server, machineId, documentId) {
  const normalizedDocumentId = Number.parseInt(String(documentId ?? ''), 10);
  if (!Number.isSafeInteger(normalizedDocumentId) || normalizedDocumentId <= 0) {
    throw new Error('Informe um código numérico de formulário válido.');
  }
  const companyId = Number.parseInt(String(server?.companyId ?? '1'), 10);
  if (!Number.isSafeInteger(companyId) || companyId <= 0) {
    throw new Error('A conexão Fluiggers não possui um companyId válido.');
  }
  const baseUrl = serverBaseUrl(server);
  const token = await requestSoapToken(fetchImpl, baseUrl, server, machineId);
  const xml = await postSoap(fetchImpl, `${baseUrl}/webdesk/CardIndexService`, 'getFormFields', {
    username: token,
    password: '',
    companyId,
    documentId: normalizedDocumentId
  });
  return normalizeFormFields(soapTagValues(xml, 'item'));
}

function normalizeBusinessPeriods(values) {
  return normalizeFormFields(values).map((periodId) => ({ value: periodId, label: periodId }));
}

function soapItemBlocks(xml) {
  const pattern = /<(?:[A-Za-z_][\w.-]*:)?item\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?item>/gi;
  return [...String(xml ?? '').matchAll(pattern)].map((match) => match[1]);
}

function normalizeAttributionMechanisms(xml) {
  const output = [];
  const seen = new Set();
  for (const item of soapItemBlocks(xml)) {
    const value = soapTagValues(item, 'attributionMecanismId')[0] ?? '';
    if (!value || seen.has(value)) continue;
    const label = soapTagValues(item, 'attributionMecanismDescription')[0]
      || soapTagValues(item, 'description')[0]
      || soapTagValues(item, 'name')[0]
      || value;
    seen.add(value);
    output.push({ value, label });
  }
  return output;
}

function normalizeVolumes(xml) {
  return normalizeFormFields(soapTagValues(xml, 'volumeId'))
    .map((volumeId) => ({ value: volumeId, label: volumeId }));
}

function normalizeColleagues(xml) {
  const output = [];
  const seen = new Set();
  for (const item of soapItemBlocks(xml)) {
    const value = soapTagValues(item, 'colleagueId')[0] ?? '';
    if (!value || seen.has(value)) continue;
    const name = soapTagValues(item, 'colleagueName')[0]
      || soapTagValues(item, 'login')[0]
      || value;
    seen.add(value);
    output.push({ value, label: name === value ? value : `${name} (${value})` });
    if (output.length >= MAX_USERS) break;
  }
  return output;
}

function normalizeWorkflowRoles(xml) {
  const output = [];
  const seen = new Set();
  for (const item of soapItemBlocks(xml)) {
    const value = soapTagValues(item, 'roleId')[0] ?? '';
    if (!value || seen.has(value)) continue;
    const description = soapTagValues(item, 'roleDescription')[0]
      || soapTagValues(item, 'description')[0]
      || value;
    seen.add(value);
    output.push({ value, label: description === value ? value : `${description} (${value})` });
    if (output.length >= MAX_WORKFLOW_ROLES) break;
  }
  return output;
}

function normalizeWorkflowProcesses(xml) {
  const output = [];
  const seen = new Set();
  for (const item of soapItemBlocks(xml)) {
    const value = soapTagValues(item, 'processId')[0] ?? '';
    if (!value || seen.has(value)) continue;
    const description = soapTagValues(item, 'processDescription')[0] || value;
    const active = (soapTagValues(item, 'active')[0] ?? 'true').toLowerCase() !== 'false';
    if (!active) continue;
    seen.add(value);
    output.push({ value, label: description === value ? value : `${description} (${value})` });
    if (output.length >= MAX_PROCESSES) break;
  }
  return output;
}

function decodeCompressedGroups(encoded) {
  const base64 = String(encoded ?? '').replace(/\s+/g, '');
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new Error('O GroupService retornou um catálogo compactado inválido.');
  }
  let serialized;
  try {
    serialized = zlib.gunzipSync(Buffer.from(base64, 'base64'), { maxOutputLength: MAX_GROUP_PAYLOAD_BYTES });
  } catch {
    throw new Error('Não foi possível descompactar o catálogo de grupos retornado pelo Fluig.');
  }
  if (serialized.length < 16 || serialized.readUInt32BE(0) !== 0xaced0005) {
    throw new Error('O catálogo de grupos não usa a serialização Java esperada.');
  }
  const className = Buffer.from('java.util.HashMap', 'utf8');
  const classOffset = serialized.indexOf(className);
  let offset = serialized.indexOf(Buffer.from([0x77, 0x08]), classOffset + className.length);
  if (classOffset < 0 || offset < 0) {
    throw new Error('O catálogo de grupos não contém os mapas esperados.');
  }

  let nextHandle = 0x7e0002;
  const handles = new Map();
  const groups = [];
  const readValue = () => {
    if (offset >= serialized.length) throw new Error('Catálogo de grupos truncado.');
    const token = serialized[offset++];
    if (token === 0x70) return '';
    if (token === 0x71) {
      if (offset + 4 > serialized.length) throw new Error('Referência truncada no catálogo de grupos.');
      const handle = serialized.readUInt32BE(offset);
      offset += 4;
      if (!handles.has(handle)) throw new Error('Referência desconhecida no catálogo de grupos.');
      return handles.get(handle);
    }
    let size;
    if (token === 0x74) {
      if (offset + 2 > serialized.length) throw new Error('Texto truncado no catálogo de grupos.');
      size = serialized.readUInt16BE(offset);
      offset += 2;
    } else if (token === 0x7c) {
      if (offset + 8 > serialized.length) throw new Error('Texto longo truncado no catálogo de grupos.');
      const longSize = serialized.readBigUInt64BE(offset);
      offset += 8;
      if (longSize > BigInt(MAX_GROUP_PAYLOAD_BYTES)) throw new Error('Texto excessivo no catálogo de grupos.');
      size = Number(longSize);
    } else {
      throw new Error('O catálogo de grupos contém um tipo Java não suportado.');
    }
    if (offset + size > serialized.length) throw new Error('Texto truncado no catálogo de grupos.');
    const value = serialized.subarray(offset, offset + size).toString('utf8');
    offset += size;
    handles.set(nextHandle++, value);
    return value;
  };

  while (offset < serialized.length) {
    if (serialized[offset] !== 0x77 || serialized[offset + 1] !== 0x08) {
      throw new Error('Bloco inválido no catálogo de grupos.');
    }
    offset += 2;
    if (offset + 8 > serialized.length) throw new Error('Bloco truncado no catálogo de grupos.');
    offset += 4; // capacidade interna do HashMap
    const pairCount = serialized.readInt32BE(offset);
    offset += 4;
    if (pairCount < 0 || pairCount > 20) throw new Error('Mapa inválido no catálogo de grupos.');
    const item = {};
    for (let index = 0; index < pairCount; index += 1) {
      const key = readValue();
      const value = readValue();
      if (key) item[key] = value;
    }
    if (serialized[offset++] !== 0x78) throw new Error('Mapa incompleto no catálogo de grupos.');
    const groupId = String(item.groupId ?? '').trim();
    const description = String(item.groupDescription ?? '').trim() || groupId;
    if (groupId) groups.push({ groupId, groupDescription: description });
    if (groups.length >= MAX_GROUPS || offset >= serialized.length) break;

    if (serialized[offset++] !== 0x73 || serialized[offset++] !== 0x71) {
      throw new Error('Objeto inválido no catálogo de grupos.');
    }
    if (offset + 12 > serialized.length || serialized.readUInt32BE(offset) !== 0x7e0000) {
      throw new Error('Classe inesperada no catálogo de grupos.');
    }
    offset += 4;
    nextHandle += 1; // novo objeto HashMap
    offset += 8; // loadFactor e threshold serializados pelo HashMap
  }
  return groups;
}

function normalizeGroups(groups) {
  const output = [];
  const seen = new Set();
  for (const group of groups ?? []) {
    const value = String(group?.groupId ?? '').trim();
    if (!value || seen.has(value)) continue;
    const description = String(group?.groupDescription ?? '').trim() || value;
    seen.add(value);
    output.push({ value, label: description === value ? value : `${description} (${value})` });
    if (output.length >= MAX_GROUPS) break;
  }
  return output;
}

async function fetchRemoteUsers(fetchImpl, server, machineId) {
  const companyId = Number.parseInt(String(server?.companyId ?? '1'), 10);
  if (!Number.isSafeInteger(companyId) || companyId <= 0) {
    throw new Error('A conexão Fluiggers não possui um companyId válido.');
  }
  const baseUrl = serverBaseUrl(server);
  const token = await requestSoapToken(fetchImpl, baseUrl, server, machineId);
  const xml = await postSoap(
    fetchImpl,
    `${baseUrl}/webdesk/ECMColleagueService`,
    'getColleagues',
    { username: token, password: '', companyId },
    COLLEAGUE_SOAP_NAMESPACE
  );
  return normalizeColleagues(xml);
}

async function fetchRemoteWorkflowRoles(fetchImpl, server, machineId) {
  const companyId = Number.parseInt(String(server?.companyId ?? '1'), 10);
  if (!Number.isSafeInteger(companyId) || companyId <= 0) {
    throw new Error('A conexÃ£o Fluiggers nÃ£o possui um companyId vÃ¡lido.');
  }
  const baseUrl = serverBaseUrl(server);
  const token = await requestSoapToken(fetchImpl, baseUrl, server, machineId);
  const xml = await postSoap(
    fetchImpl,
    `${baseUrl}/webdesk/WorkflowRoleService`,
    'getWorkflowRoles',
    { username: token, password: '', companyId },
    WORKFLOW_ROLE_SOAP_NAMESPACE
  );
  return normalizeWorkflowRoles(xml);
}

async function fetchRemoteWorkflowProcesses(fetchImpl, server, machineId) {
  const companyId = Number.parseInt(String(server?.companyId ?? '1'), 10);
  if (!Number.isSafeInteger(companyId) || companyId <= 0) {
    throw new Error('A conexão Fluiggers não possui um companyId válido.');
  }
  const baseUrl = serverBaseUrl(server);
  const token = await requestSoapToken(fetchImpl, baseUrl, server, machineId);
  const xml = await postSoap(
    fetchImpl,
    `${baseUrl}/webdesk/ECMWorkflowEngineService`,
    'getAllProcessAvailableToExport',
    { username: token, password: '', companyId },
    WORKFLOW_ENGINE_SOAP_NAMESPACE
  );
  return normalizeWorkflowProcesses(xml);
}

async function fetchRemoteGroups(fetchImpl, server, machineId) {
  const companyId = Number.parseInt(String(server?.companyId ?? '1'), 10);
  if (!Number.isSafeInteger(companyId) || companyId <= 0) {
    throw new Error('A conexão Fluiggers não possui um companyId válido.');
  }
  const baseUrl = serverBaseUrl(server);
  const token = await requestSoapToken(fetchImpl, baseUrl, server, machineId);
  const xml = await postSoap(
    fetchImpl,
    `${baseUrl}/webdesk/GroupService`,
    'getGroupsCompressedData',
    { username: token, password: '', companyId },
    GROUP_SOAP_NAMESPACE
  );
  const encoded = soapTagValues(xml, 'result')[0] ?? '';
  return normalizeGroups(decodeCompressedGroups(encoded));
}

async function fetchRemoteBusinessPeriods(fetchImpl, server, machineId) {
  const companyId = Number.parseInt(String(server?.companyId ?? '1'), 10);
  if (!Number.isSafeInteger(companyId) || companyId <= 0) {
    throw new Error('A conexão Fluiggers não possui um companyId válido.');
  }
  const baseUrl = serverBaseUrl(server);
  const token = await requestSoapToken(fetchImpl, baseUrl, server, machineId);
  const xml = await postSoap(
    fetchImpl,
    `${baseUrl}/webdesk/BusinessPeriodService`,
    'getBusinessPeriods',
    { username: token, password: '', companyId },
    BUSINESS_PERIOD_SOAP_NAMESPACE
  );
  return normalizeBusinessPeriods(soapTagValues(xml, 'periodId'));
}

async function fetchRemoteDesignCatalogs(fetchImpl, server, machineId) {
  const companyId = Number.parseInt(String(server?.companyId ?? '1'), 10);
  if (!Number.isSafeInteger(companyId) || companyId <= 0) {
    throw new Error('A conexão Fluiggers não possui um companyId válido.');
  }
  const baseUrl = serverBaseUrl(server);
  const token = await requestSoapToken(fetchImpl, baseUrl, server, machineId);
  const fields = { username: token, password: '', companyId };
  const [mechanismXml, volumeXml] = await Promise.all([
    postSoap(
      fetchImpl,
      `${baseUrl}/webdesk/AttributionMecanismService`,
      'getAttributionMecanism',
      fields,
      BUSINESS_PERIOD_SOAP_NAMESPACE
    ),
    postSoap(
      fetchImpl,
      `${baseUrl}/webdesk/GlobalParamService`,
      'getVolumes',
      fields,
      BUSINESS_PERIOD_SOAP_NAMESPACE
    )
  ]);
  return {
    mechanisms: normalizeAttributionMechanisms(mechanismXml),
    volumes: normalizeVolumes(volumeXml)
  };
}

function normalizeForm(item) {
  const documentId = String(item?.documentId ?? item?.id ?? '').trim();
  if (!/^\d+$/.test(documentId)) return null;
  return {
    documentId,
    documentDescription: String(item?.documentDescription ?? item?.description ?? '').trim(),
    datasetName: String(item?.datasetName ?? '').trim(),
    version: String(item?.version ?? '').trim()
  };
}

function uniqueForms(items) {
  const output = [];
  const seen = new Set();
  for (const item of items ?? []) {
    const form = normalizeForm(item);
    if (!form || seen.has(form.documentId)) continue;
    seen.add(form.documentId);
    output.push(form);
  }
  return output;
}

function envelopePage(payload) {
  if (Array.isArray(payload)) return { items: payload, hasNext: false };
  const content = payload?.content;
  const items = Array.isArray(content)
    ? content
    : Array.isArray(content?.items)
      ? content.items
      : Array.isArray(payload?.items)
        ? payload.items
        : null;
  if (!items) throw new Error('O catálogo remoto não contém uma lista de formulários reconhecível.');
  const hasNext = Boolean(payload?.hasNext ?? content?.hasNext ?? false);
  const totalPages = Number(payload?.totalPages ?? content?.totalPages ?? 0);
  return { items, hasNext, totalPages };
}

async function fetchStudioForms(fetchImpl, baseUrl, cookies) {
  const payload = await getJson(
    fetchImpl,
    `${baseUrl}/ecm/api/rest/ecm/cardIndexPublisher/getFormsList/`,
    cookies
  );
  return uniqueForms(envelopePage(payload).items);
}

async function fetchV2Forms(fetchImpl, baseUrl, cookies) {
  const collected = [];
  for (let page = 1; page <= Math.ceil(MAX_FORMS / PAGE_SIZE); page += 1) {
    const url = new URL(`${baseUrl}/ecm-forms/api/v2/cardindex`);
    url.searchParams.set('page', String(page));
    url.searchParams.set('pageSize', String(PAGE_SIZE));
    const envelope = envelopePage(await getJson(fetchImpl, url.toString(), cookies));
    collected.push(...envelope.items);
    if (collected.length >= MAX_FORMS) break;
    const moreByTotal = envelope.totalPages > 0 && page < envelope.totalPages;
    if (!envelope.hasNext && !moreByTotal) break;
  }
  return uniqueForms(collected.slice(0, MAX_FORMS));
}

async function fetchRemoteForms(fetchImpl, server, machineId) {
  const baseUrl = serverBaseUrl(server);
  const cookies = await authenticate(fetchImpl, server, machineId);
  try {
    return await fetchStudioForms(fetchImpl, baseUrl, cookies);
  } catch (studioError) {
    try {
      return await fetchV2Forms(fetchImpl, baseUrl, cookies);
    } catch (v2Error) {
      const studioStatus = studioError?.status ? `HTTP ${studioError.status}` : 'resposta incompatível';
      const v2Status = v2Error?.status ? `HTTP ${v2Error.status}` : 'resposta incompatível';
      throw new Error(`Não foi possível listar formulários pela rota do Studio (${studioStatus}) nem pela API v2 (${v2Status}).`);
    }
  }
}

class RemoteFormCatalogService {
  constructor(fetchImpl = globalThis.fetch, now = Date.now) {
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.cache = new Map();
    this.fieldCache = new Map();
    this.businessPeriodCache = new Map();
    this.designCatalogCache = new Map();
    this.userCatalogCache = new Map();
    this.workflowRoleCatalogCache = new Map();
    this.groupCatalogCache = new Map();
    this.workflowProcessCatalogCache = new Map();
    this.subProcessFormFieldCache = new Map();
  }

  async list(server, machineId) {
    if (typeof this.fetchImpl !== 'function') throw new Error('Esta versão do editor não possui cliente HTTP disponível.');
    const cacheKey = [server?.id, server?.host, server?.port, server?.username].map((value) => String(value ?? '')).join('|');
    const cached = this.cache.get(cacheKey);
    if (cached && this.now() - cached.timestamp < CATALOG_TTL_MS) return cached.forms;
    const forms = await fetchRemoteForms(this.fetchImpl, server, machineId);
    this.cache.set(cacheKey, { timestamp: this.now(), forms });
    return forms;
  }

  async fields(server, machineId, documentId) {
    if (typeof this.fetchImpl !== 'function') throw new Error('Esta versão do editor não possui cliente HTTP disponível.');
    const normalizedDocumentId = String(documentId ?? '').trim();
    const cacheKey = [server?.id, server?.host, server?.port, server?.username, normalizedDocumentId]
      .map((value) => String(value ?? '')).join('|');
    const cached = this.fieldCache.get(cacheKey);
    if (cached && this.now() - cached.timestamp < FIELD_CATALOG_TTL_MS) return cached.fields;
    const fields = await fetchRemoteFormFields(this.fetchImpl, server, machineId, normalizedDocumentId);
    this.fieldCache.set(cacheKey, { timestamp: this.now(), fields });
    return fields;
  }

  cachedFields(server, documentId) {
    const normalizedDocumentId = String(documentId ?? '').trim();
    const cacheKey = [server?.id, server?.host, server?.port, server?.username, normalizedDocumentId]
      .map((value) => String(value ?? '')).join('|');
    const cached = this.fieldCache.get(cacheKey);
    return cached && this.now() - cached.timestamp < FIELD_CATALOG_TTL_MS ? cached.fields : [];
  }

  async businessPeriods(server, machineId, options = {}) {
    if (typeof this.fetchImpl !== 'function') throw new Error('Esta versão do editor não possui cliente HTTP disponível.');
    const cacheKey = [server?.id, server?.host, server?.port, server?.username, server?.companyId]
      .map((value) => String(value ?? '')).join('|');
    const cached = this.businessPeriodCache.get(cacheKey);
    if (!options.forceRefresh && cached && this.now() - cached.timestamp < FIELD_CATALOG_TTL_MS) return cached.periods;
    const periods = await fetchRemoteBusinessPeriods(this.fetchImpl, server, machineId);
    this.businessPeriodCache.set(cacheKey, { timestamp: this.now(), periods });
    return periods;
  }

  cachedBusinessPeriods(server) {
    const cacheKey = [server?.id, server?.host, server?.port, server?.username, server?.companyId]
      .map((value) => String(value ?? '')).join('|');
    const cached = this.businessPeriodCache.get(cacheKey);
    return cached && this.now() - cached.timestamp < FIELD_CATALOG_TTL_MS ? cached.periods : [];
  }

  async designCatalogs(server, machineId, options = {}) {
    if (typeof this.fetchImpl !== 'function') throw new Error('Esta versão do editor não possui cliente HTTP disponível.');
    const cacheKey = [server?.id, server?.host, server?.port, server?.username, server?.companyId]
      .map((value) => String(value ?? '')).join('|');
    const cached = this.designCatalogCache.get(cacheKey);
    if (!options.forceRefresh && cached && this.now() - cached.timestamp < FIELD_CATALOG_TTL_MS) return cached.catalogs;
    const catalogs = await fetchRemoteDesignCatalogs(this.fetchImpl, server, machineId);
    this.designCatalogCache.set(cacheKey, { timestamp: this.now(), catalogs });
    return catalogs;
  }

  cachedAttributionMechanisms(server) {
    return this.cachedDesignCatalogs(server).mechanisms;
  }

  cachedVolumes(server) {
    return this.cachedDesignCatalogs(server).volumes;
  }

  cachedDesignCatalogs(server) {
    const cacheKey = [server?.id, server?.host, server?.port, server?.username, server?.companyId]
      .map((value) => String(value ?? '')).join('|');
    const cached = this.designCatalogCache.get(cacheKey);
    return cached && this.now() - cached.timestamp < FIELD_CATALOG_TTL_MS
      ? cached.catalogs
      : { mechanisms: [], volumes: [] };
  }

  async users(server, machineId) {
    if (typeof this.fetchImpl !== 'function') throw new Error('Esta versão do editor não possui cliente HTTP disponível.');
    const cacheKey = [server?.id, server?.host, server?.port, server?.username, server?.companyId]
      .map((value) => String(value ?? '')).join('|');
    const cached = this.userCatalogCache.get(cacheKey);
    if (cached && this.now() - cached.timestamp < FIELD_CATALOG_TTL_MS) return cached.users;
    const users = await fetchRemoteUsers(this.fetchImpl, server, machineId);
    this.userCatalogCache.set(cacheKey, { timestamp: this.now(), users });
    return users;
  }

  cachedUsers(server) {
    const cacheKey = [server?.id, server?.host, server?.port, server?.username, server?.companyId]
      .map((value) => String(value ?? '')).join('|');
    const cached = this.userCatalogCache.get(cacheKey);
    return cached && this.now() - cached.timestamp < FIELD_CATALOG_TTL_MS ? cached.users : [];
  }

  async workflowRoles(server, machineId) {
    if (typeof this.fetchImpl !== 'function') throw new Error('Esta versÃ£o do editor nÃ£o possui cliente HTTP disponÃ­vel.');
    const cacheKey = [server?.id, server?.host, server?.port, server?.username, server?.companyId]
      .map((value) => String(value ?? '')).join('|');
    const cached = this.workflowRoleCatalogCache.get(cacheKey);
    if (cached && this.now() - cached.timestamp < FIELD_CATALOG_TTL_MS) return cached.roles;
    const roles = await fetchRemoteWorkflowRoles(this.fetchImpl, server, machineId);
    this.workflowRoleCatalogCache.set(cacheKey, { timestamp: this.now(), roles });
    return roles;
  }

  cachedWorkflowRoles(server) {
    const cacheKey = [server?.id, server?.host, server?.port, server?.username, server?.companyId]
      .map((value) => String(value ?? '')).join('|');
    const cached = this.workflowRoleCatalogCache.get(cacheKey);
    return cached && this.now() - cached.timestamp < FIELD_CATALOG_TTL_MS ? cached.roles : [];
  }

  async groups(server, machineId) {
    if (typeof this.fetchImpl !== 'function') throw new Error('Esta versão do editor não possui cliente HTTP disponível.');
    const cacheKey = [server?.id, server?.host, server?.port, server?.username, server?.companyId]
      .map((value) => String(value ?? '')).join('|');
    const cached = this.groupCatalogCache.get(cacheKey);
    if (cached && this.now() - cached.timestamp < FIELD_CATALOG_TTL_MS) return cached.groups;
    const groups = await fetchRemoteGroups(this.fetchImpl, server, machineId);
    this.groupCatalogCache.set(cacheKey, { timestamp: this.now(), groups });
    return groups;
  }

  cachedGroups(server) {
    const cacheKey = [server?.id, server?.host, server?.port, server?.username, server?.companyId]
      .map((value) => String(value ?? '')).join('|');
    const cached = this.groupCatalogCache.get(cacheKey);
    return cached && this.now() - cached.timestamp < FIELD_CATALOG_TTL_MS ? cached.groups : [];
  }

  async workflowProcesses(server, machineId) {
    if (typeof this.fetchImpl !== 'function') throw new Error('Esta versão do editor não possui cliente HTTP disponível.');
    const cacheKey = [server?.id, server?.host, server?.port, server?.username, server?.companyId]
      .map((value) => String(value ?? '')).join('|');
    const cached = this.workflowProcessCatalogCache.get(cacheKey);
    if (cached && this.now() - cached.timestamp < FIELD_CATALOG_TTL_MS) return cached.processes;
    const processes = await fetchRemoteWorkflowProcesses(this.fetchImpl, server, machineId);
    this.workflowProcessCatalogCache.set(cacheKey, { timestamp: this.now(), processes });
    return processes;
  }

  cachedWorkflowProcesses(server) {
    const cacheKey = [server?.id, server?.host, server?.port, server?.username, server?.companyId]
      .map((value) => String(value ?? '')).join('|');
    const cached = this.workflowProcessCatalogCache.get(cacheKey);
    return cached && this.now() - cached.timestamp < FIELD_CATALOG_TTL_MS ? cached.processes : [];
  }

  async subProcessFormFields(server, machineId, processFormId, subProcessId) {
    if (typeof this.fetchImpl !== 'function') throw new Error('Esta versao do editor nao possui cliente HTTP disponivel.');
    const cacheKey = [server?.id, server?.host, server?.port, server?.username, processFormId, subProcessId]
      .map((value) => String(value ?? '')).join('|');
    const cached = this.subProcessFormFieldCache.get(cacheKey);
    if (cached && this.now() - cached.timestamp < FIELD_CATALOG_TTL_MS) return cached.catalog;
    const catalog = await fetchRemoteSubProcessFormFields(
      this.fetchImpl,
      server,
      machineId,
      processFormId,
      subProcessId
    );
    this.subProcessFormFieldCache.set(cacheKey, { timestamp: this.now(), catalog });
    return catalog;
  }

  cachedSubProcessFormFields(server, processFormId, subProcessId) {
    const cacheKey = [server?.id, server?.host, server?.port, server?.username, processFormId, subProcessId]
      .map((value) => String(value ?? '')).join('|');
    const cached = this.subProcessFormFieldCache.get(cacheKey);
    return cached && this.now() - cached.timestamp < FIELD_CATALOG_TTL_MS ? cached.catalog : null;
  }
}

module.exports = {
  RemoteFormCatalogService,
  decryptFluiggersPassword,
  decodeCompressedGroups,
  envelopePage,
  fetchRemoteBusinessPeriods,
  fetchRemoteDesignCatalogs,
  fetchRemoteFormFields,
  fetchRemoteSubProcessFormFields,
  fetchRemoteForms,
  fetchRemoteGroups,
  fetchRemoteUsers,
  fetchRemoteWorkflowRoles,
  fetchRemoteWorkflowProcesses,
  normalizeForm,
  normalizeBusinessPeriods,
  normalizeAttributionMechanisms,
  normalizeFormFields,
  normalizeSubProcessFormFields,
  normalizeColleagues,
  normalizeGroups,
  normalizeWorkflowRoles,
  normalizeWorkflowProcesses,
  normalizeVolumes,
  postSoap,
  responseSetCookies,
  serverBaseUrl,
  soapEnvelope,
  soapItemBlocks,
  soapTagValues,
  uniqueForms
};
