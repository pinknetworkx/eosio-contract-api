export type EosioAction = {
    account: string,
    name: string,
    authorization: Array<{actor: string, permission: string}>,
    data: {[key: string]: any} | string
};

export type EosioTableRow = {
    code: string,
    scope: string,
    table: string,
    primary_key: string,
    payer: string,
    value: {[key: string]: any} | string
};
