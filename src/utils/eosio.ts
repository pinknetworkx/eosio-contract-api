import { TextDecoder, TextEncoder } from 'text-encoding';
import { SerialBuffer } from 'eosjs/dist/eosjs-serialize';

import { deserializeUInt, serializeUInt } from './binary';

export function serializeEosioName(name: string): string {
    const buffer = new SerialBuffer({textEncoder: new TextEncoder, textDecoder: new TextDecoder});

    buffer.pushName(name);

    const bytes = buffer.asUint8Array();
    let n = BigInt(0);

    for (const byte of bytes) {
        n = (n << BigInt(8)) + BigInt(byte);
    }

    return serializeUInt(n).toString();
}

export function deserializeEosioName(data: string): string {
    const bytes = new Uint8Array(8);
    let n = deserializeUInt(data);

    for (let i = 0; i < 8; i ++) {
        bytes[7 - i] = Number(n & BigInt(0xFF));
        n = n >> BigInt(8);
    }

    const buffer = new SerialBuffer({textEncoder: new TextEncoder, textDecoder: new TextDecoder, array: bytes});

    return buffer.getName();
}

export function eosioTimestampToDate(timestamp: string): Date {
    return new Date(timestamp + '+0000');
}

export function splitEosioToken(asset: string, contract?: string): {amount: string, token_symbol: string, token_precision: number, token_contract?: string} {
    const split1 = asset.split(' ');
    const split2 = split1[0].split('.');

    return {
        amount: split2.join(''),
        token_symbol: split1[1],
        token_precision: split2[1] ? split2[1].length : 0,
        token_contract: contract
    };
}
