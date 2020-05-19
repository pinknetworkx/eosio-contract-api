import ConnectionManager from '../connections/manager';
import logger from '../utils/winston';
import { IConnectionsConfig, IServerConfig } from '../types/config';
import ApiLoader from '../api/loader';

const serverConfig: IServerConfig = require('../../config/server.config.json');
const connectionConfig: IConnectionsConfig = require('../../config/connections.config.json');

logger.info('Starting API Server...');

const connection = new ConnectionManager(connectionConfig);
const server = new ApiLoader(serverConfig, connection);

server.listen().then();
