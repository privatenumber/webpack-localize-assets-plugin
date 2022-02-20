"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.interpolateLocaleToFileName = void 0;
const assert_1 = __importDefault(require("assert"));
const webpack_1 = require("./webpack");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { name } = require('../../package.json');
const interpolateLocaleToFileName = (compilation, replaceWith, requireLocaleInFilename) => {
    const { filename, chunkFilename } = compilation.outputOptions;
    if (requireLocaleInFilename) {
        if (typeof filename === 'string') {
            (0, assert_1.default)(filename.includes('[locale]'), 'output.filename must include [locale]');
        }
        if (typeof chunkFilename === 'string') {
            (0, assert_1.default)(chunkFilename.includes('[locale]'), 'output.chunkFilename must include [locale]');
        }
    }
    const interpolateHook = (filePath, data) => {
        // Only for WP4. In WP5, the function is already called.
        // WP4: https://github.com/webpack/webpack/blob/758269e/lib/TemplatedPathPlugin.js#L84
        if (typeof filePath === 'function') {
            filePath = filePath(data);
        }
        filePath = filePath.replace(/\[locale\]/g, replaceWith);
        return filePath;
    };
    if ((0, webpack_1.isWebpack5Compilation)(compilation)) {
        compilation.hooks.assetPath.tap(name, interpolateHook);
    }
    else {
        // @ts-expect-error Missing assetPath hook from @type
        compilation.mainTemplate.hooks.assetPath.tap(name, interpolateHook);
    }
};
exports.interpolateLocaleToFileName = interpolateLocaleToFileName;
