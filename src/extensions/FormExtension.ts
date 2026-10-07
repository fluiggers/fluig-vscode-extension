import * as vscode from 'vscode';
import {FormService} from "../services/FormService";
import {UtilsService} from "../services/UtilsService";
import {readFileSync} from "fs";
import * as path from "path";
import {TemplateService} from "../services/TemplateService";

const {
    assertDistinctFormName,
    formFolderRenameInfo,
    formRenameKey,
    renamedFormArtifactName
} = require("../services/FormRenameIdentity");

export class FormExtension {

    private static readonly formRenameSummaries = new Map<string, {
        oldName: string;
        newName: string;
        relatedCount: number;
    }>();

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
        context.subscriptions.push(
            vscode.workspace.onWillRenameFiles(event => {
                event.waitUntil(FormExtension.provideFormFolderRenameEdits(event));
            }),
            vscode.workspace.onDidRenameFiles(event => {
                FormExtension.handleCompletedFormRenames(event);
            })
        );
    }

    private static async provideFormFolderRenameEdits(event: vscode.FileWillRenameEvent): Promise<vscode.WorkspaceEdit|undefined> {
        const edit = new vscode.WorkspaceEdit();
        const summaries: Array<{
            key: string;
            oldName: string;
            newName: string;
            relatedCount: number;
        }> = [];
        let changed = false;

        try {
            for (const file of event.files) {
                const renameInfo = formFolderRenameInfo(file.oldUri.fsPath, file.newUri.fsPath);
                if (!renameInfo) {
                    continue;
                }
                const stat = await vscode.workspace.fs.stat(file.oldUri);
                if ((stat.type & vscode.FileType.Directory) === 0) {
                    continue;
                }
                const requestedName = assertDistinctFormName(renameInfo.oldName, renameInfo.newName);
                const related = await FormExtension.discoverFormArtifactRenames(
                    file.oldUri,
                    renameInfo.oldName,
                    requestedName
                );
                await FormExtension.assertFormRenameTargetsAvailable(related);

                const preview = [
                    `${renameInfo.oldName}/ -> ${requestedName}/`,
                    ...related.slice(0, 12).map(rename => (
                        `${path.basename(rename.oldUri.fsPath)} -> ${path.basename(rename.newUri.fsPath)}`
                    ))
                ];
                if (related.length > 12) {
                    preview.push(`... e mais ${related.length - 12} arquivo(s).`);
                }
                const confirmed = await vscode.window.showWarningMessage(
                    `Renomear o formulário ${renameInfo.oldName} para ${requestedName}?`,
                    {
                        modal: true,
                        detail: [
                            'A pasta será renomeada e os arquivos .html e literals .properties vinculados receberão o mesmo nome.',
                            ...preview
                        ].join('\n')
                    },
                    'Aplicar alteração'
                );
                if (confirmed !== 'Aplicar alteração') {
                    throw new vscode.CancellationError();
                }

                for (const rename of related) {
                    edit.renameFile(rename.oldUri, rename.newUri, { overwrite: false, ignoreIfExists: false });
                }
                summaries.push({
                    key: formRenameKey(file.oldUri.fsPath, file.newUri.fsPath),
                    oldName: renameInfo.oldName,
                    newName: requestedName,
                    relatedCount: related.length
                });
                changed = changed || related.length > 0;
            }
            for (const summary of summaries) {
                FormExtension.formRenameSummaries.set(summary.key, summary);
            }
            return changed ? edit : undefined;
        } catch (error) {
            if (!(error instanceof vscode.CancellationError)) {
                const message = error instanceof Error ? error.message : String(error);
                void vscode.window.showErrorMessage(`Fluig Forms: renomeação recusada: ${message}`);
            }
            throw error;
        }
    }

    private static async discoverFormArtifactRenames(
        folderUri: vscode.Uri,
        currentName: string,
        requestedName: string
    ): Promise<Array<{oldUri: vscode.Uri; newUri: vscode.Uri}>> {
        const renames: Array<{oldUri: vscode.Uri; newUri: vscode.Uri}> = [];
        const directories = [folderUri];
        const rootEntries = await vscode.workspace.fs.readDirectory(folderUri);
        for (const [fileName, type] of rootEntries) {
            if ((type & vscode.FileType.Directory) !== 0 && fileName.toLocaleLowerCase() === 'literals') {
                directories.push(vscode.Uri.joinPath(folderUri, fileName));
            }
        }
        for (const directory of directories) {
            const entries = directory === folderUri
                ? rootEntries
                : await vscode.workspace.fs.readDirectory(directory);
            for (const [fileName, type] of entries) {
                if ((type & vscode.FileType.File) === 0) {
                    continue;
                }
                const targetName = renamedFormArtifactName(fileName, currentName, requestedName);
                if (!targetName) {
                    continue;
                }
                renames.push({
                    oldUri: vscode.Uri.joinPath(directory, fileName),
                    newUri: vscode.Uri.joinPath(directory, targetName)
                });
            }
        }
        return renames;
    }

    private static async assertFormRenameTargetsAvailable(
        renames: Array<{oldUri: vscode.Uri; newUri: vscode.Uri}>
    ): Promise<void> {
        const destinations = new Set<string>();
        for (const rename of renames) {
            const destination = rename.newUri.toString().toLocaleLowerCase();
            if (destinations.has(destination)) {
                throw new Error(`Mais de um arquivo produziria o mesmo destino: ${path.basename(rename.newUri.fsPath)}.`);
            }
            destinations.add(destination);
            try {
                await vscode.workspace.fs.stat(rename.newUri);
                throw new Error(`O arquivo de destino já existe: ${rename.newUri.fsPath}`);
            } catch (error) {
                const code = (error as {code?: string})?.code;
                if (code !== 'FileNotFound' && code !== 'ENOENT') {
                    throw error;
                }
            }
        }
    }

    private static handleCompletedFormRenames(event: vscode.FileRenameEvent): void {
        for (const file of event.files) {
            const key = formRenameKey(file.oldUri.fsPath, file.newUri.fsPath);
            const summary = FormExtension.formRenameSummaries.get(key);
            if (!summary) {
                continue;
            }
            FormExtension.formRenameSummaries.delete(key);
            void vscode.window.showInformationMessage(
                `Fluig Forms: formulário ${summary.oldName} renomeado para ${summary.newName}; `
                + `${summary.relatedCount} arquivo(s) vinculado(s) sincronizado(s).`
            );
        }
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
            readFileSync(vscode.Uri.joinPath(TemplateService.templatesUri, 'form.html').fsPath)
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
                : readFileSync(vscode.Uri.joinPath(TemplateService.formEventsUri, eventFilename).fsPath)
        );

        vscode.window.showTextDocument(eventUri);
    }
}
