import fs from 'node:fs';
import { Command } from 'commander';
import { mainFunc } from './main.js';
import { appVersion, appName, appDescription } from './common.js';

// ---------------------------------------------------------------------
// Аргументы и опции командной строки
// ---------------------------------------------------------------------
const program = new Command();
program
	.name(appName)
	.description(appDescription)
	.version(appVersion, '-v, --version', 'Запустить фотонные торпеды')
	.addHelpText('after', '\n  Рэп калл!');

program
	.argument('[dir]', 'Директория с музыкой, например, C:\\Users\\st-user\\Desktop\\VKADD+')
	.option('-f, --force', 'Писать теги, даже если они совпадают с текущими', false)
	.option('--subdir', 'Обрабатывать также поддиректории', false)
	.action(async (dir, options: GtaggerCliOptions) => {
		if (!dir) {
			console.error(`Укажите директорию с музыкой!`);
			return;
		} else if (!fs.existsSync(dir)) {
			console.error(`Директория «${dir}» не существует!`);
			return;
		}
		// Выводим все опции, ну а чё
		console.log(`\n${appName} v${appVersion} запущена с опциями:`);
		program.options.forEach((opt) => {
			// @ts-expect-error WTF
			const value = options[opt.attributeName()];
			console.log(`${opt.flags.padEnd(20)} ${String(value).padEnd(20)} ${opt.description}`);
		});
		console.log(`\n`);

		await mainFunc(dir, options);
	});

program.parseAsync(process.argv).catch((err) => {
	console.error('Command failed:', err);
	process.exit(1);
});
