export type CancelLinkActionData = {
    link_id: string
};

export type ClaimLinkActionData = {
    link_id: string,
    claimer: string,
    claimer_signature: string
};

export type LogNewLinkActionData = {
    link_id: string,
    creator: string,
    key: string,
    asset_ids: string[],
    memo: string
};

export type LogLinkStartActionData = {
    link_id: string
};
