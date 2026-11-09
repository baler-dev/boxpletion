import { test, type TestContext } from "node:test"
import { deepStrictEqual } from "node:assert"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { findModuleFile, listModules, moduleCandidates } from "../src/resolve"

function makeTree(t: TestContext, files: string[]): string {
    const root = mkdtempSync(join(tmpdir(), "boxpletion-"))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    for (const file of files) {
        const path = join(root, file)
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, "")
    }
    return root
}

test("a submodule path gives file candidates, then folder candidates", () => {
    deepStrictEqual(moduleCandidates("modules", ["convert", "mass"]), [
        join("modules", "convert", "mass.r"),
        join("modules", "convert", "mass.R"),
        join("modules", "convert", "mass", "__init__.r"),
        join("modules", "convert", "mass", "__init__.R"),
    ])
})

test("a single name gives the same four candidates", () => {
    deepStrictEqual(moduleCandidates("modules", ["convert"]), [
        join("modules", "convert.r"),
        join("modules", "convert.R"),
        join("modules", "convert", "__init__.r"),
        join("modules", "convert", "__init__.R"),
    ])
})

test("a file wins over a folder with the same name", (t) => {
    const root = makeTree(t, ["convert.r", "convert/__init__.r"])
    deepStrictEqual(findModuleFile([root], ["convert"]), join(root, "convert.r"))
})

test("a folder module is found through its __init__ file", (t) => {
    const root = makeTree(t, ["convert/__init__.R"])
    const found = findModuleFile([root], ["convert"])
    // Windows file systems ignore letter case, so compare without it
    deepStrictEqual(
        found?.toLowerCase(),
        join(root, "convert", "__init__.R").toLowerCase()
    )
})

test("the first base folder with a hit wins", (t) => {
    const first = makeTree(t, ["convert.r"])
    const second = makeTree(t, ["convert.r"])
    deepStrictEqual(
        findModuleFile([first, second], ["convert"]),
        join(first, "convert.r")
    )
})

test("a missing module gives null", (t) => {
    const root = makeTree(t, ["other.r"])
    deepStrictEqual(findModuleFile([root], ["convert"]), null)
})

test("listModules lists modules and folders, skipping noise", (t) => {
    const root = makeTree(t, [
        "a.r",
        "b.R",
        "c/__init__.r",
        "plain/x.r",
        "__init__.r",
        ".hidden/y.r",
        "notes.txt",
    ])
    deepStrictEqual(listModules(root), [
        { name: "a", kind: "module" },
        { name: "b", kind: "module" },
        { name: "c", kind: "module" },
        { name: "plain", kind: "folder" },
    ])
})

test("listModules lists a name once when a file and a folder share it", (t) => {
    const root = makeTree(t, ["convert.r", "convert/__init__.r"])
    deepStrictEqual(listModules(root), [{ name: "convert", kind: "module" }])
})

test("listModules gives an empty list for a missing folder", () => {
    deepStrictEqual(listModules(join(tmpdir(), "boxpletion-does-not-exist")), [])
})

test("listModules skips dist-info metadata folders", (t) => {
    const root = makeTree(t, ["rcalc/__init__.r", "rcalc-0.1.0.dist-info/METADATA"])
    deepStrictEqual(listModules(root), [{ name: "rcalc", kind: "module" }])
})
