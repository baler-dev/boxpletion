export interface CallSite {
    /** The callee as written, such as `add` or `mod$add`. */
    callee: string
    /** How many top-level commas come before the cursor inside this call. */
    commas: number
    /** The argument name being typed, as in `add(y = `, or null. */
    argName: string | null
    /** The text of the argument being typed, without leading space. */
    current: string
    /** Names of the arguments already given by name, such as `y` in `f(y = 1, `. */
    usedNames: string[]
}

interface Frame {
    open: string
    callee: string | null
    commas: number
    argStart: number
    names: string[]
}

const identifier = "(?:`[^`]+`|[A-Za-z.][A-Za-z0-9._]*)"
const calleeAt = new RegExp("(?<![A-Za-z0-9._$@:`])(" + identifier + "(?:\\$" + identifier + ")*)$")
const argNameAt = /^\s*(`[^`]+`|[A-Za-z.][A-Za-z0-9._]*)\s*=(?!=)/

function skipString(text: string, start: number): number {
    const quote = text[start]
    for (let i = start + 1; i < text.length; i++) {
        if (text[i] === "\\" && quote !== "`") {
            i++
        } else if (text[i] === quote) {
            return i
        }
    }
    return text.length
}

/**
 * The innermost call the cursor, at the end of `before`, is inside. Returns null when the
 * innermost bracket is not a call, such as `{`, `[` or a plain grouping parenthesis.
 */
export function findCall(before: string): CallSite | null {
    const stack: Frame[] = []
    for (let i = 0; i < before.length; i++) {
        const char = before[i]
        if (char === "\"" || char === "'" || char === "`") {
            i = skipString(before, i)
        } else if (char === "#") {
            const newline = before.indexOf("\n", i)
            if (newline === -1) {
                return null
            }
            i = newline
        } else if (char === "(" || char === "[" || char === "{") {
            const callee = char === "(" ? (calleeAt.exec(before.slice(0, i))?.[1] ?? null) : null
            stack.push({ open: char, callee, commas: 0, argStart: i + 1, names: [] })
        } else if (char === ")" || char === "]" || char === "}") {
            stack.pop()
        } else if (char === "," && stack.length > 0) {
            const top = stack[stack.length - 1]
            const given = argNameAt.exec(before.slice(top.argStart, i))?.[1]
            if (given !== undefined) {
                top.names.push(given.replace(/`/g, ""))
            }
            top.commas++
            top.argStart = i + 1
        }
    }
    const top = stack[stack.length - 1]
    if (top === undefined || top.open !== "(" || top.callee === null) {
        return null
    }
    const rest = before.slice(top.argStart)
    const argName = argNameAt.exec(rest)?.[1] ?? null
    return {
        callee: top.callee,
        commas: top.commas,
        argName: argName === null ? null : argName.replace(/`/g, ""),
        current: rest.trimStart(),
        usedNames: top.names,
    }
}
