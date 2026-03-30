import fs from 'fs/promises';
import { describe } from 'manten';
import webpack from 'webpack';
import { passingTests } from './specs/passing.spec.ts';
import { contenthashTests } from './specs/contenthash.spec.ts';

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

const isWebpack5 = webpack.version?.startsWith('5.');

await describe(`Webpack ${webpack.version}`, async () => {
	await removeWebpack5Cache();

	await import('./specs/errors.spec.ts');
	passingTests(isWebpack5);
	await import('./specs/localize-compiler.spec.ts');
	await import('./specs/chunkhash.spec.ts');
	contenthashTests(isWebpack5);
});

// Force exit — webpack leaves open handles that prevent natural process exit
process.exit();
