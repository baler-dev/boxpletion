const exportTag = /^#'\s*@export(\s|$)/
const assignment = /^([A-Za-z.][A-Za-z0-9._]*)\s*(<<-|<-|:=|=(?!=))/
const exportCall = /box::export\(([^)]*)\)/g
const aliasPrefix = /^([A-Za-z0-9._`]+)\s*=\s*/
const useStart = "box::use("

export function stripBackticks(name: string): string {
    if (name.length > 1 && name.startsWith("`") && name.endsWith("`")) {
        return name.slice(1, -1)
    }
    return name
}

function withoutComments(text: string): string {
    return text.replace(/#[^\n]*/g, "")
}

function splitTopLevel(text: string): string[] {
    const parts: string[] = []
    let depth = 0
    let current = ""
    for (const char of text) {
        if (char === "(" || char === "[") {
            depth++
        } else if (char === ")" || char === "]") {
            depth--
        }
        if (char === "," && depth === 0) {
            parts.push(current)
            current = ""
        } else {
            current += char
        }
    }
    parts.push(current)
    return parts
}

function callBody(source: string, start: number): string | null {
    let depth = 1
    for (let i = start; i < source.length; i++) {
        const char = source[i]
        if (char === "#") {
            const newline = source.indexOf("\n", i)
            if (newline === -1) {
                return null
            }
            i = newline
        } else if (char === "(") {
            depth++
        } else if (char === ")") {
            depth--
            if (depth === 0) {
                return source.slice(start, i)
            }
        }
    }
    return null
}

function reexportedNames(body: string): string[] {
    const names: string[] = []
    for (const raw of splitTopLevel(withoutComments(body))) {
        let text = raw.trim()
        if (text === "") {
            continue
        }
        let alias: string | null = null
        const aliasMatch = aliasPrefix.exec(text)
        if (aliasMatch !== null) {
            alias = stripBackticks(aliasMatch[1])
            text = text.slice(aliasMatch[0].length).trim()
        }
        if (text.startsWith("lazy(") && text.endsWith(")")) {
            text = text.slice("lazy(".length, -1).trim()
        }
        const open = text.indexOf("[")
        const modulePath = open === -1 ? text : text.slice(0, open)
        let attached: string[] | null = null
        if (open !== -1) {
            const close = text.lastIndexOf("]")
            const inside = text.slice(open + 1, close === -1 ? undefined : close)
            attached = splitTopLevel(inside)
                .map((part) => stripBackticks(part.split("=")[0].trim()))
                .filter((name) => name !== "" && name !== "...")
        }
        names.push(...(attached ?? []))
        const segments = modulePath.split("/")
        const last = stripBackticks(segments[segments.length - 1].trim())
        const moduleName = alias ?? last
        const exposesModule = attached === null || alias !== null
        if (exposesModule && moduleName !== "" && moduleName !== "." && moduleName !== "..") {
            names.push(moduleName)
        }
    }
    return names
}

export function exportedNames(source: string): string[] {
    const names: string[] = []
    let tagged = false
    let offset = 0
    for (const raw of source.split("\n")) {
        const line = raw.replace(/\r$/, "")
        const lineStart = offset
        offset += raw.length + 1
        if (exportTag.test(line)) {
            tagged = true
            continue
        }
        const trimmed = line.trim()
        if (trimmed === "" || trimmed.startsWith("#")) {
            continue
        }
        if (tagged) {
            if (line.startsWith(useStart)) {
                const body = callBody(source, lineStart + useStart.length)
                if (body !== null) {
                    names.push(...reexportedNames(body))
                }
            } else {
                const match = assignment.exec(line)
                if (match !== null) {
                    names.push(match[1])
                }
            }
        }
        tagged = false
    }
    return [...new Set(names)]
}

export function topLevelNames(source: string): string[] {
    const names = new Set<string>()
    for (const line of source.split(/\r?\n/)) {
        const match = assignment.exec(line)
        if (match === null || match[2] === "<<-" || match[1].startsWith(".")) {
            continue
        }
        names.add(match[1])
    }
    return [...names]
}

function declaredExports(source: string): string[] | null {
    const code = source
        .split(/\r?\n/)
        .filter((line) => !line.trim().startsWith("#"))
        .join("\n")
    let found = false
    const names = new Set<string>()
    for (const call of code.matchAll(exportCall)) {
        found = true
        for (const part of call[1].split(",")) {
            const name = stripBackticks(part.trim())
            if (name !== "") {
                names.add(name)
            }
        }
    }
    return found ? [...names] : null
}

export function moduleExports(source: string): string[] {
    const declared = declaredExports(source)
    if (declared !== null) {
        return declared
    }
    const tagged = exportedNames(source)
    return tagged.length > 0 ? tagged : topLevelNames(source)
}
