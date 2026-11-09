import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

export interface NamespaceInfo {
    names: string[]
    hasPattern: boolean
}

const exportDirective = /(?<![A-Za-z0-9._])export\(/g
const patternDirective = /(?<![A-Za-z0-9._])exportPattern\(/

function balancedBody(text: string, start: number): string | null {
    let depth = 1
    for (let i = start; i < text.length; i++) {
        if (text[i] === "(") {
            depth++
        } else if (text[i] === ")") {
            depth--
            if (depth === 0) {
                return text.slice(start, i)
            }
        }
    }
    return null
}

function cleanName(part: string): string {
    const trimmed = part.trim()
    const quote = trimmed[0]
    const quoted = quote === "\"" || quote === "'" || quote === "`"
    if (trimmed.length > 1 && quoted && trimmed.endsWith(quote)) {
        return trimmed.slice(1, -1)
    }
    return trimmed
}

export function parseNamespace(text: string): NamespaceInfo {
    const clean = text.replace(/#[^\n]*/g, "")
    const names = new Set<string>()
    for (const match of clean.matchAll(exportDirective)) {
        const start = (match.index ?? 0) + match[0].length
        const body = balancedBody(clean, start)
        if (body === null) {
            continue
        }
        for (const part of body.split(",")) {
            const name = cleanName(part)
            if (name !== "") {
                names.add(name)
            }
        }
    }
    return { names: [...names], hasPattern: patternDirective.test(clean) }
}

export function listPackages(libs: string[]): string[] {
    const names = new Set<string>()
    for (const lib of libs) {
        if (!existsSync(lib)) {
            continue
        }
        for (const item of readdirSync(lib, { withFileTypes: true })) {
            if (!item.isDirectory() || item.name.startsWith(".") || item.name.startsWith("00LOCK")) {
                continue
            }
            if (existsSync(join(lib, item.name, "DESCRIPTION"))) {
                names.add(item.name)
            }
        }
    }
    return [...names].sort((x, y) => x.localeCompare(y))
}

export function findPackageDir(libs: string[], name: string): string | null {
    if (name === "" || name === "." || name === ".." || /[\\/]/.test(name)) {
        return null
    }
    for (const lib of libs) {
        const dir = join(lib, name)
        if (existsSync(join(dir, "DESCRIPTION"))) {
            return dir
        }
    }
    return null
}

export function packageExports(libs: string[], name: string): NamespaceInfo | null {
    const dir = findPackageDir(libs, name)
    if (dir === null) {
        return null
    }
    try {
        return parseNamespace(readFileSync(join(dir, "NAMESPACE"), "utf8"))
    } catch {
        return null
    }
}
