import { ServerDTO } from "../models/ServerDTO";
import { Uri } from "vscode";
import * as soap from 'soap';
import { window, workspace } from "vscode";
import { ServerService } from "./ServerService";
import { DocumentDTO } from "../models/DocumentDTO";
import { CustomizationEventsDTO } from "../models/CustomizationEventsDTO";
import { UtilsService } from "./UtilsService";

export class FormService {

    private static getUri(server: ServerDTO): string {
        return UtilsService.getHost(server) +  "/webdesk/ECMCardIndexService?wsdl";
    }

    /**
     * Retorna uma lista com todos os formulários
     */
    public static getForms(server: ServerDTO): Promise<DocumentDTO[]> {
        const params = {
            companyId: server.companyId,
            username: server.username,
            password: server.password,
            colleagueId: server.userCode
        };

        return soap.createClientAsync(FormService.getUri(server))
            .then((client) => {
                return client.getCardIndexesWithoutApproverAsync(params);
            }).then((response) => {
                return response[0].result.item || [];
            });
    }

    /**
     * Retorna uma lista com o nome dos arquivos referente ao documento
     */
     public static getFileNames(server: ServerDTO, documentId: Number): Promise<string[]> {
        const params = {
            username: server.username,
            password: server.password,
            companyId: server.companyId,
            documentId: documentId,
            colleagueId: server.userCode
        };

        return soap.createClientAsync(FormService.getUri(server))
            .then((client) => {
                return client.getAttachmentsListAsync(params);
            }).then((response) => {
                return response[0].result;
            }).then((result) => {
                if (!Array.isArray(result.item)) {
                    return [result.item];
                }

                return result.item;
            });
    }

    /**
     * Retorna o base64 referente ao arquivo
     */
     public static getFileBase64(server: ServerDTO, documentId: number, version: number, fileName: string) {
        const params = {
            username: server.username,
            password: server.password,
            companyId: server.companyId,
            documentId: documentId,
            colleagueId: server.userCode,
            version: version,
            nomeArquivo: fileName
        };

        return soap.createClientAsync(FormService.getUri(server))
            .then((client) => {
                return client.getCardIndexContentAsync(params);
            }).then((response) => {
                return response[0].folder;
            });
    }

    /**
     * Retorna uma lista com os eventos do formulario
     */
     public static getCustomizationEvents(server: ServerDTO, documentId: number): Promise<CustomizationEventsDTO[]> {
        const params = {
            username: server.username,
            password: server.password,
            companyId: server.companyId,
            documentId: documentId
        };

        return soap.createClientAsync(FormService.getUri(server))
            .then((client) => {
                return client.getCustomizationEventsAsync(params);
            }).then((response) => {
                return response[0].result;
            }).then((result) => {
                if (!Array.isArray(result.item)) {
                    return [result.item];
                }

                return result.item;
            });
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
     * Retorna os formulários selecionados
     */
     public static async getOptionsSelected(server: ServerDTO) {
        const forms = await FormService.getForms(server);
        const items = forms.map(form => ({
            label: form.documentId + ' - ' + form.documentDescription,
            detail: form.datasetName
        }));

        const result = await window.showQuickPick(items, {
            placeHolder: "Selecione o formulário",
            canPickMany: true
        });

        if (!result) {
            return undefined;
        }

        return result.map(item => {
            const endPosition = item.label.indexOf(" - ");
            const documentId = item.label.substring(0, endPosition);
            const form = forms.find(form => form.documentId.toString() === documentId);

            return form;
        });
    }

    /**
     * Realiza a importação de um formulário específico
     */
     public static async import() {
        if (!workspace.workspaceFolders || !workspace.workspaceFolders[0]) {
            window.showInformationMessage("Você precisa estar em um diretório / workspace.");
            return;
        }

        const server = await ServerService.getSelect();

        if (!server) {
            return;
        }

        const form = await FormService.getOptionSelected(server);

        if (!form) {
            return;
        }

        let folderUri = Uri.joinPath(workspace.workspaceFolders[0].uri, 'forms', form.documentDescription);

        const fileNames = await FormService.getFileNames(server, form.documentId);

        for (let fileName of fileNames) {
            const base64 = await FormService.getFileBase64(server, form.documentId, form.version, fileName);

            if (base64) {
                const fileContent = Buffer.from(base64, 'base64').toString('utf-8');
                workspace.fs.writeFile(Uri.joinPath(folderUri, fileName), Buffer.from(fileContent, "utf-8"));
            }
        }

        folderUri = Uri.joinPath(folderUri, "events");

        const events = await FormService.getCustomizationEvents(server, form.documentId);

        for (let item of events) {
            workspace.fs.writeFile(Uri.joinPath(folderUri, item.eventId + ".js"), Buffer.from(item.eventDescription, "utf-8"));
        }
    }

    /**
     * Realiza a importação de vários formulários
     */
     public static async importMany() {
        if (!workspace.workspaceFolders || !workspace.workspaceFolders[0]) {
            window.showInformationMessage("Você precisa estar em um diretório / workspace.");
            return;
        }

        const server = await ServerService.getSelect();

        if (!server) {
            return;
        }

        const forms = await FormService.getOptionsSelected(server);

        if (!forms) {
            return;
        }

        const workspaceFolder = workspace.workspaceFolders[0];

        forms.map(async form => {
            if (!form) {
                return;
            }

            let folderUri = Uri.joinPath(workspaceFolder.uri, 'forms', form.documentDescription);

            const fileNames = await FormService.getFileNames(server, form.documentId);

            for (let fileName of fileNames) {
                const base64 = await FormService.getFileBase64(server, form.documentId, form.version, fileName);

                if (base64) {
                    const fileContent = Buffer.from(base64, 'base64').toString('utf-8');
                    workspace.fs.writeFile(Uri.joinPath(folderUri, fileName), Buffer.from(fileContent, "utf-8"));
                }
            }

            folderUri = Uri.joinPath(folderUri, "events");

            const events = await FormService.getCustomizationEvents(server, form.documentId);

            for (let item of events) {
                workspace.fs.writeFile(Uri.joinPath(folderUri, item.eventId + ".js"), Buffer.from(item.eventDescription, "utf-8"));
            }
        });

        window.showInformationMessage("Os formulários foram importados com sucesso!");
    }
}
