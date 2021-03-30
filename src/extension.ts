// The module "vscode" contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { posix } from "path";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand("fluig-vscode-extension.newDataset", createDataset));
    context.subscriptions.push(vscode.commands.registerCommand("fluig-vscode-extension.newForm", createForm));
    context.subscriptions.push(vscode.commands.registerCommand("fluig-vscode-extension.newFormEvent", createFormEvent));
    context.subscriptions.push(vscode.commands.registerCommand("fluig-vscode-extension.newWorkflowEvent", createWorkflowEvent));
}

// this method is called when your extension is deactivated
export function deactivate() {}

const eventMapFunctions = new Map<String, Function>();

eventMapFunctions.set('displayFields', createEventFormDisplayFields);
eventMapFunctions.set('setEnable', createEventFormSetEnable);
eventMapFunctions.set('afterCancelProcess', createEventWorkflowAfterCancelProcess);
eventMapFunctions.set('afterProcessCreate', createEventWorkflowAfterProcessCreate);
eventMapFunctions.set('afterProcessFinish', createEventWorkflowAfterProcessFinish);
eventMapFunctions.set('afterReleaseProcessVersion', createEventWorkflowAfterReleaseProcessVersion);
eventMapFunctions.set('afterReleaseVersion', createEventWorkflowAfterReleaseVersion);
eventMapFunctions.set('afterStateLeave', createEventWorkflowAfterStateLeave);
eventMapFunctions.set('afterTaskComplete', createEventWorkflowAfterTaskComplete);
eventMapFunctions.set('afterTaskCreate', createEventWorkflowAfterTaskCreate);
eventMapFunctions.set('beforeCancelProcess', createEventWorkflowBeforeCancelProcess);
eventMapFunctions.set('beforeSendData', createEventWorkflowBeforeSendData);
eventMapFunctions.set('beforeStateEntry', createEventWorkflowBeforeStateEntry);
eventMapFunctions.set('beforeStateLeave', createEventWorkflowBeforeStateLeave);
eventMapFunctions.set('beforeTaskComplete', createEventWorkflowBeforeTaskComplete);
eventMapFunctions.set('beforeTaskCreate', createEventWorkflowBeforeTaskCreate);
eventMapFunctions.set('beforeTaskSave', createEventWorkflowBeforeTaskSave);
eventMapFunctions.set('checkComplementsPermission', createEventWorkflowCheckComplementsPermission);
eventMapFunctions.set('subProcessCreated', createEventWorkflowSubProcessCreated);
eventMapFunctions.set('validateAvailableStates', createEventWorkflowValidateAvailableStates);

/**
 * Cria um arquivo contendo um novo Dataset
 */
async function createDataset() {
    if (!vscode.workspace.workspaceFolders) {
        vscode.window.showInformationMessage("Você precisa estar em um diretório / workspace.");
        return;
    }

    let dataset:string = await vscode.window.showInputBox({
        prompt: "Qual o nome do Dataset (sem espaços e sem caracteres especiais)?",
        placeHolder: "ds_nome_dataset"
    }) || "";

    if (!dataset) {
        return;
    }

    if (!dataset.endsWith(".js")) {
        dataset += ".js";
    }

    const workspaceFolderUri = vscode.workspace.workspaceFolders[0].uri;
    const datasetUri = workspaceFolderUri.with({ path: posix.join(workspaceFolderUri.path, "datasets", dataset) });

    try {
        await vscode.workspace.fs.stat(datasetUri);
        return vscode.window.showTextDocument(datasetUri);
    } catch (err) {

    }

    await vscode.workspace.fs.writeFile(datasetUri, Buffer.from(createDatasetContent(), "utf-8"));
    vscode.window.showTextDocument(datasetUri);
}

/**
 * Cria um novo formulário
 */
async function createForm() {
    if (!vscode.workspace.workspaceFolders) {
        vscode.window.showInformationMessage("Você precisa estar em um diretório / workspace.");
        return;
    }

    let formName:string = await vscode.window.showInputBox({
        prompt: "Qual o nome do Formulário (sem espaços e sem caracteres especiais)?",
        placeHolder: "NomeFormulario"
    }) || "";

    if (!formName) {
        return;
    }

    const formFileName = formName + ".html";
    const workspaceFolderUri = vscode.workspace.workspaceFolders[0].uri;
    const formUri = workspaceFolderUri.with({ path: posix.join(workspaceFolderUri.path, "forms", formName, formFileName) });

    try {
        await vscode.workspace.fs.stat(formUri);
        return vscode.window.showTextDocument(formUri);
    } catch (err) {

    }

    await vscode.workspace.fs.writeFile(formUri, Buffer.from(createFormContent(), "utf-8"));
    vscode.window.showTextDocument(formUri);
}

/**
 * Cria um novo evento de formulário
 */
async function createFormEvent(folderUri: vscode.Uri) {
    if (!vscode.workspace.workspaceFolders) {
        vscode.window.showInformationMessage("Você precisa estar em um diretório / workspace.");
        return;
    }

    if (!folderUri.path.includes("/forms/")) {
        vscode.window.showErrorMessage("Necessário selecionar um formulário para criar o evento.");
        return;
    }

    const formName:string = folderUri.path.replace(/.*\/forms\/([^/]+).*/, "$1");

    const eventName: string = await vscode.window.showQuickPick(
        [
            'afterProcessing',
            'afterSaveNew',
            'beforeProcessing',
            'displayFields',
            'enableFields',
            'inputFields',
            'setEnable',
            'validateForm'
        ],
        {
            canPickMany: false,
            placeHolder: "Selecione o Evento"
        }
    ) || "";

    if (!eventName) {
        return;
    }

    const eventFilename = eventName + ".js";
    const workspaceFolderUri = vscode.workspace.workspaceFolders[0].uri;
    const eventUri = workspaceFolderUri.with({
        path: posix.join(
            workspaceFolderUri.path,
            "forms",
            formName,
            'events',
            eventFilename
        )
    });

    try {
        await vscode.workspace.fs.stat(eventUri);
        return vscode.window.showTextDocument(eventUri);
    } catch (err) {

    }

    const fileData = eventMapFunctions.get(eventName)?.apply({}) || createEventFormWithFormController(eventName);

    await vscode.workspace.fs.writeFile(eventUri, Buffer.from(fileData, "utf-8"));
    vscode.window.showTextDocument(eventUri);
}

/**
 * Cria um novo evento de Processo
 */
async function createWorkflowEvent(folderUri: vscode.Uri) {
    if (!vscode.workspace.workspaceFolders) {
        vscode.window.showInformationMessage("Você precisa estar em um diretório / workspace.");
        return;
    }

    if (!folderUri.path.endsWith(".process")) {
        vscode.window.showErrorMessage("Necessário selecionar um Processo para criar o evento.");
        return;
    }

    const processName:string = folderUri.path.replace(/.*\/(\w+)\.process$/, "$1");

    let eventName: string = await vscode.window.showQuickPick(
        [
            'afterCancelProcess',
            'afterProcessCreate',
            'afterProcessFinish',
            'afterReleaseProcessVersion',
            'afterReleaseVersion',
            'afterStateLeave',
            'afterTaskComplete',
            'afterTaskCreate',
            'beforeCancelProcess',
            'beforeSendData',
            'beforeStateEntry',
            'beforeStateLeave',
            'beforeTaskComplete',
            'beforeTaskCreate',
            'beforeTaskSave',
            'checkComplementsPermission',
            'subProcessCreated',
            'validateAvailableStates',
            'Nova Função',
        ],
        {
            canPickMany: false,
            placeHolder: "Selecione o Evento"
        }
    ) || "";

    if (!eventName) {
        return;
    }

    if (eventName == 'Nova Função') {
        eventName = await vscode.window.showInputBox({
            prompt: "Qual o nome da Nova Função (sem espaços e sem caracteres especiais)?",
            placeHolder: "nomeFuncao"
        }) || "";

        if (!eventName) {
            return;
        }
    }

    const eventFilename = `${processName}.${eventName}.js`;
    const workspaceFolderUri = vscode.workspace.workspaceFolders[0].uri;
    const eventUri = workspaceFolderUri.with({
        path: posix.join(
            workspaceFolderUri.path,
            "workflow",
            "scripts",
            eventFilename
        )
    });

    try {
        await vscode.workspace.fs.stat(eventUri);
        return vscode.window.showTextDocument(eventUri);
    } catch (err) {

    }

    const fileData = eventMapFunctions.get(eventName)?.apply({}) || createEmptyFunction(eventName);

    await vscode.workspace.fs.writeFile(eventUri, Buffer.from(fileData, "utf-8"));
    vscode.window.showTextDocument(eventUri);
}


/**
 * Cria o conteúdo do arquivo de um novo Dataset
 *
 * @returns {string}
 */
 function createDatasetContent(): string {
    return `/**
 *
 *
 * @param {string[]} fields Campos Solicitados
 * @param {Constraint[]} constraints Filtros
 * @param {string[]} sorts Campos da Ordenação
 * @returns {Dataset}
 */
function createDataset(fields, constraints, sorts) {
    var dataset = DatasetBuilder.newDataset();

    return dataset;
}

/**
 *
 */
function defineStructure() {

}

/**
 *
 *
 * @param {number} lastSyncDate
 */
function onSync(lastSyncDate) {

}

/**
 *
 *
 * @param user
 * @returns {DatasetMobileSync}
 */
function onMobileSync(user) {

}
`;
}

/**
 * Cria o conteúdo do arquivo de um novo Formulário
 *
 * @returns {string}
 */
 function createFormContent(): string {
    return `<html>
<head>
    <link rel="stylesheet" href="/style-guide/css/fluig-style-guide.min.css"/>
    <script type="text/javascript" src="/portal/resources/js/jquery/jquery.js"></script>
    <script type="text/javascript" src="/portal/resources/js/jquery/jquery-ui.min.js"></script>
    <script type="text/javascript" src="/portal/resources/js/mustache/mustache-min.js"></script>
    <script type="text/javascript" src="/style-guide/js/fluig-style-guide.min.js"></script>
</head>
<body>
    <div class="fluig-style-guide">
        <form name="form" role="form">

        </form>
    </div>
</body>
</html>
`;
}

/**
 * Cria o conteúdo de um Evento de Formulário que utiliza o FormController
 *
 * @param eventName Nome do Evento
 * @returns {string}
 */
function createEventFormWithFormController(eventName: string): string {
    return `/**
 *
 *
 * @param {FormController} form
 */
function ${eventName}(form) {

}
`;
}

/**
 * Cria o conteúdo do Evento de Formulário "setEnable"
 *
 * @returns {string}
 */
function createEventFormSetEnable(): string {
    return `/**
 *
 *
 */
function setEnable() {

}
`;
}

/**
 * Cria o conteúdo do Evento de Formulário "displayFields"
 *
 * @returns {string}
 */
function createEventFormDisplayFields(): string {
    return `/**
 *
 *
 * @param {FormController} form
 * @param {customHTML} customHTML
 */
function displayFields(form, customHTML) {

}
`;
}

function createEventWorkflowAfterReleaseProcessVersion(): string {
    return `/**
 *
 *
 * @param {string} processXML
 */
function afterReleaseProcessVersion(processXML) {

}
`;
}

function createEventWorkflowAfterReleaseVersion(): string {
    return `/**
 *
 *
 * @param {string} processXML
 */
function afterReleaseVersion(processXML) {

}
`;
}

function createEventWorkflowBeforeStateEntry(): string {
    return `/**
 *
 *
 * @param {number} sequenceId Sequência da atividade
 */
function beforeStateEntry(sequenceId) {

}
`;
}

function createEventWorkflowBeforeTaskCreate(): string {
    return `/**
 *
 *
 * @param {string} colleagueId Matrícula do Usuário
 */
function beforeTaskCreate(colleagueId) {

}
`;
}

function createEventWorkflowAfterTaskCreate(): string {
    return `/**
 *
 *
 * @param {string} colleagueId Matrícula do Usuário
 */
function afterTaskCreate(colleagueId) {

}
`;
}

function createEventWorkflowBeforeCancelProcess(): string {
    return `/**
 *
 *
 * @param {string} colleagueId Matrícula do Usuário
 * @param {number} processId
 */
function beforeCancelProcess(colleagueId, processId) {

}
`;
}

function createEventWorkflowAfterCancelProcess(): string {
    return `/**
 *
 *
 * @param {string} colleagueId Matrícula do Usuário
 * @param {number} processId
 */
function afterCancelProcess(colleagueId, processId) {

}
`;
}


function createEventWorkflowBeforeSendData(): string {
    return `/**
 *
 *
 */
function beforeSendData(customFields,customFacts) {

}
`;
}

function createEventWorkflowValidateAvailableStates(): string {
    return `/**
 *
 *
 * @param {number} iCurrentState
 * @param {java.util.List<number>} stateList
 */
function validateAvailableStates(iCurrentState, stateList) {

}
`;
}

function createEventWorkflowBeforeTaskSave(): string {
    return `/**
 *
 *
 * @param {string} colleagueId Matrícula do usuário corrente
 * @param {number} nextSequenceId
 * @param {java.util.List<string>} userList Lista de matrículas de usuários destino
 */
function beforeTaskSave(colleagueId, nextSequenceId, userList) {

}
`;
}

function createEventWorkflowBeforeTaskComplete(): string {
    return `/**
 *
 *
 * @param {string} colleagueId Matrícula do usuário corrente
 * @param {number} nextSequenceId
 * @param {java.util.List<string>} userList Lista de matrículas de usuários destino
 */
function beforeTaskComplete(colleagueId, nextSequenceId, userList) {

}
`;
}

function createEventWorkflowAfterTaskComplete(): string {
    return `/**
 *
 *
 * @param {string} colleagueId Matrícula do usuário corrente
 * @param {number} nextSequenceId
 * @param {java.util.List<string>} userList Lista de matrículas de usuários destino
 */
function afterTaskComplete(colleagueId, nextSequenceId, userList) {

}
`;
}

function createEventWorkflowAfterProcessCreate(): string {
    return `/**
 *
 *
 * @param {number} processId
 */
function afterProcessCreate(processId) {

}
`;
}

function createEventWorkflowSubProcessCreated(): string {
    return `/**
 *
 *
 * @param {number} processId
 */
function subProcessCreated(processId) {

}
`;
}

function createEventWorkflowAfterProcessFinish(): string {
    return `/**
 *
 *
 * @param {number} processId
 */
function afterProcessFinish(processId) {

}
`;
}

function createEventWorkflowBeforeStateLeave(): string {
    return `/**
 *
 *
 * @param {number} sequenceId
 */
function beforeStateLeave(sequenceId) {

}
`;
}

function createEventWorkflowAfterStateLeave(): string {
    return `/**
 *
 *
 * @param {number} sequenceId
 */
function afterStateLeave(sequenceId) {

}
`;
}

function createEventWorkflowCheckComplementsPermission(): string {
    return `/**
 *
 *
 * @returns {boolean} Se retornar false impede adição de complemento
 */
function checkComplementsPermission() {

}
`;
}

function createEmptyFunction(functionName: string): string {
    return `/**
 *
 *
 */
function ${functionName}() {

}
`;
}
