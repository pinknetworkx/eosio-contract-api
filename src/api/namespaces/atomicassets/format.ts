import { deserializeEosioName } from '../../../utils/eosio';

export function formatAsset(row: any): any {
    const data = {...row};

    data.contract = deserializeEosioName(data.contract);
    data.owner = deserializeEosioName(data.owner);
    data.collection = formatCollection(data.collection);
    data.schema.schema_name = deserializeEosioName(data.schema.schema_name);
    data.backed_tokens = data.backed_tokens.map(
        (backedToken: any) => ({...backedToken, token_symbol: deserializeEosioName(backedToken.token_symbol).toUpperCase()})
    );

    delete data['template_id'];
    delete data['schema_name'];
    delete data['collection_name'];
    delete data['authorized_accounts'];

    return data;
}

export function formatTemplate(row: any): any {
    const data = {...row};

    data.contract = deserializeEosioName(data.contract);
    data.collection = formatCollection(data.collection);
    data.schema.schema_name = deserializeEosioName(data.schema.schema_name);

    delete data['schema_name'];
    delete data['collection_name'];
    delete data['authorized_accounts'];

    return data;
}

export function formatSchema(row: any): any {
    const data = {...row};

    data.contract = deserializeEosioName(data.contract);
    data.collection = formatCollection(data.collection);
    data.schema_name = deserializeEosioName(data.schema_name);

    delete data['collection_name'];
    delete data['authorized_accounts'];

    return data;
}

export function formatCollection(row: any): any {
    const data = {...row};

    data.collection_name = deserializeEosioName(data.collection_name);
    data.author = deserializeEosioName(data.author);
    data.authorized_accounts = data.authorized_accounts.map((account: string) => deserializeEosioName(account));
    data.notify_accounts = data.notify_accounts.map((account: string) => deserializeEosioName(account));

    return data;
}

export function formatOffer(row: any): any {
    const data = {...row};

    data.contract = deserializeEosioName(data.contract);
    data.sender_name = deserializeEosioName(data.sender_name);
    data.recipient_name = deserializeEosioName(data.recipient_name);

    data.sender_assets = data.sender_assets.map((asset: any) => formatAsset(asset));
    data.recipient_assets = data.recipient_assets.map((asset: any) => formatAsset(asset));

    return data;
}

export function formatTransfer(row: any): any {
    const data = {...row};

    data.contract = deserializeEosioName(data.contract);
    data.sender_name = deserializeEosioName(data.sender_name);
    data.recipient_name = deserializeEosioName(data.recipient_name);

    data.assets = data.assets.map((asset: any) => formatAsset(asset));

    return data;
}
