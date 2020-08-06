import { Numeric } from 'eosjs/dist';

export function formatLink(row: any): any {
    const data = {...row};

    data['public_key'] = Numeric.publicKeyToString({
        data: data['key_data'],
        type: data['key_type']
    });

    delete data['key_type'];
    delete data['key_data'];

    return data;
}
