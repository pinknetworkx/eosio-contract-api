const { createLogger, transports } = require('winston');

const defaultLevel = process.env.LOG_LEVEL || 'info';

const options = {
    exitOnError: false,
    level: defaultLevel
};

const logger = new createLogger(options);

if (process.env.NODE_ENV === 'production') {
    logger.add(new transports.Console({
        colorize: true,
        showLevel: true,
        timestamp: true
    }));
} else {
    logger.add(new transports.Console({
        colorize: true,
        showLevel: true,
        timestamp: true,
        level: 'debug'
    }));
}

logger.add(new transports.File({ filename: '../logs/error.log', level: 'error' }));

export default logger;
