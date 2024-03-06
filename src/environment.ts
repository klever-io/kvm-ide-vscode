import path = require("path");
import { Settings } from "./settings";

export class Environment {
    static getForTerminal(): any {
        let sdkPath = path.join("${env:HOME}", Settings.getSdkPathRelativeToHome());
        let koperatorFolder = path.join(sdkPath, "koperator");
        return {
            PATH: `${sdkPath}:${koperatorFolder}:${process.env["PATH"]}`,
        };
    }

    static getNode(): string {
        return process.env["KLEVER_NODE"] || "https://node.devnet.klever.finance";
    }
}
