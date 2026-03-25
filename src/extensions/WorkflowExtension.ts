import * as vscode from 'vscode';
import { UtilsService } from "../services/UtilsService";
import { readFileSync } from "fs";
import { TemplateService } from "../services/TemplateService";
import { AttributionMechanismService } from '../services/AttributionMechanismService';
import { WorkflowService } from '../services/WorkflowService';
import { ServerService } from "../services/ServerService";

export class WorkflowExtension {

    public static activate(context: vscode.ExtensionContext): void {
        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.newWorkflowEvent",
            WorkflowExtension.createWorkflowEvent
        ));
        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.exportWorkflowEvent",
            WorkflowExtension.exportWorkflowEvent
        ));
        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.newMechanism",
            WorkflowExtension.createMechanism
        ));
        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.importManyMechanisms",
            AttributionMechanismService.importMany
        ));
        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.importMechanism",
            AttributionMechanismService.import
        ));
        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.exportMechanism",
            WorkflowExtension.exportMechanism
        ));
        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.listProcesses",
            WorkflowExtension.listProcesses
        ));
    }

    /**
     * Cria um Evento de Processo
     */
    private static async createWorkflowEvent(folderUri: vscode.Uri) {
        // Ativado pelo Atalho
        if (!folderUri) {
            if (!vscode.window.activeTextEditor) {
                vscode.window.showErrorMessage("Não há editor de texto ativo com Processo ou Evento de Processo");
                return;
            }
            folderUri = vscode.window.activeTextEditor.document.uri;
        }

        if (!folderUri.path.endsWith(".process") && !folderUri.path.endsWith(".js")) {
            vscode.window.showErrorMessage("Necessário selecionar um Processo ou Evento de Processo para criar o Evento.");
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

        if (eventName === newFunctionOption) {
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
                ? folderUri.path.replace(/.*\/workflow\/diagrams\/([^.]+)\.process$/, "$1")
                : folderUri.path.replace(/.*\/workflow\/scripts\/([^.]+).+\.js$/, "$1");

        const eventFilename = `${processName}.${eventName}.js`;
        const eventUri = vscode.Uri.joinPath(
            UtilsService.getWorkspaceUri(),
            "workflow",
            "scripts",
            eventFilename
        );

        try {
            // Se Evento já existe carrega o arquivo no editor
            await vscode.workspace.fs.stat(eventUri);
            return vscode.window.showTextDocument(eventUri);
        } catch (err) {

        }

        await vscode.workspace.fs.writeFile(
            eventUri,
            isNewFunction
                ? Buffer.from(TemplateService.createEmptyFunction(eventName), "utf-8")
                : readFileSync(vscode.Uri.joinPath(TemplateService.workflowEventsUri, `${eventName}.js`).fsPath)
        );
        vscode.window.showTextDocument(eventUri);
    }

    /**
     * Exporta um ou mais eventos de processo
     */
    private static async exportWorkflowEvent(fileUri: vscode.Uri) {
        // Ativado pelo Atalho
        if (!fileUri) {
            if (!vscode.window.activeTextEditor) {
                vscode.window.showErrorMessage("Não há editor de texto ativo com um Evento de Processo");
                return;
            }
            fileUri = vscode.window.activeTextEditor.document.uri;
        }

        if (!fileUri.path.endsWith(".js")) {
            vscode.window.showErrorMessage("Necessário selecionar um Evento de Processo.");
            return;
        }

        WorkflowService.updateEvents(fileUri);
    }

    /**
     * Cria um arquivo contendo um novo Mecanismo customizado
     */
    private static async createMechanism() {
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
            // Se Mecanismo já existe carrega o arquivo no editor
            await vscode.workspace.fs.stat(mechanismUri);
            return vscode.window.showTextDocument(mechanismUri);
        } catch (err) {

        }

        await vscode.workspace.fs.writeFile(
            mechanismUri,
            readFileSync(vscode.Uri.joinPath(TemplateService.templatesUri, 'createMechanism.js').fsPath)
        );
        vscode.window.showTextDocument(mechanismUri);
    }

    private static exportMechanism(fileUri: vscode.Uri) {
        // Ativado pela Tecla de Atalho
        if (!fileUri) {
            if (!vscode.window.activeTextEditor) {
                vscode.window.showErrorMessage("Não há editor de texto ativo com Mecanismo Customizado");
                return;
            }
            fileUri = vscode.window.activeTextEditor.document.uri;
        }

        AttributionMechanismService.export(fileUri);
    }

    private static async listProcesses() {
        const server = await ServerService.getSelect();
        if (!server) return;

        try {
            await UtilsService.validateServerHasFluiggersWidget(server);

            const processes = await WorkflowService.listProcesses(server);

            if (!processes || !processes.length) {
                vscode.window.showWarningMessage("Nenhum processo encontrado.");
                return;
            }

            const quickPick = vscode.window.createQuickPick();

            quickPick.title = "Selecionar processos para importar";
            quickPick.placeholder = "Marque os processos e pressione Enter";
            quickPick.canSelectMany = true;

            quickPick.items = processes.map(p => ({
                label: p.processId,
                description: p.description || "",
                detail: `Versão: ${p.version} ${p.active ? "| Ativo" : ""}`,
                processId: p.processId,
                version: p.version
            }));

            quickPick.buttons = [
                {
                    iconPath: new vscode.ThemeIcon("check"),
                    tooltip: "Confirmar"
                }
            ];

            quickPick.onDidAccept(async () => {
                const selectedItems = quickPick.selectedItems as any[];

                quickPick.hide();

                if (!selectedItems.length) return;

                if (server.confirmExporting && !(await UtilsService.confirmPassword(server))) {
                    return;
                }

                const workspace = UtilsService.getWorkspaceUri();

                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: "Exportando processos...",
                        cancellable: false
                    },
                    async () => {
                        for (const proc of selectedItems) {
                            await WorkflowService.exportProcess(
                                server,
                                proc.processId,
                                proc.version,
                                workspace
                            );
                        }
                    }
                );

                vscode.window.showInformationMessage("Processos importados com sucesso!");
            });

            quickPick.onDidHide(() => quickPick.dispose());

            quickPick.show();

        } catch (error: any) {
            vscode.window.showErrorMessage(error.message || error);
        }
    }
}
