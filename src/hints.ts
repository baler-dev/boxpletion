import { readFileSync } from "node:fs"
import { join } from "node:path"
import { findHintContext, type HintContext } from "./context"
import { moduleExports, stripBackticks } from "./exports"
import { listPackages, packageExports } from "./packages"
import { findModuleFile, listModules } from "./resolve"
import { inCommentOrString, moduleBinding, scanUseCalls, type UseImport } from "./scope"

export type HintKind = "module" | "folder" | "name" | "wildcard"

export interface Hint {
    label: string
    kind: HintKind
    detail?: string
}

export interface HintRoots {
    currentDir: string
    balerDir: string
    libs?: string[]
}

const memberAccess = /(?<![A-Za-z0-9._$@:`])(`[^`]+`|[A-Za-z.][A-Za-z0-9._]*)\$[A-Za-z0-9._]*$/
const identifierAt = /(?<![A-Za-z0-9._$@:`])[A-Za-z.][A-Za-z0-9._]*$/

function exportsOf(segments: string[], roots: HintRoots): string[] | null {
    const local = segments[0] === "." || segments[0] === ".."
    const base = local ? roots.currentDir : roots.balerDir
    const last = segments[segments.length - 1]
    const target = last === "." || last === ".." ? [...segments, "__init__"] : segments
    const file = findModuleFile([base], target)
    if (file !== null) {
        try {
            return moduleExports(readFileSync(file, "utf8"))
        } catch {
            return null
        }
    }
    if (!local && segments.length === 1) {
        return packageExports(roots.libs ?? [], segments[0])?.names ?? null
    }
    return null
}

function source(entry: UseImport): string {
    return entry.segments.join("/")
}

function scopeHints(before: string, roots: HintRoots): Hint[] {
    const line = before.slice(before.lastIndexOf("\n") + 1)
    if (inCommentOrString(line)) {
        return []
    }
    const member = memberAccess.exec(line)
    if (member === null && !identifierAt.test(line)) {
        return []
    }
    const scan = scanUseCalls(before)
    if (scan.open) {
        return []
    }
    if (member !== null) {
        const name = stripBackticks(member[1])
        const owner = scan.imports.filter((entry) => moduleBinding(entry) === name).pop()
        if (owner === undefined) {
            return []
        }
        return (exportsOf(owner.segments, roots) ?? []).map((label) => ({
            label,
            kind: "name",
            detail: source(owner),
        }))
    }
    const visible = new Map<string, Hint>()
    for (const entry of scan.imports) {
        const module = moduleBinding(entry)
        if (module !== null) {
            visible.set(module, { label: module, kind: "module", detail: source(entry) })
        }
        for (const attached of entry.attached ?? []) {
            visible.set(attached.name, {
                label: attached.name,
                kind: "name",
                detail: source(entry),
            })
        }
        if (entry.wildcard) {
            for (const label of exportsOf(entry.segments, roots) ?? []) {
                visible.set(label, { label, kind: "name", detail: source(entry) })
            }
        }
    }
    return [...visible.values()]
}

export function hintsAt(before: string, roots: HintRoots): Hint[] {
    const context = findHintContext(before)
    return context === null ? scopeHints(before, roots) : importHints(context, roots)
}

function importHints(context: HintContext, roots: HintRoots): Hint[] {
    const libs = roots.libs ?? []
    const segments = context.segments
    const local = segments[0] === "." || segments[0] === ".."
    const base = local ? roots.currentDir : roots.balerDir

    if (context.kind === "module") {
        const modules: Hint[] = listModules(join(base, ...segments)).map((entry) => ({
            label: entry.name,
            kind: entry.kind,
        }))
        if (segments.length > 0) {
            return modules
        }
        const known = new Set(modules.map((entry) => entry.label))
        const packages: Hint[] = listPackages(libs)
            .filter((name) => !known.has(name))
            .map((name) => ({ label: name, kind: "module" }))
        return [...modules, ...packages]
    }

    const names = exportsOf(segments, roots)
    if (names === null) {
        return []
    }
    const hints: Hint[] = names.map((name) => ({ label: name, kind: "name" }))
    if (!context.lazy) {
        hints.push({ label: "...", kind: "wildcard" })
    }
    return hints
}
