import * as http from 'http';

import logger from '../utils/winston';
import App from '../index';

const server = http.createServer(App);

const normalizePort = (val: number|string): number|string|boolean => {
    const normolizedPort = (typeof val === 'string') ? parseInt(val, 10) : val;
    if (isNaN(normolizedPort)) {
        return val;
    }

    if (normolizedPort >= 0) {
        return normolizedPort;
    }

    return false;
};

const port = normalizePort(process.env.PORT || 3000);
App.set('port', port);

// handle all kind of server errors
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
    const addr = server.address();
    const bind = (typeof addr === 'string') ? `pipe ${addr}` : `port ${addr.port}`;
    logger.info(`Listening on ${bind}`);
};

server.listen(port);
server.on('error', onError);
server.on('listening', onListening);
