import { Uri, window } from 'vscode';
import { IZipEntry } from "adm-zip";
import { readFileSync } from "fs";
import { glob } from "glob";
import { UtilsService } from "./UtilsService";
import { ServerService } from "./ServerService";
import { LoginService } from "./LoginService";
import { ServerDTO } from '../models/ServerDTO';

export class WorkflowService {
    public static async updateEvents(eventUri: Uri) {
        const server = await ServerService.getSelect();

        if (!server) {
            return;
        }

        try {
            await UtilsService.validateServerHasFluiggersWidget(server);
        } catch (error: any) {
            window.showErrorMessage(error.message || error);
            return;
        }

        const processId: string = eventUri.path.replace(/.*\/workflow\/scripts\/([^.]+).+\.js$/, "$1");

        const lastProcessVersion: number = await WorkflowService.getLastWorkflowVersion(server, processId);

        if (lastProcessVersion === 0) {
            window.showErrorMessage("Processo não foi encontrado no servidor Fluig.");
            return;
        }

        const processVersionToUpdate: number = parseInt(
            await window.showInputBox(
                {
                    prompt: `Qual Versão do Processo pretende atualizar? (última versão: ${lastProcessVersion})`,
                    value: lastProcessVersion.toString()
                }
            )
            || "0"
        );

        if (processVersionToUpdate === 0) {
            return;
        }

        const updateMultipleChoice = await window.showQuickPick(
            [
                { label: "Não", value: false },
                { label: "Sim", value: true },
            ],
            { placeHolder: "Deseja atualizar múltiplos eventos?" }
        );

        if (!updateMultipleChoice) {
            return;
        }

        const selectedEventsToUpdate = [];

        if (updateMultipleChoice.value) {
            selectedEventsToUpdate.push(...await WorkflowService.getEventsToUpdate(processId))

            if (!selectedEventsToUpdate.length) {
                return;
            }
        } else {
            selectedEventsToUpdate.push({
                label: eventUri.path.replace(/.*\/workflow\/scripts\/[^.]+\.([^.]+)\.js$/, "$1"),
                path: eventUri.fsPath,
            });
        }

        if (server.confirmExporting && !(await UtilsService.confirmPassword(server))) {
            return;
        }

        const eventsToUpdate = [];

        for (const event of selectedEventsToUpdate) {
            eventsToUpdate.push({
                name: event.label,
                contents: readFileSync(event.path, "utf8")
            });
        }

        try {
            const response: any = await fetch(
                `${UtilsService.getHost(server)}/fluiggersWidget/api/workflows/${encodeURIComponent(processId)}/${processVersionToUpdate}/events`,
                {
                    method: "PUT",
                    headers: {
                        "Cookie": await LoginService.loginAndGetCookies(server),
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(eventsToUpdate),
                }
            )
                .then(r => {
                    if (!r.ok) {
                        throw `Não foi possível atualizar os eventos. ${r.statusText}`;
                    }

                    return r.json();
                });

            if (!response.hasError) {
                window.showInformationMessage("Todos os eventos foram atualizados");
                return;
            }

            window.showWarningMessage(
                "Ocorreram erros ao atualizar os eventos",
                {
                    detail: response.errors.join("\n"),
                    modal: true,
                }
            );

        } catch (error: any) {
            window.showErrorMessage(error.message || error);
        }
    }

    public static async getEventsToUpdate(processId: string) {
        const eventsFolderUri = Uri.joinPath(UtilsService.getWorkspaceUri(), "workflow", "scripts");

        const allEvents = glob.sync(`${eventsFolderUri.fsPath}/${processId}.*.js`).map(path => {
            return {
                label: path.replace(/.*[/\\]+workflow[/\\]+scripts[/\\]+[^.]+\.([^.]+)\.js$/, "$1"),
                path: path,
            };
        });

        allEvents.sort((a, b) => a.label.localeCompare(b.label));

        return await window.showQuickPick(allEvents, {
            placeHolder: "Selecione os eventos para atualizar",
            canPickMany: true
        }) || [];
    }

    public static async getLastWorkflowVersion(server: ServerDTO, processId: string): Promise<number> {
        return await fetch(
            `${UtilsService.getHost(server)}/fluiggersWidget/api/workflows/${encodeURIComponent(processId)}/version`,
            {
                method: "GET",
                headers: { 'Cookie': await LoginService.loginAndGetCookies(server) }
            }
        )
            .then(async r => {
                if (!r.ok) {
                    return 0;
                }

                const version = await r.text();
                return parseInt(version);
            });
    }

    public static async listProcesses(server: ServerDTO): Promise<Array<{
        processId: string;
        description: string;
        version: number;
        active: boolean;
    }>> {

        return await fetch(
            `${UtilsService.getHost(server)}/fluiggersWidget/api/workflows`,
            {
                method: "GET",
                headers: {
                    Cookie: await LoginService.loginAndGetCookies(server)
                }
            }
        )
            .then(async r => {
                if (!r.ok) {
                    throw new Error(`Não foi possível buscar os processos. ${r.statusText}`);
                }

                return await r.json() as Array<{
                    processId: string;
                    description: string;
                    version: number;
                    active: boolean;
                }>;
            });
    }

    public static async importProcesses() {
        const server = await ServerService.getSelect();
        if (!server) return;

        let processes;

        try {
            processes = await WorkflowService.listProcesses(server);
        } catch (e: any) {
            window.showErrorMessage(e.message || e);
            return;
        }

        const selected = await window.showQuickPick(
            processes.map(p => ({
                label: `${p.processId} (v${p.version})`,
                description: p.description,
                processId: p.processId,
                version: p.version
            })),
            {
                placeHolder: "Selecione os processos para exportar",
                canPickMany: true
            }
        );

        if (!selected?.length) return;

        if (server.confirmExporting && !(await UtilsService.confirmPassword(server))) {
            return;
        }

        const workspace = UtilsService.getWorkspaceUri();

        for (const proc of selected) {
            try {
                await WorkflowService.importProcess(
                    server,
                    proc.processId,
                    proc.version,
                    workspace
                );
            } catch (e: any) {
                window.showErrorMessage(`Erro ao importar ${proc.processId}: ${e.message || e}`);
            }
        }

        window.showInformationMessage("Processos importados com sucesso!");
    }

    public static async importProcess(
        server: ServerDTO,
        processId: string,
        version: number,
        workspace: Uri
    ) {
        const fs = require("fs");
        const path = require("path");
        const AdmZip = require("adm-zip");

        const host = UtilsService.getHost(server);
        const cookie = await LoginService.loginAndGetCookies(server);

        const zipResponse = await fetch(
            `${host}/ecm/api/rest/ecm/processdefinition/exportProcessToZip?processId=${encodeURIComponent(processId)}&version=${version}`,
            {
                method: "GET",
                headers: {
                    Cookie: cookie
                }
            }
        );

        if (!zipResponse.ok) {
            throw new Error(`Erro ao baixar ZIP: ${zipResponse.statusText}`);
        }

        const zipBuffer = Buffer.from(await zipResponse.arrayBuffer());

        const zip = new AdmZip(zipBuffer);
        const entries = zip.getEntries();

        const processEntry = entries.find((e: IZipEntry) =>
            !e.isDirectory &&
            e.entryName.endsWith(".xml")
        );

        if (!processEntry) {
            throw new Error("Arquivo .xml não encontrado no ZIP do Fluig");
        }

        const processContent = processEntry.getData();


        const scriptsResponse = await fetch(
            `${host}/fluiggersWidget/api/workflows/${encodeURIComponent(processId)}/${version}/import`,
            {
                method: "GET",
                headers: {
                    Cookie: cookie
                }
            }
        );

        if (!scriptsResponse.ok) {
            throw new Error(`Erro ao buscar scripts: ${scriptsResponse.statusText}`);
        }

        type ProcessExport = {
            events: { name: string; script: string }[];
        };

        const scriptsData = await scriptsResponse.json() as ProcessExport;
        const workflowDir = path.join(workspace.fsPath, "workflow");
        const diagramsDir = path.join(workflowDir, "diagrams");
        const scriptsDir = path.join(workflowDir, "scripts");

        if (!fs.existsSync(workflowDir)) {
            throw new Error("Pasta 'workflow' não encontrada na workspace.");
        }

        if (!fs.existsSync(diagramsDir)) {
            fs.mkdirSync(diagramsDir, { recursive: true });
        }

        if (!fs.existsSync(scriptsDir)) {
            fs.mkdirSync(scriptsDir, { recursive: true });
        }

        const processFilePath = path.join(diagramsDir, `${processId}.xml`);
        fs.writeFileSync(processFilePath, processContent);

        for (const ev of (scriptsData.events || [])) {
            if (!ev?.name) continue;

            const scriptFileName = `${processId}.${ev.name}.js`;
            const scriptFilePath = path.join(scriptsDir, scriptFileName);

            fs.writeFileSync(scriptFilePath, ev.script || "", "utf8");
        }
    }
}
