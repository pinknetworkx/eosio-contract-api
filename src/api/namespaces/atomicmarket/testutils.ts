import { AtomicMarketContext } from './index';
import { RequestValues } from '../utils';
import { DB } from '../../server';

export function getTestContext(db: DB, pathParams: RequestValues = {}): AtomicMarketContext {
    return  {
        pathParams,
        db,
        coreArgs: {
            atomicmarket_account: 'amtest',
            atomicassets_account: 'aatest',
            delphioracle_account: 'dotest',

            connected_reader: '',

            socket_features: {
                asset_update: false,
            },
        },
    };
}
