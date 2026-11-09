import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"

export interface ModuleEntry {
    name: string
    kind: "module" | "folder"
}

export function moduleCandidates(base: string, segments: string[]): string[] {
    const stem = join(base, ...segments)
    return [
        stem + ".r",
        stem + ".R",
        join(stem, "__init__.r"),
        join(stem, "__init__.R"),
    ]
}

export function findModuleFile(bases: string[], segments: string[]): string | null {
    for (const base of bases) {
        for (const candidate of moduleCandidates(base, segments)) {
            if (existsSync(candidate)) {
                return candidate
            }
        }
    }
    return null
}

const sourceFile = /^(.+)\.[rR]$/

export function listModules(dir: string): ModuleEntry[] {
    if (!existsSync(dir)) {
        return []
    }
    const entries = new Map<string, ModuleEntry>()
    for (const item of readdirSync(dir, { withFileTypes: true })) {
        if (item.name.startsWith(".") || item.name.endsWith(".dist-info")) {
            continue
        }
        if (item.isFile()) {
            const match = sourceFile.exec(item.name)
            if (match !== null && match[1] !== "__init__") {
                entries.set(match[1], { name: match[1], kind: "module" })
            }
        } else if (item.isDirectory()) {
            const hasInit = ["__init__.r", "__init__.R"].some((file) =>
                existsSync(join(dir, item.name, file))
            )
            if (hasInit) {
                entries.set(item.name, { name: item.name, kind: "module" })
            } else if (!entries.has(item.name)) {
                entries.set(item.name, { name: item.name, kind: "folder" })
            }
        }
    }
    return [...entries.values()].sort((x, y) => x.name.localeCompare(y.name))
}
