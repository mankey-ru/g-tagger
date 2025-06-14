import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ID3 from 'node-id3';
import axios from 'axios';
import ProgressBar from 'progress';

// Проверяем что приложению доступна версия из package.json (для этого оно должно было запущено через npm start)
const appVersion = process.env.npm_package_version;
if (!appVersion) throw `appVersion is not defined. Run the script with npm start`;

// Проверяем аргументы
// TODO внедрить взрослую систему https://chat.deepseek.com/a/chat/s/473446a9-9e29-4d85-a707-a403ad8fdab6
const forceWriteTags = true; // заменить на аргумент
const debugFilestrem = false; // заменить на аргумент
const directory = process.argv[2];
if (!directory) {
	console.log(`Usage: npm start -- <directory_path>`);
	console.log('Example: npm start -- "C:\\My Music"');
	process.exit(1);
}

// Запускаем тупые тесты
normalizeTitleTest();
normalizeArtistTest();

// Константы
const genreDelimiter = '➤';
const trPad = '  ';

// Загружаем конфиг
// Реквайр для JSON файлов
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, 'config.json');
let config;
try {
	config = require(configPath);
	if (!config.discogs || !config.discogs.userToken) {
		throw new Error('Invalid configuration: Missing Discogs userToken');
	}
} catch (err) {
	console.error('Error loading config file:', err.message);
	process.exit(1);
}

// Конфигурим запросы в Discogs
const DISCOGS_API_URL = 'https://api.discogs.com';
const discogsRequest = axios.create({
	baseURL: DISCOGS_API_URL,
	headers: {
		'User-Agent': 'MP3GenreTagger/1.0',
		'Authorization': `Discogs token=${config.discogs.userToken}`
	},
	timeout: 10000
});

// Конфигурим логирование
const logDirName = 'logs';
const logFilePrefix = formatDate();
const logFilePath = path.resolve(path.join(__dirname, logDirName, `${logFilePrefix}_main.log`));
const emptyLogOnStart = true;
const logFileMode = emptyLogOnStart ? 'w' : 'a';
const logStream = await createWriteStreamWithDirs(logFilePath, { flags: logFileMode });
function log (message) {
	const msgLineWithDate = `${new Date().toLocaleString(`ru`)}  ${message}`;
	if (config.logging.verbose) console.log(message);
	if (logStream) logStream.write(`${msgLineWithDate}\n`);
	// console.trace()
}

// Запускаем основную функцию
main(directory);

//await writeNotFoundFile(`skippedFilesStr`);
//console.error(`Done. Check log file: ${logFilePath}`);
//process.exit(0);

/**
 *
 * @param {string} tagArtist - artist from the tags
 * @param {string} tagTitle - title from the tags
 * @param {string} fileName - file name
 * @returns {Promise<GetDataFromDiscogsResult|null>} genres and styles of the release, or null if no
 * release is found
 */
async function getDataFromDiscogs (tagArtist, tagTitle, fileName) {
	try {
		// извлекаем из имени файла артиста и тайтл
		const filenameSep = getSeparatorByString(fileName);
		const filenameArr = fileName.split(filenameSep);
		const filenameArtist = filenameArr[0]
			.replaceAll('_', ' ') // для имен файлов типа "my_art_-_my_song"
			.replace(/^the\s+/i, ''); // для артистов в именах файлов типа "the orb" или "The Orb"
		const filenameTitle = filenameArr.slice(1).join(filenameSep)
			.replaceAll('_', ' '); // для имен файлов типа "my_art_-_my_song"
		// если артиста или тайтла нет в тегах
		if (!tagArtist) tagArtist = filenameArtist;
		if (!tagTitle) tagTitle = filenameTitle;

		const normalizedArtist = normalizeArtist(tagArtist)
		const normalizedTitle = normalizeTitle(tagTitle);
		const normalizedFilenameArtist = normalizeArtist(filenameArtist)
		const normalizedFilenameTitle = normalizeTitle(filenameTitle);

		const paramsConst = {
			type: 'release',
			per_page: 3,
			sort: `year`,
			sort_order: 'asc',
		}

		// Пробуем искать целиком
		log(`${trPad}[1] ищем из тегов артист + тайтл: «${normalizedArtist}» - «${normalizedTitle}»`);
		let searchResponse = await discogsRequest.get('/database/search', {
			params: {
				artist: normalizedArtist,
				track: normalizedTitle,
				...paramsConst,
			}
		});

		// Затем, если пусто, обрезаем скобки
		if (!searchResponse.data?.results?.length) {
			const normalizedTitleCut = normalizeTitle(tagTitle, true);
			if (normalizedTitleCut !== normalizedTitle) {
				log(`${trPad}[2] ищем из тегов артист + тайтл (обрезанный): «${normalizedArtist}» - «${normalizedTitleCut}»`);
				searchResponse = await discogsRequest.get('/database/search', {
					params: {
						artist: normalizedArtist,
						track: normalizedTitleCut,
						...paramsConst,
					}
				});
			}
			else {
				log(`${trPad}[2] * НЕ ищем из тегов артист + тайтл (обрезанный), т.к. обрезанный тайтл совпадает`)
			}
		}

		const infoInFilenameIsOtherThanInTags =
			normalizedFilenameArtist !== normalizedArtist
			|| normalizedFilenameTitle !== normalizedTitle;

		// да, такое странное условие
		if (!searchResponse.data?.results?.length) {
			if (infoInFilenameIsOtherThanInTags) {
				if (!searchResponse.data?.results?.length) {
					log(`${trPad}[3] ищем из имени файла артист + тайтл: «${normalizedFilenameArtist}» - «${normalizedFilenameTitle}»`);
					searchResponse = await discogsRequest.get('/database/search', {
						params: {
							artist: normalizedFilenameArtist,
							track: normalizedFilenameTitle,
							...paramsConst,
						}
					});
				}
				if (!searchResponse.data?.results?.length) {
					const normalizedFilenameTitleCut = normalizeTitle(filenameTitle, true);
					if (normalizedFilenameTitle !== normalizedFilenameTitleCut) {
						log(`${trPad}[4] ищем из имени файла артист + тайтл (обрезанный): «${normalizedFilenameArtist}» - «${normalizedFilenameTitleCut}»`);
						searchResponse = await discogsRequest.get('/database/search', {
							params: {
								artist: normalizedFilenameArtist,
								track: normalizedFilenameTitleCut,
								...paramsConst,
							}
						});
					}
					else {
						log(`${trPad}[4] * НЕ ищем из имени файла артист + тайтл (обрезанный), т.к. обрезанный тайтл совпадает`);
					}
				}
			}
			else {
				log(`${trPad}[3]+[4] * НЕ ищем из имени файла, т.к. значения в тегах и в имени файла совпадают`);
			}
		}

		if (!searchResponse.data?.results?.length) {
			log(`(!) Релиз не найден!`);
			return null;
		}

		// Search through results to find matching track
		for (const releaseData of searchResponse.data.results) {
			try {
				log(`${trPad}Релиз найден: «${releaseData.title}» (ID=${releaseData.id})`);
				const releaseResponse = await discogsRequest.get(`/releases/${releaseData.id}`);
				const release = releaseResponse.data;

				// Check tracklist for matching title
				if (release.tracklist) {
					const matchingTrack = release.tracklist.find(track => {
						const trackTitle = track.title.toLowerCase().trim();
						return trackTitle.includes(normalizedTitle) || normalizedTitle.includes(trackTitle);
					});

					if (matchingTrack) {
						log(`${trPad}Трек найден: «${matchingTrack.title}»`);
					}
					else {
						log(`${trPad}Трек НЕ найден в релизе ${releaseData.id}, берём теги релиза не глядя. Искали название трека «${normalizedTitle}»`);
					}
					const genresStr = release?.genres?.join?.(', ') || '';
					const stylesStr = release?.styles?.join?.(', ') || '';
					const genreStyle = [genresStr, stylesStr].filter(Boolean).join(` ${genreDelimiter} `);
					return { genreStyle, discogsReleaseData: release };
				}
			} catch (e) {
				log(`${trPad}Error checking release ${releaseData.id}: ${e.message}`);
			}

			// Be nice to Discogs API
			await new Promise(resolve => setTimeout(resolve, 500));
		}

		log(`${trPad}No matching tracks found in any releases`);
		return null;
	} catch (error) {
		const errorFileArg = `${fileName} (tagArtist: ${tagArtist}, tagTitle: ${tagTitle})`;
		if (error.response) {
			log(`${trPad}Discogs API responded error for ${errorFileArg}: ${error.response.status} - ${error.response.data.message}`);
		} else {
			log(`${trPad}getDataFromDiscogs error for ${errorFileArg}: ${error.message}.\n${error.stack}`);
		}
		return null;
	}
}

async function processAudioFile (filePath) {

	const fileName = path.basename(filePath);
	const fileNameWithoutExt = path.basename(filePath, path.extname(filePath));
	try {
		const tags = ID3.read(filePath);
		const { artist, title, genre: genreOld, year: yearOld } = tags;

		log(`Берём в работу файл: «${fileName}». Тег артиста: «${artist}». Тег тайтла: «${title}»`);
		const researchResult = await getDataFromDiscogs(artist, title, fileNameWithoutExt);

		// Respect rate limits
		await new Promise(resolve => setTimeout(resolve, config.discogs.rateLimitDelay || 1000));

		if (researchResult) {
			const { genreStyle: genreNew } = researchResult;
			const { discogsReleaseData } = researchResult;
			const { year: yearNew, country } = discogsReleaseData;
			const yearNewStr = String(yearNew)
			// обновляем файло только если сменился жанр+год genreOld+yearOld. Версию теггера не проверяем и не обновляем
			if (forceWriteTags || genreOld !== genreNew && yearOld !== yearNewStr) {
				const updatedTags = {
					genre: genreNew,
					gtagger_version: appVersion,
					comment: { text: `gtagger_${appVersion}`, language: 'en' }, // чтобы в виндовс-эксплорере можно было вывести колонку и поискать по ней. Формат тега comment такой странный потому что ID3.update ругается (TODO расследовать ВТФ)
					year: yearNewStr,
					country,
				};
				ID3.update(updatedTags, filePath);
				log(`${trPad}Теги прописываются: ${JSON.stringify(updatedTags)}`);
			}
			else {
				log(`${trPad}Значения тегов совпали, файл не обновляем`);
			}
			return { success: true, genre: genreNew };
		}

		log(`${trPad}Жанр не найден!`);
		return { success: false, skipped: true, skippedItem: { skippedReason: `NO_DISCOGS_RESULT`, fileName, inetResult: researchResult } };
	} catch (error) {
		log(`Error processing ${filePath}: ${error.message}.\n${error.stack}`);
		return { success: false, error: error.message };
	}
}

async function findAudioFiles (directory) {
	const files = [];

	async function walkDir (currentPath) {
		const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = path.join(currentPath, entry.name);

			if (entry.isDirectory() && config.files.includeSubdirectories) {
				await walkDir(fullPath);
			} else if (entry.isFile() &&
				config.files.fileExtensions.includes(path.extname(entry.name).toLowerCase())) {
				files.push(fullPath);
			}
		}
	}

	await walkDir(directory);
	return files;
}

/**
 * Processes audio files in a given directory, normalizing their tags using Discogs API.
 * Logs the progress and results of the processing, including the count of processed,
 * skipped, and failed files. Supports optional logging to a file if configured.
 *
 * @param {string} directory - The path to the directory containing audio files to process.
 * @throws Will throw an error if the directory does not exist.
 */
async function main (directory) {
	try {
		if (!fs.existsSync(directory)) {
			throw new Error(`Папка не существует: ${directory}`);
		}

		log(`Стартуем обработку папки ${directory}`);
		const audioFiles = await findAudioFiles(directory);
		const audioFilesExtStr = config.files.fileExtensions.join(', ');
		if (audioFiles.length === 0) {
			log(`Не найдено файлов с расширениями ${audioFilesExtStr}`);
			return;
		}
		log(`${trPad}Найдено файлов с расширениями ${audioFilesExtStr}: ${audioFiles.length} шт.`);
		log(`\n${trPad}Начинаем обработку...\n`);

		/* const bar = new ProgressBar('Processing [:bar] :percent :etas', {
			complete: '=',
			incomplete: ' ',
			width: 40,
			total: audioFiles.length
		}); */

		const stats = {
			processed: 0,
			skipped: 0,
			skippedList: [],
			failed: 0
		};

		for (const file of audioFiles) {
			const result = await processAudioFile(file);

			if (result.success) {
				stats.processed++
			}
			else if (result.skipped) {
				stats.skipped++
				stats.skippedList.push(result.skippedItem)
			}
			else stats.failed++;

			// bar.tick();
		}

		log('\nУспех:');
		log(`${trPad}Обработано успешно (включая те, у которых теги не изменились): ${stats.processed}`);
		log(`${trPad}Обработано с ошибкой: ${stats.failed}`);
		const skippedFilesStr = stats.skippedList.length ?
			`${['', ...stats.skippedList]
				.map(item => item ? `[${item.skippedReason}] ${item.fileName}` : '')
				.join(`\n${trPad}${trPad}`)}`
			: '';
		const skippedFilesObjStr = JSON.stringify(stats.skippedList, null, '\t');
		log(`${trPad}Не найден жанр: ${stats.skipped}.${skippedFilesStr}`);
		writeNotFoundFile(skippedFilesObjStr);

	} catch (error) {
		log(`Фатальная ошибка: ${error.message}`);
		process.exit(1);
	} finally {
		if (logStream) {
			logStream.end(() => {
				if (logFilePath) {
					console.log(`${trPad}Лог консоли сохранён в ${path.resolve(logFilePath)}`);
				}
			});
		}

	}
}



/**
 * Нормализует строку, удаляя из нее годы и символы, не являющиеся буквами
 * или цифрами. Используется для нормализации заголовков треков до
 * сравнения с заголовками треков на Discogs.
 *
 * @param {string} title - строка, подлежащая нормализации
 * @param {boolean} [forceRemoveBrackets=false] - если true, то удаляем
 *     скобки, даже если они не содержат года
 * @returns {string} нормализованная строка
 */
function normalizeTitle (title, forceRemoveBrackets = false) {
	title = title.toLowerCase();
	if (forceRemoveBrackets) title = title.replaceAll(/\(.*?\)/g, '').trim();
	//console.log(`title1`, title);
	title = removeNonAlphaNumericFromLineEnd(title);
	title = title
		.replaceAll('✖', '') // удаляем ✖
		.replaceAll('slowed', '') // удаляем slowed
		.replaceAll('reverb', '') // удаляем reverb
		.replaceAll(/[(\[][^)\]]*remaster[^)\]]*[)\]]/gi, '') // удаляем круглые или квадратные скобки если в них написано слово ремастер https://chat.deepseek.com/a/chat/s/02947716-f1b2-4660-a0d0-c6da5f657109
		.replaceAll(/\(\d{4}?\)/g, '') // удаляем годы вида (1994)
		.replaceAll(/\(©\d{4}?\)/g, '') // удаляем годы вида (©1994)
		.replaceAll(/\(℗\d{4}?\)/g, '') // удаляем годы вида (℗1994)
		.replaceAll(/\(\d{4}?\s?г\.?\)/g, '') // удаляем годы вида (1994 г.) и (1994г.)
		.replaceAll(/\<\d{4}?\>/g, '') // удаляем годы в <1994>
		.replaceAll(/#[\p{L}\p{N}_]+/gu, '') // удаляем хештеги
		.replaceAll(/[\[({][^\]})]*http[^\]})]*[\]})]/g, '') // удаляем скобки если в них есть ссылки https://chat.deepseek.com/a/chat/s/ca8dde19-02e2-4471-a138-45492d395c18
		.replaceAll(/[\[({][^\]})]*vk.com[^\]})]*[\]})]/g, '') // удаляем скобки если в них есть ссылки https://chat.deepseek.com/a/chat/s/ca8dde19-02e2-4471-a138-45492d395c18
		.replaceAll(/\[.*?\]/g, '') // удаляем всякие там [LOW QUALITY] и [1994]
	if (title.length !== 4) { // тупая проверка, да
		title = title.replaceAll(/\d{4}$/g, '') // удаляем годы в конце строки
	}
	title = removeNonAlphaNumericFromLineEnd(title);
	title = removeUnclosedBracketContinuations(title);
	//console.log(`title2`, title);
	title = title.replaceAll(/\s+/g, ' ') // заменяем множественные пробелы на один
	return title.trim();
	function removeNonAlphaNumericFromLineEnd (str) {
		return str.replaceAll(/[^\p{L}\p{N}]+$/gu, '') // удаляем не-альфанумерик символы в конце строки https://chat.deepseek.com/a/chat/s/c5d2fea8-35b7-40d8-8e04-718d677463fb
	}
	// https://chat.deepseek.com/a/chat/s/d1038f56-2bcb-4292-9f45-92ec63de5413
	function removeUnclosedBracketContinuations (str) {
		return str
			.replaceAll(/\([^)]*($|[({\[<])/g, '')  // Unclosed parentheses
			.replaceAll(/\[[^\]]*($|[({\[<])/g, '') // Unclosed square brackets
			.replaceAll(/\{[^}]*($|[({\[<])/g, '')  // Unclosed curly braces
			.replaceAll(/<[^>]*($|[({\[<])/g, '');  // Unclosed angle brackets
	}
}

function normalizeTitleTest () {
	const cases = {
		' хуй _1992_': 'хуй',
		' хуй (1992г.)': 'хуй',
		' хуй (1992 г.)': 'хуй',
		' хуй (1992 г)': 'хуй',
		' хуй slowed': 'хуй',
		' хуй reverb': 'хуй',
		' хуй (http://vk.com)': 'хуй',
		//'Это #пример на русском и #хуй aaa #penis 222': 'Это на русском и aaa 222',
		'[1989] French Kiss (Gay Version) [YOUTUBE RIP]': 'french kiss',
		'Айлавью (Heroin 0 (remixed), 1996) (Эклектика магистраль ремикс) (Макс Головин)': 'айлавью',
		//'FAKE_CASE': 'FAKE_RESULT',
	}
	for (const key in cases) {
		const inp = key;
		const resultOk = cases[key];
		const resultReal = normalizeTitle(inp, true);
		if (resultReal !== resultOk) {
			console.error(`«${inp}» result was «${resultReal}», but expected «${resultOk}»`);
			throw new Error(`normalizeTitle test error`);
		}
	}
}
function normalizeArtistTest () {
	const cases = {
		"2 body's – 4 dancetrax – ℗ 1989": "2 body's",
		//'FAKE_CASE': 'FAKE_RESULT',
	}
	for (const key in cases) {
		const inp = key;
		const resultOk = cases[key];
		const resultReal = normalizeArtist(inp);
		if (resultReal !== resultOk) {
			console.error(`«${inp}» result was «${resultReal}», but expected «${resultOk}»`);
			throw new Error(`normalizeArtist test error`);
		}
	}
}

/**
 * @param {string} str - строка, подлежащая нормализации
 * @returns {string} нормализованная строка
 */
function normalizeArtist (str) {
	const sep = getSeparatorByString(str);
	const strBeforeSep = str.split(sep)[0]; // отрезаем всё что перед дефисом или тире ()
	return strBeforeSep.toLowerCase()
		.replaceAll('✖', '') // удаляем ✖
		.replaceAll(/\(.*?\)/g, '') // удаляем всё в ()
		.replaceAll(/\[.*?\]/g, '') // удаляем всё в []
		.replaceAll(/\<.*?\>/g, '') // удаляем всё в <>
		.trim();
}

function getSeparatorByString (str) {
	const seps = ['—', '–', '-', '٠'];
	for (const sep of seps) {
		if (str.includes(` ${sep} `)) return ` ${sep} `;
		if (str.includes(sep)) return sep;
	}
}

/**
 * Copies a file to a new location if the destination doesn't exist
 * @param {string} sourcePath - Path to source file
 * @param {string} destinationPath - Path to destination file
 * @returns {Promise<void>}
 * @example await copyFileNoOverwrite('./source.txt', './destination.txt')
 * @throws {Error} If source doesn't exist or destination exists
 */
async function copyFileNoOverwrite (sourcePath, destinationPath) {
	try {
		// Check if destination exists
		try {
			await fs.promises.access(destinationPath)
			throw new Error(`Destination file already exists: ${destinationPath}`)
		} catch (err) {
			if (err.code !== 'ENOENT') throw err
			// Destination doesn't exist, proceed with copy
		}

		// Ensure destination directory exists
		const dirname = path.dirname(destinationPath)
		await fs.promises.mkdir(dirname, { recursive: true })

		// Perform the copy
		await fs.promises.copyFile(sourcePath, destinationPath)
	} catch (error) {
		throw new Error(`Failed to copy file: ${error.message}`)
	}
}



async function writeNotFoundFile (str) {
	if (!str) console.warn(`writeNotFoundFile: str is empty`);

	const filePathRel = path.join(logDirName, `${logFilePrefix}_notfound.json`);
	const filePath = path.resolve(path.join(__dirname, filePathRel));

	try {
		const fileStream = await createWriteStreamWithDirs(filePath, { flags: 'w' });
		fileStream.write(`${str}`);
		if (debugFilestrem) {
			fileStream.on('finish', (() => {
				console.log(`${trPad}Filestream finished ${path.resolve(filePath)}`);
			}));
			fileStream.on('close', (() => {
				console.log(`${trPad}Filestream closed ${path.resolve(filePath)}`);
			}));
		}
		fileStream.end((err) => {
			if (err) {
				console.error(`${trPad}Ошибка! Файлы, для которых не найдены релизы, НЕ сохранены`);
				throw err;
			}
			else console.log(`${trPad}Файлы, для которых не найдены релизы, сохранены в ${path.resolve(filePath)}.`);
		});
	} catch (error) {
		console.error(`Error writing not found file:`, error);
		throw error;
	}
}


function formatDate (date = new Date()) {
	const isoString = date.toISOString();
	return isoString.replace('T', '_').replaceAll(':', '-').split('.')[0];
}

async function createWriteStreamWithDirs (filePath, options = {}) {
	const dir = path.dirname(filePath);

	// Check if directory exists in an async way
	await new Promise((resolve, reject) => {
		fs.stat(dir, (err, stats) => {
			if (err) {
				console.log(`Directory doesn't exist, create it: ${dir}`);
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
