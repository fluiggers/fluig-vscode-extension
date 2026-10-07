'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    assertDistinctFormName,
    formFolderRenameInfo,
    renamedFormArtifactName
} = require('../src/services/FormRenameIdentity');

test('reconhece somente renomeacao de pasta diretamente abaixo de forms', () => {
    const root = path.join('C:', 'workspace');
    assert.deepEqual(
        formFolderRenameInfo(path.join(root, 'forms', 'formulario_antigo'), path.join(root, 'forms', 'formulario_novo')),
        { oldName: 'formulario_antigo', newName: 'formulario_novo' }
    );
    assert.equal(
        formFolderRenameInfo(path.join(root, 'forms', 'formulario', 'events'), path.join(root, 'forms', 'formulario', 'eventos')),
        null
    );
    assert.equal(
        formFolderRenameInfo(path.join(root, 'forms', 'formulario'), path.join(root, 'archive', 'formulario')),
        null
    );
});

test('renomeia html e literals properties sem atingir arquivos parecidos', () => {
    assert.equal(renamedFormArtifactName('formulario.html', 'formulario', 'novo nome'), 'novo nome.html');
    assert.equal(renamedFormArtifactName('formulario_pt_BR.properties', 'formulario', 'novo nome'), 'novo nome_pt_BR.properties');
    assert.equal(renamedFormArtifactName('FORMULARIO_en_US.properties', 'formulario', 'novo'), 'novo_en_US.properties');
    assert.equal(renamedFormArtifactName('formulario.properties', 'formulario', 'novo'), 'novo.properties');
    assert.equal(renamedFormArtifactName('formulario.html', '123 - formulario', 'novo'), 'novo.html');
    assert.equal(renamedFormArtifactName('formulario_pt_BR.properties', '123 - formulario', 'novo'), 'novo_pt_BR.properties');
    assert.equal(renamedFormArtifactName('formulario_custom.js', 'formulario', 'novo'), null);
    assert.equal(renamedFormArtifactName('formulario2_pt_BR.properties', 'formulario', 'novo'), null);
});

test('recusa mudanca somente de maiusculas e minusculas', () => {
    assert.throws(() => assertDistinctFormName('Formulario', 'formulario'), /maiusculas e minusculas/);
    assert.equal(assertDistinctFormName('Formulario', 'Novo Formulario'), 'Novo Formulario');
});

test('FormExtension conecta confirmacao modal ao evento de rename', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'extensions', 'FormExtension.ts'), 'utf8');
    assert.match(source, /onWillRenameFiles/);
    assert.match(source, /event\.waitUntil\(FormExtension\.provideFormFolderRenameEdits\(event\)\)/);
    assert.match(source, /modal:\s*true/);
    assert.match(source, /edit\.renameFile\(rename\.oldUri, rename\.newUri/);
    assert.match(source, /\.html e literals \.properties/);
});
