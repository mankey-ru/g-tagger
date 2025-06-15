import fs from 'node:fs';
import path from 'node:path';
import ID3 from 'node-id3';
import axios, { AxiosResponse } from 'axios';
import { discogsUserToken, appVersion, trPad } from './common.js';
import { log, notFoundLogger, logStart, logEnd } from './logging.js';
import { normalizeTitle, getAllKindsOfNames } from './string-utils.js';

export async function mainFunc(musDir: string, cliOptions: GtaggerCliOptions): Promise<void> {
	await logStart();

	const includeSubdirectories = cliOptions.subdir;
	const forceWriteTags: boolean = cliOptions.force;
	const fileExtensions = ['.mp3', '.flac'];
	const genreDelimiter = '➤';
	// Конфигурим запросы в Discogs
	const discogsRequest = axios.create({
		baseURL: 'https://api.discogs.com',
		headers: {
			'User-Agent': 'MP3GenreTagger/1.0',
			Authorization: `Discogs token=${discogsUserToken}`,
		},
		timeout: 10000,
	});
	// ---------------------------------------------------------------------
	// Погнали!
	// Всё ниже - функции
	// ---------------------------------------------------------------------
	return await mainFuncInternal();

	async function mainFuncInternal(): Promise<void> {
		try {
			if (!fs.existsSync(musDir)) {
				throw new Error(`Папка «${musDir}» не существует.`);
			}

			log(`Стартуем обработку папки ${musDir}`);
			const audioFiles = await findAudioFiles(musDir);
			const audioFilesExtStr = fileExtensions.join(', ');
			if (audioFiles.length === 0) {
				log(`Не найдено файлов с заданными расширениями (${audioFilesExtStr})`);
				return;
			}
			log(
				`${trPad}Начинаем обработку ${audioFiles.length} файлов (искали по расширениям ${audioFilesExtStr})...`
			);
			const stats: GtaggerStats = {
				processed: 0,
				skipped: 0,
				skippedList: [],
				failed: 0,
			};

			for (const file of audioFiles) {
				const result = await processAudioFile(file);

				if (result.success) {
					stats.processed++;
				} else if (result.skipped) {
					stats.skipped++;
					if (result.skippedItem) {
						stats.skippedList.push(result.skippedItem);
						notFoundLogger.writeItem(result.skippedItem);
					}
				} else {
					stats.failed++;
				}
			}

			log('\nУспех:');
			log(`${trPad}Обработано успешно (включая те, у которых теги не изменились): ${stats.processed}`);
			log(`${trPad}Обработано с ошибкой: ${stats.failed}`);
			const skippedFilesSep = `\n${trPad}${trPad}`;
			const skippedFilesStr = stats.skippedList.length
				? `${skippedFilesSep}${stats.skippedList
						.map((item) => (item ? `[${item.skippedReason}] ${item.filePath}` : ''))
						.join(skippedFilesSep)}`
				: '';
			// const skippedFilesObjStr = JSON.stringify(stats.skippedList, null, '\t');
			log(`${trPad}Не найден жанр: ${stats.skipped} шт.${skippedFilesStr}`);
		} catch (error) {
			log(`Фатальная ошибка: ${(error as Error).message}`);
			process.exit(1);
		} finally {
			await logEnd();
			await notFoundLogger.close();
		}
	}

	async function getDataFromDiscogs(
		tagArtist: string | undefined,
		tagTitle: string | undefined,
		fileName: string
	): Promise<GetDataFromDiscogsResult | null> {
		const allKindsOfNames = getAllKindsOfNames(tagArtist, tagTitle, fileName);
		const {
			filenameArtist,
			filenameTitle,
			normalizedArtist,
			normalizedTitle,
			normalizedFilenameArtist,
			normalizedFilenameTitle,
		} = allKindsOfNames;

		try {
			// TODO криво же
			if (!tagArtist) tagArtist = filenameArtist;
			if (!tagTitle) tagTitle = filenameTitle;

			// TODO перенести в getAllKindsOfNames
			const defaultNormalizeTitleOptions = { forceRemoveBrackets: true };
			const normalizedTitleCut1 = normalizeTitle(tagTitle, defaultNormalizeTitleOptions);
			const normalizedTitleCut2 = normalizeTitle(tagTitle, {
				...defaultNormalizeTitleOptions,
				forceRemoveSeparatedEnd: true,
			});
			const normalizedFilenameTitleCut = normalizeTitle(filenameTitle, defaultNormalizeTitleOptions);

			const paramsConst = {
				type: 'release',
				per_page: 3,
				sort: 'year',
				sort_order: 'asc',
			};

			let stage = '1.0';
			function logStage(...args: any[]) {
				if (args.length === 2) {
					log(`${trPad}[${stage}]`, args[0].padEnd(60), args[1]);
				} else {
					log(`${trPad}[${stage}]`, ...args);
				}
			}

			let searchResponse;

			// Пробуем искать целиком
			{
				const newParams = {
					artist: normalizedArtist,
					track: normalizedTitle,
				};
				logStage(`Ищем из тегов артист + тайтл`, formatParams(newParams));
				searchResponse = await discogsRequest.get('/database/search', {
					params: {
						...newParams,
						...paramsConst,
					},
				});
			}

			// Затем, если пусто, обрезаем скобки
			if (!searchResponse.data?.results?.length) {
				stage = '1.1';
				if (normalizedTitleCut1 !== normalizedTitle) {
					const newParams = {
						artist: normalizedArtist,
						track: normalizedTitleCut1,
					};
					logStage(`ищем из тегов артист + тайтлОбрез1`, formatParams(newParams));
					searchResponse = await discogsRequest.get('/database/search', {
						params: {
							...newParams,
							...paramsConst,
						},
					});
				} else {
					logStage(`✗ НЕ ищем из тегов артист + тайтлОбрез1, т.к. тайтлОбрез совпадает c тайтл`);
				}
			}

			// Затем, если пусто, обрезаем последнюю часть названия
			if (!searchResponse.data?.results?.length) {
				stage = '1.2';

				if (normalizedTitleCut2 !== normalizedTitleCut1) {
					const newParams = {
						artist: normalizedArtist,
						track: normalizedTitleCut2,
					};
					logStage(`ищем из тегов артист + тайтлОбрез2`, formatParams(newParams));
					searchResponse = await discogsRequest.get('/database/search', {
						params: {
							...newParams,
							...paramsConst,
						},
					});
				} else {
					logStage(`✗ НЕ ищем из тегов артист + тайтлОбрез2, т.к. тайтлОбрез2 совпадает с тайтлОбрез1`);
				}
			}

			const infoInFilenameIsOtherThanInTags =
				normalizedFilenameArtist !== normalizedArtist || normalizedFilenameTitle !== normalizedTitle;

			// да, такое странное условие
			if (!searchResponse.data?.results?.length) {
				if (infoInFilenameIsOtherThanInTags) {
					if (!searchResponse.data?.results?.length) {
						stage = '2.1';
						const newParams = {
							artist: normalizedFilenameArtist,
							track: normalizedFilenameTitle,
						};
						logStage(`ищем из имени файла артист + тайтл`, formatParams(newParams));
						searchResponse = await discogsRequest.get('/database/search', {
							params: {
								...newParams,
								...paramsConst,
							},
						});
					}
					if (!searchResponse.data?.results?.length) {
						stage = '2.2';
						if (normalizedFilenameTitle !== normalizedFilenameTitleCut) {
							const newParams = {
								artist: normalizedFilenameArtist,
								track: normalizedFilenameTitleCut,
							};
							logStage(`ищем из имени файла артист + тайтлОбрез`, formatParams(newParams));
							searchResponse = await discogsRequest.get('/database/search', {
								params: {
									...newParams,
									...paramsConst,
								},
							});
						} else {
							logStage(`✗ НЕ ищем из имени файла артист + тайтлОбрез, т.к. тайтлОбрез совпадает`);
						}
					}
				} else {
					stage = '2.*';
					logStage(`✗ НЕ ищем из имени файла, т.к. значения в тегах и в имени файла совпадают`);
				}
			}

			if (!searchResponse.data?.results?.length) {
				stage = '3.0';
				const newParams = {
					q: `${normalizedArtist} - ${normalizedTitle}`,
				};
				logStage(`НЕСТРОГО ищем из тегов`, formatParams(newParams));
				searchResponse = await discogsRequest.get('/database/search', {
					params: {
						...newParams,
						...paramsConst,
					},
				});
			}

			// да, такое странное условие
			if (!searchResponse.data?.results?.length) {
				if (infoInFilenameIsOtherThanInTags) {
					if (!searchResponse.data?.results?.length) {
						stage = '4.1';
						const newParams = {
							q: `${normalizedFilenameArtist} - ${normalizedFilenameTitle}`,
						};
						logStage(`НЕСТРОГО ищем из имени файла артист + тайтл`, formatParams(newParams));
						searchResponse = await discogsRequest.get('/database/search', {
							params: {
								...newParams,
								...paramsConst,
							},
						});
					}
					if (!searchResponse.data?.results?.length) {
						stage = '4.2';
						if (normalizedFilenameTitle !== normalizedFilenameTitleCut) {
							const newParams = {
								q: `${normalizedFilenameArtist} - ${normalizedFilenameTitleCut}`,
							};
							logStage(`НЕСТРОГО ищем из имени файла артист + тайтлОбрез`, formatParams(newParams));
							searchResponse = await discogsRequest.get('/database/search', {
								params: {
									...newParams,
									...paramsConst,
								},
							});
						} else {
							logStage(
								`✗ НЕ ищем НЕСТРОГО из имени файла артист + тайтлОбрез, т.к. тайтлОбрез совпадает`
							);
						}
					}
				} else {
					stage = '4.*';
					logStage(`✗ НЕ ищем НЕСТРОГО из имени файла, т.к. значения в тегах и в имени файла совпадают`);
				}
			}

			// TODO искать вообще по qValue отдельно по имени артиста и по треку, например Zolotoy Everyday - Золотой Эвридей. Если результатов немного, брать их. Учитывать длину имени трека и артиста

			if (!searchResponse.data?.results?.length) {
				log(`${trPad}✗ Релиз не найден!`);
				return null;
			}

			// Search through results to find matching track
			for (const releaseData of searchResponse.data.results) {
				try {
					const releaseLink = `https://www.discogs.com/release/${releaseData.id}`;
					log(`${trPad}${trPad}✓ Релиз найден: «${releaseData.title}» ${releaseLink}`);
					const releaseResponse = await discogsRequest.get(`/releases/${releaseData.id}`);
					const release = releaseResponse.data;

					// Check tracklist for matching title
					if (release.tracklist) {
						const matchingTrack = release.tracklist.find((track: any) => {
							const trackTitle = track.title.toLowerCase().trim();
							return trackTitle.includes(normalizedTitle) || normalizedTitle.includes(trackTitle);
						});

						if (matchingTrack) {
							log(`${trPad}${trPad}✓ Трек найден: «${matchingTrack.title}»`);
						} else {
							log(
								`${trPad}${trPad}Трек НЕ найден в релизе ${releaseData.id}, берём теги релиза не глядя. Искали название трека «${normalizedTitle}»`
							);
						}
						const genresStr = release?.genres?.join(', ') || '';
						const stylesStr = release?.styles?.join(', ') || '';
						const genreStyle = [genresStr, stylesStr].filter(Boolean).join(` ${genreDelimiter} `);
						return { genreStyle, discogsReleaseData: release };
					}
				} catch (e) {
					log(`${trPad}Error checking release ${releaseData.id}: ${(e as Error).message}`);
				}

				// Be nice to Discogs API
				await new Promise((resolve) => setTimeout(resolve, 500));
			}

			log(`${trPad}No matching tracks found in any releases`);
			return null;
		} catch (error) {
			const errorFileArg = `${fileName} (tagArtist: ${tagArtist}, tagTitle: ${tagTitle})`;
			if (axios.isAxiosError(error)) {
				log(
					`${trPad}Discogs API responded error for ${errorFileArg}: ${error.response?.status} - ${error.response?.data.message}`
				);
			} else {
				log(
					`${trPad}getDataFromDiscogs error for ${errorFileArg}: ${(error as Error).message}.\n${
						(error as Error).stack
					}`
				);
			}
			return null;
		}
	}

	async function processAudioFile(filePath: string): Promise<ProcessAudioFileResult> {
		const fileName = path.basename(filePath);
		const fileNameWithoutExt = path.basename(filePath, path.extname(filePath));
		try {
			const existingTags = ID3.read(filePath);
			const { artist: tagArtist, title: tagTitle } = existingTags;
			log(`${'-'.padEnd(66, '-')}`);
			log(`Берём в работу файл: «${fileName}». Тег артиста: «${tagArtist}». Тег тайтла: «${tagTitle}»`);

			const verTagName1 = 'gtagger_version'; // тут оригинальный кастомный тег
			const verTagName2 = 'internetRadioName'; // тут пользуемся чужим во славу сатаны и чтобы либа не ругалась
			const verTagValue = `gtagger_v${appVersion}`;
			if (!forceWriteTags && existingTags[verTagName2] === verTagValue) {
				log(
					`${trPad}Файл уже обработан той же версией приложения (${appVersion}). Тег ${verTagName2}: ${verTagValue}. Будем пропускать, но не сейчас. Или удалить блин ${verTagName2} тег?`
				);
			}
			const researchResult = await getDataFromDiscogs(tagArtist, tagTitle, fileNameWithoutExt);

			// Задержка чтобы не долбить Discogs. TODO подумать, как её вырубить там, где не нужно
			await new Promise((resolve) => setTimeout(resolve, 1000));

			if (researchResult) {
				const { genreStyle, discogsReleaseData } = researchResult;
				const { year: yearNew, country } = discogsReleaseData;
				const yearNewStr = `${yearNew}`; // винда только так год видит, скотина!
				const yearNewStrExt = `${yearNew}-01-01`; // винда только так год видит, скотина!
				const newYearValue = yearNewStr;
				// дата пишется, как DDMM!
				// если года нет, то и хуй с ней. Или нет, лучше вообще хуй с ней
				// const newDateValue = newYearValue ? existingTags.date : null;
				// TODO удалить нафиг date|TDAT, она видна только в фубаре правда, но ладно
				const newDateValue = undefined;
				const tagsToUpdate = {
					// чтобы в виндовс-эксплорере можно было вывести колонку и поискать по ней. Формат тега comment такой странный потому что ID3.update ругается (TODO расследовать ВТФ)
					year: newYearValue, // по идее пишет само в TYER, но на всякий случай явно укажем тоже
					// TYER: yearNewStr, // тоже год, но для Win10 Explorer
					// TDRC: undefined, // If the year still doesn’t appear, try removing TDRC (if present) since Windows may prioritize it incorrectly
					genre: genreStyle,
					[verTagName1]: verTagValue,
					[verTagName2]: verTagValue,
					comment: {
						text: verTagValue,
						shortText: verTagValue,
						language: 'eng',
					},
					country,
					// TXXX: country или так? TXXX: [{ description: 'Country', value: country }],
					// ещё надо попробовать windows media attributes и NTFS metadata
				};
				if (forceWriteTags || areTagsEqual(existingTags, tagsToUpdate)) {
					ID3.update(tagsToUpdate, filePath); // последним аргументом можно насовать опций, например { id3v2Only: true } или {version: { major: 3, minor: 0 } }
					log(`${trPad}Теги прописываются: ${JSON.stringify(tagsToUpdate)}`);
					// соответствие тегов и колонок эксплорера https://learn.microsoft.com/en-us/windows/win32/wmformat/id3-tag-support
				} else {
					log(`${trPad}Значения тегов совпали, файл не обновляем`);
				}
				if ((tagArtist || '').toLowerCase().includes('midway')) {
					log(`${trPad}Старые теги!`, existingTags);
				}
				return { success: true, genre: genreStyle };

				/** обновляем файло только если сменился жанр+год genreOld+yearOld. Версию теггера не проверяем и не обновляем */
				function areTagsEqual(oldTags: Record<string, any>, newTags: Record<string, any>): boolean {
					return Object.entries(newTags)
						.filter(([key]) => key !== verTagName1 && key !== verTagName2) // версию не считаем
						.every(([key, value]) => oldTags[key] === value);
				}
			}

			log(`✗ У данного трека не найден жанр`);
			return {
				success: false,
				skipped: true,
				skippedItem: {
					skippedReason: 'NO_DISCOGS_RESULT',
					filePath,
					// ровно то же, что происходит внутри getDataFromDiscogs блин, но тут нужно, чтобы сразу врубиться, что пошло не так
					allKindsOfNames: getAllKindsOfNames(tagArtist, tagTitle, fileName),
					existingTags,
				},
			};
		} catch (error) {
			log(`Error processing ${filePath}: ${(error as Error).message}.\n${(error as Error).stack}`);
			return { success: false, error: (error as Error).message };
		}
	}

	async function findAudioFiles(directory: string): Promise<string[]> {
		const files: string[] = [];

		async function walkDir(currentPath: string): Promise<void> {
			const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = path.join(currentPath, entry.name);
				if (entry.isDirectory() && includeSubdirectories) {
					await walkDir(fullPath);
				} else if (entry.isFile() && fileExtensions.includes(path.extname(entry.name).toLowerCase())) {
					files.push(fullPath);
				}
			}
		}

		await walkDir(directory);
		return files;
	}
}

function formatParams(params: Record<string, unknown>): string {
	return Object.entries(params)
		.map(([key, value]) => `${key}: «${value}»`)
		.join(', ');
}
