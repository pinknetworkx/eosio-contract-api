import fetch from 'node-fetch';

import ConnectionManager from '../connections/manager';
import logger from '../utils/winston';
import { IConnectionsConfig } from '../types/config';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const connectionConfig: IConnectionsConfig = require('../../config/connections.config.json');

const endpoint = process.env.HYPERION;

if (!endpoint) {
    logger.error('No hyperion endpoint defined. Please specify environment variable: HYPERION');

    process.exit(1);
}

logger.info('Connecting to databases...');

const connection = new ConnectionManager(connectionConfig);

(async () => {
    logger.info('Using endpoint ' + endpoint);

    const infoResp = await fetch(endpoint + '/v1/chain/get_info').then((data) => data.json());

    if (infoResp.chain_id !== connection.chain.chainId) {
        logger.error('Endpoint chain_id does not match chain_id in config');

        process.exit(1);
    }

    logger.info('Fetching ABIs');

    let timestamp = '2000-01-01T00:00:00Z';
    let currentSequence = 0;
    let lastSequence = 0;
    let nextSequence = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        logger.info('Fetch ABIs and Codes after ' + timestamp + '...');

        const resp = await fetch(
            endpoint + '/v2/history/get_actions?filter=eosio:setabi,eosio:setcode&limit=250&sort=asc&after=' + timestamp
        ).then((data) => data.json());

        const queries: Array<{str: string, values: any[]}> = [];

        for (const trace of resp.actions) {
            if (currentSequence >= trace.global_sequence) {
                continue;
            }

            if (trace.act.name === 'setcode') {
                logger.info(`Code update found for ${trace.act.data.account} on block ${trace.block_num}`);

                queries.push({
                    str: 'INSERT INTO contract_codes (account, block_num, block_time) VALUES ($1, $2, $3)',
                    values: [
                        trace.act.data.account,
                        trace.block_num,
                        new Date(trace.timestamp + '+0000').getTime()
                    ]
                });
            } else if (trace.act.name === 'setabi') {
                logger.info(`Abi update found for ${trace.act.data.account} on block ${trace.block_num}`);

                queries.push({
                    str: 'INSERT INTO contract_abis (account, abi, block_num, block_time) VALUES ($1, $2, $3, $4)',
                    values: [
                        trace.act.data.account,
                        Buffer.from(trace.act.data.abi, 'hex'),
                        trace.block_num,
                        new Date(trace.timestamp + '+0000').getTime()
                    ]
                });
            }

            if (trace.global_sequence > lastSequence) {
                timestamp = trace.timestamp;
                nextSequence = trace.global_sequence;
            }

            lastSequence = trace.global_sequence;
        }

        currentSequence = nextSequence;

        if (queries.length === 0) {
            break;
        }

        for (const query of queries) {
            try {
                await connection.database.query(query.str, query.values);
            } catch (e) {
                // logger.error(e);
            }
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    logger.info('Absican done');
    process.exit();
})();
