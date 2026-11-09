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
