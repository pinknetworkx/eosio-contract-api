import { ApiNamespace } from './namespaces/interfaces';
import { HTTPServer } from './server';
import { IServerConfig } from '../types/config';
import ConnectionManager from '../connections/manager';
import { getNamespaces } from './namespaces';

export default class ApiLoader {
    private readonly namespaces: ApiNamespace[];
    private readonly server: HTTPServer;

    constructor(private readonly config: IServerConfig, private readonly connection: ConnectionManager) {
        this.namespaces = getNamespaces(config.namespaces, connection);
        this.server = new HTTPServer(config, connection);
    }

    async listen(): Promise<void> {
        for (const namespace of this.namespaces) {
            await namespace.init();
            this.server.web.express.use(namespace.path, await namespace.router(this.server.web));
            await namespace.socket(this.server.socket);
        }

        this.server.listen();
    }
}
