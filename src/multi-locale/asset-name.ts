import { sha256 } from '../utils/sha256.js';
import { replaceAll } from '../utils/strings';

export const assetNamePlaceholder = `[locale:${sha256('locale-placeholder').slice(0, 8)}]`;

export const insertToAssetName = (
	assetName: string,
	replaceWith: string,
) => replaceAll(
	assetName,
	assetNamePlaceholder,
	replaceWith,
);
