import { HTTPServer } from './server';

export function getOpenApiDescription(server: HTTPServer): string {
    return '### EOSIO Contract API\n' +
        '*Made with ♥️ by [pink.network](https://pink.network/)*\n' +
        '#### Current Chain: ' + server.connection.chain.name + '\n' +
        `#### Provided by: [${server.config.provider_name}](${server.config.provider_url})`;
}

export function getOpenAPI3Responses(codes: number[], data: any) {
    const responses: {[key: string]: any} = {
        '200': {
            description: 'OK',
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: {
                            success: {type: 'boolean', default: true},
                            data: data
                        }
                    }
                }
            }
        },
        '401': {
            description: 'Unauthorized',
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: {
                            success: {type: 'boolean', default: false},
                            message: {type: 'string'}
                        }
                    }
                }
            }
        },
        '500': {
            description: 'Internal Server Error',
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: {
                            success: {type: 'boolean', default: false},
                            message: {type: 'string'}
                        }
                    }
                }
            }
        }
    };

    const result: {[key: string]: any} = {};

    for (const code of codes) {
        result[String(code)] = responses[String(code)];
    }

    return result;
}
