const vscode = require("vscode");
const fs = require("fs");
const util = require("util");
const { Script } = require("vm");
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

let coverage_map = {};
let output_dir;
let profraw_dir;
let profraw_pattern;
let path_mappings;
let binary_path;
let parse_command;

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
}

function show_coverage(editor) {
    const file_path = editor.document.fileName;
    if (!/\.(cpp|c|h|hpp|cc|hh|cxx)$/.test(file_path)) {
        return;
    }
    let segments = coverage_map[file_path];
    if (segments === undefined) {
        for (const [server, current] of Object.entries(path_mappings)) {
            segments = coverage_map[file_path.replace(current, server)];
            if (segments) {
                break;
            }
        }
    }
    if (!segments) {
        return;
    }
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
}

function refresh_coverage_display() {
    vscode.window.visibleTextEditors.forEach((editor) => {
        editor.setDecorations(covered_deco, []);
        editor.setDecorations(uncovered_deco, []);
    });
    if (vscode.workspace.getConfiguration("clang-coverage").get("show")) {
        vscode.window.visibleTextEditors.forEach(show_coverage);
    }
}

async function load_coverage() {
    try {
        const coverage = JSON.parse(await fs.promises.readFile(`${output_dir}/coverage.json`));
        coverage_map = coverage.data[0].files.reduce(
            (acc, f) => Object.assign({[f.filename]: f.segments}, acc), {});
    } catch (e) {
        console.log(e);
    }
    refresh_coverage_display();
}

async function parse_profile(e) {
    let profraw_path;
    if (e) {
        profraw_path = e.path;
    } else {
        profraw_path = await glob(`${profraw_dir}/${profraw_pattern}`);
    }
    if (parse_command) {
        await exec(parse_command);
    } else {
        await exec(`llvm-profdata merge --sparse -o ${output_dir}/default.profdata ${profraw_path}`);
        await exec(`llvm-cov show -format=html -output-dir=${output_dir} ${binary_path} -instr-profile=${output_dir}/default.profdata`);
        await exec(`llvm-cov export ${binary_path} -instr-profile=${output_dir}/default.profdata > ${output_dir}/coverage.json`);
    }
    load_coverage();
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

    const watcher = vscode.workspace.createFileSystemWatcher(`${profraw_dir}/${profraw_pattern}`);
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
    load_coverage();
}
exports.activate = activate;

exports.deactivate = () => {};