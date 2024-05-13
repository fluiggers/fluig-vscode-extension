import { ExtensionContext, Uri } from 'vscode';
import { TemplateService } from "../services/TemplateService";

export class TemplateExtension {

    public static activate(context: ExtensionContext): void {
        TemplateService.templatesUri = Uri.joinPath(context.extensionUri, 'dist', 'templates');
        TemplateService.formEventsUri = Uri.joinPath(TemplateService.templatesUri, 'formEvents');
        TemplateService.workflowEventsUri = Uri.joinPath(TemplateService.templatesUri, 'workflowEvents');
        TemplateService.globalEventsUri = Uri.joinPath(TemplateService.templatesUri, 'globalEvents');
        TemplateService.formEventsNames = TemplateService.getTemplatesNameFromPath(TemplateService.formEventsUri);
        TemplateService.workflowEventsNames = TemplateService.getTemplatesNameFromPath(TemplateService.workflowEventsUri);
        TemplateService.globalEventsNames = TemplateService.getTemplatesNameFromPath(TemplateService.globalEventsUri);
    }
}
