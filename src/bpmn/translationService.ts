'use strict';

const LOCALES = ['pt_BR', 'en_US', 'es'];
const CANONICAL_KEYS = ['process.category', 'process.description', 'process.instructions'];

function extractProcessTranslations(model) {
  if (!model?.supported || !model.process) throw new Error('Processo Studio XMI suportado não encontrado.');
  return new Map([
    ['process.category', String(model.process.attributes.category ?? '')],
    ['process.description', String(model.process.name || model.process.id || '')],
    ['process.instructions', String(model.process.attributes.instruction ?? '')]
  ]);
}

function buildTranslationPlan(model, existingByLocale = {}, options = {}) {
  const base = extractProcessTranslations(model);
  const parsed = new Map();
  const orphanKeys = new Set();
  for (const locale of LOCALES) {
    const properties = parseProperties(existingByLocale[locale] ?? '');
    parsed.set(locale, properties);
    for (const key of properties.values.keys()) {
      if (!base.has(key)) orphanKeys.add(key);
    }
  }
  const keys = [...CANONICAL_KEYS, ...[...orphanKeys].sort((left, right) => left.localeCompare(right))];
  const date = options.date instanceof Date ? options.date : new Date();
  const files = new Map();
  for (const locale of LOCALES) {
    const current = parsed.get(locale);
    const existed = Object.hasOwn(existingByLocale, locale);
    const existingContent = String(existingByLocale[locale] ?? '');
    const values = new Map();
    const added = [];
    for (const key of keys) {
      if (current.values.has(key)) values.set(key, current.values.get(key));
      else {
        values.set(key, base.get(key) ?? '');
        added.push(key);
      }
    }
    const currentKeys = [...current.values.keys()];
    const keysChanged = currentKeys.length !== keys.length
      || currentKeys.some((key, index) => key !== keys[index]);
    const lineEndingsChanged = existed && existingContent.length > 0 && !existingContent.includes('\r\n');
    const missingFinalLineEnding = existed && existingContent.length > 0 && !existingContent.endsWith('\r\n');
    const changed = !existed || keysChanged || lineEndingsChanged || missingFinalLineEnding;
    const content = changed
      ? serializeProperties(values, { date, lineEnding: '\r\n' })
      : existingContent;
    files.set(locale, {
      locale,
      content,
      changed,
      existed,
      added,
      orphans: keys.filter((key) => !base.has(key))
    });
  }
  return { processId: model.process.id, keys, orphanKeys: [...orphanKeys], files };
}

function parseProperties(text) {
  const source = String(text ?? '');
  const lineEnding = source.includes('\r\n') ? '\r\n' : '\n';
  const logicalLines = joinContinuations(source.split(/\r?\n/));
  const values = new Map();
  for (const rawLine of logicalLines) {
    const trimmed = rawLine.trimStart();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue;
    const separator = propertySeparator(rawLine);
    const keyRaw = rawLine.slice(0, separator.keyEnd);
    const valueRaw = rawLine.slice(separator.valueStart);
    values.set(unescapeProperty(keyRaw.trim()), unescapeProperty(valueRaw));
  }
  return { values, lineEnding };
}

function serializeProperties(values, options = {}) {
  const lineEnding = options.lineEnding === '\n' ? '\n' : '\r\n';
  const header = javaDateComment(options.date instanceof Date ? options.date : new Date());
  const lines = [header];
  for (const [key, value] of values) lines.push(`${escapeProperty(key, true)}=${escapeProperty(value, false)}`);
  return `${lines.join(lineEnding)}${lineEnding}`;
}

function validateTranslationPlan(plan) {
  const expected = plan.keys;
  const errors = [];
  for (const locale of LOCALES) {
    const file = plan.files.get(locale);
    if (!file) {
      errors.push(`Arquivo ${locale} ausente no plano.`);
      continue;
    }
    const keys = [...parseProperties(file.content).values.keys()];
    if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
      errors.push(`As chaves de ${locale} não possuem paridade com o processo.`);
    }
    if (!file.content.includes('\r\n') || /(^|[^\r])\n/.test(file.content)) {
      errors.push(`O arquivo ${locale} não utiliza CRLF exclusivamente.`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function propertySeparator(line) {
  let escaped = false;
  let keyEnd = line.length;
  let valueStart = line.length;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (escaped) { escaped = false; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (char === '=' || char === ':' || /\s/.test(char)) {
      keyEnd = index;
      valueStart = index;
      while (valueStart < line.length && /\s/.test(line[valueStart])) valueStart += 1;
      if (line[valueStart] === '=' || line[valueStart] === ':') valueStart += 1;
      while (valueStart < line.length && /\s/.test(line[valueStart])) valueStart += 1;
      break;
    }
  }
  return { keyEnd, valueStart };
}

function joinContinuations(lines) {
  const result = [];
  let pending = '';
  for (const line of lines) {
    pending += pending ? line.trimStart() : line;
    if (hasContinuation(pending)) {
      pending = pending.slice(0, -1);
      continue;
    }
    result.push(pending);
    pending = '';
  }
  if (pending) result.push(pending);
  return result;
}

function hasContinuation(value) {
  let slashes = 0;
  for (let index = value.length - 1; index >= 0 && value[index] === '\\'; index -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function escapeProperty(value, key) {
  const input = String(value ?? '');
  let output = '';
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    const char = input[index];
    if (char === '\\') output += '\\\\';
    else if (char === '\t') output += '\\t';
    else if (char === '\n') output += '\\n';
    else if (char === '\r') output += '\\r';
    else if (char === '\f') output += '\\f';
    else if ((key && /[ =:#!]/.test(char)) || (!key && index === 0 && char === ' ')) output += `\\${char}`;
    else if (code < 0x20 || code > 0x7e) output += `\\u${code.toString(16).padStart(4, '0')}`;
    else output += char;
  }
  return output;
}

function unescapeProperty(value) {
  return String(value ?? '').replace(/\\u([0-9a-f]{4})|\\(.)/gi, (match, unicode, escaped) => {
    if (unicode) return String.fromCharCode(Number.parseInt(unicode, 16));
    return ({ t: '\t', n: '\n', r: '\r', f: '\f' })[escaped] ?? escaped;
  });
}

function javaDateComment(date) {
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const zone = extractShortTimeZone(date);
  return `#${weekdays[date.getDay()]} ${months[date.getMonth()]} ${String(date.getDate()).padStart(2, '0')} ${time(date)} ${zone} ${date.getFullYear()}`;
}

function extractShortTimeZone(date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(date);
  return parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
}

function time(date) {
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map((value) => String(value).padStart(2, '0')).join(':');
}

module.exports = {
  CANONICAL_KEYS,
  LOCALES,
  buildTranslationPlan,
  escapeProperty,
  extractProcessTranslations,
  parseProperties,
  serializeProperties,
  unescapeProperty,
  validateTranslationPlan
};
