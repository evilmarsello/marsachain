# Иконки для Mini App (веб)

## Почему не Android `.xml`

Файлы **Vector Drawable** (`res/drawable/*.xml`) и **mipmap** из Android Studio **браузер не открывает**. В вебе используют **SVG**, **PNG** (или **WebP**).

Рекомендация: экспорт из Figma / «Export» в Android Studio для вектора → **SVG**; для сложных растровых кнопок — **PNG @1x и @2x** (например `name.png` и `name@2x.png` или положить только `@2x` и задать `width`/`height` в CSS вполовину).

## Куда класть файлы

Каталог **`webapp/public/icons/`** попадает в корень сайта как **`/icons/…`** (Vite копирует `public/` как есть).

Пример в HTML/шаблоне:

```html
<img src="/icons/section-wallet.svg" alt="" width="22" height="22" loading="lazy" />
```

## Имена (договорённость с кодом)

Добавляйте файлы по мере готовности; в разметке можно ссылаться на:

| Файл (пример)        | Назначение                          |
|---------------------|-------------------------------------|
| `section-node.svg`  | блок «Нода / сеть»                  |
| `section-wallet.svg`| кошелёк / баланс                    |
| `section-mining.svg`| майнинг                             |
| `section-mempool.svg` | mempool                           |
| `section-validators.svg` | валидаторы                      |
| `section-telegram.svg` | Telegram / безопасность          |
| `app-logo.png`      | логотип в шапке (копия `res/drawable/logo.png` из Android) |
| `ic_wallet.svg` / `.png` | нижняя вкладка «Кошелёк» (как в Android `@drawable/ic_wallet`) |
| `ic_mining.svg`     | вкладка «Майнинг» / Mine           |
| `ic_settings.svg`   | вкладка «Настройки»               |

Сейчас вкладки используют **встроенные SVG** в коде; если положите файлы с этими именами, позже можно заменить разметку на `<img src="/icons/ic_wallet.svg" …>`.

Имена **не обязаны** совпадать один в один — после добавления файла можно подключить его в `main.ts` (класс `card-ico` и т.д.) или в CSS как `background-image`.

## Формат

- **SVG** — масштабируется, малый вес; следите за `viewBox` и цветом (можно `currentColor`, тогда цвет задаётся из CSS).
- **PNG** — для теней/градиентов как на Android; для Retina удвоенный размер или отдельный `@2x`.

Цвета бренда в приложении см. `android-client/app/src/main/res/values/colors.xml` и `drawable/primary_button_background.xml` (`#BC5A2B` кнопки, `#FF9500` акцент текста).
