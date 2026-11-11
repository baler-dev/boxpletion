import * as vscode from "vscode"
import { execFile } from "node:child_process"
import { homedir } from "node:os"
import { delimiter, dirname, join } from "node:path"
import { promisify } from "node:util"
import { loadPackageData } from "./data"
import { hintsAt, packagesNeeded, type Hint } from "./hints"

const itemKinds: Record<Hint["kind"], vscode.CompletionItemKind> = {
    module: vscode.CompletionItemKind.Module,
    folder: vscode.CompletionItemKind.Folder,
    name: vscode.CompletionItemKind.Variable,
    function: vscode.CompletionItemKind.Function,
    data: vscode.CompletionItemKind.Constant,
    namespace: vscode.CompletionItemKind.Module,
    wildcard: vscode.CompletionItemKind.Keyword,
}

function isName(hint: Hint): boolean {
    return hint.kind === "name" ||
        hint.kind === "function" ||
        hint.kind === "data" ||
        hint.kind === "namespace"
}

const plainName = /^[A-Za-z.][A-Za-z0-9._]*$/
const run = promisify(execFile)
let libsCache: Promise<string[]> | null = null
const dataCache = new Map<string, Promise<string[] | undefined>>()

function envLibs(): string[] {
    return [process.env.R_LIBS_USER, process.env.R_LIBS]
        .filter((value) => value !== undefined)
        .join(delimiter)
        .split(delimiter)
        .filter((dir) => dir !== "")
}

function loadData(name: string, libs: string[]): Promise<string[] | undefined> {
    let cached = dataCache.get(name)
    if (cached === undefined) {
        const config = vscode.workspace.getConfiguration("boxpletion")
        const rscript = config.get<string>("rscriptPath", "Rscript")
        cached = loadPackageData(rscript, libs, name).catch(() => {
            dataCache.delete(name)
            return undefined
        })
        dataCache.set(name, cached)
    }
    return cached
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
                dataCache.clear()
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
                const data: Record<string, string[]> = {}
                for (const name of packagesNeeded(before, roots)) {
                    const loaded = await loadData(name, roots.libs)
                    if (loaded !== undefined) {
                        data[name] = loaded
                    }
                }
                const rest = document.lineAt(position.line).text.slice(position.character)
                const calledAlready = /^[A-Za-z0-9._]*\(/.test(rest)
                return hintsAt(before, { ...roots, data }).map((hint) => {
                    const item = new vscode.CompletionItem(hint.label, itemKinds[hint.kind])
                    item.detail = hint.detail
                    item.sortText = hint.kind === "wildcard" ? "zzz" : hint.label
                    if (isName(hint) && !plainName.test(hint.label)) {
                        item.insertText = "`" + hint.label + "`"
                        item.filterText = hint.label
                    }
                    if (hint.call === true && !calledAlready && plainName.test(hint.label)) {
                        item.insertText = new vscode.SnippetString(hint.label + "($0)")
                        item.command = {
                            command: "editor.action.triggerParameterHints",
                            title: "Parameter hints",
                        }
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
        "(",
        "$"
    )
    context.subscriptions.push(provider)
}

export function deactivate() {}
