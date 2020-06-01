import 'mocha';

import ConnectionManager from '../src/connections/manager';
import { ShipTransactionTrace } from '../src/types/ship';

const config = require('../config/connections.config.json');

describe('Ship Test', () => {
    const connection = new ConnectionManager(config);

    it('connect and receive first block', async () => {
        return new Promise((async (resolve) => {
            const ship = connection.createShipBlockReader({
                min_block_confirmation: 1
            });

            ship.consume( (
                header: any,
                block: Uint8Array,
                rawTraces: Uint8Array,
                rawDeltas: Uint8Array
            ) => {
                const traces: ShipTransactionTrace[] = ship.deserialize('transaction_trace[]', rawTraces);

                console.log('Traces' + JSON.stringify(traces));

                const deltas = ship.deserialize('table_delta[]', rawDeltas);

                console.log('Deltas: ' + JSON.stringify(deltas.map((delta: any) => {
                    return {...delta[1] , rows: delta[1].rows.map((row: any) => {
                        return {
                            present: row.present,
                            data: ship.deserialize(delta[1].name, row.data)
                        };
                    })};
                })));

                ship.stopProcessing();
                resolve();
            });

            ship.startProcessing({
                start_block_num: 30505742,
                max_messages_in_flight: 1,
                fetch_block: true,
                fetch_traces: true,
                fetch_deltas: true
            });
        }));
    }).timeout(20000);
});
