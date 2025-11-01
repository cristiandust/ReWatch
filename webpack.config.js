const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const isProduction = process.env.NODE_ENV === 'production';

const resolveExtensions = ['.ts', '.tsx', '.js', '.jsx'];

const resolveConfig = {
  extensions: resolveExtensions,
  alias: {
    '@background': path.resolve(__dirname, 'src/background'),
    '@content': path.resolve(__dirname, 'src/content'),
    '@popup': path.resolve(__dirname, 'src/popup'),
    '@shared': path.resolve(__dirname, 'src/shared')
  }
};

const commonRules = [
  {
    test: /\.(ts|tsx)$/,
    use: 'ts-loader',
    exclude: /node_modules/
  },
  {
    test: /\.css$/,
    use: [MiniCssExtractPlugin.loader, 'css-loader']
  },
  {
    test: /\.(png|jpe?g|gif|svg)$/i,
    type: 'asset/resource'
  }
];

const copyPlugin = new CopyWebpackPlugin({
  patterns: [
    { from: 'manifest.json', to: 'manifest.json' },
    { from: 'privacy-policy.html', to: 'privacy-policy.html', noErrorOnMissing: true },
    { from: 'icons', to: 'icons', noErrorOnMissing: true },
    { from: 'public', to: '.', noErrorOnMissing: true }
  ]
});

const outputPath = path.resolve(__dirname, 'dist');

const backgroundConfig = {
  name: 'background',
  mode: isProduction ? 'production' : 'development',
  target: 'webworker',
  devtool: isProduction ? false : 'source-map',
  entry: path.resolve(__dirname, 'src/background/index.ts'),
  output: {
    filename: 'background.js',
    path: outputPath,
    clean: true
  },
  module: {
    rules: commonRules
  },
  resolve: resolveConfig,
  plugins: [copyPlugin, new MiniCssExtractPlugin({ filename: 'background.css' })]
};

const contentConfig = {
  name: 'content',
  mode: isProduction ? 'production' : 'development',
  target: 'web',
  devtool: isProduction ? false : 'source-map',
  entry: path.resolve(__dirname, 'src/content/index.ts'),
  output: {
    filename: 'content.js',
    path: outputPath
  },
  module: {
    rules: commonRules
  },
  resolve: resolveConfig,
  plugins: [new MiniCssExtractPlugin({ filename: 'content.css' })]
};

const popupConfig = {
  name: 'popup',
  mode: isProduction ? 'production' : 'development',
  target: 'web',
  devtool: isProduction ? false : 'source-map',
  entry: path.resolve(__dirname, 'src/popup/index.tsx'),
  output: {
    filename: 'popup.js',
    path: outputPath
  },
  module: {
    rules: commonRules
  },
  resolve: resolveConfig,
  plugins: [
    new MiniCssExtractPlugin({ filename: 'popup.css' }),
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, 'src/popup/index.html'),
      filename: 'popup.html'
    })
  ]
};

module.exports = [backgroundConfig, contentConfig, popupConfig];