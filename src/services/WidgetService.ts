import { Uri, window, workspace, FileType, ProgressLocation } from 'vscode';
import { readFileSync } from "fs";
import { glob } from "glob";
import { basename } from "path";
import * as JSZip from 'jszip';
import { UtilsService } from "../services/UtilsService";
import { TemplateService } from "../services/TemplateService";
import { ServerService } from "./ServerService";
import {LoginService} from "./LoginService";
import { ServerDTO } from '../models/ServerDTO';
import { WidgetFluiggersDTO } from '../models/WidgetFluiggersDTO';

export class WidgetService {
    /**
     * Create Widget
     */
    public static async create() {
        const widgetName: string = await window.showInputBox({
            prompt: "Qual o nome do Widget (sem espaços e sem caracteres especiais)?",
            placeHolder: "NomeWidget"
        }) || "";

        if (!widgetName) {
            return;
        }

        const widgetFileName = "view.ftl";

        const widgetUriFile = Uri.joinPath(
            UtilsService.getWorkspaceUri(),
            "wcm",
            "widget",
            widgetName,
            "src",
            "main",
            "resources",
            widgetFileName
        );

        try {
            // Se widget já existe carrega o arquivo no editor
            await workspace.fs.stat(widgetUriFile);
            return window.showTextDocument(widgetUriFile);
        } catch (err) {

        }

        const propertiesLanguages = ["en_US", "es", "pt_BR"];

        const widgetUri = Uri.joinPath(
            UtilsService.getWorkspaceUri(),
            "wcm",
            "widget",
            widgetName
        );

        // Copia todo o template da Widget
        await workspace.fs.copy(Uri.joinPath(TemplateService.templatesUri, 'widget'), widgetUri);

        const baseResourcesUri = Uri.joinPath(widgetUri, "src", "main", "resources");
        const baseWebAppUri = Uri.joinPath(widgetUri, "src", "main", "webapp");
        const basePropertiesUri = Uri.joinPath(baseResourcesUri, "widgetname.properties");

        const promises = propertiesLanguages.map(lang => workspace.fs.copy(
            basePropertiesUri,
            Uri.joinPath(baseResourcesUri, `${widgetName}_${lang}.properties`)
        ));

        promises.push(
            workspace.fs.rename(
                Uri.joinPath(baseWebAppUri, "resources", "css", "widgetname.css"),
                Uri.joinPath(baseWebAppUri, "resources", "css", `${widgetName}.css`)
            ),
            workspace.fs.rename(
                Uri.joinPath(baseWebAppUri, "resources", "js", "widgetname.js"),
                Uri.joinPath(baseWebAppUri, "resources", "js", `${widgetName}.js`)
            ),
            workspace.fs.writeFile(
                Uri.joinPath(widgetUri, '/src/main/webapp/WEB-INF/jboss-web.xml'),
                Buffer.from(readFileSync(Uri.joinPath(baseWebAppUri, "WEB-INF", "jboss-web.xml").fsPath, 'utf8').replace(/widgetname/g, widgetName), 'utf8')
            ),
            workspace.fs.writeFile(
                Uri.joinPath(widgetUri, '/src/main/resources/application.info'),
                Buffer.from(readFileSync(Uri.joinPath(baseResourcesUri, "application.info").fsPath, 'utf8').replace(/widgetname/g, widgetName), 'utf8')
            )
        );

        await Promise.all(promises);

        await workspace.fs.rename(basePropertiesUri, Uri.joinPath(baseResourcesUri, `${widgetName}.properties`));

        window.showTextDocument(widgetUriFile);
    }

    public static async export(fileUri: Uri) {
        const server = await ServerService.getSelect();

        if (!server) {
            return;
        }

        if (server.confirmExporting && !(await UtilsService.confirmPassword(server))) {
            return;
        }

        const widgetName: string = fileUri.path.replace(/.*\/widget\/([^/]+).*/, "$1");

        const widgetUri = Uri.joinPath(
            UtilsService.getWorkspaceUri(),
            "wcm",
            "widget",
            widgetName
        );

        const zipStream = new JSZip();
        zipStream.folder("WEB-INF");
        zipStream.folder("WEB-INF/classes");

        for (const filePath of glob.sync(Uri.joinPath(widgetUri, "src", "main", "webapp", "WEB-INF").fsPath + "/*.xml")) {
            zipStream.file("WEB-INF/" + basename(filePath), readFileSync(filePath, 'utf8'));
        }

        for (const filePath of glob.sync(Uri.joinPath(widgetUri, "src", "main", "resources").fsPath + "/*.*")) {
            zipStream.file("WEB-INF/classes/" + basename(filePath), readFileSync(filePath, 'utf8'));
        }

        async function addFolderFiles(folder: Uri, zipFolder: string) {
            zipStream.folder(zipFolder);

            for (const [name, type] of await workspace.fs.readDirectory(folder)) {
                const fileUri = Uri.joinPath(folder, name);
                const zipPath = `${zipFolder}/${name}`;

                if (type === FileType.Directory) {
                    await addFolderFiles(fileUri, zipPath);
                } else {
                    zipStream.file(zipPath, await workspace.fs.readFile(fileUri), { binary: true });
                }
            }
        }

        await addFolderFiles(Uri.joinPath(widgetUri, "src", "main", "webapp", "resources"), "resources");

        zipStream.generateAsync({
            type:'uint8array',
            compression: 'STORE',
            mimeType: 'application/java-archive',
        })
        .then(async function (content) {
            const url = `${UtilsService.getHost(server)}/portal/api/rest/wcmservice/rest/product/uploadfile`;

            const formData = new FormData();
            formData.append("fileName", `${widgetName}.war`);
            formData.append("fileDescription", "WCM Eclipse Plugin Deploy Artifact");
            formData.append("attachment", new Blob([content]), `${widgetName}.war`);

            try {
                const response:any = await fetch(
                    url,
                    {
                        method: "POST",
                        headers: {
                            "Accept": "application/json",
                            'Cookie': await LoginService.loginAndGetCookies(server)
                        },
                        body: formData,
                    }
                ).then(r => {
                    if (!r.ok) {
                        throw new Error(`${r.status} - ${r.statusText}.`);
                    }

                    return r.json();
                })


                if (response.message) {
                    window.showErrorMessage(response.message.message);
                } else {
                    window.showInformationMessage("Widget enviada com sucesso. Você será notificado assim que a instalação/atualização for concluída.");
                }
            } catch (error: any) {
                window.showErrorMessage(error.message || error);
            }
        })
        .catch(error => window.showErrorMessage(error.message || error));
    }

    public static async exportFluiggersWidget() {
        const server = await ServerService.getSelect();

        if (!server) {
            return;
        }

        if (server.confirmExporting && !(await UtilsService.confirmPassword(server))) {
            return;
        }

        try {
            const downloadedWidget = await fetch('https://raw.githubusercontent.com/fluiggers/fluig-widget-helper/refs/heads/master/target/fluiggersWidget.war')

            if (!downloadedWidget.ok || !downloadedWidget.body) {
                throw new Error("Não foi possível baixar a widget do GitHub");
            }

            const url = `${UtilsService.getHost(server)}/portal/api/rest/wcmservice/rest/product/uploadfile`;

            const formData = new FormData();
            formData.append("fileName", 'fluiggersWidget.war');
            formData.append("fileDescription", "WCM Eclipse Plugin Deploy Artifact");
            formData.append("attachment", await downloadedWidget.blob(), 'fluiggersWidget.war');

            const response:any = await fetch(
                url,
                {
                    method: "POST",
                    headers: {
                        "Accept": "application/json",
                        'Cookie': await LoginService.loginAndGetCookies(server)
                    },
                    body: formData,
                }
            ).then(r => {
                if (!r.ok) {
                    throw new Error(`${r.status} - ${r.statusText}.`);
                }

                return r.json();
            })

            if (response.message) {
                window.showErrorMessage(response.message.message);
            } else {
                window.showInformationMessage("Widget enviada com sucesso. Você será notificado assim que a instalação/atualização for concluída.");
            }
        } catch (error: any) {
            window.showErrorMessage(error.message || error);
        }
    }

    /**
     * Importa as wigets indicadas selecionadas
     */
    public static async import() {
        try {
            const server = await ServerService.getSelect();

            if (!server) {
                return;
            }

            const widgets = await WidgetService.getOptionsSelected(server);

            if (!widgets || !widgets.length) {
                return;
            }

            const results = await window.withProgress(
                {
                    location: ProgressLocation.Notification,
                    title: "Importando Widgets.",
                    cancellable: false
                },
                progress => {
                    const increment = 100 / widgets.length;
                    let current = 0;

                    progress.report({ increment: 0 });

                    return Promise.all(widgets.map(async widget => {
                        try {
                            const zipFile = await JSZip.loadAsync(await WidgetService.downloadWidgetFile(server, widget.filename));

                            const widgetUri = Uri.joinPath(UtilsService.getWorkspaceUri(), 'wcm', 'widget', widget.code);

                            try {
                                await workspace.fs.delete(widgetUri, { recursive: true, useTrash: true });
                            } catch (err: any) {
                                window.showWarningMessage(err);
                            }

                            zipFile.forEach(async (relativePath, file) => {
                                if (file.dir) {
                                    return;
                                }

                                const fileUri = WidgetService.getFileImportUri(widgetUri, relativePath);

                                if (!fileUri) {
                                    return;
                                }

                                try {
                                    await workspace.fs.writeFile(fileUri, await file.async('uint8array'));
                                } catch (err: any) {
                                    window.showWarningMessage(err);
                                }
                            });
                        } catch (error: any) {
                            window.showErrorMessage(error.message || error);
                        }

                        current += increment;
                        progress.report({ increment: current });
                        return true;
                    }));
                }
            );

            window.showInformationMessage(
                results.length > 1
                ? `${results.length} widgets foram importadas.`
                : "1 widget foi importada."
            );
        } catch (error: any) {
            window.showErrorMessage(error.message || error);
        }
    }

    /**
     * Retorna o caminho do arquivo a ser escrito
     *
     * @param widgetUri Uri da Widget
     * @param relativePath Caminho relativo do arquivo no zip
     */
    public static getFileImportUri(widgetUri: Uri, relativePath: string): Uri | null {

        // Pasta Resources descompacta em src/main/webapp/resources
        if (relativePath.startsWith('resources/')) {
            return Uri.joinPath(
                Uri.joinPath(widgetUri, 'src', 'main', 'webapp'),
                ...relativePath.split('/')
            );
        }

        // Todos os arquivos da pasta WEB-INF/classes descompacta em src/main/resources
        if (/^WEB-INF\/classes\/\w+\.\w+$/.test(relativePath)) {
            return Uri.joinPath(
                Uri.joinPath(widgetUri, 'src', 'main', 'resources'),
                relativePath.replace('WEB-INF/classes/', '')
            );
        }

        // Todos os arquivos da pasta WEB-INF descompacta em src/main/webapp/WEB-INF
        if (/^WEB-INF\/[\w-]+\.\w+$/.test(relativePath)) {
            return Uri.joinPath(
                Uri.joinPath(widgetUri, 'src', 'main', 'webapp'),
                ...relativePath.split('/')
            );
        }

        // Todos os diretórios da pasta WEB-INF/classes descompacta em src/main/java
        if (/^WEB-INF\/classes\/.+\/[\w-]+\.\w+$/.test(relativePath)) {
            return Uri.joinPath(
                Uri.joinPath(widgetUri, 'src', 'main', 'java'),
                ...relativePath.replace('WEB-INF/classes/', '').split('/')
            );
        }

        // Caso seja o pom.xml
        if (relativePath.endsWith('pom.xml')) {
            return Uri.joinPath(widgetUri, 'pom.xml');
        }

        return null;
    }

    public static async getWidgets(server: ServerDTO): Promise<WidgetFluiggersDTO[]> {
        await UtilsService.validateServerHasFluiggersWidget(server);

        const widgets: any = await fetch(
            `${UtilsService.getHost(server)}/fluiggersWidget/api/widgets`,
            {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                    'Cookie': await LoginService.loginAndGetCookies(server)
                }
            }
        ).then(r => r.json());

        return widgets;
    }

    /**
     * Retorna as widgets selecionadas
     */
    public static async getOptionsSelected(server: ServerDTO): Promise<WidgetFluiggersDTO[]> {
        const widgets = await WidgetService.getWidgets(server);

        const items = widgets.map(widget => ({
            label: widget.code,
            detail: `${widget.title} - ${widget.description}`
        }));

        const result = await window.showQuickPick(items, {
            placeHolder: "Selecione as widgets para importar",
            canPickMany: true
        });

        if (!result) {
            return [];
        }

        const selectedWidgets: WidgetFluiggersDTO[] = [];

        result.forEach(item => {
            const findedWidget = widgets.find(widget => widget.code === item.label);

            if (findedWidget) {
                selectedWidgets.push(findedWidget);
            }
        });

        return selectedWidgets;
    }

    public static async downloadWidgetFile(server: ServerDTO, widgetFileName: string): Promise<ArrayBuffer> {
        return fetch(
            `${UtilsService.getHost(server)}/fluiggersWidget/api/widgets/${widgetFileName}`,
            {
                method: "GET",
                headers: { 'Cookie': await LoginService.loginAndGetCookies(server) }
            }
        )
        .then(async (r) => {
            if (r.status !== 200) {
                const message = await r.text();
                throw `${widgetFileName}: ${message}`;
            }
            return r.arrayBuffer();
        })
    }
}
