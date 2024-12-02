import { Uri, window, workspace } from 'vscode';
import { basename } from "path";
import { UtilsService } from './UtilsService';
import { ServerDTO } from '../models/ServerDTO';
import { AttributionMechanismDTO } from '../models/AttributionMechanismDTO';
import { ServerService } from './ServerService';
import { readFileSync } from 'fs';
import {LoginService} from "./LoginService";

const basePath = "/ecm/api/rest/ecm/mechanism/";

const headers = new Headers();
headers.append("Accept", "application/json");
headers.append("Content-Type", "application/json");

export class AttributionMechanismService {
    private static async list(server: ServerDTO): Promise<AttributionMechanismDTO[]> {
        const url = UtilsService.getRestUrl(server, basePath, "getCustomAttributionMechanismList");

        try {
            headers.append('Cookie', await LoginService.loginAndGetCookies(server));
            const response:any = await fetch(url, { headers }).then(r => r.json());

            if (response.message) {
                window.showErrorMessage(response.message.message);
                return [];
            }

            return response;
        } catch (error) {
            window.showErrorMessage(`Erro: ${error}`);
        }

        return [];
    }

    private static async create(server: ServerDTO, mechanism: AttributionMechanismDTO) {
        try {
            headers.append('Cookie', await LoginService.loginAndGetCookies(server));
            return await fetch(
                UtilsService.getRestUrl(server, basePath, "createAttributionMechanism"),
                {
                    headers,
                    method: "POST",
                    body: JSON.stringify(mechanism),
                }
            ).then(r => r.json());
        } catch (error) {
            return {
                message: {
                    message: "Erro: " + error
                }
            };
        }
    }

    private static async update(server: ServerDTO, mechanism: AttributionMechanismDTO) {
        try {
            headers.append('Cookie', await LoginService.loginAndGetCookies(server));
            return await fetch(
                UtilsService.getRestUrl(server, basePath, "updateAttributionMechanism"),
                {
                    headers,
                    method: "POST",
                    body: JSON.stringify(mechanism),
                }
            ).then(r => r.json());
        } catch (error) {
            return {
                message: {
                    message: "Erro: " + error
                }
            };
        }
    }

    private static async delete(server: ServerDTO, mechanismId: string) {
        const url = UtilsService.getRestUrl(server, basePath, "deleteAttributionMechanism", { "mechanismId": mechanismId });

        try {
            headers.append('Cookie', await LoginService.loginAndGetCookies(server));
            return await fetch(
                url,
                {
                    headers,
                    method: "DELETE",
                }
            ).then(r => r.json());
        } catch (error) {
            return {
                message: {
                    message: "Erro: " + error
                }
            };
        }
    }

    /**
     * Retorna o mecanismo selecionado
     */
    public static async getOptionSelected(server: ServerDTO): Promise<AttributionMechanismDTO|null> {
        const mechanisms = await AttributionMechanismService.list(server);
        const items = mechanisms.map(mechanism => ({ label: mechanism.attributionMecanismPK.attributionMecanismId, detail: mechanism.name }));
        const result = await window.showQuickPick(items, {
            placeHolder: "Selecione o Mecanismo de Atribuição"
        });

        if (!result) {
            return null;
        }

        return mechanisms.find(mechanism => mechanism.attributionMecanismPK.attributionMecanismId === result.label) || null;
    }

    /**
     * Retorna os mecanismos selecionados
     */
    public static async getOptionsSelected(server: ServerDTO): Promise<AttributionMechanismDTO[]> {
        const mechanisms = await AttributionMechanismService.list(server);
        const items = mechanisms.map(mechanism => ({ label: mechanism.attributionMecanismPK.attributionMecanismId, detail: mechanism.name }));
        const result = await window.showQuickPick(items, {
            placeHolder: "Selecione o Mecanismo de Atribuição",
            canPickMany: true
        });

        if (!result) {
            return [];
        }

        const itemsSelected = result.map(v => v.label);

        return mechanisms.filter(mechanism => itemsSelected.includes(mechanism.attributionMecanismPK.attributionMecanismId));
    }

    /**
     * Realiza a importação de um mecanismo específico
     */
    public static async import() {
        const server = await ServerService.getSelect();

        if (!server) {
            return;
        }

        const mechanism = await AttributionMechanismService.getOptionSelected(server);

        if (!mechanism) {
            return;
        }

        AttributionMechanismService.saveFile(mechanism.attributionMecanismPK.attributionMecanismId, mechanism.attributionMecanismDescription);
    }

    /**
     * Realiza a importação de vários mecanismos de atribuição
     */
    public static async importMany() {
        const server = await ServerService.getSelect();

        if (!server) {
            return;
        }

        const mechanisms = await AttributionMechanismService.getOptionsSelected(server);

        if (!mechanisms.length) {
            return;
        }

        mechanisms.forEach(
            mechanism => AttributionMechanismService.saveFile(mechanism.attributionMecanismPK.attributionMecanismId, mechanism.attributionMecanismDescription)
        );
    }

    /**
     * Cria ou Atualiza Mecanismo de Atribuição no servidor
     */
    public static async export(fileUri: Uri) {
        const server = await ServerService.getSelect();

        if (!server) {
            return;
        }

        const mechanisms = await AttributionMechanismService.list(server);
        const items = [];

        let mechanismSelected = { label: "", detail: "" };
        let mechanismId: string = basename(fileUri.fsPath, '.js');

        for (let mechanism of mechanisms) {
            if (mechanism.attributionMecanismPK.attributionMecanismId !== mechanismId) {
                items.push({ label: mechanism.attributionMecanismPK.attributionMecanismId, detail: mechanism.name });
            } else {
                mechanismSelected = { label: mechanism.attributionMecanismPK.attributionMecanismId, detail: mechanism.name };
            }
        }

        items.unshift({ label: 'Novo Mecanismo Customizado', detail: "" });

        if (mechanismSelected.label !== '') {
            items.unshift(mechanismSelected);
        }

        mechanismSelected = (await window.showQuickPick(items, {
            placeHolder: "Criar ou Editar Mecanismo Customizado?"
        })) || { label: "", detail: "" };

        if (!mechanismSelected.label) {
            return;
        }

        const isNew = mechanismSelected.label === 'Novo Mecanismo Customizado';

        let mechanismStructure: AttributionMechanismDTO | undefined = undefined;
        let name: string = '';
        let description: string = '';

        if (isNew) {
            let existMechanism: boolean = false;

            do {
                mechanismId = await window.showInputBox({
                    prompt: "Qual o código do Mecanismo Customizado (sem espaços e sem caracteres especiais)?",
                    placeHolder: "mecanismo_customizado",
                    value: mechanismId
                }) || "";

                if (!mechanismId) {
                    return;
                }

                existMechanism = mechanisms.find((mechanism => mechanism.attributionMecanismPK.attributionMecanismId === mechanismId)) !== undefined;

                if (existMechanism) {
                    window.showWarningMessage(`O mecanismo "${mechanismId}" já existe no servidor "${server.name}"!`);
                }
            } while (existMechanism);

            mechanismStructure = {
                attributionMecanismPK: {
                    companyId: server.companyId,
                    attributionMecanismId: mechanismId
                },
                assignmentType: 1,
                controlClass: "com.datasul.technology.webdesk.workflow.assignment.customization.CustomAssignmentImpl",
                preSelectionClass: null,
                configurationClass: "",
                name: "",
                description: "",
                attributionMecanismDescription: ""
            };
        } else {
            mechanismId = mechanismSelected.label;
            mechanismStructure = mechanisms.find(mechanism => mechanism.attributionMecanismPK.attributionMecanismId === mechanismId);
        }

        name = await window.showInputBox({
            prompt: "Qual o nome do Mecanismo Customizado?",
            placeHolder: "Nome do Mecanismo",
            value: mechanismStructure?.name || mechanismId
        }) || "";

        description = await window.showInputBox({
            prompt: "Qual a descrição do Mecanismo Customizado?",
            placeHolder: "Descrição do Mecanismo",
            value: mechanismStructure?.description || mechanismId
        }) || "";

        if (!mechanismStructure || !description || !name) {
            return;
        }

        mechanismStructure.name = name;
        mechanismStructure.description = description;
        mechanismStructure.attributionMecanismDescription = readFileSync(fileUri.fsPath, 'utf8');

        let result: any = undefined;

        // Validar senha antes de exportar
        if (server.confirmExporting && !(await UtilsService.confirmPassword(server))) {
            return;
        }

        if (isNew) {
            result = await AttributionMechanismService.create(server, mechanismStructure);
        } else {
            result = await AttributionMechanismService.update(server, mechanismStructure);
        }

        if (result.content === 'OK') {
            window.showInformationMessage(`Mecanismo Customizado ${mechanismId} exportado com sucesso!`);
        } else {
            window.showErrorMessage(`Falha ao exportar o Mecanismo Customizado ${mechanismId}!\n${result.message.message}`);
        }
    }

    /**
     * Cria o arquivo de Mecanismo de Atribuição
     */
    private static async saveFile(name: string, content: string) {
        const fileUri = Uri.joinPath(UtilsService.getWorkspaceUri(), "mechanisms", name + ".js");

        await workspace.fs.writeFile(
            fileUri,
            Buffer.from(content, "utf-8")
        );

        window.showTextDocument(fileUri);
        window.showInformationMessage(`Mecanismo de Atribuição ${name} importado com sucesso!`);
    }
}
