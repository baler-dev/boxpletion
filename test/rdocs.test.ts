import { test } from "node:test"
import { deepStrictEqual, strictEqual } from "node:assert"
import { htmlToText, parseRdHtml, parseTopic, scriptForTest } from "../src/rdocs"

const sd = `<h2 id='sd'>Standard Deviation</h2>

<h3>Description</h3>

<p>This function computes the standard deviation of the values in
<code>x</code>.
If <code>na.rm</code> is <code>TRUE</code> then missing values are removed.
</p>

<p>Second paragraph, with an <span class="rlang"><b>R</b></span> object &amp; more.</p>

<h3>Usage</h3>

<pre><code class='language-R'>sd(x, na.rm = FALSE)
</code></pre>

<h3>Arguments</h3>

<table role = "presentation">
<tr>
 <td><code id="sd_:_x">x</code></td>
<td>
<p>a numeric vector or an <span class="rlang"><b>R</b></span> object.</p>
</td></tr>
<tr>
 <td><code id="sd_:_na.rm">na.rm</code></td>
<td>
<p>logical. Should missing values be removed?</p>
</td></tr>
</table>

<h3>Details</h3>

<p>Not shown.</p>

<h3>Value</h3>

<p>The standard deviation.</p>
`

const several = `<h2 id='mutate'>Create, modify, and delete columns</h2>
<h3>Description</h3>
<p>Mutate adds columns.</p>
<h3>Usage</h3>
<pre><code class='language-R'>mutate(.data, ...)

## S3 method for class 'data.frame'
mutate(.data, ..., .by = NULL, .keep = c("all", "used", "unused", "none"))

transmute(.data, ...)
</code></pre>
<h3>Arguments</h3>
<table>
<tr valign="top"><td><code>.data</code></td>
<td><p>A data frame.</p></td></tr>
<tr valign="top"><td><code>...</code></td>
<td><p>Name-value pairs.</p></td></tr>
<tr valign="top"><td><code>.by, .keep</code></td>
<td><p>Grouping and keeping.</p></td></tr>
</table>
`

test("a help page gives the signature, title, description, arguments and value", () => {
    const doc = parseTopic(sd).get("sd")
    strictEqual(doc?.signature, "(x, na.rm = FALSE)")
    strictEqual(doc?.title, "Standard Deviation")
    strictEqual(
        doc?.description,
        "This function computes the standard deviation of the values in `x`. If `na.rm` is `TRUE` then missing values are removed.\n\nSecond paragraph, with an R object & more."
    )
    deepStrictEqual(
        doc?.args.map((arg) => [arg.name, arg.doc]),
        [
            ["x", "a numeric vector or an R object."],
            ["na.rm", "logical. Should missing values be removed?"],
        ]
    )
    strictEqual(doc?.returns, "The standard deviation.")
})

test("every function in the usage block gets the page's docs, comments are skipped", () => {
    const docs = parseTopic(several)
    deepStrictEqual([...docs.keys()], ["mutate", "transmute"])
    strictEqual(docs.get("transmute")?.signature, "(.data, ...)")
    strictEqual(docs.get("mutate")?.title, "Create, modify, and delete columns")
})

test("the first usage of a name wins, and a grouped argument name documents each", () => {
    const doc = parseTopic(several).get("mutate")
    strictEqual(doc?.signature, "(.data, ...)")
})

test("argument rows with several names document each of them", () => {
    const docs = parseTopic(several.replace("mutate(.data, ...)\n\n", ""))
    const doc = docs.get("mutate")
    strictEqual(doc?.signature, "(.data, ..., .by = NULL, .keep = c(\"all\", \"used\", \"unused\", \"none\"))")
    strictEqual(doc?.args[2].doc, "Grouping and keeping.")
    strictEqual(doc?.args[3].doc, "Grouping and keeping.")
})

test("pages are split by the marker and merged", () => {
    const docs = parseRdHtml("@@@TOPIC@@@\n" + sd + "@@@TOPIC@@@\n" + several)
    deepStrictEqual([...docs.keys()], ["sd", "mutate", "transmute"])
})

test("a page without a usage block documents nothing", () => {
    strictEqual(parseTopic("<h2>Data</h2><h3>Description</h3><p>x</p>").size, 0)
})

test("html entities and tags become plain text", () => {
    strictEqual(htmlToText("<p>a &lt; b &amp;&amp; <em>c</em></p><p>d&nbsp;e</p>"), "a < b && *c*\n\nd e")
})

test("the R script has no newline, which Rscript on Windows would mangle", () => {
    strictEqual(scriptForTest.includes("\n"), false)
    strictEqual(scriptForTest.startsWith("args = commandArgs"), true)
})
