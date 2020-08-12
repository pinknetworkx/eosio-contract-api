export function formatAsset(row: any): any {
    const data = {...row};

    data.collection = formatCollection(data.collection);

    data['data'] = {};

    data.mutable_data = Object.assign({}, data.mutable_data);
    data.immutable_data = Object.assign({}, data.immutable_data);

    Object.assign(data['data'], data.mutable_data);
    Object.assign(data['data'], data.immutable_data);

    if (data.template) {
        data.template.immutable_data = Object.assign({}, data.template.immutable_data);

        Object.assign(data['data'], data.template.immutable_data);
    }

    delete data['template_id'];
    delete data['schema_name'];
    delete data['collection_name'];
    delete data['authorized_accounts'];

    return data;
}

export function formatTemplate(row: any): any {
    const data = {...row};

    data.collection = formatCollection(data.collection);

    delete data['schema_name'];
    delete data['collection_name'];
    delete data['authorized_accounts'];

    return data;
}

export function formatSchema(row: any): any {
    const data = {...row};

    data.collection = formatCollection(data.collection);

    delete data['collection_name'];
    delete data['authorized_accounts'];

    return data;
}

export function formatCollection(row: any): any {
    return row;
}

export function formatOffer(row: any): any {
    const data = {...row};

    delete data['recipient_contract_account'];

    return data;
}

export function formatTransfer(row: any): any {
    return {...row};
}
