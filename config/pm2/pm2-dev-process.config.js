module.exports = {
    apps: [
        {
            // we load the common config
            ...require('./pm2.config'),
            // we set environment variables
            env: {
                "PORT": 3000,
                "NODE_ENV": "development"
            }
        }
    ]
};
