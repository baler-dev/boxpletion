import { test } from "node:test"
import { deepStrictEqual } from "node:assert"
import { exportedNames, moduleExports, topLevelNames } from "../src/exports"

test("a blank line and a comment keep the tag", () => {
    const source = "#' @export\n\n# helper\nf = 1"
    deepStrictEqual(exportedNames(source), ["f"])
})

test("tagged assignments are exported", () => {
    const source = [
        "#' @export",
        "add = function(x, y) {",
        "    x + y",
        "}",
        "",
        "helper = function() NULL",
        "",
        "#' @export",
        "pi_ish <- 3.14",
    ].join("\n")
    deepStrictEqual(exportedNames(source), ["add", "pi_ish"])
})

test("@exportS3Method is not an export tag", () => {
    const source = "#' @exportS3Method\nprint.foo = function(x) x"
    deepStrictEqual(exportedNames(source), [])
})

test("a comparison is not an assignment", () => {
    const source = "#' @export\nx == 1"
    deepStrictEqual(exportedNames(source), [])
})

test("a tag before library() exports nothing", () => {
    const source = "#' @export\nlibrary(x)\ny = 1"
    deepStrictEqual(exportedNames(source), [])
})

test("an indented comment keeps the tag", () => {
    const source = "#' @export\n    # note\nf = 1"
    deepStrictEqual(exportedNames(source), ["f"])
})

test("topLevelNames lists each name once, in order", () => {
    const source = "add = 1\npi_ish <- 3.14\nadd = 2"
    deepStrictEqual(topLevelNames(source), ["add", "pi_ish"])
})

test("topLevelNames skips dot names, indented code and comparisons", () => {
    const source = ".hidden = 1\nf = function() {\n    inner = 2\n}\nx == 1"
    deepStrictEqual(topLevelNames(source), ["f"])
})

test("topLevelNames skips <<- assignments", () => {
    deepStrictEqual(topLevelNames("x <<- 1\ny = 2"), ["y"])
})

test("moduleExports prefers tags", () => {
    deepStrictEqual(moduleExports("#' @export\nadd = 1\nhelper = 2"), ["add"])
})

test("moduleExports falls back without tags", () => {
    deepStrictEqual(moduleExports("a = 1\nb = 2"), ["a", "b"])
})

test("moduleExports falls back when a tag exports nothing", () => {
    deepStrictEqual(moduleExports("#' @export\nlibrary(x)\ny = 1"), ["y"])
})
