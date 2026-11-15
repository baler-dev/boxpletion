import { test } from "node:test"
import { deepStrictEqual, strictEqual } from "node:assert"
import { hintsAt, signatureAt, type Hint } from "../src/hints"
import { makeTree } from "./helpers"

const base = [
    "#' Add one",
    "#'",
    "#' @param x A number.",
    "#' @export",
    "alpha = function(x) x + 1",
    "",
    "#' @export",
    "beta = function(y) y * 2",
].join("\n")

function roots(t: Parameters<typeof makeTree>[0], files: Record<string, string> = {}) {
    return {
        balerDir: makeTree(t, {}),
        currentDir: makeTree(t, {
            "a.r": base,
            "b.r": "#' @export\nbox::use(./a[...])",
            "c.r": "#' @export\nbox::use(./a[...])\n\n#' @export\nown = function() 1",
            ...files,
        }),
    }
}

function summary(hints: Hint[]): [string, string, boolean][] {
    return hints.map((hint) => [hint.label, hint.kind, hint.call === true])
}

test("a module that only re-exports another with a wildcard exposes its names", (t) => {
    deepStrictEqual(summary(hintsAt("box::use(./b)\nb$", roots(t))), [
        ["alpha", "function", true],
        ["beta", "function", true],
    ])
})

test("a wildcard re-export comes after the names the module defines", (t) => {
    deepStrictEqual(summary(hintsAt("box::use(./c)\nc$", roots(t))), [
        ["own", "function", true],
        ["alpha", "function", true],
        ["beta", "function", true],
    ])
})

test("the re-exported names are attached by a wildcard and listed in the brackets", (t) => {
    const all = roots(t)
    deepStrictEqual(
        hintsAt("box::use(./c[...])\nal", all).map((hint) => hint.label),
        ["own", "alpha", "beta"]
    )
    deepStrictEqual(
        hintsAt("box::use(./c[", all).map((hint) => hint.label),
        ["own", "alpha", "beta", "..."]
    )
})

test("docs and signatures come from the module that defines the function", (t) => {
    const info = signatureAt("box::use(./c)\nc$alpha(", roots(t))
    strictEqual(info?.label, "alpha(x)")
    strictEqual(info?.documentation?.includes("Add one"), true)
    strictEqual(info?.documentation?.includes("A number."), true)
})

test("a wildcard re-exports a module that the other module re-exports", (t) => {
    const all = roots(t, {
        "a.r": base + "\n\n#' @export\nbox::use(./sub)",
        "sub.r": "#' @export\ndeep = function() 1",
    })
    deepStrictEqual(summary(hintsAt("box::use(./c)\nc$sub$", all)), [["deep", "function", true]])
    deepStrictEqual(summary(hintsAt("box::use(./c[sub])\nsub", all)), [["sub", "namespace", false]])
})

test("a name the module defines hides the same name from the wildcard", (t) => {
    const all = roots(t, { "c.r": "#' @export\nbox::use(./a[...])\n\n#' @export\nalpha = 1" })
    deepStrictEqual(summary(hintsAt("box::use(./c)\nc$", all)), [
        ["alpha", "name", false],
        ["beta", "function", true],
    ])
})

test("the wildcard imported last wins for a shared name", (t) => {
    const all = roots(t, {
        "a2.r": "#' @export\nalpha = 1",
        "c.r": "#' @export\nbox::use(./a[...])\n#' @export\nbox::use(./a2[...])",
    })
    deepStrictEqual(summary(hintsAt("box::use(./c)\nc$", all)), [
        ["alpha", "name", false],
        ["beta", "function", true],
    ])
})

test("only tagged wildcards count, and only when exports come from tags", (t) => {
    const all = roots(t, {
        "plain.r": "box::use(./a[...])\n\nown = function() 1",
        "declared.r": "#' @export\nbox::use(./a[...])\n\nbox::export(own)\nown = function() 1",
        "mixed.r": "#' @export\nbox::use(./a[...])\n\nhelper = function() 1",
    })
    deepStrictEqual(summary(hintsAt("box::use(./plain)\nplain$", all)), [["own", "function", true]])
    deepStrictEqual(summary(hintsAt("box::use(./declared)\ndeclared$", all)), [["own", "function", true]])
    deepStrictEqual(summary(hintsAt("box::use(./mixed)\nmixed$", all)), [
        ["alpha", "function", true],
        ["beta", "function", true],
    ])
})

test("modules that re-export each other with wildcards do not loop", (t) => {
    const all = roots(t, {
        "x.r": "#' @export\nbox::use(./y[...])\n#' @export\nfromx = 1",
        "y.r": "#' @export\nbox::use(./x[...])\n#' @export\nfromy = 1",
    })
    deepStrictEqual(summary(hintsAt("box::use(./x)\nx$", all)), [
        ["fromx", "name", false],
        ["fromy", "name", false],
    ])
})
