import { execFile } from "node:child_process"
import { promisify } from "node:util"
import type { FunctionDoc } from "./docs"
import { callEnd, splitArgs } from "./scope"

const run = promisify(execFile)

const marker = "@@@TOPIC@@@"

// Renders every help page of an installed package to HTML. It reads the installed help
// database and does not load the package or run its code. It is one line on purpose:
// Rscript on Windows mangles newlines inside a -e argument.
const script = [
    "args = commandArgs(trailingOnly = TRUE)",
    "db = tools::Rd_db(package = args[1], lib.loc = args[-1])",
    "tmp = tempfile(fileext = '.html')",
    "for (rd in db) { ok = suppressWarnings(tryCatch({ tools::Rd2HTML(rd, out = tmp, fragment = TRUE); TRUE }, error = function(e) FALSE)); if (ok) { writeLines('" + marker + "'); writeLines(readLines(tmp, warn = FALSE, encoding = 'UTF-8'), useBytes = TRUE) } }",
    "unlink(tmp)",
].join("; ")

const entities: Record<string, string> = {
    lt: "<",
    gt: ">",
    amp: "&",
    quot: "\"",
    apos: "'",
    nbsp: " ",
}

function decode(text: string): string {
    return text
        .replace(/&#8288;|&#x2060;/g, "")
        .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 10)))
        .replace(/&([a-z]+);/gi, (whole, name: string) => entities[name.toLowerCase()] ?? whole)
}

function stripTags(html: string): string {
    return decode(html.replace(/<[^>]*>/g, ""))
}

/** Plain markdown-ish text from an HTML fragment of a help page. */
export function htmlToText(html: string): string {
    const text = html
        .replace(/<span class="rlang">\s*<b>R<\/b>\s*<\/span>/g, "R")
        .replace(/<code[^>]*>([\s\S]*?)<\/code>/g, (_, inner: string) => "`" + stripTags(inner) + "`")
        .replace(/<(?:em|i)>([\s\S]*?)<\/(?:em|i)>/g, "*$1*")
        .replace(/<(?:strong|b)>([\s\S]*?)<\/(?:strong|b)>/g, "**$1**")
        .replace(/<\/p>|<br\s*\/?>|<\/div>|<\/ul>|<\/ol>/g, "\n\n")
        .replace(/<li[^>]*>/g, "\n- ")
    return stripTags(text)
        .split(/\n\s*\n/)
        .map((paragraph) =>
            paragraph
                .split("\n")
                .map((line) => line.replace(/[ \t]+/g, " ").trim())
                .filter((line) => line !== "")
                .join(" ")
                .replace(/ - /g, "\n- ")
                .trim()
        )
        .filter((paragraph) => paragraph !== "")
        .join("\n\n")
}

function sections(html: string): Map<string, string> {
    const found = new Map<string, string>()
    const heading = /<h3[^>]*>([\s\S]*?)<\/h3>/g
    const marks = [...html.matchAll(heading)]
    marks.forEach((mark, index) => {
        const end = index + 1 < marks.length ? marks[index + 1].index : html.length
        const start = (mark.index ?? 0) + mark[0].length
        found.set(stripTags(mark[1]).trim(), html.slice(start, end))
    })
    return found
}

function firstParagraphs(text: string, count: number): string | null {
    const kept = text.split("\n\n").slice(0, count).join("\n\n")
    return kept === "" ? null : kept
}

function argumentTable(html: string): Map<string, string> {
    const found = new Map<string, string>()
    const row = /<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/g
    for (const match of html.matchAll(row)) {
        const doc = htmlToText(match[2])
        for (const name of stripTags(match[1]).split(",")) {
            const clean = name.replace(/`/g, "").trim()
            if (clean !== "") {
                found.set(clean, doc)
            }
        }
    }
    return found
}

const callStart = /(?:^|\n)[ \t]*([A-Za-z.][A-Za-z0-9._]*)[ \t]*\(/g

function usageCalls(usage: string): { name: string; args: string }[] {
    const calls: { name: string; args: string }[] = []
    callStart.lastIndex = 0
    let match = callStart.exec(usage)
    while (match !== null) {
        const open = match.index + match[0].length
        const end = callEnd(usage, open)
        if (end === -1) {
            break
        }
        calls.push({ name: match[1], args: usage.slice(open, end) })
        callStart.lastIndex = end + 1
        match = callStart.exec(usage)
    }
    return calls
}

/** The functions documented on one help page, each with the page's title, text and arguments. */
export function parseTopic(html: string): Map<string, FunctionDoc> {
    const docs = new Map<string, FunctionDoc>()
    const title = /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(html)
    const parts = sections(html)
    const usage = parts.get("Usage")
    if (usage === undefined) {
        return docs
    }
    const pre = /<pre[^>]*>([\s\S]*?)<\/pre>/.exec(usage)
    const table = argumentTable(parts.get("Arguments") ?? "")
    const description = htmlToText(parts.get("Description") ?? "")
    const value = htmlToText(parts.get("Value") ?? "")
    for (const call of usageCalls(stripTags(pre?.[1] ?? ""))) {
        if (docs.has(call.name)) {
            continue
        }
        const labels = splitArgs(call.args)
            .map((label) => label.replace(/\s+/g, " ").trim())
            .filter((label) => label !== "")
        docs.set(call.name, {
            signature: "(" + labels.join(", ") + ")",
            args: labels.map((label) => {
                const name = label.split("=")[0].trim().replace(/`/g, "")
                return { name, label, doc: table.get(name) ?? null }
            }),
            title: title === null ? null : htmlToText(title[1]) || null,
            description: firstParagraphs(description, 2),
            returns: firstParagraphs(value, 2),
        })
    }
    return docs
}

/** Parses the output of the R script: one HTML fragment per help page. */
export function parseRdHtml(stdout: string): Map<string, FunctionDoc> {
    const docs = new Map<string, FunctionDoc>()
    for (const page of stdout.split(marker)) {
        for (const [name, doc] of parseTopic(page)) {
            if (!docs.has(name)) {
                docs.set(name, doc)
            }
        }
    }
    return docs
}

/** The R script, exposed for tests. */
export const scriptForTest = script

export interface LoadedDocs {
    docs: Map<string, FunctionDoc>
    /** The start of the raw output, to diagnose a format that was not understood. */
    sample: string
}

export async function loadPackageDocs(
    rscript: string,
    libs: string[],
    name: string
): Promise<LoadedDocs> {
    const { stdout } = await run(rscript, ["-e", script, name, ...libs], {
        timeout: 120000,
        maxBuffer: 256 * 1024 * 1024,
    })
    return { docs: parseRdHtml(stdout), sample: stdout.slice(0, 1500) }
}
