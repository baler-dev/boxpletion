import { test } from "node:test"
import { deepStrictEqual, strictEqual } from "node:assert"
import { findCall } from "../src/calls"

function site(text: string) {
    const call = findCall(text)
    return call === null ? null : { callee: call.callee, commas: call.commas, argName: call.argName }
}

test("the callee and the count of commas before the cursor", () => {
    deepStrictEqual(site("add("), { callee: "add", commas: 0, argName: null })
    deepStrictEqual(site("x = add(1, "), { callee: "add", commas: 1, argName: null })
    deepStrictEqual(site("add(1, 2, 3"), { callee: "add", commas: 2, argName: null })
})

test("nested calls, brackets and strings do not count as commas of the outer call", () => {
    deepStrictEqual(site("add(c(1, 2), "), { callee: "add", commas: 1, argName: null })
    deepStrictEqual(site("add(x[1, 2], 'a,b', "), { callee: "add", commas: 2, argName: null })
    deepStrictEqual(site("add(sub(1, 2"), { callee: "sub", commas: 1, argName: null })
})

test("a named argument is reported", () => {
    deepStrictEqual(site("add(1, y = "), { callee: "add", commas: 1, argName: "y" })
    deepStrictEqual(site("add(y == "), { callee: "add", commas: 0, argName: null })
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
    deepStrictEqual(site("add(1, # a, b\n 2, "), { callee: "add", commas: 2, argName: null })
    deepStrictEqual(site("add(')', "), { callee: "add", commas: 1, argName: null })
})

test("the current argument and the names already given are reported", () => {
    const call = findCall("add(x = 1, y, z = ")
    strictEqual(call?.current, "z = ")
    deepStrictEqual(call?.usedNames, ["x"])
    strictEqual(findCall("add(1, de")?.current, "de")
    strictEqual(findCall("add(")?.current, "")
    deepStrictEqual(findCall("add(a = 1, `b c` = 2, ")?.usedNames, ["a", "b c"])
})
