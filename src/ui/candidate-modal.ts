import { type App, SuggestModal } from 'obsidian';
import type { Proposal } from '../core/decide';

/** Small chooser for uncertain corrections. Escape leaves the note unchanged. */
export class CandidateModal extends SuggestModal<Proposal> {
	constructor(
		app: App,
		private readonly proposals: readonly Proposal[],
		message: string,
		private readonly onChoose: (proposal: Proposal) => void,
	) {
		super(app);
		this.setPlaceholder(message);
		this.emptyStateText = 'No matching option.';
		this.setInstructions([
			{ command: '↑↓', purpose: 'to navigate' },
			{ command: '↵', purpose: 'to apply' },
			{ command: 'esc', purpose: 'to keep your text' },
		]);
	}

	getSuggestions(query: string): Proposal[] {
		const q = query.trim().toLowerCase();
		if (!q) return [...this.proposals];
		return this.proposals.filter((p) => p.insert.toLowerCase().includes(q) || p.chinese.includes(q));
	}

	renderSuggestion(proposal: Proposal, el: HTMLElement): void {
		el.createDiv({ text: `${proposal.chinese} ${proposal.insert}`, cls: 'pinyin-companion-option' });
		el.createEl('small', { text: `${proposal.note} · replaces “${proposal.original}”`, cls: 'pinyin-companion-option-note' });
	}

	onChooseSuggestion(proposal: Proposal): void {
		this.onChoose(proposal);
	}
}
