import { test } from "node:test"
import { deepStrictEqual } from "node:assert"
import { exportedNames } from "../src/exports"

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
