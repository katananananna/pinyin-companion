# Manual test checklist

Automated tests cover the conversion, matching, Markdown detection, settings validation, the commands (using an in-memory editor) and automatic mode in a real CodeMirror 6 editor under jsdom, including undo and simulated IME composition. The items below need Obsidian itself, a real IME, or a mobile device.

Use a **test vault**, not your real notes. Install `dist/pinyin-companion/` as described in the README, enable the plugin, and open a new note in **Live Preview**. Repeat the editor sections in **Source mode**.

Record the Obsidian version, OS and device for each run.

## 1. Installation and lifecycle

- [ ] The plugin appears under **Settings → Community plugins** and turns on without errors (check **View → Toggle developer tools → Console** on desktop).
- [ ] Both commands appear in the command palette when you search "pinyin".
- [ ] The **Pinyin Companion** settings tab opens and shows the brackets-only toggle and the overrides.
- [ ] Turn the plugin off and on again. No errors, the commands still work once, and no duplicate notices or conversions appear.
- [ ] Assign a hotkey to each command under **Settings → Hotkeys**. Both hotkeys trigger the commands.

## 2. Insert pinyin after selected Chinese

- [ ] Select `尚未成熟` and run the command. Result: `尚未成熟 shàng wèi chéng shú`, with the cursor after `shú`.
- [ ] Select from right to left (Shift+←). Same result.
- [ ] Select `還是局限於此` (Traditional). Result: `hái shì jú xiàn yú cǐ`.
- [ ] Select `学习` (Simplified). Result: `xué xí`.
- [ ] Select `尚未成熟，還要學習。`. Result: `shàng wèi chéng shú, hái yào xué xí.`
- [ ] Select `學習 abc` → notice, no change. Empty selection → notice, no change. Selection across two lines → notice, no change.
- [ ] With two cursors or selections (Alt/Option+click), the command shows a notice and changes nothing.
- [ ] Press Undo once. The insertion disappears completely.
- [ ] Set **Output separator** to Parentheses and repeat with `回饋`. Result: `回饋 (huí kuì)`.

## 3. Correct pinyin annotation at cursor

- [ ] `局限於 ju xian yu` with the cursor at the end → `局限於 jú xiàn yú`.
- [ ] Cursor inside `xian` → same result. Cursor inside `局限於` → same result.
- [ ] `學習 xuexi` → `學習 xué xí`. `學習 xue2xi2` → same. `綠色 lv se` → `綠色 lǜ sè`.
- [ ] `學習 xué xí` → notice "already correct", no change.
- [ ] `學習 xueix` → the chooser shows `學習 xué xí`. Enter applies it, Esc leaves the text unchanged.
- [ ] `長大 chang da` → the chooser offers `cháng dà` and `zhǎng dà`.
- [ ] `學習 xue xi，回饋 hui kui` with the cursor in `hui` → only `回饋`'s pinyin changes.
- [ ] `我今天在圖書館學習 xuexi` → only `xuexi` changes to `xué xí`.
- [ ] `學習 xuexi is fun` with the cursor after `xuexi` → `is fun` is untouched.
- [ ] `我用 Obsidian 寫作` with the cursor after `Obsidian` → notice, no change.
- [ ] `**回饋** hui kui` → `**回饋** huí kuì`. The bold markers are kept.
- [ ] After a correction, one Undo restores the original pinyin.

## 4. Automatic mode (desktop)

Automatic conversion is always on.

- [ ] Type `學習 xuexi` and pause. After about 0.7 s the text becomes `學習 xué xí` and the cursor stays at the end of the line.
- [ ] Keep typing without pausing (`學習 xuexi很好`). No conversion happens mid-stream.
- [ ] Type `學習 [xuexi` (Obsidian adds the `]`), pause → `學習 [xué xí]`. With **Remove brackets after converting** on → `學習 xué xí`.
- [ ] Type `學習 (study)` and `我喜歡 [coffee]`, pause → unchanged. Type `[學習 xuexi](https://example.com)` → unchanged.
- [ ] Turn on **Only convert inside brackets**: `學習 xuexi` stays, `學習 [xuexi]` converts.
- [ ] Type `謝謝 xie`, pause → no change. Continue to `謝謝 xie xie`, pause → `謝謝 xiè xiè` (the library's reading).
- [ ] Type `尚未成熟 shang wei`, pause → no change. Finish it, pause → converted.
- [ ] After an automatic conversion, press Undo once. The plain pinyin returns and **is not converted again**, even after typing a space and pausing.
- [ ] Press Redo. The conversion comes back.
- [ ] Type `學習 xueix`, pause. A notice offers `xué xí`, and the text is unchanged until you select the button. Selecting it applies the correction.
- [ ] Select the suggestion button after editing that line → notice "The text has changed", no edit.
- [ ] Paste `學習 xuexi` from the clipboard → no conversion.
- [ ] Type the same annotations inside each of these → no automatic change:
  - [ ] a fenced code block (```` ``` ```` and `~~~`)
  - [ ] inline code `` `學習 xuexi` ``
  - [ ] YAML frontmatter at the top of the note
  - [ ] a link destination `[x](學習 xuexi)` and a wiki link `[[學習 xuexi]]`
  - [ ] a URL, e.g. `https://example.com/學習xuexi`
  - [ ] an HTML tag `<span title="學習 xuexi">`
- [ ] With two cursors, typing never triggers a conversion.
- [ ] Turn automatic mode off. Typing never converts.
- [ ] Open a note in a **pop-out window** and repeat the first check.

## 5. Chinese input methods (IME)

Test with at least one system IME (e.g. macOS Pinyin/Zhuyin, Windows Microsoft Pinyin/Bopomofo, Gboard on Android).

- [ ] Type Chinese with the IME candidate window open, pausing for a few seconds while composing. Nothing is rewritten and the composition is not interrupted.
- [ ] Type `學習` with the IME, switch to English, type ` xuexi`, pause → converted once, and the IME is not disrupted.
- [ ] Type pinyin through the IME's inline English mode (if it has one) → same behaviour.

## 6. Mobile (iOS / iPadOS / Android)

The code uses no desktop-only APIs, but this plugin has not yet been run on a device. Record the results here.

- [ ] The plugin installs and enables.
- [ ] Both commands run from the command palette and the mobile toolbar (add them via **Settings → Mobile → Manage toolbar options**).
- [ ] The chooser opens and responds to taps.
- [ ] In automatic mode, typing with the on-screen keyboard (including predictive text and the Chinese keyboard) converts only after a pause, never during composition, and Undo works.
- [ ] Suggestion notice buttons can be tapped.
- [ ] The settings tab is usable: the toggle and adding/removing overrides.

## 7. Settings and overrides

- [ ] Add the override `理髮` → `li3 fa4`. It is shown as `lǐ fà`. `我去理髮店 wo qu li fa dian` then corrects to `wǒ qù lǐ fà diàn`.
- [ ] Add an override with a mismatched syllable count (`理髮` → `lifa`) → error notice, nothing saved.
- [ ] Add a non-Chinese phrase → error notice.
- [ ] Remove the override. `理髮` goes back to the library reading `lǐ fā`.
- [ ] Restart Obsidian. All settings and overrides persist.
- [ ] Turn on **Mark tone changes of 一 and 不**. Selecting `一個不是` and inserting gives `yí gè bú shì`. Turn it off → `yī gè bù shì`.
