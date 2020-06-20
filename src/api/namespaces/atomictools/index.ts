import * as express from 'express';
import * as swagger from 'swagger-ui-express';

import { ApiNamespace } from '../interfaces';
import { HTTPServer } from '../../server';
import { getOpenApiDescription } from '../../docs';
import logger from '../../../utils/winston';
import { atomictoolsComponents } from './openapi';
import { configEndpoints } from './routes/config';
import { linksEndpoints } from './routes/links';

export type AtomicToolsNamespaceArgs = {
    atomictools_account: string,
    atomicassets_account: string
};

export class AtomicToolsNamespace extends ApiNamespace {
    static namespaceName = 'atomictools';

    args: AtomicToolsNamespaceArgs;

    async init(): Promise<void> {
        if (typeof this.args.atomictools_account !== 'string') {
            throw new Error('Argument missing in atomictools api namespace: atomictools_account');
        }

        const query = await this.connection.database.query(
            'SELECT * FROM atomictools_config WHERE tools_contract = $1',
            [this.args.atomictools_account]
        );

        if (query.rowCount === 0) {
            if (typeof this.args.atomicassets_account !== 'string') {
                throw new Error('AtomicTools API is not initialized yet (reader not running)');
            }
        } else {
            this.args.atomicassets_account = query.rows[0].assets_contract;
        }
    }

    async router(server: HTTPServer): Promise<express.Router> {
        const router = express.Router();

        const documentation: any = {
            openapi: '3.0.0',
            info: {
                description: getOpenApiDescription(server),
                version: '1.0.0',
                title: 'AtomicTools API'
            },
            servers: [
                {url: 'https://' + server.config.server_name + this.path},
                {url: 'http://' + server.config.server_name + this.path}
            ],
            tags: [],
            paths: {},
            components: {
                schemas: atomictoolsComponents
            }
        };

        server.web.express.use(this.path + '/v1', server.web.limiter);

        const docs = [];

        docs.push(linksEndpoints(this, server, router));
        docs.push(configEndpoints(this, server, router));

        for (const doc of docs) {
            Object.assign(documentation.paths, doc.paths);

            if (doc.tag) {
                documentation.tags.push(doc.tag);
            }
        }

        logger.debug('atomictools swagger docs', documentation);

        server.web.express.use(this.path + '/docs', swagger.serve, swagger.setup(documentation, {
            customCss: '.topbar { display: none; }',
            customCssUrl: 'https://cdn.jsdelivr.net/npm/swagger-ui-themes@3.0.0/themes/3.x/theme-flattop.min.css'
        }));

        return router;
    }

    async socket(): Promise<void> { }
}
