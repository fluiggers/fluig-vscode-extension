import axios from "axios";
import { ServerDTO } from "../models/ServerDTO";
import * as https from 'https';
import { ServerService } from "./ServerService";
import { window, workspace } from "vscode";
import { posix } from "path";
import { DatasetDTO } from "../models/DatasetDTO";

const soap = require("soap");

export class DatasetService {

    /**
     * Retorna uma lista com todos os datasets
     * @param server 
     * @returns 
     */
    public static async getDatasets(server: ServerDTO): Promise<DatasetDTO[]> {
        let uri = server.ssl ? "https://" : "http://";
        uri += server.host;
        uri += ":" + server.port;
        uri += "/webdesk/ECMDatasetService?wsdl";

        const params = {
            companyId: server.companyId,
            username: server.username,
            password: server.password
        };

        const datasets: any = await new Promise((accept, reject) => {
            soap.createClient(uri, (err: any, client: any) => {
                if(err) {
                    reject(err);
                    return;
                }

                client.findAllFormulariesDatasets(params, (err: any, response: any) => {
                    if(err) {
                        reject(err);
                        return;
                    }

                    accept(response);
                });
            });
        });

        return datasets.dataset.item;
    }

    /**
     * Retorna uma lista com todos os datasets customizados
     * @param server 
     * @returns 
     */
    public static async getDatasetsCustom(server: ServerDTO): Promise<DatasetDTO[]> {
        const datasets = await DatasetService.getDatasets(server);
        return datasets.filter(dataset => {return dataset.type === 'CUSTOM';});
    }

    /**
     * Retorna as informacoes e estrutura de um dataset especifico
     * @param server 
     * @param datasetId 
     * @returns 
     */
    public static async getDataset(server: ServerDTO, datasetId: string) {
        let uri = server.ssl ? "https://" : "http://";
        uri += server.host;
        uri += ":" + server.port;
        uri += "/ecm/api/rest/ecm/dataset/loadDataset";
        uri += "?username=" + server.username;
        uri += "&password=" + server.password;
        uri += "&datasetId=" + datasetId;

        const agent = new https.Agent({
            rejectUnauthorized: false
        });

        return await axios.get(uri, {
            httpsAgent: agent
        });
    }

    /**
     * Retorna o dataset selecionado
     * @param server 
     * @returns 
     */
    public static async getOptionSelected(server: ServerDTO) {
        const datasets = await DatasetService.getDatasetsCustom(server);
        const items = datasets.map(dataset => ({label: dataset.datasetId}));
        const result = await window.showQuickPick(items, {
            placeHolder: "Selecione o dataset",
        });

        if(!result) {
            window.showErrorMessage("Falha ao selecionar o dataset!");
            return;
        }

        return await DatasetService.getDataset(server, result.label);
    }

    /**
     * Realiza a importacao de um dataset especifico
     * @returns 
     */
    public static async import() {
        const server = await ServerService.getSelect();

        if(!server) {return;}
        const dataset = await DatasetService.getOptionSelected(server);

        if (!workspace.workspaceFolders) {
            window.showInformationMessage("Você precisa estar em um diretório / workspace.");
            return;
        }

        if(!dataset) {
            window.showErrorMessage("Falha ao retornar a estrutura do dataset!");
            return;
        }

        const datasetName = dataset.data.datasetPK.datasetId;
        const datasetImpl = dataset.data.datasetImpl;
        const workspaceFolderUri = workspace.workspaceFolders[0].uri;
        const datasetUri = workspaceFolderUri.with({ path: posix.join(workspaceFolderUri.path, "datasets", datasetName + ".js") });

        await workspace.fs.writeFile(
            datasetUri,
            Buffer.from(datasetImpl, "utf-8")
        );
        window.showTextDocument(datasetUri);
    }
}