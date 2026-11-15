/**
 * Minimal runtime stand-in for the parts of the Obsidian API used by the
 * plugin's command code. The real API is only available inside Obsidian.
 */
export interface EditorPosition {
	line: number;
	ch: number;
}

export const notices: string[] = [];
export const openedModals: SuggestModal<unknown>[] = [];

export class Notice {
	constructor(message: string | DocumentFragment) {
		notices.push(typeof message === 'string' ? message : '[fragment]');
	}
	hide(): void {}
}

export class App {}

export abstract class SuggestModal<T> {
	placeholder = '';
	emptyStateText = '';
	constructor(public app: App) {}
	setPlaceholder(text: string): void {
		this.placeholder = text;
	}
	setInstructions(): void {}
	open(): void {
		openedModals.push(this);
	}
	abstract getSuggestions(query: string): T[];
	abstract renderSuggestion(value: T, el: HTMLElement): void;
	abstract onChooseSuggestion(item: T, evt: MouseEvent | KeyboardEvent): void;
}

export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
