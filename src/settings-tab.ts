import { type App, Notice, PluginSettingTab, Setting } from 'obsidian';
import { validateOverride } from './core/overrides';
import type PinyinCompanionPlugin from './main';

export class PinyinCompanionSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: PinyinCompanionPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const settings = this.plugin.settings;

		new Setting(containerEl)
			.setName('Only convert inside brackets')
			.setDesc('Off: pinyin typed right after Chinese is converted as soon as it is complete, and pinyin in brackets such as 學習 [xuexi] works too. On: only pinyin inside ( ), [ ], 【 】 or （ ） is converted, so ordinary text is never touched.')
			.addToggle((toggle) => toggle.setValue(settings.bracketsOnly).onChange((value) => this.plugin.updateSettings({ bracketsOnly: value })));

		this.displayOverrides(containerEl);
	}

	private displayOverrides(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName('Pronunciation overrides')
			.setDesc('Exact phrases that always use your pinyin. One syllable per character; tone marks or numbers (li3 fa4) are accepted.')
			.setHeading();

		for (const entry of this.plugin.settings.overrides) {
			new Setting(containerEl)
				.setName(entry.phrase)
				.setDesc(entry.pinyin)
				.addExtraButton((button) =>
					button
						.setIcon('trash')
						.setTooltip('Remove override')
						.onClick(async () => {
							const overrides = this.plugin.settings.overrides.filter((o) => o.phrase !== entry.phrase);
							await this.plugin.updateSettings({ overrides });
							this.display();
						}),
				);
		}

		let phrase = '';
		let pinyin = '';
		new Setting(containerEl)
			.setName('Add override')
			.addText((text) => text.setPlaceholder('理髮').onChange((value) => (phrase = value)))
			.addText((text) => text.setPlaceholder('lǐ fà').onChange((value) => (pinyin = value)))
			.addButton((button) =>
				button
					.setButtonText('Add')
					.setCta()
					.onClick(async () => {
						const result = validateOverride(phrase, pinyin);
						if (!result.ok) {
							new Notice(result.error);
							return;
						}
						const existing = this.plugin.settings.overrides.filter((o) => o.phrase !== result.entry.phrase);
						const replaced = existing.length !== this.plugin.settings.overrides.length;
						await this.plugin.updateSettings({ overrides: [...existing, result.entry] });
						new Notice(`${replaced ? 'Updated' : 'Added'} override: ${result.entry.phrase} ${result.entry.pinyin}`);
						this.display();
					}),
			);
	}
}
