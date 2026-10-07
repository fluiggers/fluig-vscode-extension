'use strict';

const path = require('node:path');
const { LOCALES } = require('./translationService');

const PROCESS_CODE_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
const RESOURCE_SUFFIXES = ['.ecm30.xml', '.png', '.svg', '.processimage.svg'];

function normalizeProcessCode(value) {
  const code = String(value ?? '').trim();
  if (!PROCESS_CODE_PATTERN.test(code)) {
    throw new Error('Informe um codigo de processo valido (use apenas letras, numeros, ponto, hifen ou sublinhado).');
  }
  return code;
}

function processCodeFromFilePath(filePath) {
  const fileName = path.basename(String(filePath ?? ''));
  if (path.extname(fileName).toLowerCase() !== '.process') {
    throw new Error(`O arquivo "${fileName || '(sem nome)'}" nao possui a extensao .process.`);
  }
  return normalizeProcessCode(fileName.slice(0, -'.process'.length));
}

function assertDistinctProcessCode(currentCode, requestedCode) {
  const current = normalizeProcessCode(currentCode);
  const requested = normalizeProcessCode(requestedCode);
  if (current !== requested && current.toLocaleLowerCase('en-US') === requested.toLocaleLowerCase('en-US')) {
    throw new Error('Nao e possivel alterar somente maiusculas e minusculas do codigo do processo. Escolha um codigo diferente para evitar conflitos entre Windows, Linux e macOS.');
  }
  return requested;
}

function renamedArtifactName(kind, fileName, currentCode, requestedCode) {
  const current = normalizeProcessCode(currentCode);
  const requested = assertDistinctProcessCode(current, requestedCode);
  const name = String(fileName ?? '');
  if (!name || current === requested) return null;

  // Scripts are "<code>.<event>.js"; a longer dotted prefix belongs to another process code.
  if (kind === 'scripts' && name.startsWith(`${current}.`) && name.toLowerCase().endsWith('.js')
    && !name.slice(current.length + 1, -'.js'.length).includes('.')) {
    return `${requested}${name.slice(current.length)}`;
  }
  if (kind === 'literals' && LOCALES.some((locale) => name === `${current}_${locale}.properties`)) {
    return `${requested}${name.slice(current.length)}`;
  }
  if (kind === 'resources' && name.startsWith(`${current}.`)) {
    const suffix = name.slice(current.length).toLowerCase();
    if (RESOURCE_SUFFIXES.some((allowed) => suffix === allowed)) {
      return `${requested}${name.slice(current.length)}`;
    }
  }
  return null;
}

module.exports = {
  PROCESS_CODE_PATTERN,
  assertDistinctProcessCode,
  normalizeProcessCode,
  processCodeFromFilePath,
  renamedArtifactName
};
