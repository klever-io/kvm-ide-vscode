# Klever Blockchain IDE for Visual Studio Code

<!-- ![Build Status](https://github.com/klever-io/kvm-ide-vscode/actions/workflows/build.yml/badge.svg) -->

## What is it?

**Klever Blockchain IDE** is an extension for Visual Studio Code that offers development support for Klever Blockchain Smart Contracts written in Rust.

## Main features

 - Build Smart Contracts to WASM
 - Step-by-step debugging Rust smart contracts
 - Automatically download tools and dependencies
 <!-- - Rust debugger support for managed types - see [the installation guide](#installing-the-rust-debugger-pretty-printer-script) -->

## How to get it

Klever Blockchain IDE can be installed from the Visual Studio Code Marketplace.

## Requirements and dependencies

### Operating system

 - **Linux** is supported
 - **MacOS** is supported
 - **Windows** not officially supported

### Other dependencies

The main required dependency is the `RUST` buildchain, which is essential for building and managing your smart contract projects. For the Klever Blockchain IDE, it is required to have the RUST buildchain installed on the **nightly** version. The nightly version includes the latest features and improvements that are necessary for developing Klever Blockchain Smart Contracts.

#### Installing the RUST buildchain

To install the RUST buildchain and set it up on the nightly version, follow these steps based on your operating system:

- **Windows**: 
  1. Download and run the installer from [here](https://www.rust-lang.org/pt-BR/tools/install) to install `rustup`, which is the Rust toolchain installer.
  2. After installation, open a command prompt and execute the following command to switch to the nightly version:
     ```bash
     rustup default nightly-2024-06-12
     ```
     This command sets the Rust version to nightly globally on your system.

- **MacOS and Linux**: 
  1. Open a terminal and execute the command below to install `rustup`:
     ```bash
     curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
     ```
  2. Once `rustup` is installed, switch to the nightly version of Rust by running:
     ```bash
     rustup default nightly-2024-06-12
     ```
     This will ensure you are using the nightly toolchain for all Rust projects unless specified otherwise.

#### Why the nightly version?

Using the nightly version of Rust allows access to the most current Rust features and optimizations. Some features required by Klever Blockchain Smart Contracts are only available in the nightly Rust channel. It is crucial for developers to be on this version to ensure compatibility and leverage the latest advancements in the Rust ecosystem.

If you experience any issues during the installation or while setting Rust to the nightly version, please let us know [on Github](https://github.com/klever-io/kvm-ide-vscode/issues), on [Slack](https://join.slack.com/t/klever-blockchain/shared_invite/zt-1z69ikw0g-dXtRY7eGTnyRllsCV_YGOw), or [on the Forum](https://forum.klever.org/c/kleverchain/developers).


### [ksc](https://github.com/klever-io/klever-vm-sdk-rs)

**ksc** is the backend of the Visual Studio Code extension. **ksc** is **required** by the Klever Blockchain IDE. In order to install it, please follow [these steps](https://docs.klever.org). The extension, via `ksc`, will automatically download its external dependencies, so you do not have to worry much about setting up the development environment. These automatically installed dependencies include:

* `Klever Operator` buildchain
* `VM Tools` (e.g. tests / scenarios framework)

## Extension Commands

This extension contributes the following commands (`Ctrl+Shift+P`):

* `newFromTemplate`
* `buildContract`
* `deployContract`
* `invokeContract`
* `upgradeContract`
* `cleanContract`
* `runScenarios`


## Configuring VSCode Settings for Klever Blockchain IDE

To tailor the Klever Blockchain IDE extension to your development needs, you can configure several settings within your VSCode user settings. These settings allow you to specify paths to essential tools and resources, set the default KleverNode URL, and more. Below are the available settings along with their default values:

### Available Settings

- `kleverchain.sdkPath`: Specifies the path to the Klever SDK. This is where your SDK tools and dependencies are located.
  - **Default**: `~/klever-sdk`

- `kleverchain.kleverNode`: Sets the URL of the KleverNode you wish to connect to. This is crucial for deploying and testing your smart contracts.
  - **Default**: `https://node.devnet.klever.finance`

- `kleverchain.keyFile`: Defines the path to your wallet key file. This file is necessary for signing transactions and deploying contracts.
  - **Default**: `~/klever-sdk/walletKey.pem`

- `kleverchain.address`: Your wallet address. This is used within the IDE to identify you and interact with the Klever Blockchain network.
  - **Default**: `""` (empty string, meaning you need to set this to your wallet address)

### How to Configure

To customize these settings for your development environment, follow these steps:

1. Open VSCode.
2. Go to `File > Preferences > Settings` (or `Code > Preferences > Settings` on Mac).
3. In the search bar at the top, type `kleverchain` to filter out the settings related to the Klever Blockchain IDE.
4. You will see the settings listed above. Click on the edit icon next to each setting you wish to change and enter your desired value.

By configuring these settings, you can ensure that the Klever Blockchain IDE extension works seamlessly with your development setup and preferences. If you need further assistance or have suggestions for additional settings, please reach out to us [on Github](https://github.com/klever-io/kvm-ide-vscode/issues), on [Slack](https://join.slack.com/t/klever-blockchain/shared_invite/zt-1z69ikw0g-dXtRY7eGTnyRllsCV_YGOw), or [on the Forum](https://forum.klever.org/c/kleverchain/developers).


<!-- ## Installing the rust debugger pretty printer script

The rust debugger pretty printer script for LLDB allows proper viewing of managed types (BigUint, ManagedBuffer etc.) when debugging smart contract rust tests.

Prerequisites: First, make sure that the [CodeLLDB](https://github.com/vadimcn/vscode-lldb) extension is installed. This can be done directly from Visual Studio Code extensions menu.

Then, from Visual Studio Code open the command menu via `Ctrl+Shift+P` and run `kleverchain: Install the rust debugger pretty printer script`. If this option isn't present, make sure you have the latest version of the `Klever Blockchain` Visual Studio Code extension.

You will be prompted for the repository, branch and path for the pretty printer script. Simply leave the options blank in order to install the latest version of the script from mx-sdk-rs. -->

## Contributors

### How to publish an update of the extension

1. Within a PR, bump the version in `package.json` and `package-lock.json`.
2. Open and merge the PR against the `main` (`master`) branch.
3. Trigger the Github Workflow called `Release`. This will also publish the extension on the Visual Studio Marketplace.
