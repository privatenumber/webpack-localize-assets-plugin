import type { Options } from './types-external.js';

export default class LocalizeAssetsPlugin<LocalizedData = string> {
	constructor(options: Options<LocalizedData>);

	apply(compiler: any): void;
}
