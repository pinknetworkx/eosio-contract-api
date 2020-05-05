import {ShipActionReceipt} from "./ship";

export type EosioAction = {
    account: string,
    name: string,
    authorization: Array<{actor: string, permission: string}>,
    data: {[key: string]: any}
};
