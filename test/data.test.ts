import { test } from "node:test"
import { deepStrictEqual } from "node:assert"
import { parseDataList } from "../src/data"

test("dataset names are listed once, without their group", () => {
    const stdout = "starwars\nstorms\nbeaver1 (beavers)\nbeaver2 (beavers)\nstarwars\n\n"
    deepStrictEqual(parseDataList(stdout), ["starwars", "storms", "beaver1", "beaver2"])
})

test("empty output means no datasets", () => {
    deepStrictEqual(parseDataList(""), [])
})
