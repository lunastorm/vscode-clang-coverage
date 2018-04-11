// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const childProc = require('child_process');
const fs = require('fs');

const coveredDeco = vscode.window.createTextEditorDecorationType({
    dark: {
        backgroundColor: 'DarkGreen'
    },
    light: {
        backgroundColor: 'LightGreen'
    },
    isWholeLine: true
});

const uncoveredDeco = vscode.window.createTextEditorDecorationType({
    dark: {
        backgroundColor: 'DarkRed'
    },
    light: {
        backgroundColor: 'LightPink'
    },
    isWholeLine: true
});

const naDeco = vscode.window.createTextEditorDecorationType({
    dark: {
        backgroundColor: ''
    },
    light: {
        backgroundColor: ''
    },
    isWholeLine: true
});

const decoMap = {
    '-1': naDeco,
    '0': uncoveredDeco,
    '1': coveredDeco
};

const rootPath = vscode.workspace.rootPath;

function clearCoverage() {
    vscode.window.visibleTextEditors.forEach((editor) => {
        Object.keys(decoMap).forEach((k) => {
            editor.setDecorations(decoMap[k], []);
        });
    });
}

function loadAndRenderCoverage() {
    clearCoverage();
    vscode.window.visibleTextEditors.forEach((editor) => {
        var filePath = editor.document.fileName;
        if (!/\.(cpp|c|h|hpp|cc|hh|cxx)$/.test(filePath)) {
            return;
        }
        let tmp = filePath.split(':');
        if (tmp.length == 2) {
            filePath = tmp[1];
        }
        let jsonPath = rootPath + '/coverage/coverage/' + filePath + '.txt.json';
        fs.readFile(jsonPath, (err, data) => {
            if (err) {
                console.log(err);
                return;
            }
            let coverage = JSON.parse(data);
            let getRange = (i) => {
                return editor.document.lineAt(i).range;
            };
            Object.keys(coverage).forEach((k) => {
                let range = coverage[k].map(getRange);
                editor.setDecorations(decoMap[k], range);
            });
        });
    });
}

function parseProf() {
    let configs = vscode.workspace.getConfiguration('launch', null)['configurations'];
    let launchConfig = configs.filter(cfg => cfg['request'] == 'launch')[0]
    let extensionPath = vscode.extensions.getExtension('lunastorm.vscode-clang-coverage').extensionPath;

    childProc.exec(extensionPath + '/parse.py ' + rootPath + ' ' + launchConfig['program'], (err) => {
        if (err) {
            console.log(err);
            return;
        }
        loadAndRenderCoverage();
    });
}

var watcher = null;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand('extension.clangCoverageShow', () => {
        watcher = vscode.workspace.createFileSystemWatcher('**/default.profraw');
        watcher.onDidChange(parseProf);
        watcher.onDidCreate(parseProf);
        parseProf();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('extension.clangCoverageHide', () => {
        if (watcher != null) {
            clearCoverage();
            watcher.dispose();
            watcher = null;
        }
    }));
}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
}
exports.deactivate = deactivate;