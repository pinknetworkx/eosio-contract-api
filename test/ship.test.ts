import { expect } from 'chai';

import StateHistoryBlockReader from '../src/connections/ship';

describe('Ship Test', () => {
    it('connect', async () => {
        const ship = new StateHistoryBlockReader('ws://127.0.0.1:8080', {
            min_block_confirmation: 30
        });

        ship.consume((block, traces, deltas) => {
            // console.log("block received", block);
        });

        ship.startProcessing({
            start_block_num: 25277657,
            max_messages_in_flight: 50,
            fetch_block: true,
            fetch_traces: true,
            fetch_deltas: true
        });

        return new Promise(() => {});
    }).timeout(20000);
});
