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
