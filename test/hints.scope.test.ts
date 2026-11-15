import { test } from "node:test"
import { deepStrictEqual } from "node:assert"
import { hintsAt, packagesNeeded } from "../src/hints"
import { makeTree } from "./helpers"

function setup(t: Parameters<typeof makeTree>[0]) {
    return {
        balerDir: makeTree(t, {}),
        currentDir: makeTree(t, {
            "strings.r": "#' @export\npad = 1\n#' @export\ntrim = 2",
        }),
    }
}

function labels(hints: { label: string }[]): string[] {
    return hints.map((hint) => hint.label)
}

test("alias$ completes the module exports", (t) => {
    const text = "box::use(./strings)\nstrings$"
    deepStrictEqual(labels(hintsAt(text, setup(t))), ["pad", "trim"])
})

test("attached names and the module alias complete as plain names", (t) => {
    const text = "box::use(./strings[pad], s = ./strings)\npa"
    deepStrictEqual(labels(hintsAt(text, setup(t))), ["pad", "s"])
})

test("a wildcard attaches every export", (t) => {
    const text = "box::use(./strings[...])\ntr"
    deepStrictEqual(labels(hintsAt(text, setup(t))), ["pad", "trim"])
})

test("nothing is offered in comments, strings or unknown owners", (t) => {
    const roots = setup(t)
    deepStrictEqual(hintsAt("box::use(./strings)\n# strings$", roots), [])
    deepStrictEqual(hintsAt("box::use(./strings)\nx = 'strings$", roots), [])
    deepStrictEqual(hintsAt("box::use(./strings)\nother$", roots), [])
    deepStrictEqual(hintsAt("box::use(./strings)\nx$strings$", roots), [])
})

function withPackage(t: Parameters<typeof makeTree>[0]) {
    const libs = makeTree(t, {
        "dplyr/DESCRIPTION": "Package: dplyr",
        "dplyr/NAMESPACE": "export(select)\nexport(filter)\nexport(`%>%`)",
    })
    return { balerDir: makeTree(t, {}), currentDir: makeTree(t, {}), libs: [libs] }
}

test("attached package functions ask for a call, data does not", (t) => {
    const roots = { ...withPackage(t), data: { dplyr: ["starwars"] } }
    deepStrictEqual(hintsAt("box::use(dplyr[select, starwars])\nsel", roots), [
        { label: "select", kind: "function", detail: "dplyr", call: true },
        { label: "starwars", kind: "data", detail: "dplyr" },
    ])
})

test("pkg$ lists exports and datasets, with a call only for functions", (t) => {
    const roots = { ...withPackage(t), data: { dplyr: ["starwars"] } }
    const hints = hintsAt("box::use(dplyr)\ndplyr$", roots)
    deepStrictEqual(
        hints.map((hint) => [hint.label, hint.kind, hint.call === true]),
        [
            ["select", "function", true],
            ["filter", "function", true],
            ["%>%", "function", true],
            ["starwars", "data", false],
        ]
    )
})

test("datasets are offered inside the brackets", (t) => {
    const roots = { ...withPackage(t), data: { dplyr: ["starwars"] } }
    const labels = hintsAt("box::use(dplyr[", roots).map((hint) => hint.label)
    deepStrictEqual(labels, ["select", "filter", "%>%", "starwars", "..."])
})

test("without a data index nothing is guessed to be a function", (t) => {
    const hints = hintsAt("box::use(dplyr)\ndplyr$", withPackage(t))
    deepStrictEqual(hints.map((hint) => hint.kind), ["name", "name", "name"])
})

test("a renamed attached function keeps its call", (t) => {
    const roots = { ...withPackage(t), data: { dplyr: [] } }
    deepStrictEqual(hintsAt("box::use(dplyr[sel = select])\nse", roots), [
        { label: "sel", kind: "function", detail: "dplyr", call: true },
    ])
})

test("local functions ask for a call, local values do not", (t) => {
    const roots = {
        balerDir: makeTree(t, {}),
        currentDir: makeTree(t, { "m.r": "#' @export\nf = function(x) x\n#' @export\nk = 1" }),
    }
    deepStrictEqual(
        hintsAt("box::use(./m)\nm$", roots).map((hint) => [hint.label, hint.kind, hint.call === true]),
        [
            ["f", "function", true],
            ["k", "name", false],
        ]
    )
})
test("only installed packages without a baler module need a data index", (t) => {
    const roots = withPackage(t)
    deepStrictEqual(packagesNeeded("box::use(dplyr, ./m, nope)\nx", roots), ["dplyr"])
    deepStrictEqual(packagesNeeded("box::use(dplyr[", roots), ["dplyr"])
    deepStrictEqual(packagesNeeded("x = 1", roots), [])
})

const barModule = "#' @export\nrun = function() 1\n#' @export\nval = 2"
const fooInit = "#' @export\nbox::use(\n    ./bar\n)\n"

function withFolderModule(t: Parameters<typeof makeTree>[0]) {
    const files = { "foo/__init__.r": fooInit, "foo/bar.r": barModule }
    return { balerDir: makeTree(t, files), currentDir: makeTree(t, files) }
}

function summary(hints: { label: string; kind: string; call?: boolean }[]) {
    return hints.map((hint) => [hint.label, hint.kind, hint.call === true])
}

test("an attached re-exported module is a namespace, not a call", (t) => {
    const hints = hintsAt("box::use(./foo[bar])\nba", withFolderModule(t))
    deepStrictEqual(summary(hints), [["bar", "namespace", false]])
})

test("an attached re-exported module completes its own exports", (t) => {
    const hints = hintsAt("box::use(./foo[bar])\nbar$", withFolderModule(t))
    deepStrictEqual(summary(hints), [
        ["run", "function", true],
        ["val", "name", false],
    ])
})

test("a module reached through a chain completes its exports", (t) => {
    const roots = withFolderModule(t)
    const expected = [
        ["run", "function", true],
        ["val", "name", false],
    ]
    deepStrictEqual(summary(hintsAt("box::use(./foo)\nfoo$bar$", roots)), expected)
    deepStrictEqual(summary(hintsAt("box::use(f = ./foo)\nf$bar$", roots)), expected)
    deepStrictEqual(summary(hintsAt("box::use(./foo)\nfoo$nope$", roots)), [])
})

test("box-bale modules re-export modules the same way", (t) => {
    const roots = withFolderModule(t)
    deepStrictEqual(summary(hintsAt("box::use(foo[bar])\nba", roots)), [["bar", "namespace", false]])
    deepStrictEqual(summary(hintsAt("box::use(foo[bar])\nbar$", roots)), [
        ["run", "function", true],
        ["val", "name", false],
    ])
})

test("the brackets mark a re-exported module as a namespace", (t) => {
    const hints = hintsAt("box::use(./foo[", withFolderModule(t))
    deepStrictEqual(summary(hints), [
        ["bar", "namespace", false],
        ["...", "wildcard", false],
    ])
})

test("a re-exported function keeps its kind from the module that defines it", (t) => {
    const roots = {
        balerDir: makeTree(t, {}),
        currentDir: makeTree(t, {
            "foo/__init__.r": "#' @export\nbox::use(./bar[run, val])",
            "foo/bar.r": barModule,
        }),
    }
    deepStrictEqual(summary(hintsAt("box::use(./foo[run, val])\nr", roots)), [
        ["run", "function", true],
        ["val", "name", false],
    ])
})

test("modules that re-export each other do not loop", (t) => {
    const roots = {
        balerDir: makeTree(t, {}),
        currentDir: makeTree(t, {
            "a.r": "#' @export\nbox::use(./b[x])",
            "b.r": "#' @export\nbox::use(./a[x])",
        }),
    }
    deepStrictEqual(summary(hintsAt("box::use(./a[x])\nx", roots)), [["x", "name", false]])
    deepStrictEqual(hintsAt("box::use(./a[x])\nx$", roots), [])
})

const documented = [
    "#' Add numbers",
    "#'",
    "#' @param x First.",
    "#' @export",
    "add = function(x, y = 2) x + y",
    "#' @export",
    "plain = function() NULL",
    "#' @export",
    "value = 1",
].join("\n")

function docRoots(t: Parameters<typeof makeTree>[0]) {
    return {
        balerDir: makeTree(t, {}),
        currentDir: makeTree(t, {
            "m.r": documented,
            "pkg/__init__.r": "#' @export\nbox::use(./inner[add])\n#' @export\nbox::use(./inner)",
            "pkg/inner.r": documented,
        }),
    }
}

function docOf(hints: { label: string; doc?: { signature: string; title: string | null } }[], label: string) {
    const doc = hints.find((hint) => hint.label === label)?.doc
    return doc === undefined ? undefined : [doc.signature, doc.title]
}

test("module$ hints carry signature and title; values carry none", (t) => {
    const hints = hintsAt("box::use(./m)\nm$", docRoots(t))
    deepStrictEqual(docOf(hints, "add"), ["(x, y = 2)", "Add numbers"])
    deepStrictEqual(docOf(hints, "plain"), ["()", null])
    deepStrictEqual(docOf(hints, "value"), undefined)
})

test("attached names and the bracket list carry docs too", (t) => {
    const roots = docRoots(t)
    deepStrictEqual(docOf(hintsAt("box::use(./m[add])\nad", roots), "add"), ["(x, y = 2)", "Add numbers"])
    deepStrictEqual(docOf(hintsAt("box::use(./m[", roots), "add"), ["(x, y = 2)", "Add numbers"])
})

test("docs follow a re-exported function and are absent for a re-exported module", (t) => {
    const hints = hintsAt("box::use(./pkg)\npkg$", docRoots(t))
    deepStrictEqual(docOf(hints, "add"), ["(x, y = 2)", "Add numbers"])
    deepStrictEqual(docOf(hints, "inner"), undefined)
})
