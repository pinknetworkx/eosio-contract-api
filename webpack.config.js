const path = require('path');
const nodeExternals = require('webpack-node-externals');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

const {
    NODE_ENV = 'production',
} = process.env;

module.exports = {
    entry: './src/bin/www.ts',
    target: 'node',
    mode: NODE_ENV,
    watch: NODE_ENV !== 'production',
    externals: [nodeExternals()],
    output: {
        path: path.resolve(__dirname, 'build'),
        filename: '[name].bundle.js'
    },
    resolve: { extensions: ['.ts', '.js'] },
    plugins: [
        new ForkTsCheckerWebpackPlugin()
    ],
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: [
                    {
                        loader: 'ts-loader',
                        options: {
                            configFile: 'tsconfig.json',
                            transpileOnly: true
                        }
                    }
                ],
            }
        ]
    }
}
