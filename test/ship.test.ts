import 'mocha';

import ConnectionManager from '../src/connections/manager';
import { ShipBlockResponse } from '../src/types/ship';
import logger from '../src/utils/winston';

const config = require('../config/connections.config.json');

describe('Ship Test', () => {
    const connection = new ConnectionManager(config);

    it('connect and receive first block', async () => {
        return new Promise((async (resolve) => {
            const ship = connection.createShipBlockReader({
                min_block_confirmation: 1,
                ds_threads: 1,
                ds_experimental: true
            });

            ship.consume( (block: ShipBlockResponse) => {
                logger.info('block received', block);

                ship.stopProcessing();
                resolve();
            });

            ship.startProcessing({
                start_block_num: 28370000,
                max_messages_in_flight: 1,
                fetch_block: true,
                fetch_traces: true,
                fetch_deltas: true
            });
        }));
    }).timeout(20000);
});
