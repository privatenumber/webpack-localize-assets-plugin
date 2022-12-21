import type { Configuration } from 'webpack';

export const configureWebpack = (config: Configuration) => {
	config.output!.filename = '[name].[locale].js';
	config.cache = false;
};
