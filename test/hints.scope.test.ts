import { test } from "node:test"
import { deepStrictEqual } from "node:assert"
import { hintsAt } from "../src/hints"
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
