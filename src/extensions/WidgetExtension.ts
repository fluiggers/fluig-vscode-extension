import * as vscode from 'vscode';
import { UtilsService } from "../services/UtilsService";
import { readFileSync } from "fs";
import { TemplateService } from "../services/TemplateService";

export class WidgetExtension {

    public static activate(context: vscode.ExtensionContext): void {
        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.newWidget",
            WidgetExtension.createWidget
        ));
    }

    /**
     * Create Widget
     */
    private static async createWidget() {
        const widgetName: string = await vscode.window.showInputBox({
            prompt: "Qual o nome do Widget (sem espaços e sem caracteres especiais)?",
            placeHolder: "NomeWidget"
        }) || "";

        if (!widgetName) {
            return;
        }

        const widgetFileName = "view.ftl";

        const widgetUriFile = vscode.Uri.joinPath(
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
            await vscode.workspace.fs.stat(widgetUriFile);
            return vscode.window.showTextDocument(widgetUriFile);
        } catch (err) {

        }

        const propertiesLanguages = ["en_US", "es", "pt_BR"];

        const widgetUri = vscode.Uri.joinPath(
            UtilsService.getWorkspaceUri(),
            "wcm",
            "widget",
            widgetName
        );

        // Copia todo o template da Widget
        await vscode.workspace.fs.copy(vscode.Uri.joinPath(TemplateService.templatesUri, 'widget'), widgetUri);

        const baseResourcesUri = vscode.Uri.joinPath(widgetUri, "src", "main", "resources");
        const baseWebAppUri = vscode.Uri.joinPath(widgetUri, "src", "main", "webapp");
        const basePropertiesUri = vscode.Uri.joinPath(baseResourcesUri, "widgetname.properties");

        const promises = propertiesLanguages.map(lang => vscode.workspace.fs.copy(
            basePropertiesUri,
            vscode.Uri.joinPath(baseResourcesUri, `${widgetName}_${lang}.properties`)
        ));

        promises.push(
            vscode.workspace.fs.rename(
                vscode.Uri.joinPath(baseWebAppUri, "resources", "css", "widgetname.css"),
                vscode.Uri.joinPath(baseWebAppUri, "resources", "css", `${widgetName}.css`)
            ),
            vscode.workspace.fs.rename(
                vscode.Uri.joinPath(baseWebAppUri, "resources", "js", "widgetname.js"),
                vscode.Uri.joinPath(baseWebAppUri, "resources", "js", `${widgetName}.js`)
            ),
            vscode.workspace.fs.writeFile(
                vscode.Uri.joinPath(widgetUri, '/src/main/webapp/WEB-INF/jboss-web.xml'),
                Buffer.from(readFileSync(vscode.Uri.joinPath(baseWebAppUri, "WEB-INF", "jboss-web.xml").fsPath, 'utf8').replace(/widgetname/g, widgetName), 'utf8')
            ),
            vscode.workspace.fs.writeFile(
                vscode.Uri.joinPath(widgetUri, '/src/main/resources/application.info'),
                Buffer.from(readFileSync(vscode.Uri.joinPath(baseResourcesUri, "application.info").fsPath, 'utf8').replace(/widgetname/g, widgetName), 'utf8')
            )
        );

        await Promise.all(promises);

        await vscode.workspace.fs.rename(basePropertiesUri, vscode.Uri.joinPath(baseResourcesUri, `${widgetName}.properties`));

        vscode.window.showTextDocument(widgetUriFile);
    }
}
