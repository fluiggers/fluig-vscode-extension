import * as vscode from 'vscode';
import {FormService} from "../services/FormService";
import {UtilsService} from "../services/UtilsService";
import {readFileSync} from "fs";
import {TemplateService} from "../services/TemplateService";

export class FormExtension {

    public static activate(context: vscode.ExtensionContext): void {
        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.newForm",
            FormExtension.createForm
        ));
        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.newFormEvent",
            FormExtension.createFormEvent
        ));
        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.importManyForm",
            FormService.importMany
        ));
        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.importForm",
            FormService.import
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

                FormService.export(context, fileUri);
            }
        ));
    }


    /**
     * Cria um Formulário
     */
    private static async createForm() {
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
            // Se Formulário já existe carrega o arquivo no editor
            await vscode.workspace.fs.stat(formUri);
            return vscode.window.showTextDocument(formUri);
        } catch (err) {

        }

        await vscode.workspace.fs.writeFile(
            formUri,
            readFileSync(vscode.Uri.joinPath(TemplateService.templatesUri, 'form.txt').fsPath)
        );
        vscode.window.showTextDocument(formUri);
    }

    /**
     * Cria um Evento de Formulário
     */
    private static async createFormEvent(folderUri: vscode.Uri) {
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

        const eventFilename = eventName + ".js";
        const eventUri = vscode.Uri.joinPath(
            UtilsService.getWorkspaceUri(),
            "forms",
            formName,
            'events',
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
                : readFileSync(vscode.Uri.joinPath(TemplateService.formEventsUri, `${eventName}.txt`).fsPath)
        );

        vscode.window.showTextDocument(eventUri);
    }
}
