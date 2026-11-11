import { test } from "node:test"
import { deepStrictEqual } from "node:assert"
import { exportedNames, moduleExports, topLevelNames, functionNames } from "../src/exports"

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

test("box::export names win over tags", () => {
    const source = "box::export(a, b)\n#' @export\nc = 1\na = 1\nb = 2"
    deepStrictEqual(moduleExports(source), ["a", "b"])
})

test("an empty box::export() means no exports", () => {
    deepStrictEqual(moduleExports("box::export()\na = 1"), [])
})

test("several box::export calls are combined", () => {
    deepStrictEqual(moduleExports("box::export(a)\nbox::export(b)\na = 1"), ["a", "b"])
})

test("a commented-out box::export is ignored", () => {
    deepStrictEqual(moduleExports("# box::export(a)\nb = 1"), ["b"])
})

test("backticked names lose their backticks", () => {
    deepStrictEqual(moduleExports("box::export(`my name`)\n`my name` = 1"), ["my name"])
})

test("a tagged box::use re-exports attached names and module names", () => {
    const source = [
        "#' @export",
        "box::use(",
        "    ./root_find[brentq],",
        "    ./quad[quad],",
        "    ./spline,",
        ")",
    ].join("\n")
    deepStrictEqual(moduleExports(source), ["brentq", "quad", "spline"])
})

test("an explicit alias exports the alias as well as the attached names", () => {
    const source = "#' @export\nbox::use(cv = ./quad[quad])"
    deepStrictEqual(moduleExports(source), ["quad", "cv"])
})

test("an alias inside the attach list is the exported name", () => {
    const source = "#' @export\nbox::use(./a[x = y, z])"
    deepStrictEqual(moduleExports(source), ["x", "z"])
})

test("names from an untagged box::use are not exported", () => {
    deepStrictEqual(moduleExports("box::use(./a[x])\nf = 1"), ["f"])
})

test("the wildcard is skipped but other names are kept", () => {
    deepStrictEqual(moduleExports("#' @export\nbox::use(./a[x, ...])"), ["x"])
})

test("comments and trailing commas inside a tagged box::use are ignored", () => {
    const source = "#' @export\nbox::use(\n    ./a[x], # note (with paren\n    ./b,\n)"
    deepStrictEqual(moduleExports(source), ["x", "b"])
})

test("tagged assignments and tagged box::use keep source order", () => {
    const source = "#' @export\nf = 1\n#' @export\nbox::use(./a[x])"
    deepStrictEqual(moduleExports(source), ["f", "x"])
})

test("functionNames finds top-level function assignments only", () => {
    const source = [
        "add = function(x, y) x + y",
        "lam <- \\(x) x",
        "value = 1",
        "alias = add",
        "f = function() {",
        "    inner = function() NULL",
        "}",
    ].join("\n")
    deepStrictEqual([...functionNames(source)], ["add", "lam", "f"])
})
