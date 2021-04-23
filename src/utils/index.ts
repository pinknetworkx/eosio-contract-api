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

export function compareVersionString(s1: string, s2: string): number {
    const split1 = s1.split('.');
    const split2 = s2.split('.');

    if (split1.length !== split2.length) {
        throw new Error('version string length mismatch');
    }

    for (let i = 0; i < split1.length; i++) {
        const compare = parseInt(split1[i], 10) - parseInt(split2[i], 10);

        if (compare === 0) {
            continue;
        }

        return compare;
    }

    return 0;
}
