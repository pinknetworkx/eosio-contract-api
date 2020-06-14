export type EosioAction<T = {[key: string]: any} | string> = {
    account: string,
    name: string,
    authorization: Array<{actor: string, permission: string}>,
    data: T
};

export type EosioActionTrace<T = {[key: string]: any} | string> = {
    action_ordinal: number,
    creator_action_ordinal: number,
    act: EosioAction<T>
};

export type EosioTransaction = {
    id: string,
    cpu_usage_us: number,
    net_usage_words: number
};

export type EosioTableRow = {
    code: string,
    scope: string,
    table: string,
    primary_key: string,
    payer: string,
    present: boolean,
    value: {[key: string]: any} | string
};
