import { test } from "node:test"
import { deepStrictEqual, strictEqual } from "node:assert"
import { hintsAt, signatureAt } from "../src/hints"
import { makeTree } from "./helpers"

const moduleSource = [
    "#' Add numbers",
    "#'",
    "#' Sums the inputs.",
    "#'",
    "#' @param x First.",
    "#' @param y Second.",
    "#' @export",
    "add = function(x, y = 2, ...) x + y",
    "#' @export",
    "value = 1",
].join("\n")

function roots(t: Parameters<typeof makeTree>[0]) {
    return {
        balerDir: makeTree(t, {}),
        currentDir: makeTree(t, {
            "m.r": moduleSource,
            "pkg/__init__.r": "#' @export\nbox::use(./m)",
            "pkg/m.r": moduleSource,
        }),
    }
}

test("an attached function shows its signature, summary and parameters", (t) => {
    const info = signatureAt("box::use(./m[add])\nadd(", roots(t))
    strictEqual(info?.label, "add(x, y = 2, ...)")
    strictEqual(
        info?.documentation,
        "**Add numbers**\n\nSums the inputs.\n\n**Arguments**\n\n- `x`: First.\n- `y`: Second."
    )
    deepStrictEqual(info?.parameters, [
        { label: "x", range: [4, 5], documentation: "First." },
        { label: "y = 2", range: [7, 12], documentation: "Second." },
        { label: "...", range: [14, 17], documentation: null },
    ])
    strictEqual(info?.active, 0)
})

test("the active parameter follows commas and names", (t) => {
    const r = roots(t)
    const head = "box::use(./m[add])\n"
    strictEqual(signatureAt(head + "add(1, ", r)?.active, 1)
    strictEqual(signatureAt(head + "add(y = ", r)?.active, 1)
    strictEqual(signatureAt(head + "add(c(1, 2), ", r)?.active, 1)
    strictEqual(signatureAt(head + "add(1, 2, 3, 4, ", r)?.active, 2)
})

test("module$function and chains resolve too", (t) => {
    const r = roots(t)
    strictEqual(signatureAt("box::use(./m)\nm$add(", r)?.label, "add(x, y = 2, ...)")
    strictEqual(signatureAt("box::use(./pkg)\npkg$m$add(1,", r)?.active, 1)
})

test("an alias keeps the function's own name out of the label", (t) => {
    const info = signatureAt("box::use(./m[plus = add])\nplus(", roots(t))
    strictEqual(info?.label, "plus(x, y = 2, ...)")
})

test("nothing is shown for values, unknown names, comments or box::use itself", (t) => {
    const r = roots(t)
    strictEqual(signatureAt("box::use(./m[value])\nvalue(", r), null)
    strictEqual(signatureAt("box::use(./m[add])\nother(", r), null)
    strictEqual(signatureAt("box::use(./m[add])\n# add(", r), null)
    strictEqual(signatureAt("box::use(./m[add])\nx = 'add(", r), null)
    strictEqual(signatureAt("box::use(./m[add,", r), null)
})

test("parameter ranges point at the argument, not at a lookalike in the name", (t) => {
    const r = {
        balerDir: makeTree(t, {}),
        currentDir: makeTree(t, { "n.r": "#' @export\nmax2 = function(x, max = 1) x" }),
    }
    const info = signatureAt("box::use(./n[max2])\nmax2(", r)
    strictEqual(info?.label, "max2(x, max = 1)")
    const [first, second] = info?.parameters ?? []
    strictEqual(info?.label.slice(...first.range), "x")
    strictEqual(info?.label.slice(...second.range), "max = 1")
})

function withPackageDocs(t: Parameters<typeof makeTree>[0]) {
    const libs = makeTree(t, {
        "forecast/DESCRIPTION": "Package: forecast",
        "forecast/NAMESPACE": "export(auto.arima)\nexport(ets)",
    })
    const docs = new Map([
        [
            "auto.arima",
            {
                signature: "(y, d = NA)",
                args: [
                    { name: "y", label: "y", doc: "A univariate time series." },
                    { name: "d", label: "d = NA", doc: null },
                ],
                title: "Fit best ARIMA model",
                description: "Returns the best ARIMA model.",
                returns: null,
            },
        ],
    ])
    return {
        balerDir: makeTree(t, {}),
        currentDir: makeTree(t, {}),
        libs: [libs],
        data: { forecast: [] },
        packageDocs: { forecast: docs },
    }
}

test("an attached package function shows its signature from the help pages", (t) => {
    const roots = withPackageDocs(t)
    const info = signatureAt("box::use(forecast[auto.arima])\nauto.arima(", roots)
    strictEqual(info?.label, "auto.arima(y, d = NA)")
    strictEqual(info?.active, 0)
    strictEqual(signatureAt("box::use(forecast[auto.arima])\nauto.arima(1, ", roots)?.active, 1)
    strictEqual(signatureAt("box::use(forecast)\nforecast$auto.arima(", roots)?.label, "auto.arima(y, d = NA)")
})

test("package functions without loaded docs show nothing, and with docs the hints carry them", (t) => {
    const roots = withPackageDocs(t)
    const without = { ...roots, packageDocs: undefined }
    strictEqual(signatureAt("box::use(forecast[auto.arima])\nauto.arima(", without), null)
    const hints = hintsAt("box::use(forecast)\nforecast$", roots)
    deepStrictEqual(hints.map((hint) => [hint.label, hint.doc?.signature ?? null]), [
        ["auto.arima", "(y, d = NA)"],
        ["ets", null],
    ])
})

test("inside a call, the argument names that are not given yet are offered", (t) => {
    const r = roots(t)
    const head = "box::use(./m[add])\n"
    const labels = (text: string) =>
        hintsAt(head + text, r)
            .filter((hint) => hint.kind === "argument")
            .map((hint) => hint.label)
    deepStrictEqual(labels("add("), ["x", "y"])
    deepStrictEqual(labels("add(1, "), ["x", "y"])
    deepStrictEqual(labels("add(x = 1, "), ["y"])
    deepStrictEqual(labels("add(x = 1, y"), ["y"])
})

test("argument hints carry the declaration, the description and the order", (t) => {
    const hints = hintsAt("box::use(./m[add])\nadd(", roots(t)).filter((hint) => hint.kind === "argument")
    deepStrictEqual(hints, [
        { label: "x", kind: "argument", detail: "x", order: 0, documentation: "First." },
        { label: "y", kind: "argument", detail: "y = 2", order: 1, documentation: "Second." },
    ])
})

test("argument names work through aliases and packages, and not after a value or in strings", (t) => {
    const r = roots(t)
    const labels = (text: string) =>
        hintsAt(text, r)
            .filter((hint) => hint.kind === "argument")
            .map((hint) => hint.label)
    deepStrictEqual(labels("box::use(m = ./m)\nm$add("), ["x", "y"])
    deepStrictEqual(labels("box::use(./pkg)\npkg$m$add("), ["x", "y"])
    deepStrictEqual(labels("box::use(./m[add])\nadd(x = "), [])
    deepStrictEqual(labels("box::use(./m[add])\nadd(1 + "), [])
    deepStrictEqual(labels("box::use(./m[add])\nx = 'add("), [])
    deepStrictEqual(labels("box::use(./m[value])\nvalue("), [])
    const pkg = withPackageDocs(t)
    deepStrictEqual(
        hintsAt("box::use(fc = forecast)\nfc$auto.arima(", pkg)
            .filter((hint) => hint.kind === "argument")
            .map((hint) => hint.label),
        ["y", "d"]
    )
})
