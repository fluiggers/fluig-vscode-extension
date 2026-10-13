import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { readEcm30Events } from "../core/ecm30/events";
import { generateEcm30 } from "../core/ecm30/generate";

const {
    writeEcm30Artifact,
    writeProcessImageArtifact,
} = require("./Ecm30GenerationService");
const {
    ecm30PathForProcess,
    isWorkflowDiagramProcessPath,
    processImagePathForProcess,
} = require("./workflowProcessPath");
const { renderProcessImageSvg } = require("../bpmn/processImage");

export class WorkflowProcessArtifactService {
    private static context: vscode.ExtensionContext;
    private static output: vscode.OutputChannel;
    private static timers = new Map<string, NodeJS.Timeout>();
    private static running = new Map<string, Promise<any>>();
    private static rerun = new Set<string>();
    private static lastErrors = new Map<string, string>();

    public static initialize(context: vscode.ExtensionContext): void {
        WorkflowProcessArtifactService.context = context;
        WorkflowProcessArtifactService.output = vscode.window.createOutputChannel("Fluig ECM30");
        context.subscriptions.push(WorkflowProcessArtifactService.output);

        context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => {
            WorkflowProcessArtifactService.scheduleAutomaticGeneration(document.uri);
        }));

        const watcher = vscode.workspace.createFileSystemWatcher("**/workflow/diagrams/*.process");
        context.subscriptions.push(watcher);
        context.subscriptions.push(watcher.onDidChange(uri => {
            WorkflowProcessArtifactService.scheduleAutomaticGeneration(uri);
        }));
        context.subscriptions.push(watcher.onDidCreate(uri => {
            WorkflowProcessArtifactService.scheduleAutomaticGeneration(uri);
        }));
        context.subscriptions.push(watcher.onDidDelete(uri => {
            WorkflowProcessArtifactService.cancelAutomaticGeneration(uri);
        }));
    }

    public static async generate(processUri?: vscode.Uri): Promise<void> {
        const selectedUri = WorkflowProcessArtifactService.resolveProcessUri(processUri);
        if (!selectedUri) {
            return;
        }

        try {
            await WorkflowProcessArtifactService.generateForUri(selectedUri, true);
        } catch (error: any) {
            vscode.window.showErrorMessage(error?.message || String(error));
        }
    }

    /**
     * Com serverVersion (exportação), regenera sempre para essa versão, porque o ECM30 do save usa
     * fluiggers.fluigRuntimeVersion. Devolve os avisos da geração (vazio se nada foi gerado).
     */
    public static async ensureGenerated(processUri: vscode.Uri, serverVersion?: string): Promise<string[]> {
        if (!isWorkflowDiagramProcessPath(processUri.fsPath)) {
            throw new Error("O arquivo .process deve estar diretamente em workflow/diagrams.");
        }

        const key = path.normalize(processUri.fsPath).toLowerCase();
        WorkflowProcessArtifactService.cancelAutomaticGeneration(processUri);

        const running = WorkflowProcessArtifactService.running.get(key);
        if (running) {
            await running;
        }

        if (!serverVersion) {
            const outputUris = [
                vscode.Uri.file(ecm30PathForProcess(processUri.fsPath)),
                vscode.Uri.file(processImagePathForProcess(processUri.fsPath)),
            ];
            try {
                const [processStat, ...outputStats] = await Promise.all([
                    vscode.workspace.fs.stat(processUri),
                    ...outputUris.map(outputUri => vscode.workspace.fs.stat(outputUri)),
                ]);
                if (outputStats.every(outputStat => outputStat.mtime + 1000 >= processStat.mtime)) {
                    return [];
                }
            } catch (_error) {
                // Ausente ou desatualizado: a geração abaixo produzirá os artefatos.
            }
        }

        const operation = WorkflowProcessArtifactService.generateForUri(processUri, false, serverVersion);
        WorkflowProcessArtifactService.running.set(key, operation);
        try {
            const generated = await operation;
            WorkflowProcessArtifactService.lastErrors.delete(key);
            return generated.warnings;
        } finally {
            WorkflowProcessArtifactService.running.delete(key);
            if (WorkflowProcessArtifactService.rerun.delete(key)) {
                WorkflowProcessArtifactService.scheduleAutomaticGeneration(processUri);
            }
        }
    }

    /** Cancels the pending automatic generation and waits for a running one, so the .process can be renamed safely. */
    public static async settle(processUri: vscode.Uri): Promise<void> {
        const key = path.normalize(processUri.fsPath).toLowerCase();
        WorkflowProcessArtifactService.cancelAutomaticGeneration(processUri);
        await WorkflowProcessArtifactService.running.get(key)?.catch(() => undefined);
    }

    private static scheduleAutomaticGeneration(uri: vscode.Uri): void {
        if (!isWorkflowDiagramProcessPath(uri.fsPath)) {
            return;
        }
        const enabled = vscode.workspace
            .getConfiguration("fluiggers")
            .get<boolean>("generateEcm30OnSave", true);
        if (!enabled) {
            return;
        }

        const key = path.normalize(uri.fsPath).toLowerCase();
        const previous = WorkflowProcessArtifactService.timers.get(key);
        if (previous) {
            clearTimeout(previous);
        }
        WorkflowProcessArtifactService.timers.set(key, setTimeout(() => {
            WorkflowProcessArtifactService.timers.delete(key);
            void WorkflowProcessArtifactService.runAutomaticGeneration(uri, key);
        }, 700));
    }

    private static cancelAutomaticGeneration(uri: vscode.Uri): void {
        const key = path.normalize(uri.fsPath).toLowerCase();
        const pending = WorkflowProcessArtifactService.timers.get(key);
        if (pending) {
            clearTimeout(pending);
        }
        WorkflowProcessArtifactService.timers.delete(key);
        WorkflowProcessArtifactService.rerun.delete(key);
        WorkflowProcessArtifactService.lastErrors.delete(key);
    }

    private static async runAutomaticGeneration(uri: vscode.Uri, key: string): Promise<void> {
        try {
            await vscode.workspace.fs.stat(uri);
        } catch (_error) {
            // The .process was renamed or deleted after scheduling; the new path schedules its own generation.
            return;
        }
        if (WorkflowProcessArtifactService.running.has(key)) {
            WorkflowProcessArtifactService.rerun.add(key);
            return;
        }

        const operation = WorkflowProcessArtifactService.generateForUri(uri, false);
        WorkflowProcessArtifactService.running.set(key, operation);
        try {
            const written = await operation;
            WorkflowProcessArtifactService.lastErrors.delete(key);
            WorkflowProcessArtifactService.output.appendLine(
                `[${new Date().toISOString()}] ECM30 atualizado: ${written.filePath} (${written.bytes} bytes)`
            );
            vscode.window.setStatusBarMessage(
                `$(check) ECM30 atualizado: ${path.basename(uri.fsPath, ".process")}`,
                3000
            );
        } catch (error: any) {
            const message = error?.message || String(error);
            WorkflowProcessArtifactService.output.appendLine(
                `[${new Date().toISOString()}] Falha em ${uri.fsPath}: ${message}`
            );
            if (WorkflowProcessArtifactService.lastErrors.get(key) !== message) {
                WorkflowProcessArtifactService.lastErrors.set(key, message);
                vscode.window.showWarningMessage(
                    `ECM30 nao foi atualizado: ${message}`,
                    "Ver log"
                ).then(action => {
                    if (action === "Ver log") {
                        WorkflowProcessArtifactService.output.show(true);
                    }
                });
            }
        } finally {
            WorkflowProcessArtifactService.running.delete(key);
            if (WorkflowProcessArtifactService.rerun.delete(key)) {
                WorkflowProcessArtifactService.scheduleAutomaticGeneration(uri);
            }
        }
    }

    private static async generateForUri(uri: vscode.Uri, interactive: boolean, serverVersion?: string): Promise<any> {
        if (!isWorkflowDiagramProcessPath(uri.fsPath)) {
            throw new Error("O arquivo .process deve estar diretamente em workflow/diagrams.");
        }

        const processId = path.basename(uri.fsPath, ".process");
        const processText = fs.readFileSync(uri.fsPath, "utf8");
        // No save não há servidor: vale fluiggers.fluigRuntimeVersion; vazio = versão desconhecida (todos os campos).
        const version = serverVersion
            || vscode.workspace.getConfiguration("fluiggers").get<string>("fluigRuntimeVersion", "1.8.2")
            || undefined;
        const generated = generateEcm30(
            { processText, baseName: processId, events: readEcm30Events(uri.fsPath) },
            version
        );

        const written = writeEcm30Artifact(ecm30PathForProcess(uri.fsPath), Buffer.from(generated.xml, "utf8"));
        // The process image is always generated with the ECM30: Fluig needs it to open the flow drawing.
        writeProcessImageArtifact(processImagePathForProcess(uri.fsPath), renderProcessImageSvg(processText));
        for (const warning of generated.warnings) {
            WorkflowProcessArtifactService.output.appendLine(`[${new Date().toISOString()}] ${processId}: ${warning}`);
        }
        if (interactive) {
            const backup = written.backupPath
                ? ` Backup anterior: ${written.backupPath}.`
                : "";
            vscode.window.showInformationMessage(
                `ECM30 de ${processId} gerado (${written.bytes} bytes).${backup}`
            );
        }
        return { ...written, warnings: generated.warnings };
    }

    private static resolveProcessUri(processUri?: vscode.Uri): vscode.Uri | undefined {
        const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
        const tabInput = activeTab?.input;
        const tabUri = tabInput instanceof vscode.TabInputText || tabInput instanceof vscode.TabInputCustom
            ? tabInput.uri
            : undefined;
        const selectedUri = processUri || vscode.window.activeTextEditor?.document.uri || tabUri;
        if (!selectedUri || !isWorkflowDiagramProcessPath(selectedUri.fsPath)) {
            vscode.window.showErrorMessage("Selecione um arquivo .process.");
            return;
        }
        return selectedUri;
    }
}
