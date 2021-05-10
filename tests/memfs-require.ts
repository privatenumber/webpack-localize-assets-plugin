import vm from 'vm';
import path from 'path';
import Module from 'module';

const isFilePath = /^[./]/;
const hasExtension = /\.\w+$/;

export interface FileSystem {
    readFileSync(
		path: string | Buffer | URL | number,
		options?: { encoding?: null; flag?: string } | null
	): Buffer;
}

export const createMemRequire = <T extends FileSystem>(mfs: T) => {
	function makeRequire(module) {
		function require(modulePath) {
			if (isFilePath.test(modulePath) && !hasExtension.test(modulePath)) {
				modulePath += '.js';
			}
			const filename = path.resolve(path.dirname(module.filename), modulePath);
			const newModule = new Module(filename, module);
			newModule.filename = filename;

			const sourceCode = Module.wrap(mfs.readFileSync(filename).toString());
			vm.runInNewContext(sourceCode)(newModule.exports, makeRequire(newModule), newModule);
			return newModule.exports;
		}

		return require;
	}

	return makeRequire(module);
};
