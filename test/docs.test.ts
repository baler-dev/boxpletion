import { test } from "node:test"
import { deepStrictEqual, strictEqual } from "node:assert"
import { docMarkdown, moduleDocs, summaryMarkdown } from "../src/docs"

const source = [
    "#' Add numbers",
    "#'",
    "#' Adds `x` and `y`",
    "#' together.",
    "#'",
    "#' @param x The first number.",
    "#'   It may be a vector.",
    "#' @param y,z Others.",
    "#' @return The sum.",
    "#' @export",
    "add = function(x, y = c(1, 2), ...) {",
    "    x + y",
    "}",
    "",
    "plain = function() NULL",
    "",
    "#' @export",
    "multi <- function(",
    "    a, # first",
    "    b = 'x,y'",
    ") a",
    "",
    "lam = \\(v) v",
    "later = add",
    "value = 1",
].join("\n")

test("a signature keeps defaults, nested calls and strings intact", () => {
    const docs = moduleDocs(source)
    strictEqual(docs.get("add")?.signature, "(x, y = c(1, 2), ...)")
    strictEqual(docs.get("plain")?.signature, "()")
    strictEqual(docs.get("multi")?.signature, "(a, b = 'x,y')")
    strictEqual(docs.get("lam")?.signature, "(v)")
})

test("roxygen gives the title, description, params and return", () => {
    const add = moduleDocs(source).get("add")
    strictEqual(add?.title, "Add numbers")
    strictEqual(add?.description, "Adds `x` and `y` together.")
    strictEqual(add?.returns, "The sum.")
    deepStrictEqual(
        add?.args.map((arg) => [arg.name, arg.doc]),
        [
            ["x", "The first number. It may be a vector."],
            ["y", "Others."],
            ["...", null],
        ]
    )
})

test("a function without roxygen still has a signature", () => {
    const plain = moduleDocs(source).get("plain")
    strictEqual(plain?.title, null)
    deepStrictEqual(plain?.args, [])
})

test("only the block directly above counts, and values are not functions", () => {
    const docs = moduleDocs(source)
    strictEqual(docs.get("multi")?.title, null)
    strictEqual(docs.has("value"), false)
})

test("an alias of a documented function shares its docs", () => {
    strictEqual(moduleDocs(source).get("later")?.title, "Add numbers")
})

test("@title and @description override the first paragraphs", () => {
    const docs = moduleDocs("#' Ignored\n#' @title Real title\n#' @description Real text\nf = function() 1")
    strictEqual(docs.get("f")?.title, "Real title")
    strictEqual(docs.get("f")?.description, "Real text")
})

test("windows line endings parse the same", () => {
    const docs = moduleDocs(source.replace(/\n/g, "\r\n"))
    strictEqual(docs.get("add")?.signature, "(x, y = c(1, 2), ...)")
    strictEqual(docs.get("multi")?.signature, "(a, b = 'x,y')")
})

test("markdown lists the described arguments only", () => {
    const add = moduleDocs(source).get("add")
    const markdown = docMarkdown(add!)
    strictEqual(markdown?.includes("- `y`: Others."), true)
    strictEqual(markdown?.includes("`...`"), false)
    strictEqual(summaryMarkdown(add!), "**Add numbers**\n\nAdds `x` and `y` together.")
    strictEqual(docMarkdown(moduleDocs(source).get("plain")!), null)
})
