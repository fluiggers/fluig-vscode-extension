//@ts-check

'use strict';

const path = require('path');
const webpack = require('webpack');

/**@type {import('webpack').Configuration}*/
const config = {
  target: 'node', // vscode extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/
	mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')

  entry: './src/extension.ts', // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  devtool: 'nosources-source-map',
  externals: {
    vscode: 'commonjs vscode' // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
  },
  resolve: {
    // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        include: path.resolve(__dirname, 'src', 'bpmn'),
        use: [
          {
            loader: 'ts-loader',
            options: { transpileOnly: true }
          }
        ]
      },
      {
        test: /\.ts$/,
        exclude: [
          /node_modules/,
          path.resolve(__dirname, 'src', 'bpmn')
        ],
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  }
};
/**
 * CLI que edita .process fora do VS Code, para agentes e scripts. Reusa os módulos de src/bpmn
 * que não importam `vscode`.
 * @type {import('webpack').Configuration}
 */
const cliConfig = {
  ...config,
  entry: './src/bpmn/cli/main.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'fluig-bpmn.js',
    libraryTarget: 'commonjs2'
  },
  externals: {},
  plugins: [new webpack.BannerPlugin({ banner: '#!/usr/bin/env node', raw: true, entryOnly: true })]
};

module.exports = [config, cliConfig];
