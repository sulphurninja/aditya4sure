// Starts Electron with a clean environment. VS Code's terminal sets ELECTRON_RUN_AS_NODE=1
// (VS Code is itself Electron), which would make Electron run as plain Node and crash.
const { spawn } = require("node:child_process");
const electron = require("electron"); // from Node this is the path to the Electron binary
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
spawn(electron, [__dirname, ...process.argv.slice(2)], { stdio: "inherit", env }).on("exit", (code) => process.exit(code ?? 0));
