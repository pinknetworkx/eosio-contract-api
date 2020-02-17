// cluster mode for production env
module.exports = {
    apps: [
        {
            ...require('./pm2.config'),
            instances: 2, // can be max or any number of processes the cpu can handle
            exec_mode: "cluster",
            env: {
                "PORT": 8080,
                "NODE_ENV": "production"
            },
        }
    ]
};
