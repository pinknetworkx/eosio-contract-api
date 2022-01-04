import StateHistoryBlockReader from '../connections/ship';
import { ShipBlockResponse } from '../types/ship';
import logger from '../utils/winston';

const ship = new StateHistoryBlockReader('ws://127.0.0.1:8080', {
    min_block_confirmation: 1,
    ds_threads: 1,
    allow_empty_traces: true,
    allow_empty_deltas: true,
    allow_empty_blocks: true
});

ship.consume( (block: ShipBlockResponse) => {
    logger.info('block received', block);

    ship.stopProcessing();
});

ship.startProcessing({
    start_block_num: 97708771,
    max_messages_in_flight: 1,
    fetch_block: true,
    fetch_traces: true,
    fetch_deltas: true
}, ['contract_row']);
