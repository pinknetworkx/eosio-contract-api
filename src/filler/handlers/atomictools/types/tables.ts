export type LinksTableRow = {
    link_id: string,
    creator: string,
    key: string,
    asset_ids: string[],
    assets_transferred: boolean,
    memo: string
};

export type ConfigTableRow = {
    version: string,
    atomicassets_account: string,
    link_counter: number
};
