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

await describe(`Webpack ${webpack.version}`, async ({ runTestSuite }) => {
	const isWebpack5 = webpack.version?.startsWith('5.');

	await removeWebpack5Cache();

	runTestSuite(import('./specs/errors.spec.ts'));
	runTestSuite(import('./specs/passing.spec.ts'), isWebpack5);
	runTestSuite(import('./specs/localize-compiler.spec.ts'));
	runTestSuite(import('./specs/chunkhash.spec.ts'));
	runTestSuite(import('./specs/contenthash.spec.ts'), isWebpack5);
});

// Force exit — webpack leaves open handles that prevent natural process exit
process.exit();
