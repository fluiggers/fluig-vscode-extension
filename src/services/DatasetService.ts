import { ServerDTO } from "../models/ServerDTO";
import { ServerService } from "./ServerService";
import { window, workspace, Uri, ProgressLocation } from "vscode";
import { basename } from "path";
import { DatasetDTO } from "../models/DatasetDTO";
import { DatasetStructureDTO } from "../models/DatasetStructureDTO";
import { UtilsService } from "./UtilsService";
import { readFileSync } from "fs";
import { createClientAsync } from "soap";
import {LoginService} from "./LoginService";
import { glob } from "glob";

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
        return datasets.filter(dataset => { return dataset.type === "CUSTOM"; });
    }

    /**
     * Retorna as informações e estrutura de um dataset específico
     */
    public static async getDataset(server: ServerDTO, datasetId: string):Promise<any> {
        headers.set("Cookie", await LoginService.loginAndGetCookies(server));
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
                if (values[index] && values[index]["$value"]) {
                    valueObj[columns[index]] = values[index]["$value"];
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
        headers.set("Cookie", await LoginService.loginAndGetCookies(server));
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
        headers.set("Cookie", await LoginService.loginAndGetCookies(server));
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

        if (!datasets || !datasets.length) {
            return;
        }


        const results = await window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: "Importando Datasets.",
                cancellable: false
            },
            progress => {
                const increment = 100 / datasets.length;
                let current = 0;

                progress.report({ increment: 0 });

                return Promise.all(datasets.map(async (item: any) => {
                    const dataset = await item;
                    DatasetService.saveFile(
                        dataset.datasetPK.datasetId,
                        dataset.datasetImpl,
                        false
                    );
                    current += increment;
                    progress.report({ increment: current });
                    return true;
                }));
            }
        );

        window.showInformationMessage(`${results.length} datasets foram importados.`);
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

        let datasetIdSelected: string = "";
        let datasetId: string = basename(fileUri.fsPath, ".js");

        for (let dataset of datasets) {
            if (dataset.datasetId !== datasetId) {
                items.push({ label: dataset.datasetId });
            } else {
                datasetIdSelected = dataset.datasetId;
            }
        }

        items.unshift({ label: "Novo dataset" });

        if (datasetIdSelected !== "") {
            items.unshift({ label: datasetIdSelected });
        }

        const dataset = await window.showQuickPick(items, {
            placeHolder: "Criar ou editar dataset?"
        });

        if (!dataset) {
            return;
        }

        const isNewDataset = dataset.label === "Novo dataset";
        let datasetStructure: DatasetStructureDTO | undefined = undefined;
        let description: string = "";

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
                datasetImpl: "",
                datasetBuilder: "com.datasul.technology.webdesk.dataset.CustomizedDatasetBuilder",
                serverOffline: false,
                mobileCache: false,
                lastReset: 0,
                lastRemoteSync: 0,
                type: "CUSTOM",
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

        const file = readFileSync(fileUri.fsPath, "utf8");
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

        if (result.content === "OK") {
            window.showInformationMessage(`Dataset ${datasetId} exportado com sucesso!`);
        } else {
			window.showErrorMessage(`Falha ao exportar o dataset ${datasetId}!\n${result.message.message}`);
        }
    }

    /**
     * Exportar datasets de uma pasta específica para o servidor
     */
    public static async exportFromFolder(folderUri: Uri) {
        const datasetFiles: { label: string, path: string }[] = [];

        for (const datasetPath of glob.sync(folderUri.fsPath + "/**/*.js", {nodir: true})) {
            datasetFiles.push({
                label: basename(datasetPath, ".js"),
                path: datasetPath
            });
        }

        if (datasetFiles.length === 0) {
            window.showWarningMessage("Nenhum arquivo de dataset encontrado!");
            return;
        }

        datasetFiles.sort((ds1, ds2) => ds1.label.localeCompare(ds2.label));

        const selectedFiles = await window.showQuickPick(datasetFiles, {
            placeHolder: "Selecione os datasets para exportar",
            canPickMany: true
        }) || [];

        if (!selectedFiles.length) {
            return;
        }

        const server = await ServerService.getSelect();

        if (!server) {
            return;
        }

        if (server.confirmExporting && !(await UtilsService.confirmPassword(server))) {
            return;
        }

        const askDescriptionForNewDataset = (
            await window.showQuickPick(["Sim", "Não"], {
                placeHolder: "Deseja informar a descrição dos novos datasets?",
                canPickMany: false
            }) || "Não"
        ) === "Sim";

        const itemsToExport = await DatasetService.getExportManyFunctionsToCall(
            server,
            selectedFiles,
            askDescriptionForNewDataset
        );

        if (!itemsToExport) {
            return;
        }

        let results: {
            datasetId: string,
            success: boolean,
            message: any,
        }[] = [];

        /**
         * Se houver datasets novos e usuário indicou que quer indicar a descrição
         * os novos datasets serão enviados um a um para conseguir escrever a descrição.
         */
        if (askDescriptionForNewDataset && itemsToExport.createFunctions.length) {
            if (itemsToExport.updateFunctions.length) {
                results = await window.withProgress(
                    {
                        location: ProgressLocation.Notification,
                        title: "Exportando Datasets que serão atualizados.",
                        cancellable: false
                    },
                    progress => {
                        const increment = 100 / itemsToExport.updateFunctions.length;
                        let current = 0;

                        progress.report({ increment: 0 });

                        return Promise.all([...itemsToExport.updateFunctions.map(async f => {
                            const r = await f.apply(null);
                            current += increment;
                            progress.report({ increment: current });
                            return r;
                        })]);
                    }
                );
            }

            for (const dataset of itemsToExport.createFunctions) {
                results.push(await dataset.apply(null));
            }
        } else {
            results = await window.withProgress(
                {
                    location: ProgressLocation.Notification,
                    title: "Exportando todos os Datasets selecionados",
                    cancellable: false
                },
                progress => {
                    const allFunctions = [
                        ...itemsToExport.updateFunctions,
                        ...itemsToExport.createFunctions
                    ];

                    const increment = 100 / allFunctions.length;
                    let current = 0;

                    progress.report({ increment: 0 });

                    return Promise.all(allFunctions.map(async f => {
                        const r = await f.apply(null);
                        current += increment;
                        progress.report({ increment: current });
                        return r;
                    }));
                }
            );
        }

        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        if (successful.length > 0) {
            window.showInformationMessage(
                `${successful.length} dataset(s) exportado(s) com sucesso}`
            );
        }

        if (failed.length > 0) {
            window.showErrorMessage(
                `Falha ao exportar ${failed.length} dataset(s):\n${failed.map(r => `${r.datasetId}: ${r.message}`).join("\n")}`
            );
        }
    }

    /**
     * Cria as funções que serão executadas para atualizar/criar vários datasets
     *
     * @returns {{
     *  createFunctions: () => Promise<{datasetId: string, success: boolean, message: string}>,
     *  updateFunctions: () => Promise<{datasetId: string, success: boolean, message: string}>
     * }}
     */
    private static async getExportManyFunctionsToCall(
        server: ServerDTO,
        selectedDatasets:{label: string, path: string}[],
        askDescriptionForNewDataset:boolean = true
    ) {
        try {
            const existingDatasets = await DatasetService.getDatasetsCustom(server);

            const datasetsForUpate = selectedDatasets.filter(dsSelected => existingDatasets.find(ds => ds.datasetId === dsSelected.label));
            const datasetsForCreate = selectedDatasets.filter(dsSelected => !datasetsForUpate.includes(dsSelected));

            const datasetsForUpdateFunctions = datasetsForUpate.map(selectedDs => async () => {
                const datasetStructure = await DatasetService.getDataset(server, selectedDs.label);
                datasetStructure.datasetImpl = readFileSync(selectedDs.path, "utf8");
                const result:any = await DatasetService.updateDataset(server, datasetStructure);

                return {
                    datasetId: selectedDs.label,
                    success: result.content === "OK",
                    message: result.message?.message || ""
                };
            });

            const datasetsForCreateFunctions = datasetsForCreate.map(selectedDs => async () => {
                let description = "";

                if (askDescriptionForNewDataset) {
                    description = await window.showInputBox({
                        prompt: `Qual a descrição do dataset ${selectedDs.label}?`,
                        placeHolder: "Descrição do dataset",
                        value: selectedDs.label
                    }) || selectedDs.label;
                }

                const datasetStructure = {
                    datasetPK: {
                        companyId: server.companyId,
                        datasetId: selectedDs.label,
                    },
                    datasetDescription: description,
                    datasetImpl: readFileSync(selectedDs.path, "utf8"),
                    datasetBuilder: "com.datasul.technology.webdesk.dataset.CustomizedDatasetBuilder",
                    serverOffline: false,
                    mobileCache: false,
                    lastReset: 0,
                    lastRemoteSync: 0,
                    type: "CUSTOM",
                    mobileOffline: false,
                    updateIntervalTimestamp: 0
                };

                const result:any = await DatasetService.createDataset(server, datasetStructure);

                return {
                    datasetId: selectedDs.label,
                    success: result.content === "OK",
                    message: result.message?.message || ""
                };
            });

            return {
                createFunctions: datasetsForCreateFunctions,
                updateFunctions: datasetsForUpdateFunctions
            };
        } catch (error: any) {
            window.showErrorMessage("Falha ao consultar os datasets já existentes.");
            return null;
        }
    }

    /**
     * Criar arquivo de dataset
     */
    public static async saveFile(name: string, content: string, openDatasetFile: boolean = true) {
        const datasetUri = Uri.joinPath(UtilsService.getWorkspaceUri(), "datasets", name + ".js");

        await workspace.fs.writeFile(
            datasetUri,
            Buffer.from(content, "utf-8")
        );

        if (openDatasetFile) {
            window.showTextDocument(datasetUri);
            window.showInformationMessage(`Dataset ${name} importado com sucesso!`);
        }
    }
}
