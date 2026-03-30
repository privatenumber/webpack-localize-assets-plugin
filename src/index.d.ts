import type { Options } from './types-external.ts';

export default class LocalizeAssetsPlugin<LocalizedData = string> {
	constructor(options: Options<LocalizedData>);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	apply(compiler: any): void;
}
