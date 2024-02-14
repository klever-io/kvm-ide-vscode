import * as vscode from "vscode";
import { FreeTextVersion, Version } from "./version";

export async function askOpenWorkspace() {
    const message = "No folder open in your workspace. Please open a folder.";
    await vscode.window.showInformationMessage(message, { modal: true });
}

export function getActiveFilePath() {
    let activeTextEditor = vscode.window.activeTextEditor;

    if (!activeTextEditor) {
        throw new Error("Open a file!");
    }

    let path = activeTextEditor.document.uri.fsPath;
    return path;
}

export async function askContractName() {
    const result = await vscode.window.showInputBox({
        prompt: "Enter a name for your contract",
        value: "",
        ignoreFocusOut: true,
        placeHolder: "For example: mycontract",
        validateInput: (text) => {
            return text.length > 0 ? null : "Should not be empty.";
        },
    });

    return result;
}

export async function askInstallKsc(requiredVersion: Version): Promise<boolean> {
    let answer =
        await askYesNo(`KleverChain IDE requires ksc ${requiredVersion}, which isn't available in your environment.
Do you agree to install it?`);
    return answer;
}

export async function askKscVersion(defaultVersion: Version): Promise<Version> {
    const result = await vscode.window.showInputBox({
        prompt: "Enter the ksc version to install",
        value: defaultVersion.toString(),
        ignoreFocusOut: true,
        placeHolder: "For example: 5.6.7",
        validateInput: (text) => {
            return text.length > 0 ? null : "Should not be empty.";
        },
    });

    if (result === undefined) {
        return null;
    }

    return Version.parse(result);
}

export async function askInstallKoperator(requiredVersion: Version): Promise<boolean> {
    let answer =
        await askYesNo(`KleverChain IDE requires koperator ${requiredVersion}, which isn't available in your environment.
    Do you agree to install it?`);
    return answer;
}

export async function askKoperatorVersion(defaultVersion: Version): Promise<Version> {
    const result = await vscode.window.showInputBox({
        prompt: "Enter the koperator version to install",
        value: defaultVersion.toString(),
        ignoreFocusOut: true,
        placeHolder: "For example: 5.6.7",
        validateInput: (text) => {
            return text.length > 0 ? null : "Should not be empty.";
        },
    });

    if (result === undefined) {
        return null;
    }

    return Version.parse(result);
}

export async function askYesNo(question: string): Promise<boolean> {
    let answerYes = "Yes";
    let answerNo = "No";
    let answer = await vscode.window.showInformationMessage(question, { modal: true }, answerYes, answerNo);
    return answer === answerYes;
}

export async function askChoice(choices: string[]): Promise<string> {
    return await vscode.window.showQuickPick(choices, { ignoreFocusOut: true });
}

export async function askChoiceTyped<T extends vscode.QuickPickItem>(choices: T[]): Promise<T> {
    return await vscode.window.showQuickPick<T>(choices, {
        ignoreFocusOut: true,
    });
}
