import type { Options } from './types-options';

export default class LocalizeAssetsPlugin {
	constructor(options: Options<LocalizedData>): void;

	apply(compiler: any): void;
}
