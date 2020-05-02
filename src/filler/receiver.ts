import ConnectionManager from "../connections/manager";
import {IContractConfig} from "../types/config";
import StateHistoryBlockReader from "../connections/ship";
import {BlockResponseType, DeltaResponseType, TraceResponseType} from "../types/ship";

class StateReceiver {
    private readonly ship: StateHistoryBlockReader;

    constructor(private readonly connection: ConnectionManager, private readonly config: IContractConfig[]) {
        this.ship = connection.createShipBlockReader();

        this.ship.consume(this.consumer.bind(this));

        // TODO: get starting block

        this.ship.startProcessing({
            start_block_num: 25277657,
            max_messages_in_flight: parseInt(process.env.SHIP_PREFETCH_BLOCKS, 10) || 10,
            fetch_block: false,
            fetch_traces: true,
            fetch_deltas: true
        });
    }

    private consumer(_: BlockResponseType, traces: TraceResponseType[], deltas: DeltaResponseType[]) {

    }
}
