
export interface IUserInventoryPriceResponse {
    collections: IUserInventoryCollectionsPrices[];
}

export interface IUserInventoryCollectionsPrices {
    collection: ICollectionsMasterView;
    prices: IUserInventoryPrices[];
}

export interface IUserInventoryPrices {
    token_symbol: string;
    token_precision: number;
    token_contract: string;
    median: string;
    average: string;
    min: string;
    max: string;
    suggested_median: string;
    suggested_average: string;
}

export interface IUserInventoryPricesQueryResponse extends IUserInventoryPrices {
    collection_name: string;
    contract: string;
}

export interface ICollectionsMasterView {
    contract: string;
    collection_name: string;
    name: string;
    img: string;
    author: string;
    allow_notify: boolean;
    authorized_accounts: string[];
    notify_accounts: string[];
    market_fee: number;
    data: Record<string, any>;
    created_at_time: string;
    created_at_block: string;
}