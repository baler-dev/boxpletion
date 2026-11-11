import { execFile } from "node:child_process"
import { promisify } from "node:util"

const run = promisify(execFile)

// Reads the package's data index. It does not load the package or run its code.
const script = [
    "args = commandArgs(trailingOnly = TRUE)",
    "found = utils::data(package = args[1], lib.loc = args[-1])$results",
    "items = if (nrow(found) > 0) found[, \"Item\"] else character(0)",
    "cat(items, sep = \"\\n\")",
].join("; ")

/** "beaver1 (beavers)" is the object `beaver1` from the dataset group `beavers`. */
export function parseDataList(stdout: string): string[] {
    const names = new Set<string>()
    for (const line of stdout.split(/\r?\n/)) {
        const name = line.replace(/\s*\(.*\)\s*$/, "").trim()
        if (name !== "") {
            names.add(name)
        }
    }
    return [...names]
}

export async function loadPackageData(
    rscript: string,
    libs: string[],
    name: string
): Promise<string[]> {
    const { stdout } = await run(rscript, ["-e", script, name, ...libs], { timeout: 20000 })
    return parseDataList(stdout)
}
