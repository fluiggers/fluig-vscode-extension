import * as path from "path";
import * as vscode from "vscode";
import { ServerService } from "./ServerService";
import { UtilsService } from "./UtilsService";
import { WorkflowProcessArtifactService } from "./WorkflowProcessArtifactService";

const { FluigProcessExportService: fluigProcessExportService } = require("./FluigProcessExportService");
const {
    ecm30PathForProcess,
    isWorkflowDiagramProcessPath,
    processImagePathForProcess,
} = require("./workflowProcessPath");

interface ReleaseChoice extends vscode.QuickPickItem {
    release: boolean;
}

interface PreparedExport {
    service: any;
    server: any;
    options: {
        processId: string;
        processPath: string;
        ecm30Path: string;
        svgPath?: string;
        newProcess: boolean;
        automaticMode: boolean;
        release: boolean;
    };
    plan: any;
}

export class WorkflowProcessExportService {
    public static async validate(processUri?: vscode.Uri): Promise<void> {
        try {
            const prepared = await WorkflowProcessExportService.prepare(processUri);
            if (!prepared) {
                return;
            }

            const document = await vscode.workspace.openTextDocument({
                language: "json",
                content: JSON.stringify(prepared.plan, null, 2),
            });
            await vscode.window.showTextDocument(document, { preview: false });
        } catch (error: any) {
            vscode.window.showErrorMessage(error?.message || String(error));
        }
    }

    public static async export(processUri?: vscode.Uri): Promise<void> {
        try {
            const prepared = await WorkflowProcessExportService.prepare(processUri);
            if (!prepared) {
                return;
            }

            if (
                prepared.server.confirmExporting &&
                !(await UtilsService.confirmPassword(prepared.server))
            ) {
                return;
            }

            const action = await vscode.window.showWarningMessage(
                `Exportar o processo ${prepared.options.processId} para ${prepared.server.name}?`,
                {
                    modal: true,
                    detail: WorkflowProcessExportService.formatPlan(prepared),
                },
                "Exportar"
            );
            if (action !== "Exportar") {
                return;
            }

            const result: any = await vscode.window.withProgress<any>(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Exportando processo ${prepared.options.processId}`,
                    cancellable: false,
                },
                () => prepared.service.export(
                    WorkflowProcessExportService.serverOptions(prepared.server),
                    { ...prepared.options, dryRun: false }
                )
            );

            vscode.window.showInformationMessage(
                `Processo ${result.processId} exportado como ${result.newProcess ? "novo processo" : "nova versão"}. ` +
                `Versão retornada: ${result.version}.`
            );
        } catch (error: any) {
            vscode.window.showErrorMessage(error?.message || String(error));
        }
    }

    private static async prepare(processUri?: vscode.Uri): Promise<PreparedExport | undefined> {
        const selectedUri = WorkflowProcessExportService.resolveProcessUri(processUri);
        if (!selectedUri) {
            return;
        }
        if (!isWorkflowDiagramProcessPath(selectedUri.fsPath)) {
            throw new Error("O arquivo .process deve estar diretamente em workflow/diagrams.");
        }

        const server = await ServerService.getSelect();
        if (!server) {
            return;
        }

        const releaseChoice = await vscode.window.showQuickPick<ReleaseChoice>(
            [
                {
                    label: "Exportar e liberar",
                    description: "Importa e libera a versão para uso.",
                    release: true,
                },
                {
                    label: "Exportar sem liberar",
                    description: "Importa a versão sem executar releaseProcess.",
                    release: false,
                },
            ],
            { placeHolder: "Selecione o estado final da versão" }
        );
        if (!releaseChoice) {
            return;
        }

        const processId = path.basename(selectedUri.fsPath, ".process");
        const diagramsFolder = path.dirname(selectedUri.fsPath);
        await WorkflowProcessArtifactService.ensureGenerated(selectedUri);
        const ecm30Path = ecm30PathForProcess(selectedUri.fsPath);
        const svgPath = processImagePathForProcess(selectedUri.fsPath);
        await vscode.workspace.fs.stat(vscode.Uri.file(ecm30Path));

        const options = {
            processId,
            processPath: selectedUri.fsPath,
            ecm30Path,
            svgPath,
            newProcess: false,
            automaticMode: true,
            release: releaseChoice.release,
        };
        const service = new fluigProcessExportService();
        const plan = await service.export(
            WorkflowProcessExportService.serverOptions(server),
            { ...options, dryRun: true }
        );

        return { service, server, options, plan };
    }

    private static resolveProcessUri(processUri?: vscode.Uri): vscode.Uri | undefined {
        const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
        const tabInput = activeTab?.input;
        const tabUri = tabInput instanceof vscode.TabInputText || tabInput instanceof vscode.TabInputCustom
            ? tabInput.uri
            : undefined;
        const selectedUri = processUri || vscode.window.activeTextEditor?.document.uri || tabUri;
        if (!selectedUri || path.extname(selectedUri.fsPath).toLowerCase() !== ".process") {
            vscode.window.showErrorMessage("Selecione um arquivo .process.");
            return;
        }
        return selectedUri;
    }

    private static serverOptions(server: any) {
        return {
            baseUrl: UtilsService.getHost(server),
            companyId: server.companyId,
            username: server.username,
            password: server.password,
            userCode: server.userCode,
        };
    }

    private static formatPlan(prepared: PreparedExport): string {
        const mode = prepared.options.automaticMode
            ? "automático (nova versão; se o código não existir, novo processo)"
            : prepared.options.newProcess ? "novo processo" : "nova versão";
        const release = prepared.options.release ? "sim" : "não";
        const operations = prepared.plan.steps
            .map((step: any) => `${step.order}. ${step.name}`)
            .join("\n");
        const files = prepared.plan.artifacts
            .map((artifact: any) => `${artifact.fileName} (${artifact.normalizedSize} bytes)`)
            .join("\n");

        return [
            `Destino: ${UtilsService.getHost(prepared.server)}`,
            `Empresa: ${prepared.server.companyId}`,
            `Modo: ${mode}`,
            `Liberar: ${release}`,
            "",
            "Arquivos:",
            files,
            "",
            "Operações:",
            operations,
        ].join("\n");
    }
}
