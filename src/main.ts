import { Plugin } from 'obsidian';
import { correctPinyinAtCursor, insertPinyinAfterSelection, type CommandContext } from './commands';
import { decideAutomatic } from './core/decide';
import type { Pronouncer } from './core/pronouncer';
import { createAutoPinyinExtension } from './editor/auto-extension';
import { createPronouncer, OUTPUT_SEPARATOR, REMOVE_BRACKETS, sanitizeSettings, type PinyinCompanionSettings } from './settings';
import { PinyinCompanionSettingTab } from './settings-tab';
import { SuggestionNotices } from './ui/suggestion-notice';

export default class PinyinCompanionPlugin extends Plugin {
	settings: PinyinCompanionSettings = sanitizeSettings(undefined);
	private pronouncer: Pronouncer | null = null;
	private readonly notices = new SuggestionNotices();

	async onload(): Promise<void> {
		this.settings = sanitizeSettings(await this.loadData());

		this.addCommand({
			id: 'insert-pinyin-after-selection',
			name: 'Insert pinyin after selected Chinese',
			editorCallback: (editor) => insertPinyinAfterSelection(editor, this.commandContext()),
		});
		this.addCommand({
			id: 'correct-pinyin-at-cursor',
			name: 'Correct pinyin annotation at cursor',
			editorCallback: (editor) => correctPinyinAtCursor(editor, this.commandContext()),
		});

		this.registerEditorExtension(
			createAutoPinyinExtension({
				decide: (line, cursor) =>
					decideAutomatic(line, cursor, this.getPronouncer(), {
						separator: OUTPUT_SEPARATOR,
						suggestions: true,
						bracketsOnly: this.settings.bracketsOnly,
						removeBrackets: REMOVE_BRACKETS,
					}),
				suggest: (view, suggestion) => this.notices.show(view, suggestion),
			}),
		);

		this.addSettingTab(new PinyinCompanionSettingTab(this.app, this));
	}

	onunload(): void {
		this.notices.hideAll();
	}

	async updateSettings(patch: Partial<PinyinCompanionSettings>): Promise<void> {
		this.settings = sanitizeSettings({ ...this.settings, ...patch });
		this.pronouncer = null;
		await this.saveData(this.settings);
	}

	/** Created lazily so plugin start-up stays light; rebuilt after settings change. */
	private getPronouncer(): Pronouncer {
		this.pronouncer ??= createPronouncer(this.settings);
		return this.pronouncer;
	}

	private commandContext(): CommandContext {
		return {
			app: this.app,
			pronouncer: this.getPronouncer(),
			separator: OUTPUT_SEPARATOR,
			removeBrackets: REMOVE_BRACKETS,
		};
	}
}
