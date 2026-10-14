import { readFileSync } from "fs";
import * as vscode from "vscode";
import { TemplateService } from "./TemplateService";
import { UtilsService } from "./UtilsService";
import { WorkflowProcessScaffoldService } from "./WorkflowProcessScaffoldService";

const { normalizeProcessCode } = require("../bpmn/processIdentity");
const { buildInitialProcess } = require("../bpmn/processScaffold");
const { fluigProjectEntries } = require("./fluigProject");

export class FluigProjectService {
    /**
     * Cria um projeto Fluig com a estrutura do Studio, um processo inicial e o formulário `form_<nome>`
     * vinculado, dentro da pasta clicada ou, sem ela, da primeira pasta do workspace.
     */
    public static async create(context: vscode.ExtensionContext, resourceUri?: vscode.Uri): Promise<void> {
        try {
            const parent = resourceUri instanceof vscode.Uri ? resourceUri : UtilsService.getWorkspaceUri();
            const name = await vscode.window.showInputBox({
                title: "Novo Projeto Fluig",
                prompt: "Informe o nome do projeto (também é o código do processo inicial)",
                placeHolder: "meu_projeto",
                ignoreFocusOut: true,
                validateInput: (value) => {
                    try {
                        normalizeProcessCode(value);
                        return undefined;
                    } catch (error) {
                        return error instanceof Error ? error.message : String(error);
                    }
                }
            });
            if (!name) {
                return;
            }

            const code: string = normalizeProcessCode(name);
            const projectUri = vscode.Uri.joinPath(parent, code);
            if (await this.exists(projectUri)) {
                throw new Error(`Já existe uma pasta ${code} em ${vscode.workspace.asRelativePath(parent)}.`);
            }

            // Tudo é montado antes da primeira gravação: erro de montagem não deixa projeto pela metade.
            const templateText = await WorkflowProcessScaffoldService.loadCreationTemplate(context);
            const process = buildInitialProcess(templateText, code, { poolName: code, form: `form_${code}` });
            const literals = new Map(["pt_BR", "en_US", "es"].map((locale) => {
                const file = process.translationPlan.files.get(locale);
                if (!file) {
                    throw new Error(`Tradução inicial ausente: ${locale}.`);
                }
                return [locale, file.content];
            }));
            const formHtml = readFileSync(vscode.Uri.joinPath(TemplateService.templatesUri, "form.html").fsPath, "utf8");
            const entries = fluigProjectEntries(code, { processText: process.text, literals, formHtml });

            for (const entry of entries) {
                const target = vscode.Uri.joinPath(projectUri, entry.path);
                try {
                    if (entry.content === undefined) {
                        await vscode.workspace.fs.createDirectory(target);
                    } else {
                        await vscode.workspace.fs.writeFile(target, Buffer.from(entry.content, "utf8"));
                    }
                } catch (error) {
                    throw new Error(
                        `falha ao gravar ${vscode.workspace.asRelativePath(target)}; o que já foi criado continua em `
                        + `${vscode.workspace.asRelativePath(projectUri)}. ${error instanceof Error ? error.message : String(error)}`
                    );
                }
            }

            const processUri = vscode.Uri.joinPath(projectUri, "workflow", "diagrams", `${code}.process`);
            await vscode.commands.executeCommand("vscode.openWith", processUri, "fluigBpmn.processEditor");
            void vscode.window.showInformationMessage(`Projeto ${code} criado em ${vscode.workspace.asRelativePath(projectUri)}.`);
        } catch (error) {
            void vscode.window.showErrorMessage(
                `Não foi possível criar o projeto: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private static async exists(uri: vscode.Uri): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(uri);
            return true;
        } catch {
            return false;
        }
    }
}
