// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const childProc = require('child_process');
const fs = require('fs');

const coveredDeco = vscode.window.createTextEditorDecorationType({
    dark: {
        backgroundColor: "DarkGreen"
    },
    light: {
        backgroundColor: "LightGreen"
    },
    isWholeLine: true
});

const uncoveredDeco = vscode.window.createTextEditorDecorationType({
    dark: {
        backgroundColor: "DarkRed"
    },
    light: {
        backgroundColor: "LightRed"
    },
    isWholeLine: true
});

const naDeco = vscode.window.createTextEditorDecorationType({
    dark: {
        backgroundColor: ""
    },
    light: {
        backgroundColor: ""
    },
    isWholeLine: true
});

const decoMap = {
    "-1": naDeco,
    "0": uncoveredDeco,
    "1": coveredDeco
};
const rootPath = vscode.workspace.rootPath;

function loadAndRenderCoverage() {
    vscode.window.visibleTextEditors.forEach(function (editor) {
        let jsonPath = rootPath + "/coverage/coverage/" + editor.document.fileName + ".txt.json";
        fs.readFile(jsonPath, function (err, data) {
            let coverage = JSON.parse(data);
            let getRange = function (i) {
                return editor.document.lineAt(i).range;
            };
            Object.keys(decoMap).forEach(function(k) {
                editor.setDecorations(decoMap[k], []);
            })
            Object.keys(coverage).forEach(function (k) {
                let range = coverage[k].map(getRange);
                editor.setDecorations(decoMap[k], range);
            });
        });
    });
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
    let disposable = vscode.commands.registerCommand('coverage', function () {
        childProc.exec(context.extensionPath + "/parse.py " + rootPath, (error) => {
            if (error) {
                console.log(error);
                return;
            }
            loadAndRenderCoverage();
        });
    });
    context.subscriptions.push(disposable);
}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
}
exports.deactivate = deactivate;