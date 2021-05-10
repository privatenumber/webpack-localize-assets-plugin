import fs from 'fs';
import path from 'path';
import webpack, { OutputFileSystem } from 'webpack';
import { ufs } from 'unionfs';
import { IFS } from 'unionfs/lib/fs.js';
import { Volume, DirectoryJSON } from 'memfs';
import AggregateError from 'aggregate-error';
import { FileSystem } from './memfs-require';

export function assertFsWithReadFileSync(
	mfs: webpack.OutputFileSystem,
): asserts mfs is webpack.OutputFileSystem & FileSystem {
	if (!('readFileSync' in mfs)) {
		throw new Error('Oh no, user has no displayName');
	}
}

const mfsFromJson = (volJson: DirectoryJSON): webpack.OutputFileSystem => {
	const mfs = Volume.fromJSON(volJson) as unknown as OutputFileSystem;
	mfs.join = path.join;
	return mfs;
};

export function build(
	volJson: DirectoryJSON,
	callback: (config: webpack.Configuration) => void,
) {
	return new Promise<webpack.Stats>((resolve, reject) => {
		const mfs = mfsFromJson(volJson);
		const config: webpack.Configuration = {
			mode: 'production',
			target: 'node',
			entry: {
				index: '/src/index.js',
			},
			module: {
				rules: [],
			},
			optimization: {
				minimize: false,
			},
			output: {
				filename: '[name].[locale].js',
				path: '/dist',
				libraryTarget: 'commonjs2',
				libraryExport: 'default',
			},
			plugins: [],
		};

		if (callback) {
			callback(config);
		}

		const compiler = webpack(config);

		compiler.inputFileSystem = ufs.use(fs).use(mfs as unknown as IFS);
		compiler.outputFileSystem = mfs;

		compiler.run((error, stats) => {
			if (error) {
				reject(error);
				return;
			}

			if (stats.hasErrors()) {
				reject(new AggregateError(stats.compilation.errors));
				return;
			}

			resolve(stats);
		});
	});
}
