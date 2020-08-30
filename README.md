# EOSIO Contract API
The aim of this project is to provide an interface to query contracts and the blockchain
state on eosio based blockchains. It communicates with the eosio State History
Plugin and uses PostgreSQL to store the data which makes it possible to
guarantee that the state of the database matches the onchain state. 
This consistency is achieved with per block Postgres transactions and
internal fork handling which still will be consistent even if you kill the process at 
any time.

## Requirements

* NodeJS >= 14.0
* PostgreSQL >= 12.2
* Redis >= 5.0
* Nodeos >= 1.8.0 (only tested with 2.0) The state history plugin needs to be enabled and the options: 
`trace-history = true`, `chain-state-history = true`

Suggestions
* Hasura GraphQL Engine >= 1.2 (if you want to allow GraphQL queries)
* PGAdmin 4 (Interface to manage the postgres database)

## Configuration
The config folder contains 3 different configuration files

#### connections.config.json
This file contains Postgres / Redis / Nodeos configuration for the used chain.

Notes
* Redis: Can be used for multiple chains without further action
* PostgreSQL: Each chain needs it own postgres database, but multiple readers of the same
chain can use the same database
* Nodeos: Can be initialized with a snapshot, but history will be missing, so it is advised not to do that

```javascript
{
  "postgres": {
    "host": "127.0.0.1",
    "port": 5432,
    "user": "username",
    "password": "changeme",
    "database": "contract-api-wax-testnet"
  },
  "redis": {
    "host": "127.0.0.1",
    "port": 6379
  },
  "chain": {
    "name": "wax-testnet",
    "chain_id": "f16b1833c747c43682f4386fca9cbb327929334a762755ebec17f6f23c9b8a12",
    "http": "http://127.0.0.1:8888",
    "ship": "ws://127.0.0.1:8080"
  }
}
```

#### readers.config.json
This file is used to configure the filler

```javascript
[
  // Multiple Readers can be defined and each one will run in a seperated thread
  {
    "name": "atomic", // Name of the reader. Should be unique per chain and should not change after it was started

    "start_block": 0, // start at a specific block
    "stop_block": 0, // stop at a specific block
    "irreversible_only": false, // If you need data for a lot of contracts and do not need live data, this option is faster

    "ship_prefetch_blocks": 50, // How much unconfirmed blocks ship will send
    "ship_min_block_confirmation": 30, // After how much blocks the reader will confirm the blocks
    "ds_threads": 4, // How much threads should be used to deserialize traces and table deltas
    "ds_experimental": false, // Use abieos as deserializer. There are maybe some bugs since its not fully tested yet

    "delete_data": false, // Truncate all rows which were created by these readers

    "contracts": [
      // AtomicAssets handler which provides data for the AtomicAssets NFT standard
      {
        "handler": "atomicassets",
        "start_on": 100, // Define the block after which actions and deltas are important
        "args": {
          "atomicassets_account": "assetstest55", // Account where the contract is deployed
          "store_logs": true, // store logs
          "store_transfers": true // store the transfer history
        }
      }
    ]
  }
]
```

#### server.config.json

```javascript
{
  "provider_name": "pink.network", // Provider which is show in the endpoint documentation
  "provider_url": "https://pink.network",

  "server_addr": "0.0.0.0", // Server address to bind to
  "server_name": "wax.api.atomicassets.io", // Server name which is shown in the documentation
  "server_port": 9000, // Server Port

  "cache_life": 1, // GET endpoints are cached for this amount of time (in seconds)
  "trust_proxy": true, // Enable if you use a reverse proxy to have correct rate limiting by ip

  "rate_limit": {
    "interval": 60, // Interval to reset the counter (in seconds)
    "requests": 240 // How much requests can be made in the defined interval
  },

  "socket_limit": {
    "connections_per_ip": 25, // How much socket connections each IP can have at the same time
    "subscriptions_per_connection": 200 // Subscription limit for each IP
  },

  "ip_whitelist": [], // These IPs are not rate limited or receive cached requests
  "slow_query_threshold": 7500, // If specific queries take longer than this threshold a warning is created

  "namespaces": [
    // atomicassets namespace which provides an API for basic functionalities
    {
      "name": "atomicassets", 
      "path": "/atomicassets", // Each API endpoint will start with this path
      "args": {
        "atomicassets_account": "atomicassets" // Account where the contract is deployed
      }
    }
  ]
}

```

## Installation

This API consists of two separated processes which need to be started and stopped independently:
* The API which will provide the socket and REST endpoints (or whatever the namespace uses)
* The Filler which will read the data from the blockchain and fill the database

There are two suggested ways to run the project: Docker if you want to containerize the application or PM2 if you want to run it on system level

### Docker

1. `git clone && cd eosio-contract-api`
2. Create postgres database and user
3. Create and modify configs
4. There is an example docker compose file provided
5. `docker-compose up -d`

Start
* `docker-compose start eosio-contract-api-filler`
* `docker-compose start eosio-contract-api-server`

Stop
* `docker-compose stop eosio-contract-api-filler`
* `docker-compose stop eosio-contract-api-server`

### PM2

1. `git clone && cd eosio-contract-api`
2. Install and setup postgres, redis, nodeos with state history
3. Create and modify configs
4. `yarn install`
5. `yarn global add pm2`

Start
* `pm2 start ecosystems.config.json --only eosio-contract-api-filler`
* `pm2 start ecosystems.config.json --only eosio-contract-api-server`

Stop
* `pm2 stop eosio-contract-api-filler`
* `pm2 stop eosio-contract-api-server`

## Currently Supported Contracts

### Readers (used to fill the database)

Readers are used to fill the database for a specific contract.

#### atomicassets

```javascript
{
  "handler": "atomicassets",
  "args": {
    "atomicassets_account": "atomicassets" // account where the atomicassets contract is deployed
    "store_transfers": true // store the transfer history  
    "store_logs": true // store data structure logs
  }
}
```

#### atomicmarket
This reader requires a atomicassets and a delphioracle reader with the same contract as specified here
```javascript
{
  "handler": "atomicmarket",
  "args": {
    "atomicassets_account": "atomicassets" // account where the atomicassets contract is deployed
    "atomicmarket_account": "atomicmarket" // account where the atomicmarket contract is deployed
    "store_logs": true // Store logs of sales / auctions
  }
}
```

#### delphioracle

```javascript
{
  "handler": "delphioracle",
  "args": {
    "delphioracle_account": "delphioracle" // account where the delphioracle contract is deployed
  }
}
```

### Namespace (API endpoints)

A namespace provides an API for a specific contract or use case and is based on data a reader provides

#### atomicassets

```javascript
{
  "handler": "atomicassets",
  "args": {
    "atomicassets_account": "atomicassets" // account where the atomicassets contract is deployed
    "connected_reader": "atomic" // reader to which the API connects for live data
  }
}
```

#### atomicmarket

```javascript
{
  "handler": "atomicmarket",
  "args": {
    "atomicmarket_account": "atomicmarket", // account where the atomicmarket contract is deployed
    "connected_reader": "atomic" // reader to which the API connects for live data
  }
}
```

#### authentication
This namespace allows token generation and authentication for eosio wallets.
It needs a smart contract which has an action with a nonce parameter

```javascript
{
  "name": "authentication",
  "path": "/authentication",
  "args": {
    "action": {
      "account": "utility11111", // contract name
      "name": "auth" // action name which has a nonce parameter and always throws
    }
  }
}
```
