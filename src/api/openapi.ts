import { HTTPServer } from './server';

export function getOpenApiDescription(server: HTTPServer): string {
    return '### EOSIO Contract API\n' +
        '*Made with ♥️ by [pink.network](https://pink.network/)*\n' +
        '#### Current Chain: ' + server.connection.chain.name + '\n' +
        `#### Provided by: [${server.config.provider_name}](${server.config.provider_url})`;
}
