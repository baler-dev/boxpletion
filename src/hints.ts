import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { findHintContext, type HintContext } from "./context"
import { findCall } from "./calls"
import { moduleDocs, summaryMarkdown, type FunctionDoc } from "./docs"
import { functionNames, moduleExports, stripBackticks } from "./exports"
import { findPackageDir, listPackages, packageExports } from "./packages"
import { findModuleFile, listModules } from "./resolve"
import {
    inCommentOrString,
    moduleBinding,
    moduleReexports,
    scanUseCalls,
    type UseImport,
} from "./scope"

export type HintKind =
    | "module"
    | "folder"
    | "name"
    | "function"
    | "data"
    | "namespace"
    | "wildcard"

export interface Hint {
    label: string
    kind: HintKind
    detail?: string
    call?: boolean
    doc?: FunctionDoc
}

export interface HintRoots {
    currentDir: string
    balerDir: string
    libs?: string[]
    data?: Record<string, string[]>
}

const identifier = "(?:`[^`]+`|[A-Za-z.][A-Za-z0-9._]*)"
const memberAccess = new RegExp(
    "(?<![A-Za-z0-9._$@:`])(" + identifier + "(?:\\$" + identifier + ")*)\\$[A-Za-z0-9._]*$"
)
const identifierParts = new RegExp(identifier, "g")
const identifierAt = /(?<![A-Za-z0-9._$@:`])[A-Za-z.][A-Za-z0-9._]*$/

type NameKind = "function" | "data" | "namespace" | "name"

interface Target {
    segments: string[]
    dir?: string
}

interface ModuleNames {
    names: string[]
    kindOf: (name: string) => NameKind
    /** Where an exported name that is itself a module lives, if it is one. */
    submodule: (name: string) => Target | null
    /** The signature and roxygen docs of an exported function, when known. */
    docOf: (name: string) => FunctionDoc | null
}

const maxDepth = 8

function exportsOf(
    segments: string[],
    roots: HintRoots,
    dir?: string,
    depth = 0
): ModuleNames | null {
    if (depth > maxDepth) {
        return null
    }
    const local = segments[0] === "." || segments[0] === ".."
    const base = local ? (dir ?? roots.currentDir) : roots.balerDir
    const last = segments[segments.length - 1]
    const target = last === "." || last === ".." ? [...segments, "__init__"] : segments
    const file = findModuleFile([base], target)
    if (file !== null) {
        try {
            const text = readFileSync(file, "utf8")
            const functions = functionNames(text)
            const reexports = moduleReexports(text)
            const docs = moduleDocs(text)
            const here = dirname(file)
            const follow = (name: string) => {
                const reexport = reexports.get(name)
                if (reexport === undefined) {
                    return null
                }
                const from = exportsOf(reexport.segments, roots, here, depth + 1)
                return { reexport, from }
            }
            return {
                names: moduleExports(text),
                kindOf: (name) => {
                    const followed = follow(name)
                    if (followed === null) {
                        return functions.has(name) ? "function" : "name"
                    }
                    if (followed.reexport.source === null) {
                        return "namespace"
                    }
                    return followed.from?.kindOf(followed.reexport.source) ?? "name"
                },
                docOf: (name) => {
                    const followed = follow(name)
                    if (followed === null) {
                        return docs.get(name) ?? null
                    }
                    if (followed.reexport.source === null) {
                        return null
                    }
                    return followed.from?.docOf(followed.reexport.source) ?? null
                },
                submodule: (name) => {
                    const followed = follow(name)
                    if (followed === null) {
                        return null
                    }
                    if (followed.reexport.source === null) {
                        return { segments: followed.reexport.segments, dir: here }
                    }
                    return followed.from?.submodule(followed.reexport.source) ?? null
                },
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
        return { names: info.names, kindOf: () => "name", submodule: () => null, docOf: () => null }
    }
    const data = new Set(loaded)
    return {
        names: [...new Set([...info.names, ...loaded])],
        kindOf: (name) => (data.has(name) ? "data" : "function"),
        submodule: () => null,
        docOf: () => null,
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

type Binding =
    | { kind: "module"; entry: UseImport }
    | { kind: "attached"; info: ModuleNames | null; source: string }

/** What `name` is bound to after the given imports. A later import wins. */
function resolveName(name: string, imports: UseImport[], roots: HintRoots): Binding | null {
    let found: Binding | null = null
    for (const entry of imports) {
        if (moduleBinding(entry) === name) {
            found = { kind: "module", entry }
        }
        const attaches = (entry.attached?.length ?? 0) > 0 || entry.wildcard
        const info = attaches ? exportsOf(entry.segments, roots) : null
        for (const attached of entry.attached ?? []) {
            if (attached.name === name) {
                found = { kind: "attached", info, source: attached.source }
            }
        }
        if (entry.wildcard && info?.names.includes(name)) {
            found = { kind: "attached", info, source: name }
        }
    }
    return found
}

/** The module that `name` refers to after the given imports, or null if it is not a module. */
function bindingTarget(name: string, imports: UseImport[], roots: HintRoots): Target | null {
    const found = resolveName(name, imports, roots)
    if (found === null) {
        return null
    }
    return found.kind === "module"
        ? { segments: found.entry.segments }
        : (found.info?.submodule(found.source) ?? null)
}

/** The module a chain such as `foo$bar` refers to. */
function chainTarget(parts: string[], imports: UseImport[], roots: HintRoots): Target | null {
    let target = bindingTarget(parts[0], imports, roots)
    for (const part of parts.slice(1)) {
        target =
            target === null
                ? null
                : (exportsOf(target.segments, roots, target.dir)?.submodule(part) ?? null)
    }
    return target
}

function usable(label: string, from: ModuleNames | null, detail: string, original = label): Hint {
    const kind = from === null ? "name" : from.kindOf(original)
    const doc = from?.docOf(original) ?? null
    const hint: Hint = kind === "function" ? { label, kind, detail, call: true } : { label, kind, detail }
    if (doc !== null) {
        hint.doc = doc
    }
    return hint
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
        const parts = [...member[1].matchAll(identifierParts)].map((part) =>
            stripBackticks(part[0])
        )
        const target = chainTarget(parts, scan.imports, roots)
        if (target === null) {
            return []
        }
        const owned = exportsOf(target.segments, roots, target.dir)
        const detail = target.segments.join("/")
        return (owned?.names ?? []).map((label) => usable(label, owned, detail))
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
    const hints: Hint[] = found.names.map((name) => {
        const hint: Hint = { label: name, kind: found.kindOf(name) }
        const doc = found.docOf(name)
        if (doc !== null) {
            hint.doc = doc
        }
        return hint
    })
    if (!context.lazy) {
        hints.push({ label: "...", kind: "wildcard" })
    }
    return hints
}

export interface SignatureInfo {
    label: string
    documentation: string | null
    /** `range` is the parameter's [start, end) offsets inside `label`. */
    parameters: { label: string; range: [number, number]; documentation: string | null }[]
    /** Index of the parameter being typed; past the end when none applies. */
    active: number
}

function docOfCallee(callee: string, imports: UseImport[], roots: HintRoots): FunctionDoc | null {
    const parts = [...callee.matchAll(identifierParts)].map((part) => stripBackticks(part[0]))
    if (parts.length === 1) {
        const found = resolveName(parts[0], imports, roots)
        return found?.kind === "attached" ? (found.info?.docOf(found.source) ?? null) : null
    }
    const target = chainTarget(parts.slice(0, -1), imports, roots)
    return target === null
        ? null
        : (exportsOf(target.segments, roots, target.dir)?.docOf(parts[parts.length - 1]) ?? null)
}

/** The signature to show while typing a call to an imported function, or null if unknown. */
export function signatureAt(before: string, roots: HintRoots): SignatureInfo | null {
    const line = before.slice(before.lastIndexOf("\n") + 1)
    if (inCommentOrString(line)) {
        return null
    }
    const call = findCall(before)
    if (call === null) {
        return null
    }
    const scan = scanUseCalls(before)
    if (scan.open) {
        return null
    }
    const doc = docOfCallee(call.callee, scan.imports, roots)
    if (doc === null) {
        return null
    }
    const dots = doc.args.findIndex((arg) => arg.name === "...")
    let active = call.argName === null ? call.commas : doc.args.findIndex((arg) => arg.name === call.argName)
    if (active === -1 || (call.argName === null && dots !== -1 && active >= dots)) {
        active = dots === -1 ? doc.args.length : dots
    }
    const name = [...call.callee.matchAll(identifierParts)].map((part) => part[0]).pop() ?? call.callee
    let position = name.length + 1
    const parameters = doc.args.map((arg) => {
        const range: [number, number] = [position, position + arg.label.length]
        position = range[1] + 2
        return { label: arg.label, range, documentation: arg.doc }
    })
    return {
        label: name + doc.signature,
        documentation: summaryMarkdown(doc),
        parameters,
        active,
    }
}
