import * as vscode from 'vscode';
import {UtilsService} from "../services/UtilsService";
import {readFileSync} from "fs";
import {TemplateService} from "../services/TemplateService";

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
        let widgetName: string = await vscode.window.showInputBox({
            prompt: "Qual o nome do Widget (sem espaços e sem caracteres especiais)?",
            placeHolder: "NomeWidget"
        }) || "";

        if (!widgetName) {
            return;
        }
        const properties = ["", "_en_US", "_es", "_pt_BR"];
        const widgetFileName = "view.ftl";
        const widgetUri = vscode.Uri.joinPath(
            UtilsService.getWorkspaceUri(),
            "wcm",
            "widget",
            widgetName
        );

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

        await vscode.workspace.fs.copy(
            vscode.Uri.joinPath(TemplateService.templatesUri, 'widget'),
            widgetUri,
            {overwrite: false}
        );

        await vscode.workspace.fs.copy(
            vscode.Uri.joinPath(widgetUri, '/src/main/resources/widgetname.properties'),
            vscode.Uri.joinPath(widgetUri,"src","main", "resources",`${widgetName}${properties[0]}.properties`),
            {overwrite: false}
        );
        await vscode.workspace.fs.copy(
            vscode.Uri.joinPath(widgetUri, '/src/main/resources/widgetname.properties'),
            vscode.Uri.joinPath(widgetUri,"src","main", "resources",`${widgetName}${properties[1]}.properties`),
            {overwrite: false}
        );
        await vscode.workspace.fs.copy(
            vscode.Uri.joinPath(widgetUri, '/src/main/resources/widgetname.properties'),
            vscode.Uri.joinPath(widgetUri,"src","main", "resources",`${widgetName}${properties[2]}.properties`),
            {overwrite: false}
        );
        await vscode.workspace.fs.rename(
            vscode.Uri.joinPath(widgetUri, '/src/main/resources/widgetname.properties'),
            vscode.Uri.joinPath(widgetUri,"src","main", "resources",`${widgetName}${properties[3]}.properties`),
            {overwrite: false}
        );
        await vscode.workspace.fs.rename(
            vscode.Uri.joinPath(widgetUri, '/src/main/webapp/resources/css/widgetname.css'),
            vscode.Uri.joinPath(widgetUri, '/src/main/webapp/resources/css/', `${widgetName}.css`),
            {overwrite: false}
        );
        await vscode.workspace.fs.rename(
            vscode.Uri.joinPath(widgetUri, '/src/main/webapp/resources/js/widgetname.js'),
            vscode.Uri.joinPath(widgetUri, '/src/main/webapp/resources/js/', `${widgetName}.js`),
            {overwrite: false}
        );

        const jbossweb = readFileSync(vscode.Uri.joinPath(TemplateService.templatesUri, 'widget/src/main/webapp/WEB-INF/jboss-web.xml').fsPath, 'utf8').replace(new RegExp('widgetname', 'g'), widgetName);
        const bufferJbossweb = Buffer.from(jbossweb, 'utf8');

        await vscode.workspace.fs.writeFile(
            vscode.Uri.joinPath(widgetUri, '/src/main/webapp/WEB-INF/jboss-web.xml'),
            bufferJbossweb
        );

        const application = readFileSync(vscode.Uri.joinPath(TemplateService.templatesUri, 'widget/src/main/resources/application.info').fsPath, 'utf8').replace(new RegExp('widgetname', 'g'), widgetName);
        const bufferApplication = Buffer.from(application, 'utf8');

        await vscode.workspace.fs.writeFile(
            vscode.Uri.joinPath(widgetUri, '/src/main/resources/application.info'),
            bufferApplication
        );

        vscode.window.showTextDocument(widgetUriFile);
    }
}
