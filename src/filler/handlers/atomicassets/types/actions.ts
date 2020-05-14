export type AcceptOfferActionData = {
    offer_id: string
};

export type AddColAuthActionData = {
    collection_name: string,
    account_to_add: string
};

export type LogTransferActionData = {
    collection_name: string,
    'from': string,
    to: string,
    asset_ids: string[],
    memo: string
};
