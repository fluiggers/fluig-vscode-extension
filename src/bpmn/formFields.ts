'use strict';

const path = require('node:path');

function extractFormFields(html) {
  const fields = [];
  const seen = new Set();
  const tagPattern = /<(input|select|textarea)\b[^>]*>/gi;
  for (const match of String(html ?? '').matchAll(tagPattern)) {
    const tag = match[0];
    const nameMatch = tag.match(/\bname\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const name = String(nameMatch?.[1] ?? nameMatch?.[2] ?? nameMatch?.[3] ?? '').trim();
    if (!name || seen.has(name) || /[<>{}$]/.test(name)) continue;
    seen.add(name);
    fields.push(name);
  }
  return fields;
}

async function discoverFormFields(vscode, processUri, model) {
  const process = model.process;
  const cardIndex = String(process?.attributes?.cardIndex ?? '').trim();
  const formSource = String(process?.attributes?.formSource ?? '').trim().toLowerCase();
  if (formSource !== 'local' || !safePathSegment(cardIndex) || processUri.scheme !== 'file') return [];

  const projectRoot = path.resolve(path.dirname(processUri.fsPath), '..', '..');
  const formDirectory = path.resolve(projectRoot, 'forms', cardIndex);
  const formsRoot = path.resolve(projectRoot, 'forms');
  if (!isInside(formsRoot, formDirectory)) return [];

  const preferred = vscode.Uri.file(path.join(formDirectory, `${cardIndex}.html`));
  const preferredHtml = await tryReadText(vscode, preferred);
  if (preferredHtml !== null) return extractFormFields(preferredHtml);

  const htmlFiles = await listHtmlFiles(vscode, vscode.Uri.file(formDirectory));
  const results = await Promise.all(htmlFiles.map((uri) => tryReadText(vscode, uri)));
  return [...new Set(results.filter((value) => value !== null).flatMap(extractFormFields))];
}

async function discoverLocalFormCatalog(vscode, processUri) {
  if (processUri.scheme !== 'file') return [];
  const projectRoot = path.resolve(path.dirname(processUri.fsPath), '..', '..');
  const formsRoot = path.resolve(projectRoot, 'forms');
  let entries;
  try {
    entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(formsRoot));
  } catch {
    return [];
  }
  const directories = entries
    .filter(([name, type]) => type === vscode.FileType.Directory && safePathSegment(name))
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b));
  const forms = [];
  for (const cardIndex of directories) {
    const formDirectory = path.resolve(formsRoot, cardIndex);
    const preferred = vscode.Uri.file(path.join(formDirectory, `${cardIndex}.html`));
    let html = await tryReadText(vscode, preferred);
    if (html === null) {
      const htmlFiles = await listHtmlFiles(vscode, vscode.Uri.file(formDirectory));
      const contents = await Promise.all(htmlFiles.map((uri) => tryReadText(vscode, uri)));
      html = contents.filter((value) => value !== null).join('\n');
    }
    forms.push({ value: cardIndex, label: cardIndex, fields: extractFormFields(html) });
  }
  return forms;
}

async function listHtmlFiles(vscode, directory) {
  try {
    const entries = await vscode.workspace.fs.readDirectory(directory);
    return entries
      .filter(([name, type]) => type === vscode.FileType.File && /\.html?$/i.test(name))
      .map(([name]) => vscode.Uri.joinPath(directory, name));
  } catch {
    return [];
  }
}

async function tryReadText(vscode, uri) {
  try {
    return new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(uri));
  } catch {
    return null;
  }
}

function safePathSegment(value) {
  return Boolean(value) && value !== '.' && value !== '..' && !/[\\/]/.test(value);
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

module.exports = { discoverFormFields, discoverLocalFormCatalog, extractFormFields };
