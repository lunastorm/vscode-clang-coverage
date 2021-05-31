const vscode = require("vscode");
const fs = require("fs");
const util = require("util");
const glob = util.promisify(require("glob").glob);
const exec = util.promisify(require("child_process").exec);

const covered_deco = vscode.window.createTextEditorDecorationType({
    dark: {
        backgroundColor: 'DarkGreen'
    },
    light: {
        backgroundColor: 'LightGreen'
    },
    isWholeLine: false
});

const uncovered_deco = vscode.window.createTextEditorDecorationType({
    dark: {
        backgroundColor: 'DarkRed'
    },
    light: {
        backgroundColor: 'LightPink'
    },
    isWholeLine: false
});

const true_condition_deco = vscode.window.createTextEditorDecorationType({
    before: {
        contentText: ' t ',
        color: 'red',
        backgroundColor: 'yellow',
        fontWeight: 'bold'
    },
    dark: {
        backgroundColor: 'Sienna'
    },
    light: {
        backgroundColor: 'Orange'
    },
    isWholeLine: false
});

const false_condition_deco = vscode.window.createTextEditorDecorationType({
    before: {
        contentText: ' f ',
        color: 'red',
        backgroundColor: 'yellow',
        fontWeight: 'bold'
    },
    dark: {
        backgroundColor: 'Sienna'
    },
    light: {
        backgroundColor: 'Orange'
    },
    isWholeLine: false
});

let output_dir;
let profraw_dir;
let profraw_pattern;
let path_mappings;
let binary_path;
let parse_command;
let export_command;
let is_processing = false;
let coverage_maps = {};
let partial_condition_maps = {};
let summary_maps = {};
let status_bar_item;

function load_config() {
    const conf = vscode.workspace.getConfiguration("clang-coverage");
    output_dir = conf.get("outputDir");
    if (output_dir === null) {
        output_dir = vscode.workspace.workspaceFolders[0].uri.path;
    }
    profraw_dir = conf.get("profrawDir");
    if (profraw_dir === null) {
        profraw_dir = vscode.workspace.workspaceFolders[0].uri.path;
    }
    profraw_pattern = conf.get("profrawPattern");
    if (profraw_pattern === null) {
        profraw_pattern = "*.profraw";
    }
    path_mappings = conf.get("pathMappings");
    binary_path = conf.get("binaryPath");
    if (binary_path === null) {
        const configs = vscode.workspace.getConfiguration("launch",
            vscode.workspace.workspaceFolders[0].uri)["configurations"];
        const launch_config = configs.filter(
            config => config["request"] == "launch")[0]
        binary_path = `${vscode.workspace.workspaceFolders[0].uri.path}/${launch_config["program"]}`;
    }
    parse_command = conf.get("parseCommand");
    export_command = conf.get("exportCommand");
}

async function show_coverage(editor) {
    const file_path = editor.document.fileName;
    if (!/\.(cpp|c|h|hpp|cc|hh|cxx)$/.test(file_path)) {
        return;
    }
    if (file_path in coverage_maps) {
        editor.setDecorations(covered_deco, coverage_maps[file_path][true]);
        editor.setDecorations(uncovered_deco, coverage_maps[file_path][false]);
        if (file_path in partial_condition_maps) {
            editor.setDecorations(true_condition_deco, partial_condition_maps[file_path][true]);
            editor.setDecorations(false_condition_deco, partial_condition_maps[file_path][false]);
        }
        if (editor === vscode.window.activeTextEditor) {
            const summary = summary_maps[file_path];
            status_bar_item.text = `Function ${Math.floor(summary.functions.percent)}% (${summary.functions.covered}/${summary.functions.count}), Region ${Math.floor(summary.regions.percent)}% (${summary.regions.covered}/${summary.regions.count})`;
            if (summary.branches) {
                status_bar_item.text += `, Branch ${Math.floor(summary.branches.percent)}% (${summary.branches.covered}/${summary.branches.count})`;
            }
            status_bar_item.show();
        }
        return;
    }
    let result;
    try {
        if (export_command) {
            result = JSON.parse((await exec(`${export_command} ${file_path.replace(/\\/g, "/")}`, {maxBuffer: 40 * 1024 * 1024})).stdout);
        } else {
            result = JSON.parse((await exec(`llvm-cov export --skip-functions --skip-expansions --instr-profile=${output_dir}/default.profdata ${binary_path} ${file_path.replace(/\\/g, "/")}`, {maxBuffer: 40 * 1024 * 1024})).stdout);
        }
    } catch (e) {
        // vscode.window.showErrorMessage(`Export error: ${e}`);
    }
    const file = result.data[0].files[0];

    if (file.filename !== file_path.replace(/\\/g, "/")) {
        let found = false;
        for (const [remote, local] of Object.entries(path_mappings)) {
            if (file.filename === file_path.replace(local, remote).replace(/\\/g, "/")) {
                found = true;
                break;
            }
        }
        if (!found) {
            return;
        }
    }
    const segments = file.segments;
    const covered_ranges = segments.reduce((acc, s) => {
        if (acc.prev[3]) {
            acc.result[acc.prev[2] > 0].push(new vscode.Range(
                new vscode.Position(acc.prev[0] - 1, acc.prev[1] - 1),
                new vscode.Position(s[0] - 1, s[1] - 1)));
        }
        acc.prev = s;
        return acc;
    }, {result: {true: [], false: []}, prev: [1, 1, 0, false, false]}).result;

    editor.setDecorations(covered_deco, covered_ranges[true]);
    editor.setDecorations(uncovered_deco, covered_ranges[false]);
    coverage_maps[file_path] = covered_ranges;

    const summary = file.summary;
    if (editor === vscode.window.activeTextEditor) {
        status_bar_item.text = `Function ${Math.floor(summary.functions.percent)}% (${summary.functions.covered}/${summary.functions.count}), Region ${Math.floor(summary.regions.percent)}% (${summary.regions.covered}/${summary.regions.count})`;
        if (summary.branches) {
            status_bar_item.text += `, Branch ${Math.floor(summary.branches.percent)}% (${summary.branches.covered}/${summary.branches.count})`;
        }
        status_bar_item.show();
    }
    summary_maps[file_path] = summary;
    const branches = file.branches;
    if (!branches) {
        return;
    }
    const partial_condition_ranges = branches.reduce((acc, s) => {
        if ((s[4] > 0 && s[5] > 0) || (s[4] == 0 && s[5] == 0)) {
            return acc;
        }
        acc[s[4] > 0].push(new vscode.Range(
            new vscode.Position(s[0] - 1, s[1] - 1),
            new vscode.Position(s[2] - 1, s[3] - 1)
        ));
        return acc;
    }, {true: [], false: []});

    editor.setDecorations(true_condition_deco, partial_condition_ranges[true]);
    editor.setDecorations(false_condition_deco, partial_condition_ranges[false]);
    partial_condition_maps[file_path] = partial_condition_ranges;
}

function refresh_coverage_display() {
    status_bar_item.hide();
    vscode.window.visibleTextEditors.forEach((editor) => {
        editor.setDecorations(covered_deco, []);
        editor.setDecorations(uncovered_deco, []);
        editor.setDecorations(true_condition_deco, []);
        editor.setDecorations(false_condition_deco, []);
    });
    if (vscode.workspace.getConfiguration("clang-coverage").get("show")) {
        vscode.window.visibleTextEditors.forEach(show_coverage);
    }
}

async function get_latest_profile() {
    let profraws = await glob(`${profraw_dir}/${profraw_pattern}`);
    if (profraws.length == 0) {
        return null;
    }
    const stats = await Promise.all(profraws.map(path => fs.promises.stat(path)));
    profraws = profraws.map((path, i) => ({path: path, time: stats[i].mtimeMs}));
    profraws.sort((a, b) => b.time - a.time);
    return profraws[0].path;
}

async function parse_profile(e) {
    if (is_processing) {
        setTimeout(parse_profile, 1000);
        return;
    }
    is_processing = true;
    let profraw_path;
    if (e) {
        profraw_path = e.path;
    } else {
        profraw_path = await get_latest_profile();
        if (profraw_path === null) {
            is_processing = false;
            return;
        }
    }
    if (parse_command) {
        await exec(`${parse_command} ${profraw_path}`);
    } else {
        await exec(`llvm-profdata merge --sparse -o ${output_dir}/default.profdata ${profraw_path}`);
    }
    is_processing = false;
    coverage_maps = {};
    partial_condition_maps = {};
    summary_maps = {};
    refresh_coverage_display();
}

async function config_update_handler(e) {
    if (e.affectsConfiguration("clang-coverage.outputDir") ||
        e.affectsConfiguration("clang-coverage.profrawDir") ||
        e.affectsConfiguration("clang-coverage.profrawPattern") ||
        e.affectsConfiguration("clang-coverage.pathMappings") ||
        e.affectsConfiguration("clang-coverage.binaryPath")) {
        load_config();
        await parse_profile();
    }
    refresh_coverage_display();
}

function activate(context) {
    vscode.workspace.onDidChangeConfiguration(config_update_handler);
    load_config();

    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(profraw_dir, profraw_pattern));
    watcher.onDidChange(parse_profile);
    watcher.onDidCreate(parse_profile);
    context.subscriptions.push(watcher);

    vscode.window.onDidChangeActiveTextEditor(refresh_coverage_display);
    context.subscriptions.push(vscode.commands.registerCommand(
        "extension.clangCoverageRefresh", () => {
            vscode.workspace.getConfiguration("clang-coverage").update("show", true);
            parse_profile();
    }));
    context.subscriptions.push(vscode.commands.registerCommand(
        "extension.clangCoverageShow", () => {
            vscode.workspace.getConfiguration("clang-coverage").update("show", true);
    }));
    context.subscriptions.push(vscode.commands.registerCommand(
        "extension.clangCoverageHide", () => {
            vscode.workspace.getConfiguration("clang-coverage").update("show", false);
    }));
    status_bar_item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 9999);

    parse_profile();
}
exports.activate = activate;

exports.deactivate = () => {};