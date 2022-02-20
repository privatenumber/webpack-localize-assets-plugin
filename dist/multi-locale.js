"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateLocalizedAssets = exports.markLocalizeFunction = exports.fileNameTemplatePlaceholder = void 0;
const magic_string_1 = __importDefault(require("magic-string"));
const webpack_sources_1 = require("webpack-sources");
const WebpackError_js_1 = __importDefault(require("webpack/lib/WebpackError.js"));
const acorn_1 = require("acorn");
const webpack_1 = require("./utils/webpack");
const sha256_1 = require("./utils/sha256");
const call_localize_compiler_1 = require("./utils/call-localize-compiler");
const stringify_ast_1 = require("./utils/stringify-ast");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { name } = require('../package.json');
function findSubstringRanges(string, substring) {
    const ranges = [];
    let range = null;
    let index = string.indexOf(substring);
    while (index > -1) {
        if (!range) {
            range = { start: index };
        }
        else {
            range.end = index + substring.length;
            ranges.push(range);
            range = null;
        }
        index = string.indexOf(substring, index + 1);
    }
    return ranges;
}
function findSubstringLocations(string, substring) {
    const indices = [];
    let index = string.indexOf(substring);
    while (index > -1) {
        indices.push(index);
        index = string.indexOf(substring, index + 1);
    }
    return indices;
}
exports.fileNameTemplatePlaceholder = `[locale:${(0, sha256_1.sha256)('locale-placeholder').slice(0, 8)}]`;
const fileNameTemplatePlaceholderPattern = new RegExp(exports.fileNameTemplatePlaceholder.replace(/[[\]]/g, '\\$&'), 'g');
const isJsFile = /\.js$/;
const isSourceMap = /\.js\.map$/;
const placeholderFunctionName = `localizeAssetsPlugin${(0, sha256_1.sha256)('localize-assets-plugin-placeholder').slice(0, 8)}`;
function markLocalizeFunction(callExpression) {
    if (callExpression.callee.type !== 'Identifier') {
        throw new Error('Expected Identifier');
    }
    return `${placeholderFunctionName}(${(0, stringify_ast_1.stringifyAst)(callExpression)})+${placeholderFunctionName}`;
}
exports.markLocalizeFunction = markLocalizeFunction;
function getOriginalCall(node) {
    if (node.type !== 'BinaryExpression') {
        throw new Error('Expected BinaryExpression');
    }
    if (node.left.type !== 'CallExpression') {
        throw new Error('Expected CallExpression');
    }
    if (node.left.arguments[0].type !== 'CallExpression') {
        throw new Error('Expected CallExpression');
    }
    return node.left.arguments[0];
}
function locatePlaceholders(sourceString) {
    const placeholderRanges = findSubstringRanges(sourceString, placeholderFunctionName);
    const placeholderLocations = [];
    for (const placeholderRange of placeholderRanges) {
        const code = sourceString
            .slice(placeholderRange.start, placeholderRange.end)
            .replace(/\\"/g, '"'); // In devtools: eval, so unescape \" used in eval("...")
        const node = (0, acorn_1.parseExpressionAt)(code, 0, { ecmaVersion: 'latest' });
        placeholderLocations.push({
            node: getOriginalCall(node),
            range: placeholderRange,
        });
    }
    return placeholderLocations;
}
function localizeAsset(locales, locale, assetName, placeholderLocations, fileNamePlaceholderLocations, contentHashReplacements, source, map, compilation, localizeCompiler, trackStringKeys) {
    const localeData = locales[locale];
    const magicStringInstance = new magic_string_1.default(source);
    // Localize strings
    for (const { node, range } of placeholderLocations) {
        const stringKey = node.arguments[0].value;
        const localizedCode = (0, call_localize_compiler_1.callLocalizeCompiler)(localizeCompiler, {
            callNode: node,
            resolveKey: (key = stringKey) => localeData[key],
            emitWarning: (message) => {
                const hasWarning = compilation.warnings.find(warning => warning.message === message);
                if (!hasWarning) {
                    compilation.warnings.push(new WebpackError_js_1.default(message));
                }
            },
            emitError: (message) => {
                const hasError = compilation.errors.find(error => error.message === message);
                if (!hasError) {
                    compilation.errors.push(new WebpackError_js_1.default(message));
                }
            },
        }, locale);
        magicStringInstance.overwrite(range.start, range.end, localizedCode);
        // For Webpack 5 cache hits
        trackStringKeys === null || trackStringKeys === void 0 ? void 0 : trackStringKeys.delete(stringKey);
    }
    // Localize chunk requests
    for (const location of fileNamePlaceholderLocations) {
        magicStringInstance.overwrite(location, location + exports.fileNameTemplatePlaceholder.length, locale);
    }
    for (const [range, replacement] of contentHashReplacements) {
        magicStringInstance.overwrite(range.start, range.end, replacement);
    }
    const localizedCode = magicStringInstance.toString();
    if (map) {
        const newSourceMap = magicStringInstance.generateMap({
            source: assetName,
            includeContent: true,
        });
        return new webpack_sources_1.SourceMapSource(localizedCode, assetName, newSourceMap, source, map, true);
    }
    return new webpack_sources_1.RawSource(localizedCode);
}
function generateLocalizedAssets(compilation, localeNames, locales, sourceMapForLocales, trackStringKeys, localizeCompiler) {
    const generateLocalizedAssetsHandler = async () => {
        const assetsWithInfo = compilation.getAssets()
            .filter(asset => asset.name.includes(exports.fileNameTemplatePlaceholder));
        const contentHashMap = new Map(assetsWithInfo
            .flatMap((asset) => {
            // Add locale to hash for RealContentHashPlugin plugin
            const { contenthash } = asset.info;
            if (!contenthash) {
                return [];
            }
            const contentHashArray = Array.isArray(contenthash)
                ? contenthash
                : [contenthash];
            return contentHashArray.map(chash => [
                chash,
                new Map(localeNames.map(locale => [
                    locale,
                    (0, sha256_1.sha256)(chash + locale).slice(0, chash.length),
                ])),
            ]);
        }));
        await Promise.all(assetsWithInfo.map(async (asset) => {
            const { source, map } = asset.source.sourceAndMap();
            const localizedAssetNames = [];
            if (isJsFile.test(asset.name)) {
                const sourceString = source.toString();
                const placeholderLocations = locatePlaceholders(sourceString);
                const fileNamePlaceholderLocations = findSubstringLocations(sourceString, exports.fileNameTemplatePlaceholder);
                const contentHashLocations = [...contentHashMap.entries()]
                    .flatMap(([hash, hashesByLocale]) => findSubstringLocations(sourceString, hash)
                    .map(loc => [
                    { start: loc, end: loc + hash.length },
                    hashesByLocale,
                ]));
                await Promise.all(localeNames.map(async (locale) => {
                    var _a, _b, _c, _d;
                    const contentHashReplacements = contentHashLocations.map(([range, hashesByLocale]) => [
                        range,
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        hashesByLocale.get(locale),
                    ]);
                    let newAssetName = asset.name.replace(fileNameTemplatePlaceholderPattern, locale);
                    // object spread breaks types
                    // eslint-disable-next-line prefer-object-spread
                    const newInfo = Object.assign({}, asset.info, { locale });
                    // Add locale to hash for RealContentHashPlugin plugin
                    if (newInfo.contenthash) {
                        const { contenthash } = newInfo;
                        if (Array.isArray(contenthash)) {
                            const newContentHashes = [];
                            for (const chash of contenthash) {
                                const newContentHash = (_b = (_a = contentHashMap.get(chash)) === null || _a === void 0 ? void 0 : _a.get(locale)) !== null && _b !== void 0 ? _b : chash;
                                newContentHashes.push(newContentHash);
                                newAssetName = newAssetName.replace(chash, newContentHash);
                            }
                            newInfo.contenthash = newContentHashes;
                        }
                        else {
                            const newContentHash = (_d = (_c = contentHashMap.get(contenthash)) === null || _c === void 0 ? void 0 : _c.get(locale)) !== null && _d !== void 0 ? _d : contenthash;
                            newAssetName = newAssetName.replace(contenthash, newContentHash);
                            newInfo.contenthash = newContentHash;
                        }
                    }
                    localizedAssetNames.push(newAssetName);
                    const localizedSource = localizeAsset(locales, locale, newAssetName, placeholderLocations, fileNamePlaceholderLocations, contentHashReplacements, sourceString, sourceMapForLocales.includes(locale) && map, compilation, localizeCompiler, trackStringKeys);
                    // @ts-expect-error Outdated @type
                    compilation.emitAsset(newAssetName, localizedSource, newInfo);
                }));
            }
            else {
                let localesToIterate = localeNames;
                if (isSourceMap.test(asset.name) && sourceMapForLocales) {
                    localesToIterate = sourceMapForLocales;
                }
                await Promise.all(localesToIterate.map(async (locale) => {
                    const newAssetName = asset.name.replace(fileNameTemplatePlaceholderPattern, locale);
                    localizedAssetNames.push(newAssetName);
                    // @ts-expect-error Outdated @type
                    compilation.emitAsset(newAssetName, asset.source, asset.info);
                }));
            }
            // Delete original unlocalized asset
            (0, webpack_1.deleteAsset)(compilation, asset.name, localizedAssetNames);
        }));
    };
    if ((0, webpack_1.isWebpack5Compilation)(compilation)) {
        /**
         * Important this this happens before PROCESS_ASSETS_STAGE_OPTIMIZE_HASH, which is where
         * RealContentHashPlugin re-hashes assets:
         * https://github.com/webpack/webpack/blob/f0298fe46f/lib/optimize/RealContentHashPlugin.js#L140
         *
         * PROCESS_ASSETS_STAGE_SUMMARIZE happens after minification
         * (PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE) but before re-hashing
         * (PROCESS_ASSETS_STAGE_OPTIMIZE_HASH).
         *
         * PROCESS_ASSETS_STAGE_SUMMARIZE isn't actually used by Webpack, but there seemed
         * to be other plugins that were relying on it to summarize assets, so it makes sense
         * to run just before that.
         *
         * All "process assets" stages:
         * https://github.com/webpack/webpack/blob/f0298fe46f/lib/Compilation.js#L5125-L5204
         */
        const Webpack5Compilation = compilation.constructor;
        compilation.hooks.processAssets.tapPromise({
            name,
            stage: Webpack5Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE - 1,
            additionalAssets: true,
        }, generateLocalizedAssetsHandler);
    }
    else {
        // Triggered after minification, which usually happens in optimizeChunkAssets
        compilation.hooks.optimizeAssets.tapPromise(name, generateLocalizedAssetsHandler);
    }
}
exports.generateLocalizedAssets = generateLocalizedAssets;
