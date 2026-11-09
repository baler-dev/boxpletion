import { test } from "node:test"
import { deepStrictEqual } from "node:assert"
import { hintsAt } from "../src/hints"
import { makeTree } from "./helpers"

test("a bare name lists installed packages", (t) => {
    const lib = makeTree(t, {
        "ggplot2/DESCRIPTION": "",
        "dplyr/DESCRIPTION": "",
    })
    const empty = makeTree(t, {})
    const hints = hintsAt("box::use(", {
        currentDir: empty,
        balerDir: empty,
        libs: [lib],
    })
    deepStrictEqual(hints.map((hint) => hint.label), ["dplyr", "ggplot2"])
})

test("a single name falls back to an installed package", (t) => {
    const lib = makeTree(t, {
        "pkg/DESCRIPTION": "",
        "pkg/NAMESPACE": "export(a, b)",
    })
    const empty = makeTree(t, {})
    const hints = hintsAt("box::use(pkg[", {
        currentDir: empty,
        balerDir: empty,
        libs: [lib],
    })
    deepStrictEqual(hints.map((hint) => hint.label), ["a", "b", "..."])
})

test("local paths never fall back to packages", (t) => {
    const lib = makeTree(t, {
        "pkg/DESCRIPTION": "",
        "pkg/NAMESPACE": "export(a)",
    })
    const empty = makeTree(t, {})
    deepStrictEqual(
        hintsAt("box::use(./pkg[", { currentDir: empty, balerDir: empty, libs: [lib] }),
        []
    )
})
