import { callEnd, splitArgs } from "./scope"

export interface ArgDoc {
    name: string
    /** The argument as written in the signature, such as `y = 2`. */
    label: string
    doc: string | null
}

export interface FunctionDoc {
    /** The argument list, such as `(x, y = 2)`. */
    signature: string
    args: ArgDoc[]
    title: string | null
    description: string | null
    returns: string | null
}

const name = "[A-Za-z.][A-Za-z0-9._]*"
const header = new RegExp("^(" + name + ")\\s*(?:<<-|<-|:=|=(?!=))\\s*(?:function\\s*|\\\\)\\(")
const alias = new RegExp("^(" + name + ")\\s*(?:<<-|<-|=(?!=))\\s*(" + name + ")\\s*(?:#.*)?$")

function squash(text: string): string {
    return text.replace(/\s+/g, " ").trim()
}

/** Turns the Rd markup that roxygen text may contain, such as \\code{x}, into markdown. */
export function cleanRd(text: string): string {
    let out = text
    for (let pass = 0; pass < 3; pass++) {
        out = out
            .replace(/\\href\{([^{}]*)\}\{([^{}]*)\}/g, "[$2]($1)")
            .replace(/\\(?:code|verb|samp|file|command|env|option|kbd)\{([^{}]*)\}/g, "`$1`")
            .replace(/\\(?:emph|var|cite)\{([^{}]*)\}/g, "*$1*")
            .replace(/\\strong\{([^{}]*)\}/g, "**$1**")
            .replace(/\\(?:link|linkS4class|pkg|url|eqn|deqn|sQuote|dQuote|acronym|dfn)(?:\[[^\]]*\])?\{([^{}]*)\}/g, "$1")
    }
    return out
}

interface Roxygen {
    title: string | null
    description: string | null
    params: Map<string, string>
    returns: string | null
}

function parseRoxygen(raw: string[]): Roxygen {
    const free: string[] = []
    const tags: { tag: string; text: string[] }[] = []
    for (const line of raw.map((text) => text.replace(/^#'\s?/, ""))) {
        const tag = /^@(\w+)\s*(.*)$/.exec(line.trim())
        if (tag !== null) {
            tags.push({ tag: tag[1], text: [tag[2]] })
        } else if (tags.length > 0) {
            tags[tags.length - 1].text.push(line.trim())
        } else {
            free.push(line.trim())
        }
    }
    const paragraphs = free
        .join("\n")
        .split(/\n\s*\n/)
        .map((paragraph) => cleanRd(squash(paragraph)))
        .filter((paragraph) => paragraph !== "")
    const params = new Map<string, string>()
    let title: string | null = paragraphs[0] ?? null
    let description: string | null = paragraphs.length > 1 ? paragraphs.slice(1).join("\n\n") : null
    let returns: string | null = null
    for (const { tag, text } of tags) {
        const body = cleanRd(squash(text.join(" ")))
        if (tag === "param") {
            const match = /^(\S+)\s*(.*)$/.exec(body)
            for (const each of match?.[1].split(",") ?? []) {
                params.set(each.replace(/`/g, ""), match?.[2] ?? "")
            }
        } else if (tag === "title" && body !== "") {
            title = body
        } else if (tag === "description" && body !== "") {
            description = body
        } else if ((tag === "return" || tag === "returns") && body !== "") {
            returns = body
        }
    }
    return { title, description, params, returns }
}

function roxygenAbove(lines: string[], index: number): string[] {
    const block: string[] = []
    for (let i = index - 1; i >= 0 && lines[i].startsWith("#'"); i--) {
        block.unshift(lines[i])
    }
    return block
}

function argNameOf(label: string): string {
    return label.split("=")[0].trim().replace(/`/g, "")
}

/** Signatures and roxygen docs of the functions a module defines at the top level. */
export function moduleDocs(source: string): Map<string, FunctionDoc> {
    const docs = new Map<string, FunctionDoc>()
    const aliases: [string, string][] = []
    const raws = source.split("\n")
    const lines = raws.map((raw) => raw.replace(/\r$/, ""))
    let offset = 0
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const lineStart = offset
        offset += raws[i].length + 1
        const match = header.exec(line)
        if (match === null) {
            const link = alias.exec(line)
            if (link !== null) {
                aliases.push([link[1], link[2]])
            }
            continue
        }
        const open = lineStart + match[0].length
        const close = callEnd(source, open)
        if (close === -1) {
            continue
        }
        const labels = splitArgs(source.slice(open, close))
            .map(squash)
            .filter((label) => label !== "")
        const roxygen = parseRoxygen(roxygenAbove(lines, i))
        docs.set(match[1], {
            signature: "(" + labels.join(", ") + ")",
            args: labels.map((label) => ({
                name: argNameOf(label),
                label,
                doc: roxygen.params.get(argNameOf(label)) ?? null,
            })),
            title: roxygen.title,
            description: roxygen.description,
            returns: roxygen.returns,
        })
    }
    let grew = true
    while (grew) {
        grew = false
        for (const [from, to] of aliases) {
            const target = docs.get(to)
            if (!docs.has(from) && target !== undefined) {
                docs.set(from, target)
                grew = true
            }
        }
    }
    return docs
}

/** Markdown for the documentation panel: title, description, every described argument, and the return value. */
export function docMarkdown(doc: FunctionDoc): string | null {
    const parts: string[] = []
    if (doc.title !== null) {
        parts.push("**" + doc.title + "**")
    }
    if (doc.description !== null) {
        parts.push(doc.description)
    }
    const described = doc.args.filter((arg) => arg.doc !== null && arg.doc !== "")
    if (described.length > 0) {
        parts.push(
            "**Arguments**\n\n" + described.map((arg) => "- `" + arg.name + "`: " + arg.doc).join("\n")
        )
    }
    if (doc.returns !== null) {
        parts.push("**Returns**\n\n" + doc.returns)
    }
    return parts.length === 0 ? null : parts.join("\n\n")
}
