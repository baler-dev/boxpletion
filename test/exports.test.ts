import { test } from "node:test"
import { deepStrictEqual } from "node:assert"
import { exportedNames } from "../src/exports"

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
