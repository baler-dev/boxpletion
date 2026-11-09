import { test } from "node:test"
import { deepStrictEqual } from "node:assert"
import { join } from "node:path"
import { moduleCandidates } from "../src/resolve"

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
