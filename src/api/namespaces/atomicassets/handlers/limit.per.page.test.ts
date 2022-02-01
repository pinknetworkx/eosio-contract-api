import {getAccountsAction} from "./accounts";
import {expect} from "chai";
import {initAtomicAssetsTest} from "../test";

describe('getAccountsAction limits', () => {
    const {client, txit} = initAtomicAssetsTest();
    let asset1:Record<string, any>;
    let asset2:Record<string, any>;
    let asset3:Record<string, any>;
    before( async () => {
        asset1 = await client.createAsset({
            owner: 'account1',
            contract: 'contract',
        });

        asset2 = await client.createAsset({
            owner: 'account2',
            contract: asset1['contract'],
        });

        asset3 = await client.createAsset({
            owner: 'account3',
            contract: asset1['contract'],
        });

    });
    txit('asset count by owner of the current contract, limited to 2', async () => {
        const response = await getAccountsAction({limit: '2'}, {
            db: client,
            pathParams: {},
            coreArgs: {
                atomicassets_account: asset1['contract'],
                socket_features: {asset_update: true},
                connected_reader: 'reader',
                limits: {
                    accounts: 2
                }
            }
        });
        expect(response.length).to.equal(2);
    });

    txit('limit bigger than set max', async () => {
        let response;
        try {
            response = await getAccountsAction({limit: '3'}, {
                db: client,
                pathParams: {},
                coreArgs: {
                    atomicassets_account: asset1['contract'],
                    socket_features: {asset_update: true},
                    connected_reader: 'reader',
                    limits: {
                        accounts: 2
                    }
                }
            });
        } catch (error) {
            response = error;
        }
        expect(response.code).to.equal(400);
        expect(response.message).to.contain('Invalid value for parameter limit');
    });

    txit('set max smaller than default', async () => {
        const response = await getAccountsAction({}, {
            db: client,
            pathParams: {},
            coreArgs: {
                atomicassets_account: asset1['contract'],
                socket_features: {asset_update: true},
                connected_reader: 'reader',
                limits: {
                    accounts: 2
                }
            }
        });
        expect(response.length).to.equal(2);
    });
});