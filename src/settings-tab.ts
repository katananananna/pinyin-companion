import { type App, Notice, PluginSettingTab, Setting } from 'obsidian';
import { validateOverride } from './core/overrides';
import type PinyinCompanionPlugin from './main';
import { MAX_IDLE_DELAY_MS, MIN_IDLE_DELAY_MS } from './settings';

const DELAY_STEP_MS = 100;

export class PinyinCompanionSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: PinyinCompanionPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const settings = this.plugin.settings;

		new Setting(containerEl)
			.setName('Automatic mode')
			.setDesc('After you pause typing, add tone marks when the pinyin you typed exactly matches the Chinese before it. Uncertain cases are never changed automatically.')
			.addToggle((toggle) => toggle.setValue(settings.autoMode).onChange((value) => this.plugin.updateSettings({ autoMode: value })));

		new Setting(containerEl)
			.setName('Idle delay')
			.setDesc(`Milliseconds to wait after typing before automatic mode checks (${MIN_IDLE_DELAY_MS}–${MAX_IDLE_DELAY_MS}).`)
			.addSlider((slider) =>
				slider
					.setLimits(MIN_IDLE_DELAY_MS, MAX_IDLE_DELAY_MS, DELAY_STEP_MS)
					.setValue(settings.idleDelayMs)
					.setDynamicTooltip()
					.onChange((value) => this.plugin.updateSettings({ idleDelayMs: value })),
			);

		new Setting(containerEl)
			.setName('Typo suggestions')
			.setDesc('In automatic mode, offer a correction (never applied without a click) for small spelling mistakes and for readings that differ from the phrase’s usual reading.')
			.addToggle((toggle) => toggle.setValue(settings.typoSuggestions).onChange((value) => this.plugin.updateSettings({ typoSuggestions: value })));

		new Setting(containerEl)
			.setName('Output separator')
			.setDesc('How new pinyin is placed after the Chinese. Existing parentheses are always kept.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('space', 'Space: 學習 xué xí')
					.addOption('parentheses', 'Parentheses: 學習 (xué xí)')
					.setValue(settings.separator)
					.onChange((value) => this.plugin.updateSettings({ separator: value === 'parentheses' ? 'parentheses' : 'space' })),
			);

		new Setting(containerEl)
			.setName('Mark tone changes of 一 and 不')
			.setDesc('Off: dictionary style (一個 yī gè, 不是 bù shì). On: spoken tone changes as provided by the pronunciation library (yí gè, bú shì). Third-tone changes are never marked.')
			.addToggle((toggle) => toggle.setValue(settings.markYiBuSandhi).onChange((value) => this.plugin.updateSettings({ markYiBuSandhi: value })));

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
