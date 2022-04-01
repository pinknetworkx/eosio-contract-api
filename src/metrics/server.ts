import * as os from 'os';
import * as express from 'express';
import {Registry} from 'prom-client';

import logger from '../utils/winston';
import ConnectionManager from '../connections/manager';
import {ICollectOptions, MetricsCollectorHandler} from './handler';


export class MetricsServer {
    private readonly metricsCollector: MetricsCollectorHandler;
    private readonly server: express.Express;

    constructor(
        private readonly port: number,
        connections: ConnectionManager,
        process: 'api' | 'filler',
        options: ICollectOptions = {}
    ) {
        this.metricsCollector = new MetricsCollectorHandler(connections, process, os.hostname(), options);
        this.server = express();
    }

    serve(): void {
        this.server.all('/metrics', async (_req, res) => {
            res.send(await this.metricsCollector.getMetrics(new Registry()));
        });


        this.server.listen(this.port, () => logger.info(`Serving metrics on http://localhost:${this.port}/metrics`));
    }
}