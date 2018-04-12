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

function clearCoverage() {
    vscode.window.visibleTextEditors.forEach((editor) => {
        Object.keys(decoMap).forEach((k) => {
            editor.setDecorations(decoMap[k], []);
        });
    });
}

function loadAndRenderCoverage(profDir) {
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
        let jsonPath = profDir + '/coverage/coverage/' + filePath + '.txt.json';
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

var ctx = null;

function parseProf() {
    let conf = vscode.workspace.getConfiguration('clang-coverage');
    let profDir = conf.get('profDir');
    if (profDir == null) {
        profDir = vscode.workspace.rootPath;
    }
    let targetExe = conf.get('targetExe');
    if (targetExe == null) {
        let configs = vscode.workspace.getConfiguration('launch', null)['configurations'];
        let launchConfig = configs.filter(cfg => cfg['request'] == 'launch')[0]
        targetExe = launchConfig['program'];
    }
    childProc.exec(ctx.extensionPath + '/parse.py ' + profDir + ' ' + targetExe, (err) => {
        if (err) {
            console.log(err);
            return;
        }
        loadAndRenderCoverage(profDir);
    });
}

var watcher = null;

function showHide() {
    let conf = vscode.workspace.getConfiguration('clang-coverage');
    if (conf.get('show')) {
        if (watcher == null) {
            watcher = vscode.workspace.createFileSystemWatcher('**/default.profraw');
            watcher.onDidChange(parseProf);
            watcher.onDidCreate(parseProf);
            parseProf();
        }
    } else {
        if (watcher != null) {
            clearCoverage();
            watcher.dispose();
            watcher = null;
        }
    }
}

function activate(context) {
    ctx = context;
    vscode.workspace.onDidChangeConfiguration(showHide)
    vscode.window.onDidChangeActiveTextEditor(showHide)

    context.subscriptions.push(vscode.commands.registerCommand('extension.clangCoverageShow', () => {
        vscode.workspace.getConfiguration('clang-coverage').update('show', true)
    }));
    context.subscriptions.push(vscode.commands.registerCommand('extension.clangCoverageHide', () => {
        vscode.workspace.getConfiguration('clang-coverage').update('show', false)
    }));
    showHide();
}
exports.activate = activate;

function deactivate() {
}
exports.deactivate = deactivate;