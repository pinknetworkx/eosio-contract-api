export type EosioAction<T = {[key: string]: any} | string> = {
    account: string,
    name: string,
    authorization: Array<{actor: string, permission: string}>,
    data: T
};

export type EosioActionTrace<T = {[key: string]: any} | string> = {
    action_ordinal: number,
    creator_action_ordinal: number,
    global_sequence: string,
    account_ram_deltas: Array<{account: string, delta: number}>,
    act: EosioAction<T>
};

export type EosioTransaction<T = {[key: string]: any} | string> = {
    id: string,
    cpu_usage_us: number,
    net_usage_words: number,
    traces: Array<EosioActionTrace<T>>
};

export type EosioContractRow<T = {[key: string]: any} | string> = {
    code: string,
    scope: string,
    table: string,
    primary_key: string,
    payer: string,
    present: boolean,
    value: T
};
