<script>
    import { browser } from "$app/environment";
    import { marked } from "marked";

    let cloudStatus = "";

    if (browser && localStorage.getItem("nootoCloudAPI")) {
        cloudStatus = "animate-pulse";
    }

    let showNotification = false;
    let notificationTimeout;

    function showSavedNotification() {
        showNotification = true;
        clearTimeout(notificationTimeout);
        notificationTimeout = setTimeout(() => {
            showNotification = false;
        }, 1500);
    }

    // Notes here!
    let notes = {
        "Welcome to Nooto": {
            "Introduction": [
                { title: "Nooto", content: "is a minimal note-taking app" },
                { title: "Usage", content: "Click on a notebook to expand it, then click on a group to see its notes. You can select notes for viewing or editing.\n\nTo edit a note, click on the note content.\n\nYou can create new groups and notes in the directory view." },
                { title: "Buttons", content: "The bottom bar buttons usages:\n- <span style='color:#2563eb'>Add Notebook</span>\n- <span style='color:#6366f1'>Fetch/Edit Data</span>\n- <span style='color:#51ed8a'>Save Data Locally (+ Cloud, if enabled)</span>\n- <span style='color:#8aed51'>Enable Cloud Save</span>\n- <span style='color:#999999'>Dark Mode</span>\n- <span style='color:#eab308'>Multiple Notes Mode</span>\n\nCloud icon will do a pulse animation while it's enabled.\n\nNotes will be saved locally automatically, click save button for cloud save explicitly." },
                { title: "Get Started", content: "> You were born ready!\n\nClick on <span style='color:#2563eb;font-size:24px;'>+</span> to create your first notebook. Then, click on the other <span style='color:#2563eb;font-size:24px;'>+</span> button next to newly created notebook in the <ins>directory view</ins>. Lastly, clicking <span style='color:#eab308;font-size:24px;'>+</span> button next to the newly created group will create <span style='color:#22c55e'>your first note</span>! Click on the content to edit it. \n\n Well done! You've created your first note." }
            ],
            "Examples": [
                { title: "Markdown", content: "Nooto supports Markdown syntax. You can use it to format your notes.\n\nFor example:\n\n# Heading 1\n## Heading 2\n- List item 1\n- List item 2\n\n**Bold text**\n*Italic text*\n\n[Link](https://example.com)\n\n![Image](https://upload.wikimedia.org/wikipedia/en/e/ed/Nyan_cat_250px_frame.PNG)" },
                { title: "Code Blocks", content: "You can also include code blocks:\n```javascript\nconsole.log('Hello, Nooto!');\n```\nThis is useful for sharing code snippets." },
                { title: "Lists", content: "You can create lists:\n- Item 1\n- Item 2\n- Item 3\n\nOr numbered lists:\n1. First item\n2. Second item\n3. Third item\n\nOr Todo lists:\n- [x] First TODO\n- [ ] Second TODO\n- [ ] Third TODO\n " },
            ]
        }
    };

    // Selected notes
    // This will hold the notes that are selected for viewing
    let selectedNotes = [];

    let multipleNotes = false; // Flag to indicate if multiple notes are selected

    if (browser) {
        selectedNotes = [
            //{ title: "Nooto ノート", content: "is a minimal note-taking app" },
        ];
    }

    if(browser && localStorage.getItem("dark") === "true") {
        document.documentElement.classList.add("dark");
        multipleNotes = localStorage.getItem("multipleNotes") === "true";
    }

    if (browser && localStorage.getItem("notes")) {
        try {
            notes = JSON.parse(localStorage.getItem("notes"));
            console.log("Notes and selectedNotes loaded from localStorage.");
        } catch (e) {
            console.error("Failed to parse notes from localStorage:", e);
        }
    }

    async function saveNotes() {
        if (browser) {
            try {
                localStorage.setItem("notes", JSON.stringify(notes));
                console.log("Notes and selectedNotes saved successfully.");
                showSavedNotification();
            } catch (e) {
                console.error("Failed to save notes or selectedNotes:", e);
            }
        }
    }

    // State management
    // Open state for notebooks and groups
    let openNotebooks = {};
    let openGroups = {};

    // Initialize openNotebooks and openGroups
    for (const notebook of Object.keys(notes)) {
        openNotebooks[notebook] = false; // All notebooks are initially closed
        for (const group of Object.keys(notes[notebook])) {
            openGroups[`${notebook}:${group}`] = false; // All groups are initially open
        }
    }

    // Functions to handle toggling notebooks, groups, and selecting notes
    function toggleNotebook(name) {
        openNotebooks[name] = !openNotebooks[name];
        openNotebooks = { [name]: openNotebooks[name] };
    }

    
    function toggleGroup(notebook, group) {
        const key = `${notebook}:${group}`;
        openGroups[key] = !openGroups[key];
        openGroups = { ...openGroups };
    }

    function selectNote(note) {
        // Prevent duplicates
        if (!selectedNotes.includes(note)) {
            selectedNotes = multipleNotes ? [...selectedNotes, note] : [note];
        }
    }

    function removeNote(note) {
        selectedNotes = selectedNotes.filter(n => n !== note);
    }

    // Rename logic
    let renamingNotebook = null;
    let renamingGroup = null;
    let renamingValue = "";

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
        if (renamingNotebook && !renamingGroup) {
            // Rename notebook without changing order
            if (renamingValue && renamingValue !== renamingNotebook && !notes[renamingValue]) {
                const newNotes = {};
                const newOpenNotebooks = {};
                for (const key of Object.keys(notes)) {
                    if (key === renamingNotebook) {
                        newNotes[renamingValue] = notes[renamingNotebook];
                        newOpenNotebooks[renamingValue] = openNotebooks[renamingNotebook];
                    } else {
                        newNotes[key] = notes[key];
                        newOpenNotebooks[key] = openNotebooks[key];
                    }
                }
                notes = newNotes;
                openNotebooks = newOpenNotebooks;

                // Update openGroups keys
                const newOpenGroups = {};
                for (const [k, v] of Object.entries(openGroups)) {
                    if (k.startsWith(`${renamingNotebook}:`)) {
                        const group = k.split(':')[1];
                        newOpenGroups[`${renamingValue}:${group}`] = v;
                    } else {
                        newOpenGroups[k] = v;
                    }
                }
                openGroups = newOpenGroups;
            }
        } else if (renamingNotebook && renamingGroup) {
            // Rename group without changing order
            if (
                renamingValue &&
                renamingValue !== renamingGroup &&
                !notes[renamingNotebook][renamingValue]
            ) {
                const groups = notes[renamingNotebook];
                const newGroups = {};
                const newOpenGroups = {};
                for (const key of Object.keys(groups)) {
                    if (key === renamingGroup) {
                        newGroups[renamingValue] = groups[renamingGroup];
                        newOpenGroups[`${renamingNotebook}:${renamingValue}`] = openGroups[`${renamingNotebook}:${renamingGroup}`];
                    } else {
                        newGroups[key] = groups[key];
                        newOpenGroups[`${renamingNotebook}:${key}`] = openGroups[`${renamingNotebook}:${key}`];
                    }
                }
                notes[renamingNotebook] = newGroups;
                openGroups = { ...openGroups, ...newOpenGroups };
            }
        }
        renamingNotebook = null;
        renamingGroup = null;
        renamingValue = "";
    }

    function cancelRename() {
        renamingNotebook = null;
        renamingGroup = null;
        renamingValue = "";
    }

    // Edit note logic
    let editingNote = null;
    let editingNoteTitle = "";
    let editingNoteContent = "";

    function startEditNote(note) {
        editingNote = note;
        editingNoteTitle = note.title;
        editingNoteContent = note.content;
    }

    function confirmEditNote() {
        if (editingNote) {
            editingNote.title = editingNoteTitle;
            editingNote.content = editingNoteContent;
        }
        editingNote = null;
        editingNoteTitle = "";
        editingNoteContent = "";
    }

    function cancelEditNote() {
        editingNote = null;
        editingNoteTitle = "";
        editingNoteContent = "";
    }
</script>

<div class="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 dark:text-gray-200 p-8">
    {#if selectedNotes.length > 0}
    <div class="m-4 space-y-4 w-full max-w-sm min-h-full">
        {#each selectedNotes as note (note)}
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 overflow-auto">
            <div class="flex justify-between items-center mb-2">
                {#if editingNote === note}
                    <h2 class="text-md font-bold text-gray-300">Editing the title...</h2>
                {:else}
                    <h2 class="text-xl font-bold flex flex-col">
                        {note.title}
                        <span class="text-gray-500 text-xs items-center">
                            {#each Object.entries(notes) as [nb, groups]}
                                {#each Object.entries(groups) as [grp, arr]}
                                    {#if arr.includes(note)}
                                        {grp + ", " + nb}
                                    {/if}
                                {/each}
                            {/each}
                        </span>
                    </h2>
                {/if}
                <div class="flex justify-between items-center space-x-2">
                    <button class="material-icons text-gray-400 hover:text-gray-600" on:click={() => removeNote(note)}>close</button>
                </div>
            </div>
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div contenteditable="true" class="prose max-w-none text-gray-700 dark:text-gray-300" on:focusin={e => e.target.innerHTML = note.content.replaceAll('\n', '<br>')} on:focusout={async e => {
                note.content = e.target.innerHTML.replaceAll('<br>', '\n').replaceAll('&gt;', '>').replaceAll('&lt;', '<');
                e.target.innerHTML = marked.parse(note.content);
                await saveNotes();
                console.log("Note content updated:", note.content);
            }}>
                {@html marked.parse(note.content)}
            </div>
        </div>
        {/each}
    </div>
    {/if}
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow w-full max-w-sm p-6 overflow-auto">
        <ul class="space-y-2">
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            {#if Object.keys(notes).length < 1}
                <li class="text-gray-500 text-sm text-center">No notebooks available.<br><br>Click "Add Notebook" to create one.</li>
            {/if}
            {#each Object.entries(notes) as [notebook, groups]}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                <li class="flex items-center space-x-2 cursor-pointer select-none group" on:click={() => toggleNotebook(notebook)}>
                    <span class="material-icons text-blue-500">
                        {openNotebooks[notebook] ? 'expand_more' : 'chevron_right'}
                    </span>
                    <span class="material-icons text-blue-500">folder</span>
                    {#if renamingNotebook === notebook && !renamingGroup}
                        <!-- svelte-ignore a11y_autofocus -->
                        <input
                            class="border rounded px-1 py-0.5 text-sm"
                            bind:value={renamingValue}
                            on:click|stopPropagation
                            on:keydown={(e) => { if (e.key === 'Enter') confirmRename(); else if (e.key === 'Escape') cancelRename(); }}
                            autofocus
                        />
                        <button class="material-icons text-green-500" on:click|stopPropagation={confirmRename}>check</button>
                        <button class="material-icons text-red-500" on:click|stopPropagation={cancelRename}>close</button>
                    {:else}
                        <span class="font-semibold">{notebook}</span>
                        <div class="flex space-x-1 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                        {#if Object.keys(notes).indexOf(notebook) > 0}
                            <button
                                class="material-icons text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                                on:click|stopPropagation={() => {
                                    // Move notebook (folder) up
                                    const notebookNames = Object.keys(notes);
                                    const idx = notebookNames.indexOf(notebook);
                                    if (idx > 0) {
                                        const newNotes = {};
                                        for (let i = 0; i < notebookNames.length; i++) {
                                            if (i === idx - 1) {
                                                newNotes[notebookNames[idx]] = notes[notebookNames[idx]];
                                            } else if (i === idx) {
                                                newNotes[notebookNames[idx - 1]] = notes[notebookNames[idx - 1]];
                                            } else {
                                                newNotes[notebookNames[i]] = notes[notebookNames[i]];
                                            }
                                        }
                                        notes = newNotes;
                                    }
                                }}
                                title="Move Up"
                            >keyboard_arrow_up</button>
                        {/if}
                        {#if Object.keys(notes).indexOf(notebook) < Object.keys(notes).length - 1}
                            <button
                                class="material-icons text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                                on:click|stopPropagation={() => {
                                    // Move notebook (folder) down
                                    const notebookNames = Object.keys(notes);
                                    const idx = notebookNames.indexOf(notebook);
                                    if (idx < notebookNames.length - 1) {
                                        const newNotes = {};
                                        for (let i = 0; i < notebookNames.length; i++) {
                                            if (i === idx) {
                                                newNotes[notebookNames[idx + 1]] = notes[notebookNames[idx + 1]];
                                            } else if (i === idx + 1) {
                                                newNotes[notebookNames[idx]] = notes[notebookNames[idx]];
                                            } else {
                                                newNotes[notebookNames[i]] = notes[notebookNames[i]];
                                            }
                                        }
                                        notes = newNotes;
                                    }
                                }}
                                title="Move Down"
                            >keyboard_arrow_down</button>
                        {/if}
                            <button class="material-icons text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                                on:click|stopPropagation={() => {
                                    let baseName = "New Group";
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
                                    openGroups = {
                                        ...openGroups,
                                        [`${notebook}:${name}`]: true
                                    };
                                }}
                                title="Add Group"
                            >add</button>
                            <button class="material-icons text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                                on:click|stopPropagation={() => startRenameNotebook(notebook)}
                                title="Rename Notebook"
                            >edit</button>
                            <button class="material-icons text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                                on:click|stopPropagation={() => {
                                    if (confirm(`Are you sure you want to delete the notebook "${notebook}"?`)) {
                                        // Remove notebook
                                        const { [notebook]: _, ...rest } = notes;
                                        notes = rest;

                                        // Remove open state for notebook
                                        const { [notebook]: __, ...restOpen } = openNotebooks;
                                        openNotebooks = restOpen;

                                        // Remove open state for groups in this notebook
                                        const newOpenGroups = {};
                                        for (const key in openGroups) {
                                            if (!key.startsWith(`${notebook}:`)) {
                                                newOpenGroups[key] = openGroups[key];
                                            }
                                        }
                                        openGroups = newOpenGroups;

                                        // Remove any selected notes from this notebook
                                        selectedNotes = selectedNotes.filter(note => {
                                            for (const group of Object.values(notes)) {
                                                for (const groupNotes of Object.values(group)) {
                                                    if (groupNotes.includes(note)) return true;
                                                }
                                            }
                                            return false;
                                        });
                                    }
                                }}
                                title="Remove Notebook"
                            >delete</button>
                        </div>
                    {/if}
                </li>
                {#if openNotebooks[notebook]}
                    <ul class="ml-6 space-y-2">
                        {#each Object.entries(groups) as [group, notesArr]}
                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                            <li class="flex items-center space-x-2 cursor-pointer select-none group" on:click={() => toggleGroup(notebook, group)}>
                                <span class="material-icons text-yellow-500">
                                    {openGroups[`${notebook}:${group}`] ? 'expand_more' : 'chevron_right'}
                                </span>
                                <span class="material-icons text-yellow-500">folder</span>
                                {#if renamingNotebook === notebook && renamingGroup === group}
                                    <!-- svelte-ignore a11y_autofocus -->
                                    <input
                                        class="border rounded px-1 py-0.5 text-sm"
                                        bind:value={renamingValue}
                                        on:click|stopPropagation
                                        on:keydown={(e) => { if (e.key === 'Enter') confirmRename(); else if (e.key === 'Escape') cancelRename(); }}
                                        autofocus
                                    />
                                    <button class="material-icons text-green-500" on:click|stopPropagation={confirmRename}>check</button>
                                    <button class="material-icons text-red-500" on:click|stopPropagation={cancelRename}>close</button>
                                {:else}
                                <span>{group}</span>
                                <div class="flex space-x-1 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                                    {#if Object.keys(notes[notebook]).indexOf(group) > 0}
                                        <button
                                            class="material-icons text-gray-400 hover:text-yellow-600 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                                            on:click|stopPropagation={() => {
                                                // Move group up
                                                const groupNames = Object.keys(notes[notebook]);
                                                const idx = groupNames.indexOf(group);
                                                if (idx > 0) {
                                                    const newGroups = {};
                                                    for (let i = 0; i < groupNames.length; i++) {
                                                        if (i === idx - 1) {
                                                            newGroups[groupNames[idx]] = notes[notebook][groupNames[idx]];
                                                        } else if (i === idx) {
                                                            newGroups[groupNames[idx - 1]] = notes[notebook][groupNames[idx - 1]];
                                                        } else {
                                                            newGroups[groupNames[i]] = notes[notebook][groupNames[i]];
                                                        }
                                                    }
                                                    notes = {
                                                        ...notes,
                                                        [notebook]: newGroups
                                                    };
                                                }
                                            }}
                                            title="Move Up"
                                        >keyboard_arrow_up</button>
                                    {/if}
                                    {#if Object.keys(notes[notebook]).indexOf(group) < Object.keys(notes[notebook]).length - 1}
                                        <button
                                            class="material-icons text-gray-400 hover:text-yellow-600 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                                            on:click|stopPropagation={() => {
                                                // Move group down
                                                const groupNames = Object.keys(notes[notebook]);
                                                const idx = groupNames.indexOf(group);
                                                if (idx < groupNames.length - 1) {
                                                    const newGroups = {};
                                                    for (let i = 0; i < groupNames.length; i++) {
                                                        if (i === idx) {
                                                            newGroups[groupNames[idx + 1]] = notes[notebook][groupNames[idx + 1]];
                                                        } else if (i === idx + 1) {
                                                            newGroups[groupNames[idx]] = notes[notebook][groupNames[idx]];
                                                        } else {
                                                            newGroups[groupNames[i]] = notes[notebook][groupNames[i]];
                                                        }
                                                    }
                                                    notes = {
                                                        ...notes,
                                                        [notebook]: newGroups
                                                    };
                                                }
                                            }}
                                            title="Move Down"
                                        >keyboard_arrow_down</button>
                                    {/if}
                                    <button class="material-icons text-gray-400 hover:text-yellow-600 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                                        on:click|stopPropagation={() => {
                                            let baseName = "New Note";
                                            let name = baseName;
                                            let i = 1;
                                            while (notes[notebook][group].some(n => n.title === name)) {
                                                name = `${baseName} ${i++}`;
                                            }
                                            notes = {
                                                ...notes,
                                                [notebook]: {
                                                    ...notes[notebook],
                                                    [group]: [
                                                        ...notes[notebook][group],
                                                        { title: name, content: "Type your note here..." }
                                                    ]
                                                }
                                            };
                                        }}
                                        title="Add Note"
                                    >add</button>
                                    <button class="material-icons text-gray-400 hover:text-yellow-600 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                                        on:click|stopPropagation={() => startRenameGroup(notebook, group)}
                                        title="Rename Group"
                                    >edit</button>
                                    <button
                                        class="material-icons text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                                        on:click|stopPropagation={() => {
                                            if (confirm(`Are you sure you want to delete the group "${group}"?`)) {
                                                // Remove group from notebook
                                                const { [group]: _, ...restGroups } = notes[notebook];
                                                notes = {
                                                    ...notes,
                                                    [notebook]: restGroups
                                                };

                                                // Remove open state for this group
                                                const { [`${notebook}:${group}`]: __, ...restOpenGroups } = openGroups;
                                                openGroups = restOpenGroups;

                                                // Remove any selected notes from this group
                                                selectedNotes = selectedNotes.filter(note => !notesArr.includes(note));
                                            }
                                        }}
                                        title="Remove Group"
                                    >delete</button>
                                </div>
                                {/if}
                            </li>
                            {#if openGroups[`${notebook}:${group}`]}
                                <ul class="ml-6 space-y-2">
                                    {#each notesArr as note}
                                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                                        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                                        <li class="flex items-center space-x-2 cursor-pointer group" on:click|stopPropagation={() => selectNote(note)}>
                                            <span class="material-icons text-green-500">insert_drive_file</span>
                                            {#if editingNote === note}
                                                <!-- svelte-ignore a11y_autofocus -->
                                                <input
                                                    class="border rounded px-1 py-0.5 text-sm"
                                                    bind:value={editingNoteTitle}
                                                    on:click|stopPropagation
                                                    on:keydown={(e) => { if (e.key === 'Enter') confirmEditNote(); else if (e.key === 'Escape') cancelEditNote(); }}
                                                    autofocus
                                                />
                                                <button class="material-icons text-green-500" on:click|stopPropagation={confirmEditNote}>check</button>
                                                <button class="material-icons text-red-500" on:click|stopPropagation={cancelEditNote}>close</button>
                                            {:else}
                                                <span>{note.title}</span>
                                                <div class="flex space-x-1 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {#if notes[notebook][group].indexOf(note) > 0}
                                                        <button
                                                            class="material-icons text-gray-400 hover:text-green-600 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                                                            on:click|stopPropagation={() => {
                                                                // Move note up
                                                                const idx = notes[notebook][group].indexOf(note);
                                                                if (idx > 0) {
                                                                    const arr = [...notes[notebook][group]];
                                                                    [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                                                                    notes = {
                                                                        ...notes,
                                                                        [notebook]: {
                                                                            ...notes[notebook],
                                                                            [group]: arr
                                                                        }
                                                                    };
                                                                }
                                                            }}
                                                            title="Move Up"
                                                        >keyboard_arrow_up</button>
                                                    {/if}
                                                    {#if notes[notebook][group].indexOf(note) < notes[notebook][group].length - 1}
                                                        <button
                                                            class="material-icons text-gray-400 hover:text-green-600 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                                                            on:click|stopPropagation={() => {
                                                                // Move note down
                                                                const arr = [...notes[notebook][group]];
                                                                const idx = arr.indexOf(note);
                                                                if (idx < arr.length - 1) {
                                                                    [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
                                                                    notes = {
                                                                        ...notes,
                                                                        [notebook]: {
                                                                            ...notes[notebook],
                                                                            [group]: arr
                                                                        }
                                                                    };
                                                                }
                                                            }}
                                                            title="Move Down"
                                                        >keyboard_arrow_down</button>
                                                    {/if}
                                                    <button class="material-icons text-gray-400 hover:text-green-600 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                                                        on:click|stopPropagation={() => startEditNote(note)}
                                                        title="Edit Note"
                                                    >edit</button>
                                                    <button
                                                        class="material-icons text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                                                        on:click|stopPropagation={() => {
                                                            if (confirm(`Are you sure you want to delete the note "${note.title}"?`)) {
                                                                // Remove note from group
                                                                notes = {
                                                                    ...notes,
                                                                    [notebook]: {
                                                                        ...notes[notebook],
                                                                        [group]: notes[notebook][group].filter(n => n !== note)
                                                                    }
                                                                };
                                                                // Remove from selectedNotes if present
                                                                selectedNotes = selectedNotes.filter(n => n !== note);
                                                            }
                                                        }}
                                                        title="Remove Note"
                                                    >delete</button>
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
    <div class="flex flex-row justify-evenly bg-white dark:bg-gray-800 rounded-lg shadow w-full max-w-sm p-2 m-4 pl-3 pr-3 overflow-auto">
        <div class="flex justify-start m-1">
            <button
                class="flex space-x-1 justify-start items-center px-1 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-xs pl-2 pr-2"
                on:click={() => {
                    let baseName = "New Notebook";
                    let name = baseName;
                    let i = 1;
                    while (notes[name]) {
                        name = `${baseName} ${i++}`;
                    }
                    notes = { ...notes, [name]: {} };
                    openNotebooks = { ...openNotebooks, [name]: true };
                }}
            >
                <span class="material-icons text-sm">add</span>
            </button>
        </div>
        <div class="flex justify-start m-1">
            <button
                class="flex space-x-1 justify-start items-center px-1 py-1 bg-indigo-500 text-white rounded hover:bg-indigo-600 transition-colors text-xs pl-2 pr-2"
                on:click={async () => {
                    let cloudNotes = "";
                    if (localStorage.getItem("nootoCloudAPI")) {
                        const api = localStorage.getItem("nootoCloudAPI");
                        try {
                            const url = api.split('?');
                            const response = await fetch(url[0] + 'pull' + `?${url[1]}`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                }
                            });
                            if (response.ok) {
                                cloudNotes = JSON.stringify(await response.json());
                                alert("Notes imported from cloud successfully!");
                            } else {
                                alert("Failed to fetch notes from cloud.");
                            }
                        } catch (e) {
                            alert("Error fetching notes from cloud.");
                            console.error(e);
                        }
                    }

                    const currentJSON = JSON.stringify(notes);
                    const input = localStorage.getItem("nootoCloudAPI") ? prompt("Do you want to update your local notes with the cloud-fetched notes below?\nYou can edit as you like.", cloudNotes) : prompt("Paste or edit your notes JSON below:", currentJSON);
                    if (input !== null) {
                        try {
                            notes = JSON.parse(input);
                            localStorage.setItem("notes", input);
                            alert("Notes imported successfully!");
                        } catch (e) {
                            alert("Invalid JSON data.");
                        }
                    }
                }}
            >
                <span class="material-icons text-xs">upload</span>
            </button>
        </div>    
        <div class="flex justify-start m-1">
            <button
                class="flex space-x-1 justify-start items-center px-1 py-1 bg-emerald-500 text-white rounded hover:bg-emerald-600 transition-colors text-xs pl-2 pr-2"
                on:click={async () => {
                    saveNotes()

                    try {
                        const api = localStorage.getItem("nootoCloudAPI");
                        if (api) {
                            const url = api.split('?');
                            const saveCloud = await fetch(url[0] + 'push' + `?${url[1]}`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify(notes)
                            });
                            if (saveCloud.ok) {
                                alert("Notes saved to cloud successfully!");
                            }
                        }
                    } catch (e_) {
                        alert("Failed to save to cloud.");
                    }
                }}
            >
                <span class="material-icons text-xs">save</span>
            </button>
        </div>   
        <div class="flex justify-start m-1">
            <button
            class="flex space-x-1 justify-start items-center px-1 py-1 bg-lime-500 text-white rounded hover:bg-lime-600 transition-colors text-xs pl-2 pr-2"
            on:click={() => {
                localStorage.setItem("nootoCloudAPI", prompt("Enter Nooto Cloud API URL:\n(Leave empty and press OK to disable cloud if its enabled.)", localStorage.getItem("nootoCloudAPI") ?? "https://example.nooto.cloud.api/?key=nooto") ?? (localStorage.getItem("nootoCloudAPI") ?? ""));
                if (localStorage.getItem("nootoCloudAPI") === "") {
                    localStorage.removeItem("nootoCloudAPI");
                    cloudStatus = "";
                } else cloudStatus = "animate-pulse";
            }}
            >
            <span key={cloudStatus} class="material-icons text-xs {cloudStatus}">cloud</span>
            </button>
        </div>
        <div class="flex justify-start m-1">
            <button
                class="flex space-x-1 justify-start items-center px-1 py-1 bg-gray-800 text-white rounded hover:bg-gray-900 dark:bg-gray-600 dark:hover:hover:bg-gray-700 transition-colors text-xs pl-2 pr-2"
                on:click={() => {
                    document.documentElement.classList.toggle('dark');
                    localStorage.setItem("dark", document.documentElement.classList.contains('dark') ? 'true' : 'false');
                }}
            >
                <span class="material-icons text-xs">dark_mode</span>
            </button>
        </div>
        <div class="flex justify-start m-1">
            <button
                class="flex space-x-1 justify-start items-center px-1 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 transition-colors text-xs pl-2 pr-2"
                on:click={() => {
                    multipleNotes = !multipleNotes;
                    if (browser) {
                        localStorage.setItem("multipleNotes", multipleNotes ? "true" : "false");
                    }
                }}
            >
                <span class="material-icons text-xs">burst_mode</span>
                <span class="text-xs">{multipleNotes ? 'Disable' : 'Enable'}</span>
            </button>
        </div>
    </div>
</div>
{#if showNotification}
    <div class="fixed top-6 left-1/2 transform -translate-x-1/2 z-50 opacity-50">
        <div class="bg-green-500 text-white px-6 py-2 rounded shadow-lg font-semibold">
            Data saved!
        </div>
    </div>
{/if}