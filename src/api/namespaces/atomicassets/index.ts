import * as express from 'express';
import * as swagger from 'swagger-ui-express';
import * as path from 'path';

import { ApiNamespace } from '../interfaces';
import { HTTPServer } from '../../server';
import { AssetApi } from './routes/assets';
import { collectionsEndpoints } from './routes/collections';
import { configEndpoints } from './routes/config';
import { schemasEndpoints } from './routes/schemas';
import { templatesEndpoints } from './routes/templates';
import logger from '../../../utils/winston';
import { atomicassetsComponents } from './openapi';
import { getOpenApiDescription } from '../../docs';
import { formatAsset, formatOffer, formatTransfer } from './format';
import { TransferApi } from './routes/transfers';
import { OfferApi } from './routes/offers';
import { accountsEndpoints } from './routes/accounts';
import ApiNotificationReceiver from '../../notification';

export type AtomicAssetsNamespaceArgs = {
    atomicassets_account: string,
    connected_reader: string
};

export class AtomicAssetsNamespace extends ApiNamespace {
    static namespaceName = 'atomicassets';

    args: AtomicAssetsNamespaceArgs;

    async init(): Promise<void> {
        if (typeof this.args.atomicassets_account !== 'string') {
            throw new Error('Argument missing in atomicassets api namespace: atomicassets_account');
        }
    }

    async router(server: HTTPServer): Promise<express.Router> {
        const router = express.Router();

        const documentation: any = {
            openapi: '3.0.0',
            info: {
                description: getOpenApiDescription(server),
                version: '1.0.0',
                title: 'AtomicAssets API'
            },
            servers: [
                {url: 'https://' + server.config.server_name + this.path},
                {url: 'http://' + server.config.server_name + this.path}
            ],
            tags: [],
            paths: {},
            components: {
                schemas: atomicassetsComponents
            }
        };

        server.web.express.use(this.path + '/v1', server.web.limiter);

        const endpointsDocs: any[] = [];

        const assetApi = new AssetApi(
            this, server, 'Asset',
            'atomicassets_assets_master', formatAsset
        );
        const transferApi = new TransferApi(
            this, server, 'Transfer',
            'atomicassets_transfers_master', formatTransfer,
            'atomicassets_assets_master', formatAsset
        );
        const offerApi = new OfferApi(
            this, server, 'Offer',
            'atomicassets_offers_master', formatOffer,
            'atomicassets_assets_master', formatAsset
        );

        endpointsDocs.push(assetApi.endpoints(router));
        endpointsDocs.push(collectionsEndpoints(this, server, router));
        endpointsDocs.push(schemasEndpoints(this, server, router));
        endpointsDocs.push(templatesEndpoints(this, server, router));

        endpointsDocs.push(offerApi.endpoints(router));
        endpointsDocs.push(transferApi.endpoints(router));
        endpointsDocs.push(accountsEndpoints(this, server, router));
        endpointsDocs.push(configEndpoints(this, server, router));

        for (const doc of endpointsDocs) {
            if (doc.tag) {
                documentation.tags.push(doc.tag);
            }

            Object.assign(documentation.paths, doc.paths);
        }

        logger.debug('atomicassets swagger docs', documentation);

        server.web.express.use(this.path + '/docs', express.static(path.resolve(__dirname, '../../../../docs/atomicassets')));

        server.web.express.use(this.path + '/docs/swagger', swagger.serve, swagger.setup(documentation, {
            customCss: '.topbar { display: none; }',
            customCssUrl: 'https://cdn.jsdelivr.net/npm/swagger-ui-themes@3.0.0/themes/3.x/theme-flattop.min.css'
        }));

        return router;
    }

    async socket(server: HTTPServer): Promise<void> {
        const notification = new ApiNotificationReceiver(this.connection, this.args.connected_reader);

        const assetApi = new AssetApi(
            this, server, 'Asset',
            'atomicassets_assets_master', formatAsset
        );
        const transferApi = new TransferApi(
            this, server, 'Transfer',
            'atomicassets_transfers_master', formatTransfer,
            'atomicassets_assets_master', formatAsset
        );
        const offerApi = new OfferApi(
            this, server, 'Offer',
            'atomicassets_offers_master', formatOffer,
            'atomicassets_assets_master', formatAsset
        );

        assetApi.sockets(notification);
        transferApi.sockets(notification);
        offerApi.sockets(notification);
    }
}
