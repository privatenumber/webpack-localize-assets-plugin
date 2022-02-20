"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadLocales = void 0;
const path_1 = __importDefault(require("path"));
const has_own_prop_1 = __importDefault(require("has-own-prop"));
const loadJson = (fs, jsonPath) => {
    const stringContent = fs.readFileSync(jsonPath).toString();
    return JSON.parse(stringContent);
};
function loadLocales(fs, unprocessedLocales) {
    const locales = {};
    const fileDependencies = new Set();
    for (const localeName in unprocessedLocales) {
        if (!(0, has_own_prop_1.default)(unprocessedLocales, localeName)) {
            continue;
        }
        const localeValue = unprocessedLocales[localeName];
        if (typeof localeValue === 'string') {
            const resolvedPath = path_1.default.resolve(localeValue);
            locales[localeName] = loadJson(fs, resolvedPath);
            fileDependencies.add(resolvedPath);
        }
        else {
            locales[localeName] = localeValue;
        }
    }
    return {
        locales,
        fileDependencies,
    };
}
exports.loadLocales = loadLocales;
