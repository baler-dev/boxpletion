import { test } from "node:test"
import { deepStrictEqual, strictEqual } from "node:assert"
import { findCall } from "../src/calls"

test("the callee and the count of commas before the cursor", () => {
    deepStrictEqual(findCall("add("), { callee: "add", commas: 0, argName: null })
    deepStrictEqual(findCall("x = add(1, "), { callee: "add", commas: 1, argName: null })
    deepStrictEqual(findCall("add(1, 2, 3"), { callee: "add", commas: 2, argName: null })
})

test("nested calls, brackets and strings do not count as commas of the outer call", () => {
    deepStrictEqual(findCall("add(c(1, 2), "), { callee: "add", commas: 1, argName: null })
    deepStrictEqual(findCall("add(x[1, 2], 'a,b', "), { callee: "add", commas: 2, argName: null })
    deepStrictEqual(findCall("add(sub(1, 2"), { callee: "sub", commas: 1, argName: null })
})

test("a named argument is reported", () => {
    deepStrictEqual(findCall("add(1, y = "), { callee: "add", commas: 1, argName: "y" })
    deepStrictEqual(findCall("add(y == "), { callee: "add", commas: 0, argName: null })
})

test("a member callee is kept whole", () => {
    strictEqual(findCall("mod$add(")?.callee, "mod$add")
    strictEqual(findCall("a$b$f(1,")?.callee, "a$b$f")
})

test("there is no call after it closes, in a block, in a grouping, or for a qualified name", () => {
    strictEqual(findCall("add(1)"), null)
    strictEqual(findCall("add({ x"), null)
    strictEqual(findCall("add(x["), null)
    strictEqual(findCall("y = (1 + "), null)
    strictEqual(findCall("pkg::add("), null)
    strictEqual(findCall("box::use("), null)
})

test("comments and strings are skipped", () => {
    deepStrictEqual(findCall("add(1, # a, b\n 2, "), { callee: "add", commas: 2, argName: null })
    deepStrictEqual(findCall("add(')', "), { callee: "add", commas: 1, argName: null })
})
