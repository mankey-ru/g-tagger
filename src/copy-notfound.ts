#!/usr/bin/env node
/**
 * Штука, которая копирует ненайденные треки в GTAGGER_TEST_TRACKS для дальнейшей отладки
 * npm run copy-notfound -- -i C:\\SYMLINKS\\GITROOT\\_my\\g-tagger\\logs\\2025-07-24__22-44-00_notfound.json
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { program } from 'commander';

interface FileEntry {
	filePath: string;
	[key: string]: any;
}

// Set up CLI
program
	.name('file-copier')
	.description('Copy files listed in JSON to target directory')
	.version('1.0.0')
	.requiredOption('-i, --input <path>', 'Absolute path to input JSON file')
	.requiredOption('-o, --output <path>', 'Absolute path to output directory', `D:\\GTAGGER_TEST_TRACKS`)
	.action(async (options) => {
		await copyFiles(options.input, options.output);
	});

program.parseAsync(process.argv).catch(console.error);

async function copyFiles(jsonPath: string, outputDir: string) {
	try {
		await fs.mkdir(outputDir, { recursive: true });
		const data = await fs.readFile(jsonPath, 'utf-8');
		const files: FileEntry[] = JSON.parse(data);

		let successCount = 0;
		let errorCount = 0;

		for (const file of files) {
			if (!file.filePath) {
				console.warn('Skipping entry with missing filePath');
				errorCount++;
				continue;
			}

			const sourcePath = file.filePath;
			const fileName = path.basename(sourcePath);
			const destPath = path.join(outputDir, fileName);

			try {
				await fs.copyFile(sourcePath, destPath);
				console.log(`✓ Copied: ${fileName}`);
				successCount++;
			} catch (error) {
				console.error(`✗ Failed to copy ${fileName}:`, (error as Error).message);
				errorCount++;
			}
		}

		console.log(`\nOperation complete!`);
		console.log(`Successfully copied: ${successCount} files`);
		console.log(`Failed to copy: ${errorCount} files`);
	} catch (error) {
		console.error('Fatal error:', (error as Error).message);
		process.exit(1);
	}
}
