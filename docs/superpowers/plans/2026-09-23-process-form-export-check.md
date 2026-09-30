# Process Form Export Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block workflow process export when the process form link is not a valid server `documentId` for the target server, and offer to pick an existing server form or publish the local form, writing the resulting `documentId` into the `.process`.

**Architecture:** A pure module (`src/bpmn/processFormExportCheck.ts`) decides whether the form link needs a fix and locates the local form folder. A new pure patcher (`patchProcessServerForm` in `src/bpmn/processPatcher.ts`) rewrites `formSource`, `cardIndex`, descriptor `cardIndex` and `serverId`. `WorkflowProcessExportService.prepare()` runs the check after the server is chosen and before ECM30 generation, drives the fix UI, and saves the patched file. `FormService` gets a `publishForm` method that returns the `documentId`.

**Tech Stack:** TypeScript/CommonJS modules under `src/` (the `src/bpmn/*.ts` files are plain JS syntax with `require`/`module.exports`), VS Code API, `node:test` + `node:assert/strict` run via `tsx`.

**Spec:** `docs/superpowers/specs/2026-09-23-process-form-export-check-design.md`

## Global Constraints

- Identifiers, comments and docs in English; UI copy (messages, quick picks) in PT-BR; commit messages in PT-BR.
- Never use em-dashes in any text.
- Match surrounding style: `src/bpmn/*.ts` use `'use strict'`, `require`, `module.exports`, 2-space indent, single quotes; `src/services/*.ts` use ES `import`, 4-space indent, double quotes.
- Numeric `documentId` means `/^\d+$/` after trim.
- Server name written to `serverId` is `server.name` (keeps Studio's original casing, e.g. `Concremat dev`).
- Server comparison uses `matchesServer(server, serverId)` from `src/bpmn/serverCatalog.ts`.
- Against the client Fluig server: sequential calls only, no parallel requests.
- Deviation from spec, deliberate: the server form list uses `FormService.getForms(server)` (SOAP, same credentials as the export) instead of `RemoteFormCatalogService.list`, because the export already requires username/password and the catalog requires a machine-encrypted Fluiggers password. The manual `documentId` input remains the fallback when listing fails.

## Review Focus

- `cardIndex` with surrounding spaces (`" 742011 "`): treated as numeric, passes (covered in Task 1 table).
- `serverId` stored in different case from `server.name` (`"concremat dev"` vs `"Concremat dev"`): passes via `matchesServer` (covered in Task 1 table).
- `cardIndex` of a local folder name containing path traversal (`"../x"`): `localFormFolder` returns `null`, publish option hidden (covered in Task 1).
- Process with descriptor fields pointing to the old local `cardIndex`: descriptors are re-pointed to the new `documentId`, ids and labels kept (covered in Task 2).
- User cancels any fix prompt: export stops without touching the `.process` (covered by Task 4 manual check, VS Code-coupled).

---

### Task 1: Pure form link check [DONE]

**Files:**
- Create: `src/bpmn/processFormExportCheck.ts`
- Test: `test/bpmn/processFormExportCheck.test.js`

**Interfaces:**
- Consumes: `matchesServer(configuration, requestedValue)` from `src/bpmn/serverCatalog.ts`.
- Produces:
  - `checkProcessForm(attributes: {formSource?, cardIndex?, serverId?}, server: {name, id?}) => { status: 'ok' | 'needs-fix', reason: '' | 'not-published' | 'other-server', cardIndex: string }`
  - `localFormFolder(processPath: string, cardIndex: string, exists = fs.existsSync) => string | null` (absolute folder path of `forms/<cardIndex>` under `<process dir>/../..`, or `null` when missing or unsafe)

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { checkProcessForm, localFormFolder } = require('../../src/bpmn/processFormExportCheck');

const server = { id: 'abc', name: 'Concremat dev' };

test('classifies the process form link for the target server', () => {
  const cases = [
    [{}, 'ok', ''],
    [{ cardIndex: '   ' }, 'ok', ''],
    [{ formSource: 'server', cardIndex: '742011', serverId: 'Concremat dev' }, 'ok', ''],
    [{ formSource: 'server', cardIndex: ' 742011 ', serverId: '' }, 'ok', ''],
    [{ formSource: 'server', cardIndex: '742011', serverId: 'concremat dev' }, 'ok', ''],
    [{ formSource: 'local', cardIndex: '742011', serverId: 'Concremat dev' }, 'ok', ''],
    [{ formSource: 'server', cardIndex: '742011', serverId: 'Concremat prod' }, 'needs-fix', 'other-server'],
    [{ formSource: 'local', cardIndex: 'Engineering Proposal Development', serverId: 'Concremat dev' }, 'needs-fix', 'not-published'],
    [{ formSource: 'server', cardIndex: 'abc', serverId: 'Concremat dev' }, 'needs-fix', 'not-published']
  ];
  for (const [attributes, status, reason] of cases) {
    const result = checkProcessForm(attributes, server);
    assert.equal(result.status, status, JSON.stringify(attributes));
    assert.equal(result.reason, reason, JSON.stringify(attributes));
    assert.equal(result.cardIndex, String(attributes.cardIndex ?? '').trim());
  }
});

test('locates the local form folder only inside the project forms directory', () => {
  const root = path.resolve('project');
  const processPath = path.join(root, 'workflow', 'diagrams', 'p.process');
  const existing = new Set([path.join(root, 'forms', 'Engineering Proposal Development')]);
  const exists = (candidate) => existing.has(candidate);
  assert.equal(
    localFormFolder(processPath, 'Engineering Proposal Development', exists),
    path.join(root, 'forms', 'Engineering Proposal Development')
  );
  assert.equal(localFormFolder(processPath, 'missing', exists), null);
  assert.equal(localFormFolder(processPath, '../forms/Engineering Proposal Development', exists), null);
  assert.equal(localFormFolder(processPath, '', exists), null);
});
```

Note: an existing numeric `cardIndex` with `formSource="local"` passes, because Fluig resolves it; only the server link matters for release.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --require ./test/bpmn/stableProcessFixture.js --test test/bpmn/processFormExportCheck.test.js`
Expected: FAIL with `Cannot find module '../../src/bpmn/processFormExportCheck'`

- [ ] **Step 3: Write minimal implementation**

```js
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { matchesServer } = require('./serverCatalog');

const NUMERIC_DOCUMENT_ID = /^\d+$/;

function checkProcessForm(attributes, server) {
  const cardIndex = String(attributes?.cardIndex ?? '').trim();
  if (!cardIndex) return { status: 'ok', reason: '', cardIndex };
  if (!NUMERIC_DOCUMENT_ID.test(cardIndex)) return { status: 'needs-fix', reason: 'not-published', cardIndex };
  const formSource = String(attributes?.formSource ?? '').trim().toLowerCase();
  const serverId = String(attributes?.serverId ?? '').trim();
  if (formSource === 'server' && serverId && !matchesServer(server, serverId)) {
    return { status: 'needs-fix', reason: 'other-server', cardIndex };
  }
  return { status: 'ok', reason: '', cardIndex };
}

function localFormFolder(processPath, cardIndex, exists = fs.existsSync) {
  const name = String(cardIndex ?? '').trim();
  if (!name || name !== path.basename(name) || name === '.' || name === '..') return null;
  const formsRoot = path.resolve(path.dirname(processPath), '..', '..', 'forms');
  const folder = path.join(formsRoot, name);
  return exists(folder) ? folder : null;
}

module.exports = {
  checkProcessForm,
  localFormFolder
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --require ./test/bpmn/stableProcessFixture.js --test test/bpmn/processFormExportCheck.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add -- src/bpmn/processFormExportCheck.ts test/bpmn/processFormExportCheck.test.js
git commit -m "Adiciona verificação do vínculo de formulário do processo para exportação" -- src/bpmn/processFormExportCheck.ts test/bpmn/processFormExportCheck.test.js
```

---

### Task 2: Patch process to a server form [DONE]

**Files:**
- Modify: `src/bpmn/processPatcher.ts` (add function after `patchProcessForm`, around line 458; add to `module.exports` near line 4617)
- Test: `test/bpmn/processServerForm.test.js`

**Interfaces:**
- Consumes: `patchProcessForm(text, elementId, requestedConfiguration, catalogs)`, `descriptorFieldValues(value)` (already imported from `./processForm` in `processPatcher.ts`; add to the import list if missing), `parseProcess`, `patchAttribute`, `applyPatches`, `validateProcess` (all module-internal).
- Produces: `patchProcessServerForm(text: string, documentId: string, serverName: string) => { text, changed }`. Sets `formSource="server"`, `cardIndex=<documentId>`, re-points every descriptor field `cardIndex` to `<documentId>`, keeps `uniquecardversion`, `inheritFormSecurity`, descriptor ids and labels, and sets `serverId=<serverName>`. Throws if `documentId` is not numeric.

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { patchProcessForm, patchProcessServerForm } = require('../../src/bpmn/processPatcher');
const { descriptorFieldValues } = require('../../src/bpmn/processForm');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);
const localForms = [{ value: 't123', label: 't123', fields: ['campox', 'aprovador', 'observacao'] }];

test('links the process to a server form and keeps flags and descriptors', () => {
  const id = parseProcess(fixture).process.id;
  const local = patchProcessForm(fixture, id, {
    source: 'local',
    cardIndex: 't123',
    uniqueCardVersion: true,
    inheritFormSecurity: true,
    descriptorFields: [{ id: 'campox', label: 'Campo X' }, { id: 'aprovador', label: 'Aprovador' }]
  }, { localForms }).text;

  const result = patchProcessServerForm(local, ' 742011 ', 'Concremat dev');
  const attributes = parseProcess(result.text).process.attributes;

  assert.equal(result.changed, true);
  assert.equal(attributes.formSource, 'server');
  assert.equal(attributes.cardIndex, '742011');
  assert.equal(attributes.serverId, 'Concremat dev');
  assert.equal(attributes.uniquecardversion, 'true');
  assert.equal(attributes.inheritFormSecurity, 'true');
  assert.deepEqual(descriptorFieldValues(attributes.descriptorFields), [
    { id: 'campox', label: 'Campo X', cardIndex: '742011' },
    { id: 'aprovador', label: 'Aprovador', cardIndex: '742011' }
  ]);

  // Only the BpmnProcess open tag may change; descriptorFields can hold raw '>', so use parser offsets.
  const before = parseProcess(local).process.node;
  const after = parseProcess(result.text).process.node;
  assert.equal(result.text.slice(0, after.start), local.slice(0, before.start));
  assert.equal(result.text.slice(after.openEnd), local.slice(before.openEnd));
});

test('refuses a non numeric documentId', () => {
  assert.throws(() => patchProcessServerForm(fixture, 'abc', 'Concremat dev'), /documentId/);
});
```

`node.start` and `node.openEnd` are the offsets `patchAttribute` already uses on parsed nodes.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --require ./test/bpmn/stableProcessFixture.js --test test/bpmn/processServerForm.test.js`
Expected: FAIL with `patchProcessServerForm is not a function`

- [ ] **Step 3: Write minimal implementation**

Add after `patchProcessForm` in `src/bpmn/processPatcher.ts`:

```js
function patchProcessServerForm(text, documentId, serverName) {
  const normalizedId = String(documentId ?? '').trim();
  if (!/^\d+$/.test(normalizedId)) throw new Error(`documentId de formulário inválido: ${normalizedId || '(vazio)'}.`);
  const element = parseProcess(text).process;
  if (!element || !supportsProcessForm(element)) throw new Error('Processo não encontrado.');
  const attributes = element.attributes;
  const descriptors = attributes.descriptorFields !== undefined
    ? descriptorFieldValues(attributes.descriptorFields)
    : [];
  const formPatched = patchProcessForm(text, element.id, {
    source: 'server',
    cardIndex: normalizedId,
    uniqueCardVersion: String(attributes.uniquecardversion) === 'true',
    inheritFormSecurity: String(attributes.inheritFormSecurity) === 'true',
    descriptorFields: descriptors.map((descriptor) => ({ ...descriptor, cardIndex: normalizedId }))
  });
  const model = parseProcess(formPatched.text);
  const patches = [];
  patchAttribute(formPatched.text, model.process.node, 'serverId', String(serverName ?? '').trim(), patches, { required: true });
  const updatedText = applyPatches(formPatched.text, patches);
  const validation = validateProcess(parseProcess(updatedText));
  if (!validation.ok) {
    throw new Error(`O vínculo do formulário foi recusado porque produziria ${validation.errors.length} erro(s) estrutural(is).`);
  }
  return { text: updatedText, changed: updatedText !== text };
}
```

Check before writing: `supportsProcessForm` and `descriptorFieldValues` are already imported from `./processForm` at `processPatcher.ts` lines ~50-60 (they are used by `patchProcessForm`). If `isTrue`-style helpers exist for booleans, keep the explicit `=== 'true'` comparison anyway; `processForm.ts` reads the same attributes as strings.

Add `patchProcessServerForm,` right after `patchProcessForm,` in `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --require ./test/bpmn/stableProcessFixture.js --test test/bpmn/processServerForm.test.js test/bpmn/processForm.test.js`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add -- src/bpmn/processPatcher.ts test/bpmn/processServerForm.test.js
git commit -m "Adiciona patch que vincula o processo a um formulário do servidor" -- src/bpmn/processPatcher.ts test/bpmn/processServerForm.test.js
```

---

### Task 3: FormService publish returning documentId

**Files:**
- Modify: `src/services/FormService.ts:269-341` (`export`)

**Interfaces:**
- Produces: `public static async publishForm(context: ExtensionContext, server: ServerDTO, formFolder: string): Promise<number | undefined>`. `formFolder` is the absolute path of `forms/<folderName>`. Runs the current prompts (create or update, params), uploads attachments and events, returns the `documentId` (update: the selected form's `documentId`; create: `response[0].result.item.documentId`). Returns `undefined` on cancel. Throws `Error(message)` when the server message is not `ok` or no `documentId` comes back.
- `export(context, fileUri)` keeps its current behavior (server prompt, password confirmation, success and error messages) and delegates to `publishForm`.

No unit test: every step calls VS Code UI and SOAP. Verified by compile, lint and the manual check in Task 4.

- [x] **Step 1: Refactor `export` into `publishForm`**

Replace the body of `export` from `const formFolderName` through the end of the `try/catch` with:

```ts
        const formFolder = Uri.joinPath(UtilsService.getWorkspaceUri(), 'forms', fileUri.path.replace(/.*\/forms\/([^/]+).*/, "$1")).fsPath;
        const formName = basename(formFolder).replace(/^(?:\d+ - )?(\w+)$/, "$1");

        try {
            const documentId = await FormService.publishForm(context, server, formFolder);
            if (documentId !== undefined) {
                window.showInformationMessage(`Formulário ${formName} exportado com sucesso!`);
            }
        } catch (err: any) {
            window.showErrorMessage(err?.message || "Erro ao exportar Formulário.");
        }
```

Add the new method right after `export`:

```ts
    public static async publishForm(context: ExtensionContext, server: ServerDTO, formFolder: string): Promise<number | undefined> {
        const formFolderName = basename(formFolder);

        // Remove possível documentid da frente do formulário (quando importado pelo Eclipse)
        const formName = formFolderName.replace(/^(?:\d+ - )?(\w+)$/, "$1");

        const selectedForm = await FormService.getExportFormSelected(server, formName);

        if (!selectedForm) {
            return undefined;
        }

        const params = selectedForm === "novo"
            ? await FormService.getCreateFormParams(context, server, formName)
            : await FormService.getUpdateFormParams(server, selectedForm)
        ;

        if (params === null) {
            return undefined;
        }

        const isEvent = /[/\\]events$/;

        for (let attachmentPath of glob.sync(`${formFolder}/**/*.*`, {
            nodir: true,
            ignore: { ignored: (path => isEvent.test(path.parentPath) ) }
        })) {
            const pathParsed = parse(attachmentPath);

            const attachment: AttachmentDTO = {
                fileName: pathParsed.base,
                filecontent: readFileSync(attachmentPath).toString("base64"),
                principal: pathParsed.ext.toLowerCase().includes('htm') && formName === pathParsed.name,
            };
            params.Attachments.item.push(attachment);
        }

        for (let eventPath of glob.sync(formFolder + "/events/*.js")) {
            const customEvent: CustomizationEventsDTO = {
                eventDescription: readFileSync(eventPath).toString("utf-8"),
                eventId: basename(eventPath, '.js'),
                eventVersAnt: false, // talvez precise tratar isso quando for novo
            };
            params.customEvents.item.push(customEvent);
        }

        const client = await LoginService.createAuthenticatedClientAsync(server, FormService.getUri(server));
        const response = selectedForm === "novo"
            ? await client.createSimpleCardIndexWithDatasetPersisteTypeAsync(params)
            : await client.updateSimpleCardIndexWithDatasetAndGeneralInfoAsync(params)
        ;

        const item = response[0]?.result?.item;
        const message = item?.webServiceMessage;
        if (message !== 'ok') {
            throw new Error(message || 'Verifique o id da Pasta onde irá salvar o Formulário!');
        }
        const documentId = Number(selectedForm === "novo" ? item?.documentId : selectedForm.documentId);
        if (!Number.isInteger(documentId) || documentId <= 0) {
            throw new Error(`O servidor não retornou o documentId do formulário ${formName}.`);
        }
        return documentId;
    }
```

Notes for the implementer:
- `item` may be an array when the SOAP result has several entries; if `Array.isArray(item)`, use `item[0]`. Check the existing code path: it reads `response[0]?.result?.item?.webServiceMessage`, so it is a single object today; keep that assumption.
- The previous catch showed "Erro ao exportar Formulário." for any exception; the new `export` keeps that text as fallback.
- Keep existing imports; `basename` and `parse` are already imported from `path`.

- [x] **Step 2: Compile and lint**

Run: `npm run test-compile; npm run lint`
Expected: no TypeScript errors, eslint passes.

- [x] **Step 3: Commit**

```bash
git add -- src/services/FormService.ts
git commit -m "Extrai publicação de formulário retornando o documentId" -- src/services/FormService.ts
```

---

### Task 4: Wire the check into process export [Steps 1-6 DONE]

**Files:**
- Modify: `src/services/WorkflowProcessExportService.ts` (`validate`, `export`, `prepare`, new private `ensureProcessForm`)
- Modify: `src/extensions/WorkflowExtension.ts:31-38` (pass `context`)

**Interfaces:**
- Consumes: `checkProcessForm`, `localFormFolder` (Task 1); `patchProcessServerForm` (Task 2); `FormService.publishForm`, `FormService.getForms` (Task 3 / existing); `parseProcess` from `src/bpmn/processModel`.
- Produces: `WorkflowProcessExportService.validate(processUri?, context?)` and `export(processUri?, context?)`; `prepare(processUri, context)` returns `undefined` when the user cancels the form fix.

- [x] **Step 1: Pass the extension context to the commands**

In `src/extensions/WorkflowExtension.ts` replace the two registrations:

```ts
        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.validateWorkflowProcessExport",
            (processUri?: vscode.Uri) => WorkflowProcessExportService.validate(processUri, context)
        ));
        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.exportWorkflowProcess",
            (processUri?: vscode.Uri) => WorkflowProcessExportService.export(processUri, context)
        ));
```

In `WorkflowProcessExportService.ts` change the signatures to `validate(processUri?: vscode.Uri, context?: vscode.ExtensionContext)` and `export(processUri?: vscode.Uri, context?: vscode.ExtensionContext)`, and both calls to `WorkflowProcessExportService.prepare(processUri, context)`. Change `prepare(processUri?: vscode.Uri, context?: vscode.ExtensionContext)`.

- [x] **Step 2: Add imports**

```ts
import { FormService } from "./FormService";

const { parseProcess } = require("../bpmn/processModel");
const { patchProcessServerForm } = require("../bpmn/processPatcher");
const { checkProcessForm, localFormFolder } = require("../bpmn/processFormExportCheck");
```

- [x] **Step 3: Call the check in `prepare`**

Right after the `releaseChoice` guard and before `const processId = ...`:

```ts
        if (!(await WorkflowProcessExportService.ensureProcessForm(selectedUri, server, context))) {
            return;
        }
```

- [x] **Step 4: Implement `ensureProcessForm`**

Add as a private static method:

```ts
    private static async ensureProcessForm(
        processUri: vscode.Uri,
        server: any,
        context?: vscode.ExtensionContext
    ): Promise<boolean> {
        const openDocument = vscode.workspace.textDocuments.find(
            document => document.uri.toString() === processUri.toString()
        );
        if (openDocument?.isDirty) {
            throw new Error("Salve o arquivo .process antes de exportar.");
        }

        const text = Buffer.from(await vscode.workspace.fs.readFile(processUri)).toString("utf8");
        const attributes = parseProcess(text).process?.attributes ?? {};
        const check = checkProcessForm(attributes, server);
        if (check.status === "ok") {
            return true;
        }

        const formFolder = check.reason === "not-published"
            ? localFormFolder(processUri.fsPath, check.cardIndex)
            : null;
        const pickAction = "Escolher formulário do servidor";
        const publishAction = "Publicar formulário local";
        const actions = formFolder && context ? [pickAction, publishAction] : [pickAction];
        const detail = check.reason === "other-server"
            ? `O formulário ${check.cardIndex} está vinculado ao servidor ${attributes.serverId}, não a ${server.name}.`
            : `O formulário "${check.cardIndex}" ainda não foi publicado: o Fluig exige o documentId do formulário.`
                + (formFolder ? "" : ` A pasta forms/${check.cardIndex} não existe no projeto.`);
        const action = await vscode.window.showWarningMessage(
            "Formulário do processo inválido para exportação.",
            { modal: true, detail },
            ...actions
        );
        if (!action) {
            return false;
        }

        const documentId = action === publishAction
            ? await FormService.publishForm(context!, server, formFolder!)
            : await WorkflowProcessExportService.pickServerForm(server, check.cardIndex);
        if (documentId === undefined) {
            return false;
        }

        const patched = patchProcessServerForm(text, String(documentId), server.name);
        await vscode.workspace.fs.writeFile(processUri, Buffer.from(patched.text, "utf8"));
        vscode.window.showInformationMessage(
            `Processo vinculado ao formulário ${documentId} de ${server.name}.`
        );
        return true;
    }

    private static async pickServerForm(server: any, preferredName: string): Promise<number | undefined> {
        let forms: any[] = [];
        try {
            forms = await FormService.getForms(server);
        } catch (error: any) {
            vscode.window.showWarningMessage(
                `Não foi possível listar os formulários de ${server.name}: ${error?.message || error}`
            );
        }

        if (forms.length) {
            const items = forms
                .map(form => ({
                    label: `${form.documentId} - ${form.documentDescription}`,
                    detail: form.datasetName,
                    documentId: Number(form.documentId),
                    preferred: form.documentDescription === preferredName,
                }))
                .sort((a, b) => Number(b.preferred) - Number(a.preferred));
            const picked = await vscode.window.showQuickPick(items, {
                placeHolder: "Selecione o formulário do servidor",
                matchOnDetail: true,
            });
            return picked?.documentId;
        }

        const typed = await vscode.window.showInputBox({
            prompt: `Informe o documentId do formulário em ${server.name}`,
            validateInput: value => /^\d+$/.test(value.trim()) ? undefined : "Informe apenas números.",
        });
        return typed === undefined ? undefined : Number(typed.trim());
    }
```

Note: writing through `vscode.workspace.fs.writeFile` updates the open (non-dirty) editor from disk. `ensureGenerated` runs next and reads the patched file.

- [x] **Step 5: Compile, lint and run all unit tests**

Run (this task's gate): `npm run test-compile; npm run lint`
Result: no compile errors, 0 lint errors (pre-existing warnings only). Full unit suite runs once at the final branch review, not per task.

- [x] **Step 6: Commit**

```bash
git add -- src/services/WorkflowProcessExportService.ts src/extensions/WorkflowExtension.ts
git commit -m "Valida o formulário do processo antes da exportação e oferece vincular ou publicar" -- src/services/WorkflowProcessExportService.ts src/extensions/WorkflowExtension.ts
```

- [ ] **Step 7: Manual check (human, in the Extension Development Host)**

1. Export `workflow/diagrams/engineeringproposaldevelopment.process` to "Concremat dev": the modal appears with only "Escolher formulário do servidor" (no `forms/` folder in this repo).
2. Cancel: the `.process` is unchanged (`git diff` empty for that file).
3. Choose a server form: the `.process` gets `formSource="server"`, numeric `cardIndex`, `serverId="Concremat dev"`, and the release no longer lists deadline or assignment-by-form-field errors caused by the missing form.
