export interface IConnectionsConfig {
    postgres: {
        host: string,
        port: number,
        user: string,
        password: string,
        database: string
    };
    redis: {
        host: string,
        port: number,
        prefix: string
    };
    chain: {
        name: string,
        chain_id: string,
        http: string,
        ship: string
    };
}

export interface IContractConfig {
    scope: string[];
    handler: string;
}
