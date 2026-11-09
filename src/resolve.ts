import { join } from "node:path"

export function moduleCandidates(base: string, segments: string[]): string[] {
    const stem = join(base, ...segments)
    return [
        stem + ".r",
        stem + ".R",
        join(stem, "__init__.r"),
        join(stem, "__init__.R"),
    ]
}
