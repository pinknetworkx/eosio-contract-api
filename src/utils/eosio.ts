import { TextDecoder, TextEncoder } from 'text-encoding';
import { SerialBuffer } from 'eosjs/dist/eosjs-serialize';

import { deserializeUInt, serializeUInt } from './binary';
import { Serialize } from 'eosjs';
import { ShipActionTrace, ShipContractRow, ShipTableDelta, ShipTransactionTrace } from '../types/ship';
import { EosioTransaction } from '../types/eosio';
import { Abi } from 'eosjs/dist/eosjs-rpc-interfaces';

export function serializeEosioName(name: string): string {
    const buffer = new SerialBuffer({textEncoder: new TextEncoder(), textDecoder: new TextDecoder()});

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

    const buffer = new SerialBuffer({textEncoder: new TextEncoder(), textDecoder: new TextDecoder(), array: bytes});

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

export function eosioDeserialize(type: string, data: Uint8Array | string, types: Map<string, Serialize.Type>, checkLength: boolean = true): any {
    let dataArray;
    if (typeof data === 'string') {
        dataArray = Uint8Array.from(Buffer.from(data, 'hex'));
    } else {
        dataArray = data;
    }

    const buffer = new Serialize.SerialBuffer({ textEncoder: new TextEncoder(), textDecoder: new TextDecoder(), array: dataArray });
    const result = Serialize.getType(types, type).deserialize(buffer, new Serialize.SerializerState({ bytesAsUint8Array: true }));

    if (buffer.readPos !== data.length && checkLength) {
        throw new Error('Deserialization error: ' + type);
    }

    return result;
}

export function eosioSerialize(type: string, value: any, types: Map<string, Serialize.Type>): Uint8Array {
    const buffer = new Serialize.SerialBuffer({ textEncoder: new TextEncoder(), textDecoder: new TextDecoder() });
    Serialize.getType(types, type).serialize(buffer, value);

    return buffer.asUint8Array();
}

export function extractShipTraces(transactions: ShipTransactionTrace[]): Array<{trace: ShipActionTrace, tx: EosioTransaction}> {
    const result: Array<{trace: ShipActionTrace, tx: EosioTransaction}> = [];

    for (const transaction of transactions) {
        if (transaction[0] === 'transaction_trace_v0') {
            // transaction failed
            if (transaction[1].status !== 0) {
                continue;
            }

            const tx: EosioTransaction = {
                id: transaction[1].id,
                cpu_usage_us: transaction[1].cpu_usage_us,
                net_usage_words: transaction[1].net_usage_words
            };

            result.push(...transaction[1].action_traces.map((trace) => {
                return {trace, tx};
            }));
        } else {
            throw new Error('unsupported transaction response received: ' + transaction[0]);
        }
    }

    // sort by global_sequence because inline actions do not have the correct order
    result.sort((a, b) => {
        if (a.trace[0] === 'action_trace_v0' && b.trace[0] === 'action_trace_v0') {
            if (a.trace[1].receipt[0] === 'action_receipt_v0' && b.trace[1].receipt[0] === 'action_receipt_v0') {
                return parseInt(a.trace[1].receipt[1].global_sequence, 10) - parseInt(b.trace[1].receipt[1].global_sequence, 10);
            }

            throw new Error('unsupported trace receipt response received: ' + a.trace[0] + ' ' + b.trace[0]);
        }

        throw new Error('unsupported trace response received: ' + a.trace[0] + ' ' + b.trace[0]);
    });

    return result;
}

export function extractShipContractRows(deltas: ShipTableDelta[]): Array<{present: boolean, data: ShipContractRow}> {
    const result: Array<{present: boolean, data: ShipContractRow}> = [];

    for (const delta of deltas) {
        if (delta[0] !== 'table_delta_v0') {
            throw new Error('Unsupported table delta response received: ' + delta[0]);
        }

        if (delta[1].name === 'contract_row') {
            for (const row of delta[1].rows) {
                result.push({present: row.present, data: <ShipContractRow>row.data});
            }
        }
    }

    return result;
}

export function getTableAbiType(abi: Abi, contract: string, table: string): string {
    for (const row of abi.tables) {
        if (row.name === table) {
            return row.type;
        }
    }

    throw new Error('Type for table not found ' + contract + ':' + table);
}

export function getActionAbiType(abi: Abi, contract: string, action: string): string {
    for (const row of abi.actions) {
        if (row.name === action) {
            return row.type;
        }
    }

    throw new Error('Type for action not found ' + contract + ':' + action);
}
