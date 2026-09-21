'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const {
  RemoteFormCatalogService,
  decodeCompressedGroups,
  decryptFluiggersPassword,
  fetchRemoteBusinessPeriods,
  fetchRemoteDesignCatalogs,
  fetchRemoteFormFields,
  fetchRemoteSubProcessFormFields,
  fetchRemoteForms,
  fetchRemoteGroups,
  fetchRemoteUsers,
  fetchRemoteWorkflowRoles,
  fetchRemoteWorkflowProcesses,
  responseSetCookies,
  serverBaseUrl,
  soapEnvelope,
  soapTagValues
} = require('../../src/bpmn/remoteFormCatalog');

function encryptPassword(password, machineId) {
  const iv = Buffer.alloc(16, 1);
  const salt = Buffer.alloc(16, 2);
  const key = crypto.scryptSync(machineId, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const text = Buffer.concat([cipher.update(Buffer.from(password, 'utf8')), cipher.final()]);
  return Buffer.from(JSON.stringify({ iv: iv.toString('hex'), salt: salt.toString('hex'), text: text.toString('hex') })).toString('base64');
}

function response(status, body, setCookie = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name.toLowerCase() === 'set-cookie' ? setCookie : null },
    json: async () => body
  };
}

function soapResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => body
  };
}

function compressedGroupCatalog() {
  const chunks = [Buffer.from(
    'aced0005737200116a6176612e7574696c2e486173684d61700507dac1c31660d103000246000a6c6f6164466163746f724900097468726573686f6c6478703f4000000000000c',
    'hex'
  )];
  const stringToken = (value) => {
    const text = Buffer.from(value, 'utf8');
    const size = Buffer.alloc(2);
    size.writeUInt16BE(text.length);
    return Buffer.concat([Buffer.from([0x74]), size, text]);
  };
  chunks.push(
    Buffer.from('77080000001000000002', 'hex'),
    stringToken('groupDescription'),
    stringToken('Recursos Humanos'),
    stringToken('groupId'),
    stringToken('RH'),
    Buffer.from('787371007e00003f4000000000000c7708000000100000000271007e0002', 'hex'),
    stringToken('Tecnologia'),
    Buffer.from('71007e0004', 'hex'),
    stringToken('TI'),
    Buffer.from([0x78])
  );
  return zlib.gzipSync(Buffer.concat(chunks)).toString('base64');
}

function server(machineId) {
  return {
    id: 'future-id', name: 'Future', host: 'fluig.example.com', port: 11451, ssl: true,
    username: 'integracao', password: encryptPassword('senha&segura', machineId), hasBrowser: false
  };
}

test('decifra a senha Fluiggers e monta URL sem expor credenciais', () => {
  const machineId = 'machine-test';
  const configuration = server(machineId);
  assert.equal(decryptFluiggersPassword(configuration.password, machineId), 'senha&segura');
  assert.equal(serverBaseUrl(configuration), 'https://fluig.example.com:11451');
  assert.equal(responseSetCookies({ get: () => 'foo=1; Path=/, JSESSIONIDSSO=abc123; Path=/; HttpOnly' }), 'JSESSIONIDSSO=abc123');
});

test('consulta primeiro a mesma rota cardIndexPublisherRest usada pelo Eclipse', async () => {
  const machineId = 'machine-test';
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) return response(302, null, 'JSESSIONIDSSO=session; Path=/; HttpOnly');
    return response(200, { content: [
      { documentId: 100, documentDescription: 'Cadastro', datasetName: 'ds_cadastro', version: 3 },
      { documentId: 100, documentDescription: 'Duplicado' }
    ] });
  };
  const forms = await fetchRemoteForms(fetchImpl, server(machineId), machineId);
  assert.deepEqual(forms, [{ documentId: '100', documentDescription: 'Cadastro', datasetName: 'ds_cadastro', version: '3' }]);
  assert.match(calls[0].url, /portal\/api\/servlet\/login\.do$/);
  assert.equal(calls[0].options.body, 'j_username=integracao&j_password=senha%26segura');
  assert.match(calls[1].url, /ecm\/api\/rest\/ecm\/cardIndexPublisher\/getFormsList\/$/);
  assert.equal(calls[1].options.headers.Cookie, 'JSESSIONIDSSO=session');
});

test('consulta campos pai e filho pela rota processform usada pelo Eclipse', async () => {
  const machineId = 'machine-test';
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) return response(302, null, 'JSESSIONIDSSO=session; Path=/; HttpOnly');
    return response(200, { content: {
      processFormId: 0,
      processFormFields: ['paiA'],
      subProcessFormId: 100,
      subProcessFormFields: ['filhoA', { fieldName: 'filhoB' }]
    } });
  };
  const catalog = await fetchRemoteSubProcessFormFields(
    fetchImpl,
    server(machineId),
    machineId,
    0,
    'Dados Do Candidato'
  );
  assert.deepEqual(catalog, {
    processFormId: '0',
    processFormFields: ['paiA'],
    subProcessFormId: '100',
    subProcessFormFields: ['filhoA', 'filhoB']
  });
  assert.match(calls[1].url, /ecm\/api\/rest\/ecm\/processform\/listFields\/0\/Dados%20Do%20Candidato$/);
  assert.equal(calls[1].options.headers.Cookie, 'JSESSIONIDSSO=session');
});

test('usa a API v2 paginada quando a rota legada do Studio não está disponível', async () => {
  const machineId = 'machine-test';
  const calls = [];
  const fetchImpl = async (url) => {
    const value = String(url);
    calls.push(value);
    if (value.endsWith('/portal/api/servlet/login.do')) return response(200, null, 'jwt.token=token; Path=/');
    if (value.includes('/cardIndexPublisher/')) return response(404, {});
    const page = new URL(value).searchParams.get('page');
    return page === '1'
      ? response(200, { content: { items: [{ documentId: 10, documentDescription: 'A' }], hasNext: true } })
      : response(200, { content: { items: [{ documentId: 11, documentDescription: 'B' }], hasNext: false } });
  };
  const forms = await fetchRemoteForms(fetchImpl, server(machineId), machineId);
  assert.deepEqual(forms.map((form) => form.documentId), ['10', '11']);
  assert.equal(calls.filter((url) => url.includes('/ecm-forms/api/v2/cardindex')).length, 2);
});

test('mantém cache curto de formulários por conexão', async () => {
  const machineId = 'machine-test';
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    return String(url).endsWith('/portal/api/servlet/login.do')
      ? response(200, null, 'JSESSIONIDSSO=session; Path=/')
      : response(200, { content: [{ documentId: 9, documentDescription: 'Form' }] });
  };
  const service = new RemoteFormCatalogService(fetchImpl, () => 1_000);
  await service.list(server(machineId), machineId);
  await service.list(server(machineId), machineId);
  assert.equal(calls, 2);
});

test('recusa autenticação por navegador sem enviar segredo para a mensagem', async () => {
  const machineId = 'machine-test';
  await assert.rejects(
    fetchRemoteForms(async () => { throw new Error('não deveria chamar'); }, { ...server(machineId), hasBrowser: true }, machineId),
    /autenticação pelo navegador/
  );
});

test('consulta campos pela mesma sequência TokenService e CardIndexService do Eclipse', async () => {
  const machineId = 'machine-test';
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) {
      return soapResponse(200, [
        '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">',
        '<soapenv:Body><getTokenResponse><result>token-123</result></getTokenResponse></soapenv:Body>',
        '</soapenv:Envelope>'
      ].join(''));
    }
    return soapResponse(200, [
      '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">',
      '<soapenv:Body><getFormFieldsResponse><getFormFieldsReturn>',
      '<item>mensagem</item><item>para</item><item>resultadoEnvio</item><item>para</item><item></item>',
      '</getFormFieldsReturn></getFormFieldsResponse></soapenv:Body></soapenv:Envelope>'
    ].join(''));
  };
  const fields = await fetchRemoteFormFields(fetchImpl, { ...server(machineId), companyId: 1 }, machineId, 100);
  assert.deepEqual(fields, ['mensagem', 'para', 'resultadoEnvio']);
  assert.match(calls[0].url, /\/webdesk\/TokenService$/);
  assert.equal(calls[0].options.headers.SOAPAction, '"getToken"');
  assert.match(calls[0].options.body, /<login>integracao<\/login>/);
  assert.match(calls[0].options.body, /<password>senha&amp;segura<\/password>/);
  assert.match(calls[1].url, /\/webdesk\/CardIndexService$/);
  assert.equal(calls[1].options.headers.SOAPAction, '"getFormFields"');
  assert.match(calls[1].options.body, /<username>token-123<\/username>/);
  assert.match(calls[1].options.body, /<password><\/password>/);
  assert.match(calls[1].options.body, /<companyId>1<\/companyId>/);
  assert.match(calls[1].options.body, /<documentId>100<\/documentId>/);
});

test('escapa envelopes SOAP, interpreta arrays e mantém cache de campos por formulário', async () => {
  assert.match(soapEnvelope('teste', { valor: 'A&B<1>' }), /<valor>A&amp;B&lt;1&gt;<\/valor>/);
  assert.deepEqual(soapTagValues('<x:item>A&amp;B</x:item><item>C</item>', 'item'), ['A&B', 'C']);
  const machineId = 'machine-test';
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return calls % 2 === 1
      ? soapResponse(200, '<Envelope><Body><result>token-cache</result></Body></Envelope>')
      : soapResponse(200, '<Envelope><Body><item>campoA</item><item>campoB</item></Body></Envelope>');
  };
  const service = new RemoteFormCatalogService(fetchImpl, () => 1_000);
  assert.deepEqual(await service.fields(server(machineId), machineId, 100), ['campoA', 'campoB']);
  assert.deepEqual(await service.fields(server(machineId), machineId, 100), ['campoA', 'campoB']);
  assert.equal(calls, 2);
  assert.deepEqual(service.cachedFields(server(machineId), 100), ['campoA', 'campoB']);
});

test('consulta expedientes pelo BusinessPeriodService e extrai periodId sem duplicidade', async () => {
  const machineId = 'machine-test';
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return calls.length === 1
      ? soapResponse(200, '<Envelope><Body><result>period-token</result></Body></Envelope>')
      : soapResponse(200, [
        '<Envelope><Body><resultXML>',
        '<item><companyId>1</companyId><periodId>Default</periodId></item>',
        '<item><companyId>1</companyId><periodId>24x7</periodId></item>',
        '<item><companyId>1</companyId><periodId>Default</periodId></item>',
        '</resultXML></Body></Envelope>'
      ].join(''));
  };
  const periods = await fetchRemoteBusinessPeriods(
    fetchImpl,
    { ...server(machineId), companyId: 1 },
    machineId
  );
  assert.deepEqual(periods, [
    { value: 'Default', label: 'Default' },
    { value: '24x7', label: '24x7' }
  ]);
  assert.match(calls[1].url, /\/webdesk\/BusinessPeriodService$/);
  assert.equal(calls[1].options.headers.SOAPAction, '"getBusinessPeriods"');
  assert.match(calls[1].options.body, /xmlns:ws="http:\/\/ws\.foundation\.webdesk\.technology\.datasul\.com\/"/);
  assert.match(calls[1].options.body, /<username>period-token<\/username>/);
  assert.match(calls[1].options.body, /<password><\/password>/);
  assert.match(calls[1].options.body, /<companyId>1<\/companyId>/);
});

test('consulta subprocessos pelo ECMWorkflowEngineService e mantém apenas processos ativos', async () => {
  const machineId = 'machine-test';
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/TokenService')) {
      return soapResponse(200, '<Envelope><Body><result>workflow-token</result></Body></Envelope>');
    }
    return soapResponse(200, [
      '<Envelope><Body><result>',
      '<item><active>true</active><companyId>1</companyId><processDescription>Admissão</processDescription><processId>admissao</processId></item>',
      '<item><active>false</active><processDescription>Inativo</processDescription><processId>inativo</processId></item>',
      '<item><active>true</active><processDescription>Duplicado</processDescription><processId>admissao</processId></item>',
      '</result></Body></Envelope>'
    ].join(''));
  };
  const processes = await fetchRemoteWorkflowProcesses(fetchImpl, { ...server(machineId), companyId: 1 }, machineId);
  assert.deepEqual(processes, [{ value: 'admissao', label: 'Admissão (admissao)' }]);
  const call = calls.find((item) => item.url.endsWith('/ECMWorkflowEngineService'));
  assert.equal(call.options.headers.SOAPAction, '"getAllProcessAvailableToExport"');
  assert.match(call.options.body, /xmlns:ws="http:\/\/ws\.workflow\.ecm\.technology\.totvs\.com\/"/);
  assert.match(call.options.body, /<username>workflow-token<\/username>/);
  assert.match(call.options.body, /<companyId>1<\/companyId>/);
});

test('mantém cache de expedientes por servidor e empresa', async () => {
  const machineId = 'machine-test';
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return calls % 2 === 1
      ? soapResponse(200, '<Envelope><Body><result>period-token</result></Body></Envelope>')
      : soapResponse(200, '<Envelope><Body><periodId>Default</periodId></Body></Envelope>');
  };
  const service = new RemoteFormCatalogService(fetchImpl, () => 1_000);
  assert.deepEqual(await service.businessPeriods(server(machineId), machineId), [{ value: 'Default', label: 'Default' }]);
  assert.deepEqual(await service.businessPeriods(server(machineId), machineId), [{ value: 'Default', label: 'Default' }]);
  assert.equal(calls, 2);
  assert.deepEqual(service.cachedBusinessPeriods(server(machineId)), [{ value: 'Default', label: 'Default' }]);
});

test('busca manual de expedientes ignora o cache e publica o catálogo mais recente', async () => {
  const machineId = 'machine-test';
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1 || calls === 3) {
      return soapResponse(200, '<Envelope><Body><result>period-token</result></Body></Envelope>');
    }
    return calls === 2
      ? soapResponse(200, '<Envelope><Body><periodId>Default</periodId></Body></Envelope>')
      : soapResponse(200, '<Envelope><Body><periodId>Default</periodId><periodId>Comercial</periodId></Body></Envelope>');
  };
  const service = new RemoteFormCatalogService(fetchImpl, () => 1_000);
  assert.deepEqual(await service.businessPeriods(server(machineId), machineId), [
    { value: 'Default', label: 'Default' }
  ]);
  assert.deepEqual(await service.businessPeriods(server(machineId), machineId, { forceRefresh: true }), [
    { value: 'Default', label: 'Default' },
    { value: 'Comercial', label: 'Comercial' }
  ]);
  assert.equal(calls, 4);
  assert.deepEqual(service.cachedBusinessPeriods(server(machineId)), [
    { value: 'Default', label: 'Default' },
    { value: 'Comercial', label: 'Comercial' }
  ]);
});

test('consulta mecanismos e volumes pelas operações reais usadas pelo Eclipse', async () => {
  const machineId = 'machine-test';
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/TokenService')) {
      return soapResponse(200, '<Envelope><Body><result>catalog-token</result></Body></Envelope>');
    }
    if (String(url).endsWith('/AttributionMecanismService')) {
      return soapResponse(200, [
        '<Envelope><Body><resultXML>',
        '<item><attributionMecanismId>mecAprovador</attributionMecanismId>',
        '<attributionMecanismDescription>Busca aprovador</attributionMecanismDescription></item>',
        '<item><attributionMecanismId>mecSemDescricao</attributionMecanismId>',
        '<name>Mecanismo sem descrição</name></item>',
        '</resultXML></Body></Envelope>'
      ].join(''));
    }
    return soapResponse(200, [
      '<Envelope><Body><resultXML>',
      '<item><volumeId>Default</volumeId></item><item><volumeId>GED</volumeId></item>',
      '</resultXML></Body></Envelope>'
    ].join(''));
  };
  const catalogs = await fetchRemoteDesignCatalogs(
    fetchImpl,
    { ...server(machineId), companyId: 1 },
    machineId
  );
  assert.deepEqual(catalogs, {
    mechanisms: [
      { value: 'mecAprovador', label: 'Busca aprovador' },
      { value: 'mecSemDescricao', label: 'Mecanismo sem descrição' }
    ],
    volumes: [
      { value: 'Default', label: 'Default' },
      { value: 'GED', label: 'GED' }
    ]
  });
  const mechanismCall = calls.find((call) => call.url.endsWith('/AttributionMecanismService'));
  assert.equal(mechanismCall.options.headers.SOAPAction, '"getAttributionMecanism"');
  assert.match(mechanismCall.options.body, /<username>catalog-token<\/username>/);
  assert.match(mechanismCall.options.body, /<companyId>1<\/companyId>/);
  const volumeCall = calls.find((call) => call.url.endsWith('/GlobalParamService'));
  assert.equal(volumeCall.options.headers.SOAPAction, '"getVolumes"');
  assert.match(volumeCall.options.body, /<username>catalog-token<\/username>/);
});

test('consulta usuários ativos pelo ECMColleagueService e preserva matrícula e nome', async () => {
  const machineId = 'machine-test';
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/TokenService')) {
      return soapResponse(200, '<Envelope><Body><result>colleague-token</result></Body></Envelope>');
    }
    return soapResponse(200, [
      '<Envelope><Body><getColleaguesResponse><result>',
      '<item><colleagueId>daniel.sales</colleagueId><colleagueName>Daniel Sales</colleagueName></item>',
      '<item><colleagueId>suporte</colleagueId><colleagueName>Suporte Prime Club</colleagueName></item>',
      '<item><colleagueId>daniel.sales</colleagueId><colleagueName>Duplicado</colleagueName></item>',
      '</result></getColleaguesResponse></Body></Envelope>'
    ].join(''));
  };
  const users = await fetchRemoteUsers(fetchImpl, { ...server(machineId), companyId: 1 }, machineId);
  assert.deepEqual(users, [
    { value: 'daniel.sales', label: 'Daniel Sales (daniel.sales)' },
    { value: 'suporte', label: 'Suporte Prime Club (suporte)' }
  ]);
  const call = calls.find((item) => item.url.endsWith('/ECMColleagueService'));
  assert.equal(call.options.headers.SOAPAction, '"getColleagues"');
  assert.match(call.options.body, /xmlns:ws="http:\/\/ws\.foundation\.ecm\.technology\.totvs\.com\/"/);
  assert.match(call.options.body, /<username>colleague-token<\/username>/);
});

test('consulta papéis pelo WorkflowRoleService e preserva código e descrição', async () => {
  const machineId = 'machine-test';
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/TokenService')) {
      return soapResponse(200, '<Envelope><Body><result>role-token</result></Body></Envelope>');
    }
    return soapResponse(200, [
      '<Envelope><Body><getWorkflowRolesResponse><getWorkflowRolesResult>',
      '<item><roleDescription>Analista de Sistemas</roleDescription><roleId>analista_sistemas</roleId></item>',
      '<item><roleDescription>Auditor</roleDescription><roleId>Auditor</roleId></item>',
      '<item><roleDescription>Duplicado</roleDescription><roleId>analista_sistemas</roleId></item>',
      '</getWorkflowRolesResult></getWorkflowRolesResponse></Body></Envelope>'
    ].join(''));
  };
  const roles = await fetchRemoteWorkflowRoles(fetchImpl, { ...server(machineId), companyId: 1 }, machineId);
  assert.deepEqual(roles, [
    { value: 'analista_sistemas', label: 'Analista de Sistemas (analista_sistemas)' },
    { value: 'Auditor', label: 'Auditor' }
  ]);
  const call = calls.find((item) => item.url.endsWith('/WorkflowRoleService'));
  assert.equal(call.options.headers.SOAPAction, '"getWorkflowRoles"');
  assert.match(call.options.body, /xmlns:ws="http:\/\/ws\.workflow\.webdesk\.technology\.datasul\.com\/"/);
  assert.match(call.options.body, /<username>role-token<\/username>/);
  assert.match(call.options.body, /<companyId>1<\/companyId>/);
});

test('descompacta a serialização Java e consulta grupos pelo GroupService', async () => {
  const encoded = compressedGroupCatalog();
  assert.deepEqual(decodeCompressedGroups(encoded), [
    { groupId: 'RH', groupDescription: 'Recursos Humanos' },
    { groupId: 'TI', groupDescription: 'Tecnologia' }
  ]);
  const machineId = 'machine-test';
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/TokenService')) {
      return soapResponse(200, '<Envelope><Body><result>group-token</result></Body></Envelope>');
    }
    return soapResponse(200, `<Envelope><Body><getGroupsCompressedDataResponse><result>${encoded}</result></getGroupsCompressedDataResponse></Body></Envelope>`);
  };
  const groups = await fetchRemoteGroups(fetchImpl, { ...server(machineId), companyId: 1 }, machineId);
  assert.deepEqual(groups, [
    { value: 'RH', label: 'Recursos Humanos (RH)' },
    { value: 'TI', label: 'Tecnologia (TI)' }
  ]);
  const call = calls.find((item) => item.url.endsWith('/GroupService'));
  assert.equal(call.options.headers.SOAPAction, '"getGroupsCompressedData"');
  assert.match(call.options.body, /xmlns:ws="http:\/\/ws\.foundation\.webdesk\.technology\.datasul\.com\/"/);
  assert.match(call.options.body, /<username>group-token<\/username>/);
});

test('recusa catálogo de grupos que não seja GZIP com serialização Java', () => {
  assert.throws(() => decodeCompressedGroups('não-base64'), /catálogo compactado inválido/);
  assert.throws(() => decodeCompressedGroups(Buffer.from('texto').toString('base64')), /descompactar/);
});

test('cache de mecanismos pode ser atualizado explicitamente após mudança no servidor', async () => {
  const machineId = 'machine-test';
  let generation = 0;
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.endsWith('/TokenService')) {
      generation += 1;
      return soapResponse(200, '<Envelope><Body><result>catalog-token</result></Body></Envelope>');
    }
    if (value.endsWith('/AttributionMecanismService')) {
      const id = generation === 1 ? 'mecInicial' : 'mecNovo';
      return soapResponse(200, `<Envelope><Body><item><attributionMecanismId>${id}</attributionMecanismId></item></Body></Envelope>`);
    }
    return soapResponse(200, '<Envelope><Body><item><volumeId>Default</volumeId></item></Body></Envelope>');
  };
  const configuration = { ...server(machineId), companyId: 1 };
  const service = new RemoteFormCatalogService(fetchImpl, () => 1_000);
  assert.equal((await service.designCatalogs(configuration, machineId)).mechanisms[0].value, 'mecInicial');
  assert.equal((await service.designCatalogs(configuration, machineId)).mechanisms[0].value, 'mecInicial');
  assert.equal((await service.designCatalogs(configuration, machineId, { forceRefresh: true })).mechanisms[0].value, 'mecNovo');
  assert.equal(service.cachedAttributionMechanisms(configuration)[0].value, 'mecNovo');
  assert.equal(service.cachedVolumes(configuration)[0].value, 'Default');
});
