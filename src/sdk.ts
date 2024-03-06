import * as vscode from "vscode";
import axios from "axios";
import { ConfigurationTarget, InputBoxOptions, Terminal, Uri, window, workspace, ProgressLocation } from "vscode";
import { Environment } from "./environment";
import { Feedback } from "./feedback";
import * as presenter from "./presenter";
import { Settings } from "./settings";
import * as storage from "./storage";
import { ProcessFacade, sleep } from "./utils";
import { FreeTextVersion, Version } from "./version";
import fetch from "node-fetch";
import path = require("path");
import fs = require("fs");

const DEFAULT_KSC_VERSION = Version.parse("0.43.3");
const DEFAULT_KOPERATOR_VERSION = Version.parse("1.6.3");
const LATEST_VERSIONS_URL = "https://storage.googleapis.com/kleverchain-public/versions.json";
const BASE_STORAGE_URL = "https://storage.googleapis.com/kleverchain-public";

export function getPath() {
    return Settings.getSdkPath();
}

function getKscPath() {
    // if (process.platform === "win32") {
    //     return path.join(getPath(), "ksc.exe");
    // } else {
    //     return path.join(getPath(), "ksc");
    // }

    return path.join(getPath(), "ksc");
}

function getKoperatorPath() {
    // if (process.platform === "win32") {
    //     return path.join(getPath(), "koperator.exe");
    // } else {
    //     return path.join(getPath(), "koperator");
    // }

    return path.join(getPath(), "koperator");
}

function getPrettyPrinterPath() {
    return path.join(getPath(), "multiversx_sc_lldb_pretty_printers.py");
}

export async function reinstall() {
    let latestVersion = await getLatestKnownKscVersion();
    let version = await presenter.askKscVersion(latestVersion);
    if (!version) {
        return;
    }

    await reinstallKsc(version);
}

/**
 * Fetch the latest known version from Github, or fallback to the IDE-configured default version, if the fetch fails.
 */
async function getLatestKnownKscVersion(): Promise<Version> {
    try {
        let response = await axios.get(LATEST_VERSIONS_URL);
        return Version.parse(response.data.ksc);
    } catch {
        return DEFAULT_KSC_VERSION;
    }
}

async function getLatestKnownKoperatorVersion(): Promise<Version> {
    try {
        let response = await axios.get(LATEST_VERSIONS_URL);
        return Version.parse(response.data.koperator);
    } catch {
        return DEFAULT_KOPERATOR_VERSION;
    }
}

export async function ensureInstalled() {
    await ensureKsc();
}

export async function ensureKoperatorInstalled() {
    await ensureKoperator();
}

async function ensureKsc() {
    let isInstalled = await isKscInstalled();
    if (isInstalled) {
        return;
    }

    let latestKscVersion = await getLatestKnownKscVersion();
    let answer = await presenter.askInstallKsc(latestKscVersion);
    if (answer) {
        await reinstallKsc(latestKscVersion);
    }
}

async function ensureKoperator() {
    let isInstalled = await isKoperatorInstalled();
    if (isInstalled) {
        return;
    }

    let latestKscVersion = await getLatestKnownKoperatorVersion();
    let answer = await presenter.askInstallKoperator(latestKscVersion);
    if (answer) {
        await reinstallKoperator(latestKscVersion);
    }
}

async function isKscInstalled(exactVersion?: Version): Promise<boolean> {
    let [cliVersionString, ok] = await getOneLineStdout(getKscPath(), ["--version"]);
    if (!cliVersionString || !ok) {
        return false;
    }

    let installedVersion = Version.parse(cliVersionString);

    if (exactVersion) {
        return installedVersion.isSameAs(exactVersion);
    }

    // No exact version specified (desired).
    let latestKnownVersion = await getLatestKnownKscVersion();
    return installedVersion.isNewerOrSameAs(latestKnownVersion);
}

async function getOneLineStdout(program: string, args: string[]): Promise<[string, boolean]> {
    try {
        let result = await ProcessFacade.execute({
            program: program,
            args: args,
        });

        return [result.stdout, true];
    } catch (e) {
        return ["", false];
    }
}

export async function reinstallKsc(version: Version) {
    Feedback.info({
        message: "Installation of ksc has been started. Please wait for installation to finish.",
        display: true,
    });

    // let kscUp: string;
    // if (process.platform === "win32") {
    //     kscUp = storage.getPathTo("ksc.exe");
    // } else {
    //     kscUp = storage.getPathTo("ksc");
    // }

    // kscUp = kscUp.replace(/ /g, "\\ ");

    const kscUp = storage.getPathTo("ksc");

    const kscUpUrl = getKscUpUrl(version);
    await window.withProgress(
        {
            location: ProgressLocation.Window,
            cancellable: false,
            title: "Downloading: Ksc",
        },
        async (progress) => {
            progress.report({ increment: 0 });

            await downloadFile(kscUp, kscUpUrl);

            progress.report({ increment: 100 });
        }
    );

    const kscUpCommand = `"${kscUp}" --help`;

    if (process.platform !== "win32") {
        // 0o755 gives the owner read/write/execute permissions, and group and others read/execute permissions
        await fs.promises.chmod(kscUp, 0o755);
    }

    await runInTerminal("installer", kscUpCommand);

    // Determine the target path for ksc
    const targetPath = getKscPath();

    // Ensure the target directory exists
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });

    // Copy the file in a cross-platform way
    await fs.promises.copyFile(kscUp, targetPath);

    do {
        Feedback.debug({
            message: "Waiting for the installer to finish.",
        });
        await sleep(5000);
    } while (!(await isKscInstalled(version)));

    await Feedback.info({
        message:
            "ksc has been installed. Please close all Visual Studio Code terminals and then reopen them (as needed).",
        display: true,
        modal: true,
    });
}

function getKscUpUrl(version: Version) {
    switch (process.platform) {
        case "win32":
            return `${BASE_STORAGE_URL}/ksc/win32/${version.vValue}/ksc.exe`;
        case "darwin":
            if (process.arch === "arm64") {
                return `${BASE_STORAGE_URL}/ksc/darwin-arm64/${version.vValue}/ksc`;
            }
            return `${BASE_STORAGE_URL}/ksc/darwin/${version.vValue}/ksc`;
        case "linux":
            return `${BASE_STORAGE_URL}/ksc/linux/${version.vValue}/ksc`;
        default:
            return `platform not supported`;
    }
}

function getKoperatorUpUrl(version: Version) {
    switch (process.platform) {
        case "win32":
            return `${BASE_STORAGE_URL}/koperator/win32/${version.vValue}/koperator.exe`;
        case "darwin":
            if (process.arch === "arm64") {
                return `${BASE_STORAGE_URL}/koperator/darwin-arm64/${version.vValue}/koperator`;
            }
            return `${BASE_STORAGE_URL}/koperator/darwin/${version.vValue}/koperator`;
        case "linux":
            return `${BASE_STORAGE_URL}/koperator/linux/${version.vValue}/koperator`;
        default:
            return `platform not supported`;
    }
}

export async function newFromTemplate(folder: string, template: string, name: string) {
    try {
        await ProcessFacade.execute({
            program: getKscPath(),
            args: ["new", "--path", folder, "--template", template, "--name", name],
        });

        Feedback.info({
            message: `Smart Contract [${name}] created, based on template [${template}].`,
            display: true,
        });
    } catch (error: any) {
        throw new Error("Could not create Smart Contract", { cause: error });
    }
}

async function runInTerminal(terminalName: string, command: string, env: any = null, cwd: string = "") {
    if (!env) {
        env = Environment.getForTerminal();
    }

    let terminal = await getOrCreateTerminal(terminalName, env, cwd);
    terminal.sendText(command);
    terminal.show(false);
}

async function getOrCreateTerminal(name: string, env: any, cwd: string) {
    let terminal = findTerminal(name);
    if (!terminal) {
        terminal = window.createTerminal({
            name: patchTerminalName(name),
            env: env,
            cwd: cwd,
        });
    }

    return terminal;
}

function findTerminal(name: string): Terminal {
    let terminal = window.terminals.find((item) => item.name === patchTerminalName(name));
    return terminal;
}

function patchTerminalName(name: string): string {
    return `Klever: ${name}`;
}

async function destroyTerminal(name: string) {
    let terminal = findTerminal(name);
    if (!terminal) {
        return;
    }

    terminal.hide();
    terminal.dispose();
    await sleep(500);
}

async function killRunningInTerminal(name: string) {
    let terminal = findTerminal(name);
    if (!terminal) {
        return;
    }

    terminal.sendText("\u0003");
}

async function isKoperatorInstalled(): Promise<boolean> {
    let [_, ok] = await getOneLineStdout(getKoperatorPath(), ["--version"]);
    return ok;
}

export async function reinstallKoperatorModule(): Promise<void> {
    let latestVersion = await getLatestKnownKoperatorVersion();
    let version = await presenter.askKoperatorVersion(latestVersion);
    if (!version) {
        return;
    }

    await reinstallKoperator(version);
}

async function reinstallKoperator(version: Version) {
    Feedback.info({
        message: `Installation of koperator has been started. Please wait for installation to finish.`,
        display: true,
    });

    // let koperatorUp: string;
    // if (process.platform === "win32") {
    //     koperatorUp = storage.getPathTo("koperator.exe");
    // } else {
    //     koperatorUp = storage.getPathTo("koperator");
    // }

    // koperatorUp = koperatorUp.replace(/ /g, "\\ ");

    const koperatorUp = storage.getPathTo("koperator");
    const koperatorUpUrl = getKoperatorUpUrl(version);

    await window.withProgress(
        {
            location: ProgressLocation.Window,
            cancellable: false,
            title: "Downloading: Koperator",
        },
        async (progress) => {
            progress.report({ increment: 0 });

            await downloadFile(koperatorUp, koperatorUpUrl);

            progress.report({ increment: 100 });
        }
    );

    const koperatorCommand = `"${koperatorUp}" --help`;

    if (process.platform !== "win32") {
        // 0o755 gives the owner read/write/execute permissions, and group and others read/execute permissions
        await fs.promises.chmod(koperatorUp, 0o755);
    }

    await runInTerminal("installer", koperatorCommand);

    // Determine the target path for ksc
    const targetPath = getKoperatorPath();

    // Ensure the target directory exists
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });

    // Copy the file in a cross-platform way
    await fs.promises.copyFile(koperatorUp, targetPath);

    do {
        Feedback.debug({
            message: "Waiting for the installer to finish.",
        });

        await sleep(5000);
    } while (!(await isKoperatorInstalled()));

    await Feedback.info({
        message: `Koperator has been installed.`,
        display: true,
        modal: true,
    });
}

export async function buildContract(folder: string) {
    try {
        await runInTerminal("build", `${getKscPath()} all build --path "${folder}" --release`);
    } catch (error: any) {
        throw new Error("Could not build Smart Contract", { cause: error });
    }
}

export async function manageContract(context: any, type: string, folder: string) {
    try {
        const panel = vscode.window.createWebviewPanel(
            "manageContract", // Identifies the type of the webview. Used internally
            "Manage Smart Contract", // Title of the panel displayed to the user
            vscode.ViewColumn.One, // Editor column to show the new webview panel in.
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "webview-ui", "build")],
            }
        );

        panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);

        const contractName = folder.split("/").pop();

        const wasmName = `${contractName}.wasm`;
        const abiName = `${contractName}.abi.json`;

        const wasmBuffer = fs.readFileSync(`${folder}/output/${wasmName}`);
        const abiBuffer = fs.readFileSync(`${folder}/output/${abiName}`);

        panel.webview.onDidReceiveMessage(
            async (message) => {
                if (message.command === "webviewReady") {
                    panel.webview.postMessage({
                        command: "setEnvironment",
                        data: {
                            type,
                            senderAccount: Settings.getAddress(),
                            abi: {
                                name: abiName,
                                buffer: abiBuffer.toString(),
                            },
                            wasm: {
                                name: wasmName,
                                buffer: wasmBuffer.toString("hex"),
                            },
                        },
                    });
                } else if (message.command === "submitForm") {
                    if (message?.data?.scType === 1) {
                        //Deploy
                        const metadata: string[] = message.metadata.split("@");

                        if (metadata.length < 3) {
                            throw new Error("Invalid metadata");
                        }

                        let customMetadata = "";
                        if (metadata.length > 3) {
                            //discard binary blob, vmType and properties as it will be loaded automatically from the file by the koperator
                            customMetadata = metadata.slice(3).join("@");
                            customMetadata = "@" + customMetadata;
                        }

                        let propertiesFlags = getPropertiesFlags(metadata[2]);

                        let callValue = "";
                        if (message?.data?.callValue) {
                            for (const key in message.data.callValue) {
                                callValue += `--values ${key}=${message.data.callValue[key]} `;
                            }
                        }

                        const result = await Feedback.runCommandAndCaptureOutput(
                            `KLEVER_NODE=${Settings.getNode()}  ${getKoperatorPath()} --key-file=${Settings.getKeyFile()} sc create ${customMetadata} ${propertiesFlags} ${callValue} --wasm="${folder}/output/${contractName}.wasm" --await`,
                            true
                        );

                        panel.webview.postMessage({
                            command: "txResult",
                            data: {
                                result,
                            },
                        });
                    } else if (message?.data?.scType === 0) {
                        //Invoke
                        let callValue = "";
                        if (message?.data?.callValue) {
                            for (const key in message.data.callValue) {
                                callValue += `--values ${key}=${message.data.callValue[key]} `;
                            }
                        }

                        const result = await Feedback.runCommandAndCaptureOutput(
                            `KLEVER_NODE=${Settings.getNode()}  ${getKoperatorPath()} --key-file=${Settings.getKeyFile()} sc invoke ${
                                message?.data?.address
                            } ${message?.metadata} ${callValue} --await`,
                            true
                        );

                        panel.webview.postMessage({
                            command: "txResult",
                            data: {
                                result,
                            },
                        });
                    } else if (message?.data?.scType === 2) {
                        //Upgrade
                        const metadata: string[] = message.metadata.split("@");

                        if (metadata.length < 3) {
                            throw new Error("Invalid metadata");
                        }

                        let customMetadata = "";
                        if (metadata.length > 3) {
                            //discard binary blob, vmType and properties as it will be loaded automatically from the file by the koperator
                            customMetadata = metadata.slice(3).join("@");
                            customMetadata = "@" + customMetadata;
                        }

                        let propertiesFlags = getPropertiesFlags(metadata[2]);

                        let callValue = "";
                        if (message?.data?.callValue) {
                            for (const key in message.data.callValue) {
                                callValue += `--values ${key}=${message.data.callValue[key]} `;
                            }
                        }

                        const result = await Feedback.runCommandAndCaptureOutput(
                            `KLEVER_NODE=${Settings.getNode()}  ${getKoperatorPath()} --key-file=${Settings.getKeyFile()} sc upgrade ${
                                message?.data?.address
                            } ${customMetadata} ${propertiesFlags} ${callValue} --wasm="${folder}/output/${contractName}.wasm" --await`,
                            true
                        );

                        panel.webview.postMessage({
                            command: "txResult",
                            data: {
                                result,
                            },
                        });
                    }
                }
            },
            undefined,
            context.subscriptions
        );
    } catch (error: any) {
        throw new Error("Could not build Smart Contract", { cause: error });
    }
}

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const scriptDirectoryOnDisk = vscode.Uri.joinPath(extensionUri, "webview-ui", "build", "static", "js");
    const styleDirectoryOnDisk = vscode.Uri.joinPath(extensionUri, "webview-ui", "build", "static", "css");

    const scriptFilename = findFileByPattern(scriptDirectoryOnDisk.fsPath, /^main\.[0-9a-f]+\.js$/);
    const cssFilename = findFileByPattern(styleDirectoryOnDisk.fsPath, /^main\.[0-9a-f]+\.css$/);

    const scriptPathOnDisk = vscode.Uri.joinPath(scriptDirectoryOnDisk, scriptFilename);
    const stylePathOnDisk = vscode.Uri.joinPath(styleDirectoryOnDisk, cssFilename);

    const scriptUri = webview.asWebviewUri(scriptPathOnDisk);
    const styleUri = webview.asWebviewUri(stylePathOnDisk);

    // Use a nonce for security
    const nonce = getNonce();

    // <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" />
            <link
                href="https://fonts.googleapis.com/css2?family=Manrope:wght@200;300;400;500;600;700&display=swap"
                rel="stylesheet"
            />
            <link
                href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&family=Rubik:wght@300;400;500;600;700&display=swap"
                rel="stylesheet"
            />
            <link
                href="https://fonts.googleapis.com/css2?family=Rubik:wght@500&display=swap"
                rel="stylesheet"
            />
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Klever Extension</title>
            <link href="${styleUri}" rel="stylesheet" />
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'nonce-${nonce}'; connect-src https://klever.finance https://*.klever.finance;">

        </head>
        <body>
            <div id="root"></div>
            <script nonce="${nonce}" src="${scriptUri}"></script>
        </body>
        </html>`;
}

// Function to find a file by pattern in a directory
function findFileByPattern(directory: string, pattern: RegExp) {
    const files = fs.readdirSync(directory);
    const filteredFiles = files.filter((file) => pattern.test(file));
    return filteredFiles.length > 0 ? filteredFiles[0] : null;
}

function getNonce() {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function getPropertiesFlags(propertiesString: string): string {
    if (propertiesString.length !== 4) {
        return "";
    }

    // Constants for the first byte of the metadata
    const MetadataUpgradeable = 1;
    const MetadataReadable = 4;

    // Constants for the second byte of the metadata
    const MetadataPayable = 2;
    const MetadataPayableBySC = 4;

    //decode properties string to bytes
    const bytes = Buffer.from(propertiesString, "hex");

    const properties = {
        isUpgradable: (bytes[0] & MetadataUpgradeable) !== 0,
        isReadable: (bytes[0] & MetadataReadable) !== 0,
        isPayable: (bytes[1] & MetadataPayable) !== 0,
        isPayableBySC: (bytes[1] & MetadataPayableBySC) !== 0,
    };

    let propertiesFlags = "";

    //concatenate with parsed properties, if upgradble is true, add --upgradeable to properties and so on
    if (properties.isUpgradable) {
        propertiesFlags += " --upgradeable";
    }
    if (properties.isReadable) {
        propertiesFlags += " --readable";
    }
    if (properties.isPayable) {
        propertiesFlags += " --payable";
    }
    if (properties.isPayableBySC) {
        propertiesFlags += " --payableBySC";
    }

    return propertiesFlags;
}

export async function cleanContract(folder: string) {
    try {
        await runInTerminal("build", `${getKscPath()} all clean --path "${folder}"`);
    } catch (error: any) {
        throw new Error("Could not clean Smart Contract", { cause: error });
    }
}

export async function generateNewAccount() {
    try {
        await runInTerminal("Generate New Account", `${getKoperatorPath()} account create`);
    } catch (error: any) {
        throw new Error("Could not generate a new account", { cause: error });
    }
}

export async function getFaucet() {
    const url = `https://api.testnet.klever.finance/v1.0/transaction/send-user-funds/${Settings.getAddress()}`;
    const options = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
    };

    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        await runInTerminal("Get Faucet", `echo "${JSON.stringify(data, null, 2)}"`);
    } catch (error: any) {
        throw new Error("Could not request test KLV", { cause: error });
    }
}

export async function runScenarios(_folder: string) {
    try {
        // await ensureInstalledMxpyGroup("vmtools");
        // await runInTerminal("scenarios", `run-scenarios "${folder}"`);
    } catch (error: any) {
        throw new Error("Could not run scenarios.", { cause: error });
    }
}

export async function runFreshLocalnet(localnetToml: Uri) {
    try {
        let folder = path.dirname(localnetToml.fsPath);

        // await ensureInstalledMxpyGroup("golang");
        await destroyTerminal("localnet");
        // await runInTerminal('localnet', `${getMxpyPath()} localnet setup`, null, folder);
        // await runInTerminal('localnet', `${getMxpyPath()} localnet start`);
    } catch (error: any) {
        throw new Error("Could not start localnet.", { cause: error });
    }
}

export async function resumeExistingLocalnet(localnetToml: Uri) {
    try {
        let folder = path.dirname(localnetToml.fsPath);

        await destroyTerminal("localnet");
        // await runInTerminal('localnet', `${getMxpyPath()} localnet start`, null, folder);
    } catch (error: any) {
        throw Error("Could not start localnet.", { cause: error });
    }
}

export async function stopLocalnet(_localnetToml: Uri) {
    try {
        await killRunningInTerminal("localnet");
    } catch (error: any) {
        throw new Error("Could not start localnet.", { cause: error });
    }
}

export async function installRustDebuggerPrettyPrinterScript() {
    let repository = await showInputBoxWithDefault({
        title: "Github repository",
        prompt: "The github repository containing the rust debugger pretty printer script.",
        defaultInput: "multiversx/mx-sdk-rs",
        ignoreFocusOut: true,
    });
    let branch = await showInputBoxWithDefault({
        title: "Branch",
        prompt: "The branch to use.",
        defaultInput: "master",
        ignoreFocusOut: true,
    });
    let inputPath = await showInputBoxWithDefault({
        title: "File path",
        prompt: "File path to the pretty printer script.",
        defaultInput: "tools/rust-debugger/pretty-printers/multiversx_sc_lldb_pretty_printers.py",
        ignoreFocusOut: true,
    });

    let url = `https://raw.githubusercontent.com/${repository}/${branch}/${inputPath}`;
    let prettyPrinterPath = getPrettyPrinterPath();
    await downloadFile(prettyPrinterPath, url);

    let lldbConfig = workspace.getConfiguration("lldb");
    let commands = [`command script import ${prettyPrinterPath}`];
    await lldbConfig.update("launch.initCommands", commands, ConfigurationTarget.Global);

    await Feedback.info({
        message: "The rust debugger pretty printer script has been installed.",
        display: true,
        modal: true,
    });
}

async function showInputBoxWithDefault(options: InputBoxOptions & { defaultInput: string }) {
    let input = await window.showInputBox({
        ...options,
        prompt: `${options.prompt} Leave empty to accept the default.`,
        placeHolder: `Default: ${options.defaultInput}`,
    });
    if (input) {
        return input;
    }
    return options.defaultInput;
}

async function downloadFile(path: fs.PathLike, url: string) {
    let fileData = await downloadRawData(url);
    fs.writeFileSync(path, fileData);

    Feedback.debug({
        message: `Downloaded file from ${url} to ${path}.`,
    });
}

async function downloadRawData(url: string): Promise<string> {
    try {
        let response = await axios.get(url, { responseType: "arraybuffer" });
        return response.data;
    } catch (error) {
        throw new Error(`Failed to download ${url}\n${error}`);
    }
}
