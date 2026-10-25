// test/normalizeTitle.test.ts
import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { normalizeTitle } from './../src/string-utils.js';

describe('normalizeTitle', () => {
	const testCases: Record<string, string> = {
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

	for (const [input, expected] of Object.entries(testCases)) {
		test(`должен нормализовать заголовок "${input}" в "${expected}"`, () => {
			const result = normalizeTitle(input, {
				forceRemoveBrackets: true,
			});
			assert.strictEqual(result, expected);
		});
	}

	test('должен обрабатывать пустую строку', () => {
		const result = normalizeTitle('', { forceRemoveBrackets: true });
		assert.strictEqual(result, '');
	});

	test('должен обрабатывать строку без скобок', () => {
		const input = 'чистый заголовок';
		const result = normalizeTitle(input, { forceRemoveBrackets: true });
		assert.strictEqual(result, 'чистый заголовок');
	});
});
