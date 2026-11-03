# Плагин экспорта библиотеки из Figma

Плагин выгружает из Figma все узлы библиотеки: SVG и PNG-превью. Он нужен вместо REST API: на тарифе Starter у API месячный лимит, и он исчерпан. Плагин не ходит в сеть и не требует токена.

## Как запустить

1. Откройте **Figma Desktop** (именно приложение, не браузер) и в нём файл «Тестовое | иллюстрации (Copy)».
2. Меню **Plugins → Development → Import plugin from manifest…** и выберите
   `E:\CLAUDE PROJECT\illustration-composer\tools\figma-export-plugin\manifest.json`.
   Это нужно сделать только один раз.
3. **Plugins → Development → Illustration Composer — экспорт библиотеки**, нажмите «Экспорт» и дождитесь счётчика «Готово». Если появится красный список «Не найдено», пришлите его мне.
4. Сохраните файл как
   `E:\CLAUDE PROJECT\illustration-composer\.figma-export\figma-export.json`.
   Если окно сохранения не открылось, нажмите «Скопировать», вставьте текст в пустой файл с этим именем и сохраните.

Дальше синхронизация запускается без сети командой `npm run library:sync:plugin`.

## Для разработчика

- Сборки нет: `code.js` и `ui.html` — готовые файлы.
- Список узлов генерируется из `scripts/library-sync/library.config.ts` командой `npm run library:plugin-nodes`. Команда пишет `nodes.generated.js` и тот же блок вставляет в `code.js`, потому что Figma загружает только один скрипт. Если блок не совпадает с конфигом, тест `plugin-nodes.test.ts` падает.
- Дерево файла (`GET /v1/files`) лежит в `.figma-export/figma-file.json`. Этот файл не коммитится: после обрезки он весит 2,4 МБ, это больше лимита в 2 МБ. Получить его:
  `curl -H "X-Figma-Token: $FIGMA_TOKEN" https://api.figma.com/v1/files/aOU1ip0vht8BGoNJi2e0dc -o .figma-export/figma-file.json`.
- Если дерева нет, `library:sync:plugin` возьмёт его из REST API. Для этого нужен `FIGMA_TOKEN`.
