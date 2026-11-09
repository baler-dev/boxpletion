import { test } from "node:test"
import { deepStrictEqual } from "node:assert"
import { join } from "node:path"
import { findPackageDir, listPackages, packageExports, parseNamespace } from "../src/packages"
import { makeTree } from "./helpers"

test("export directives across lines are combined in order", () => {
    const text = "export(a, b)\nexport(\n    c,\n    d\n)"
    deepStrictEqual(parseNamespace(text), {
        names: ["a", "b", "c", "d"],
        hasPattern: false,
    })
})

test("quoted and backticked names lose their quotes", () => {
    const text = "export(\"%||%\", `my name`, 'q')"
    deepStrictEqual(parseNamespace(text).names, ["%||%", "my name", "q"])
})

test("other directives are not exported names", () => {
    const text = "S3method(print, foo)\nexportClasses(bar)\nexportMethods(baz)\nexport(a)"
    deepStrictEqual(parseNamespace(text).names, ["a"])
})

test("comments are ignored", () => {
    deepStrictEqual(parseNamespace("# export(zzz)\nexport(a) # export(yyy)").names, ["a"])
})

test("a longer name ending in export is not an export directive", () => {
    deepStrictEqual(parseNamespace("my_export(x)\nfoo.export(y)\nexport(a)").names, ["a"])
})

test("exportPattern is flagged because only R can resolve it", () => {
    deepStrictEqual(parseNamespace("exportPattern(\"^[[:alpha:]]+\")"), {
        names: [],
        hasPattern: true,
    })
})

test("duplicate names are listed once", () => {
    deepStrictEqual(parseNamespace("export(a, a)\nexport(a)").names, ["a"])
})

test("listPackages lists installed packages once, sorted, skipping noise", (t) => {
    const first = makeTree(t, {
        "ggplot2/DESCRIPTION": "Package: ggplot2",
        "00LOCK-dplyr/DESCRIPTION": "Package: dplyr",
        "notapkg/readme.txt": "",
        ".hidden/DESCRIPTION": "",
    })
    const second = makeTree(t, {
        "dplyr/DESCRIPTION": "Package: dplyr",
        "ggplot2/DESCRIPTION": "Package: ggplot2",
    })
    deepStrictEqual(
        listPackages([first, second, join(first, "missing")]),
        ["dplyr", "ggplot2"]
    )
})

test("packageExports reads NAMESPACE from the first library with the package", (t) => {
    const first = makeTree(t, { "pkg/DESCRIPTION": "", "pkg/NAMESPACE": "export(a)" })
    const second = makeTree(t, { "pkg/DESCRIPTION": "", "pkg/NAMESPACE": "export(b)" })
    deepStrictEqual(packageExports([first, second], "pkg"), {
        names: ["a"],
        hasPattern: false,
    })
})

test("packageExports gives null for a missing package or a missing NAMESPACE", (t) => {
    const lib = makeTree(t, { "bare/DESCRIPTION": "" })
    deepStrictEqual(packageExports([lib], "missing"), null)
    deepStrictEqual(packageExports([lib], "bare"), null)
})

test("findPackageDir refuses names that could leave the library", (t) => {
    const lib = makeTree(t, { "pkg/DESCRIPTION": "" })
    deepStrictEqual(findPackageDir([lib], ".."), null)
    deepStrictEqual(findPackageDir([lib], "pkg/../pkg"), null)
    deepStrictEqual(findPackageDir([lib], "pkg"), join(lib, "pkg"))
})
