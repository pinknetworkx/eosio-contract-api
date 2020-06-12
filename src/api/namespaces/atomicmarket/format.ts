import { formatAsset } from '../atomicassets/format';

export function formatAuction(row: any): any {
    const data = {...row};

    data.price.amount = row.raw_price;

    delete row.raw_price;
    delete row.raw_price_precision;
    delete row.collection_name;

    return data;
}

export function formatSale(row: any): any {
    const data = {...row};

    data.price.amount = row.raw_price;

    delete row.raw_price;
    delete row.raw_price_precision;
    delete row.collection_name;

    return data;
}

export function formatListingAsset(row: any): any {
    return formatAsset(row);
}
