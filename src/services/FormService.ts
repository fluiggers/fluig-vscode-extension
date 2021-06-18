import { ServerDTO } from "../models/ServerDTO";
import * as soap from 'soap';
import { window, workspace } from "vscode";
import { ServerService } from "./ServerService";
import { DocumentDTO } from "../models/DocumentDTO";
import { posix } from "path";

export class FormService {
    private static URL_WSDL_CARD_INDEX_SERVICE: string = "/webdesk/ECMCardIndexService?wsdl";

    /**
     * Retorna uma lista com todos os formulários
     */
    public static async getForms(server: ServerDTO): Promise<DocumentDTO[]> {
        const uri = (server.ssl ? "https://" : "http://")
            + server.host
            + ":" + server.port
            + FormService.URL_WSDL_CARD_INDEX_SERVICE
        ;

        const params = {
            companyId: server.companyId,
            username: server.username,
            password: server.password,
            colleagueId: server.username
        };

        const forms: any = await new Promise((accept, reject) => {
            soap.createClient(uri, (err: any, client: soap.Client) => {
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

        return forms.result.item;
    }

    /**
     * Retorna uma lista com o nome dos arquivos referente ao documento
     */
     public static async getFileNames(server: ServerDTO, documentId: Number): Promise<string[]> {
        const uri = (server.ssl ? "https://" : "http://")
            + server.host
            + ":" + server.port
            + FormService.URL_WSDL_CARD_INDEX_SERVICE
        ;

        const params = {
            username: server.username,
            password: server.password,
            companyId: server.companyId,
            documentId: documentId,
            colleagueId: server.username
        };

        const forms: any = await new Promise((accept, reject) => {
            soap.createClient(uri, (err: any, client: soap.Client) => {
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

        return forms.result.item;
    }

    /**
     * Retorna o base64 referente ao arquivo
     */
     public static async getFileBase64(server: ServerDTO, documentId: number, version: number, fileName: string, ) {
        const uri = (server.ssl ? "https://" : "http://")
            + server.host
            + ":" + server.port
            + FormService.URL_WSDL_CARD_INDEX_SERVICE
        ;

        const params = {
            username: server.username,
            password: server.password,
            companyId: server.companyId,
            documentId: documentId,
            colleagueId: server.username,
            version: version,
            nomeArquivo: fileName
        };

        const file: any = await new Promise((accept, reject) => {
            soap.createClient(uri, (err: any, client: soap.Client) => {
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
     * Retorna o formulário selecionado
     */
     public static async getOptionSelected(server: ServerDTO) {
        const forms = await FormService.getForms(server);
        const items = forms.map(form => ({
            label: form.documentId + ' - ' + form.documentDescription,
            detail: form.datasetName
        }));

        const result = await window.showQuickPick(items, {
            placeHolder: "Selecione o formulário"
        });

        if (!result) {
            return;
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

        const documentId = form.documentId;
        const version = form.version;
        const folderName = form.documentDescription;

        const fileNames = await FormService.getFileNames(server, documentId);

        for(let fileName of fileNames) {
            const base64 = await FormService.getFileBase64(server, documentId, version, fileName);
            const fileContent = Buffer.from(base64, 'base64').toString('utf-8');
            FormService.saveFile(folderName, fileName, fileContent);
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
        const datasetUri = workspaceFolderUri.with({ path: posix.join(workspaceFolderUri.path, "forms", folder, name) });

        workspace.fs.writeFile(
            datasetUri,
            Buffer.from(content, "utf-8")
        );
    }
}
