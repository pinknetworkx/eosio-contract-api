import {expect} from 'chai';

import {initAtomicAssetsTest} from '../test';
import {getAccountAction, getAccountCollectionAction, getAccountsAction} from './accounts';
import {formatCollection} from '../format';

describe('Account handler', () => {
    const {client, txit} = initAtomicAssetsTest();

    describe('getAccountAction', () => {
        txit('gets a specific account stats, asset count, collections filter by owner and contract', async () => {
            const collection = await client.createCollection({
                collection_name: 'collection',
            });
            const template = await client.createTemplate({
                collection_name: collection['collection_name'],
            });

            const asset = await client.createAsset({
                owner: 'account1',
                collection_name: collection['collection_name'],
                template_id: template['template_id'],
            });

            // Another contract won't show
            await client.createAsset({
                owner: 'account1',
                collection_name: collection['collection_name'],
                template_id: template['template_id'],
                contract: 'another_cont'
            });

            const collectionViewInfo = await client.query(
                'SELECT * FROM atomicassets_collections_master WHERE collection_name = $1',
                [collection['collection_name']],
            );

            const response = await getAccountAction({}, {
                db: client,
                pathParams: {
                    account: asset['owner'],
                },
                coreArgs: {
                    atomicassets_account: asset['contract'],
                    socket_features: {asset_update: true},
                    connected_reader: 'reader',
                }
            });

            expect(response.assets).to.equal('1');
            expect(response.collections).length(1);
            const resCollection = response.collections[0];
            expect(resCollection).to.deep.equal({
                collection: formatCollection(collectionViewInfo.rows[0]),
                assets: '1',
            });

            const resTemplates = response.templates;
            expect(resTemplates).length(1);
            expect(resTemplates[0]).to.deep.equal({
                template_id: template['template_id'],
                assets: '1',
                collection_name: asset['collection_name'],
            });
        });
    });

    describe('getAccountCollectionAction', () => {
        txit('retrieves template and schema count from the given account and collection name', async () => {
            const collection = await client.createCollection({collection_name: 'collection1'});
            const template = await client.createTemplate({
                collection_name: collection['collection_name'],
            });

            const asset1 = await client.createAsset({
                owner: 'account1',
                collection_name: collection['collection_name'],
                template_id: template['template_id'],
            });

            const asset2 = await client.createAsset({
                collection_name: collection['collection_name'],
                owner: asset1['owner'],
                contract: asset1['contract'],
            });

            // This won't appear in the response
            await client.createAsset({
                collection_name: 'collection2',
                owner: asset1['owner'],
                contract: asset1['contract'],
            });

            const response = await getAccountCollectionAction({}, {
                db: client,
                pathParams: {account: asset1['owner'], collection_name: collection['collection_name']},
                coreArgs: {
                    atomicassets_account: asset1['contract'],
                    socket_features: {asset_update: true},
                    connected_reader: 'reader',
                }
            });

            expect(response.templates).to.deep.equal([
                {template_id: template['template_id'], assets: '1'},
                {template_id: null, assets: '1'},
            ]);

            expect(response.schemas).to.deep.equal([
                {schema_name: asset1['schema_name'], assets: '1'},
                {schema_name: asset2['schema_name'], assets: '1'}
            ]);
        });
    });

    describe('getAccountsAction', () => {
        txit('asset count by owner of the current contract', async () => {
            const asset1 = await client.createAsset({
                owner: 'account1',
                contract: 'contract1',
            });

            const asset2 = await client.createAsset({
                owner: 'account2',
                contract: asset1['contract'],
            });

            // Won't appear in the response - Different contract
            await client.createAsset({
                owner: asset2['owner'],
                contract: 'contract2',
            });

            const response = await getAccountsAction({}, {
                db: client,
                pathParams: {},
                coreArgs: {
                    atomicassets_account: asset1['contract'],
                    socket_features: {asset_update: true},
                    connected_reader: 'reader',
                }
            });

            expect(response.length).to.equal(2);
            expect(response[0]).to.deep.equal({assets: '1', account: asset1['owner']});
            expect(response[1]).to.deep.equal({assets: '1', account: asset2['owner']});
        });

        context('when filter match argument is given', () => {
            txit('returns asset count filtered by owner', async () => {
                const asset1 = await client.createAsset({
                    owner: 'account1',
                    contract: 'contract1',
                });

                // Won't appear different owner
                await client.createAsset({
                    owner: 'account2',
                    contract: asset1['contract'],
                });

                const response = await getAccountsAction({
                    match: asset1['owner'],
                }, {
                    db: client,
                    pathParams: {},
                    coreArgs: {
                        atomicassets_account: asset1['contract'],
                        socket_features: {asset_update: true},
                        connected_reader: 'reader',
                    }
                });

                expect(response.length).to.equal(1);
                expect(response[0]).to.deep.equal({assets: '1', account: asset1['owner']});
            });
        });

        context('when filter collection name is given', () => {
            txit('returns asset count filtered by collection name', async () => {
                const asset1 = await client.createAsset({
                    owner: 'account1',
                    contract: 'contract1',
                    collection_name: 'collection1'
                });

                // Won't appear different collection
                await client.createAsset({
                    owner: asset1['owner'],
                    contract: asset1['contract'],
                    collection_name: 'collection2'
                });

                const response = await getAccountsAction({
                    collection_name: asset1['collection_name'],
                }, {
                    db: client,
                    pathParams: {},
                    coreArgs: {
                        atomicassets_account: asset1['contract'],
                        socket_features: {asset_update: true},
                        connected_reader: 'reader',
                    }
                });

                expect(response.length).to.equal(1);
                expect(response[0]).to.deep.equal({assets: '1', account: asset1['owner']});
            });
        });

        context('when filter schema name is given', () => {
            txit('returns asset count filtered by schema name', async () => {
                const asset1 = await client.createAsset({
                    owner: 'account1',
                    contract: 'contract1',
                    schema_name: 'schema1'
                });

                // Won't appear different collection
                await client.createAsset({
                    owner: asset1['owner'],
                    contract: asset1['contract'],
                    schema_name: 'schema2'
                });

                const response = await getAccountsAction({
                    schema_name: asset1['schema_name'],
                }, {
                    db: client,
                    pathParams: {},
                    coreArgs: {
                        atomicassets_account: asset1['contract'],
                        socket_features: {asset_update: true},
                        connected_reader: 'reader',
                    }
                });

                expect(response.length).to.equal(1);
                expect(response[0]).to.deep.equal({assets: '1', account: asset1['owner']});
            });
        });

        context('when filter template id is given', () => {
            txit('returns asset count filtered by schema name', async () => {
                const template = await client.createTemplate();
                const anotherTemplate = await client.createTemplate();

                const asset1 = await client.createAsset({
                    owner: 'account1',
                    contract: 'contract1',
                    collection_name: template['collection_name'],
                    template_id: template['template_id'],
                });

                // Won't appear different collection
                await client.createAsset({
                    owner: 'account1',
                    contract: 'contract1',
                    collection_name: anotherTemplate['collection_name'],
                    template_id: anotherTemplate['template_id'],
                });

                const response = await getAccountsAction({
                    template_id: template['template_id'],
                }, {
                    db: client,
                    pathParams: {},
                    coreArgs: {
                        atomicassets_account: asset1['contract'],
                        socket_features: {asset_update: true},
                        connected_reader: 'reader',
                    }
                });

                expect(response.length).to.equal(1);
                expect(response[0]).to.deep.equal({assets: '1', account: asset1['owner']});
            });
        });
    });

    after(async () => {
        await client.end();
    });
});