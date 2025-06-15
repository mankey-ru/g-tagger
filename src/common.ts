import fs, { type WriteStream } from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------
// Переменные окружения
// ---------------------------------------------------------------------
import dotenv from 'dotenv';
dotenv.config();
export const discogsUserToken = process.env.DISCOGS_USER_TOKEN;
if (!discogsUserToken) {
	throw new Error('DISCOGS_USER_TOKEN is not defined. See README.md for instructions.');
}

// ---------------------------------------------------------------------
// Данные из package.json
// ---------------------------------------------------------------------
export const {
	npm_package_version: appVersion = '',
	npm_package_name: appName = 'appName-undef',
	npm_package_description: appDescription = 'appDescription-undef',
} = process.env;
if (!appVersion) throw new Error(`appVersion is not defined. Run the script with npm start or any npm command`);

export const trPad = '  ';

export const projectRoot = path.resolve();

export async function createWriteStreamWithDirs(filePath: string, options = {}): Promise<WriteStream> {
	const dir = path.dirname(filePath);

	// Check if directory exists in an async way
	await new Promise<void>((resolve, reject) => {
		fs.stat(dir, (err, stats) => {
			if (err) {
				if (err.code === 'ENOENT') {
					// Directory doesn't exist, create it
					fs.mkdir(dir, { recursive: true }, (mkdirErr) => {
						if (mkdirErr) reject(mkdirErr);
						else resolve();
					});
				} else {
					reject(err);
				}
			} else if (!stats.isDirectory()) {
				reject(new Error(`Path exists but is not a directory: ${dir}`));
			} else {
				resolve();
			}
		});
	});

	// Now create and return the write stream
	return fs.createWriteStream(filePath, options);
}
