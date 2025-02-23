import { ServerDTO } from "../models/ServerDTO";
import { ServerService } from "./ServerService";
import { window, workspace, Uri, FileType, ProgressLocation } from "vscode";
import { basename } from "path";
import { DatasetDTO } from "../models/DatasetDTO";
import { DatasetStructureDTO } from "../models/DatasetStructureDTO";
import { UtilsService } from "./UtilsService";
import { readFileSync } from "fs";
import { createClientAsync } from 'soap';
import {LoginService} from "./LoginService";

const basePath = "/ecm/api/rest/ecm/dataset/";

const headers = new Headers({
    "Accept": "application/json",
    "Content-Type": "application/json",
});

export class DatasetService {
    /**
     * Retorna uma lista com todos os datasets do servidor
     */
    public static getDatasets(server: ServerDTO): Promise<DatasetDTO[]> {
        const uri = UtilsService.getHost(server) + "/webdesk/ECMDatasetService?wsdl";

        const params = {
            companyId: server.companyId,
            username: server.username,
            password: server.password
        };

        return createClientAsync(uri)
            .then((client) => {
                return client.findAllFormulariesDatasetsAsync(params);
            }).then((response) => {
                return response[0].dataset?.item || [];
            });
    }

    /**
     * Retorna uma lista com todos os datasets customizados
     */
    public static async getDatasetsCustom(server: ServerDTO): Promise<DatasetDTO[]> {
        const datasets = await DatasetService.getDatasets(server);
        return datasets.filter(dataset => { return dataset.type === 'CUSTOM'; });
    }

    /**
     * Retorna as informações e estrutura de um dataset específico
     */
    public static async getDataset(server: ServerDTO, datasetId: string):Promise<any> {
        headers.set('Cookie', await LoginService.loginAndGetCookies(server));
        return await fetch(
            UtilsService.getRestUrl(server, basePath, "loadDataset", { "datasetId": datasetId }),
            { headers }
        ).then(r => r.json());
    }

    public static async getResultDataset(server: ServerDTO, datasetId: string, fields: string[], constraints: [], order: string[]) {
        const uri = UtilsService.getHost(server) + "/webdesk/ECMDatasetService?wsdl";

        const params = {
            companyId: server.companyId,
            username: server.username,
            password: server.password,
            name: datasetId,
            fields: {item: fields},
            constraints: {item: constraints},
            order: {item: order}
        };

        const client = await createClientAsync(uri, { handleNilAsNull: true, disableCache: true });

        const dataset = await client.getDatasetAsync(params).then((response: any) => response[0].dataset);
        const columns = Array.isArray(dataset.columns) ? dataset.columns : [dataset.columns];

        const mountValue = (item: any) => {
            const valueObj: any = {};
            const values = Array.isArray(item.value) ? item.value : [item.value];

            for (let index = 0; index < columns.length; index++) {
                if (values[index] && values[index]['$value']) {
                    valueObj[columns[index]] = values[index]['$value'];
                } else {
                    valueObj[columns[index]] = null;
                }
            }

            return valueObj;
        };

        const retValues = dataset.values;
        let values = [];

        if (Array.isArray(retValues)) {
            values = retValues.map(item => mountValue(item));
        } else if(retValues !== undefined && retValues !== null) {
            const item = retValues;
            values.push(mountValue(item));
        }

        return {
            columns,
            values
        };
    }

    /**
     * Exportar novo dataset
     */
    public static async createDataset(server: ServerDTO, dataset: DatasetStructureDTO) {
        headers.set('Cookie', await LoginService.loginAndGetCookies(server));
        return await fetch(
            UtilsService.getRestUrl(server, basePath, "createDataset"),
            {
                headers,
                method: "POST",
                body: JSON.stringify(dataset),
            }
        ).then(r => r.json());
    }

    /**
     * Exportar dataset existente
     */
    public static async updateDataset(server: ServerDTO, dataset: DatasetStructureDTO) {
        headers.set('Cookie', await LoginService.loginAndGetCookies(server));
        return await fetch(
            UtilsService.getRestUrl(server, basePath, "editDataset", { "confirmnewstructure": "false" }),
            {
                headers,
                method: "POST",
                body: JSON.stringify(dataset),
            }
        ).then(r => r.json());
    }

    /**
     * Retorna o dataset selecionado
     */
    public static async getOptionSelected(server: ServerDTO) {
        const datasets = await DatasetService.getDatasetsCustom(server);
        const items = datasets.map(dataset => ({ label: dataset.datasetId }));
        const result = await window.showQuickPick(items, {
            placeHolder: "Selecione o dataset"
        });

        if (!result) {
            return;
        }

        return await DatasetService.getDataset(server, result.label);
    }

    /**
     * Retorna os datasets selecionados
     */
    public static async getOptionsSelected(server: ServerDTO) {
        const datasets = await DatasetService.getDatasetsCustom(server);
        const items = datasets.map(dataset => ({ label: dataset.datasetId }));

        const result = await window.showQuickPick(items, {
            placeHolder: "Selecione o dataset",
            canPickMany: true
        });

        if (!result) {
            window.showErrorMessage("Falha ao selecionar o(s) dataset(s)!");
            return;
        }

        return result.map(async (item: any) => await DatasetService.getDataset(server, item.label));
    }

    /**
     * Realiza a importação de um dataset específico
     */
    public static async import() {
        const server = await ServerService.getSelect();

        if (!server) {
            return;
        }

        const dataset:any = await DatasetService.getOptionSelected(server);

        if (!dataset) {
            return;
        }

        DatasetService.saveFile(
            dataset.datasetPK.datasetId,
            dataset.datasetImpl
        );
    }

    /**
     * Realiza a importação de vários datasets
     */
    public static async importMany() {
        const server = await ServerService.getSelect();

        if (!server) {
            return;
        }

        const datasets = await DatasetService.getOptionsSelected(server);

        if (!datasets) {
            return;
        }

        datasets.map(async (item: any) => {
            const dataset = await item;
            DatasetService.saveFile(
                dataset.datasetPK.datasetId,
                dataset.datasetImpl
            );
        });
    }

    /**
     * Criar ou atualizar dataset no servidor
     */
     public static async export(fileUri: Uri) {
        const server = await ServerService.getSelect();

        if (!server) {
            return;
        }

        const datasets = await DatasetService.getDatasetsCustom(server);
        const items = [];

        let datasetIdSelected: string = '';
        let datasetId: string = basename(fileUri.fsPath, '.js');

        for (let dataset of datasets) {
            if (dataset.datasetId !== datasetId) {
                items.push({ label: dataset.datasetId });
            } else {
                datasetIdSelected = dataset.datasetId;
            }
        }

        items.unshift({ label: 'Novo dataset' });

        if (datasetIdSelected !== '') {
            items.unshift({ label: datasetIdSelected });
        }

        const dataset = await window.showQuickPick(items, {
            placeHolder: "Criar ou editar dataset?"
        });

        if (!dataset) {
            return;
        }

        const isNewDataset = dataset.label === 'Novo dataset';
        let datasetStructure: DatasetStructureDTO | undefined = undefined;
        let description: string = '';

        if (isNewDataset) {
            let isDatasetExist: boolean = false;

            do {
                datasetId = await window.showInputBox({
                    prompt: "Qual o nome do Dataset (sem espaços e sem caracteres especiais)?",
                    placeHolder: "ds_nome_dataset",
                    value: datasetId
                }) || "";

                if (!datasetId) {
                    return;
                }

                isDatasetExist = datasets.find((dataset => dataset.datasetId === datasetId)) !== undefined;

                if (isDatasetExist) {
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
        } else {
            datasetId = dataset.label;

            datasetStructure = await DatasetService.getDataset(server, datasetId);

            description = await window.showInputBox({
                prompt: "Qual a descrição do dataset?",
                placeHolder: "Descrição do dataset",
                value: datasetStructure?.datasetDescription || datasetId
            }) || "";
        }

        if (!description || !datasetStructure) {
            return;
        }

        const file = readFileSync(fileUri.fsPath, 'utf8');
        datasetStructure.datasetDescription = description;
        datasetStructure.datasetImpl = file;

        let result: any = undefined;

        // Validar senha antes de exportar
        if (server.confirmExporting && !(await UtilsService.confirmPassword(server))) {
            return;
        }

        if (isNewDataset) {
            result = await DatasetService.createDataset(server, datasetStructure);
        } else {
            result = await DatasetService.updateDataset(server, datasetStructure);
        }

        if (result.content === 'OK') {
            window.showInformationMessage(`Dataset ${datasetId} exportado com sucesso!`);
        } else {
			window.showErrorMessage(`Falha ao exportar o dataset ${datasetId}!\n${result.message.message}`);
        }
    }

    /**
     * Exportar vários datasets para o servidor
     */
    public static async exportMany() {
        const server = await ServerService.getSelect();

        if (!server) {
            return;
        }

        // Busca recursivamente todos os arquivos .js na pasta datasets
        const datasetFiles: { label: string, uri: Uri }[] = [];
        const workspaceUri = UtilsService.getWorkspaceUri();
        const datasetsUri = Uri.joinPath(workspaceUri, "datasets");

        async function scanDirectory(uri: Uri) {
            const files = await workspace.fs.readDirectory(uri);
            for (const [name, type] of files) {
                const fullUri = Uri.joinPath(uri, name);
                if (type === FileType.Directory) {
                    await scanDirectory(fullUri);
                } else if (type === FileType.File && name.endsWith('.js')) {
                    datasetFiles.push({
                        label: basename(name, '.js'),
                        uri: fullUri
                    });
                }
            }
        }

        try {
            await scanDirectory(datasetsUri);
        } catch (error) {
            window.showErrorMessage(`Erro ao ler a pasta datasets: ${error}`);
            return;
        }

        if (datasetFiles.length === 0) {
            window.showWarningMessage("Nenhum arquivo de dataset encontrado no workspace!");
            return;
        }

        // Mostra a lista de arquivos de dataset para o usuário selecionar
        const selectedFiles = await window.showQuickPick(datasetFiles, {
            placeHolder: "Selecione os datasets para exportar",
            canPickMany: true
        });

        if (!selectedFiles || selectedFiles.length === 0) {
            return;
        }

        // Validar senha antes de exportar
        if (server.confirmExporting && !(await UtilsService.confirmPassword(server))) {
            return;
        }

        // Exporta cada dataset selecionado
        const results = await Promise.all(selectedFiles.map(async (file) => {
            try {
                const fileContent = await workspace.fs.readFile(file.uri);
                const content = Buffer.from(fileContent).toString('utf8');
                const datasetId = file.label;

                // Verifica se o dataset já existe no servidor
                const existingDatasets = await DatasetService.getDatasetsCustom(server);
                const existingDataset = existingDatasets.find(ds => ds.datasetId === datasetId);

                const datasetStructure: DatasetStructureDTO = {
                    datasetPK: {
                        companyId: server.companyId,
                        datasetId: datasetId,
                    },
                    datasetDescription: datasetId,
                    datasetImpl: content,
                    datasetBuilder: 'com.datasul.technology.webdesk.dataset.CustomizedDatasetBuilder',
                    serverOffline: false,
                    mobileCache: false,
                    lastReset: 0,
                    lastRemoteSync: 0,
                    type: 'CUSTOM',
                    mobileOffline: false,
                    updateIntervalTimestamp: 0
                };

                let result: any;
                if (existingDataset) {
                    // Atualiza o dataset existente
                    result = await DatasetService.updateDataset(server, datasetStructure);
                } else {
                    // Cria um novo dataset
                    result = await DatasetService.createDataset(server, datasetStructure);
                }

                return {
                    datasetId,
                    success: result.content === 'OK',
                    message: result.message?.message || ''
                };
            } catch (error: any) {
                return {
                    datasetId: file.label,
                    success: false,
                    message: error.message || 'Erro desconhecido'
                };
            }
        }));

        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        if (successful.length > 0) {
            window.showInformationMessage(
                `${successful.length} dataset(s) exportado(s) com sucesso: ${successful.map(r => r.datasetId).join(', ')}`
            );
        }

        if (failed.length > 0) {
            window.showErrorMessage(
                `Falha ao exportar ${failed.length} dataset(s):\n${failed.map(r => `${r.datasetId}: ${r.message}`).join('\n')}`
            );
        }
    }

    /**
     * Exportar datasets de uma pasta específica para o servidor
     */
    public static async exportFromFolder(folderUri: Uri) {
        const server = await ServerService.getSelect();

        if (!server) {
            return;
        }

        // Busca recursivamente todos os arquivos .js na pasta selecionada
        const datasetFiles: { label: string, uri: Uri }[] = [];

        async function scanDirectory(uri: Uri) {
            const files = await workspace.fs.readDirectory(uri);
            for (const [name, type] of files) {
                const fullUri = Uri.joinPath(uri, name);
                if (type === FileType.Directory) {
                    await scanDirectory(fullUri);
                } else if (type === FileType.File && name.endsWith('.js')) {
                    datasetFiles.push({
                        label: basename(name, '.js'),
                        uri: fullUri
                    });
                }
            }
        }

        try {
            await window.withProgress({
                location: ProgressLocation.Notification,
                title: "Buscando datasets na pasta...",
                cancellable: false
            }, async () => {
                await scanDirectory(folderUri);
            });
        } catch (error) {
            window.showErrorMessage(`Erro ao ler a pasta: ${error}`);
            return;
        }

        if (datasetFiles.length === 0) {
            window.showWarningMessage("Nenhum arquivo de dataset encontrado na pasta selecionada!");
            return;
        }

        // Mostra mensagem de confirmação com o número de datasets encontrados
        const confirmation = await window.showInformationMessage(
            `Foram encontrados ${datasetFiles.length} dataset(s) na pasta. Deseja exportar todos?`,
            'Sim',
            'Não'
        );

        if (confirmation !== 'Sim') {
            return;
        }

        // Validar senha antes de exportar
        if (server.confirmExporting && !(await UtilsService.confirmPassword(server))) {
            return;
        }

        // Exporta cada dataset encontrado
        const results = await window.withProgress({
            location: ProgressLocation.Notification,
            title: "Exportando datasets...",
            cancellable: false
        }, async (progress) => {
            const increment = 100 / datasetFiles.length;
            let currentProgress = 0;

            return await Promise.all(datasetFiles.map(async (file, index) => {
                try {
                    progress.report({
                        message: `Exportando ${file.label} (${index + 1}/${datasetFiles.length})`,
                        increment
                    });

                    const fileContent = await workspace.fs.readFile(file.uri);
                    const content = Buffer.from(fileContent).toString('utf8');
                    const datasetId = file.label;

                    // Verifica se o dataset já existe no servidor
                    const existingDatasets = await DatasetService.getDatasetsCustom(server);
                    const existingDataset = existingDatasets.find(ds => ds.datasetId === datasetId);

                    const datasetStructure: DatasetStructureDTO = {
                        datasetPK: {
                            companyId: server.companyId,
                            datasetId: datasetId,
                        },
                        datasetDescription: datasetId,
                        datasetImpl: content,
                        datasetBuilder: 'com.datasul.technology.webdesk.dataset.CustomizedDatasetBuilder',
                        serverOffline: false,
                        mobileCache: false,
                        lastReset: 0,
                        lastRemoteSync: 0,
                        type: 'CUSTOM',
                        mobileOffline: false,
                        updateIntervalTimestamp: 0
                    };

                    let result: any;
                    if (existingDataset) {
                        // Atualiza o dataset existente
                        result = await DatasetService.updateDataset(server, datasetStructure);
                    } else {
                        // Cria um novo dataset
                        result = await DatasetService.createDataset(server, datasetStructure);
                    }

                    currentProgress += increment;

                    return {
                        datasetId,
                        success: result.content === 'OK',
                        message: result.message?.message || ''
                    };
                } catch (error: any) {
                    return {
                        datasetId: file.label,
                        success: false,
                        message: error.message || 'Erro desconhecido'
                    };
                }
            }));
        });

        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        if (successful.length > 0) {
            window.showInformationMessage(
                `${successful.length} dataset(s) exportado(s) com sucesso: ${successful.map(r => r.datasetId).join(', ')}`
            );
        }

        if (failed.length > 0) {
            window.showErrorMessage(
                `Falha ao exportar ${failed.length} dataset(s):\n${failed.map(r => `${r.datasetId}: ${r.message}`).join('\n')}`
            );
        }
    }

    /**
     * Criar arquivo de dataset
     */
    public static async saveFile(name: string, content: string) {
        const datasetUri = Uri.joinPath(UtilsService.getWorkspaceUri(), "datasets", name + ".js");

        await workspace.fs.writeFile(
            datasetUri,
            Buffer.from(content, "utf-8")
        );

        window.showTextDocument(datasetUri);
        window.showInformationMessage(`Dataset ${name} importado com sucesso!`);
    }
}
