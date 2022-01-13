export function formatDrop(row: any): any {
    if (!row) {
        return row;
    }
    const data = {...row};

    data.price.amount = row.raw_price;
    try {
        data.display_data = JSON.parse(row.display_data);
    } catch (e) {
        data.display_data = {};
    }

    delete data.raw_price;
    delete data.raw_token_symbol;
    delete data.raw_token_precision;
    delete data.drop_state;
    return data;
}

export function formatClaim(row: any): any {
    const data = {...row};
    data.txid = row.txid.toString('hex');
    delete data.country;
    return data;
}
