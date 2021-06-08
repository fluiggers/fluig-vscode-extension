import { ServerDTO } from "../models/ServerDTO";
import * as soap from 'soap';
import { window, workspace } from "vscode";
import { ServerService } from "./ServerService";
import { DocumentDTO } from "../models/DocumentDTO";

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

        return result;
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
    }
}
