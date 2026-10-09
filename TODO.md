# TODO

1. Кастомные теги `gtagger_version` и `gtagger_stage` в файл не пишутся: node-id3 молча отбрасывает
   ключи, которые не являются алиасом и не являются 4-символьным frame ID
   (`node_modules/node-id3/src/ID3Helpers.js`, проверка `frameIdentifier.length !== 4`).
   Перевести их на `TXXX` через `userDefinedText: [{ description: 'GTAGGER_VERSION', value }]`.
   Заодно починить `areTagsEqual` в `src/main.ts`: сейчас он сравнивает с ключами, которых `ID3.read()`
   никогда не вернёт (`gtagger_stage`, `country`), поэтому файл перезаписывается при каждом прогоне.
   Сравнивать нужно реальные frames, в том числе элементы `userDefinedText` по `description`.
2. Версия g-tagger не видна в Windows Explorer, хотя комментарий в `src/main.ts` (над `tagsToUpdate`) утверждает
   обратное. Проверено чтением Shell properties тестового файла: Explorer не показывает ни `COMM`
   (`comment: { text, language: 'eng' }`, как пишет node-id3), ни `TRSN` (`internetRadioName`).
   Разобраться, почему Explorer не видит `COMM`: пустой `shortText`, другой `language`, кодировка текста.
   Если не выйдет - перенести версию в frame, который Explorer показывает (см. таблицу в README),
   и поправить комментарий в коде и README.
3. **ПЕРВЫЙ ПРИОРИТЕТ.** Протестировать, отревьюить и закоммитить незакоммиченный WIP (на 2026-10-09 лежит
   в index и working tree): `src/main.ts` (переименование stats, `request_delay`, рефакторинг
   `getAllKindsOfNames`, `fixWin1251` для album и т.д.), `src/string-utils.ts`, `src/types/global.d.ts`,
   `src/index.ts`, `src/copy-notfound.ts`, `package.json`, `test/*.test.ts`. Продумать тесты: что покрыто
   `test/fixWin1251.test.ts` и `test/normalizeTitle.test.ts`, чего не хватает. Заодно решить судьбу
   `.lnk`-ярлыков, `tmp/`, `src/.npmrc`, `mcps/`, `g-tagger.code-workspace` (коммитить или в `.gitignore`).
