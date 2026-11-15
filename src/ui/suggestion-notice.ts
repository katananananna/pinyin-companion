import type { EditorView } from '@codemirror/view';
import { Notice } from 'obsidian';
import type { Proposal } from '../core/decide';
import { dispatchPinyinEdit, type DocumentSuggestion } from '../editor/auto-extension';

const SUGGESTION_NOTICE_MS = 12000;

/** Shows automatic-mode suggestions as a notice with one button per option. Never edits without a click. */
export class SuggestionNotices {
	private readonly active = new Set<Notice>();
	private readonly timers = new Set<number>();

	show(view: EditorView, suggestion: DocumentSuggestion): void {
		const first = suggestion.proposals[0];
		if (!first) return;
		let notice: Notice | null = null;
		const fragment = createFragment((frag) => {
			frag.createSpan({ text: `Pinyin for ${first.chinese} “${first.original}”: ` });
			for (const proposal of suggestion.proposals) {
				const button = frag.createEl('button', { text: proposal.insert, cls: 'pinyin-companion-notice-button' });
				button.addEventListener('click', () => {
					applySuggestion(view, suggestion.lineFrom, proposal);
					if (notice) this.hide(notice);
				});
			}
		});
		notice = new Notice(fragment, SUGGESTION_NOTICE_MS);
		this.active.add(notice);
		const created = notice;
		const timer = window.setTimeout(() => {
			this.active.delete(created);
			this.timers.delete(timer);
		}, SUGGESTION_NOTICE_MS + 1000);
		this.timers.add(timer);
	}

	/** Called on plugin unload: hide open notices and clear bookkeeping timers. */
	hideAll(): void {
		for (const notice of this.active) notice.hide();
		for (const timer of this.timers) window.clearTimeout(timer);
		this.active.clear();
		this.timers.clear();
	}

	private hide(notice: Notice): void {
		notice.hide();
		this.active.delete(notice);
	}
}

function applySuggestion(view: EditorView, lineFrom: number, proposal: Proposal): void {
	const from = lineFrom + proposal.from;
	const to = lineFrom + proposal.to;
	const chineseFrom = lineFrom + proposal.chineseFrom;
	const { doc } = view.state;
	const unchanged = view.dom.isConnected
		&& to <= doc.length
		&& doc.sliceString(from, to) === proposal.original
		&& doc.sliceString(chineseFrom, chineseFrom + proposal.chinese.length) === proposal.chinese;
	if (!unchanged) {
		new Notice('The text has changed, so the suggestion was not applied. Use “Correct pinyin annotation at cursor” instead.');
		return;
	}
	dispatchPinyinEdit(view, from, to, proposal.insert);
}
