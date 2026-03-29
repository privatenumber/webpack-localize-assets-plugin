import type { Options } from './types-external.js';

export default class LocalizeAssetsPlugin<LocalizedData = string> {
	constructor(options: Options<LocalizedData>);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	apply(compiler: any): void;
}
