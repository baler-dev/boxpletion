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
    deepStrictEqual(hintsAt("box::use(./m)\nm$", roots), [
        { label: "f", kind: "function", detail: "./m", call: true },
        { label: "k", kind: "name", detail: "./m" },
    ])
})

test("only installed packages without a baler module need a data index", (t) => {
    const roots = withPackage(t)
    deepStrictEqual(packagesNeeded("box::use(dplyr, ./m, nope)\nx", roots), ["dplyr"])
    deepStrictEqual(packagesNeeded("box::use(dplyr[", roots), ["dplyr"])
    deepStrictEqual(packagesNeeded("x = 1", roots), [])
})
