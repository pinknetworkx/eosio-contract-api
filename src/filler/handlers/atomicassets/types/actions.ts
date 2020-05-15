export type AttributeMap = Array<{key: string, value: [string, any]}>;
export type Format = {name: string, type: string};

export type LogTransferActionData = {
    collection_name: string,
    'from': string,
    to: string,
    asset_ids: string[],
    memo: string
};

export type LogMintAssetActionData = {
    minter: string,
    asset_id: string,
    collection_name: string,
    scheme_name: string,
    preset_id: number,
    new_owner: string
};

export type LogBurnAssetActionData = {
    owner: string,
    asset_id: string,
    collection_name: string,
    scheme_name: string,
    preset_id: number,
    backed_tokens: string[],
    immutable_serialized_data: number[],
    mutable_serialized_data: number[]
};

export type LogBackAssetActionData = {
    owner: string,
    asset_id: string,
    back_quantity: string
};

export type LogSetActionData = {
    owner: string,
    asset_id: string,
    old_serialized_data: number[],
    new_data: AttributeMap
};

export type AddColAuthActionData = {
    collection_name: string,
    account_to_add: string
};

export type AddNotifyAccActionData = {
    collection_name: string,
    account_to_add: string
};

export type CreateColActionData = {
    author: string,
    collection_name: string,
    allow_notify: boolean,
    authorized_accounts: string[],
    notify_accounts: string[],
    market_fee: number,
    data: AttributeMap
};

export type ForbidNotifyActionData = {
    collection_name: string
};

export type RemColAuthActionData = {
    collection_name: string,
    account_to_remove: string
};

export type RemNotifyAccActionData = {
    collection_name: string,
    account_to_remove: string
};

export type SetMarketFeeActionData = {
    collection_name: string,
    market_fee: number
};

export type SetColDataActionData = {
    collection_name: string,
    data: AttributeMap
};

export type LogNewPresetActionData = {
    preset_id: number,
    authorized_creator: string,
    scheme_name: string,
    collection_name: string,
    transferable: boolean,
    burnable: boolean,
    max_supply: number,
    immuntable_data: AttributeMap
};

export type CreateSchemeActionData = {
    authorized_creator: string,
    collection_name: string,
    scheme_name: string,
    scheme_format: Format[]
};

export type ExtendSchemeActionData = {
    authorized_editor: string,
    collection_name: string,
    scheme_name: string,
    scheme_format_extension: Format[]
};

export type AcceptOfferActionData = {
    offer_id: string
};

export type DeclineOfferActionData = {
    offer_id: string
};

export type CancelOfferActionData = {
    offer_id: string
};
