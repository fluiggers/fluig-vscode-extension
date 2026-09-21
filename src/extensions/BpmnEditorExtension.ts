import * as vscode from "vscode";

interface FluigProcessEditorCommands {
    validateActiveDocument(): Promise<void>;
    generateActiveTranslations(): Promise<void>;
}

type FluigProcessEditorProviderInstance = vscode.CustomTextEditorProvider & FluigProcessEditorCommands;

type FluigProcessEditorProviderConstructor = {
    readonly viewType: string;
    new(context: vscode.ExtensionContext): FluigProcessEditorProviderInstance;
};

const legacyProvider = require("../bpmn/FluigProcessEditorProvider") as {
    FluigProcessEditorProvider: FluigProcessEditorProviderConstructor;
};

const FluigProcessEditorProvider = legacyProvider.FluigProcessEditorProvider;

export class BpmnEditorExtension {
    static activate(context: vscode.ExtensionContext): void {
        const provider = new FluigProcessEditorProvider(context);

        context.subscriptions.push(
            vscode.window.registerCustomEditorProvider(
                FluigProcessEditorProvider.viewType,
                provider,
                {
                    webviewOptions: { retainContextWhenHidden: true },
                    supportsMultipleEditorsPerDocument: true
                }
            ),
            vscode.commands.registerCommand("fluigBpmn.openText", async () => {
                const uri = vscode.window.activeTextEditor?.document.uri
                    ?? BpmnEditorExtension.activeTabUri();
                if (!uri) {
                    void vscode.window.showInformationMessage("Nenhum arquivo .process ativo.");
                    return;
                }
                await vscode.commands.executeCommand("vscode.openWith", uri, "default");
            }),
            vscode.commands.registerCommand(
                "fluigBpmn.validate",
                () => provider.validateActiveDocument()
            ),
            vscode.commands.registerCommand(
                "fluigBpmn.generateTranslations",
                () => provider.generateActiveTranslations()
            )
        );
    }

    private static activeTabUri(): vscode.Uri | undefined {
        const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
        if (input instanceof vscode.TabInputText || input instanceof vscode.TabInputCustom) {
            return input.uri;
        }
        return undefined;
    }
}
