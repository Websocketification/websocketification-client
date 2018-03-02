'use strict';

let path = require('path');

module.exports = {
	// mode: 'development',
	mode: 'production',
	bail: true,
	devtool: 'source-map',
	entry: './src',
	output: {
		path: path.join(__dirname, 'dist'),
		filename: 'WebsocketificationClient.js',
		// @see https://webpack.js.org/guides/author-libraries/
		library: 'WebsocketificationClient',
		libraryTarget: 'umd',
	},
	module: {
		rules: [{
			// @see https://github.com/babel/babel-loader
			test: /\.js$/,
			exclude: /(node_modules|bower_components)/,
			use: {loader: 'babel-loader'}
		}]
	}
};
