export const DEFAULT_NOTES = {
	'Welcome to Nooto': {
		Introduction: [
			{ title: 'Nooto', content: 'is a minimal note-taking app' },
			{
				title: 'Usage',
				content:
					'Click on a notebook to expand it, then click on a group to see its notes. You can select notes for viewing or editing.\n\nTo edit a note, click directly on the note title or content.\n\nYou can reorder notebooks, groups, and notes via **drag and drop** (even across groups or notebooks!) or with the up/down arrows, and use `←` / `→` arrow keys to flip between notes.'
			},
			{
				title: 'Controls',
				content:
					'Everything is labeled for zero friction:\n- **+ New Notebook / + Group / + Note**: Create items directly inside the directory card\n- **Data & Sync** (or **Push / Pull** when Cloud is active): Edit/export JSON or sync with your Nooto Cloud API\n- **Split**: Toggle side-by-side vs stacked layout\n- **Multi**: Keep multiple note cards open at once\n- **Theme (`🌙` / `☀️`)**: Toggle Dark Mode\n\nNotes are saved locally automatically whenever you edit or organize them.'
			},
			{
				title: 'Get Started',
				content:
					'> You were born ready!\n\nClick **+ New Notebook** at the bottom of the directory card, then click **+ Group** and **+ Note** to create your first note. Click on the note content to edit it.\n\nWell done! You have created your first note.'
			}
		],
		Examples: [
			{
				title: 'Markdown',
				content:
					'Nooto supports Markdown syntax and `{漢字|かんじ}` furigana.\n\nFor example:\n\n# Heading 1\n## Heading 2\n- {開|あ}ける (Furigana shorthand)\n- List item 2\n\n**Bold text** and *Italic text*\n\n[Link](https://example.com)\n\n![Image](https://upload.wikimedia.org/wikipedia/en/e/ed/Nyan_cat_250px_frame.PNG)'
			},
			{
				title: 'Code Blocks',
				content:
					"You can also include code blocks:\n```javascript\nconsole.log('Hello, Nooto!');\n```\nThis is useful for sharing code snippets."
			},
			{
				title: 'Lists',
				content:
					'You can create lists:\n- Item 1\n- Item 2\n- Item 3\n\nOr numbered lists:\n1. First item\n2. Second item\n3. Third item\n\nOr interactive Todo lists:\n- [x] First TODO\n- [ ] Second TODO\n- [ ] Third TODO'
			}
		]
	}
};
