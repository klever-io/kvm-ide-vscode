import * as vscode from "vscode";
import axios from "axios";
import { ConfigurationTarget, InputBoxOptions, Terminal, Uri, window, workspace, ProgressLocation } from "vscode";
import { Environment } from "./environment";
import { Feedback } from "./feedback";
import * as presenter from "./presenter";
import { Settings } from "./settings";
import * as storage from "./storage";
import { getPlatform, ProcessFacade, sleep } from "./utils";
import { FreeTextVersion, Version } from "./version";
import fetch from "node-fetch";
import path = require("path");
import fs = require("fs");
import { Tool } from "./tool";

const DEFAULT_KSC_VERSION = Version.parse("0.43.3");
const DEFAULT_KOPERATOR_VERSION = Version.parse("1.6.3");
export const LATEST_VERSIONS_URL = "https://storage.googleapis.com/kleverchain-public/versions.json";
export const BASE_STORAGE_URL = "https://storage.googleapis.com/kleverchain-public";

export function getPath() {
    return Settings.getSdkPath();
}

function getKoperatorPath() {
    if (process.platform === "win32") {
        return path.join(getPath(), "koperator.exe");
    }

    return path.join(getPath(), "koperator");
}

function getCmdEnvs() {
    let cmdEnv = `KLEVER_NODE=${Settings.getNode()}`;
    if (process.platform === "win32") {
        cmdEnv = `cmd /C set ${cmdEnv} &&`;
    }

    return cmdEnv;
}

function getPrettyPrinterPath() {
    return path.join(getPath(), "multiversx_sc_lldb_pretty_printers.py");
}

export async function reinstall() {
    let ksc = await getKSC();
    let version = await presenter.askKscVersion(ksc.version);
    if (!version) {
        return;
    }
    ksc.setVersion(version);
    await reinstallTool(ksc);
}

async function getOperator(): Promise<Tool> {
    return await Tool.new("koperator", DEFAULT_KOPERATOR_VERSION);
}

async function getKSC(): Promise<Tool> {
    return await Tool.new("ksc", DEFAULT_KSC_VERSION);
}

export async function ensureInstalled() {
    await ensureKsc();
}

export async function ensureKoperatorInstalled() {
    await ensureKoperator();
}

async function ensureKsc() {
    let ksc = await getKSC();
    if (await isInstalled(ksc)) {
        return;
    }

    let answer = await presenter.askInstallKsc(ksc.version);
    if (answer) {
        await reinstallTool(ksc);
    }
}

async function ensureKoperator() {
    let operator = await getOperator();
    if (await isInstalled(operator)) {
        return;
    }

    let answer = await presenter.askInstallKoperator(operator.version);
    if (answer) {
        await reinstallTool(operator);
    }
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

export async function reinstallTool(tool: Tool) {
    Feedback.info({
        message: `Installation of ${tool.name} has been started. Please wait for installation to finish.`,
        display: true,
    });

    let downloadPath = tool.getDownloadPath();
    let downloadUrl = tool.getDownloadURL();
    let dependencies = tool.getDependencies();
    await window.withProgress(
        {
            location: ProgressLocation.Window,
            cancellable: false,
            title: `Downloading: ${tool.name}`,
        },
        async (progress) => {
            progress.report({ increment: 0 });

            await downloadFile(downloadPath, downloadUrl);
            for(let dependency of dependencies) {
                await downloadFile(dependency.getDownloadPath(), dependency.getDownloadURL());
            }

            progress.report({ increment: 100 });
        }
    );

    let toolCommand = `"${downloadPath}" --help`;
    if (process.platform === "win32") {
        toolCommand = `& "${downloadPath}" --help`;
    } else {
        // 0o755 gives the owner read/write/execute permissions, and group and others read/execute permissions
        await fs.promises.chmod(downloadPath, 0o755);
        for(let dependency of dependencies) {
            await fs.promises.chmod(dependency.getDownloadPath(), 0o755);
        }
    }

    await runInTerminal("installer", toolCommand);

    // Determine the target path for ksc
    const targetPath = tool.getSDKPath();
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.promises.copyFile(downloadPath, targetPath);
    for(let dependency of dependencies) {
        await fs.promises.copyFile(dependency.getDownloadPath(), dependency.getSDKPath());
    }

    do {
        Feedback.debug({
            message: "Waiting for the installer to finish.",
        });
        await sleep(5000);
    } while (!(await isInstalled(tool)));

    await Feedback.info({
        message:
            `${tool.name} has been installed. Please close all Visual Studio Code terminals and then reopen them (as needed).`,
        display: true,
        modal: true,
    });
}

export async function newFromTemplate(folder: string, template: string, name: string) {
    try {
        await ProcessFacade.execute({
            program: Tool.cli("ksc").getSDKPath(),
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

async function isInstalled(tool: Tool): Promise<boolean> {
    let [_, ok] = await getOneLineStdout(tool.getSDKPath(), ["--version"]);
    return ok;
}

export async function reinstallKoperatorModule(): Promise<void> {
    let operator = await getOperator();
    let version = await presenter.askKoperatorVersion(operator.version);
    if (!version) {
        return;
    }
    operator.setVersion(version);
    await reinstallTool(operator);
}

export async function buildContract(folder: string) {
    try {
        await runInTerminal("build", `${Tool.cli("ksc").getSDKPath()} all build --path "${folder}"`);
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

        let historyPath = `${folder}/output/history.json`;
        let history: any[] = [];
        if (fs.existsSync(historyPath)) {
            history = JSON.parse(fs.readFileSync(historyPath).toString());
        }

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
                            history,
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
                            `${getCmdEnvs()} ${getKoperatorPath()} --key-file=${Settings.getKeyFile()} sc create ${customMetadata} ${propertiesFlags} ${callValue} --wasm="${folder}/output/${contractName}.wasm" --await`,
                            true
                        );

                        const parsedResult = JSON.parse(result);

                        if (parsedResult?.status === "success") {
                            history.push({
                                hash: parsedResult.hash,
                                contractAddress: parsedResult?.receipts?.[1]?.contract || "",
                            });

                            fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
                        }

                        panel.webview.postMessage({
                            command: "txResult",
                            data: {
                                result,
                                history,
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
                            `${getCmdEnvs()} ${getKoperatorPath()} --key-file=${Settings.getKeyFile()} sc invoke ${
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
                            `${getCmdEnvs()} ${getKoperatorPath()} --key-file=${Settings.getKeyFile()} sc upgrade ${
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
        await runInTerminal("build", `${Tool.cli("ksc").getSDKPath()} all clean --path "${folder}"`);
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

export async function runScenarios(folder: string) {
    try {
        await runInTerminal(
            "runScenarios",
            `${getCmdEnvs()} ${getKoperatorPath()} sc run-scenarios --path "${folder}" --key-file=${Settings.getKeyFile()}`
        );
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
