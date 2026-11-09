import * as vscode from "vscode"
import { execFile } from "node:child_process"
import { homedir } from "node:os"
import { delimiter, dirname, join } from "node:path"
import { promisify } from "node:util"
import { hintsAt, type Hint } from "./hints"

const itemKinds: Record<Hint["kind"], vscode.CompletionItemKind> = {
    module: vscode.CompletionItemKind.Module,
    folder: vscode.CompletionItemKind.Folder,
    name: vscode.CompletionItemKind.Variable,
    wildcard: vscode.CompletionItemKind.Keyword,
}

const plainName = /^[A-Za-z.][A-Za-z0-9._]*$/
const run = promisify(execFile)
let libsCache: Promise<string[]> | null = null

function envLibs(): string[] {
    return [process.env.R_LIBS_USER, process.env.R_LIBS]
        .filter((value) => value !== undefined)
        .join(delimiter)
        .split(delimiter)
        .filter((dir) => dir !== "")
}

function loadLibs(): Promise<string[]> {
    if (libsCache === null) {
        const config = vscode.workspace.getConfiguration("boxpletion")
        const rscript = config.get<string>("rscriptPath", "Rscript")
        libsCache = run(rscript, ["-e", "cat(.libPaths(), sep = '\\n')"], { timeout: 20000 })
            .then(({ stdout }) =>
                stdout
                    .split(/\r?\n/)
                    .map((line) => line.trim())
                    .filter((line) => line !== "")
            )
            .catch(() => {
                libsCache = null
                return envLibs()
            })
    }
    return libsCache
}

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration("boxpletion.rscriptPath")) {
                libsCache = null
            }
        })
    )
    const provider = vscode.languages.registerCompletionItemProvider(
        { language: "r" },
        {
            async provideCompletionItems(document, position) {
                const before = document.getText(
                    new vscode.Range(new vscode.Position(0, 0), position)
                )
                const currentDir =
                    document.uri.scheme === "file"
                        ? dirname(document.uri.fsPath)
                        : (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? homedir())
                const roots = {
                    currentDir,
                    balerDir: join(homedir(), ".baler", "modules"),
                    libs: await loadLibs(),
                }
                return hintsAt(before, roots).map((hint) => {
                    const item = new vscode.CompletionItem(hint.label, itemKinds[hint.kind])
                    item.sortText = hint.kind === "wildcard" ? "zzz" : hint.label
                    if (hint.kind === "name" && !plainName.test(hint.label)) {
                        item.insertText = "`" + hint.label + "`"
                        item.filterText = hint.label
                    }
                    if (hint.kind === "folder") {
                        item.insertText = hint.label + "/"
                        item.command = {
                            command: "editor.action.triggerSuggest",
                            title: "Suggest",
                        }
                    }
                    return item
                })
            },
        },
        "[",
        ",",
        "/",
        "("
    )
    context.subscriptions.push(provider)
}

export function deactivate() {}
