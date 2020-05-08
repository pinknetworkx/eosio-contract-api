import 'mocha';

import ConnectionManager from '../src/connections/manager';

const config = require('../config/connections.config.json');

describe('Ship Test', () => {
    const connection = new ConnectionManager(config);

    it('connect and receive first block', async () => {
        return new Promise((async (resolve) => {
            const ship = connection.createShipBlockReader({
                min_block_confirmation: 1
            });

            ship.consume(() => {
                ship.stopProcessing();
                resolve();
            });

            ship.startProcessing({
                start_block_num: (await connection.chain.rpc.get_info()).head_block_num,
                max_messages_in_flight: 1,
                fetch_block: true,
                fetch_traces: true,
                fetch_deltas: true
            });
        }));
    }).timeout(2000);
});
