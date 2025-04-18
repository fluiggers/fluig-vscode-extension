import { ExtensionContext, Uri, window, workspace, ProgressLocation } from "vscode";
import { ServerDTO } from "../models/ServerDTO";
import { createClientAsync } from 'soap';
import { ServerService } from "./ServerService";
import { DocumentDTO } from "../models/DocumentDTO";
import { CustomizationEventsDTO } from "../models/CustomizationEventsDTO";
import { UtilsService } from "./UtilsService";
import { glob } from "glob";
import { readFileSync } from "fs";
import { basename, parse } from "path";
import { FormDTO } from "../models/FormDTO";
import { AttachmentDTO } from "../models/AttachmentDTO";
import { GlobalStorageService } from "./GlobalStorageService";

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

        return createClientAsync(FormService.getUri(server))
            .then((client) => {
                return client.getCardIndexesWithoutApproverAsync(params);
            }).then((response) => {
                return response[0]?.result?.item || [];
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

        return createClientAsync(FormService.getUri(server))
            .then((client) => {
                return client.getAttachmentsListAsync(params);
            }).then((response) => {
                return response[0]?.result?.item || [];
            }).then((items) => {
                if (!Array.isArray(items)) {
                    return [items];
                }

                return items;
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

        return createClientAsync(FormService.getUri(server))
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

        return createClientAsync(FormService.getUri(server))
            .then((client) => {
                return client.getCustomizationEventsAsync(params);
            }).then((response) => {
                return response[0]?.result?.item || [];
            }).then((items) => {
                if (!Array.isArray(items)) {
                    return [items];
                }

                return items;
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
        return forms.find(form => form.documentId.toString() === documentId);
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
            return forms.find(form => form.documentId.toString() === documentId);
        });
    }

    /**
     * Realiza a importação de um formulário específico
     */
     public static async import() {
        const server = await ServerService.getSelect();

        if (!server) {
            return;
        }

        const form = await FormService.getOptionSelected(server);

        if (!form) {
            return;
        }

        let folderUri = Uri.joinPath(UtilsService.getWorkspaceUri(), 'forms', form.documentDescription);

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

        for (let event of events) {
            workspace.fs.writeFile(Uri.joinPath(folderUri, event.eventId + ".js"), Buffer.from(event.eventDescription, "utf-8"));
        }

        window.showInformationMessage("O formulário foi importado!");
    }

    /**
     * Realiza a importação de vários formulários
     */
     public static async importMany() {
        const server = await ServerService.getSelect();

        if (!server) {
            return;
        }

        const forms = await FormService.getOptionsSelected(server);

        if (!forms || !forms.length) {
            return;
        }

        const workspaceFolderUri = UtilsService.getWorkspaceUri();

        const results = await window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: "Importando Formulários.",
                cancellable: false
            },
            progress => {
                const increment = 100 / forms.length;
                let current = 0;

                progress.report({ increment: 0 });

                return Promise.all(forms.map(async form => {
                    if (!form) {
                        return;
                    }

                    let folderUri = Uri.joinPath(workspaceFolderUri, 'forms', form.documentDescription);

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

                    current += increment;
                    progress.report({ increment: current });
                    return true;
                }));
            }
        );

        window.showInformationMessage(`${results.length} formulários foram importados.`);
    }

    public static async export(context: ExtensionContext, fileUri: Uri) {
        const server = await ServerService.getSelect();

        if (!server) {
            return;
        }

        if (server.confirmExporting && !(await UtilsService.confirmPassword(server))) {
            return;
        }

        const formFolderName: string = fileUri.path.replace(/.*\/forms\/([^/]+).*/, "$1");

        // Remove possível documentid da frente do formulário (quando importado pelo Eclipse)
        const formName = formFolderName.replace(/^(?:\d+ - )?(\w+)$/, "$1");

        const selectedForm = await FormService.getExportFormSelected(server, formName);

        if (!selectedForm) {
            return;
        }

        const params = selectedForm === "novo"
            ? await FormService.getCreateFormParams(context, server, formName)
            : await FormService.getUpdateFormParams(server, selectedForm)
        ;

        if (params === null) {
            return;
        }

        const formFolder = Uri.joinPath(UtilsService.getWorkspaceUri(), 'forms', formFolderName).fsPath;

        for (let attachmentPath of glob.sync(formFolder + "/**/*.*", {nodir: true, ignore: formFolder + "/events/**/*.*"})) {
            const pathParsed = parse(attachmentPath);

            const attachment: AttachmentDTO = {
                fileName: pathParsed.base,
                filecontent: readFileSync(attachmentPath).toString("base64"),
                principal: pathParsed.ext.toLowerCase().includes('htm') && formName === pathParsed.name,
            };
            params.Attachments.item.push(attachment);
        }

        for (let eventPath of glob.sync(formFolder + "/events/*.js")) {
            const customEvent: CustomizationEventsDTO = {
                eventDescription: readFileSync(eventPath).toString("utf-8"),
                eventId: basename(eventPath, '.js'),
                eventVersAnt: false, // talvez precise tratar isso quando for novo
            };
            params.customEvents.item.push(customEvent);
        }

        try {
            const client = await createClientAsync(FormService.getUri(server));
            const response = selectedForm === "novo"
                ? await client.createSimpleCardIndexWithDatasetPersisteTypeAsync(params)
                : await client.updateSimpleCardIndexWithDatasetAndGeneralInfoAsync(params)
            ;

            const message = response[0]?.result?.item?.webServiceMessage;
            if (message === 'ok') {
                window.showInformationMessage(`Formulário ${formName} exportado com sucesso!`);
            } else {
                window.showErrorMessage(message || 'Verifique o id da Pasta onde irá salvar o Formulário!');
            }
        } catch (err) {
            window.showErrorMessage("Erro ao exportar Formulário.");
        }
    }

    private static async getCreateFormParams(context: ExtensionContext, server: ServerDTO, formName: string): Promise<FormDTO|null> {
        const newFormName = await window.showInputBox({
            prompt: "Qual o nome do Formulário?",
            value: formName
        }) || "";

        if (!newFormName) {
            return null;
        }

        const newDatasetName = await window.showInputBox({
            prompt: "Qual o nome do Dataset do Formulário?",
            value: `ds_${newFormName}`
        }) || "";

        if (!newDatasetName) {
            return null;
        }

        const parentDocumentId = await window.showInputBox({
            prompt: "Qual o id da Pasta onde irá salvar o Formulário?",
            value: GlobalStorageService.getLastParentDocumentId(context, server)
        }) || "";

        if (!parentDocumentId) {
            return null;
        }
        GlobalStorageService.updateLastParentDocumentId(context, server, parentDocumentId);

        const persistenceType = await window.showQuickPick(
            [
                {
                    label: "Tabelas de Banco de Dados (recomendado)",
                    value: 1
                },
                {
                    label: "Numa única tabela (pequena quantidade de registros)",
                    value: 0
                }
            ],
            {
                placeHolder: "Tipo de Armazenamento?"
            }
        );

        if (!persistenceType) {
            return null;
        }

        const cardDescription = await window.showInputBox({
            prompt: "Nome do campo descritor (deixe em branco para usar o padrão)",
            value: ""
        }) || "";

        return {
            username: server.username,
            password: server.password,
            companyId: server.companyId,
            publisherId: server.userCode,
            parentDocumentId: parseInt(parentDocumentId),
            documentDescription: newFormName,
            cardDescription: cardDescription,
            datasetName: newDatasetName,
            Attachments: {
                item: []
            },
            customEvents: {
                item: [],
            },
            persistenceType: persistenceType.value,
        };
    }

    private static async getUpdateFormParams(server: ServerDTO, selectedForm: DocumentDTO): Promise<FormDTO|null> {
        const newDatasetName = await window.showInputBox({
            prompt: "Qual o nome do Dataset do Formulário?",
            value: selectedForm.datasetName
        }) || "";

        if (!newDatasetName) {
            return null;
        }

        const versionOption = await window.showQuickPick(
            [
                {
                    label: "Manter Versão",
                    value: "0",
                },
                {
                    label: "Criar Nova Versão",
                    value: "2",
                }
            ],
            {
                placeHolder: "Controle de Versão"
            }
        );

        if (!versionOption) {
            return null;
        }

        const descriptionField = await window.showInputBox({
            prompt: "Nome do campo descritor (deixe em branco para usar o padrão)",
            value: selectedForm.cardDescription,
        }) || "";

        return {
            username: server.username,
            password: server.password,
            companyId: server.companyId,
            publisherId: server.userCode,
            documentId: selectedForm.documentId,
            descriptionField: descriptionField,
            cardDescription: selectedForm.documentDescription,
            datasetName: newDatasetName,
            Attachments: {
                item: []
            },
            customEvents: {
                item: [],
            },
            generalInfo: {
                versionOption: versionOption.value
            },
        };
    }

    private static async getExportFormSelected(server: ServerDTO, formNameOrId: string|number) {
        const forms = await FormService.getForms(server);
        const items = [];
        let selected = null;

        for (let form of forms) {
            if (formNameOrId === form.documentId || formNameOrId === form.documentDescription) {
                selected = {
                    label: form.documentId + ' - ' + form.documentDescription,
                    detail: form.datasetName
                };
            } else {
                items.push({
                    label: form.documentId + ' - ' + form.documentDescription,
                    detail: form.datasetName
                });
            }
        }

        items.unshift({
            label: "Novo Formulário"
        });

        if (selected) {
            items.unshift(selected);
        }

        const result = await window.showQuickPick(items, {
            placeHolder: "Criar ou Editar formulário?"
        });

        if (!result) {
            return undefined;
        }

        if (result.label === "Novo Formulário") {
            return "novo";
        }

        const endPosition = result.label.indexOf(" - ");
        const documentId = result.label.substring(0, endPosition);
        return forms.find(form => form.documentId.toString() === documentId);
    }
}
