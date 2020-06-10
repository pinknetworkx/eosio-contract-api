import * as express from 'express';
import * as path from 'path';
import * as swagger from 'swagger-ui-express';

import { ApiNamespace } from '../interfaces';
import { HTTPServer } from '../../server';
import { getOpenApiDescription } from '../../docs';
import { assetsEndpoints } from '../atomicassets/routes/assets';
import { offersEndpoints } from '../atomicassets/routes/offers';
import { transfersEndpoints } from '../atomicassets/routes/transfers';
import logger from '../../../utils/winston';
import { auctionsEndpoints } from './routes/auctions';
import { salesEndpoints } from './routes/sales';
import { atomicmarketComponents } from './openapi';

export type AtomicMarketNamespaceArgs = {
    atomicassets_account: string,
    atomicmarket_account: string,

    admin_token: string
};

export class AtomicMarketNamespace extends ApiNamespace {
    static namespaceName = 'atomicmarket';

    args: AtomicMarketNamespaceArgs;

    async init(): Promise<void> {
        if (typeof this.args.atomicmarket_account !== 'string') {
            throw new Error('Argument missing in atomicmarket api namespace: atomicmarket_account');
        }

        if (typeof this.args.atomicassets_account !== 'string') {
            throw new Error('Argument missing in atomicmarket api namespace: atomicassets_account');
        }

        if (typeof this.args.admin_token !== 'string') {
            throw new Error('Argument missing in atomicmarket api namespace: admin_token');
        }
    }

    async router(server: HTTPServer): Promise<express.Router> {
        const router = express.Router();

        const documentation: any = {
            openapi: '3.0.0',
            info: {
                description: getOpenApiDescription(server),
                version: '1.0.0',
                title: 'AtomicHub API'
            },
            servers: [
                {url: 'https://' + server.config.server_name + this.path},
                {url: 'http://' + server.config.server_name + this.path}
            ],
            tags: [],
            paths: {},
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer'
                    }
                },
                schemas: atomicmarketComponents
            }
        };

        server.web.express.use(this.path + '/v1', server.web.limiter);

        const docs = [];

        docs.push(assetsEndpoints(this, server, router, 'atomicmarket_assets_master', 'ListingAsset'));
        docs.push(offersEndpoints(this, server, router, 'atomicmarket_assets_master'));
        docs.push(transfersEndpoints(this, server, router, 'atomicmarket_assets_master'));

        docs.push(auctionsEndpoints(this, server, router));
        docs.push(salesEndpoints(this, server, router));

        for (const doc of docs) {
            Object.assign(documentation.paths, doc.paths);

            if (doc.tag) {
                documentation.tags.push(doc.tag);
            }
        }

        logger.debug('atomicmarket swagger docs', documentation);

        server.web.express.use(this.path + '/docs', express.static(path.resolve(__dirname, '../../../../docs/atomicmarket')));

        server.web.express.use(this.path + '/docs/swagger', swagger.serve, swagger.setup(documentation, {
            customCss: '.topbar { display: none; }',
            customCssUrl: 'https://cdn.jsdelivr.net/npm/swagger-ui-themes@3.0.0/themes/3.x/theme-flattop.min.css'
        }));

        return router;
    }

    async socket(server: HTTPServer): Promise<void> {

    }
}
