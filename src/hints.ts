import { readFileSync } from "node:fs"
import { join } from "node:path"
import { findHintContext } from "./context"
import { moduleExports } from "./exports"
import { findModuleFile, listModules } from "./resolve"

export type HintKind = "module" | "folder" | "name" | "wildcard"

export interface Hint {
    label: string
    kind: HintKind
}

export interface HintRoots {
    currentDir: string
    balerDir: string
}

export function hintsAt(before: string, roots: HintRoots): Hint[] {
    const context = findHintContext(before)
    if (context === null) {
        return []
    }
    const segments = context.segments
    const local = segments[0] === "." || segments[0] === ".."
    const base = local ? roots.currentDir : roots.balerDir

    if (context.kind === "module") {
        return listModules(join(base, ...segments)).map((entry) => ({
            label: entry.name,
            kind: entry.kind,
        }))
    }

    const last = segments[segments.length - 1]
    const target = last === "." || last === ".." ? [...segments, "__init__"] : segments
    const file = findModuleFile([base], target)
    if (file === null) {
        return []
    }
    let source: string
    try {
        source = readFileSync(file, "utf8")
    } catch {
        return []
    }
    const hints: Hint[] = moduleExports(source).map((name) => ({
        label: name,
        kind: "name",
    }))
    if (!context.lazy) {
        hints.push({ label: "...", kind: "wildcard" })
    }
    return hints
}
