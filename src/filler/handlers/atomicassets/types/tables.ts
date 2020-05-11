export type AssetsTableRow = {
    asset_id: string,
    collection_name: string,
    scheme_name: string,
    preset_id: number,
    ram_payer: string,
    backed_tokens: string[],
    immutable_serialized_data: number[],
    mutable_serialized_data: number[]
};

export type BalancesTableRow = {
    owner: string,
    quantities: string[]
};

export type CollectionsTableRow = {
    collection_name: string,
    author: string,
    allow_notify: number,
    authorized_accounts: string[],
    notify_accounts: string[],
    market_fee: number,
    serialized_data: number[]
};

export type ConfigTableRow = {
    asset_counter: number,
    offer_counter: number,
    collection_format: Array<{ name: string, type: string }>,
    token_symbols: Array<{ token_contract: string, token_symbol: string } >
};

export type OffersTableRow = {
    offer_id: string,
    offer_sender: string,
    offer_recipient: string,
    sender_asset_ids: string[],
    recipient_asset_ids: string[],
    memo: string
};

export type PresetsTableRow = {
    preset_id: string,
    collection_name: string,
    scheme_name: string,
    transferable: boolean,
    burnable: boolean,
    max_supply: string,
    issued_supply: string,
    immutable_serialized_data: number[]
};

export type SchemesTableRow = {
    scheme_name: string,
    format: Array<{ name: string, type: string }>
};

export type TokenConfigsTableRow = {
    standard: 'atomicassets',
    version: string
};
