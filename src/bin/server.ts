import ConnectionManager from '../connections/manager';
import logger from '../utils/winston';
import { IConnectionsConfig, IServerConfig } from '../types/config';
import Api from '../api/api';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const serverConfig: IServerConfig = require('../../config/server.config.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const connectionConfig: IConnectionsConfig = require('../../config/connections.config.json');

logger.info('Starting API Server...');

process.on('unhandledRejection', error => {
    logger.error('Unhandled error', error);

    process.exit(1);
});

const connection = new ConnectionManager(connectionConfig);

(async (): Promise<void> => {
    if (!(await connection.chain.checkChainId())) {
        logger.error('Chain Id in config mismatches node chain id. Stopping API...');

        process.exit(1);
    }

    if (!(await connection.database.tableExists('contract_readers'))) {
        logger.error('Tables not initialized yet. Stopping API...');

        process.exit(1);
    }

    try {
        const server = new Api(serverConfig, connection);

        await server.listen();
    } catch (e) {
        logger.error('Failed to start server', e);
    }
})();
