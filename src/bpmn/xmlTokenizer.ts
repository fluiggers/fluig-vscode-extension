'use strict';

/**
 * Tokeniza XML sem normalizar o documento. Cada atributo mantém offsets no
 * texto original para permitir patches cirúrgicos posteriores.
 * @param {string} text
 */
function tokenizeXml(text) {
  const documentNode = createNode('#document', 0, 0, null);
  documentNode.openEnd = 0;
  documentNode.closeStart = text.length;
  documentNode.closeEnd = text.length;

  const stack = [documentNode];
  let cursor = 0;

  while (cursor < text.length) {
    const start = text.indexOf('<', cursor);
    if (start < 0) break;

    if (text.startsWith('<!--', start)) {
      cursor = consumeDelimited(text, start, '-->');
      continue;
    }
    if (text.startsWith('<![CDATA[', start)) {
      cursor = consumeDelimited(text, start, ']]>');
      continue;
    }
    if (text.startsWith('<?', start)) {
      cursor = consumeDelimited(text, start, '?>');
      continue;
    }
    if (text.startsWith('<!', start)) {
      cursor = findTagEnd(text, start) + 1;
      continue;
    }

    const end = findTagEnd(text, start);
    if (end < start) {
      throw new Error(`Tag XML não finalizada no offset ${start}.`);
    }

    if (text[start + 1] === '/') {
      const closeName = readName(text, start + 2, end).name;
      closeElement(stack, closeName, start, end + 1);
      cursor = end + 1;
      continue;
    }

    const nameInfo = readName(text, start + 1, end);
    if (!nameInfo.name) {
      throw new Error(`Nome de tag ausente no offset ${start}.`);
    }
    const selfClosing = isSelfClosing(text, start, end);
    const parent = stack[stack.length - 1];
    const node = createNode(nameInfo.name, start, end + 1, parent);
    node.openEnd = end + 1;
    node.selfClosing = selfClosing;
    node.attributes = readAttributes(text, nameInfo.end, end);
    node.attributeMap = Object.fromEntries(node.attributes.map((attr) => [attr.name, attr]));
    parent.children.push(node);

    if (selfClosing) {
      node.closeStart = end;
      node.closeEnd = end + 1;
    } else {
      stack.push(node);
    }
    cursor = end + 1;
  }

  if (stack.length !== 1) {
    const unclosed = stack.slice(1).map((node) => node.name).join(', ');
    throw new Error(`Tags XML não finalizadas: ${unclosed}.`);
  }

  return documentNode;
}

function createNode(name, start, openEnd, parent) {
  return {
    name,
    localName: name.includes(':') ? name.slice(name.indexOf(':') + 1) : name,
    start,
    openEnd,
    closeStart: openEnd,
    closeEnd: openEnd,
    selfClosing: false,
    attributes: [],
    attributeMap: {},
    parent,
    children: []
  };
}

function consumeDelimited(text, start, delimiter) {
  const end = text.indexOf(delimiter, start + 2);
  if (end < 0) throw new Error(`Bloco XML não finalizado no offset ${start}.`);
  return end + delimiter.length;
}

function findTagEnd(text, start) {
  let quote = '';
  let bracketDepth = 0;
  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '[') bracketDepth += 1;
    if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    if (char === '>' && bracketDepth === 0) return index;
  }
  return -1;
}

function readName(text, from, limit) {
  let index = from;
  while (index < limit && /\s/.test(text[index])) index += 1;
  const start = index;
  while (index < limit && !/[\s/>]/.test(text[index])) index += 1;
  return { name: text.slice(start, index), start, end: index };
}

function readAttributes(text, from, tagEnd) {
  const attributes = [];
  let index = from;
  while (index < tagEnd) {
    while (index < tagEnd && /\s/.test(text[index])) index += 1;
    if (index >= tagEnd || text[index] === '/') break;

    const nameStart = index;
    while (index < tagEnd && !/[\s=/>]/.test(text[index])) index += 1;
    const nameEnd = index;
    const name = text.slice(nameStart, nameEnd);
    while (index < tagEnd && /\s/.test(text[index])) index += 1;

    if (text[index] !== '=') {
      attributes.push({ name, nameStart, nameEnd, valueStart: index, valueEnd: index, quote: '', rawValue: '', value: '' });
      continue;
    }
    index += 1;
    while (index < tagEnd && /\s/.test(text[index])) index += 1;
    const quote = text[index];
    if (quote !== '"' && quote !== "'") {
      throw new Error(`Atributo ${name} sem aspas no offset ${index}.`);
    }
    index += 1;
    const valueStart = index;
    while (index < tagEnd && text[index] !== quote) index += 1;
    if (index >= tagEnd) throw new Error(`Valor do atributo ${name} não finalizado.`);
    const valueEnd = index;
    const rawValue = text.slice(valueStart, valueEnd);
    attributes.push({
      name,
      nameStart,
      nameEnd,
      valueStart,
      valueEnd,
      quote,
      rawValue,
      value: decodeXml(rawValue)
    });
    index += 1;
  }
  return attributes;
}

function isSelfClosing(text, start, end) {
  let index = end - 1;
  while (index > start && /\s/.test(text[index])) index -= 1;
  return text[index] === '/';
}

function closeElement(stack, closeName, closeStart, closeEnd) {
  const current = stack[stack.length - 1];
  if (current.name !== closeName) {
    throw new Error(`Fechamento </${closeName}> não corresponde a <${current.name}>.`);
  }
  current.closeStart = closeStart;
  current.closeEnd = closeEnd;
  stack.pop();
}

function decodeXml(value) {
  return String(value).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith('#x')) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    if (lower.startsWith('#')) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[lower] ?? match;
  });
}

function encodeXmlAttribute(value) {
  let output = '';
  for (const char of String(value)) {
    const code = char.codePointAt(0);
    if (char === '&') output += '&amp;';
    else if (char === '<') output += '&lt;';
    else if (char === '>') output += '&gt;';
    else if (char === '"') output += '&quot;';
    else if (char === "'") output += '&apos;';
    else if (char === '\r') output += '&#xD;';
    else if (char === '\n') output += '&#xA;';
    else if (code < 0x20 && char !== '\t') output += `&#x${code.toString(16).toUpperCase()};`;
    else if (code > 0x7e) output += `&#x${code.toString(16)};`;
    else output += char;
  }
  return output;
}

function walk(node, visitor) {
  for (const child of node.children) {
    visitor(child);
    walk(child, visitor);
  }
}

function descendants(node, predicate) {
  const found = [];
  walk(node, (candidate) => {
    if (predicate(candidate)) found.push(candidate);
  });
  return found;
}

module.exports = {
  decodeXml,
  descendants,
  encodeXmlAttribute,
  tokenizeXml,
  walk
};
