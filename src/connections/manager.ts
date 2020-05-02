import {IConnectionsConfig} from "../types/config";
import StateHistoryBlockReader from "./ship";

export default class ConnectionManager {
    public readonly chain: any;
    public readonly redis: any;
    public readonly database: any;

    constructor(private readonly config: IConnectionsConfig, redis: true, database: true, blockReader: true) {

    }

    createShipBlockReader() {
        return new StateHistoryBlockReader(this.config.chain.ship, {
            min_block_confirmation: parseInt(process.env.SHIP_MIN_BLOCK_CONFIRMATION, 10) || 1
        });
    }
}
