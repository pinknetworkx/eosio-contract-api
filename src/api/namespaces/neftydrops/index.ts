import * as express from 'express';

import { ApiNamespace } from '../interfaces';
import { HTTPServer } from '../../server';
import { getOpenApiDescription } from '../../docs';
import logger from '../../../utils/winston';
import { neftyDropsComponents} from './openapi';
import { configEndpoints } from './routes/config';
import * as swagger from 'swagger-ui-express';
import {statsEndpoints} from './routes/stats';
import {dropsEndpoints} from './routes/drops';

export type NeftyDropsNamespaceArgs = {
    neftydrops_account: string,
    atomicassets_account: string,
};

export enum DropApiState {
    CREATED = 0,
    ACTIVE = 1,
    SOLD_OUT = 2,
    ENDED = 3,
}

export class NeftyDropsNamespace extends ApiNamespace {
    static namespaceName = 'neftydrops';

    declare args: NeftyDropsNamespaceArgs;

    async init(): Promise<void> {
        if (typeof this.args.neftydrops_account !== 'string') {
            throw new Error('Argument missing in neftydrops api namespace: neftydrops_account');
        }

        const query = await this.connection.database.query(
            'SELECT * FROM neftydrops_config WHERE drops_contract = $1',
            [this.args.neftydrops_account]
        );

        if (query.rowCount === 0) {
            if (typeof this.args.neftydrops_account !== 'string') {
                throw new Error('NeftyDrops API is not initialized yet (reader not running)');
            }
        } else {
            this.args.neftydrops_account = query.rows[0].drops_contract;
        }
    }

    async router(server: HTTPServer): Promise<express.Router> {
        const router = express.Router();

        const documentation: any = {
            openapi: '3.0.0',
            info: {
                description: getOpenApiDescription(server),
                version: '1.0.0',
                title: 'NeftyDrops API'
            },
            servers: [
                {url: 'https://' + server.config.server_name + this.path},
                {url: 'http://' + server.config.server_name + this.path}
            ],
            tags: [],
            paths: {},
            components: {
                schemas: neftyDropsComponents
            }
        };

        if (server.web.limiter) {
            server.web.express.use(this.path + '/v1', server.web.limiter);
        }

        const docs = [
            configEndpoints(this, server, router),
            dropsEndpoints(this, server, router),
            statsEndpoints(this, server, router)
        ];

        for (const doc of docs) {
            Object.assign(documentation.paths, doc.paths);

            if (doc.tag) {
                documentation.tags.push(doc.tag);
            }
        }

        logger.info('neftydrops docs on ' + this.path + '/docs');
        logger.debug('neftydrops swagger docs', documentation);

        router.use('/docs', swagger.serve);
        router.get('/docs', swagger.setup(documentation, {
            customCss: '.topbar { display: none; }',
            customCssUrl: 'https://cdn.jsdelivr.net/npm/swagger-ui-themes@3.0.0/themes/3.x/theme-flattop.min.css'
        }));

        return router;
    }

    async socket(): Promise<void> { }
}
