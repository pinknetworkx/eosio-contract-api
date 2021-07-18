export function encodeDatabaseJson(obj: any): string {
    return JSON.stringify(obj)
        .replace('\\u0000' , ' ');
}
