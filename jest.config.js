const useWebpack5 = process.env.WEBPACK === '5';

module.exports = {
	preset: 'es-jest',
	testEnvironment: 'node',
	moduleNameMapper: useWebpack5
		? {
			'^webpack$': 'webpack5',
			'^webpack(/.+)$': 'webpack5$1',
		}
		: {},
};
