import { parentPort, workerData } from 'worker_threads';

import logger from '../utils/winston';
import { eosioDeserialize, extractShipContractRows, extractShipTraces, getActionAbiType, getTableAbiType } from '../utils/eosio';
import { Serialize } from 'eosjs';
import { Abi } from 'eosjs/dist/eosjs-rpc-interfaces';

const args: {
    rules: {[key: string]: {actions: string[], tables: string[]}},
    abis: {[key: string]: {json: Abi, block_num: number, types?: Map<string, Serialize.Type>}}
} = workerData;

for (const name of Object.keys(args.abis)) {
    args.abis[name].types = Serialize.getTypesFromAbi(Serialize.createInitialTypes(), args.abis[name].json);
}

logger.info('Launching contract worker...');

parentPort.on('message', (param: {type: string, data: any}) => {
    try {
        if (param.type === 'deltas') {
            const deltas = extractShipContractRows(param.data);

            for (const row of deltas) {
                const contractRow = row.data;

                if (contractRow[0] === 'contract_row_v0') {
                    const delta = contractRow[1];
                    const abi = args.abis[delta.code];

                    delta.value = <any>{
                        binary: delta.value,
                        block_num: null,
                        json: null
                    };

                    const allowedTables: string[] = [
                        ...(args.rules[delta.code] ? args.rules[delta.code].tables : []),
                        ...(args.rules['*'] ? args.rules['*'].tables : [])
                    ];

                    if (abi && (allowedTables.indexOf(delta.table) >= 0 || allowedTables.indexOf('*') >= 0)) {
                        try {
                            const type = getTableAbiType(abi.json, delta.code, delta.table);

                            delta.value = <any>{
                                // @ts-ignore
                                binary: delta.value.binary,
                                // @ts-ignore
                                json: eosioDeserialize(type, delta.value.binary, abi.types),
                                block_num: abi.block_num
                            };
                        } catch (e) {
                            logger.warn('Failed to deserialize table ' + delta.code + ':' + delta.table + ' in worker', e);
                        }
                    }
                }
            }

            return parentPort.postMessage({success: true, data: deltas});
        } else if (param.type === 'traces') {
            const traces = extractShipTraces(param.data).filter(row => {
                if (row.trace[0] === 'action_trace_v0') {
                    if (row.trace[1].receiver !== row.trace[1].act.account) {
                        return false;
                    }
                }

                return true;
            });

            for (const row of traces) {
                const actionTrace = row.trace;

                if (actionTrace[0] === 'action_trace_v0') {
                    if (actionTrace[1].receiver !== actionTrace[1].act.account) {
                        continue;
                    }

                    const act = actionTrace[1].act;
                    const abi = args.abis[act.account];

                    act.data = <any>{
                        binary: act.data,
                        block_num: null,
                        json: null
                    };

                    const allowedTraces: string[] = [
                        ...(args.rules[act.account] ? args.rules[act.account].actions : []),
                        ...(args.rules['*'] ? args.rules['*'].actions : [])
                    ];

                    if (abi && (allowedTraces.indexOf(act.name) >= 0 || allowedTraces.indexOf('*') >= 0)) {
                        try {
                            const type = getActionAbiType(abi.json, act.account, act.name);

                            act.data = <any>{
                                // @ts-ignore
                                binary: act.data.binary,
                                // @ts-ignore
                                json: eosioDeserialize(type, act.data.binary, abi.types, false),
                                block_num: abi.block_num
                            };
                        } catch (e) {
                            logger.warn('Failed to deserialize trace ' + act.account + ':' + act.name + ' in worker', e);
                        }
                    }
                }
            }

            return parentPort.postMessage({success: true, data: traces});
        } else {
            return parentPort.postMessage({success: false, message: 'Invalid extraction type received'});
        }
    } catch (e) {
        return parentPort.postMessage({success: false, message: String(e)});
    }
});
