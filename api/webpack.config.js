const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');
const nodeExternals = require('webpack-node-externals');

const workspaceLibsBundled = [
  '@upstart/back-office/shared',
];

module.exports = {
  output: {
    path: join(__dirname, '../dist/api'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  externals: [
    nodeExternals({
      modulesDir: join(__dirname, '../node_modules'),
      allowlist: workspaceLibsBundled,
    }),
  ],
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: [],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: true,
      sourceMap: true,
      mergeExternals: true,
      externalDependencies: 'none',
    }),
  ],
};
