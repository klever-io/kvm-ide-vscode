import axios from "axios";
import { ConfigurationTarget, InputBoxOptions, Terminal, Uri, window, workspace } from "vscode";
import { Environment } from "./environment";
import { Feedback } from "./feedback";
import * as presenter from "./presenter";
import { Settings } from "./settings";
import * as storage from "./storage";
import { ProcessFacade, sleep } from "./utils";
import { FreeTextVersion, Version } from "./version";
import path = require("path");
import fs = require("fs");

const DEFAULT_KSC_VERSION = Version.parse("0.43.3");
const DEFAULT_KOPERATOR_VERSION = Version.parse("1.6.3");
const LATEST_VERSIONS_URL = "https://storage.googleapis.com/kleverchain-public/versions.json";

export function getPath() {
    return Settings.getSdkPath();
}

function getKscPath() {
    return path.join(getPath(), "ksc");
}

function getKoperatorPath() {
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
    const kscUp = storage.getPathTo("ksc");
    const kscUpUrl = getKscUpUrl(version);
    await downloadFile(kscUp, kscUpUrl);

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

    Feedback.info({
        message: "ksc installation has been started. Please wait for installation to finish.",
        display: true,
    });

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
    return `https://storage.googleapis.com/kleverchain-public/ksc/${version.vValue}/ksc`;
}

function getKoperatorUpUrl(version: Version) {
    return `https://storage.googleapis.com/kleverchain-public/koperator/${version.vValue}/koperator`;
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
    let terminal = window.terminals.find((item) => item.name == patchTerminalName(name));
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

    const koperatorUp = storage.getPathTo("koperator");
    const koperatorUpUrl = getKoperatorUpUrl(version);
    await downloadFile(koperatorUp, koperatorUpUrl);

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

export async function deployContract(folder: string) {
    try {
        const contractName = folder.split("/").pop();

        await runInTerminal(
            "deploy",
            `KLEVER_NODE=${Settings.getNode()}  ${getKoperatorPath()} --key-file=${Settings.getKeyFile()} sc create ${Settings.getAddress()} --wasm="${folder}/output/${contractName}.wasm" --payable --payableBySC --readable`
        );
    } catch (error: any) {
        throw new Error("Could not build Smart Contract", { cause: error });
    }
}

export async function cleanContract(folder: string) {
    try {
        await runInTerminal("build", `${getKscPath()} all clean --path "${folder}"`);
    } catch (error: any) {
        throw new Error("Could not clean Smart Contract", { cause: error });
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
