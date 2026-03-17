import type MagicString from 'magic-string';
import { findSubstringLocations, replaceAll } from '../utils/strings.js';
import { sha256 } from '../utils/sha256.js';
import type { LocaleData } from '../utils/load-locale-data.js';
import { WP5 } from '../types-internal.js';

type Asset = ReturnType<WP5.Compilation['getAsset']>;

const getAllContentHashes = (assets: Readonly<Asset>[]) => assets.flatMap(
	(asset) => {
		const { contenthash } = asset.info;
		return contenthash ?? [];
	},
);

export const createHashManager = (
	assets: Readonly<Asset>[],
	locales: LocaleData,
) => {
	const contentHashes = getAllContentHashes(assets);
	const localizedContentHashes = new Map<string, string>();

	for (const contentHash of contentHashes) {
		for (const locale of locales.names) {
			localizedContentHashes.set(
				contentHash + locale,
				sha256(contentHash + locale).slice(0, contentHash.length),
			);
		}
	}

	return {
		insertLocalizedContentHash(
			localizedAssetName: string,
			assetInfo: Asset['info'],
			locale: string,
		) {
			const { contenthash } = assetInfo;
			if (contenthash) {
				const getLocalizedHash = (hash: string) => {
					const newContentHash = localizedContentHashes.get(hash + locale) ?? hash;
					localizedAssetName = replaceAll(localizedAssetName, hash, newContentHash);
					return newContentHash;
				};

				assetInfo.contenthash = (
					Array.isArray(contenthash)
						? contenthash.map(getLocalizedHash)
						: getLocalizedHash(contenthash)
				);
			}

			return localizedAssetName;
		},

		getHashLocations(
			sourceString: string,
		) {
			// Find references to content hash to replace with localized content hash
			const contentHashLocations = contentHashes.map(
				hash => [hash, findSubstringLocations(sourceString, hash)] as const,
			);
			// indicate nothing to do here
			if (contentHashLocations.length === 0) {
				return undefined;
			}

			return (
				ms: MagicString.default,
				{ locale }: { locale: string },
			) => {
				for (const [hash, locations] of contentHashLocations) {
					const localizedHash = localizedContentHashes.get(hash + locale)!;
					for (const location of locations) {
						ms.overwrite(
							location,
							location + hash.length,
							localizedHash,
						);
					}
				}
			};
		},
	};
};
