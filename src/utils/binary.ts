export function deserializeUInt(n: bigint | string, size: number = 8): bigint {
    const num = BigInt(n);

    if (num < BigInt(0)) {
        return ((num * BigInt(-1)) ^ ((BigInt(2) ** BigInt(size * 8)) - BigInt(1))) + BigInt(1);
    }

    return num;
}

export function serializeUInt(n: bigint | string, size: number = 8): bigint {
    const num = BigInt(n);

    if (num > (BigInt(2) ** BigInt(size * 8 - 1)) - BigInt(1)) {
        if (num > (BigInt(2) ** BigInt(size * 8)) - BigInt(1)) {
            throw new Error('integer overflow');
        }

        return ((num - BigInt(1)) ^ ((BigInt(2) ** BigInt(size * 8)) - BigInt(1))) * BigInt(-1);
    }

    return num;
}

export function preventInt64Overflow(n: bigint | string): string {
    const num = BigInt(n);

    if (num > BigInt('9223372036854775807')) {
        return '9223372036854775807';
    }

    return String(num);
}

export function binToHex(data: any): string {
    let hex = '';

    if (typeof data[Symbol.iterator] === 'function') {
        for (const byte of data) {
            hex += ('0' + (byte & 0xFF).toString(16)).slice(-2);
        }

        return hex;
    }

    let i = 0;

    while (typeof data[String(i)] === 'number') {
        hex += ('0' + (data[String(i)] & 0xFF).toString(16)).slice(-2);

        i++;
    }

    return hex;
}

export function parseJsonObject(data: string): any {
    try {
        const result = JSON.parse(data);

        if (typeof result === 'object' && !Array.isArray(result)) {
            return result;
        }

        return {};
    } catch {
        return {};
    }
}
