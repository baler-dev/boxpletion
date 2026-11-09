import { test } from "node:test"
import { deepStrictEqual } from "node:assert"
import { findHintContext, type HintContext } from "../src/context"

function moduleAt(segments: string[], typed: string, lazy = false): HintContext {
    return { kind: "module", segments, typed, lazy }
}

function namesAt(segments: string[], typed: string, lazy = false): HintContext {
    return { kind: "names", segments, typed, lazy }
}

test("right after the opening parenthesis, a module is expected", () => {
    deepStrictEqual(findHintContext("box::use("), moduleAt([], ""))
})

test("a partly typed module name", () => {
    deepStrictEqual(findHintContext("box::use(conv"), moduleAt([], "conv"))
})

test("after a slash, the earlier segments are the prefix", () => {
    deepStrictEqual(findHintContext("box::use(convert/"), moduleAt(["convert"], ""))
})

test("after a slash with a partly typed submodule", () => {
    deepStrictEqual(findHintContext("box::use(convert/ma"), moduleAt(["convert"], "ma"))
})

test("a local path keeps the dot segments", () => {
    deepStrictEqual(findHintContext("box::use(./local/"), moduleAt([".", "local"], ""))
})

test("an alias is ignored", () => {
    deepStrictEqual(findHintContext("box::use(cv = conv"), moduleAt([], "conv"))
})

test("an open bracket asks for names of the module before it", () => {
    deepStrictEqual(findHintContext("box::use(convert["), namesAt(["convert"], ""))
})

test("names of the innermost submodule, with an alias", () => {
    deepStrictEqual(
        findHintContext("box::use(cv = convert/mass["),
        namesAt(["convert", "mass"], "")
    )
})

test("a comma inside brackets separates names, not declarations", () => {
    deepStrictEqual(findHintContext("box::use(convert[ab, c"), namesAt(["convert"], "c"))
})

test("a comma between declarations starts a new module", () => {
    deepStrictEqual(findHintContext("box::use(a, b/"), moduleAt(["b"], ""))
})

test("a comma inside brackets of an earlier declaration is not a separator", () => {
    deepStrictEqual(findHintContext("box::use(a[x, y], c"), moduleAt([], "c"))
})

test("lazy() is recognized", () => {
    deepStrictEqual(findHintContext("box::use(lazy(pkg["), namesAt(["pkg"], "", true))
})

test("outside a box::use call there is nothing to hint", () => {
    deepStrictEqual(findHintContext("x = 1"), null)
})

test("after the call has closed there is nothing to hint", () => {
    deepStrictEqual(findHintContext("box::use(a)\nf = 1"), null)
})

test("a parenthesis inside a comment does not confuse the scan", () => {
    deepStrictEqual(findHintContext("box::use(a, # (note\n    b/"), moduleAt(["b"], ""))
})

test("the cursor inside a comment gives nothing", () => {
    deepStrictEqual(findHintContext("box::use(a, # still typing"), null)
})

test("after a closed bracket there is nothing to hint", () => {
    deepStrictEqual(findHintContext("box::use(a[x]"), null)
})

test("after a closed lazy() there is nothing to hint", () => {
    deepStrictEqual(findHintContext("box::use(lazy(pkg)"), null)
})
