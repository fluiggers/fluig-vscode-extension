import { ServerDTO } from "../models/ServerDTO";
import * as soap from 'soap';
import { window, workspace } from "vscode";
import { ServerService } from "./ServerService";
import { DocumentDTO } from "../models/DocumentDTO";
import { posix } from "path";
import { CustomizationEventsDTO } from "../models/CustomizationEventsDTO";

export class FormService {
    private static getUri(server: ServerDTO): string {
        const schema: string = server.ssl ? "https" : "http";
        const port: string = [80, 443].includes(server.port) ? "" : `:${server.port}`;

        return `${schema}://${server.host}${port}/webdesk/ECMCardIndexService?wsdl`
    }

    /**
     * Retorna uma lista com todos os formulários
     */
    public static async getForms(server: ServerDTO): Promise<DocumentDTO[]> {
        const params = {
            companyId: server.companyId,
            username: server.username,
            password: server.password,
            colleagueId: server.userCode
        };

        const forms: any = await new Promise((accept, reject) => {
            soap.createClient(FormService.getUri(server), (err: any, client: soap.Client) => {
                if (err) {
                    reject(err);
                    return;
                }

                client.getCardIndexesWithoutApprover(params, (err: any, response: any) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    accept(response);
                });
            });
        });

        return forms?.result?.item || [];
    }

    /**
     * Retorna uma lista com o nome dos arquivos referente ao documento
     */
     public static async getFileNames(server: ServerDTO, documentId: Number): Promise<string[]> {
        const params = {
            username: server.username,
            password: server.password,
            companyId: server.companyId,
            documentId: documentId,
            colleagueId: server.userCode
        };

        const forms: any = await new Promise((accept, reject) => {
            soap.createClient(FormService.getUri(server), (err: any, client: soap.Client) => {
                if (err) {
                    reject(err);
                    return;
                }

                client.getAttachmentsList(params, (err: any, response: any) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    accept(response);
                });
            });
        });

        if (!forms.result) {
            return [];
        }

        if (typeof forms.result.item === 'string') {
            return [forms.result.item];
        }

        return forms.result.item;
    }

    /**
     * Retorna o base64 referente ao arquivo
     */
     public static async getFileBase64(server: ServerDTO, documentId: number, version: number, fileName: string) {
        const params = {
            username: server.username,
            password: server.password,
            companyId: server.companyId,
            documentId: documentId,
            colleagueId: server.userCode,
            version: version,
            nomeArquivo: fileName
        };

        const file: any = await new Promise((accept, reject) => {
            soap.createClient(FormService.getUri(server), (err: any, client: soap.Client) => {
                if (err) {
                    reject(err);
                    return;
                }

                client.getCardIndexContent(params, (err: any, response: any) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    accept(response);
                });
            });
        });

        return file.folder;
    }

    /**
     * Retorna uma lista com os eventos do formulario
     */
     public static async getCustomizationEvents(server: ServerDTO, documentId: number): Promise<CustomizationEventsDTO[]> {
        const params = {
            username: server.username,
            password: server.password,
            companyId: server.companyId,
            documentId: documentId
        };

        const events: any = await new Promise((accept, reject) => {
            soap.createClient(FormService.getUri(server), (err: any, client: soap.Client) => {
                if (err) {
                    reject(err);
                    return;
                }

                client.getCustomizationEvents(params, (err: any, response: any) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    accept(response);
                });
            });
        });

        if (!events.result) {
            return [];
        }

        if (typeof events.result.item === 'string') {
            return [events.result.item];
        }

        return events.result.item;
    }

    /**
     * Retorna o formulário selecionado
     */
     public static async getOptionSelected(server: ServerDTO): Promise<DocumentDTO|undefined> {
        const forms = await FormService.getForms(server);
        const items = forms.map(form => ({
            label: form.documentId + ' - ' + form.documentDescription,
            detail: form.datasetName
        }));

        const result = await window.showQuickPick(items, {
            placeHolder: "Selecione o formulário"
        });

        if (!result) {
            return undefined;
        }

        const endPosition = result.label.indexOf(" - ");
        const documentId = result.label.substring(0, endPosition);
        const form = forms.find(form => form.documentId.toString() === documentId);

        return form;
    }

    /**
     * Realiza a importação de um formulário específico
     */
     public static async import() {
        if (!workspace.workspaceFolders) {
            window.showInformationMessage("Você precisa estar em um diretório / workspace.");
            return;
        }

        const server = await ServerService.getSelect();

        if (!server) {
            return;
        }

        const form = await FormService.getOptionSelected(server);

        if(!form) {
            return;
        }

        const folderName = form.documentDescription;
        const fileNames = await FormService.getFileNames(server, form.documentId);

        for (let fileName of fileNames) {
            const base64 = await FormService.getFileBase64(server, form.documentId, form.version, fileName);

            if (base64) {
                const fileContent = Buffer.from(base64, 'base64').toString('utf-8');
                FormService.saveFile(folderName, fileName, fileContent);
            }
        }

        const folder = posix.join(folderName, "events");
        const events = await FormService.getCustomizationEvents(server, form.documentId);

        for (let item of events) {
            FormService.saveFile(folder, item.eventId + ".js", item.eventDescription);
        }
    }

    /**
     * Criar arquivo do formulario
     */
     public static saveFile(folder: string, name: string, content: string) {
        if (!workspace.workspaceFolders) {
            window.showInformationMessage("Você precisa estar em um diretório / workspace.");
            return;
        }

        const workspaceFolderUri = workspace.workspaceFolders[0].uri;
        const path = workspaceFolderUri.with({ path: posix.join(workspaceFolderUri.path, "forms", folder, name) });

        workspace.fs.writeFile(path, Buffer.from(content, "utf-8"));
    }
}
