# Pinyin Companion

An Obsidian plugin for people who write Chinese speeches and study notes. Type a Chinese word or phrase followed by plain pinyin, and Pinyin Companion uses the **Chinese characters as the source of truth** to add tone marks, and to suggest fixes for small spelling mistakes.

```
局限於 ju xian yu              →  局限於 jú xiàn yú
尚未成熟 shang wei cheng shu   →  尚未成熟 shàng wèi chéng shú
潛移默化 qian yi mo hua        →  潛移默化 qián yí mò huà
回饋 hui kui                   →  回饋 huí kuì
學習 xuexi                     →  學習 xué xí
學習 xueix                     →  suggests 學習 xué xí
```

- Works with Traditional and Simplified Chinese; your characters are never changed.
- Output is lowercase, space-separated, tone-marked pinyin. No bold, italics or parentheses.
- Fully offline: the pronunciation data is bundled. No network requests, AI, API keys or telemetry.

## Install manually

1. Build the plugin (see [Build and test from source](#build-and-test-from-source)) or use the prebuilt folder `dist/pinyin-companion/` in this project.
2. Copy the whole `pinyin-companion` folder into your vault's plugin folder, so you end up with:
   ```
   <your vault>/.obsidian/plugins/pinyin-companion/main.js
   <your vault>/.obsidian/plugins/pinyin-companion/manifest.json
   <your vault>/.obsidian/plugins/pinyin-companion/styles.css
   ```
   (`.obsidian` is a hidden folder. On macOS press <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>.</kbd> in Finder to show it. On iOS/Android, copy the folder with a file manager or your sync tool.)
3. In Obsidian, open **Settings → Community plugins**. If prompted, select **Turn on community plugins**.
4. Under **Installed plugins**, select the refresh button, then turn on **Pinyin Companion**.

Requires Obsidian 1.5.7 or later.

## Commands and hotkeys

Open the command palette (<kbd>Cmd/Ctrl</kbd>+<kbd>P</kbd>) and type "pinyin".

| Command | What it does |
|---|---|
| **Insert pinyin after selected Chinese** | Select Chinese text (Chinese punctuation allowed) and run it. Selecting `尚未成熟` gives `尚未成熟 shàng wèi chéng shú`. Sentence punctuation is carried over: `尚未成熟，還要學習。` → `… shàng wèi chéng shú, hái yào xué xí.` |
| **Correct pinyin annotation at cursor** | Put the cursor anywhere in the Chinese, in the pinyin, or right after it (up to three spaces or punctuation marks after it), and run it. Only the pinyin is replaced. |

The plugin sets no default hotkeys. To add your own, go to **Settings → Hotkeys**, search for "Pinyin Companion", and select the **+** next to a command.

### What the correction command accepts

- Spaced or joined pinyin: `qian yi mo hua`, `qianyimohua`, `xue2xi2`
- Tone marks or tone numbers: `xué xí`, `xue2 xi2` (0 or 5 = neutral tone)
- ü as `ü`, `v` or `u:`: `lv se`, `lu:4 se4`, `jv` → `jú`
- Any letter case: `XUE XI` → `xué xí`

When the result is certain, it is applied directly. When it is not, a small chooser opens and <kbd>Esc</kbd> leaves your text unchanged:

- **Your tones disagree** with the phrase (`學習 xue4 xi2`): choose the dictionary tones or keep yours.
- **Another valid reading** of a polyphonic character (`長大 chang da`): choose your reading (`cháng dà`) or the reading for the phrase (`zhǎng dà`).
- **Possible spelling mistake** (`學習 xueix`): confirm the correction.
- **More than one phrase boundary** fits the pinyin: choose which Chinese it annotates.

The commands also work inside code blocks and frontmatter, because you ran them on purpose. On the current line they still refuse to edit inside inline code, URLs, link destinations, wiki links and HTML tags.

If the text after the Chinese doesn't resemble the pinyin closely enough (for example `我用 Obsidian` or `我喜歡 coffee`), nothing changes and a notice explains why.

## Automatic mode

Always on, so you don't need the command palette: just type.

Two ways to type, both of which work at the same time:

- **Plain:** type the Chinese, a space, then the pinyin: `學習 xuexi` → `學習 xué xí` the moment the pinyin is complete.
- **In brackets:** type the pinyin inside `( )`, `[ ]`, `【 】` or `（ ）`: `學習 [xuexi]` → `學習 xué xí` (the brackets are removed). Turn on **Only convert inside brackets** in settings if you want plain text after Chinese to be left alone completely.

**How it tells pinyin from ordinary notes.** Text after Chinese (plain or in brackets) is only converted when it spells the pronunciation of the Chinese right before it. `學習 [xuexi]` converts, but `學習 [study]`, `我喜歡 (coffee)`, `回饋 [TODO]` and `學習 [see page 3]` don't match, so they're left alone. Square brackets that are part of Markdown (`[學習 xuexi](https://…)`, `[xuexi][ref]`, `[^xuexi]`, `[[學習 xuexi]]`) are never treated as pinyin. The plugin never guesses from the English side alone.

Tip: Obsidian types the closing bracket for you (Settings → Editor → Auto pair brackets), so you type `學習 [xuexi` and the closing `]` is already there. Without auto-pairing, close the bracket yourself, because an unclosed bracket isn't converted.

As you type, the plugin looks at the line you are typing on. A complete, exact match converts immediately; less certain cases (such as only the last characters of a longer run) wait for a 0.3 second pause:

- Closing quotes and punctuation between the Chinese and the pinyin are fine: `「欲速則不達」yu su ze bu da` converts.
- It only considers an annotation that **ends at your cursor** (a space or punctuation mark typed after it is fine).
- It replaces the pinyin **only if every typed syllable exactly matches** the reading of the Chinese just before it (after normalizing tone numbers, ü spellings and letter case), and only one interpretation fits.
- It waits while the annotation may be incomplete. For example, `謝謝 xie` is left alone because you are probably about to type `xie xie`.
- Pinyin you typed with tone marks is left alone, except that a typed third tone before another third tone is turned into the spoken second tone (`俚語 lǐ yǔ` → `俚語 lí yǔ`).
- **Spelling mistakes are fixed automatically** after a 0.3 second pause, when one correction clearly fits (`促進 cu jni` → `促進 cù jìn`, `學習 xueix` → `學習 xué xí`). Very short pinyin (four letters or fewer) is never corrected, and unfinished pinyin is left alone. If more than one correction fits, a notice lets you choose. Undo restores what you typed, and it won't be corrected again.
- It never runs during Chinese IME composition, only for a single cursor, and never in fenced code blocks, frontmatter, inline code, URLs, link destinations, wiki links or HTML.
- Each conversion is a separate undo step. If you undo a conversion, it is not reapplied to that annotation.
- Pasted text, undo/redo and edits made by other plugins never trigger it.

If automatic conversion ever gets in the way, switch on **Only convert inside brackets**, or use **Correct pinyin annotation at cursor**, which gives you the same results on demand.

## How matching works

A Chinese run can be a whole sentence, so the plugin has to decide which Chinese the pinyin belongs to. The rules, which are implemented in `src/core/annotation.ts`, are:

1. **Region.** A run of Chinese characters, then optionally up to three closing emphasis markers (`**回饋** hui kui`), optional spaces, an optional opening bracket (`(`, `（`, `[`, `【` or `［`), then pinyin-like words separated by spaces. If a bracket is opened, its matching closer must follow. A square-bracket span followed by `(`, `[` or `:` is a Markdown link or reference and is ignored.
2. **Suffix candidates.** Only Chinese that ends right where the pinyin begins is considered: the last 1 to 16 characters of the run.
3. **Context.** Readings are computed for the last 32 characters of the run together, so the library's word segmentation can pick readings for polyphonic characters (`我在銀行` → `háng`). The suffix on its own is also tried.
4. **Syllable alignment.** Typed pinyin must cover whole syllables. A joined word like `xuexi` may cover several syllables, but a syllable never spans two typed words. Only the leading pinyin words are replaced, so English after the pinyin (`學習 xuexi is fun`) is kept.
5. **Preference.** An exact match wins over everything else. Among exact matches, the one covering the most typed words wins. If two different results remain, you are asked to choose.
6. **Typos** use the optimal-string-alignment distance, which counts an adjacent transposition such as `xueix`/`xuexi` as one edit. Typed input of four letters or fewer is never corrected. Five to eight letters allow one edit, nine or more allow two.

Segmentation and reading selection come from a dictionary-based library and are not perfect. Check important annotations.

## Pronunciation, tones and limitations

**Polyphonic characters** (one character, several readings) are resolved from the word or phrase by [pinyin-pro](https://github.com/zh-lx/pinyin-pro): 銀行 yín háng, 行走 xíng zǒu, 長大 zhǎng dà, 重複 chóng fù, 音樂 yīn yuè, 看著 kàn zhe, 著名 zhù míng.

**Traditional Chinese.** pinyin-pro's phrase data is based on Simplified Chinese, and its readings for Traditional text are often wrong (for example 於 → wū, 還是 → huán shì, 我們 → wǒ mén). Pinyin Companion therefore looks readings up on a Simplified copy made with [OpenCC](https://github.com/nk2028/opencc-js) (Taiwan variants → Mainland Simplified, character and phrase mapping only). Your note is never changed. With this, 局限於 → jú xiàn yú, 還是 → hái shì, 乾淨 → gān jìng, while 乾隆 stays qián lóng.

**Tone sandhi** (tone changes caused by neighbouring syllables) is separate from polyphony:

- By default the output is **dictionary style**, with each character in its citation tone: 一個 yī gè, 不是 bù shì, 你好 nǐ hǎo.
- **Mark tone changes of 一 and 不** (setting, off by default) uses pinyin-pro's built-in 一/不 rules: 一個 yí gè, 一天 yì tiān, 不是 bú shì, while 第一 and 十一 stay yī.
- **Spoken tone changes are marked.** Two third tones in a row are written the way they are said: 你好 is `ní hǎo`, 洗澡 is `xí zǎo`, 老虎 is `láo hǔ`. Chains of three or more third tones (我也很好, 展覽館) are left unchanged, because which syllables change depends on how the speaker groups the words and the sources disagree. 一 and 不 are marked too (`yí gè`, `bú shì`).
- The output is not a phonetic transcription of connected speech.

**Neutral tones** follow the library's dictionary: 我們 wǒ men, 認識 rèn shi, 頭髮 tóu fa.

**Known limitations** (all fixable per phrase with overrides):

- Readings follow the **Mainland Putonghua** standard. Taiwan Guoyu readings differ for some words, for example 垃圾 lā jī (Taiwan: lè sè), 星期 xīng qī (xīng qí), 危險 wēi xiǎn (wéi xiǎn), 亞洲 yà zhōu (yǎ zhōu).
- Some dictionary readings are debatable or depend on meaning: 理髮 lǐ fā (lǐ fà is more usual), 東西 always dōng xī (dōng xi when it means "thing"), 時候 shí hòu.
- A character the library doesn't know (rare extension-block characters) has no reading, and the command explains this.
- Iteration marks such as 々 are not treated as Chinese characters.

### Pronunciation overrides

In **Settings → Pinyin Companion → Pronunciation overrides**, add an exact phrase and its pinyin, for example `理髮` → `lǐ fà` (or `li3 fa4`). Overrides:

- must have exactly one syllable per character and use valid pinyin syllables (tone marks, numbers, `v` or `u:` are normalized when saved),
- take priority over the library wherever that exact phrase appears, including inside longer text (the longest matching override wins),
- apply only to exactly the characters you entered (an override for `理髮` doesn't affect `理发`),
- are stored in this plugin's settings only and never modify the pronunciation library's global data.

## Settings

| Setting | Default | Description |
|---|---|---|
| Only convert inside brackets | Off | Off: pinyin after Chinese converts as soon as it is complete, in brackets or not. On: only pinyin inside brackets converts. |
| Pronunciation overrides | none | Add/remove exact phrase readings. |

Everything else is fixed: output is space-separated, brackets are removed after converting, and spoken tone changes (一, 不 and two third tones in a row) are marked. **Fix spelling mistakes automatically** is on by default; turn it off to only get a suggestion notice.

## Other limitations

- Commands and automatic mode work with **one cursor or selection**. With multiple cursors, the commands show a notice and automatic mode does nothing.
- The insert command works on a selection within **one line**, up to 200 characters.
- Annotations are detected **within one line**.
- Fenced code is detected for ```` ``` ```` and `~~~` fences, including inside block quotes. Indented (four-space) code blocks are not treated as code, because indentation also marks list continuations.
- Mobile compatibility: the code uses no Node or Electron APIs and `isDesktopOnly` is `false`, but the plugin has not been tested on a phone or tablet yet. See [MANUAL_TESTING.md](MANUAL_TESTING.md).

## Build and test from source

Requires Node.js 18+ and npm.

```bash
npm install          # install dependencies from package-lock.json
npm run typecheck    # TypeScript, no output files
npm test             # unit + editor integration tests (vitest)
npm run lint         # ESLint with eslint-plugin-obsidianmd
npm run build        # type-check + production bundle -> main.js
npm run package      # build, then copy release files to dist/pinyin-companion/
npm run dev          # rebuild main.js on every change
```

### Project layout

```
src/
  main.ts                 plugin lifecycle: commands, editor extension, settings tab
  settings.ts             settings shape, defaults, validation
  settings-tab.ts         settings UI
  commands.ts             the two commands (Obsidian Editor API)
  core/                   pure logic, no Obsidian imports, unit-tested
    chinese.ts            character classes
    pinyin-normalize.ts   tone marks/numbers, ü forms, comparison keys
    syllables.ts          valid syllable table (override validation)
    pronouncer.ts         pinyin-pro + OpenCC wrapper, overrides
    overrides.ts          override validation
    annotation.ts         region detection, alignment, candidates
    decide.ts             command/automatic/selection policies
    typo.ts               bounded transposition-aware edit distance
    markdown-protect.ts   code/frontmatter/URL/link/HTML detection
  editor/auto-extension.ts  CodeMirror 6 automatic mode (instant check, short pause, IME, undo)
  ui/                     chooser modal and suggestion notice
tests/                    vitest suites (jsdom for the CodeMirror tests)
```

## Privacy

Pinyin Companion runs entirely on your device. It makes no network requests, contains no telemetry, and reads only the line you are editing (plus line starts above it, to detect code blocks and frontmatter).

## License

Pinyin Companion is released under the MIT License (see `LICENSE`). It bundles pinyin-pro (MIT), opencc-js (MIT) and OpenCC dictionary data (Apache-2.0). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
