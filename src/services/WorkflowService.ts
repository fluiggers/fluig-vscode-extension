import { Uri, window } from 'vscode';
import { readFileSync } from "fs";
import { glob } from "glob";
import { UtilsService } from "./UtilsService";
import { ServerService } from "./ServerService";
import {LoginService} from "./LoginService";
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
                { label: "Não" , value: false },
                { label: "Sim" , value: true },
            ],
            { placeHolder: "Deseja atualizar múltiplos eventos?"}
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
}
