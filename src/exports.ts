const exportTag = /^#'\s*@export(\s|$)/
const assignment = /^([A-Za-z.][A-Za-z0-9._]*)\s*(<<-|<-|:=|=(?!=))/

export function exportedNames(source: string): string[] {
    const names: string[] = []
    let tagged = false
    for (const line of source.split(/\r?\n/)) {
        if (exportTag.test(line)) {
            tagged = true
            continue
        }

        const trimmed = line.trim()
        if (trimmed === "" || trimmed.startsWith("#")) {
            continue
        }
        const match = assignment.exec(line)
        if (tagged && match !== null) {
            names.push(match[1])
        }
        tagged = false
    }
    return names
}

const exportCall = /box::export\(([^)]*)\)/g

function declaredExports(source: string): string[] | null {
    let found = false
    const names = new Set<string>()
    for (const call of source.matchAll(exportCall)) {
        found = true
        for (const part of call[1].split(",")) {
            const name = part.trim()
            if (name !== "") {
                names.add(name)
            }
        }
    }
    return found ? [...names] : null
}

export function topLevelNames(source: string): string[] {
    const names = new Set<string>()
    for (const line of source.split(/\r?\n/)) {
        const match = assignment.exec(line)
        if (match === null || match[2] === "<<-" || match[1].startsWith(".")) {
            continue
        }
        names.add(match[1])
    }
    return [...names]
}

export function moduleExports(source: string): string[] {
    const declared = declaredExports(source)
    if (declared !== null) {
        return declared
    }
    const tagged = exportedNames(source)
    return tagged.length > 0 ? tagged : topLevelNames(source)
}
