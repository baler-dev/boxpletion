import { readFileSync } from "node:fs"
import { join } from "node:path"
import { findHintContext } from "./context"
import { moduleExports } from "./exports"
import { listPackages, packageExports } from "./packages"
import { findModuleFile, listModules } from "./resolve"

export type HintKind = "module" | "folder" | "name" | "wildcard"

export interface Hint {
    label: string
    kind: HintKind
}

export interface HintRoots {
    currentDir: string
    balerDir: string
    libs?: string[]
}

export function hintsAt(before: string, roots: HintRoots): Hint[] {
    const context = findHintContext(before)
    if (context === null) {
        return []
    }
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

    const last = segments[segments.length - 1]
    const target = last === "." || last === ".." ? [...segments, "__init__"] : segments
    const file = findModuleFile([base], target)
    let names: string[]
    if (file !== null) {
        try {
            names = moduleExports(readFileSync(file, "utf8"))
        } catch {
            return []
        }
    } else if (!local && segments.length === 1) {
        const info = packageExports(libs, segments[0])
        if (info === null) {
            return []
        }
        names = info.names
    } else {
        return []
    }
    const hints: Hint[] = names.map((name) => ({ label: name, kind: "name" }))
    if (!context.lazy) {
        hints.push({ label: "...", kind: "wildcard" })
    }
    return hints
}
