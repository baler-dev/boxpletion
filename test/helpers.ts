import type { TestContext } from "node:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

export function makeTree(t: TestContext, files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "boxpletion-"))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    for (const [file, content] of Object.entries(files)) {
        const path = join(root, file)
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, content)
    }
    return root
}
