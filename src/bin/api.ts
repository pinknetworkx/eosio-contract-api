import * as http from 'http';

const connectionsConfig = require('../../config/connections.config.json');
const apiConfig = require('../../config/server.config.json');

import logger from '../utils/winston';
import App from '../api/loader';

const api = http.createServer(App);

const normalizePort = (val: number | string): number | string | boolean => {
    const normolizedPort = (typeof val === 'string') ? parseInt(val, 10) : val;
    if (isNaN(normolizedPort)) {
        return val;
    }

    if (normolizedPort >= 0) {
        return normolizedPort;
    }

    return false;
};

const port = normalizePort(parseInt(apiConfig.port, 10) || 3000);

App.set('port', port);

const onError = (error: NodeJS.ErrnoException) => {
    if (error.syscall !== 'listen') { throw error; }
    const bind = (typeof port === 'string') ? 'Pipe ' + port : 'Port ' + port;
    switch (error.code) {
        case 'EACCES':
            logger.error(`${bind} requires elevated privileges`);
            process.exit(1);

            break;
        case 'EADDRINUSE':
            logger.error(`${bind} is already in use`);
            process.exit(1);

            break;
        default:
            throw error;
    }
};

const onListening = () => {
    const addr = api.address();
    const bind = (typeof addr === 'string') ? `pipe ${addr}` : `port ${addr.port}`;
    logger.info(`Listening on ${bind}`);
};

api.listen(port);
api.on('error', onError);
api.on('listening', onListening);
