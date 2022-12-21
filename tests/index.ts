import fs from 'fs/promises';
import { describe } from 'manten';
import webpack from 'webpack';

const webpack5CachePath = './node_modules/.cache/webpack';
const removeWebpack5Cache = async () => {
	const cacheExists = await fs.access(webpack5CachePath).then(
		() => true,
		() => false,
	);

	if (cacheExists) {
		await fs.rm(webpack5CachePath, {
			recursive: true,
			force: true,
		});
	}
};

describe(`Webpack ${webpack.version}`, async ({ runTestSuite }) => {
	const isWebpack5 = webpack.version?.startsWith('5.');

	await removeWebpack5Cache();

	runTestSuite(import('./specs/errors.spec.js'));
	runTestSuite(import('./specs/passing.spec.js'), isWebpack5);
	runTestSuite(import('./specs/localize-compiler.spec.js'));
	runTestSuite(import('./specs/chunkhash.spec.js'));
	runTestSuite(import('./specs/contenthash.spec.js'), isWebpack5);
});
