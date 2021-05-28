import axios from "axios";
import { ServerDTO } from "../models/ServerDTO";
import * as https from 'https';
import { ServerService } from "./ServerService";
import { window, workspace, Uri } from "vscode";
import { posix } from "path";
import { DatasetDTO } from "../models/DatasetDTO";
import { DatasetStructureDTO } from "../models/DatasetStructureDTO";
import { readFileSync } from "fs";

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
     * Exportar novo dataset
     * @param server 
     * @param dataset 
     * @returns 
     */
    public static async createDataset(server: ServerDTO, dataset: DatasetStructureDTO) {
        let uri = server.ssl ? "https://" : "http://";
        uri += server.host;
        uri += ":" + server.port;
        uri += "/ecm/api/rest/ecm/dataset/createDataset";
        uri += "?username=" + server.username;
        uri += "&password=" + server.password;

        const agent = new https.Agent({
            rejectUnauthorized: false
        });

        return await axios.post(uri, dataset, {
            httpsAgent: agent
        });
    }

    /**
     * Exportar dataset existente
     * @param server 
     * @param dataset 
     * @returns 
     */
    public static async updateDataset(server: ServerDTO, dataset: DatasetStructureDTO) {
        let uri = server.ssl ? "https://" : "http://";
        uri += server.host;
        uri += ":" + server.port;
        uri += "/ecm/api/rest/ecm/dataset/editDataset";
        uri += "?username=" + server.username;
        uri += "&password=" + server.password;
        uri += "&confirmnewstructure=false";

        const agent = new https.Agent({
            rejectUnauthorized: false
        });

        return await axios.post(uri, dataset, {
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
            placeHolder: "Selecione o dataset"
        });

        if(!result) {
            return;
        }

        return await DatasetService.getDataset(server, result.label);
    }

    /**
     * Retorna os datasets selecionados
     * @param server 
     * @returns 
     */
    public static async getOptionsSelected(server: ServerDTO) {
        const datasets = await DatasetService.getDatasetsCustom(server);
        const items = datasets.map(dataset => ({label: dataset.datasetId}));
        const result = await window.showQuickPick(items, {
            placeHolder: "Selecione o dataset",
            canPickMany: true
        });

        if(!result) {
            window.showErrorMessage("Falha ao selecionar o(s) dataset(s)!");
            return;
        }

        return result.map(async item => {
            return await DatasetService.getDataset(server, item.label);
        });
    }

    /**
     * Realiza a importacao de um dataset especifico
     * @returns 
     */
    public static async import() {
        if (!workspace.workspaceFolders) {
            window.showInformationMessage("Você precisa estar em um diretório / workspace.");
            return;
        }

        const server = await ServerService.getSelect();
        if(!server) {
            return;
        }

        const dataset = await DatasetService.getOptionSelected(server);
        if(!dataset) {
            return;
        }

        DatasetService.saveFile(
            dataset.data.datasetPK.datasetId, 
            dataset.data.datasetImpl
        );
    }

    /**
     * Realiza a importacao de varios datasets
     * @returns 
     */
    public static async importMany() {
        if (!workspace.workspaceFolders) {
            window.showInformationMessage("Você precisa estar em um diretório / workspace.");
            return;
        }

        const server = await ServerService.getSelect();
        if(!server) {
            return;
        }

        const datasets = await DatasetService.getOptionsSelected(server);
        if(!datasets) {
            return;
        }

        datasets.map(async item => {
            const dataset = await item;
            DatasetService.saveFile(
                dataset.data.datasetPK.datasetId, 
                dataset.data.datasetImpl
            );
        });
    }

    /**
     * Criar ou atualizar dataset no servidor
     * @param fileUri 
     * @returns 
     */
    public static async export(fileUri: Uri) {
        const server = await ServerService.getSelect();

        if(!server) {
            return;
        }

        const datasets = await DatasetService.getDatasetsCustom(server);
        const items = datasets.map(dataset => ({label: dataset.datasetId}));
        items.unshift({label: 'Novo dataset'});

        const dataset = await window.showQuickPick(items, {
            placeHolder: "Criar ou editar dataset?"
        });

        if(!dataset) {
            return;
        }

        const isNewDataset = dataset.label === 'Novo dataset';
        let datasetStructure: DatasetStructureDTO | undefined = undefined;
        let datasetId: string = '';
        let description: string = '';

        if(isNewDataset) {
            const path = fileUri.fsPath.split("\\");
            datasetId = path[path.length - 1];
            datasetId = datasetId.replace('.js', '');

            let isDatasetExist: boolean = false;
            do {
                datasetId = await window.showInputBox({
                    prompt: "Qual o nome do Dataset (sem espaços e sem caracteres especiais)?",
                    placeHolder: "ds_nome_dataset",
                    value: datasetId
                }) || "";

                if(!datasetId) {
                    return;
                }

                isDatasetExist = datasets.find((dataset => dataset.datasetId === datasetId)) !== undefined;
                if(isDatasetExist) {
                    window.showWarningMessage(`O dataset "${datasetId}" já existe no servidor "${server.name}"!`);
                }
            } while (isDatasetExist);

            description = await window.showInputBox({
                prompt: "Qual a descrição do dataset?",
                placeHolder: "Descrição do dataset",
                value: datasetId
            }) || "";

            datasetStructure = {
                datasetPK: {
                    companyId: server.companyId,
                    datasetId: datasetId,
                },
                datasetDescription: description,
                datasetImpl: '',
                datasetBuilder: 'com.datasul.technology.webdesk.dataset.CustomizedDatasetBuilder',
                serverOffline: false,
                mobileCache: false,
                lastReset: 0,
                lastRemoteSync: 0,
                type: 'CUSTOM',
                mobileOffline: false,
                updateIntervalTimestamp: 0
            };
        }
        else {
            datasetId = dataset.label;

            const datasetOld = await DatasetService.getDataset(server, datasetId);
            datasetStructure = datasetOld.data;

            description = await window.showInputBox({
                prompt: "Qual a descrição do dataset?",
                placeHolder: "Descrição do dataset",
                value: datasetId
            }) || "";
        }

        if(!description || !datasetStructure) {
            return;
        }

        const file = readFileSync(fileUri.fsPath, 'utf8');
        datasetStructure.datasetDescription = description;
        datasetStructure.datasetImpl = file;

        let result: any = undefined;

        // Validar senha antes de exportar
        if(server.confirmExporting) {
            let isPasswordCorrect: boolean = true;
            do {
                const confirmPassword = await window.showInputBox({
                    prompt: "Informe a senha do servidor " + server.name,
                    password: true
                }) || "";

                if(!confirmPassword) {
                    return;
                }
                else if(confirmPassword !== server.password) {
                    window.showWarningMessage(`A senha informada para o servidor "${server.name}" está incorreta!`);
                    isPasswordCorrect = false;
                }
                else {
                    isPasswordCorrect = true;
                }
            } while (!isPasswordCorrect);
        }

        if(isNewDataset) {
            result = await DatasetService.createDataset(server, datasetStructure);
        }
        else {
            result = await DatasetService.updateDataset(server, datasetStructure);
        }

        if(result.data.content === 'OK') {
            window.showInformationMessage("Dataset " + datasetId + " exportado com sucesso!");
        }
        else {
            window.showInformationMessage("Falha ao exportar o dataset " + datasetId + "!");
        }
    }

    /**
     * Criar arquivo de dataset
     * @param name 
     * @param content 
     * @returns 
     */
    public static async saveFile(name: string, content: string) {
        if (!workspace.workspaceFolders) {
            window.showInformationMessage("Você precisa estar em um diretório / workspace.");
            return;
        }

        const workspaceFolderUri = workspace.workspaceFolders[0].uri;
        const datasetUri = workspaceFolderUri.with({ path: posix.join(workspaceFolderUri.path, "datasets", name + ".js") });

        await workspace.fs.writeFile(
            datasetUri,
            Buffer.from(content, "utf-8")
        );

        window.showTextDocument(datasetUri);
        window.showInformationMessage("Dataset " + name + " importado com sucesso!");
    }
}