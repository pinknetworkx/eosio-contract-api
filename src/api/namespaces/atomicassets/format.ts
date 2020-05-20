import { deserializeEosioName } from '../../../utils/eosio';

export function formatAsset(row: any): any {
    row.contract = deserializeEosioName(row.contract);
    row.owner = deserializeEosioName(row.owner);

    row.collection.collection_name = deserializeEosioName(row.collection.collection_name);
    row.collection.author = deserializeEosioName(row.collection.author);
    row.collection.authorized_accounts = row.collection.authorized_accounts.map((account: string) => deserializeEosioName(account));
    row.collection.notify_accounts = row.collection.notify_accounts.map((account: string) => deserializeEosioName(account));

    row.schema.schema_name = deserializeEosioName(row.schema.schema_name);

    row.backed_tokens = row.backed_tokens.map(
        (backedToken: any) => ({...backedToken, token_symbol: deserializeEosioName(backedToken.token_symbol).toUpperCase()})
    );

    return row;
}
