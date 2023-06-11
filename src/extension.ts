import * as vscode from "vscode";
import { readFileSync, createWriteStream } from "fs";
import { DatasetItem, ServerItem, ServerItemProvider } from "./providers/ServerItemProvider";
import axios, { AxiosRequestConfig } from "axios";
import { DatasetService } from "./services/DatasetService";
import { FormService } from "./services/FormService";
import { GlobalEventService } from "./services/GlobalEventService";
import { UtilsService } from "./services/UtilsService";
import { TemplateService } from "./services/TemplateService";

export function activate(context: vscode.ExtensionContext) {
    if (!vscode.workspace.workspaceFolders) {
        throw "É necessário estar em Workspace / Diretório.";
    }

    // Carrega os templates de criação de artefatos
    TemplateService.init(context);

    context.subscriptions.push(vscode.commands.registerCommand("fluiggers-fluig-vscode-extension.installDeclarationLibrary", installDeclarationLibrary));

    // Criação de artefatos

    context.subscriptions.push(vscode.commands.registerCommand("fluiggers-fluig-vscode-extension.newDataset", createDataset));
    context.subscriptions.push(vscode.commands.registerCommand("fluiggers-fluig-vscode-extension.newForm", createForm));
    context.subscriptions.push(vscode.commands.registerCommand("fluiggers-fluig-vscode-extension.newFormEvent", createFormEvent));
    context.subscriptions.push(vscode.commands.registerCommand("fluiggers-fluig-vscode-extension.newWorkflowEvent", createWorkflowEvent));
    context.subscriptions.push(vscode.commands.registerCommand("fluiggers-fluig-vscode-extension.newGlobalEvent", createGlobalEvent));
    context.subscriptions.push(vscode.commands.registerCommand("fluiggers-fluig-vscode-extension.newMechanism", createMechanism));

    // Servidores

    const serverItemProvider = new ServerItemProvider(context);
    vscode.window.registerTreeDataProvider("fluiggers-fluig-vscode-extension.servers", serverItemProvider);

    context.subscriptions.push(vscode.commands.registerCommand("fluiggers-fluig-vscode-extension.addServer", serverItemProvider.add));
    context.subscriptions.push(vscode.commands.registerCommand("fluiggers-fluig-vscode-extension.refreshServer", serverItemProvider.refresh));
    context.subscriptions.push(vscode.commands.registerCommand("fluiggers-fluig-vscode-extension.editServer", serverItemProvider.update));
    context.subscriptions.push(vscode.commands.registerCommand("fluiggers-fluig-vscode-extension.deleteServer", serverItemProvider.delete));
    context.subscriptions.push(vscode.commands.registerCommand("fluiggers-fluig-vscode-extension.datasetView", serverItemProvider.datasetView));

    // Importação de artefatos

    context.subscriptions.push(vscode.commands.registerCommand("fluiggers-fluig-vscode-extension.importDataset", DatasetService.import));
    context.subscriptions.push(vscode.commands.registerCommand("fluiggers-fluig-vscode-extension.importManyDataset", DatasetService.importMany));
    context.subscriptions.push(vscode.commands.registerCommand("fluiggers-fluig-vscode-extension.importForm", FormService.import));
    context.subscriptions.push(vscode.commands.registerCommand("fluiggers-fluig-vscode-extension.importManyForm", FormService.importMany));
    context.subscriptions.push(vscode.commands.registerCommand("fluiggers-fluig-vscode-extension.importGlobalEvent", GlobalEventService.import));
    context.subscriptions.push(vscode.commands.registerCommand("fluiggers-fluig-vscode-extension.importManyGlobalEvent", GlobalEventService.importMany));

    // Exportação de artefatos

    context.subscriptions.push(vscode.commands.registerCommand(
        "fluiggers-fluig-vscode-extension.exportDataset",
        function (fileUri: vscode.Uri) {
            // Ativado pela Tecla de Atalho
            if (!fileUri) {
                if (!vscode.window.activeTextEditor) {
                    vscode.window.showErrorMessage("Não há editor de texto ativo com Dataset");
                    return;
                }
                fileUri = vscode.window.activeTextEditor.document.uri;
            }

            DatasetService.export(fileUri);
        }
    ));

    context.subscriptions.push(vscode.commands.registerCommand(
        "fluiggers-fluig-vscode-extension.exportForm",
        function (fileUri: vscode.Uri) {
            // Ativado pela Tecla Atalho
            if (!fileUri) {
                if (!vscode.window.activeTextEditor) {
                    vscode.window.showErrorMessage("Não há editor de texto ativo com Formulário");
                    return;
                }
                fileUri = vscode.window.activeTextEditor.document.uri;
            }

            FormService.export(fileUri);
        }
    ));
}

export function deactivate() { }

/**
 * Cria um Dataset
 */
async function createDataset() {
    let dataset: string = await vscode.window.showInputBox({
        prompt: "Qual o nome do Dataset (sem espaços e sem caracteres especiais)?",
        placeHolder: "ds_nome_dataset"
    }) || "";

    if (!dataset) {
        return;
    }

    if (!dataset.endsWith(".js")) {
        dataset += ".js";
    }

    const datasetUri = vscode.Uri.joinPath(UtilsService.getWorkspaceUri(), "datasets", dataset);

    try {
        await vscode.workspace.fs.stat(datasetUri);
        return vscode.window.showTextDocument(datasetUri);
    } catch (err) {

    }

    await vscode.workspace.fs.writeFile(
        datasetUri,
        readFileSync(vscode.Uri.joinPath(TemplateService.templatesUri, 'createDataset.txt').fsPath)
    );
    vscode.window.showTextDocument(datasetUri);
}

/**
 * Cria um arquivo contendo um novo Mecanismo customizado
 */
async function createMechanism() {
    let mechanism: string = await vscode.window.showInputBox({
        prompt: "Qual o nome do Mecanismo Customizado (sem espaços e sem caracteres especiais)?",
        placeHolder: "mecanismo_customizado"
    }) || "";

    if (!mechanism) {
        return;
    }

    if (!mechanism.endsWith(".js")) {
        mechanism += ".js";
    }

    const mechanismUri = vscode.Uri.joinPath(UtilsService.getWorkspaceUri(), "mechanisms", mechanism);

    try {
        await vscode.workspace.fs.stat(mechanismUri);
        return vscode.window.showTextDocument(mechanismUri);
    } catch (err) {

    }

    await vscode.workspace.fs.writeFile(
        mechanismUri,
        readFileSync(vscode.Uri.joinPath(TemplateService.templatesUri, 'createMechanism.txt').fsPath)
    );
    vscode.window.showTextDocument(mechanismUri);
}

/**
 * Cria um Formulário
 */
async function createForm() {
    let formName: string = await vscode.window.showInputBox({
        prompt: "Qual o nome do Formulário (sem espaços e sem caracteres especiais)?",
        placeHolder: "NomeFormulario"
    }) || "";

    if (!formName) {
        return;
    }

    const formFileName = formName + ".html";
    const formUri = vscode.Uri.joinPath(
        UtilsService.getWorkspaceUri(),
        "forms",
        formName,
        formFileName
    );

    try {
        await vscode.workspace.fs.stat(formUri);
        return vscode.window.showTextDocument(formUri);
    } catch (err) {

    }

    await vscode.workspace.fs.writeFile(formUri, readFileSync(vscode.Uri.joinPath(TemplateService.templatesUri, 'form.txt').fsPath));
    vscode.window.showTextDocument(formUri);
}

/**
 * Cria um Evento de Formulário
 */
async function createFormEvent(folderUri: vscode.Uri) {
    // Ativado pela Tecla de Atalho
    if (!folderUri) {
        if (!vscode.window.activeTextEditor) {
            vscode.window.showErrorMessage("Não há editor de texto ativo com Dataset");
            return;
        }
        folderUri = vscode.window.activeTextEditor.document.uri;
    }

    if (!folderUri.path.includes("/forms/")) {
        vscode.window.showErrorMessage("Necessário selecionar um formulário para criar o evento.");
        return;
    }

    const formName: string = folderUri.path.replace(/.*\/forms\/([^/]+).*/, "$1");

    const newFunctionOption = 'Nova Função';

    let eventName: string = await vscode.window.showQuickPick(
        TemplateService.formEventsNames.concat(newFunctionOption),
        {
            canPickMany: false,
            placeHolder: "Selecione o Evento"
        }
    ) || "";

    if (!eventName) {
        return;
    }

    let isNewFunction = false;

    if (eventName == newFunctionOption) {
        eventName = await vscode.window.showInputBox({
            prompt: "Qual o nome da Nova Função (sem espaços e sem caracteres especiais)?",
            placeHolder: "nomeFuncao"
        }) || "";

        if (!eventName) {
            return;
        }

        isNewFunction = true;
    }

    const eventFilename = eventName + ".js";
    const eventUri = vscode.Uri.joinPath(
        UtilsService.getWorkspaceUri(),
        "forms",
        formName,
        'events',
        eventFilename
    );

    try {
        await vscode.workspace.fs.stat(eventUri);
        return vscode.window.showTextDocument(eventUri);
    } catch (err) {

    }

    await vscode.workspace.fs.writeFile(
        eventUri,
        isNewFunction
            ? Buffer.from(createEmptyFunction(eventName), "utf-8")
            : readFileSync(vscode.Uri.joinPath(TemplateService.formEventsUri, `${eventName}.txt`).fsPath)
    );

    vscode.window.showTextDocument(eventUri);
}

/**
 * Cria um Evento Global
 */
async function createGlobalEvent(folderUri: vscode.Uri) {
    const eventName: string = await vscode.window.showQuickPick(
        TemplateService.globalEventsNames,
        {
            canPickMany: false,
            placeHolder: "Selecione o Evento"
        }
    ) || "";

    if (!eventName) {
        return;
    }

    const eventFilename = eventName + ".js";
    const eventUri = vscode.Uri.joinPath(
        UtilsService.getWorkspaceUri(),
        "events",
        eventFilename
    );

    try {
        await vscode.workspace.fs.stat(eventUri);
        return vscode.window.showTextDocument(eventUri);
    } catch (err) {

    }

    await vscode.workspace.fs.writeFile(
        eventUri,
        readFileSync(vscode.Uri.joinPath(TemplateService.globalEventsUri, `${eventName}.txt`).fsPath)
    );
    vscode.window.showTextDocument(eventUri);
}

/**
 * Cria um Evento de Processo
 */
async function createWorkflowEvent(folderUri: vscode.Uri) {
    // Ativado pelo Atalho
    if (!folderUri) {
        if (!vscode.window.activeTextEditor) {
            vscode.window.showErrorMessage("Não há editor de texto ativo com Dataset");
            return;
        }
        folderUri = vscode.window.activeTextEditor.document.uri;
    }

    if (!folderUri.path.endsWith(".process") && !folderUri.path.endsWith(".js")) {
        vscode.window.showErrorMessage("Necessário selecionar um Processo para criar o evento.");
        return;
    }

    const newFunctionOption = 'Nova Função';

    let eventName: string = await vscode.window.showQuickPick(
        TemplateService.workflowEventsNames.concat(newFunctionOption),
        {
            canPickMany: false,
            placeHolder: "Selecione o Evento"
        }
    ) || "";

    if (!eventName) {
        return;
    }

    let isNewFunction = false;

    if (eventName == newFunctionOption) {
        eventName = await vscode.window.showInputBox({
            prompt: "Qual o nome da Nova Função (sem espaços e sem caracteres especiais)?",
            placeHolder: "nomeFuncao"
        }) || "";

        if (!eventName) {
            return;
        }

        isNewFunction = true;
    }

    const processName: string =
        folderUri.path.endsWith(".process")
        ? folderUri.path.replace(/.*\/(\w+)\.process$/, "$1")
        : folderUri.path.replace(/.*\/workflow\/scripts\/([^.]+).+\.js$/, "$1");

    const eventFilename = `${processName}.${eventName}.js`;
    const eventUri = vscode.Uri.joinPath(
        UtilsService.getWorkspaceUri(),
        "workflow",
        "scripts",
        eventFilename
    );

    try {
        await vscode.workspace.fs.stat(eventUri);
        return vscode.window.showTextDocument(eventUri);
    } catch (err) {

    }

    await vscode.workspace.fs.writeFile(
        eventUri,
        isNewFunction
            ? Buffer.from(createEmptyFunction(eventName), "utf-8")
            : readFileSync(vscode.Uri.joinPath(TemplateService.workflowEventsUri, `${eventName}.txt`).fsPath)
    );
    vscode.window.showTextDocument(eventUri);
}

/**
 * Instala a última versão a bilioteca de tipos
 */
function installDeclarationLibrary() {
    const workspaceUri = UtilsService.getWorkspaceUri();

    const axiosConfig: AxiosRequestConfig = {
        responseType: "stream"
    };

    Promise.all([
        axios.get("https://raw.githubusercontent.com/fluiggers/fluig-declaration-type/master/jsconfig.json", axiosConfig),
        axios.get("https://raw.githubusercontent.com/fluiggers/fluig-declaration-type/master/fluig.d.ts", axiosConfig)
    ])
    .then(function ([jsConfig, fluigDeclarations]) {
        jsConfig.data.pipe(createWriteStream(vscode.Uri.joinPath(workspaceUri, "jsconfig.json").fsPath));
        fluigDeclarations.data.pipe(createWriteStream(vscode.Uri.joinPath(workspaceUri, "fluig.d.ts").fsPath));
    })
    .catch(() => vscode.window.showErrorMessage("Erro ao baixar biblioteca do GitHub. Verifique sua conexão com a Internet"));
}

/**
 * Cria o conteúdo de função compartilhada no processo
 *
 * @param functionName Nome da Função
 * @returns Definição da função
 */
function createEmptyFunction(functionName: string): string {
    return `/**
 *
 *
 */
function ${functionName}() {

}

`;
}
