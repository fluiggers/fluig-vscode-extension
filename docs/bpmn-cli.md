# CLI do editor BPMN para agentes

`fluig-bpmn` lê e edita arquivos `.process` pelo terminal. Serve a agentes de código (Claude Code, Codex) e a scripts, que não conseguem usar o editor visual.

Um `.process` não aguenta edição manual. As ligações entre shapes usam posição (`/0/@children.4`), então inserir ou apagar uma linha desloca todas as referências seguintes. A CLI chama os mesmos patchers do editor visual, que validam o arquivo antes e depois de cada alteração e recusam o que quebraria a estrutura.

## Como rodar

O bundle sai junto com a extensão, em `dist/fluig-bpmn.js`, e só precisa do Node.js.

```bash
npm run compile
node dist/fluig-bpmn.js help
```

Durante o desenvolvimento, sem compilar: `npx tsx src/bpmn/cli/main.ts help`.

Toda saída é JSON. O código de saída é 0 quando deu certo e 1 quando houve erro.

## Comandos

| Comando | O que faz |
|---|---|
| `describe <arquivo>` | Elementos, fluxos, posições, validação e contagem dos catálogos. |
| `describe <arquivo> --element id[,id]` | O que o painel de propriedades mostra para o elemento: atributos, valores atuais e opções de cada campo. |
| `catalog <arquivo> [nome]` | Catálogos do editor: `users`, `roles`, `groups`, `mechanisms`, `processes`, `expedients`, `volumes`, `servers`, `formFields`, `localForms`. Aceita `--search` e `--limit`. |
| `ops [tipo]` | Operações aceitas por `apply`. Com o tipo, mostra um payload de exemplo. |
| `apply <arquivo> --ops <json \| @arquivo \| ->` | Aplica uma lista de operações. `--dry-run` valida sem gravar. |
| `render <arquivo>` | PNG do diagrama com o id de cada elemento e fluxo. `--out` escolhe o arquivo e `--no-ids` tira os ids. |
| `validate <arquivo>` | Validação estrutural do editor mais as invariantes que só o editor garante. |
| `new <codigo> --project <raiz>` | Cria o processo com início, atividade e fim, e as três literais. |

## Operações

Cada operação de `apply` tem o nome e o payload da mensagem que o webview envia ao editor. Um teste compara as duas listas e falha se o editor ganhar uma mensagem que a CLI não cobre.

```json
[
  { "type": "createConnectedGateway", "gateway": { "sourceId": "task4" }, "properties": { "name": "Valor alto?" }, "as": "gw" },
  { "type": "createConnectedTask", "task": { "sourceId": "$gw" }, "properties": { "name": "Aprovar diretoria" }, "as": "dir" },
  { "type": "updateTaskAssignment", "elementId": "$dir", "assignment": { "mechanism": "Papel", "mechanismConfiguration": { "roleId": "diretoria" } } }
]
```

- **Lote atômico.** As operações rodam em ordem sobre o texto em memória. O arquivo só é gravado se todas passarem.
- **Nomes.** `as` dá nome ao elemento criado. As operações seguintes o citam como `$nome`, e o fluxo criado junto como `$nome.flow`.
- **Posição automática.** Sem `x`, `y` e `bendpoints`, a CLI escolhe uma área livre perto da origem, dentro da mesma raia, e calcula a rota com o roteador do editor. Quando a raia não tem espaço, o elemento fica fora dela e a resposta traz um `notice`.
- **Backup.** Antes de gravar, o arquivo original vai para `.fluig-bpmn/backups`, como no editor.
- **Exclusão.** `deleteElements` remove junto os fluxos incidentes e o script que pertence ao elemento. Recusa quando outro script ou evento de formulário cita o código do elemento.

## Conferir o desenho

Um processo válido pode ficar confuso de ler. `render`, ou `apply --render` (inclusive com `--dry-run`), grava um PNG em `.fluig-bpmn/preview`, fora do git. A skill instalada manda o agente olhar a imagem depois de cada edição, corrigir sobreposições e fluxos tortos com `updateLayout`, e repetir por até três rodadas.

O SVG vem do mesmo desenhista que o editor usa para exportar a imagem do processo. A extensão não empacota um conversor para PNG: a CLI usa o primeiro que achar entre `rsvg-convert`, ImageMagick, Inkscape, Chrome, Edge e, no macOS, `qlmanage`. Sem nenhum, devolve só o SVG e um `hint`.

## Contexto do servidor

A CLI nunca consulta o servidor Fluig e nunca lê a senha dele. Ela usa duas fontes:

- **O projeto.** `forms/`, `workflow/.resources/future.ws.cache` e `.vscode/servers.json`, lidos do disco como o editor faz.
- **O cache do editor.** Ao abrir um processo, o editor visual grava em `.fluig-bpmn/catalogs/<processo>.json` o que buscou no servidor: usuários, papéis, grupos, processos, mecanismos, volumes, expedientes e campos de formulário. Um catálogo que volta vazio mantém o último valor conhecido do mesmo servidor.

A pasta do cache tem um `.gitignore` próprio, porque a lista de usuários não deve ir para o repositório.

Sem cache, ou com cache de outro servidor, `describe` e `catalog` avisam em `warnings` e pedem para abrir o processo no editor visual.

## Instalação automática para agentes

Ao abrir um projeto com processos, a extensão grava nele:

| Arquivo | Para quê |
|---|---|
| `.fluig-bpmn/bin/fluig-bpmn.js` | Atalho para a CLI da extensão instalada. Fica fora do git, porque o caminho muda por máquina e por versão. |
| `.claude/skills/fluig-bpmn/SKILL.md` | Skill que o Claude Code carrega sozinho quando o assunto é processo. |
| `AGENTS.md` | Bloco entre `<!-- fluig-bpmn:start -->` e `<!-- fluig-bpmn:end -->`, que o Codex lê. O resto do arquivo não é tocado. |

A extensão só regrava o que mudou. A configuração `fluiggers.bpmnAgentKit` desliga a instalação.

## Limites

- **Arquivo aberto no VS Code.** Salve o `.process` antes de rodar `apply`. Com alterações não salvas no editor, o VS Code acusa conflito ao salvar.
- **Código do processo.** Renomear move scripts e literais, então a CLI recusa. Use o editor visual.
- **Traduções e PNG.** `generateTranslations` e `exportPng` continuam só no editor.
