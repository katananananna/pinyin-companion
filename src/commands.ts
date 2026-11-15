import { type App, type Editor, type EditorPosition, Notice } from 'obsidian';
import { correctAtCursor, planSelectionInsert, type Proposal, type Separator } from './core/decide';
import type { Pronouncer } from './core/pronouncer';
import { CandidateModal } from './ui/candidate-modal';

export interface CommandContext {
	app: App;
	pronouncer: Pronouncer;
	separator: Separator;
}

function reportFailure(action: string, error: unknown): void {
	console.error(`Pinyin Companion: ${action} failed`, error);
	new Notice(`Pinyin Companion could not ${action}. See the developer console for details.`);
}

/** "Insert pinyin after selected Chinese" */
export function insertPinyinAfterSelection(editor: Editor, ctx: CommandContext): void {
	try {
		if (editor.listSelections().length !== 1) {
			new Notice('Select one range of Chinese text (multiple selections are not supported).');
			return;
		}
		const from = editor.getCursor('from');
		const to = editor.getCursor('to');
		if (from.line !== to.line) {
			new Notice('Select Chinese text on a single line.');
			return;
		}
		const line = editor.getLine(from.line);
		const plan = planSelectionInsert(line, from.ch, to.ch, ctx.pronouncer, ctx.separator);
		if (!plan.ok) {
			new Notice(plan.message);
			return;
		}
		editor.replaceRange(plan.insert, { line: from.line, ch: plan.at });
		editor.setCursor({ line: from.line, ch: plan.at + plan.insert.length });
	} catch (error: unknown) {
		reportFailure('insert pinyin', error);
	}
}

/** Where the cursor should end up after replacing a span on its line. */
function cursorAfter(cursor: EditorPosition, proposal: Proposal): EditorPosition {
	const delta = proposal.insert.length - (proposal.to - proposal.from);
	if (cursor.ch >= proposal.to) return { line: cursor.line, ch: cursor.ch + delta };
	if (cursor.ch > proposal.from) return { line: cursor.line, ch: proposal.from + proposal.insert.length };
	return cursor;
}

function applyProposal(editor: Editor, cursor: EditorPosition, proposal: Proposal): void {
	editor.replaceRange(proposal.insert, { line: cursor.line, ch: proposal.from }, { line: cursor.line, ch: proposal.to });
	editor.setCursor(cursorAfter(cursor, proposal));
}

/** "Correct pinyin annotation at cursor" */
export function correctPinyinAtCursor(editor: Editor, ctx: CommandContext): void {
	try {
		if (editor.listSelections().length !== 1) {
			new Notice('Place a single cursor in the annotation (multiple cursors are not supported).');
			return;
		}
		const cursor = editor.getCursor('head');
		const line = editor.getLine(cursor.line);
		const outcome = correctAtCursor(line, cursor.ch, ctx.pronouncer, ctx.separator);
		switch (outcome.type) {
			case 'none':
			case 'unchanged':
				new Notice(outcome.message);
				return;
			case 'apply':
				applyProposal(editor, cursor, outcome.proposal);
				return;
			case 'choose':
				new CandidateModal(ctx.app, outcome.proposals, outcome.message, (proposal) => {
					if (editor.getLine(cursor.line) !== line) {
						new Notice('The line changed, so nothing was replaced.');
						return;
					}
					applyProposal(editor, cursor, proposal);
				}).open();
				return;
		}
	} catch (error: unknown) {
		reportFailure('correct the annotation', error);
	}
}
