import { describe } from 'manten';
import webpack from 'webpack';

describe(`Webpack ${webpack.version}`, ({ runTestSuite }) => {
	const isWebpack5 = webpack.version?.startsWith('5.');

	runTestSuite(import('./specs/errors.spec.js'));
	runTestSuite(import('./specs/passing.spec.js'), isWebpack5);
	runTestSuite(import('./specs/localize-compiler.spec.js'));
	runTestSuite(import('./specs/chunkhash.spec.js'));
	runTestSuite(import('./specs/contenthash.spec.js'), isWebpack5);
});
