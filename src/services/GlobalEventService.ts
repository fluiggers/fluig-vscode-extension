import { ServerDTO } from "../models/ServerDTO";
import { UtilsService } from "./UtilsService";
import { GlobalEventDTO } from "../models/GlobalEventDTO";
import { window, workspace, Uri, ProgressLocation } from "vscode";
import { ServerService } from "./ServerService";
import { basename } from "path";
import { readFileSync } from "fs";
import {LoginService} from "./LoginService";

const basePath = "/ecm/api/rest/ecm/globalevent/";

const headers = new Headers({
    "Accept": "application/json",
    "Content-Type": "application/json",

});

export class GlobalEventService {
    /**
     * Retorna uma lista com todos os eventos globais
     */
    private static async getEventList(server: ServerDTO): Promise<GlobalEventDTO[]> {
        return (await GlobalEventService.tryGetEventList(server)) ?? [];
    }

    /**
     * Lê a lista inteira. Devolve undefined quando a leitura falha: quem grava a lista inteira precisa
     * distinguir "não há eventos" de "não consegui ler", senão uma falha apaga os eventos do servidor.
     */
    private static async tryGetEventList(server: ServerDTO): Promise<GlobalEventDTO[] | undefined> {
        try {
            headers.set('Cookie', await LoginService.loginAndGetCookies(server));
            const response:any = await fetch(
                UtilsService.getRestUrl(server, basePath, "getEventList"),
                { headers }
            ).then(r => r.json());

            if (response.message) {
                window.showErrorMessage(response.message.message);
                return undefined;
            }

            if (!Array.isArray(response)) {
                window.showErrorMessage("Resposta inesperada ao ler a lista de Eventos Globais.");
                return undefined;
            }

            return response;
        } catch (error: any) {
            window.showErrorMessage(error.message || error);
        }

        return undefined;
    }

    private static async saveEventList(server: ServerDTO, globalEvents: GlobalEventDTO[]) {
        const requestOptions = {
            method: 'post',
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
                'Cookie': await LoginService.loginAndGetCookies(server)
            },
            body: JSON.stringify(globalEvents),
        };

        try {
            return await fetch(
                UtilsService.getRestUrl(server, basePath, "saveEventList"),
                requestOptions
            ).then(r => r.json());
        } catch (error: any) {
            window.showErrorMessage(error.message || error);
        }
    }

    /**
     * Retorna o evento global selecionado
     */
    private static async getOptionSelected(server: ServerDTO): Promise<GlobalEventDTO | undefined> {
        const eventList = await GlobalEventService.getEventList(server);
        const items = eventList.map(event => ({ label: event.globalEventPK.eventId }));
        const result = await window.showQuickPick(items, {
            placeHolder: "Selecione o evento"
        });

        if (!result) {
            return;
        }

        return eventList.find(event => event.globalEventPK.eventId === result.label);
    }

    /**
     * Retorna o evento global selecionado
     */
    private static async getOptionsSelected(server: ServerDTO): Promise<GlobalEventDTO[] | undefined> {
        const eventList = await GlobalEventService.getEventList(server);
        const items = eventList.map(event => ({ label: event.globalEventPK.eventId }));
        const result = await window.showQuickPick(items, {
            placeHolder: "Selecione os eventos",
            canPickMany: true
        });

        if (!result) {
            return;
        }

        const retEventList: GlobalEventDTO[] = [];
        for(let item of result) {
            for(let event of eventList) {
                if(event.globalEventPK.eventId === item.label) {
                    retEventList.push(event);
                }
            }
        }

        return retEventList;
    }

    /**
     * Realiza a importação de um evento global
     */
    public static async import(resourceUri?: Uri) {
        const server = await ServerService.getSelect();

        if (!server) {
            return;
        }

        const event = await GlobalEventService.getOptionSelected(server);

        if (!event) {
            return;
        }

        GlobalEventService.saveFile(
            await UtilsService.getProjectUri(resourceUri),
            event.globalEventPK.eventId,
            event.eventDescription
        );
    }

    /**
     * Realiza a importação de vários eventos globais
     */
    public static async importMany(resourceUri?: Uri) {
        const server = await ServerService.getSelect();

        if (!server) {
            return;
        }

        const eventList = await GlobalEventService.getOptionsSelected(server);

        if (!eventList || !eventList.length) {
            return;
        }

        const projectUri = await UtilsService.getProjectUri(resourceUri);
        const results = await window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: "Importando Eventos Globais.",
                cancellable: false
            },
            progress => {
                const increment = 100 / eventList.length;
                let current = 0;

                progress.report({ increment: 0 });

                return Promise.all(eventList.map(async event => {
                    GlobalEventService.saveFile(
                        projectUri,
                        event.globalEventPK.eventId,
                        event.eventDescription,
                        false
                    );
                    current += increment;
                    progress.report({ increment: current });
                    return true;
                }));
            }
        );

        window.showInformationMessage(`${results.length} Eventos Globais foram importados em ${workspace.asRelativePath(Uri.joinPath(projectUri, "events"))}.`);
    }

    public static async export(fileUri: Uri) {
        const server = await ServerService.getSelect();

        if (!server) {
            return;
        }

        const globalEvents = await GlobalEventService.tryGetEventList(server);
        const globalEventId: string = basename(fileUri.fsPath, '.js');

        // A gravação envia a lista inteira: sem a lista atual, não grava, senão os outros eventos somem.
        if (!globalEvents) {
            window.showErrorMessage(`Evento Global ${globalEventId} não exportado: a lista atual não pôde ser lida. Nada foi alterado no servidor.`);
            return;
        }

        const globalEventStructure: GlobalEventDTO = {
            globalEventPK: {
                companyId: server.companyId,
                eventId: globalEventId
            },
            eventDescription: readFileSync(fileUri.fsPath, 'utf8')
        };

        const index = globalEvents.findIndex(globalEvent => globalEvent.globalEventPK.eventId === globalEventId);

        if (index === -1) {
            globalEvents.push(globalEventStructure);
        } else {
            globalEvents[index] = globalEventStructure;
        }

        let result: any = undefined;

        // Validar senha antes de exportar
        if (server.confirmExporting && !(await UtilsService.confirmPassword(server))) {
            return;
        }

        result = await GlobalEventService.saveEventList(server, globalEvents);

        if (result.content === 'OK') {
            window.showInformationMessage(`Evento Global ${globalEventId} exportado com sucesso!`);
        } else {
            window.showErrorMessage(`Falha ao exportar o Evento Global ${globalEventId}!\n${result?.message?.message}`);
        }
    }

    public static async delete() {
        const server = await ServerService.getSelect();

        if (!server) {
            return;
        }

        const eventList = await GlobalEventService.getOptionsSelected(server);

        if (!eventList) {
            return;
        }

        // Validar senha antes de deletar
        if (server.confirmExporting && !(await UtilsService.confirmPassword(server))) {
            return;
        }

        // Uma requisição por evento, em sequência, com a URL montada em cada uma: a URL compartilhada
        // fazia todas as requisições saírem com o último nome da seleção.
        for (const event of eventList) {
            const url = UtilsService.getRestUrl(server, basePath, "deleteGlobalEvent");
            url.searchParams.set("eventName", event.globalEventPK.eventId);

            headers.set('Cookie', await LoginService.loginAndGetCookies(server));
            const result:any = await fetch(
                url,
                { method: "DELETE",  headers }
            ).then(r => r.json());

            if (result.content === "OK") {
                window.showInformationMessage(`Evento Global ${event.globalEventPK.eventId} removido com sucesso!`);
            } else {
                window.showErrorMessage(`Erro ao remover Evento Global ${event.globalEventPK.eventId}!\n${result.message.message}`);
            }
        }
    }

    /**
     * Criar arquivo de evento global
     */
     public static async saveFile(projectUri: Uri, name: string, content: string, openFile: boolean = true) {
        const uri = Uri.joinPath(projectUri, "events", name + ".js");

        await workspace.fs.writeFile(
            uri,
            Buffer.from(content, "utf-8")
        );

        if (openFile) {
            window.showTextDocument(uri);
            window.showInformationMessage(`Evento global ${name} importado em ${workspace.asRelativePath(uri)}!`);
        }
    }
}
