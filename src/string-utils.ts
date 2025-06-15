// Ну а хуле нет
normalizeTitleTest();
normalizeArtistTest();
getArtistAndTitleFromFilenameTest();

type NormalizeTitleOptions = {
	/** удалять всё после разделителя. Например, трек Vernon - Vernon's Wonderland - The Future.mp3 */
	forceRemoveSeparatedEnd?: boolean;
	/** удалять всё что в круглых скобках */
	forceRemoveBrackets?: boolean;
};

export function normalizeTitle(title: string, opts: NormalizeTitleOptions = {}): string {
	const defaultOpts: Required<NormalizeTitleOptions> = {
		forceRemoveBrackets: false,
		forceRemoveSeparatedEnd: false,
	};
	const { forceRemoveBrackets, forceRemoveSeparatedEnd } = {
		...defaultOpts,
		...opts,
	};
	title = title.toLowerCase();

	if (forceRemoveBrackets) {
		title = title.replaceAll(/\(.*?\)/g, '').trim();
	}

	if (forceRemoveSeparatedEnd) {
		const sep = getSeparatorByString(title);
		if (sep) {
			// .filter(Boolean) нужен на случай пустых элементов, как случилось с МС ЖАН - Я Не Каюсь - (Д.Бажанов, Ю.Усачев - Актив Позитив 1996) (tagArtist: МС ЖАН, tagTitle: Я Не Каюсь - (Д.Бажанов, Ю.Усачев - Актив Позитив 1996)). title = 'я не каюсь -', соответственно title.split(sep) = [ 'я не каюсь ', '' ]
			title = title.split(sep).filter(Boolean).pop() || title;
			// можно поставить после .pop() воскл знак и наебать TS
		}
	}

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
		.replaceAll(/\[.*?\]/g, ''); // удаляем всякие там [LOW QUALITY] и [1994]
	if (title.length !== 4) {
		// тупая проверка, да
		title = title.replaceAll(/\d{4}$/g, ''); // удаляем годы в конце строки
	}
	title = removeNonAlphaNumericFromLineEnd(title);
	title = removeUnclosedBracketContinuations(title);
	title = title.replaceAll(/\s+/g, ' '); // заменяем множественные пробелы на один
	return title.trim();

	function removeNonAlphaNumericFromLineEnd(str: string): string {
		return str.replaceAll(/[^\p{L}\p{N}]+$/gu, ''); // удаляем не-альфанумерик символы в конце строки https://chat.deepseek.com/a/chat/s/c5d2fea8-35b7-40d8-8e04-718d677463fb
	}

	function removeUnclosedBracketContinuations(str: string): string {
		return str
			.replaceAll(/\([^)]*($|[({\[<])/g, '') // Unclosed parentheses
			.replaceAll(/\[[^\]]*($|[({\[<])/g, '') // Unclosed square brackets
			.replaceAll(/\{[^}]*($|[({\[<])/g, '') // Unclosed curly braces
			.replaceAll(/<[^>]*($|[({\[<])/g, ''); // Unclosed angle brackets
	}
}

type GetArtistAndTitleFromFilenameResult = { filenameArtist: string; filenameTitle: string };
export function getArtistAndTitleFromFilename(filename: string): GetArtistAndTitleFromFilenameResult {
	const fileNameNoUnderscore = filename.replaceAll('_', ' ');
	let filenameTitle;
	let filenameArtist;
	const sep = getSeparatorByString(fileNameNoUnderscore);
	if (sep) {
		const filenameArr = fileNameNoUnderscore.split(sep);
		filenameArtist = filenameArr[0];
		filenameTitle = filenameArr.slice(1).join(sep);
	} else {
		filenameArtist = fileNameNoUnderscore;
		filenameTitle = fileNameNoUnderscore;
	}
	filenameArtist = filenameArtist!.replace(/^the\s+/i, ''); // для артистов в именах файлов типа "the orb" или "The Orb" - TODO блин этому место в normalizeArtist же, не?
	filenameTitle = filenameTitle;
	return { filenameArtist, filenameTitle };
}

export function normalizeArtist(str: string): string {
	const sep = getSeparatorByString(str);
	// если разделитель есть, отрезаем всё что перед ним
	let strBeforeSep = sep ? str.split(sep)[0]! : str;
	return strBeforeSep
		.toLowerCase()
		.replaceAll('✖', '') // удаляем ✖
		.replaceAll(/\(.*?\)/g, '') // удаляем всё в ()
		.replaceAll(/\[.*?\]/g, '') // удаляем всё в []
		.replaceAll(/\<.*?\>/g, '') // удаляем всё в <>
		.trim();
}

/** Совсем тяжёлая норкомания :( */
export function getAllKindsOfNames(tagArtist: string | undefined, tagTitle: string | undefined, fileName: string) {
	const { filenameArtist, filenameTitle } = getArtistAndTitleFromFilename(fileName);

	if (!tagArtist) tagArtist = filenameArtist;
	if (!tagTitle) tagTitle = filenameTitle;

	const normalizedArtist = normalizeArtist(tagArtist);
	const normalizedTitle = normalizeTitle(tagTitle);
	const normalizedFilenameArtist = normalizeArtist(filenameArtist);
	const normalizedFilenameTitle = normalizeTitle(filenameTitle);

	return {
		filenameArtist,
		filenameTitle,
		normalizedArtist,
		normalizedTitle,
		normalizedFilenameArtist,
		normalizedFilenameTitle,
	};
}

type StrNameSep = '-' | '—' | '–' | '٠'; // Add more if needed
type StrNameSepWithSpaces = ` ${StrNameSep} `;
type StrNameSepWithUnderscores = `_${StrNameSep}_`;

export function getSeparatorByString(
	str: string
): StrNameSepWithSpaces | StrNameSep | StrNameSepWithUnderscores | void {
	const seps: StrNameSep[] = ['-', '—', '–', '٠'];
	for (const sep of seps) {
		const withSpaces: StrNameSepWithSpaces = ` ${sep} `;
		if (str.includes(withSpaces)) return withSpaces;
	}
	for (const sep of seps) {
		const withUnderscores: StrNameSepWithUnderscores = `_${sep}_`;
		if (str.includes(withUnderscores)) return withUnderscores;
	}
	for (const sep of seps) {
		if (str.includes(sep)) return sep;
	}
}

function getArtistAndTitleFromFilenameTest(): void {
	const cases: Record<string, GetArtistAndTitleFromFilenameResult> = {
		'вася - пупкин': { filenameArtist: 'вася', filenameTitle: 'пупкин' },
		'вася_—_пупкин': { filenameArtist: 'вася', filenameTitle: 'пупкин' },
		'вася пупкин': { filenameArtist: 'вася пупкин', filenameTitle: 'вася пупкин' },
	};
	for (const [input, expected] of Object.entries(cases)) {
		const result = getArtistAndTitleFromFilename(input);
		const resultStr = JSON.stringify(result);
		const expectedStr = JSON.stringify(expected);
		if (resultStr !== expectedStr) {
			console.error(`«${input}» result was «${resultStr}», but expected «${expectedStr}»`);
			throw new Error(`getArtistAndTitleFromFilenameTest test error`);
		}
	}
}
function normalizeTitleTest(): void {
	const cases: Record<string, string> = {
		' хуй _1992_': 'хуй',
		' хуй (1992г.)': 'хуй',
		' хуй (1992 г.)': 'хуй',
		' хуй (1992 г)': 'хуй',
		' хуй slowed': 'хуй',
		' хуй reverb': 'хуй',
		' хуй (http://vk.com)': 'хуй',
		'[1989] French Kiss (Gay Version) [YOUTUBE RIP]': 'french kiss',
		'Айлавью (Heroin 0 (remixed), 1996) (Эклектика магистраль ремикс) (Макс Головин)': 'айлавью',
	};

	for (const [input, expected] of Object.entries(cases)) {
		const result = normalizeTitle(input, {
			forceRemoveBrackets: true,
		});
		if (result !== expected) {
			console.error(`«${input}» result was «${result}», but expected «${expected}»`);
			throw new Error(`normalizeTitle test error`);
		}
	}
}

function normalizeArtistTest(): void {
	const cases: Record<string, string> = {
		"2 body's – 4 dancetrax – ℗ 1989": "2 body's",
	};

	for (const [input, expected] of Object.entries(cases)) {
		const result = normalizeArtist(input);
		if (result !== expected) {
			console.error(`«${input}» result was «${result}», but expected «${expected}»`);
			throw new Error(`normalizeArtist test error`);
		}
	}
}
