import {getAccountsAction} from "./accounts";
import {expect} from "chai";
import {initAtomicAssetsTest} from "../test";

describe('getAccountsAction limits', () => {
    const {client, txit} = initAtomicAssetsTest();
    after(async () => {
        await client.end();
    });

    txit('asset count by owner of the current contract, limited to 2', async () => {
        const asset1 = await client.createAsset({
            owner: 'accountlim1',
            contract: 'contractlim',
        });

        const asset2 = await client.createAsset({
            owner: 'accountlim2',
            contract: asset1['contract'],
        });

        const asset3 = await client.createAsset({
            owner: 'accountlim3',
            contract: asset1['contract'],
        });
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
        const asset1 = await client.createAsset({
            owner: 'accountlim1',
            contract: 'contractlim',
        });

        const asset2 = await client.createAsset({
            owner: 'accountlim2',
            contract: asset1['contract'],
        });

        const asset3 = await client.createAsset({
            owner: 'accountlim3',
            contract: asset1['contract'],
        });
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
        const asset1 = await client.createAsset({
            owner: 'accountlim1',
            contract: 'contractlim',
        });

        const asset2 = await client.createAsset({
            owner: 'accountlim2',
            contract: asset1['contract'],
        });

        const asset3 = await client.createAsset({
            owner: 'accountlim3',
            contract: asset1['contract'],
        });
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