import * as vscode from "vscode"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { hintsAt, type Hint } from "./hints"

const itemKinds: Record<Hint["kind"], vscode.CompletionItemKind> = {
    module: vscode.CompletionItemKind.Module,
    folder: vscode.CompletionItemKind.Folder,
    name: vscode.CompletionItemKind.Variable,
    wildcard: vscode.CompletionItemKind.Keyword,
}

const plainName = /^[A-Za-z.][A-Za-z0-9._]*$/

export function activate(context: vscode.ExtensionContext) {
    const provider = vscode.languages.registerCompletionItemProvider(
        { language: "r" },
        {
            provideCompletionItems(document, position) {
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
