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
        port: number
    };
    chain: {
        name: string,
        chain_id: string,
        http: string,
        ship: string
    };
}

export interface IServerConfig {
    provider_name: string;
    provider_url: string;

    server_addr: string;
    server_name: string;
    server_port: number;

    cache_life: number;
    trust_proxy: boolean;

    rate_limit: {
        interval: number,
        requests: number
    };

    socket_limit: {
        connections_per_ip: number,
        subscriptions_per_connection: number
    };

    ip_whitelist: string[];
    slow_query_threshold: number;

    namespaces: INamespaceConfig[];
}

export interface INamespaceConfig {
    name: string;
    path: string;
    args: {[key: string]: any};
}

export interface IReaderConfig {
    name: string;

    start_block: number;
    stop_block: number;
    irreversible_only: boolean;

    ship_prefetch_blocks: number;
    ship_min_block_confirmation: number;
    ship_ds_queue_size: number;

    db_group_blocks: number;

    ds_ship_threads: number;

    delete_data: boolean;

    contracts: IContractConfig[];
}

export interface IContractConfig {
    handler: string;

    args: any;
}
