import * as express from 'express';
import * as fs from 'fs';

import { ApiNamespace } from '../interfaces';
import { SocketServer, WebServer } from '../../server';
import { assetsEndpoints } from './routes/assets';
import { collectionsEndpoints } from './routes/collections';
import { configEndpoints } from './routes/config';
import { offersEndpoints } from './routes/offers';
import { schemasEndpoints } from './routes/schemas';
import { templatesEndpoints } from './routes/templates';
import { transfersEndpoints } from './routes/transfers';

export type AtomicAssetsNamespaceArgs = {
    contract: string
};

export class AtomicAssetsNamespace extends ApiNamespace {
    static namespaceName = 'atomicassets';

    args: AtomicAssetsNamespaceArgs;

    async init(): Promise<void> {
        await this.connection.database.query(
            fs.readFileSync('./definitions/views/atomicassets_assets_master.sql', {encoding: 'utf8'})
        );
        await this.connection.database.query(
            fs.readFileSync('./definitions/views/atomicassets_templates_master.sql', {encoding: 'utf8'})
        );
        await this.connection.database.query(
            fs.readFileSync('./definitions/views/atomicassets_schemas_master.sql', {encoding: 'utf8'})
        );
        await this.connection.database.query(
            fs.readFileSync('./definitions/views/atomicassets_collections_master.sql', {encoding: 'utf8'})
        );
        await this.connection.database.query(
            fs.readFileSync('./definitions/views/atomicassets_offers_master.sql', {encoding: 'utf8'})
        );
        await this.connection.database.query(
            fs.readFileSync('./definitions/views/atomicassets_transfers_master.sql', {encoding: 'utf8'})
        );
    }

    async router(web: WebServer): Promise<express.Router> {
        const router = express.Router();

        assetsEndpoints(this, web, router);
        collectionsEndpoints(this, web, router);
        configEndpoints(this, web, router);
        offersEndpoints(this, web, router);
        schemasEndpoints(this, web, router);
        templatesEndpoints(this, web, router);
        transfersEndpoints(this, web, router);

        return router;
    }

    async socket(socket: SocketServer): Promise<void> {

    }
}
