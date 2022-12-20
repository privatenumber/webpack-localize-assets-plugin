import { sha256 } from '../utils/sha256.js';

export const assetNamePlaceholder = `[locale:${sha256('locale-placeholder').slice(0, 8)}]`;

const assetNamePlaceholderPattern = new RegExp(assetNamePlaceholder.replace(/[[\]]/g, '\\$&'), 'g');

export const insertToAssetName = (
	assetName: string,
	replaceWith: string,
) => assetName.replace(assetNamePlaceholderPattern, replaceWith);
