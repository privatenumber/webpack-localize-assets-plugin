"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.onFunctionCall = exports.reportModuleError = exports.reportModuleWarning = exports.deleteAsset = exports.toConstantDependency = exports.isWebpack5Compilation = exports.isWebpack5 = void 0;
const webpack_1 = __importDefault(require("webpack"));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { name } = require('../../package.json');
const isWebpack5 = (wp) => {
    const [major] = wp.version ? wp.version.split('.') : [];
    return major === '5';
};
exports.isWebpack5 = isWebpack5;
const isWebpack5Compilation = (compilation) => ('processAssets' in compilation.hooks);
exports.isWebpack5Compilation = isWebpack5Compilation;
exports.toConstantDependency = ((0, exports.isWebpack5)(webpack_1.default)
    ? require('webpack/lib/javascript/JavascriptParserHelpers') // eslint-disable-line node/global-require,import/no-unresolved
    : require('webpack/lib/ParserHelpers') // eslint-disable-line node/global-require
).toConstantDependency;
const deleteAsset = (compilation, assetName, newAssetNames) => {
    // Delete original unlocalized asset
    if ((0, exports.isWebpack5Compilation)(compilation)) {
        for (const chunk of compilation.chunks) {
            if (chunk.files.has(assetName)) {
                for (const newAssetName of newAssetNames) {
                    chunk.files.add(newAssetName);
                }
            }
            if (chunk.auxiliaryFiles.has(assetName)) {
                for (const newAssetName of newAssetNames) {
                    chunk.auxiliaryFiles.add(newAssetName);
                }
            }
        }
        compilation.deleteAsset(assetName);
    }
    else {
        delete compilation.assets[assetName];
        /**
         * To support terser-webpack-plugin v1.4.5 (bundled with Webpack 4)
         * which iterates over chunks instead of assets
         * https://github.com/webpack-contrib/terser-webpack-plugin/blob/v1.4.5/src/index.js#L176
         */
        for (const chunk of compilation.chunks) {
            const hasAsset = chunk.files.indexOf(assetName);
            if (hasAsset > -1) {
                chunk.files.splice(hasAsset, 1, ...newAssetNames);
            }
        }
    }
};
exports.deleteAsset = deleteAsset;
const reportModuleWarning = (module, warning) => {
    if ('addWarning' in module) {
        module.addWarning(warning);
    }
    else {
        module.warnings.push(warning);
    }
};
exports.reportModuleWarning = reportModuleWarning;
const reportModuleError = (module, error) => {
    if ('addError' in module) {
        module.addError(error);
    }
    else {
        module.errors.push(error);
    }
};
exports.reportModuleError = reportModuleError;
const onFunctionCall = (normalModuleFactory, functionName, hook) => {
    const handler = (parser) => {
        parser.hooks.call.for(functionName).tap(name, node => hook(parser, node));
    };
    normalModuleFactory.hooks.parser
        .for('javascript/auto')
        .tap(name, handler);
    normalModuleFactory.hooks.parser
        .for('javascript/dynamic')
        .tap(name, handler);
    normalModuleFactory.hooks.parser
        .for('javascript/esm')
        .tap(name, handler);
};
exports.onFunctionCall = onFunctionCall;
