import ConnectionManager from '../connections/manager';
import logger from '../utils/winston';
import { IConnectionsConfig, IServerConfig } from '../types/config';
import Api from '../api/api';

const serverConfig: IServerConfig = require('../../config/server.config.json');
const connectionConfig: IConnectionsConfig = require('../../config/connections.config.json');

logger.info('Starting API Server...');

const connection = new ConnectionManager(connectionConfig);

(async () => {
    if (!(await connection.chain.checkChainId())) {
        logger.error('Chain Id in config mismatches node chain id. Stopping API...');

        process.exit(1);
    }

    if (!(await connection.database.tableExists('contract_readers'))) {
        logger.error('Tables not initialized yet. Stopping API...');

        process.exit(1);
    }

    const server = new Api(serverConfig, connection);
    await server.listen();
})();
