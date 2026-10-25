import fs from 'node:fs';
import path from 'node:path';
import ID3 from 'node-id3';
import axios, { AxiosResponse } from 'axios';
import { discogsUserToken, appVersion, trPad } from './common.js';
import { log, notFoundLogger, logStart, logEnd } from './logging.js';
import { getAllKindsOfNames, fixWin1251 } from './string-utils.js';

export async function mainFunc(musDir: string, cliOptions: GtaggerCliOptions): Promise<void> {
	await logStart();

	const includeSubdirectories = cliOptions.subdir;
	const forceWriteTags: boolean = cliOptions.force;
	const discogsRequestDelay: number = Number(cliOptions.request_delay);
	const fileExtensions = ['.mp3', '.flac'];
	const genreDelimiter = '➤';
	// Конфигурим запросы в Discogs
	const discogsRequest = axios.create({
		baseURL: 'https://api.discogs.com',
		headers: {
			'User-Agent': `GTagger/${appVersion}`,
			Authorization: `Discogs token=${discogsUserToken}`,
		},
		timeout: 10000,
	});
	// ---------------------------------------------------------------------
	// Погнали!
	// Всё ниже - функции
	// ---------------------------------------------------------------------
	await mainFuncInternal();

	async function mainFuncInternal(): Promise<void> {
		try {
			if (!fs.existsSync(musDir)) {
				throw new Error(`Папка «${musDir}» не существует.`);
			}

			log(`Стартуем обработку папки ${musDir}`);
			const audioFiles = await findAudioFiles(musDir);
			const audioFilesExtStr = fileExtensions.join(', ');
			if (audioFiles.length === 0) {
				throw new Error(`Не найдено файлов с заданными расширениями (${audioFilesExtStr})`);
			}
			log(
				`${trPad}Начинаем обработку ${audioFiles.length} файлов (искали по расширениям ${audioFilesExtStr})...`,
			);
			const stats: GtaggerStats = {
				qtyWrittenTags: 0,
				qtyUnchangedTags: 0,
				qtySkipped: 0,
				skippedList: [],
				failed: 0,
			};

			for (const file of audioFiles) {
				const result = await processAudioFile(file);

				if (result.isWroteTags) {
					stats.qtyWrittenTags++;
				} else if (result.isTagsUnchanged) {
					stats.qtyUnchangedTags++;
				} else if (result.isSkipped) {
					stats.qtySkipped++;
					if (result.skippedItem) {
						stats.skippedList.push(result.skippedItem);
						// notfound.json feeds copy-notfound, so already processed files do not belong there
						if (result.skippedItem.skippedReason === 'NO_DISCOGS_RESULT') {
							notFoundLogger.writeItem(result.skippedItem);
						}
					}
				} else {
					stats.failed++;
				}
			}

			log('\nУспех:');
			const qtyAlreadyProcessed = stats.skippedList.filter(
				(item) => item.skippedReason === 'ALREADY_PROCESSED',
			).length;
			log(`${trPad}Теги прописаны в ${stats.qtyWrittenTags} файлов`);
			log(`${trPad}Теги совпали, файл не перезаписан: ${stats.qtyUnchangedTags} файлов`);
			log(`${trPad}Пропущено как уже обработанные этой версией: ${qtyAlreadyProcessed} файлов`);
			log(`${trPad}Обработано с ошибкой: ${stats.failed}`);
			const skippedFilesSep = `\n${trPad}${trPad}`;
			const skippedFilesStr = stats.skippedList.length
				? `${skippedFilesSep}${stats.skippedList
						.map((item) => (item ? `[${item.skippedReason}] ${item.filePath}` : ''))
						.join(skippedFilesSep)}`
				: '';
			// const skippedFilesObjStr = JSON.stringify(stats.skippedList, null, '\t');
			log(
				`${trPad}Не найдено в Discogs: ${stats.qtySkipped - qtyAlreadyProcessed} шт. Все пропущенные:${skippedFilesStr}`,
			);
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
		fileName: string,
	): Promise<GetDataFromDiscogsResult | null> {
		const allKindsOfNames = getAllKindsOfNames(tagArtist, tagTitle, fileName);
		const {
			fixedTagArtist,
			fixedTagTitle,
			filenameArtist,
			filenameTitle,
			normalizedArtist,
			normalizedTitle,
			normalizedTitleCut1,
			normalizedTitleCut2,
			normalizedFilenameArtist,
			normalizedFilenameTitle,
			normalizedFilenameTitleCut,
		} = allKindsOfNames;

		try {
			// Be nice to Discogs API
			// throw new Error('111');
			console.log(`----------> Ждём ${discogsRequestDelay}мс перед следующим запросом...`);
			await new Promise((resolve) => setTimeout(resolve, discogsRequestDelay));

			let stage = '0.0';
			if (!tagArtist || !tagTitle) {
				logStage(
					`Теги артиста и/или тайтла не заданы. Берём "теги"из имени файла («${filenameArtist}»/«${filenameTitle}»)`,
				);
			}

			const paramsConst = {
				type: 'release',
				per_page: 3,
				sort: 'year',
				sort_order: 'asc',
			};

			let searchResponse;
			stage = '1.0';
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
						type: 'release',
						per_page: 3,
						// ...paramsConst, - здесь это вредно, т.к. можно найти левый трек
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
								`✗ НЕ ищем НЕСТРОГО из имени файла артист + тайтлОбрез, т.к. тайтлОбрез совпадает`,
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
								`${trPad}${trPad}Трек НЕ найден в релизе ${releaseData.id}, берём теги релиза не глядя. Искали название трека «${normalizedTitle}»`,
							);
						}
						let genresStr =
							// Заменяю длинное слово Electronic на короткое, потому что оно почти везде.
							release?.genres
								?.map?.((ge: string) => (ge.toLowerCase() === 'electronic' ? 'El.' : ge))
								?.join(', ') || '';
						const stylesStr = release?.styles?.join(', ') || '';
						const genreStyle = [genresStr, stylesStr].filter(Boolean).join(` ${genreDelimiter} `);
						return { genreStyle, discogsReleaseData: release, taggerStage: stage };
					}
				} catch (e) {
					log(`${trPad}Error checking release ${releaseData.id}: ${(e as Error).message}`);
				}
			}

			log(`${trPad}Трек не найден ни в одном релизе`);
			return null;

			function logStage(...args: any[]) {
				if (args.length === 2) {
					log(`${trPad}[${stage}]`, args[0].padEnd(60), args[1]);
				} else {
					log(`${trPad}[${stage}]`, ...args);
				}
			}
		} catch (error) {
			const errorFileArg = `${fileName} (tagArtist: ${tagArtist}, tagTitle: ${tagTitle})`;
			if (axios.isAxiosError(error)) {
				log(
					`${trPad}Discogs API responded error for ${errorFileArg}: ${error.response?.status} - ${error.response?.data.message} (discogsRequestDelay: ${discogsRequestDelay}ms)`,
				);
			} else {
				log(
					`${trPad}getDataFromDiscogs error for ${errorFileArg}: ${(error as Error).message}.\n${
						(error as Error).stack
					}`,
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
			const { artist: tagArtist, title: tagTitle, year: yearOld, album: tagAlbum } = existingTags;
			log(`${'-'.padEnd(66, '-')}`);
			log(`Берём в работу файл: «${fileName}». Тег артиста: «${tagArtist}». Тег тайтла: «${tagTitle}»`);

			const allKindsOfNames = getAllKindsOfNames(tagArtist, tagTitle, fileNameWithoutExt);
			const { fixedTagArtist, fixedTagTitle, filenameArtist, filenameTitle } = allKindsOfNames;

			const skippedItemBase = {
				filePath,
				allKindsOfNames,
				existingTags,
			};

			// TODO условие, по которому будет парситься минимальная версия из CLI
			const fileProcessedWithCurrentVersion = readGtaggerMarker(existingTags)?.version === appVersion;

			if (!forceWriteTags && fileProcessedWithCurrentVersion) {
				log(
					`${trPad}Файл уже обработан той же версией приложения (${appVersion}). Судим по тегу TXXX:${markerTxxxDescription}`,
				);
				return {
					isWroteTags: false,
					isSkipped: true,
					skippedItem: {
						skippedReason: 'ALREADY_PROCESSED',
						...skippedItemBase,
					},
				};
			}
			const researchResult = await getDataFromDiscogs(fixedTagArtist, fixedTagTitle, fileNameWithoutExt);

			// Задержка чтобы не долбить Discogs. TODO подумать, как её вырубить там, где не нужно
			await new Promise((resolve) => setTimeout(resolve, 1000));

			if (researchResult) {
				const { genreStyle, discogsReleaseData, taggerStage } = researchResult;
				const { year: yearNew, country } = discogsReleaseData;
				const yearNewStr = `${yearNew}`; // винда только так год видит, скотина!
				const yearNewStrExt = `${yearNew}-01-01`; // винда только так год видит, скотина!
				const newYearValue = yearNewStr;
				if (yearOld && yearOld !== newYearValue) {
					log(`-------> Ахтунг! Год существует: ${yearOld} и не равен полученному: ${yearNewStr}`);
				}
				// дата пишется, как DDMM! если года нет, то и хуй с ней. Или нет, лучше вообще хуй с ней
				// const newDateValue = newYearValue ? existingTags.date : null;
				// TODO удалить нафиг date|TDAT, она видна только в фубаре правда, но ладно
				// соответствие тегов и колонок эксплорера https://learn.microsoft.com/en-us/windows/win32/wmformat/id3-tag-support
				const newDateValue = undefined;
				const discogsArtists = researchResult?.discogsReleaseData?.artists
					?.map?.((art) => art.name)
					.join?.(', ');
				const discogsAlbum = researchResult?.discogsReleaseData?.title;
				const tagsToUpdate = {
					year: newYearValue, // по идее пишет само в TYER, но на всякий случай явно укажем тоже
					// TYER: yearNewStr, // тоже год, но для Win10 Explorer
					// TDRC: undefined, // If the year still doesn’t appear, try removing TDRC (if present) since Windows may prioritize it incorrectly
					genre: genreStyle,
					// Human-readable version for the Explorer "Copyright" column; overwrites any existing TCOP.
					// It takes part in areTagsEqual, so a new app version always rewrites the file and refreshes the marker
					copyright: `g-tagger v${appVersion}`,
					// TEMPORARY: one-time cleanup of the version that old releases wrote to TRSN and COMM.
					// Remove after the big collection has been processed once.
					// undefined makes ID3.update delete the frame
					...(String(existingTags.internetRadioName ?? '').startsWith('gtagger') && {
						internetRadioName: undefined,
					}),
					...(String(existingTags.comment?.text ?? '').startsWith('gtagger') && { comment: undefined }),
					// Country is written twice because no single frame works everywhere:
					// - ID3v2.3 has no standard country frame; TXXX:COUNTRY is the de facto convention
					//   (foobar2000 shows it as %country%), but the Windows MP3 property handler ignores
					//   TXXX entirely - the Explorer "Country/region" column stays empty (checked empirically).
					// - So for Explorer we hijack TPE3 ("Conductors" column): one of the few frames Explorer
					//   displays, and practically always empty for non-classical music. Rejected alternatives:
					//   TPUB (Publisher) is the label, TKEY (Initial key) is read by DJ software,
					//   TIT3 (Subtitle) carries real data, TENC (Encoded by) is often pre-filled,
					//   TIT1/TMOO/TOPE/TPE4 are not shown by Explorer at all.
					...(country && { conductor: country }),
					userDefinedText: [
						...(country ? [{ description: 'COUNTRY', value: country }] : []),
						{
							description: markerTxxxDescription,
							value: JSON.stringify({
								version: appVersion,
								stage: taggerStage,
								date: new Date().toISOString(),
							} satisfies GtaggerMarker),
						},
					],
					// Если в тегах нет артиста - проставляем из дискогса либо из имени файла, чтобы хоть какой-то был
					artist: fixedTagArtist || discogsArtists || filenameArtist,
					// Если в тегах нет тайтла - проставляем из дискогса либо из имени файла, чтобы хоть какой-то был
					title: fixedTagTitle || filenameTitle,
					album: fixWin1251(tagAlbum || discogsAlbum),
				};

				if (!areTagsEqual(existingTags, tagsToUpdate) || forceWriteTags) {
					ID3.update(tagsToUpdate, filePath); // последним аргументом можно насовать опций, например { id3v2Only: true } или {version: { major: 3, minor: 0 } }
					log(`${trPad}Теги прописываются: ${JSON.stringify(tagsToUpdate)}`);
					return { isWroteTags: true, genre: genreStyle };
				}
				log(`${trPad}Значения тегов совпали, файл не обновляем`);
				return { isWroteTags: false, isTagsUnchanged: true, genre: genreStyle };

				/** обновляем файло только, если сменились теги (маркер TXXX:GTAGGER не считаем) */
				function areTagsEqual(oldTags: Record<string, any>, newTags: Record<string, any>): boolean {
					return Object.entries(newTags).every(([key, value]) =>
						key === 'userDefinedText' ? areUserDefinedTextsEqual(oldTags[key], value) : oldTags[key] === value,
					);
				}

				/** TXXX frames are compared by content; the marker changes on every run, so it is ignored */
				function areUserDefinedTextsEqual(oldFrames: unknown, newFrames: UserDefinedTextFrame[]): boolean {
					const oldList = Array.isArray(oldFrames) ? (oldFrames as UserDefinedTextFrame[]) : [];
					return newFrames
						.filter((frame) => frame.description !== markerTxxxDescription)
						.every((frame) =>
							oldList.some((old) => old.description === frame.description && old.value === frame.value),
						);
				}
			}

			log(`✗ У данного трека не найден жанр`);
			return {
				isWroteTags: false,
				isSkipped: true,
				skippedItem: {
					skippedReason: 'NO_DISCOGS_RESULT',
					...skippedItemBase,
				},
			};
		} catch (error) {
			log(`Error processing ${filePath}: ${(error as Error).message}.\n${(error as Error).stack}`);
			return { isWroteTags: false, error: (error as Error).message };
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

// Machine-readable processing marker: TXXX:GTAGGER with JSON value, not displayed anywhere
const markerTxxxDescription = 'GTAGGER';

function readGtaggerMarker(tags: Record<string, any>): Partial<GtaggerMarker> | undefined {
	const frames: UserDefinedTextFrame[] = Array.isArray(tags.userDefinedText) ? tags.userDefinedText : [];
	const markerFrame = frames.find((frame) => frame.description === markerTxxxDescription);
	try {
		return markerFrame && JSON.parse(markerFrame.value);
	} catch {
		return undefined;
	}
}

function formatParams(params: Record<string, unknown>): string {
	return Object.entries(params)
		.map(([key, value]) => `${key}: «${value}»`)
		.join(', ');
}
