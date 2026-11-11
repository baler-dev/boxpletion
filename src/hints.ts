import { readFileSync } from "node:fs"
import { join } from "node:path"
import { findHintContext, type HintContext } from "./context"
import { functionNames, moduleExports, stripBackticks } from "./exports"
import { findPackageDir, listPackages, packageExports } from "./packages"
import { findModuleFile, listModules } from "./resolve"
import {
    inCommentOrString,
    moduleBinding,
    scanUseCalls,
    type UseImport,
} from "./scope"

export type HintKind = "module" | "folder" | "name" | "function" | "data" | "wildcard"

export interface Hint {
    label: string
    kind: HintKind
    detail?: string
    call?: boolean
}

export interface HintRoots {
    currentDir: string
    balerDir: string
    libs?: string[]
    data?: Record<string, string[]>
}

const memberAccess = /(?<![A-Za-z0-9._$@:`])(`[^`]+`|[A-Za-z.][A-Za-z0-9._]*)\$[A-Za-z0-9._]*$/
const identifierAt = /(?<![A-Za-z0-9._$@:`])[A-Za-z.][A-Za-z0-9._]*$/

interface ModuleNames {
    names: string[]
    kindOf: (name: string) => "function" | "data" | "name"
}

function exportsOf(segments: string[], roots: HintRoots): ModuleNames | null {
    const local = segments[0] === "." || segments[0] === ".."
    const base = local ? roots.currentDir : roots.balerDir
    const last = segments[segments.length - 1]
    const target = last === "." || last === ".." ? [...segments, "__init__"] : segments
    const file = findModuleFile([base], target)
    if (file !== null) {
        try {
            const text = readFileSync(file, "utf8")
            const functions = functionNames(text)
            return {
                names: moduleExports(text),
                kindOf: (name) => (functions.has(name) ? "function" : "name"),
            }
        } catch {
            return null
        }
    }
    if (local || segments.length !== 1) {
        return null
    }
    const info = packageExports(roots.libs ?? [], segments[0])
    if (info === null) {
        return null
    }
    const loaded = roots.data?.[segments[0]]
    if (loaded === undefined) {
        return { names: info.names, kindOf: () => "name" }
    }
    const data = new Set(loaded)
    return {
        names: [...new Set([...info.names, ...loaded])],
        kindOf: (name) => (data.has(name) ? "data" : "function"),
    }
}

/** Installed packages whose data index is needed to hint `before`. */
export function packagesNeeded(before: string, roots: HintRoots): string[] {
    const wanted = new Set<string>()
    const context = findHintContext(before)
    if (context === null) {
        for (const entry of scanUseCalls(before).imports) {
            wanted.add(entry.segments.length === 1 ? entry.segments[0] : "")
        }
    } else if (context.kind === "names") {
        wanted.add(context.segments.length === 1 ? context.segments[0] : "")
    }
    const libs = roots.libs ?? []
    return [...wanted].filter(
        (name) =>
            name !== "" &&
            name !== "." &&
            name !== ".." &&
            findModuleFile([roots.balerDir], [name]) === null &&
            findPackageDir(libs, name) !== null
    )
}

function source(entry: UseImport): string {
    return entry.segments.join("/")
}

function usable(label: string, from: ModuleNames | null, detail: string, original = label): Hint {
    const kind = from === null ? "name" : from.kindOf(original)
    return kind === "function" ? { label, kind, detail, call: true } : { label, kind, detail }
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
        const owned = exportsOf(owner.segments, roots)
        return (owned?.names ?? []).map((label) => usable(label, owned, source(owner)))
    }
    const visible = new Map<string, Hint>()
    for (const entry of scan.imports) {
        const module = moduleBinding(entry)
        if (module !== null) {
            visible.set(module, { label: module, kind: "module", detail: source(entry) })
        }
        const known =
            (entry.attached?.length ?? 0) > 0 || entry.wildcard
                ? exportsOf(entry.segments, roots)
                : null
        for (const attached of entry.attached ?? []) {
            visible.set(attached.name, usable(attached.name, known, source(entry), attached.source))
        }
        if (entry.wildcard) {
            for (const label of known?.names ?? []) {
                visible.set(label, usable(label, known, source(entry)))
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

    const found = exportsOf(segments, roots)
    if (found === null) {
        return []
    }
    const hints: Hint[] = found.names.map((name) => ({ label: name, kind: found.kindOf(name) }))
    if (!context.lazy) {
        hints.push({ label: "...", kind: "wildcard" })
    }
    return hints
}
