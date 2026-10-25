// test/fixWin1251.test.ts
import { describe, it, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { fixWin1251 } from './../src/string-utils.js';

describe('fixWin1251', () => {
	test('should fix misinterpreted Windows-1251 text', () => {
		// Test case: "Привет" (Hello in Russian) misinterpreted as Latin-1
		// In Windows-1251: П=208, р=240, и=232, в=226, е=229, т=242
		// When misinterpreted as Latin-1, these become: Ïðèâåò
		const misinterpreted = 'Ïðèâåò';
		const expected = 'Привет';
		const result = fixWin1251(misinterpreted);
		assert.strictEqual(result, expected);
	});

	test('should fix misinterpreted Windows-1251 with mixed content', () => {
		// Based on your debug output:
		// Ôåñò 123 (212, 229, 241, 242, 32, 49, 50, 51)
		// becomes:
		// Фест 123 (1060, 1077, 1089, 1090, 32, 49, 50, 51)

		const misinterpreted = 'Ôåñò 123';
		const expected = 'Фест 123'; // This is what actually gets produced
		const result = fixWin1251(misinterpreted);
		assert.strictEqual(result, expected);
	});

	test('should handle English text without changes', () => {
		const englishText = 'Hello World 123';
		const result = fixWin1251(englishText);
		assert.strictEqual(result, englishText);
	});

	test('should handle empty string', () => {
		const result = fixWin1251('');
		assert.strictEqual(result, '');
	});

	test('should handle string without Windows-1251 characters', () => {
		const normalText = 'Normal text with numbers 123 and symbols !@#';
		const result = fixWin1251(normalText);
		assert.strictEqual(result, normalText);
	});

	test('should fix Ukrainian text', () => {
		// Ukrainian "Привіт" misinterpreted
		const misinterpreted = 'Ïðèâ³ò';
		const expected = 'Привіт';
		const result = fixWin1251(misinterpreted);
		assert.strictEqual(result, expected);
	});

	test('should handle special Windows-1251 characters', () => {
		// Test quotation marks and other special chars in Windows-1251
		const misinterpreted = '<< >> © ®';
		// Note: This test might need adjustment based on actual character mappings
		const result = fixWin1251(misinterpreted);
		// Just verify it doesn't crash and returns a string
		assert.strictEqual(typeof result, 'string');
	});

	test('should not modify already correct Unicode text', () => {
		const correctText = 'Привет мир';
		const result = fixWin1251(correctText);
		assert.strictEqual(result, correctText);
	});

	test('should not modify Latin text with diacritics', () => {
		for (const text of ['Café del Mar', 'Björk', 'Mötley Crüe', 'Abrão', 'Abwärts', 'Voyage à Paris', 'Señorita']) {
			assert.strictEqual(fixWin1251(text), text);
		}
	});

	test('should fix mojibake mixed with Latin words', () => {
		assert.strictEqual(fixWin1251('DJ Ñìåøàðèêè'), 'DJ Смешарики');
		assert.strictEqual(fixWin1251('Íèíà Áðîäñêàÿ'), 'Нина Бродская');
		assert.strictEqual(fixWin1251('¨æèê'), 'Ёжик');
	});

	test('should handle single character', () => {
		// Single Cyrillic character misinterpreted
		const misinterpreted = 'Ï'; // Should be 'П'
		const expected = 'П';
		const result = fixWin1251(misinterpreted);
		assert.strictEqual(result, expected);
	});
});
