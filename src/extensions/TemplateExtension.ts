import * as vscode from 'vscode';
import {TemplateService} from "../services/TemplateService";

export class TemplateExtension {

    public static activate(context: vscode.ExtensionContext): void {
        TemplateService.templatesUri = vscode.Uri.joinPath(context.extensionUri, 'dist', 'templates');
        TemplateService.formEventsUri = vscode.Uri.joinPath(TemplateService.templatesUri, 'formEvents');
        TemplateService.workflowEventsUri = vscode.Uri.joinPath(TemplateService.templatesUri, 'workflowEvents');
        TemplateService.globalEventsUri = vscode.Uri.joinPath(TemplateService.templatesUri, 'globalEvents');
        TemplateService.formEventsNames = TemplateService.getTemplatesNameFromPath(TemplateService.formEventsUri);
        TemplateService.workflowEventsNames = TemplateService.getTemplatesNameFromPath(TemplateService.workflowEventsUri);
        TemplateService.globalEventsNames = TemplateService.getTemplatesNameFromPath(TemplateService.globalEventsUri);
    }
}
