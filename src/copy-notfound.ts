#!/usr/bin/env node
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
	.requiredOption('-o, --output <path>', 'Absolute path to output directory', `C:\\Users\\st-user\\Desktop\\VKADD+`)
	.action(async (options) => {
		await copyFiles(options.input, options.output);
	});

program.parseAsync(process.argv).catch(console.error);

async function copyFiles(jsonPath: string, outputDir: string) {
	try {
		// Verify and create output directory
		await fs.mkdir(outputDir, { recursive: true });

		// Read and parse JSON file
		const data = await fs.readFile(jsonPath, 'utf-8');
		const files: FileEntry[] = JSON.parse(data);

		let successCount = 0;
		let errorCount = 0;

		// Process each file
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
