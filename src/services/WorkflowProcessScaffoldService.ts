import * as path from "path";
import { gunzipSync } from "zlib";
import * as vscode from "vscode";

const { normalizeProcessCode } = require("../bpmn/processIdentity");
const { buildProcessScaffold } = require("../bpmn/processScaffold");

export class WorkflowProcessScaffoldService {
    public static async create(context: vscode.ExtensionContext, resourceUri?: vscode.Uri): Promise<void> {
        try {
            const projectRoot = await this.resolveProjectRoot(resourceUri);
            const processCode = await vscode.window.showInputBox({
                title: "Novo Diagrama de Processo Fluig",
                prompt: "Informe o codigo do processo",
                placeHolder: "meu_processo",
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
            if (!processCode) return;

            const code = normalizeProcessCode(processCode);
            const diagramsDirectory = vscode.Uri.joinPath(projectRoot, "workflow", "diagrams");
            const literalsDirectory = vscode.Uri.joinPath(projectRoot, "workflow", "literals");
            const processUri = vscode.Uri.joinPath(diagramsDirectory, `${code}.process`);
            const literalUris = new Map([
                ["pt_BR", vscode.Uri.joinPath(literalsDirectory, `${code}_pt_BR.properties`)],
                ["en_US", vscode.Uri.joinPath(literalsDirectory, `${code}_en_US.properties`)],
                ["es", vscode.Uri.joinPath(literalsDirectory, `${code}_es.properties`)]
            ]);

            await this.assertCodeAvailable(diagramsDirectory, code);
            await this.assertTargetsAvailable([processUri, ...literalUris.values()]);

            const encodedTemplateUri = vscode.Uri.joinPath(
                context.extensionUri,
                "runtime",
                "bpmn",
                "creation-template.process.gz.b64"
            );
            const encodedTemplate = Buffer.from(await vscode.workspace.fs.readFile(encodedTemplateUri))
                .toString("ascii")
                .replace(/\s+/g, "");
            if (!encodedTemplate) throw new Error("O template BPMN empacotado esta vazio.");
            const templateText = gunzipSync(Buffer.from(encodedTemplate, "base64")).toString("utf8");
            const scaffold = buildProcessScaffold(templateText, code);

            await vscode.workspace.fs.createDirectory(diagramsDirectory);
            await vscode.workspace.fs.createDirectory(literalsDirectory);
            await vscode.workspace.fs.writeFile(processUri, Buffer.from(scaffold.text, "ascii"));
            for (const [locale, uri] of literalUris) {
                const file = scaffold.translationPlan.files.get(locale);
                if (!file) throw new Error(`Traducao inicial ausente: ${locale}.`);
                await vscode.workspace.fs.writeFile(uri, Buffer.from(file.content, "ascii"));
            }

            await vscode.commands.executeCommand("vscode.openWith", processUri, "fluigBpmn.processEditor");
            void vscode.window.showInformationMessage(
                `Processo ${code} criado em workflow/diagrams com traducoes pt_BR, en_US e es.`
            );
        } catch (error) {
            void vscode.window.showErrorMessage(
                `Nao foi possivel criar o diagrama: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private static async resolveProjectRoot(resourceUri?: vscode.Uri): Promise<vscode.Uri> {
        const selected = resourceUri ?? vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!selected) throw new Error("Selecione a pasta raiz de um projeto Fluig no Explorer.");
        const selectedStat = await vscode.workspace.fs.stat(selected);
        if ((selectedStat.type & vscode.FileType.Directory) === 0) {
            throw new Error("O comando deve ser executado sobre uma pasta do projeto.");
        }
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(selected);
        if (!workspaceFolder) throw new Error("A pasta selecionada nao pertence ao workspace atual.");

        const workspaceRoot = path.resolve(workspaceFolder.uri.fsPath);
        let current = path.resolve(selected.fsPath);
        while (this.isInside(current, workspaceRoot)) {
            if (path.basename(current).toLowerCase() === "workflow") {
                return vscode.Uri.file(path.dirname(current));
            }
            const candidate = vscode.Uri.file(current);
            if (await this.existsDirectory(vscode.Uri.joinPath(candidate, "workflow"))
                || await this.exists(vscode.Uri.joinPath(candidate, ".project"))) {
                return candidate;
            }
            if (current === workspaceRoot) return workspaceFolder.uri;
            const parent = path.dirname(current);
            if (parent === current) break;
            current = parent;
        }
        throw new Error("Selecione a pasta raiz de um projeto Fluig.");
    }

    private static isInside(candidate: string, root: string): boolean {
        const relative = path.relative(root, candidate);
        return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
    }

    private static async assertCodeAvailable(diagramsDirectory: vscode.Uri, code: string): Promise<void> {
        if (!await this.existsDirectory(diagramsDirectory)) return;
        const requested = `${code}.process`.toLocaleLowerCase("en-US");
        const entries = await vscode.workspace.fs.readDirectory(diagramsDirectory);
        if (entries.some(([name, type]) => (
            (type & vscode.FileType.File) !== 0 && name.toLocaleLowerCase("en-US") === requested
        ))) {
            throw new Error(`Ja existe um processo com o codigo ${code}.`);
        }
    }

    private static async assertTargetsAvailable(targets: vscode.Uri[]): Promise<void> {
        for (const target of targets) {
            if (await this.exists(target)) throw new Error(`O arquivo ${path.basename(target.fsPath)} ja existe.`);
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

    private static async existsDirectory(uri: vscode.Uri): Promise<boolean> {
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            return (stat.type & vscode.FileType.Directory) !== 0;
        } catch {
            return false;
        }
    }
}
