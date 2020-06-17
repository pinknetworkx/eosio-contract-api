import { parentPort, workerData } from 'worker_threads';
import { TextDecoder, TextEncoder } from 'text-encoding';
import { Serialize } from 'eosjs';
import * as abieos from '@eosrio/node-abieos';

import logger from '../utils/winston';

logger.info('Launching deserialization worker...');

if (!abieos) {
    logger.warn('C abi deserializer not supported on this platform. Using eosjs instead');
} else {
    abieos.load_abi('0', JSON.stringify(workerData));
}

const types = Serialize.getTypesFromAbi(Serialize.createInitialTypes(), workerData);

function deserialize(type: string, data: any): any {
    if (abieos) {
        return abieos.bin_to_json('0', type, data);
    }

    const buffer = new Serialize.SerialBuffer({ textEncoder: new TextEncoder, textDecoder: new TextDecoder, array: data });
    const result = Serialize.getType(types, type)
        .deserialize(buffer, new Serialize.SerializerState({ bytesAsUint8Array: true }));

    if (buffer.readPos !== data.length) {
        throw new Error('Deserialization error: ' + type);
    }

    return result;
}

parentPort.on('message', (data: any) => {
    const result: any = {...data};

    if (data.block) {
        result.block = deserialize('signed_block', data.block);

        result.block.block_num = data.this_block.block_num;
        result.block.block_id = data.this_block.block_id;
    }

    if (data.traces) {
        result.traces = deserialize('transaction_trace[]', data.traces);
    }

    if (data.deltas) {
        result.deltas = deserialize('table_delta[]', data.deltas);

        for (const delta of result.deltas) {
            if (delta[0] === 'table_delta_v0') {
                delta[1].rows.map((row: any) => {
                    row.data = deserialize(delta[1].name, row.data);
                });
            } else {
                throw Error('Unsupported table delta type received ' + delta[0]);
            }
        }
    }

    parentPort.postMessage(result);
});
