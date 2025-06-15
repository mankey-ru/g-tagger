import { type WriteStream } from 'node:fs';
import path from 'node:path';

import { createWriteStreamWithDirs, trPad } from './common.js';

export class JsonArrayLogger<T = unknown> {
	private stream: WriteStream;
	private firstItem = true;
	private closed = false;

	private constructor(stream: WriteStream) {
		this.stream = stream;
	}

	static async create<T>(filePath: string): Promise<JsonArrayLogger<T>> {
		const stream = await createWriteStreamWithDirs(filePath);
		stream.write('[\n');
		return new JsonArrayLogger<T>(stream);
	}

	async writeItem(item: T): Promise<void> {
		if (this.closed) {
			throw new Error('Cannot write to closed logger');
		}

		const separator = this.firstItem ? '' : ',\n';
		this.firstItem = false;

		return new Promise((resolve, reject) => {
			const stringifiedItem = safeStringify(item); // JSON.stringify(item)
			this.stream.write(`${separator}${stringifiedItem}`, (err) => (err ? reject(err) : resolve()));
		});
	}

	async close(): Promise<void> {
		if (this.closed) return;
		this.closed = true;

		return new Promise((resolve, reject) => {
			this.stream.write('\n]', (err) => {
				if (err) reject(err);
				else {
					this.stream.end(() => {
						const logFilePath = path.resolve(this.stream.path.toString());
						const copyCommand = `npm run copy-notfound -- -i ${logFilePath.replaceAll(/\\/g, '\\\\')}`;
						console.log(
							`${trPad}Лог JSON сохранён в ${logFilePath}. Команда копирования ненайденных:${copyCommand}`
						);
						resolve();
					});
				}
			});
		});
	}
}

function safeStringify(obj: any): string {
	const replacer = (key: string, value: any) => {
		if (value?.type === 'Buffer' || value instanceof Buffer) {
			return '[Buffer] (replaced value by JsonArrayLogger)';
		}
		return value;
	};

	return JSON.stringify(obj, replacer, '\t');
}
