# KleverChain IDE for Visual Studio Code

![Build Status](https://github.com/klever-io/kvm-ide-vscode/actions/workflows/build.yml/badge.svg)

## What is it?

**KleverChain IDE** is an extension for Visual Studio Code that offers development support for KleverChain Smart Contracts written in Rust.

## Main features

 - Build Smart Contracts to WASM
 - Step-by-step debugging Rust smart contracts
 - Automatically download tools and dependencies
 <!-- - Rust debugger support for managed types - see [the installation guide](#installing-the-rust-debugger-pretty-printer-script) -->

## How to get it

KleverChain IDE can be installed from the Visual Studio Code Marketplace.

## Requirements and dependencies

### Operating system

 - **Linux** is supported
 - **Windows** is not supported yet
 - **MacOS** is supported

If you experience any issues, please let us know [on Github](https://github.com/klever-io/kvm-ide-vscode/issues), on [Discord](http://discord.gg/klever_io) or [on Telegram](https://t.me/klever_io).

### [ksc](https://github.com/klever-io/klever-vm-sdk-rs)

**ksc** is the backend of the Visual Studio Code extension. **ksc** is **required** by the KleverChain IDE. In order to install it, please follow [these steps](https://docs.klever.org).

### Other dependencies

The extension, via `ksc`, will automatically download its external dependencies, so you do not have to worry much about setting up the development environment. These automatically installed dependencies include:

* `RUST` buildchain
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

<!-- ## Installing the rust debugger pretty printer script

The rust debugger pretty printer script for LLDB allows proper viewing of managed types (BigUint, ManagedBuffer etc.) when debugging smart contract rust tests.

Prerequisites: First, make sure that the [CodeLLDB](https://github.com/vadimcn/vscode-lldb) extension is installed. This can be done directly from Visual Studio Code extensions menu.

Then, from Visual Studio Code open the command menu via `Ctrl+Shift+P` and run `KleverChain: Install the rust debugger pretty printer script`. If this option isn't present, make sure you have the latest version of the `KleverChain` Visual Studio Code extension.

You will be prompted for the repository, branch and path for the pretty printer script. Simply leave the options blank in order to install the latest version of the script from mx-sdk-rs. -->

## Contributors

### How to publish an update of the extension

1. Within a PR, bump the version in `package.json` and `package-lock.json`.
2. Open and merge the PR against the `main` (`master`) branch.
3. Trigger the Github Workflow called `Release`. This will also publish the extension on the Visual Studio Marketplace.
