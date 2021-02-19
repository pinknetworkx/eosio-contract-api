export function arraysEqual(arr1: any[], arr2: any[]): boolean {
    if (arr1.length !== arr2.length) {
        return false;
    }

    for (let i = arr1.length; i--;) {
        if (arr1[i] !== arr2[i]) {
            return false;
        }
    }

    return true;
}

export function arrayChunk(arr: any[], size: number): any[] {
    return Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
        arr.slice(i * size, i * size + size)
    );
}

export function getStackTrace(): any {
    const obj: any = {};
    Error.captureStackTrace(obj, getStackTrace);

    return obj.stack;
}
