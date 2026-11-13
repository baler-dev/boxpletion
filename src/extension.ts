import * as vscode from "vscode"
import { execFile } from "node:child_process"
import { homedir } from "node:os"
import { delimiter, dirname, join } from "node:path"
import { promisify } from "node:util"
import { loadPackageData } from "./data"
import { loadPackageDocs } from "./rdocs"
import { docMarkdown, type FunctionDoc } from "./docs"
import { hintsAt, packagesNeeded, signatureAt, type Hint } from "./hints"

const itemKinds: Record<Hint["kind"], vscode.CompletionItemKind> = {
    module: vscode.CompletionItemKind.Module,
    folder: vscode.CompletionItemKind.Folder,
    name: vscode.CompletionItemKind.Variable,
    function: vscode.CompletionItemKind.Function,
    data: vscode.CompletionItemKind.Constant,
    namespace: vscode.CompletionItemKind.Module,
    wildcard: vscode.CompletionItemKind.Keyword,
    argument: vscode.CompletionItemKind.Property,
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
const docsCache = new Map<string, Promise<void>>()
const docsReady: Record<string, Map<string, FunctionDoc>> = {}
let output: vscode.OutputChannel | null = null

function channel(): vscode.OutputChannel {
    output ??= vscode.window.createOutputChannel("boxpletion")
    return output
}

function log(message: string) {
    channel().appendLine(new Date().toISOString().slice(11, 23) + " " + message)
}

function trace(message: string) {
    if (vscode.workspace.getConfiguration("boxpletion").get<boolean>("trace", false)) {
        log(message)
    }
}

/** Failures are always logged, and shown once, because nothing else tells the user why docs are missing. */
function report(name: string, problem: string, detail: string) {
    log("docs: " + name + ": " + problem)
    if (detail !== "") {
        log("docs: " + name + ": output starts with:\n" + detail)
    }
    void vscode.window
        .showWarningMessage("boxpletion: " + problem + " (" + name + ").", "Show log")
        .then((choice) => {
            if (choice === "Show log") {
                channel().show()
            }
        })
}

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

/** Starts reading a package's help pages in the background. It never blocks a request. */
function warmDocs(name: string, libs: string[]) {
    if (docsCache.has(name)) {
        return
    }
    const config = vscode.workspace.getConfiguration("boxpletion")
    const rscript = config.get<string>("rscriptPath", "Rscript")
    trace("docs: loading help pages of " + name)
    docsCache.set(
        name,
        loadPackageDocs(rscript, libs, name).then(
            ({ docs, sample }) => {
                if (docs.size === 0) {
                    report(name, "no function docs could be read from the help pages", sample)
                    return
                }
                docsReady[name] = docs
                trace("docs: " + name + " ready, " + docs.size + " functions")
                if (vscode.window.activeTextEditor?.document.languageId === "r") {
                    void vscode.commands.executeCommand("editor.action.triggerParameterHints")
                }
            },
            (error: unknown) => {
                report(name, "could not read the help pages", String(error).slice(0, 1500))
            }
        )
    )
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

function moduleRoots(document: vscode.TextDocument) {
    const currentDir =
        document.uri.scheme === "file"
            ? dirname(document.uri.fsPath)
            : (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? homedir())
    return { currentDir, balerDir: join(homedir(), ".baler", "modules") }
}

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration("boxpletion.rscriptPath")) {
                libsCache = null
                dataCache.clear()
                docsCache.clear()
                for (const name of Object.keys(docsReady)) {
                    delete docsReady[name]
                }
            }
        })
    )
    const provider = vscode.languages.registerCompletionItemProvider(
        { language: "r" },
        {
            async provideCompletionItems(document, position, _token, context) {
                const before = document.getText(
                    new vscode.Range(new vscode.Position(0, 0), position)
                )
                const roots = { ...moduleRoots(document), libs: await loadLibs() }
                const data: Record<string, string[]> = {}
                for (const name of packagesNeeded(before, roots)) {
                    const loaded = await loadData(name, roots.libs)
                    if (loaded !== undefined) {
                        data[name] = loaded
                    }
                }
                for (const name of packagesNeeded(before, roots)) {
                    warmDocs(name, roots.libs)
                }
                const rest = document.lineAt(position.line).text.slice(position.character)
                const calledAlready = /^[A-Za-z0-9._]*\(/.test(rest)
                const typedBracket =
                    context.triggerKind === vscode.CompletionTriggerKind.TriggerCharacter &&
                    (context.triggerCharacter === "(" || context.triggerCharacter === ",")
                // Argument names are offered when asked for, or while typing a word, but do not
                // pop up on their own after "(" or ",".
                const hints = hintsAt(before, { ...roots, data, packageDocs: docsReady }).filter(
                    (hint) => !(typedBracket && hint.kind === "argument")
                )
                trace(
                    "completion: kind=" + context.triggerKind +
                        " char=" + JSON.stringify(context.triggerCharacter ?? "") +
                        " -> " + hints.length + " hints"
                )
                return hints.map((hint) => {
                    const doc = hint.doc
                    const item = new vscode.CompletionItem(
                        doc === undefined
                            ? hint.label
                            : { label: hint.label, detail: doc.signature, description: hint.detail },
                        itemKinds[hint.kind]
                    )
                    if (doc === undefined) {
                        item.detail = hint.detail
                    } else {
                        item.detail = hint.label + doc.signature
                        const markdown = docMarkdown(doc)
                        if (markdown !== null) {
                            item.documentation = new vscode.MarkdownString(markdown)
                        }
                    }
                    item.sortText = hint.kind === "wildcard" ? "zzz" : hint.label
                    if (hint.kind === "argument") {
                        item.insertText = hint.label + " = "
                        item.sortText = "0" + String(hint.order ?? 0).padStart(3, "0")
                        if (hint.documentation !== undefined) {
                            item.documentation = new vscode.MarkdownString(hint.documentation)
                        }
                    }
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
    const signatures = vscode.languages.registerSignatureHelpProvider(
        { language: "r" },
        {
            async provideSignatureHelp(document, position, _token, context) {
                const before = document.getText(
                    new vscode.Range(new vscode.Position(0, 0), position)
                )
                const roots = { ...moduleRoots(document), libs: await loadLibs() }
                for (const name of packagesNeeded(before, roots)) {
                    warmDocs(name, roots.libs)
                }
                const info = signatureAt(before, { ...roots, packageDocs: docsReady })
                trace(
                    "signature: kind=" + context.triggerKind +
                        " retrigger=" + context.isRetrigger +
                        " -> " + (info === null ? "none" : info.label + " active=" + info.active)
                )
                if (info === null) {
                    return undefined
                }
                const signature = new vscode.SignatureInformation(
                    info.label,
                    info.documentation === null
                        ? undefined
                        : new vscode.MarkdownString(info.documentation)
                )
                signature.parameters = info.parameters.map(
                    (parameter) =>
                        new vscode.ParameterInformation(
                            parameter.range,
                            parameter.documentation === null
                                ? undefined
                                : new vscode.MarkdownString(parameter.documentation)
                        )
                )
                signature.activeParameter = info.active
                const help = new vscode.SignatureHelp()
                help.signatures = [signature]
                help.activeSignature = 0
                help.activeParameter = info.active
                return help
            },
        },
        { triggerCharacters: ["("], retriggerCharacters: [","] }
    )
    context.subscriptions.push(signatures)
}

export function deactivate() {}
