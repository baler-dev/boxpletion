import { test, type TestContext } from "node:test"
import { deepStrictEqual } from "node:assert"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { hintsAt, type HintRoots } from "../src/hints"

function makeTree(t: TestContext, files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "boxpletion-"))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    for (const [file, content] of Object.entries(files)) {
        const path = join(root, file)
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, content)
    }
    return root
}

function makeRoots(t: TestContext): HintRoots {
    return {
        balerDir: makeTree(t, {
            "convert/__init__.r": "#' @export\nadd = 1",
            "convert/mass.r": "#' @export\nweigh = 1\nhidden = 2",
            "plain/x.r": "x = 1",
            "other.r": "y = 1",
        }),
        currentDir: makeTree(t, {
            "__init__.r": "#' @export\ntop = 1",
            "local/helper.r": "f = 1\n.g = 2",
        }),
    }
}

test("at the start, the baler modules are offered", (t) => {
    deepStrictEqual(hintsAt("box::use(", makeRoots(t)), [
        { label: "convert", kind: "module" },
        { label: "other", kind: "module" },
        { label: "plain", kind: "folder" },
    ])
})

test("after a slash, the submodules are offered", (t) => {
    deepStrictEqual(hintsAt("box::use(convert/", makeRoots(t)), [
        { label: "mass", kind: "module" },
    ])
})

test("inside brackets, the exported names and the wildcard are offered", (t) => {
    deepStrictEqual(hintsAt("box::use(convert[", makeRoots(t)), [
        { label: "add", kind: "name" },
        { label: "...", kind: "wildcard" },
    ])
})

test("inside brackets of a submodule, only that submodule is read", (t) => {
    deepStrictEqual(hintsAt("box::use(convert/mass[", makeRoots(t)), [
        { label: "weigh", kind: "name" },
        { label: "...", kind: "wildcard" },
    ])
})

test("inside lazy(), the wildcard is not offered", (t) => {
    deepStrictEqual(hintsAt("box::use(lazy(convert[", makeRoots(t)), [
        { label: "add", kind: "name" },
    ])
})

test("a ./ path lists the current folder", (t) => {
    deepStrictEqual(hintsAt("box::use(./", makeRoots(t)), [
        { label: "local", kind: "folder" },
    ])
})

test("a local module without tags offers its non-dot names", (t) => {
    deepStrictEqual(hintsAt("box::use(./local/helper[", makeRoots(t)), [
        { label: "f", kind: "name" },
        { label: "...", kind: "wildcard" },
    ])
})

test("a lone dot means the __init__ file of the current folder", (t) => {
    deepStrictEqual(hintsAt("box::use(.[", makeRoots(t)), [
        { label: "top", kind: "name" },
        { label: "...", kind: "wildcard" },
    ])
})

test("a bare name never looks in the current folder", (t) => {
    deepStrictEqual(hintsAt("box::use(local/", makeRoots(t)), [])
})

test("an unknown module gives nothing", (t) => {
    deepStrictEqual(hintsAt("box::use(missing[", makeRoots(t)), [])
})

test("outside box::use there is nothing to hint", (t) => {
    deepStrictEqual(hintsAt("x = 1", makeRoots(t)), [])
})
