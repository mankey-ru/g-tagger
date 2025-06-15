import fs, { type WriteStream } from 'node:fs';
import path from 'node:path';
import { inspect } from 'node:util';
import { trPad } from './common.js';
import { createWriteStreamWithDirs, projectRoot } from './common.js';
import { JsonArrayLogger } from './json-array-logger.js';

// Конфигурим логирование
const logDirName = 'logs';
const logFilePrefix = formatDate();
const logFilePath = path.resolve(path.join(projectRoot, logDirName, `${logFilePrefix}_main.log`));
const emptyLogOnStart = true;
const logFileMode = emptyLogOnStart ? 'w' : 'a';
let logStream: WriteStream | null = null;

const notFoundFilePath = path.join(projectRoot, logDirName, `${logFilePrefix}_notfound.json`);
export const notFoundLogger = await JsonArrayLogger.create<GtaggerSkippedItem>(notFoundFilePath);

export async function logStart() {
	logStream = await createWriteStreamWithDirs(logFilePath, { flags: logFileMode });
}

export async function logEnd() {
	if (logStream) {
		logStream.end(() => {
			if (logFilePath) {
				console.log(`${trPad}Лог консоли сохранён в ${path.resolve(logFilePath)}`);
			}
		});
	} else {
		throw Error(`logStream is not defined. Need to run logStart() first.`);
	}
}

export function log(...args: Array<any>): void {
	const message = smartStringify(...args).join(' ');
	const msgLineWithDate = `${new Date().toLocaleString('ru')}  ${message}`;
	console.log(message);
	if (logStream) {
		logStream.write(`${msgLineWithDate}\n`);
	} else {
		throw Error(`logStream is not defined. Need to run logStart() first.`);
	}
}

function smartStringify(...args: Array<any>): Array<string> {
	// https://nodejs.org/api/util.html#utilinspectobject-showhidden-depth-colors
	const inspectOpts = {
		depth: 5,
		colors: true,
		compact: 2,
		sorted: true,
	};
	// добавить обработку arg если это инстанс Эррор?
	const stringifiedArgs = Array.from(args).map((arg) => {
		// inspect добавляет строкам кавычки
		if (typeof arg === 'string') {
			return arg;
		}
		return inspect(arg, inspectOpts);
	});
	return stringifiedArgs;
}

/**
 * Возвращает местное время в YYYY-MM-DD__HH-MM-SS
 */
function formatDate(date: Date = new Date()): string {
	const tzOffset = date.getTimezoneOffset() * 60000;
	return new Date(date.getTime() - tzOffset).toISOString().replace('T', '__').replaceAll(':', '-').slice(0, 20);
}
