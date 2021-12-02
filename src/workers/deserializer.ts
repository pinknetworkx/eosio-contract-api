import { parentPort, workerData } from 'worker_threads';
import { Serialize } from 'eosjs';

import logger from '../utils/winston';
import { deserializeEosioType } from '../utils/eosio';

const args: {abi: string} = workerData;

logger.info('Launching deserialization worker...');

const eosjsTypes: any = Serialize.getTypesFromAbi(Serialize.createInitialTypes(), JSON.parse(args.abi));

parentPort.on('message', (param: Array<{type: string, data: Uint8Array | string, abi?: any}>) => {
    try {
        const result = [];

        for (const row of param) {
            if (row.data === null) {
                return parentPort.postMessage({success: false, message: 'Empty data received on deserialize worker'});
            }

            if (row.abi) {
                const abiTypes = Serialize.getTypesFromAbi(Serialize.createInitialTypes(), row.abi);

                result.push(deserializeEosioType(row.type, row.data, abiTypes));
            } else {
                result.push(deserializeEosioType(row.type, row.data, eosjsTypes));
            }
        }

        return parentPort.postMessage({success: true, data: result});
    } catch (e) {
        return parentPort.postMessage({success: false, message: String(e)});
    }
});
