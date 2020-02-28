import { expect } from 'chai';

import StateHistoryConnection from "../src/connections/ship";

describe('Ship Test', () => {
    it('connect', async () => {
        const ship = new StateHistoryConnection("ws://127.0.0.1:8080");

        setTimeout(() => {
            ship.requestBlocks({
                start_block_num: 14316893,
                end_block_num: 0xFFFFFFFF,
                max_messages_in_flight: 50,
                fetch_block: true,
                fetch_traces: true,
                fetch_deltas: true
            });
        }, 2000);

        setInterval(() => {
            ship.send(['get_blocks_ack_request_v0', { num_messages: 10 }]);
        }, 3000);

        return new Promise(() => {});
    }).timeout(20000);
});
