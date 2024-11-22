import { Uri, window, workspace, FileType } from 'vscode';
import { readFileSync } from "fs";
import { glob } from "glob";
import { basename } from "path";
import * as JSZip from 'jszip';
import { UtilsService } from "../services/UtilsService";
import { TemplateService } from "../services/TemplateService";
import { ServerService } from "./ServerService";
import {LoginService} from "./LoginService";

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
                ).then(r => r.json());

                if (response.message) {
                    window.showErrorMessage(response.message.message);
                } else {
                    window.showInformationMessage("Widget enviada com sucesso. Você será notificado assim que a instalação/atualização for concluída.");
                }
            } catch (error) {
                window.showErrorMessage(`Erro: ${error}`);
            }
        })
        .catch(e => window.showErrorMessage(`Erro: ${e}`));
    }
}
