'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CLI_COMMAND = 'node .fluig-bpmn/bin/fluig-bpmn.js';
const BLOCK_START = '<!-- fluig-bpmn:start -->';
const BLOCK_END = '<!-- fluig-bpmn:end -->';

const INSTRUCTIONS = `Nunca edite um arquivo \`.process\` à mão: as ligações entre shapes usam posição, e uma linha a mais ou a menos corrompe o diagrama. Use a CLI, que aplica as mesmas regras do editor visual do VS Code e recusa o que quebraria o arquivo.

\`\`\`bash
${CLI_COMMAND} <comando>
\`\`\`

Rode da raiz do projeto Fluig. Toda saída é JSON.

1. \`describe workflow/diagrams/<processo>.process\` lista elementos, fluxos e ids.
2. \`describe <arquivo> --element <id>\` mostra as propriedades do elemento, os valores atuais e as opções de cada campo.
3. \`catalog <arquivo> <nome> --search <texto>\` procura valores válidos: \`users\`, \`roles\`, \`groups\`, \`mechanisms\`, \`processes\`, \`expedients\`, \`volumes\`, \`formFields\`, \`localForms\`.
4. \`ops\` lista as operações, e \`ops <tipo>\` mostra um payload de exemplo.
5. \`apply <arquivo> --ops '<json>' --dry-run\` testa um lote. Sem \`--dry-run\`, grava.
6. \`validate <arquivo>\` confere o resultado.
7. \`render <arquivo>\` gera um PNG do diagrama com o id de cada elemento e fluxo.
8. \`new <codigo> --project .\` cria um processo novo.

## Confira o desenho

Um processo válido pode ficar feio ou confuso. Depois de criar ou mover elementos, olhe o resultado:

1. Rode \`apply\` com \`--render\` (funciona com \`--dry-run\`) ou rode \`render\`. A resposta traz o caminho do PNG em \`preview.png\` ou \`png\`.
2. Abra o PNG como imagem e procure: elementos sobrepostos ou colados, elemento fora da raia, fluxo passando por cima de um elemento, fluxos cruzados sem necessidade, rótulos ilegíveis, e o caminho principal fora da ordem esquerda para a direita.
3. Corrija com \`updateLayout\`: \`moves\` muda a posição (\`describe\` mostra \`bounds\` de cada elemento), \`resizes\` aumenta pool ou raia, e \`connections\` redesenha um fluxo. Passe \`"bendpoints": []\` para o fluxo sair reto entre dois elementos alinhados.
4. Gere a imagem de novo. Pare quando não houver mais problema da lista, ou depois de três rodadas.

Mantenha 60 px ou mais entre elementos e alinhe pelo centro os que estão na mesma linha. Se não houver conversor de imagem, a resposta traz \`hint\` e só o SVG: avise o usuário.

Regras:

- Não informe \`x\`, \`y\` nem \`bendpoints\` ao criar elementos. A CLI escolhe a posição e desenha o fluxo.
- Monte o fluxo inteiro em um só \`apply\`. Use \`"as": "nome"\` na operação que cria e \`"$nome"\` nas seguintes. O fluxo criado junto é \`"$nome.flow"\`.
- Se \`apply\` devolver \`"ok": false\`, nada foi gravado. Leia \`error\`, corrija o lote e rode de novo.
- Um \`notice\` de elemento fora da raia pede \`updateLayout\` para aumentar a pool.
- Usuários, papéis e grupos vêm de um cache que o editor visual grava ao abrir o processo. Se \`warnings\` avisar que o cache falta, peça ao usuário para abrir o processo no VS Code.
- Se \`.fluig-bpmn/bin/fluig-bpmn.js\` não existir, peça ao usuário para abrir o projeto no VS Code com a extensão Fluiggers.
- Antes de editar, peça ao usuário para salvar o \`.process\` se ele estiver aberto no VS Code.
`;

const SKILL = `---
name: fluig-bpmn
description: Lê e edita diagramas de processo do Fluig (arquivos .process em workflow/diagrams) pela CLI fluig-bpmn. Use sempre que precisar criar, alterar, validar ou entender um processo, atividade, gateway, fluxo, atribuição ou prazo de um workflow Fluig. Nunca edite um .process à mão.
---

# Diagramas de processo Fluig

${INSTRUCTIONS}`;

const AGENTS_BLOCK = `${BLOCK_START}
## Diagramas de processo (.process)

${INSTRUCTIONS}${BLOCK_END}
`;

/**
 * Ensina agentes de código (Claude Code, Codex) a editar os processos do projeto: instala o atalho
 * da CLI, a skill do Claude Code e um bloco no AGENTS.md. Só regrava o que mudou, então pode rodar
 * a cada abertura do projeto. O atalho aponta para a extensão instalada nesta máquina e fica fora do git.
 * @param {string} projectRoot
 * @param {string} cliBundlePath caminho absoluto de dist/fluig-bpmn.js
 * @returns {string[]} arquivos gravados, relativos ao projeto
 */
function installAgentKit(projectRoot, cliBundlePath) {
  // O bundle é o executável: carregá-lo já roda o comando com os argumentos deste processo.
  const launcher = `#!/usr/bin/env node\nrequire(${JSON.stringify(cliBundlePath)});\n`;
  const agentsFile = path.join(projectRoot, 'AGENTS.md');
  const files = [
    ['.fluig-bpmn/bin/fluig-bpmn.js', launcher],
    ['.fluig-bpmn/bin/.gitignore', '*\n'],
    ['.claude/skills/fluig-bpmn/SKILL.md', SKILL],
    ['AGENTS.md', withManagedBlock(readText(agentsFile), AGENTS_BLOCK)]
  ];
  const written = [];
  for (const [relativePath, content] of files) {
    const file = path.join(projectRoot, relativePath);
    if (readText(file) === content) continue;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    written.push(relativePath);
  }
  return written;
}

/** Troca só o trecho entre os marcadores; o resto do AGENTS.md é do usuário. */
function withManagedBlock(current, block) {
  const start = current.indexOf(BLOCK_START);
  const end = current.indexOf(BLOCK_END);
  if (start >= 0 && end > start) {
    const after = current.slice(end + BLOCK_END.length).replace(/^\r?\n/, '');
    return `${current.slice(0, start)}${block}${after}`;
  }
  if (!current.trim()) return block;
  return `${current.replace(/\s*$/, '')}\n\n${block}`;
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

module.exports = { CLI_COMMAND, installAgentKit, withManagedBlock };
