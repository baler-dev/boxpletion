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
    const tagged = exportedNames(source)
    return tagged.length > 0 ? tagged : topLevelNames(source)
}
