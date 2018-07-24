// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const childProc = require('child_process');
const fs = require('fs');
const glob = require('glob');

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

var profDir = null;
var profPattern = null;
var targetExe = null;

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
        let jsonPath = profDir + '/coverage/coverage/' + filePath + '.txt.json';
        fs.readFile(jsonPath, (err, data) => {
            if (err) {
                console.log(err);
                return;
            }
            let coverage = JSON.parse(data);
            let getRange = (r) => {
                let begin = r[0];
                let end = r.length == 1 ? r[0]: r[1];
                var r = editor.document.lineAt(begin).range;
                for (var i = begin + 1; i <= end; i++) {
                    r = r.union(editor.document.lineAt(i).range);
                }
                return r;
            };
            Object.keys(coverage).forEach((k) => {
                let range = coverage[k].map(getRange);
                editor.setDecorations(decoMap[k], range);
            });
        });
    });
}

var ctx = null;

function showHide() {
    let conf = vscode.workspace.getConfiguration('clang-coverage');
    if (conf.get('show')) {
        loadAndRenderCoverage();
    } else {
        clearCoverage();
    }
}

function parseProf(prof) {
    childProc.exec(ctx.extensionPath + '/parse.py ' + profDir + ' ' + targetExe + ' ' + prof, (err) => {
        if (err) {
            vscode.window.showErrorMessage(err);
            console.log(err);
            return;
        }
        showHide();
    });
}

function getLatestProf(err, files) {
    if (err != null) {
        vscode.window.showErrorMessage(err);
        return;
    }
    if (files.length == 0) {
        return;
    }
    var latest = files.map((v) => ({name: v, stat: fs.statSync(v)})).sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)[0];
    fs.readFile(profDir + '/coverage.last', (err, data) => {
        if (err || new Date(latest.stat.mtime).getTime() != data) {
            parseProf(latest.name);
        } else {
            return;
        }
    });
}

function processProf() {
    glob(profDir + '/' + profPattern, {}, getLatestProf);
}

function loadConfig() {
    let conf = vscode.workspace.getConfiguration('clang-coverage');
    profDir = conf.get('profDir');
    if (profDir == null) {
        profDir = vscode.workspace.rootPath;
    }
    profPattern = conf.get('profPattern');
    if (profPattern == null) {
        profPattern = '**/*.profraw'
    }
    targetExe = conf.get('targetExe');
    if (targetExe == null) {
        let configs = vscode.workspace.getConfiguration('launch', null)['configurations'];
        let launchConfig = configs.filter(cfg => cfg['request'] == 'launch')[0]
        targetExe = launchConfig['program'];
    }
}

function configUpdate(e) {
    if (e.affectsConfiguration('clang-coverage.show')) {
        showHide();
    }
    if (e.affectsConfiguration('clang-coverage.profDir') ||
        e.affectsConfiguration('clang-coverage.profPattern') ||
        e.affectsConfiguration('clang-coverage.targetExe')) {
        loadConfig();
        processProf();
        showHide();
    }
}

function activate(context) {
    ctx = context;

    vscode.workspace.onDidChangeConfiguration(configUpdate)
    loadConfig();

    let watcher = vscode.workspace.createFileSystemWatcher(profPattern);
    watcher.onDidChange(processProf);
    watcher.onDidCreate(processProf);
    context.subscriptions.push(watcher);
    processProf();

    vscode.window.onDidChangeActiveTextEditor(showHide)
    context.subscriptions.push(vscode.commands.registerCommand('extension.clangCoverageRefresh', () => {
        processProf();
    }));
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