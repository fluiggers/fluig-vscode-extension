'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { discoverUserCatalog, extractUserCatalog } = require('../../src/bpmn/userCatalog');

const cacheFixture = [
  '<object class="com.totvs.tds.ecm.foundation.ws.ColleagueDtoLite"><void property="colleagueId"><string>daniel.sales</string></void><void property="colleagueName"><string>Daniel Sales</string></void></object>',
  '<object class="com.totvs.tds.ecm.foundation.ws.ColleagueDtoLite"><void property="colleagueId"><string>daniel.sales</string></void><void property="colleagueName"><string>Duplicado</string></void></object>',
  '<object class="com.totvs.tds.ecm.foundation.ws.ColleagueDtoLite"><void property="colleagueId"><string>fluigapi-post</string></void><void property="colleagueName"><string>Fluig API</string></void></object>'
].join('');

test('extrai usuários do cache do Fluig Studio sem duplicidade', () => {
  const catalog = extractUserCatalog(cacheFixture);
  assert.deepEqual(catalog[0], { value: 'daniel.sales', label: 'Daniel Sales (daniel.sales)' });
  assert.equal(catalog.filter((item) => item.value === 'daniel.sales').length, 1);
  assert.ok(catalog.some((item) => item.value === 'fluigapi-post'));
});

test('descobre usuários relativamente ao processo', async () => {
  let requestedPath = '';
  const vscode = {
    Uri: { file: (fsPath) => ({ fsPath }) },
    workspace: { fs: { readFile: async (uri) => {
      requestedPath = uri.fsPath;
      return Buffer.from(cacheFixture, 'utf8');
    } } }
  };
  const processUri = {
    scheme: 'file',
    fsPath: path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process')
  };
  const catalog = await discoverUserCatalog(vscode, processUri);
  assert.equal(catalog.find((item) => item.value === 'daniel.sales').label, 'Daniel Sales (daniel.sales)');
  assert.match(requestedPath, /workflow[\\/]\.resources[\\/]future\.ws\.cache$/);
});
