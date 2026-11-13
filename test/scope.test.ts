import { test } from "node:test"
import { deepStrictEqual } from "node:assert"
import { moduleBinding, moduleReexports, moduleWildcards, scanUseCalls } from "../src/scope"

function bound(text: string): (string | null)[] {
    return scanUseCalls(text).imports.map(moduleBinding)
}

test("a plain package binds its own name", () => {
    deepStrictEqual(bound("box::use(forecast, ggplot2)"), ["forecast", "ggplot2"])
})

test("attaching names does not bind the module", () => {
    const scan = scanUseCalls("box::use(ggplot2[ggplot, p = aes])")
    deepStrictEqual(scan.imports[0].attached, [
        { name: "ggplot", source: "ggplot" },
        { name: "p", source: "aes" },
    ])
    deepStrictEqual(bound("box::use(ggplot2[ggplot])"), [null])
})

test("an alias binds the module even when names are attached", () => {
    deepStrictEqual(bound("box::use(g = ggplot2[ggplot])"), ["g"])
})

test("a path binds its last segment, and lazy is unwrapped", () => {
    deepStrictEqual(bound("box::use(./utils/strings, lazy(dplyr))"), ["strings", "dplyr"])
})

test("comments and strings do not confuse the scan", () => {
    const text = "# box::use(fake)\nx = 'box::use(nope)'\nbox::use(a, # b)\n    c)\n"
    deepStrictEqual(bound(text), ["a", "c"])
})

test("an unclosed call is reported as open", () => {
    deepStrictEqual(scanUseCalls("box::use(a,\n").open, true)
})

test("moduleReexports lists tagged modules and attached names only", () => {
    const source = [
        "#' @export",
        "box::use(",
        "    ./bar,",
        "    ./baz[run, go = start],",
        ")",
        "box::use(./hidden)",
    ].join("\n")
    deepStrictEqual([...moduleReexports(source).values()], [
        { name: "bar", segments: [".", "bar"], source: null },
        { name: "run", segments: [".", "baz"], source: "run" },
        { name: "go", segments: [".", "baz"], source: "start" },
    ])
})

test("moduleWildcards lists only the tagged modules that are re-exported whole", () => {
    const source = [
        "#' @export",
        "box::use(./a[...], ./b[run, ...])",
        "box::use(./hidden[...])",
        "#' @export",
        "box::use(./c[one])",
    ].join("\n")
    deepStrictEqual(moduleWildcards(source), [[".", "a"], [".", "b"]])
})
