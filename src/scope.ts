import { stripBackticks } from "./exports"

export interface AttachedName {
    name: string
    source: string
}

export interface UseImport {
    alias: string | null
    segments: string[]
    attached: AttachedName[] | null
    wildcard: boolean
    lazy: boolean
}

export interface UseScan {
    imports: UseImport[]
    open: boolean
}

const useCall = "box::use("
const nameHead = /^(`[^`]+`|[A-Za-z.][A-Za-z0-9._]*)\s*=(?!=)\s*/
const attachedPair = /^(`[^`]+`|[A-Za-z.][A-Za-z0-9._]*)\s*=(?!=)\s*([\s\S]+)$/

function isQuote(char: string): boolean {
    return char === "\"" || char === "'" || char === "`"
}

function stringEnd(text: string, start: number): number {
    const quote = text[start]
    for (let i = start + 1; i < text.length; i++) {
        if (text[i] === "\\" && quote !== "`") {
            i++
        } else if (text[i] === quote) {
            return i
        }
    }
    return -1
}

/** True when the end of `line` sits inside a comment or an unterminated string. */
export function inCommentOrString(line: string): boolean {
    let quote: string | null = null
    for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (quote !== null) {
            if (char === "\\" && quote !== "`") {
                i++
            } else if (char === quote) {
                quote = null
            }
        } else if (isQuote(char)) {
            quote = char
        } else if (char === "#") {
            return true
        }
    }
    return quote !== null
}

function callEnd(text: string, start: number): number {
    let depth = 1
    for (let i = start; i < text.length; i++) {
        const char = text[i]
        if (char === "#") {
            const newline = text.indexOf("\n", i)
            if (newline === -1) {
                return -1
            }
            i = newline
        } else if (isQuote(char)) {
            i = stringEnd(text, i)
            if (i === -1) {
                return -1
            }
        } else if (char === "(") {
            depth++
        } else if (char === ")") {
            depth--
            if (depth === 0) {
                return i
            }
        }
    }
    return -1
}

function splitArgs(text: string): string[] {
    const parts: string[] = []
    let depth = 0
    let current = ""
    for (let i = 0; i < text.length; i++) {
        const char = text[i]
        if (isQuote(char)) {
            const end = stringEnd(text, i)
            const stop = end === -1 ? text.length - 1 : end
            current += text.slice(i, stop + 1)
            i = stop
            continue
        }
        if (char === "#") {
            const newline = text.indexOf("\n", i)
            i = newline === -1 ? text.length : newline
            current += " "
            continue
        }
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

function parseAttached(inside: string): { attached: AttachedName[]; wildcard: boolean } {
    const attached: AttachedName[] = []
    let wildcard = false
    for (const part of splitArgs(inside)) {
        const piece = part.trim()
        if (piece === "") {
            continue
        }
        if (piece === "...") {
            wildcard = true
            continue
        }
        const pair = attachedPair.exec(piece)
        if (pair !== null) {
            attached.push({
                name: stripBackticks(pair[1]),
                source: stripBackticks(pair[2].trim()),
            })
        } else {
            attached.push({ name: stripBackticks(piece), source: stripBackticks(piece) })
        }
    }
    return { attached, wildcard }
}

function parseEntry(raw: string): UseImport | null {
    let text = raw.trim()
    if (text === "") {
        return null
    }
    let alias: string | null = null
    let lazy = false
    const take = () => {
        const head = nameHead.exec(text)
        if (head !== null && alias === null) {
            alias = stripBackticks(head[1])
            text = text.slice(head[0].length).trim()
        }
    }
    take()
    if (text.startsWith("lazy(") && text.endsWith(")")) {
        lazy = true
        text = text.slice("lazy(".length, -1).trim()
        take()
    }
    const open = text.indexOf("[")
    const path = open === -1 ? text : text.slice(0, open)
    const segments = path.split("/").map((part) => stripBackticks(part.trim()))
    if (segments[segments.length - 1] === "") {
        return null
    }
    let attached: AttachedName[] | null = null
    let wildcard = false
    if (open !== -1) {
        const close = text.lastIndexOf("]")
        const inside = text.slice(open + 1, close === -1 ? undefined : close)
        ;({ attached, wildcard } = parseAttached(inside))
    }
    return { alias, segments, attached, wildcard, lazy }
}

/**
 * Collects every complete `box::use()` call in `text`. `open` is true when the last
 * call is still unclosed, which means the cursor is inside it.
 */
export function scanUseCalls(text: string): UseScan {
    const imports: UseImport[] = []
    let from = 0
    while (true) {
        const at = text.indexOf(useCall, from)
        if (at === -1) {
            return { imports, open: false }
        }
        from = at + useCall.length
        const lineStart = text.lastIndexOf("\n", at) + 1
        if (inCommentOrString(text.slice(lineStart, at))) {
            continue
        }
        const end = callEnd(text, from)
        if (end === -1) {
            return { imports, open: true }
        }
        for (const raw of splitArgs(text.slice(from, end))) {
            const entry = parseEntry(raw)
            if (entry !== null) {
                imports.push(entry)
            }
        }
        from = end + 1
    }
}

/** The name an import binds for the module itself, or null if it only attaches names. */
export function moduleBinding(entry: UseImport): string | null {
    if (entry.attached !== null && entry.alias === null) {
        return null
    }
    const name = entry.alias ?? entry.segments[entry.segments.length - 1]
    return name === "" || name === "." || name === ".." ? null : name
}
