<script>
	import { browser } from '$app/environment';
	import { tick } from 'svelte';
	import { DEFAULT_NOTES } from '$lib/state/defaults.js';
	import { renderMarkdown, toggleMarkdownTask } from '$lib/utils/markdown.js';
	import {
		ChevronRight,
		ChevronDown,
		Folder,
		FileText,
		Plus,
		Pencil,
		Trash2,
		ArrowUp,
		ArrowDown,
		Check,
		X,
		Cloud,
		CloudUpload,
		CloudDownload,
		Download,
		Copy,
		LayoutGrid,
		Moon,
		Sun,
		Layers
	} from '@lucide/svelte';

	// Core reactive state
	let notes = $state(structuredClone(DEFAULT_NOTES));
	let selectedNotes = $state([]);
	let openNotebooks = $state({});
	let openGroups = $state({});

	// UI preferences
	let expandUI = $state(true);
	let multipleNotes = $state(false);
	let isDark = $state(false);
	let cloudApiUrl = $state('');

	// Notification toast
	let showNotification = $state(false);
	let notificationText = $state('Data saved!');
	let notificationTimeout = null;

	// Tree rename state (Notebook / Group)
	let renamingNotebook = $state(null);
	let renamingGroup = $state(null);
	let renamingValue = $state('');

	// Note title & content editing state
	let editingTitleNote = $state(null);
	let editingTitleValue = $state('');
	let editingBodyNote = $state(null);
	let bodyTextareaEl = $state(null);

	// Clean modal for JSON Import/Export & Cloud URL config
	let modalMode = $state(/** @type {null | 'data'} */ (null));
	let modalJsonText = $state('');
	let modalCloudUrl = $state('');
	let modalTitle = $state('Data & Cloud Sync');

	// Drag and drop state
	let dragItem = $state(
		/** @type {
			| { type: 'notebook', notebook: string }
			| { type: 'group', notebook: string, group: string }
			| { type: 'note', notebook: string, group: string, note: { title: string, content: string } }
			| null
		} */ (null)
	);
	let dropTarget = $state(
		/** @type {
			| { type: 'notebook', notebook: string, position: 'before' | 'after' | 'into' }
			| { type: 'group', notebook: string, group: string, position: 'before' | 'after' | 'into' }
			| { type: 'note', notebook: string, group: string, note: { title: string, content: string }, position: 'before' | 'after' }
			| null
		} */ (null)
	);
	let dragExpandTimer = null;

	function notify(msg = 'Data saved!') {
		notificationText = msg;
		showNotification = true;
		clearTimeout(notificationTimeout);
		notificationTimeout = setTimeout(() => {
			showNotification = false;
		}, 1500);
	}

	// Initialize from localStorage on client
	if (browser) {
		if (localStorage.getItem('expandUI') === 'false') {
			expandUI = false;
		}
		if (localStorage.getItem('multipleNotes') === 'true') {
			multipleNotes = true;
		}
		if (localStorage.getItem('dark') === 'true') {
			isDark = true;
			document.documentElement.classList.add('dark');
		}
		cloudApiUrl = localStorage.getItem('nootoCloudAPI') || '';

		const savedNotes = localStorage.getItem('notes');
		if (savedNotes) {
			try {
				const parsed = JSON.parse(savedNotes);
				if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
					notes = parsed;
				}
			} catch (e) {
				console.error('Failed to parse notes from localStorage:', e);
			}
		}

		const initNotebooks = {};
		const initGroups = {};
		for (const [nb, grpMap] of Object.entries(notes)) {
			initNotebooks[nb] = false;
			for (const grp of Object.keys(grpMap || {})) {
				initGroups[`${nb}:${grp}`] = false;
			}
		}
		openNotebooks = initNotebooks;
		openGroups = initGroups;
	}

	function saveNotes(showToast = true) {
		if (!browser) return;
		try {
			localStorage.setItem('notes', JSON.stringify(notes));
			if (showToast) notify('Data saved!');
		} catch (e) {
			console.error('Failed to save notes:', e);
		}
	}

	// =========================================================================
	// Tree Navigation & Selection
	// =========================================================================

	function toggleNotebook(name) {
		const nextState = !openNotebooks[name];
		openNotebooks = { [name]: nextState };
	}

	function toggleGroup(notebook, group) {
		const key = `${notebook}:${group}`;
		openGroups = {
			...openGroups,
			[key]: !openGroups[key]
		};
	}

	function selectNote(note) {
		if (!selectedNotes.includes(note)) {
			selectedNotes = multipleNotes ? [...selectedNotes, note] : [note];
		} else if (multipleNotes && selectedNotes.length > 1) {
			removeNote(note);
		} else if (!multipleNotes) {
			selectedNotes = [note];
		}
	}

	function removeNote(note) {
		if (editingBodyNote === note) editingBodyNote = null;
		if (editingTitleNote === note) editingTitleNote = null;
		selectedNotes = selectedNotes.filter((n) => n !== note);
	}

	function getNoteBreadcrumb(targetNote) {
		for (const [nb, groups] of Object.entries(notes)) {
			for (const [grp, arr] of Object.entries(groups)) {
				if (arr.includes(targetNote)) {
					return `${grp}, ${nb}`;
				}
			}
		}
		return '';
	}

	// Keyboard arrow navigation between notes in the active group
	function navigateAdjacentNote(direction) {
		if (selectedNotes.length === 0) return;
		const active = selectedNotes[selectedNotes.length - 1];
		for (const [, groups] of Object.entries(notes)) {
			for (const [, arr] of Object.entries(groups)) {
				const idx = arr.indexOf(active);
				if (idx !== -1) {
					const nextIdx = idx + direction;
					if (nextIdx >= 0 && nextIdx < arr.length) {
						selectNote(arr[nextIdx]);
					}
					return;
				}
			}
		}
	}

	function handleWindowKeydown(e) {
		const target = /** @type {HTMLElement | null} */ (e.target);
		const isTyping =
			target &&
			(target.tagName === 'INPUT' ||
				target.tagName === 'TEXTAREA' ||
				target.isContentEditable);

		if (!isTyping && !modalMode && !editingBodyNote && !editingTitleNote) {
			if (e.key === 'ArrowRight') {
				e.preventDefault();
				navigateAdjacentNote(1);
			} else if (e.key === 'ArrowLeft') {
				e.preventDefault();
				navigateAdjacentNote(-1);
			}
		}
	}

	// =========================================================================
	// Rename Notebook & Group
	// =========================================================================

	function startRenameNotebook(notebook) {
		renamingNotebook = notebook;
		renamingGroup = null;
		renamingValue = notebook;
	}

	function startRenameGroup(notebook, group) {
		renamingNotebook = notebook;
		renamingGroup = group;
		renamingValue = group;
	}

	function confirmRename() {
		const trimmed = renamingValue.trim();
		if (renamingNotebook && !renamingGroup) {
			if (trimmed && trimmed !== renamingNotebook && !notes[trimmed]) {
				const newNotes = {};
				const newOpenNotebooks = {};
				for (const key of Object.keys(notes)) {
					if (key === renamingNotebook) {
						newNotes[trimmed] = notes[renamingNotebook];
						newOpenNotebooks[trimmed] = openNotebooks[renamingNotebook];
					} else {
						newNotes[key] = notes[key];
						newOpenNotebooks[key] = openNotebooks[key];
					}
				}
				notes = newNotes;
				openNotebooks = newOpenNotebooks;

				const newOpenGroups = {};
				for (const [k, v] of Object.entries(openGroups)) {
					if (k.startsWith(`${renamingNotebook}:`)) {
						const grp = k.slice(renamingNotebook.length + 1);
						newOpenGroups[`${trimmed}:${grp}`] = v;
					} else {
						newOpenGroups[k] = v;
					}
				}
				openGroups = newOpenGroups;
				saveNotes();
			}
		} else if (renamingNotebook && renamingGroup) {
			if (trimmed && trimmed !== renamingGroup && !notes[renamingNotebook][trimmed]) {
				const groups = notes[renamingNotebook];
				const newGroups = {};
				const newOpenGroups = { ...openGroups };
				for (const key of Object.keys(groups)) {
					if (key === renamingGroup) {
						newGroups[trimmed] = groups[renamingGroup];
						newOpenGroups[`${renamingNotebook}:${trimmed}`] =
							openGroups[`${renamingNotebook}:${renamingGroup}`];
						delete newOpenGroups[`${renamingNotebook}:${renamingGroup}`];
					} else {
						newGroups[key] = groups[key];
					}
				}
				notes[renamingNotebook] = newGroups;
				openGroups = newOpenGroups;
				saveNotes();
			}
		}
		cancelRename();
	}

	function cancelRename() {
		renamingNotebook = null;
		renamingGroup = null;
		renamingValue = '';
	}

	// =========================================================================
	// Edit Note Title & Content
	// =========================================================================

	function startEditNoteTitle(note) {
		editingTitleNote = note;
		editingTitleValue = note.title;
	}

	function confirmEditNoteTitle() {
		if (editingTitleNote) {
			const trimmed = editingTitleValue.trim() || 'Untitled Note';
			editingTitleNote.title = trimmed;
			saveNotes();
		}
		editingTitleNote = null;
		editingTitleValue = '';
	}

	function cancelEditNoteTitle() {
		editingTitleNote = null;
		editingTitleValue = '';
	}

	async function startEditNoteBody(note) {
		editingBodyNote = note;
		await tick();
		if (bodyTextareaEl) {
			autoResizeTextarea(bodyTextareaEl);
			bodyTextareaEl.focus();
		}
	}

	function finishEditNoteBody() {
		if (editingBodyNote) {
			saveNotes();
			editingBodyNote = null;
		}
	}

	function autoResizeTextarea(el) {
		if (!el) return;
		el.style.height = 'auto';
		el.style.height = `${Math.max(120, el.scrollHeight)}px`;
	}

	function handleRenderedBodyClick(e, note) {
		const target = /** @type {HTMLElement} */ (e.target);

		// Allow interactive checkbox toggling directly in view mode
		if (target.tagName === 'INPUT' && target.classList.contains('nooto-task-checkbox')) {
			e.stopPropagation();
			const idx = Number(target.getAttribute('data-task-index'));
			if (!Number.isNaN(idx)) {
				note.content = toggleMarkdownTask(note.content, idx);
				saveNotes();
			}
			return;
		}

		// Allow clicking links without entering edit mode
		if (target.closest('a')) {
			e.stopPropagation();
			return;
		}

		// Don't enter edit mode if user is selecting text
		const selection = window.getSelection();
		if (selection && selection.toString().length > 0) {
			return;
		}

		startEditNoteBody(note);
	}

	// =========================================================================
	// Creation Helpers & Cloud / JSON Operations
	// =========================================================================

	function addNotebook() {
		let baseName = 'New Notebook';
		let name = baseName;
		let i = 1;
		while (notes[name]) {
			name = `${baseName} ${i++}`;
		}
		notes = { ...notes, [name]: {} };
		openNotebooks = { ...openNotebooks, [name]: true };
		saveNotes();
		startRenameNotebook(name);
	}

	function addGroupToNotebook(notebook) {
		let baseName = 'New Group';
		let name = baseName;
		let i = 1;
		while (notes[notebook][name]) {
			name = `${baseName} ${i++}`;
		}
		notes = {
			...notes,
			[notebook]: {
				...notes[notebook],
				[name]: []
			}
		};
		openNotebooks = { ...openNotebooks, [notebook]: true };
		openGroups = {
			...openGroups,
			[`${notebook}:${name}`]: true
		};
		saveNotes();
		startRenameGroup(notebook, name);
	}

	function addNoteToGroup(notebook, group) {
		let baseName = 'New Note';
		let name = baseName;
		let i = 1;
		while (notes[notebook][group].some((n) => n.title === name)) {
			name = `${baseName} ${i++}`;
		}
		const newNote = { title: name, content: 'Type your note here...' };
		notes = {
			...notes,
			[notebook]: {
				...notes[notebook],
				[group]: [...notes[notebook][group], newNote]
			}
		};
		openNotebooks = { ...openNotebooks, [notebook]: true };
		openGroups = {
			...openGroups,
			[`${notebook}:${group}`]: true
		};
		const createdRef = notes[notebook][group][notes[notebook][group].length - 1];
		selectNote(createdRef);
		saveNotes();
	}

	function openDataModal(title = 'Data & Cloud Sync', customJson = null) {
		modalTitle = title;
		modalJsonText = customJson !== null ? customJson : JSON.stringify(notes, null, 2);
		modalCloudUrl = cloudApiUrl;
		modalMode = 'data';
	}

	async function handleCloudPull() {
		if (!cloudApiUrl) {
			openDataModal();
			return;
		}
		try {
			const [base, query] = cloudApiUrl.split('?');
			const normalizedBase = base.endsWith('/') ? base : `${base}/`;
			const endpoint = query ? `${normalizedBase}pull?${query}` : `${normalizedBase}pull`;
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});
			if (response.ok) {
				const data = await response.json();
				openDataModal('Cloud Notes Fetched — Review & Apply', JSON.stringify(data, null, 2));
				notify('Fetched from cloud!');
			} else {
				notify('Failed to fetch from cloud');
			}
		} catch (e) {
			console.error(e);
			notify('Error fetching from cloud');
		}
	}

	async function handleCloudPush() {
		saveNotes(true);
		if (cloudApiUrl) {
			try {
				const [base, query] = cloudApiUrl.split('?');
				const normalizedBase = base.endsWith('/') ? base : `${base}/`;
				const endpoint = query ? `${normalizedBase}push?${query}` : `${normalizedBase}push`;
				const res = await fetch(endpoint, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(notes)
				});
				if (res.ok) {
					notify('Saved locally & pushed to Cloud!');
				} else {
					notify('Cloud push failed');
				}
			} catch (e) {
				console.error(e);
				notify('Cloud push failed');
			}
		}
	}

	function saveCloudUrlOnly() {
		const trimmed = modalCloudUrl.trim();
		cloudApiUrl = trimmed;
		if (browser) {
			if (trimmed) {
				localStorage.setItem('nootoCloudAPI', trimmed);
				notify('Cloud sync enabled!');
			} else {
				localStorage.removeItem('nootoCloudAPI');
				notify('Cloud sync disabled');
			}
		}
	}

	function confirmModal() {
		// Save Cloud URL if changed
		const trimmedUrl = modalCloudUrl.trim();
		if (trimmedUrl !== cloudApiUrl) {
			cloudApiUrl = trimmedUrl;
			if (browser) {
				if (trimmedUrl) localStorage.setItem('nootoCloudAPI', trimmedUrl);
				else localStorage.removeItem('nootoCloudAPI');
			}
		}

		// Apply JSON changes
		try {
			const parsed = JSON.parse(modalJsonText);
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				notes = parsed;
				selectedNotes = [];
				saveNotes(false);
				notify('Saved!');
				modalMode = null;
			}
		} catch (e) {
			notify('Invalid JSON data');
		}
	}

	async function copyJsonToClipboard() {
		try {
			await navigator.clipboard.writeText(modalJsonText);
			notify('Copied JSON!');
		} catch (_) {
			notify('Could not copy');
		}
	}

	function downloadBackupJson() {
		if (!browser) return;
		const blob = new Blob([modalJsonText], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `nooto-backup-${new Date().toISOString().slice(0, 10)}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
		notify('Backup downloaded!');
	}

	// =========================================================================
	// Drag & Drop Reordering & Cross-Context Moves
	// =========================================================================

	function resetDragState() {
		dragItem = null;
		dropTarget = null;
		if (dragExpandTimer) {
			clearTimeout(dragExpandTimer);
			dragExpandTimer = null;
		}
	}

	/**
	 * @param {DragEvent} e
	 * @returns {'before' | 'after'}
	 */
	function getDropPosition(e) {
		const el = /** @type {HTMLElement} */ (e.currentTarget);
		const rect = el.getBoundingClientRect();
		return e.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
	}

	/**
	 * @param {() => void} expandFn
	 */
	function scheduleDragExpand(expandFn) {
		if (dragExpandTimer) return;
		dragExpandTimer = setTimeout(() => {
			expandFn();
			dragExpandTimer = null;
		}, 450);
	}

	function clearDragExpand() {
		if (dragExpandTimer) {
			clearTimeout(dragExpandTimer);
			dragExpandTimer = null;
		}
	}

	/**
	 * @param {string} targetNotebook
	 * @param {string} desiredName
	 */
	function getUniqueGroupName(targetNotebook, desiredName) {
		if (!notes[targetNotebook]?.[desiredName]) return desiredName;
		let i = 1;
		while (notes[targetNotebook][`${desiredName} (${i})`]) {
			i++;
		}
		return `${desiredName} (${i})`;
	}

	/**
	 * @param {string} sourceNotebook
	 * @param {string} sourceGroup
	 * @param {string} targetNotebook
	 * @param {string | null} targetGroup
	 * @param {'before' | 'after' | 'into'} position
	 */
	function moveGroupTo(sourceNotebook, sourceGroup, targetNotebook, targetGroup, position) {
		if (sourceNotebook === targetNotebook && sourceGroup === targetGroup && position !== 'into') {
			return;
		}

		const sourceNotesArr = notes[sourceNotebook]?.[sourceGroup];
		if (!sourceNotesArr) return;

		const wasOpen = Boolean(openGroups[`${sourceNotebook}:${sourceGroup}`]);

		if (sourceNotebook === targetNotebook) {
			const keys = Object.keys(notes[sourceNotebook]).filter((k) => k !== sourceGroup);
			let insertIdx = keys.length;
			if (targetGroup && position !== 'into') {
				const targetIdx = keys.indexOf(targetGroup);
				if (targetIdx !== -1) {
					insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
				}
			}
			keys.splice(insertIdx, 0, sourceGroup);

			const reordered = {};
			for (const k of keys) {
				reordered[k] = notes[sourceNotebook][k];
			}
			notes = { ...notes, [sourceNotebook]: reordered };
		} else {
			const newGroupName = getUniqueGroupName(targetNotebook, sourceGroup);

			// Remove from source notebook
			const { [sourceGroup]: _, ...restSourceGroups } = notes[sourceNotebook];

			// Insert into target notebook
			const targetKeys = Object.keys(notes[targetNotebook] || {});
			let insertIdx = targetKeys.length;
			if (targetGroup && position !== 'into') {
				const targetIdx = targetKeys.indexOf(targetGroup);
				if (targetIdx !== -1) {
					insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
				}
			}
			targetKeys.splice(insertIdx, 0, newGroupName);

			const updatedTargetGroups = {};
			for (const k of targetKeys) {
				updatedTargetGroups[k] =
					k === newGroupName ? sourceNotesArr : notes[targetNotebook][k];
			}

			notes = {
				...notes,
				[sourceNotebook]: restSourceGroups,
				[targetNotebook]: updatedTargetGroups
			};

			const nextOpenGroups = { ...openGroups };
			delete nextOpenGroups[`${sourceNotebook}:${sourceGroup}`];
			nextOpenGroups[`${targetNotebook}:${newGroupName}`] = wasOpen;
			openGroups = nextOpenGroups;
		}

		openNotebooks = { ...openNotebooks, [targetNotebook]: true };
		saveNotes();
	}

	/**
	 * @param {string} sourceNotebook
	 * @param {string} sourceGroup
	 * @param {{ title: string, content: string }} sourceNote
	 * @param {string} targetNotebook
	 * @param {string} targetGroup
	 * @param {{ title: string, content: string } | null} targetNote
	 * @param {'before' | 'after' | 'into'} position
	 */
	function moveNoteTo(
		sourceNotebook,
		sourceGroup,
		sourceNote,
		targetNotebook,
		targetGroup,
		targetNote,
		position
	) {
		if (sourceNote === targetNote) return;

		const sourceArr = notes[sourceNotebook]?.[sourceGroup];
		const targetArr = notes[targetNotebook]?.[targetGroup];
		if (!sourceArr || !targetArr) return;

		if (sourceNotebook === targetNotebook && sourceGroup === targetGroup) {
			const filtered = sourceArr.filter((n) => n !== sourceNote);
			let insertIdx = filtered.length;
			if (targetNote && position !== 'into') {
				const targetIdx = filtered.indexOf(targetNote);
				if (targetIdx !== -1) {
					insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
				}
			}
			filtered.splice(insertIdx, 0, sourceNote);
			notes = {
				...notes,
				[sourceNotebook]: {
					...notes[sourceNotebook],
					[sourceGroup]: filtered
				}
			};
		} else {
			const updatedSource = sourceArr.filter((n) => n !== sourceNote);
			const updatedTarget = [...targetArr];
			let insertIdx = updatedTarget.length;
			if (targetNote && position !== 'into') {
				const targetIdx = updatedTarget.indexOf(targetNote);
				if (targetIdx !== -1) {
					insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
				}
			}
			updatedTarget.splice(insertIdx, 0, sourceNote);

			if (sourceNotebook === targetNotebook) {
				notes = {
					...notes,
					[sourceNotebook]: {
						...notes[sourceNotebook],
						[sourceGroup]: updatedSource,
						[targetGroup]: updatedTarget
					}
				};
			} else {
				notes = {
					...notes,
					[sourceNotebook]: {
						...notes[sourceNotebook],
						[sourceGroup]: updatedSource
					},
					[targetNotebook]: {
						...notes[targetNotebook],
						[targetGroup]: updatedTarget
					}
				};
			}
		}

		openNotebooks = { ...openNotebooks, [targetNotebook]: true };
		openGroups = { ...openGroups, [`${targetNotebook}:${targetGroup}`]: true };
		saveNotes();
	}

	function handleNotebookDragStart(e, notebook) {
		if (renamingNotebook === notebook && !renamingGroup) return;
		e.stopPropagation();
		dragItem = { type: 'notebook', notebook };
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', notebook);
		}
	}

	function handleNotebookDragOver(e, notebook) {
		if (!dragItem) return;
		if (dragItem.type === 'notebook') {
			if (dragItem.notebook === notebook) return;
			e.preventDefault();
			e.stopPropagation();
			dropTarget = { type: 'notebook', notebook, position: getDropPosition(e) };
		} else if (dragItem.type === 'group') {
			e.preventDefault();
			e.stopPropagation();
			dropTarget = { type: 'notebook', notebook, position: 'into' };
			if (!openNotebooks[notebook]) {
				scheduleDragExpand(() => {
					openNotebooks = { ...openNotebooks, [notebook]: true };
				});
			}
		} else if (dragItem.type === 'note' && !openNotebooks[notebook]) {
			e.preventDefault();
			e.stopPropagation();
			scheduleDragExpand(() => {
				openNotebooks = { ...openNotebooks, [notebook]: true };
			});
		}
	}

	function handleNotebookDrop(e, targetNotebook) {
		e.preventDefault();
		e.stopPropagation();
		if (!dragItem) return;

		if (dragItem.type === 'notebook' && dragItem.notebook !== targetNotebook) {
			const pos = dropTarget?.type === 'notebook' ? dropTarget.position : getDropPosition(e);
			const keys = Object.keys(notes).filter((k) => k !== dragItem.notebook);
			const targetIdx = keys.indexOf(targetNotebook);
			if (targetIdx !== -1) {
				const insertIdx = pos === 'before' ? targetIdx : targetIdx + 1;
				keys.splice(insertIdx, 0, dragItem.notebook);
				const reordered = {};
				for (const k of keys) {
					reordered[k] = notes[k];
				}
				notes = reordered;
				saveNotes();
			}
		} else if (dragItem.type === 'group') {
			moveGroupTo(dragItem.notebook, dragItem.group, targetNotebook, null, 'into');
		}

		resetDragState();
	}

	function handleGroupDragStart(e, notebook, group) {
		if (renamingNotebook === notebook && renamingGroup === group) return;
		e.stopPropagation();
		dragItem = { type: 'group', notebook, group };
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', group);
		}
	}

	function handleGroupDragOver(e, notebook, group) {
		if (!dragItem) return;
		if (dragItem.type === 'group') {
			if (dragItem.notebook === notebook && dragItem.group === group) return;
			e.preventDefault();
			e.stopPropagation();
			dropTarget = { type: 'group', notebook, group, position: getDropPosition(e) };
		} else if (dragItem.type === 'note') {
			e.preventDefault();
			e.stopPropagation();
			dropTarget = { type: 'group', notebook, group, position: 'into' };
			const key = `${notebook}:${group}`;
			if (!openGroups[key]) {
				scheduleDragExpand(() => {
					openGroups = { ...openGroups, [key]: true };
				});
			}
		}
	}

	function handleGroupDrop(e, targetNotebook, targetGroup) {
		e.preventDefault();
		e.stopPropagation();
		if (!dragItem) return;

		if (dragItem.type === 'group') {
			const pos = dropTarget?.type === 'group' ? dropTarget.position : getDropPosition(e);
			if (pos === 'before' || pos === 'after') {
				moveGroupTo(dragItem.notebook, dragItem.group, targetNotebook, targetGroup, pos);
			}
		} else if (dragItem.type === 'note') {
			moveNoteTo(
				dragItem.notebook,
				dragItem.group,
				dragItem.note,
				targetNotebook,
				targetGroup,
				null,
				'into'
			);
		}

		resetDragState();
	}

	function handleNoteDragStart(e, notebook, group, note) {
		if (editingTitleNote === note) return;
		e.stopPropagation();
		dragItem = { type: 'note', notebook, group, note };
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', note.title);
		}
	}

	function handleNoteDragOver(e, notebook, group, note) {
		if (!dragItem || dragItem.type !== 'note') return;
		if (dragItem.note === note) return;
		e.preventDefault();
		e.stopPropagation();
		dropTarget = { type: 'note', notebook, group, note, position: getDropPosition(e) };
	}

	function handleNoteDrop(e, targetNotebook, targetGroup, targetNote) {
		e.preventDefault();
		e.stopPropagation();
		if (!dragItem || dragItem.type !== 'note') return;

		const pos = dropTarget?.type === 'note' ? dropTarget.position : getDropPosition(e);
		if (pos === 'before' || pos === 'after') {
			moveNoteTo(
				dragItem.notebook,
				dragItem.group,
				dragItem.note,
				targetNotebook,
				targetGroup,
				targetNote,
				pos
			);
		}

		resetDragState();
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div
	class="flex {expandUI
		? 'max-[868px]:flex-col flex-row-reverse'
		: 'flex-col'} items-center justify-center min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-6 gap-6"
>
	<!-- Floating Note Card(s) -->
	{#if selectedNotes.length > 0}
		<div
			class="space-y-4 w-full {expandUI
				? 'max-[868px]:max-w-sm max-w-2xl'
				: 'max-w-sm'}"
		>
			{#each selectedNotes as note (note)}
				<div
					class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xs p-6 transition-all"
				>
					<!-- Note Header -->
					<div class="flex justify-between items-start gap-3 mb-3">
						<div class="flex-1 min-w-0">
							{#if editingTitleNote === note}
								<div class="flex items-center gap-1.5">
									<!-- svelte-ignore a11y_autofocus -->
									<input
										class="flex-1 min-w-0 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md px-2 py-1 text-base font-bold focus:outline-none focus:border-zinc-500"
										bind:value={editingTitleValue}
										onkeydown={(e) => {
											if (e.key === 'Enter') confirmEditNoteTitle();
											else if (e.key === 'Escape') cancelEditNoteTitle();
										}}
										autofocus
									/>
									<button
										type="button"
										onclick={confirmEditNoteTitle}
										class="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-emerald-600 cursor-pointer"
										title="Save Title"
									>
										<Check class="w-4 h-4" />
									</button>
									<button
										type="button"
										onclick={cancelEditNoteTitle}
										class="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-red-500 cursor-pointer"
										title="Cancel"
									>
										<X class="w-4 h-4" />
									</button>
								</div>
							{:else}
								<!-- Click title directly to rename, or use tree edit button -->
								<h2 class="text-xl font-bold leading-snug flex flex-col">
									<button
										type="button"
										onclick={() => startEditNoteTitle(note)}
										class="text-left hover:opacity-80 cursor-pointer truncate"
										title="Click to rename title"
									>
										{note.title}
									</button>
									<span class="text-zinc-400 dark:text-zinc-500 text-xs font-normal mt-0.5">
										{getNoteBreadcrumb(note)}
									</span>
								</h2>
							{/if}
						</div>

						<!-- Top-Right Card Actions -->
						<div class="flex items-center gap-1 shrink-0">
							<button
								type="button"
								onclick={() => {
									if (editingBodyNote === note) {
										finishEditNoteBody();
									} else {
										startEditNoteBody(note);
									}
								}}
								class="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
								title={editingBodyNote === note ? 'Done editing' : 'Edit note content'}
							>
								{#if editingBodyNote === note}
									<Check class="w-4 h-4 text-emerald-500" />
								{:else}
									<Pencil class="w-4 h-4" />
								{/if}
							</button>
							<button
								type="button"
								onclick={() => removeNote(note)}
								class="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
								title="Close note"
							>
								<X class="w-4 h-4" />
							</button>
						</div>
					</div>

					<!-- Note Content (Click to Edit) -->
					{#if editingBodyNote === note}
						<div class="space-y-2">
							<textarea
								bind:this={bodyTextareaEl}
								bind:value={note.content}
								oninput={(e) => {
									autoResizeTextarea(e.currentTarget);
									saveNotes();
								}}
								onkeydown={(e) => {
									if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
										e.preventDefault();
										finishEditNoteBody();
									} else if (e.key === 'Escape') {
										e.preventDefault();
										finishEditNoteBody();
									}
								}}
								placeholder="Write your note in Markdown..."
								class="w-full min-h-[140px] p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 focus:border-zinc-500 dark:focus:border-zinc-500 focus:outline-none text-sm font-mono leading-relaxed text-zinc-800 dark:text-zinc-200 resize-y"
							></textarea>
							<div class="flex items-center justify-between text-[11px] text-zinc-400">
								<span>Auto-saved · Markdown supported</span>
								<button
									type="button"
									onclick={finishEditNoteBody}
									class="px-2.5 py-1 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium text-xs hover:opacity-90 cursor-pointer"
								>
									Done
								</button>
							</div>
						</div>
					{:else}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							onclick={(e) => handleRenderedBodyClick(e, note)}
							class="prose max-w-none text-zinc-700 dark:text-zinc-300 min-h-[36px] rounded-lg p-1 -m-1 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 cursor-text transition-colors"
							title="Click to edit content"
						>
							{#if note.content && note.content.trim().length > 0}
								{@html renderMarkdown(note.content)}
							{:else}
								<p class="text-zinc-400 italic text-sm">Click here to edit note content...</p>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Floating Directory Widget + Bottom Button Bar -->
	<div
		id="nooto-menu"
		class="{expandUI ? 'sticky max-[868px]:static' : ''} top-10 bottom-10 flex flex-col items-center justify-center w-full max-w-sm shrink-0"
	>
		<!-- Directory Card -->
		<div
			class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xs w-full p-5 overflow-auto"
		>
			<ul class="space-y-1.5">
				{#if Object.keys(notes).length < 1}
					<li class="text-zinc-400 text-sm text-center py-4">
						No notebooks available.<br /><br />Click <b>+</b> below to create one.
					</li>
				{/if}

				{#each Object.entries(notes) as [notebook, groups], nbIdx (notebook)}
					<!-- Notebook Row -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
					<li
						draggable={!(renamingNotebook === notebook && !renamingGroup)}
						ondragstart={(e) => handleNotebookDragStart(e, notebook)}
						ondragover={(e) => handleNotebookDragOver(e, notebook)}
						ondragleave={() => {
							clearDragExpand();
							if (dropTarget?.type === 'notebook' && dropTarget.notebook === notebook) {
								dropTarget = null;
							}
						}}
						ondrop={(e) => handleNotebookDrop(e, notebook)}
						ondragend={resetDragState}
						class="flex items-center gap-2 py-1 px-1.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/60 cursor-pointer select-none group transition-colors {dragItem?.type === 'notebook' && dragItem.notebook === notebook
							? 'opacity-40'
							: ''} {dropTarget?.type === 'notebook' && dropTarget.notebook === notebook
							? dropTarget.position === 'before'
								? 'shadow-[inset_0_2px_0_0_#3b82f6]'
								: dropTarget.position === 'after'
									? 'shadow-[inset_0_-2px_0_0_#3b82f6]'
									: 'ring-1 ring-blue-500 bg-blue-50/60 dark:bg-blue-950/30'
							: ''}"
						onclick={() => toggleNotebook(notebook)}
					>
						<span class="text-blue-500 shrink-0">
							{#if openNotebooks[notebook]}
								<ChevronDown class="w-4 h-4" />
							{:else}
								<ChevronRight class="w-4 h-4" />
							{/if}
						</span>
						<Folder class="w-4 h-4 text-blue-500 fill-blue-500/15 shrink-0" />

						{#if renamingNotebook === notebook && !renamingGroup}
							<!-- svelte-ignore a11y_autofocus -->
							<input
								class="flex-1 min-w-0 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-1.5 py-0.5 text-sm focus:outline-none"
								bind:value={renamingValue}
								onclick={(e) => e.stopPropagation()}
								onkeydown={(e) => {
									e.stopPropagation();
									if (e.key === 'Enter') confirmRename();
									else if (e.key === 'Escape') cancelRename();
								}}
								autofocus
							/>
							<button
								type="button"
								class="p-0.5 text-emerald-500 hover:text-emerald-600 cursor-pointer"
								onclick={(e) => {
									e.stopPropagation();
									confirmRename();
								}}
								title="Confirm"
							>
								<Check class="w-4 h-4" />
							</button>
							<button
								type="button"
								class="p-0.5 text-red-500 hover:text-red-600 cursor-pointer"
								onclick={(e) => {
									e.stopPropagation();
									cancelRename();
								}}
								title="Cancel"
							>
								<X class="w-4 h-4" />
							</button>
						{:else}
							<span class="font-semibold text-sm truncate flex-1">{notebook}</span>
							<div
								class="flex items-center gap-0.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
							>
								{#if nbIdx > 0}
									<button
										type="button"
										class="p-1 text-zinc-400 hover:text-blue-500 cursor-pointer"
										onclick={(e) => {
											e.stopPropagation();
											const names = Object.keys(notes);
											const idx = names.indexOf(notebook);
											if (idx > 0) {
												const newNotes = {};
												for (let i = 0; i < names.length; i++) {
													if (i === idx - 1) newNotes[names[idx]] = notes[names[idx]];
													else if (i === idx) newNotes[names[idx - 1]] = notes[names[idx - 1]];
													else newNotes[names[i]] = notes[names[i]];
												}
												notes = newNotes;
												saveNotes();
											}
										}}
										title="Move Up"
									>
										<ArrowUp class="w-3.5 h-3.5" />
									</button>
								{/if}
								{#if nbIdx < Object.keys(notes).length - 1}
									<button
										type="button"
										class="p-1 text-zinc-400 hover:text-blue-500 cursor-pointer"
										onclick={(e) => {
											e.stopPropagation();
											const names = Object.keys(notes);
											const idx = names.indexOf(notebook);
											if (idx < names.length - 1) {
												const newNotes = {};
												for (let i = 0; i < names.length; i++) {
													if (i === idx) newNotes[names[idx + 1]] = notes[names[idx + 1]];
													else if (i === idx + 1) newNotes[names[idx]] = notes[names[idx]];
													else newNotes[names[i]] = notes[names[i]];
												}
												notes = newNotes;
												saveNotes();
											}
										}}
										title="Move Down"
									>
										<ArrowDown class="w-3.5 h-3.5" />
									</button>
								{/if}
								<button
									type="button"
									class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium text-zinc-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer"
									onclick={(e) => {
										e.stopPropagation();
										addGroupToNotebook(notebook);
									}}
									title="Add Group"
								>
									<Plus class="w-3 h-3" />
									<span>Group</span>
								</button>
								<button
									type="button"
									class="p-1 text-zinc-400 hover:text-blue-500 cursor-pointer"
									onclick={(e) => {
										e.stopPropagation();
										startRenameNotebook(notebook);
									}}
									title="Rename Notebook"
								>
									<Pencil class="w-3.5 h-3.5" />
								</button>
								<button
									type="button"
									class="p-1 text-zinc-400 hover:text-red-500 cursor-pointer"
									onclick={(e) => {
										e.stopPropagation();
										if (confirm(`Are you sure you want to delete the notebook "${notebook}"?`)) {
											const { [notebook]: _, ...rest } = notes;
											notes = rest;

											const { [notebook]: __, ...restOpen } = openNotebooks;
											openNotebooks = restOpen;

											const newOpenGroups = {};
											for (const key in openGroups) {
												if (!key.startsWith(`${notebook}:`)) {
													newOpenGroups[key] = openGroups[key];
												}
											}
											openGroups = newOpenGroups;

											selectedNotes = selectedNotes.filter((n) => {
												for (const grpObj of Object.values(notes)) {
													for (const grpNotes of Object.values(grpObj)) {
														if (grpNotes.includes(n)) return true;
													}
												}
												return false;
											});
											saveNotes();
										}
									}}
									title="Remove Notebook"
								>
									<Trash2 class="w-3.5 h-3.5" />
								</button>
							</div>
						{/if}
					</li>

					<!-- Groups inside Notebook -->
					{#if openNotebooks[notebook]}
						<ul class="ml-5 pl-2 border-l border-zinc-200 dark:border-zinc-800 space-y-1">
							{#if Object.keys(groups).length === 0}
								<li>
									<button
										type="button"
										onclick={() => addGroupToNotebook(notebook)}
										class="flex items-center gap-1.5 py-1 px-2 rounded-md text-xs text-zinc-400 hover:text-blue-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors"
									>
										<Plus class="w-3.5 h-3.5" />
										<span>Add first group…</span>
									</button>
								</li>
							{/if}
							{#each Object.entries(groups) as [group, notesArr], grpIdx (group)}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
								<li
									draggable={!(renamingNotebook === notebook && renamingGroup === group)}
									ondragstart={(e) => handleGroupDragStart(e, notebook, group)}
									ondragover={(e) => handleGroupDragOver(e, notebook, group)}
									ondragleave={() => {
										clearDragExpand();
										if (
											dropTarget?.type === 'group' &&
											dropTarget.notebook === notebook &&
											dropTarget.group === group
										) {
											dropTarget = null;
										}
									}}
									ondrop={(e) => handleGroupDrop(e, notebook, group)}
									ondragend={resetDragState}
									class="flex items-center gap-2 py-1 px-1.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/60 cursor-pointer select-none group transition-colors {dragItem?.type === 'group' && dragItem.notebook === notebook && dragItem.group === group
										? 'opacity-40'
										: ''} {dropTarget?.type === 'group' && dropTarget.notebook === notebook && dropTarget.group === group
										? dropTarget.position === 'before'
											? 'shadow-[inset_0_2px_0_0_#f59e0b]'
											: dropTarget.position === 'after'
												? 'shadow-[inset_0_-2px_0_0_#f59e0b]'
												: 'ring-1 ring-amber-500 bg-amber-50/60 dark:bg-amber-950/30'
										: ''}"
									onclick={() => toggleGroup(notebook, group)}
								>
									<span class="text-amber-500 shrink-0">
										{#if openGroups[`${notebook}:${group}`]}
											<ChevronDown class="w-4 h-4" />
										{:else}
											<ChevronRight class="w-4 h-4" />
										{/if}
									</span>
									<Folder class="w-4 h-4 text-amber-500 fill-amber-500/15 shrink-0" />

									{#if renamingNotebook === notebook && renamingGroup === group}
										<!-- svelte-ignore a11y_autofocus -->
										<input
											class="flex-1 min-w-0 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-1.5 py-0.5 text-sm focus:outline-none"
											bind:value={renamingValue}
											onclick={(e) => e.stopPropagation()}
											onkeydown={(e) => {
												e.stopPropagation();
												if (e.key === 'Enter') confirmRename();
												else if (e.key === 'Escape') cancelRename();
											}}
											autofocus
										/>
										<button
											type="button"
											class="p-0.5 text-emerald-500 hover:text-emerald-600 cursor-pointer"
											onclick={(e) => {
												e.stopPropagation();
												confirmRename();
											}}
											title="Confirm"
										>
											<Check class="w-4 h-4" />
										</button>
										<button
											type="button"
											class="p-0.5 text-red-500 hover:text-red-600 cursor-pointer"
											onclick={(e) => {
												e.stopPropagation();
												cancelRename();
											}}
											title="Cancel"
										>
											<X class="w-4 h-4" />
										</button>
									{:else}
										<span class="text-sm truncate flex-1">{group}</span>
										<div
											class="flex items-center gap-0.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
										>
											{#if grpIdx > 0}
												<button
													type="button"
													class="p-1 text-zinc-400 hover:text-amber-500 cursor-pointer"
													onclick={(e) => {
														e.stopPropagation();
														const groupNames = Object.keys(notes[notebook]);
														const idx = groupNames.indexOf(group);
														if (idx > 0) {
															const newGroups = {};
															for (let i = 0; i < groupNames.length; i++) {
																if (i === idx - 1)
																	newGroups[groupNames[idx]] = notes[notebook][groupNames[idx]];
																else if (i === idx)
																	newGroups[groupNames[idx - 1]] =
																		notes[notebook][groupNames[idx - 1]];
																else newGroups[groupNames[i]] = notes[notebook][groupNames[i]];
															}
															notes = { ...notes, [notebook]: newGroups };
															saveNotes();
														}
													}}
													title="Move Up"
												>
													<ArrowUp class="w-3.5 h-3.5" />
												</button>
											{/if}
											{#if grpIdx < Object.keys(notes[notebook]).length - 1}
												<button
													type="button"
													class="p-1 text-zinc-400 hover:text-amber-500 cursor-pointer"
													onclick={(e) => {
														e.stopPropagation();
														const groupNames = Object.keys(notes[notebook]);
														const idx = groupNames.indexOf(group);
														if (idx < groupNames.length - 1) {
															const newGroups = {};
															for (let i = 0; i < groupNames.length; i++) {
																if (i === idx)
																	newGroups[groupNames[idx + 1]] =
																		notes[notebook][groupNames[idx + 1]];
																else if (i === idx + 1)
																	newGroups[groupNames[idx]] = notes[notebook][groupNames[idx]];
																else newGroups[groupNames[i]] = notes[notebook][groupNames[i]];
															}
															notes = { ...notes, [notebook]: newGroups };
															saveNotes();
														}
													}}
													title="Move Down"
												>
													<ArrowDown class="w-3.5 h-3.5" />
												</button>
											{/if}
											<button
												type="button"
												class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium text-zinc-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 cursor-pointer"
												onclick={(e) => {
													e.stopPropagation();
													addNoteToGroup(notebook, group);
												}}
												title="Add Note"
											>
												<Plus class="w-3 h-3" />
												<span>Note</span>
											</button>
											<button
												type="button"
												class="p-1 text-zinc-400 hover:text-amber-500 cursor-pointer"
												onclick={(e) => {
													e.stopPropagation();
													startRenameGroup(notebook, group);
												}}
												title="Rename Group"
											>
												<Pencil class="w-3.5 h-3.5" />
											</button>
											<button
												type="button"
												class="p-1 text-zinc-400 hover:text-red-500 cursor-pointer"
												onclick={(e) => {
													e.stopPropagation();
													if (confirm(`Are you sure you want to delete the group "${group}"?`)) {
														const { [group]: _, ...restGroups } = notes[notebook];
														notes = {
															...notes,
															[notebook]: restGroups
														};
														const { [`${notebook}:${group}`]: __, ...restOpenGroups } = openGroups;
														openGroups = restOpenGroups;
														selectedNotes = selectedNotes.filter((n) => !notesArr.includes(n));
														saveNotes();
													}
												}}
												title="Remove Group"
											>
												<Trash2 class="w-3.5 h-3.5" />
											</button>
										</div>
									{/if}
								</li>

								<!-- Notes inside Group -->
								{#if openGroups[`${notebook}:${group}`]}
									<ul class="ml-5 pl-2 border-l border-zinc-200 dark:border-zinc-800 space-y-1">
										{#if notesArr.length === 0}
											<li>
												<button
													type="button"
													onclick={() => addNoteToGroup(notebook, group)}
													class="flex items-center gap-1.5 py-1 px-2 rounded-md text-xs text-zinc-400 hover:text-amber-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors"
												>
													<Plus class="w-3.5 h-3.5" />
													<span>Add first note…</span>
												</button>
											</li>
										{/if}
										{#each notesArr as note, noteIdx (note)}
											<!-- svelte-ignore a11y_click_events_have_key_events -->
											<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
											<li
												draggable={editingTitleNote !== note}
												ondragstart={(e) => handleNoteDragStart(e, notebook, group, note)}
												ondragover={(e) => handleNoteDragOver(e, notebook, group, note)}
												ondragleave={() => {
													if (dropTarget?.type === 'note' && dropTarget.note === note) {
														dropTarget = null;
													}
												}}
												ondrop={(e) => handleNoteDrop(e, notebook, group, note)}
												ondragend={resetDragState}
												class="flex items-center gap-2 py-1 px-1.5 rounded-lg cursor-pointer group transition-colors {selectedNotes.includes(
													note
												)
													? 'bg-zinc-100 dark:bg-zinc-800 font-medium'
													: 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'} {dragItem?.type === 'note' && dragItem.note === note
													? 'opacity-40'
													: ''} {dropTarget?.type === 'note' && dropTarget.note === note
													? dropTarget.position === 'before'
														? 'shadow-[inset_0_2px_0_0_#10b981]'
														: 'shadow-[inset_0_-2px_0_0_#10b981]'
													: ''}"
												onclick={(e) => {
													e.stopPropagation();
													selectNote(note);
												}}
											>
												<FileText class="w-4 h-4 text-emerald-500 shrink-0" />

												{#if editingTitleNote === note}
													<!-- svelte-ignore a11y_autofocus -->
													<input
														class="flex-1 min-w-0 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-1.5 py-0.5 text-sm focus:outline-none"
														bind:value={editingTitleValue}
														onclick={(e) => e.stopPropagation()}
														onkeydown={(e) => {
															e.stopPropagation();
															if (e.key === 'Enter') confirmEditNoteTitle();
															else if (e.key === 'Escape') cancelEditNoteTitle();
														}}
														autofocus
													/>
													<button
														type="button"
														class="p-0.5 text-emerald-500 hover:text-emerald-600 cursor-pointer"
														onclick={(e) => {
															e.stopPropagation();
															confirmEditNoteTitle();
														}}
														title="Confirm"
													>
														<Check class="w-4 h-4" />
													</button>
													<button
														type="button"
														class="p-0.5 text-red-500 hover:text-red-600 cursor-pointer"
														onclick={(e) => {
															e.stopPropagation();
															cancelEditNoteTitle();
														}}
														title="Cancel"
													>
														<X class="w-4 h-4" />
													</button>
												{:else}
													<span class="text-sm truncate flex-1">{note.title}</span>
													<div
														class="flex items-center gap-0.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
													>
														{#if noteIdx > 0}
															<button
																type="button"
																class="p-1 text-zinc-400 hover:text-emerald-500 cursor-pointer"
																onclick={(e) => {
																	e.stopPropagation();
																	const arr = [...notes[notebook][group]];
																	[arr[noteIdx - 1], arr[noteIdx]] = [
																		arr[noteIdx],
																		arr[noteIdx - 1]
																	];
																	notes = {
																		...notes,
																		[notebook]: {
																			...notes[notebook],
																			[group]: arr
																		}
																	};
																	saveNotes();
																}}
																title="Move Up"
															>
																<ArrowUp class="w-3.5 h-3.5" />
															</button>
														{/if}
														{#if noteIdx < notesArr.length - 1}
															<button
																type="button"
																class="p-1 text-zinc-400 hover:text-emerald-500 cursor-pointer"
																onclick={(e) => {
																	e.stopPropagation();
																	const arr = [...notes[notebook][group]];
																	[arr[noteIdx], arr[noteIdx + 1]] = [
																		arr[noteIdx + 1],
																		arr[noteIdx]
																	];
																	notes = {
																		...notes,
																		[notebook]: {
																			...notes[notebook],
																			[group]: arr
																		}
																	};
																	saveNotes();
																}}
																title="Move Down"
															>
																<ArrowDown class="w-3.5 h-3.5" />
															</button>
														{/if}
														<button
															type="button"
															class="p-1 text-zinc-400 hover:text-emerald-500 cursor-pointer"
															onclick={(e) => {
																e.stopPropagation();
																startEditNoteTitle(note);
															}}
															title="Rename Note"
														>
															<Pencil class="w-3.5 h-3.5" />
														</button>
														<button
															type="button"
															class="p-1 text-zinc-400 hover:text-red-500 cursor-pointer"
															onclick={(e) => {
																e.stopPropagation();
																if (
																	confirm(`Are you sure you want to delete the note "${note.title}"?`)
																) {
																	notes = {
																		...notes,
																		[notebook]: {
																			...notes[notebook],
																			[group]: notes[notebook][group].filter((n) => n !== note)
																		}
																	};
																	removeNote(note);
																	saveNotes();
																}
															}}
															title="Remove Note"
														>
															<Trash2 class="w-3.5 h-3.5" />
														</button>
													</div>
												{/if}
											</li>
										{/each}
									</ul>
								{/if}
							{/each}
						</ul>
					{/if}
				{/each}
			</ul>
		</div>

		<!-- Self-Explanatory Labeled Bottom Bar -->
		<div
			class="flex flex-row items-center justify-between bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xs w-full p-2 mt-3 gap-1.5"
		>
			<!-- Left: Add Notebook + Data & Cloud Sync Controls -->
			<div class="flex items-center gap-1">
				<button
					type="button"
					onclick={addNotebook}
					class="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 transition-colors cursor-pointer shrink-0"
					title="New Notebook"
				>
					<Plus class="w-4 h-4" />
				</button>

				{#if cloudApiUrl}
					<button
						type="button"
						onclick={handleCloudPush}
						class="inline-flex items-center gap-1 h-8 px-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer"
						title="Save & Push to Cloud"
					>
						<CloudUpload class="w-3.5 h-3.5 text-emerald-500" />
						<span>Push</span>
					</button>
					<button
						type="button"
						onclick={handleCloudPull}
						class="inline-flex items-center gap-1 h-8 px-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer"
						title="Pull from Cloud"
					>
						<CloudDownload class="w-3.5 h-3.5 text-blue-500" />
						<span>Pull</span>
					</button>
					<button
						type="button"
						onclick={() => openDataModal()}
						class="relative inline-flex items-center justify-center h-8 w-8 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors cursor-pointer"
						title="Cloud Settings & JSON Data"
					>
						<Cloud class="w-4 h-4" />
						<span class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
					</button>
				{:else}
					<button
						type="button"
						onclick={() => openDataModal()}
						class="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
						title="Data & Cloud Sync"
					>
						<Cloud class="w-4 h-4" />
					</button>
				{/if}
			</div>

			<!-- Right: Labeled View & Mode Toggles -->
			<div class="flex items-center gap-1">
				<!-- Split / Side-by-Side Layout Toggle -->
				<button
					type="button"
					class="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border transition-colors text-xs font-medium cursor-pointer {expandUI
						? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
						: 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'}"
					onclick={() => {
						expandUI = !expandUI;
						if (browser) {
							localStorage.setItem('expandUI', expandUI ? 'true' : 'false');
						}
					}}
					title="Side-by-Side Split Layout ({expandUI ? 'ON' : 'OFF'})"
				>
					<LayoutGrid class="w-3.5 h-3.5" />
					<span>Split</span>
				</button>

				<!-- Multiple Notes Mode Toggle -->
				<button
					type="button"
					class="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border transition-colors text-xs font-medium cursor-pointer {multipleNotes
						? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
						: 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'}"
					onclick={() => {
						multipleNotes = !multipleNotes;
						if (browser) {
							localStorage.setItem('multipleNotes', multipleNotes ? 'true' : 'false');
						}
					}}
					title="Keep Multiple Notes Open ({multipleNotes ? 'ON' : 'OFF'})"
				>
					<Layers class="w-3.5 h-3.5" />
					<span>Multi</span>
				</button>

				<!-- Dark Mode Toggle -->
				<button
					type="button"
					class="flex items-center justify-center h-8 w-8 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
					onclick={() => {
						isDark = !isDark;
						document.documentElement.classList.toggle('dark', isDark);
						if (browser) {
							localStorage.setItem('dark', isDark ? 'true' : 'false');
						}
					}}
					title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
				>
					{#if isDark}
						<Sun class="w-3.5 h-3.5" />
					{:else}
						<Moon class="w-3.5 h-3.5" />
					{/if}
				</button>
			</div>
		</div>
	</div>
</div>

<!-- Unified Data & Cloud Sync Modal -->
{#if modalMode === 'data'}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		onclick={() => (modalMode = null)}
		class="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4"
	>
		<div
			onclick={(e) => e.stopPropagation()}
			class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl w-full max-w-md p-5 space-y-4"
		>
			<div class="flex items-center justify-between">
				<h3 class="text-sm font-semibold">{modalTitle}</h3>
				<button
					type="button"
					onclick={() => (modalMode = null)}
					class="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
				>
					<X class="w-4 h-4" />
				</button>
			</div>

			<!-- Cloud API Section -->
			<div class="space-y-1.5">
				<div class="flex items-center justify-between">
					<label for="nooto-cloud-url" class="text-xs font-medium text-zinc-700 dark:text-zinc-300">
						Cloud API URL <span class="text-zinc-400 font-normal">(optional)</span>
					</label>
					{#if cloudApiUrl}
						<span class="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Connected</span>
					{/if}
				</div>
				<div class="flex gap-1.5">
					<input
						id="nooto-cloud-url"
						type="text"
						bind:value={modalCloudUrl}
						onkeydown={(e) => e.key === 'Enter' && saveCloudUrlOnly()}
						placeholder="https://example.nooto.cloud.api/?key=nooto"
						class="flex-1 px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 font-mono text-xs focus:outline-none focus:border-zinc-500"
					/>
					<button
						type="button"
						onclick={saveCloudUrlOnly}
						class="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
					>
						Set URL
					</button>
				</div>
			</div>

			<!-- JSON Backup / Editor Section -->
			<div class="space-y-1.5">
				<div class="flex items-center justify-between">
					<label for="nooto-json-data" class="text-xs font-medium text-zinc-700 dark:text-zinc-300">
						Notes JSON Data
					</label>
					<div class="flex items-center gap-1.5">
						<button
							type="button"
							onclick={copyJsonToClipboard}
							class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
						>
							<Copy class="w-3 h-3" />
							<span>Copy</span>
						</button>
						<button
							type="button"
							onclick={downloadBackupJson}
							class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
						>
							<Download class="w-3 h-3" />
							<span>Export .json</span>
						</button>
					</div>
				</div>
				<textarea
					id="nooto-json-data"
					bind:value={modalJsonText}
					rows="8"
					class="w-full p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 font-mono text-xs focus:outline-none focus:border-zinc-500"
				></textarea>
			</div>

			<div class="flex justify-end gap-2">
				<button
					type="button"
					onclick={() => (modalMode = null)}
					class="px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={confirmModal}
					class="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 cursor-pointer"
				>
					Save & Apply
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Saved Notification Pill -->
{#if showNotification}
	<div class="fixed top-6 left-1/2 -translate-x-1/2 z-50">
		<div
			class="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs px-4 py-1.5 rounded-full shadow-md font-medium"
		>
			{notificationText}
		</div>
	</div>
{/if}
