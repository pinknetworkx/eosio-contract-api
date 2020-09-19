import { parentPort, workerData } from 'worker_threads';
import { TextDecoder, TextEncoder } from 'text-encoding';
import { Serialize } from 'eosjs';
import * as nodeAbieos from '@eosrio/node-abieos';

import logger from '../utils/winston';
import { IBlockReaderOptions } from '../types/ship';

const args: {options: IBlockReaderOptions, abi: string} = workerData;

logger.info('Launching deserialization worker...');

let abieosSupported = false;
if (args.options.ds_experimental) {
    if (!nodeAbieos) {
        logger.warn('C abi deserializer not supported on this platform. Using eosjs instead');
    } else if (!nodeAbieos.load_abi('0', args.abi)) {
        logger.warn('Failed to load ship ABI in abieos');
    } else {
        abieosSupported = true;
        logger.info('Ship ABI loaded in deserializer worker thread');
    }
}

const eosjsTypes: any = Serialize.getTypesFromAbi(Serialize.createInitialTypes(), JSON.parse(args.abi));

function deserialize(type: string, data: Uint8Array | string): any {
    if (args.options.ds_experimental && abieosSupported) {
        if (typeof data === 'string') {
            return nodeAbieos.hex_to_json('0', type, data);
        }

        return nodeAbieos.bin_to_json('0', type, Buffer.from(data));
    }

    let dataArray;
    if (typeof data === 'string') {
        dataArray = Uint8Array.from(Buffer.from(data, 'hex'));
    } else {
        dataArray = data;
    }

    const buffer = new Serialize.SerialBuffer({ textEncoder: new TextEncoder, textDecoder: new TextDecoder, array: dataArray });
    const result = Serialize.getType(eosjsTypes, type).deserialize(buffer, new Serialize.SerializerState({ bytesAsUint8Array: true }));

    if (buffer.readPos !== data.length) {
        throw new Error('Deserialization error: ' + type);
    }

    return result;
}

parentPort.on('message', (param: Array<{type: string, data: Uint8Array | string}>) => {
    try {
        const result = [];

        for (const row of param) {
            if (row.data === null) {
                return parentPort.postMessage({success: false, message: 'Empty data received on deserialize worker'});
            }

            result.push(deserialize(row.type, row.data));
        }

        return parentPort.postMessage({success: true, data: result});
    } catch (e) {
        return parentPort.postMessage({success: false, message: String(e)});
    }
});
