import { Version } from "./version";
import axios from "axios";
import { BASE_STORAGE_URL, getPath, LATEST_VERSIONS_URL } from "./sdk";
import { getPlatform } from "./utils";
import * as storage from "./storage";
import * as path from "path";

class ToolDependency {
    public readonly tool: Tool;
    public readonly name: string;

    constructor(tool: Tool, name: string) {
        this.tool = tool;
        this.name = name;
    }

    getDownloadURL(): string {
        return `${BASE_STORAGE_URL}/${this.tool.name}/${this.tool.platform}/${this.tool.version.vValue}/${this.name}`;
    }

    getDownloadPath(): string {
        return storage.getPathTo(`${this.name}`);
    }

    getSDKPath(): string {
        return path.join(getPath(), `${this.name}`);
    }
}


export class Tool {
    public readonly name: string;
    public readonly platform: string;
    public readonly dependencies: string[];
    public version: Version;

    private constructor(name: string, platform: string, version: Version, dependencies: string[]) {
        this.name = name;
        this.version = version;
        this.platform = platform;
        this.dependencies = dependencies;
    }

    // simplified constructor for CLI tools
    static cli(name: string) {
        return new Tool(name, getPlatform(), Version.parse("0.0.0"), []);
    }

    static async new(name: string, fallbackVersion: Version) {
        let platform = getPlatform();
        let dependencies: string[] = [];
        let version: Version;

        try {
            let response = await axios.get(LATEST_VERSIONS_URL);
            if (response.data[platform] && response.data[platform][name]) {
                version = Version.parse(response.data[platform][name].version);
                if (response.data[platform][name].dependencies) {
                    dependencies = response.data[platform][name].dependencies;
                }
            } else {
                version = Version.parse(response.data[name]); // old format
            }
        } catch {
            version = fallbackVersion;
        }

        return new Tool(name, platform, version, dependencies);
    }

    setVersion(version: Version) {
        this.version = version;
    }

    getDownloadURL(): string {
        let url = `${BASE_STORAGE_URL}/${this.name}/${this.platform}/${this.version.vValue}/${this.name}`;
        if (process.platform === "win32") {
            url += ".exe";
        }
        return url;
    }

    getDownloadPath(): string {
        if (this.platform === "win32") {
            return storage.getPathTo(`${this.name}.exe`);
        }
        return storage.getPathTo(`${this.name}`);
    }

    getSDKPath(): string {
        if (process.platform === "win32") {
            return path.join(getPath(), `${this.name}.exe`);
        }
        return path.join(getPath(), `${this.name}`);
    }

    getDependencies(): ToolDependency[] {
        return this.dependencies.map(dep => new ToolDependency(this, dep));
    }

}