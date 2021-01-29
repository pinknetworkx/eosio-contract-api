import 'mocha';

import { ShipBlockResponse } from '../src/types/ship';
import logger from '../src/utils/winston';
import StateHistoryBlockReader from '../src/connections/ship';

describe('Ship Test', () => {
    const ship = new StateHistoryBlockReader('ws://127.0.0.1:8080', {
        min_block_confirmation: 1,
        ds_threads: 1,
        ds_experimental: false
    });

    it('connect and receive first block', async () => {
        return new Promise((async (resolve) => {
            ship.consume( (block: ShipBlockResponse) => {
                logger.info('block received', block);

                ship.stopProcessing();
                resolve();
            });

            ship.startProcessing({
                start_block_num: 78636526,
                max_messages_in_flight: 1,
                fetch_block: true,
                fetch_traces: true,
                fetch_deltas: true
            }, ['contract_row']);
        }));
    }).timeout(20000);
});
