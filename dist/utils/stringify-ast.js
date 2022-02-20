"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stringifyAst = void 0;
const astring_1 = require("astring");
const astringOptions = Object.freeze({ indent: '', lineEnd: '' });
const stringifyAst = (ast) => (0, astring_1.generate)(ast, astringOptions);
exports.stringifyAst = stringifyAst;
