import { marked } from 'marked';

// Configure marked for GFM and line breaks
marked.setOptions({
	gfm: true,
	breaks: true
});

/**
 * Pre-processes custom Nooto Markdown extensions before passing to marked:
 * 1. Furigana shorthand: {漢字|かんじ} or {開|あ}ける -> <ruby>開<rp>(</rp><rt>あ</rt><rp>)</rp></ruby>ける
 *    (Skips code blocks and inline code)
 *
 * @param {string} raw
 * @returns {string}
 */
export function preprocessMarkdown(raw) {
	if (!raw) return '';

	// Split by code blocks / inline code so we never transform inside code
	const segments = raw.split(/(```[\s\S]*?```|`[^`\n]+`)/g);

	return segments
		.map((segment, index) => {
			// Odd indices are code blocks/spans
			if (index % 2 === 1) return segment;

			// Replace {Kanji|Reading} with <ruby>Kanji<rp>(</rp><rt>Reading</rt><rp>)</rp></ruby>
			return segment.replace(
				/\{([^}|{}\n]+)\|([^}|{}\n]+)\}/g,
				'<ruby>$1<rp>(</rp><rt>$2</rt><rp>)</rp></ruby>'
			);
		})
		.join('');
}

/**
 * Renders markdown to HTML with interactive task checkboxes and furigana support.
 *
 * @param {string} content
 * @returns {string}
 */
export function renderMarkdown(content) {
	if (!content) return '';
	const processed = preprocessMarkdown(content);
	let html = /** @type {string} */ (marked.parse(processed));

	// Enhance disabled task checkboxes emitted by marked into interactive checkboxes with index attributes
	let taskIndex = 0;
	html = html.replace(
		/<input\s+(checked=""\s+)?disabled=""\s+type="checkbox"\s*\/?>/gi,
		(match, isChecked) => {
			const idx = taskIndex++;
			const checkedAttr = isChecked ? 'checked ' : '';
			return `<input type="checkbox" class="nooto-task-checkbox" data-task-index="${idx}" ${checkedAttr}/>`;
		}
	);

	return html;
}

/**
 * Toggles the Nth markdown task item (`- [ ]` <-> `- [x]`) in raw markdown string.
 *
 * @param {string} content
 * @param {number} targetIndex
 * @returns {string}
 */
export function toggleMarkdownTask(content, targetIndex) {
	if (!content) return content;
	let currentIndex = 0;
	// Match task list items outside fenced code blocks
	const lines = content.split('\n');
	let inCodeBlock = false;

	const updatedLines = lines.map((line) => {
		if (/^\s*```/.test(line)) {
			inCodeBlock = !inCodeBlock;
			return line;
		}
		if (inCodeBlock) return line;

		const taskMatch = line.match(/^(\s*[-*+]\s+\[)([ xX])(\]\s+.*)$/);
		if (taskMatch) {
			if (currentIndex === targetIndex) {
				currentIndex++;
				const nextState = taskMatch[2] === ' ' ? 'x' : ' ';
				return `${taskMatch[1]}${nextState}${taskMatch[3]}`;
			}
			currentIndex++;
		}
		return line;
	});

	return updatedLines.join('\n');
}

/**
 * Strips plain HTML & entities for clean preview snippets and search indexing.
 *
 * @param {string} content
 * @returns {string}
 */
export function getPlainTextSnippet(content, maxLength = 120) {
	if (!content) return '';
	const cleaned = content
		.replace(/\{([^}|{}\n]+)\|([^}|{}\n]+)\}/g, '$1($2)')
		.replace(/<rt>.*?<\/rt>/gi, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/!\[([^\]]*)\]\([^)]+\)/g, '[Image: $1]')
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/[#>*_`~-]/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

	if (cleaned.length <= maxLength) return cleaned;
	return cleaned.slice(0, maxLength).trim() + '…';
}
