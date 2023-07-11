import axios from "axios";
import { ServerDTO } from "../models/ServerDTO";
import { UtilsService } from "./UtilsService";
import * as https from 'https';
import { GlobalEventDTO } from "../models/GlobalEventDTO";
import { window, workspace, Uri } from "vscode";
import { ServerService } from "./ServerService";
import * as path from "path";

export class GlobalEventService {

    /**
     * Retorna uma lista com todos os eventos globais
     */
    public static async getEventList(server: ServerDTO): Promise<GlobalEventDTO[]> {
        const host = UtilsService.getHost(server);
        const endpoint = `${host}/ecm/api/rest/ecm/globalevent/getEventList?username=${encodeURIComponent(server.username)}&password=${encodeURIComponent(server.password)}`;

        const agent = new https.Agent({
            rejectUnauthorized: false
        });

        const result = await axios.get(endpoint, {
            httpsAgent: agent
        });

        return result.data;
    }

    /**
     * Retorna o evento global selecionado
     */
     public static async getOptionSelected(server: ServerDTO): Promise<GlobalEventDTO | undefined> {
        const eventList = await GlobalEventService.getEventList(server);
        const items = eventList.map(event => ({ label: event.globalEventPK.eventId }));
        const result = await window.showQuickPick(items, {
            placeHolder: "Selecione o evento"
        });

        if (!result) {
            return;
        }

        return eventList.find(event => {return event.globalEventPK.eventId === result.label});
    }

    /**
     * Retorna o evento global selecionado
     */
     public static async getOptionsSelected(server: ServerDTO): Promise<GlobalEventDTO[] | undefined> {
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
     public static async import() {
        const server = await ServerService.getSelect();

        if (!server) {
            return;
        }

        const event = await GlobalEventService.getOptionSelected(server);

        if (!event) {
            return;
        }

        GlobalEventService.saveFile(
            event.globalEventPK.eventId,
            event.eventDescription
        );
    }

    /**
     * Realiza a importação de vários eventos globais
     */
    public static async importMany() {
        const server = await ServerService.getSelect();

        if (!server) {
            return;
        }

        const eventList = await GlobalEventService.getOptionsSelected(server);

        if (!eventList) {
            return;
        }

        eventList.map(async event => {
            GlobalEventService.saveFile(
                event.globalEventPK.eventId,
                event.eventDescription
            );
        });
    }

    /**
     * Criar arquivo de evento global
     */
     public static async saveFile(name: string, content: string) {
        const uri = Uri.joinPath(UtilsService.getWorkspaceUri(), "events", name + ".js");

        await workspace.fs.writeFile(
            uri,
            Buffer.from(content, "utf-8")
        );

        window.showInformationMessage("Evento global " + name + " importado com sucesso!");
    }
}
