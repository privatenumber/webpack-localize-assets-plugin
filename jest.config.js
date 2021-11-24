const useWebpack5 = process.env.WEBPACK === '5';

module.exports = {
	preset: 'es-jest',
	moduleNameMapper: useWebpack5
		? {
			'^webpack$': 'webpack5',
			'^webpack(/.+)$': 'webpack5$1',
		}
		: {},
};
