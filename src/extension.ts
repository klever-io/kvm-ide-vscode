import * as vscode from "vscode";
import { Uri } from "vscode";
import { SmartContract, SmartContractsViewModel } from "./contracts";
import { onTopLevelError } from "./errors";
import { Feedback } from "./feedback";
import * as presenter from "./presenter";
import { Root } from "./root";
import * as sdk from "./sdk";
import { ContractTemplate, TemplatesViewModel } from "./templates";
import * as workspace from "./workspace";
import path = require("path");

export async function activate(context: vscode.ExtensionContext) {
    Feedback.debug({ message: "KleverChain extension activated." });

    Root.ExtensionContext = context;

    let templatesViewModel = new TemplatesViewModel();
    vscode.window.registerTreeDataProvider("contractTemplates", templatesViewModel);
    let contractsViewModel = new SmartContractsViewModel();
    vscode.window.registerTreeDataProvider("smartContracts", contractsViewModel);

    vscode.commands.registerCommand("kleverchain.setupWorkspace", setupWorkspace);
    vscode.commands.registerCommand("kleverchain.installSdk", installSdk);
    vscode.commands.registerCommand("kleverchain.installKoperator", installKoperator);
    vscode.commands.registerCommand(
        "kleverchain.installRustDebuggerPrettyPrinterScript",
        installRustDebuggerPrettyPrinterScript
    );
    vscode.commands.registerCommand("kleverchain.gotoContract", gotoContract);
    vscode.commands.registerCommand("kleverchain.buildContract", buildContract);
    vscode.commands.registerCommand("kleverchain.deployContract", deployContract);
    vscode.commands.registerCommand("kleverchain.runScenarios", runScenarios);
    vscode.commands.registerCommand("kleverchain.runFreshLocalnet", runFreshLocalnet);
    vscode.commands.registerCommand("kleverchain.resumeExistingLocalnet", resumeExistingLocalnet);
    vscode.commands.registerCommand("kleverchain.stopLocalnet", stopLocalnet);

    vscode.commands.registerCommand("kleverchain.cleanContract", cleanContract);
    vscode.commands.registerCommand(
        "kleverchain.refreshTemplates",
        async () => await refreshViewModel(templatesViewModel)
    );
    vscode.commands.registerCommand("kleverchain.newFromTemplate", newFromTemplate);
    vscode.commands.registerCommand(
        "kleverchain.refreshContracts",
        async () => await refreshViewModel(contractsViewModel)
    );

    const isWorkspaceSetup = workspace.isWorkspaceSetup();
    if (!isWorkspaceSetup) {
        await setupWorkspace();
    }
}

export function deactivate() {
    Feedback.debug({ message: "KleverChain extension deactivated." });
}

async function setupWorkspace() {
    if (!workspace.isOpen()) {
        await presenter.askOpenWorkspace();
        return;
    }

    await workspace.setup();

    await Promise.all([sdk.ensureInstalled(), sdk.ensureKoperatorInstalled()]);

    await Feedback.info({
        message: "Workspace has been set up.",
        display: true,
    });
}

async function installSdk() {
    try {
        await sdk.reinstall();
    } catch (error) {
        await onTopLevelError(error);
    }
}

async function installKoperator() {
    try {
        await sdk.reinstallKoperatorModule();
    } catch (error) {
        await onTopLevelError(error);
    }
}

async function installRustDebuggerPrettyPrinterScript() {
    try {
        await sdk.installRustDebuggerPrettyPrinterScript();
    } catch (error) {
        await onTopLevelError(error);
    }
}

async function refreshViewModel(viewModel: any) {
    try {
        await viewModel.refresh();
    } catch (error) {
        await onTopLevelError(error);
    }
}

async function newFromTemplate(template: ContractTemplate) {
    try {
        let parentFolder = workspace.getPath();
        let templateName = template.name;
        let contractName = await presenter.askContractName();

        await sdk.newFromTemplate(parentFolder, templateName, contractName);
        vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
    } catch (error) {
        await onTopLevelError(error);
    }
}

async function gotoContract(contract: SmartContract) {
    try {
        let uri = Uri.file(contract.getMetadataPath());
        await vscode.commands.executeCommand("vscode.open", uri);
        await vscode.commands.executeCommand("workbench.files.action.focusFilesExplorer");
    } catch (error) {
        await onTopLevelError(error);
    }
}

async function buildContract(contract: any) {
    try {
        let folder = getContractFolder(contract);
        await sdk.buildContract(folder);
    } catch (error) {
        await onTopLevelError(error);
    }
}

async function deployContract(contract: any) {
    try {
        let folder = getContractFolder(contract);
        await sdk.deployContract(folder);
    } catch (error) {
        await onTopLevelError(error);
    }
}

async function cleanContract(contract: any) {
    try {
        let folder = getContractFolder(contract);
        await sdk.cleanContract(folder);
    } catch (error) {
        await onTopLevelError(error);
    }
}

function getContractFolder(contract: any): string {
    if (contract instanceof Uri) {
        let fsPath = contract.fsPath;
        if (fsPath.includes("kleverkapp.json")) {
            return path.dirname(fsPath);
        } else if (fsPath.includes("snippets.sh")) {
            return path.dirname(fsPath);
        } else {
            return fsPath;
        }
    }

    return (contract as SmartContract).getPath();
}

async function runScenarios(item: any) {
    try {
        if (item instanceof Uri) {
            await sdk.runScenarios(item.fsPath);
        } else {
            await sdk.runScenarios((item as SmartContract).getPath());
        }
    } catch (error) {
        await onTopLevelError(error);
    }
}

async function runFreshLocalnet(localnetToml: Uri) {
    try {
        await sdk.runFreshLocalnet(localnetToml);
    } catch (error) {
        await onTopLevelError(error);
    }
}

async function resumeExistingLocalnet(localnetToml: Uri) {
    try {
        await sdk.resumeExistingLocalnet(localnetToml);
    } catch (error) {
        await onTopLevelError(error);
    }
}

async function stopLocalnet(localnetToml: Uri) {
    try {
        await sdk.stopLocalnet(localnetToml);
    } catch (error) {
        await onTopLevelError(error);
    }
}
