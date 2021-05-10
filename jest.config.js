const useWebpack5 = process.env.WEBPACK === '5';

module.exports = {
	preset: 'es-jest',
	transformIgnorePatterns: [
		'node_modules/.pnpm(?!/(aggregate-error|indent-string|clean-stack|escape-string-regexp))',
	],
	testEnvironment: 'node',
	moduleNameMapper: useWebpack5
		? {
			'^webpack$': 'webpack5',
			'^webpack(/.+)$': 'webpack5$1',
		}
		: {},
};
