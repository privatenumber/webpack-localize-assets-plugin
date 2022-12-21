import type MagicString from 'magic-string';
import { sha256 } from '../utils/sha256.js';
import { replaceAll, findSubstringLocations } from '../utils/strings';

export const assetNamePlaceholder = `[locale:${sha256('locale-placeholder').slice(0, 8)}]`;

export const localizeAssetName = (
	assetName: string,
	locale: string,
) => replaceAll(
	assetName,
	assetNamePlaceholder,
	locale,
);

export const createLocalizedAssetNameInserter = (
	sourceString: string,
) => {
	const fileNamePlaceholderLocations = findSubstringLocations(
		sourceString,
		assetNamePlaceholder,
	);

	return (
		ms: MagicString,
		{ locale }: { locale: string },
	) => {
		for (const location of fileNamePlaceholderLocations) {
			ms.overwrite(
				location,
				location + assetNamePlaceholder.length,
				locale,
			);
		}
	};
};
