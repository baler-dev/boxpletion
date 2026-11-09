export type HintContext =
    | { kind: "module"; segments: string[]; typed: string; lazy: boolean }
    | { kind: "names"; segments: string[]; typed: string; lazy: boolean }

const useCall = "box::use("
const aliasPrefix = /^[A-Za-z0-9._`]+\s*=\s*/

export function findHintContext(before: string): HintContext | null {
    const at = before.lastIndexOf(useCall)
    if (at === -1) {
        return null
    }
    const start = at + useCall.length
    let parens = 1
    let brackets = 0
    let declaration = start
    for (let i = start; i < before.length; i++) {
        const char = before[i]
        if (char === "#") {
            const newline = before.indexOf("\n", i)
            if (newline === -1) {
                return null
            }
            i = newline
        } else if (char === "(") {
            parens++
        } else if (char === ")") {
            parens--
            if (parens === 0) {
                return null
            }
        } else if (char === "[") {
            brackets++
        } else if (char === "]") {
            brackets--
        } else if (char === "," && parens === 1 && brackets === 0) {
            declaration = i + 1
        }
    }

    let text = before.slice(declaration).replace(/#[^\n]*/g, "").trimStart()
    text = text.replace(aliasPrefix, "")
    let lazy = false
    if (text.startsWith("lazy(")) {
        lazy = true
        text = text.slice("lazy(".length).trimStart()
        text = text.replace(aliasPrefix, "")
    }
    if (text.includes(")")) {
        return null
    }

    const open = text.indexOf("[")
    if (open === -1) {
        const parts = text.split("/")
        const typed = (parts.pop() ?? "").trim()
        return { kind: "module", segments: parts.map((part) => part.trim()), typed, lazy }
    }
    if (text.indexOf("]", open) !== -1) {
        return null
    }
    const typed = (text.slice(open + 1).split(",").pop() ?? "").trim()
    const segments = text.slice(0, open).split("/").map((part) => part.trim())
    return { kind: "names", segments, typed, lazy }
}
