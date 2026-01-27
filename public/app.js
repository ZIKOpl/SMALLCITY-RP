const API_URL = window.location.origin;
let currentUser = null;
let data = { rules: {}, legal: [], illegal: [] };
let currentCat = null;
let currentRuleId = null;
let collapsedCategories = new Set();

async function init() {
    try {
        const res = await fetch(`${API_URL}/auth/user`, { credentials: "include" });
        currentUser = await res.json();
    } catch(e) {
        console.error("Erreur récupération utilisateur :", e);
    }
    renderAuth();
    await loadData();
    
    await loadFAQ();
    
    if (currentUser?.isAdmin || currentUser?.isModerator) {
        await loadUsers();
    }
    
    Object.keys(data.rules).forEach(cat => {
        collapsedCategories.add(cat);
    });
    renderSidebar();
    setupCleanPaste();
}

/* --- AUTH --- */
function renderAuth() {
    const area = document.getElementById("auth-area");
    if (!currentUser) {
        area.innerHTML = `<a href="${API_URL}/auth/discord" class="btn btn-discord"><i class="fa-brands fa-discord"></i> Connexion</a>`;
        document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.editor-control').forEach(el => el.classList.add('hidden'));
    } else {
        area.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; background:#111; padding:5px 15px; border-radius:20px; border:1px solid #222;">
                <img src="${currentUser.avatar}" style="width:30px;height:30px;border-radius:50%;">
                <span style="font-weight:600; font-size:0.9rem">${currentUser.username}</span>
                <button class="btn-icon" onclick="logout()" style="padding:4px;"><i class="fa-solid fa-power-off"></i></button>
            </div>`;
        
        if (currentUser.isAdmin || currentUser.isModerator) {
            document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
            document.querySelectorAll('.editor-only').forEach(el => el.classList.remove('hidden'));
        } else {
            document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
        }
        
        if (currentUser.isEditor) {
            document.querySelectorAll('.editor-control').forEach(el => el.classList.remove('hidden'));
        } else {
            document.querySelectorAll('.editor-only').forEach(el => el.classList.add('hidden'));
        }
    }
}

async function logout() {
    try {
        const res = await fetch(`${API_URL}/auth/logout`, { method: 'GET', credentials: "include" });
        if (res.ok) location.reload();
    } catch(e) {
        console.error(e);
        alert("Erreur de déconnexion");
    }
}

/* --- DATA LOAD --- */
let discordLinks = { legal: "", illegal: "" };

async function loadData() {
    try {
        const [rulesRes, factionsRes, discordRes] = await Promise.all([
            fetch(`${API_URL}/api/rules`).then(r => r.json()),
            fetch(`${API_URL}/api/factions`).then(r => r.json()),
            fetch(`${API_URL}/api/discord-links`).then(r => r.json())
        ]);

        data.rules = rulesRes || {};
        data.legal = factionsRes.filter(f => f.type === "legal") || [];
        data.illegal = factionsRes.filter(f => f.type === "illegal") || [];
        discordLinks = discordRes || { legal: "", illegal: "" };

        updateDiscordButtons();
        
        renderLegal();
        renderIllegal();
    } catch(e) {
        console.error("Erreur chargement données :", e);
        data.rules = {};
        data.legal = [];
        data.illegal = [];
        renderLegal();
        renderIllegal();
    }
}

function updateDiscordButtons() {
    const legalBtn = document.getElementById('legalDiscordBtn');
    const illegalBtn = document.getElementById('illegalDiscordBtn');
    
    if (legalBtn) legalBtn.href = discordLinks.legal || '#';
    if (illegalBtn) illegalBtn.href = discordLinks.illegal || '#';
}

async function editDiscordLink(type) {
    if (!currentUser?.isAdmin) return;
    
    const currentLink = discordLinks[type];
    const newLink = await customPrompt(
        `Nouveau lien Discord ${type === 'legal' ? 'Legal' : 'Illegal'} :`,
        currentLink
    );
    
    if (newLink && newLink !== currentLink) {
        discordLinks[type] = newLink;
        
        await fetch(`${API_URL}/api/discord-links`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(discordLinks)
        });
        
        updateDiscordButtons();
        toastSuccess('Lien modifié', `Le lien Discord ${type} a été mis à jour.`);
    }
}

function renderSidebar() {
    const sb = document.getElementById("rulesSidebar");
    sb.innerHTML = "";
    const cats = Object.keys(data.rules);

    cats.forEach((cat, catIndex) => {
        const isCollapsed = collapsedCategories.has(cat);
        
        const catWrapper = document.createElement("div");
        catWrapper.className = "cat-wrapper";
        
        const header = document.createElement("div");
        header.className = "cat-header";
        header.onclick = (e) => {
            if(!e.target.closest('.cat-menu-trigger')) {
                toggleCategory(cat);
            }
        };

        const chevronIcon = isCollapsed ? 'fa-chevron-right' : 'fa-chevron-down';
        
        let controls = "";
        if (currentUser?.isEditor) {
            controls = `<div class="cat-controls">
                <i class="fa-solid fa-ellipsis-vertical cat-menu-trigger" onclick="event.stopPropagation(); toggleCatMenu('${cat}', this)"></i>
            </div>`;
        }

        header.innerHTML = `
            <i class="fa-solid ${chevronIcon} cat-chevron"></i>
            <span class="cat-name">${cat}</span>
            <span class="cat-count">${data.rules[cat].length}</span>
            ${controls}
        `;
        catWrapper.appendChild(header);

        if (currentUser?.isEditor) {
            const menu = document.createElement("div");
            menu.className = "cat-dropdown hidden";
            menu.id = `catMenu-${cat}`;
            menu.innerHTML = `
                <div class="cat-dropdown-item" onclick="event.stopPropagation(); moveCat('${cat}', -1); closeCatMenus();"><i class="fa-solid fa-arrow-up"></i> Monter</div>
                <div class="cat-dropdown-item" onclick="event.stopPropagation(); moveCat('${cat}', 1); closeCatMenus();"><i class="fa-solid fa-arrow-down"></i> Descendre</div>
                <div class="cat-dropdown-divider"></div>
                <div class="cat-dropdown-item" onclick="event.stopPropagation(); addRulePrompt('${cat}'); closeCatMenus();"><i class="fa-solid fa-plus"></i> Nouvelle règle</div>
                <div class="cat-dropdown-item" onclick="event.stopPropagation(); renameCat('${cat}'); closeCatMenus();"><i class="fa-solid fa-pen"></i> Renommer</div>
                <div class="cat-dropdown-divider"></div>
                <div class="cat-dropdown-item danger" onclick="event.stopPropagation(); deleteCat('${cat}'); closeCatMenus();"><i class="fa-solid fa-trash"></i> Supprimer</div>
            `;
            catWrapper.appendChild(menu);
        }

        sb.appendChild(catWrapper);

        const rulesContainer = document.createElement("div");
        rulesContainer.className = `rules-container ${isCollapsed ? 'collapsed' : ''}`;

        data.rules[cat].forEach(rule => {
            const el = document.createElement("div");
            el.className = `rule-item ${currentRuleId === rule.id ? 'active' : ''}`;
            el.onclick = () => openRule(cat, rule.id);
            el.innerHTML = `<span class="rule-name">${rule.title}</span>`;
            rulesContainer.appendChild(el);
        });

        sb.appendChild(rulesContainer);
    });
}

function toggleCatMenu(cat, triggerElement) {
    closeCatMenus();
    const menu = document.getElementById(`catMenu-${cat}`);
    if(menu) {
        menu.classList.toggle('hidden');
        
        if(!menu.classList.contains('hidden')) {
            const rect = triggerElement.getBoundingClientRect();
            const sidebar = document.querySelector('.docs-sidebar');
            const sidebarRect = sidebar.getBoundingClientRect();
            
            menu.style.left = 'auto';
            menu.style.right = '8px';
            menu.style.top = (rect.bottom - sidebarRect.top + sidebar.scrollTop + 4) + 'px';
        }
    }
}

function closeCatMenus() {
    document.querySelectorAll('.cat-dropdown').forEach(m => m.classList.add('hidden'));
}

document.addEventListener('click', (e) => {
    if(!e.target.closest('.cat-menu-trigger') && !e.target.closest('.cat-dropdown')) {
        closeCatMenus();
    }
});

function toggleCategory(catName) {
    if (collapsedCategories.has(catName)) {
        collapsedCategories.delete(catName);
    } else {
        collapsedCategories.add(catName);
    }
    renderSidebar();
}

function moveCat(catName, direction) {
    const cats = Object.keys(data.rules);
    const index = cats.indexOf(catName);
    const newIndex = index + direction;

    if (newIndex < 0 || newIndex >= cats.length) return;

    const newRules = {};
    cats.splice(newIndex, 0, cats.splice(index, 1)[0]);
    
    cats.forEach(cat => {
        newRules[cat] = data.rules[cat];
    });

    data.rules = newRules;
    pushData('rules', data.rules).then(() => {
        renderSidebar();
        toastInfo('Catégorie déplacée', `"${catName}" a été réorganisée.`);
    });
}

async function addRulePrompt(cat) {
    if(!currentUser?.isEditor) return;
    const title = await customPrompt("Titre de la nouvelle règle :");
    if(title) {
        data.rules[cat].push({ id: Date.now().toString(), title, content: "<p>Écrivez le contenu ici...</p>" });
        pushData('rules', data.rules).then(() => { 
            renderSidebar(); 
            openRule(cat, data.rules[cat][data.rules[cat].length-1].id);
            toastSuccess('Règle créée', `La règle "${title}" a été ajoutée à ${cat}.`);
        });
    }
}

function openRule(cat, id) {
    currentCat = cat;
    currentRuleId = id;
    renderSidebar();
    const rule = data.rules[cat].find(r => r.id === id);
    const display = document.getElementById("ruleDisplay");
    const toolbar = document.getElementById("docToolbar");
    const footer = document.getElementById("docFooter");
    
    const canEdit = currentUser?.isEditor === true;
    
    display.innerHTML = `
        <div class="rule-header-simple">
            <div class="rule-breadcrumb">
                <span>${cat}</span>
                <i class="fa-solid fa-chevron-right"></i>
                <span>${rule.title}</span>
            </div>
            <h1 class="rule-title-simple">${rule.title}</h1>
        </div>
        <div class="edit-content-simple" contenteditable="${canEdit}" id="editContent">${rule.content}</div>
    `;
    
    if(canEdit) { 
        toolbar.classList.remove('hidden'); 
        footer.classList.remove('hidden'); 
        
        setTimeout(() => {
            setupImageResizing();
            setupCleanPaste();
        }, 100);
    } else { 
        toolbar.classList.add('hidden'); 
        footer.classList.add('hidden'); 
    }
}

/* =============================================
   ÉDITEUR ENRICHI - Images redimensionnables
============================================= */
function setupImageResizing() {
    const content = document.getElementById("editContent");
    if (!content) return;
    
    content.addEventListener('click', function(e) {
        if (e.target.tagName === 'IMG') {
            makeImageResizable(e.target);
        }
    });
}

function makeImageResizable(img) {
    if (img.classList.contains('resizable')) return;
    
    img.classList.add('resizable', 'selected-image');
    img.style.cursor = 'move';
    
    const wrapper = document.createElement('div');
    wrapper.className = 'image-wrapper';
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-block';
    wrapper.style.maxWidth = '100%';
    
    img.parentNode.insertBefore(wrapper, img);
    wrapper.appendChild(img);
    
    const handles = ['nw', 'ne', 'sw', 'se'];
    handles.forEach(pos => {
        const handle = document.createElement('div');
        handle.className = `resize-handle ${pos}`;
        handle.style.cssText = `
            position: absolute;
            width: 12px;
            height: 12px;
            background: var(--primary);
            border: 2px solid white;
            border-radius: 50%;
            cursor: ${pos.includes('n') ? (pos.includes('w') ? 'nw' : 'ne') : (pos.includes('w') ? 'sw' : 'se')}-resize;
            z-index: 10;
        `;
        
        if (pos.includes('n')) handle.style.top = '-6px';
        if (pos.includes('s')) handle.style.bottom = '-6px';
        if (pos.includes('w')) handle.style.left = '-6px';
        if (pos.includes('e')) handle.style.right = '-6px';
        
        handle.addEventListener('mousedown', (e) => startResize(e, img, pos));
        wrapper.appendChild(handle);
    });
    
    const toolbar = document.createElement('div');
    toolbar.className = 'image-toolbar';
    toolbar.style.cssText = `
        position: absolute;
        top: -40px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.9);
        padding: 8px;
        border-radius: 8px;
        display: flex;
        gap: 8px;
        z-index: 11;
    `;
    
    const alignments = [
        { icon: 'fa-align-left', title: 'Aligner à gauche', action: () => alignImage(wrapper, 'left') },
        { icon: 'fa-align-center', title: 'Centrer', action: () => alignImage(wrapper, 'center') },
        { icon: 'fa-align-right', title: 'Aligner à droite', action: () => alignImage(wrapper, 'right') },
        { icon: 'fa-trash', title: 'Supprimer', action: () => deleteImage(wrapper) }
    ];
    
    alignments.forEach(btn => {
        const button = document.createElement('button');
        button.className = 't-btn';
        button.innerHTML = `<i class="fa-solid ${btn.icon}"></i>`;
        button.title = btn.title;
        button.onclick = (e) => { e.stopPropagation(); btn.action(); };
        toolbar.appendChild(button);
    });
    
    wrapper.appendChild(toolbar);
    
    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            deselectImage(wrapper);
        }
    });
}

function startResize(e, img, position) {
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = img.offsetWidth;
    const startHeight = img.offsetHeight;
    const aspectRatio = startWidth / startHeight;
    
    function resize(e) {
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        
        let newWidth = startWidth;
        let newHeight = startHeight;
        
        if (position.includes('e')) newWidth = startWidth + deltaX;
        if (position.includes('w')) newWidth = startWidth - deltaX;
        if (position.includes('s')) newHeight = startHeight + deltaY;
        if (position.includes('n')) newHeight = startHeight - deltaY;
        
        if (e.shiftKey) {
            if (Math.abs(deltaX) > Math.abs(deltaY)) {
                newHeight = newWidth / aspectRatio;
            } else {
                newWidth = newHeight * aspectRatio;
            }
        }
        
        newWidth = Math.max(50, Math.min(newWidth, 1200));
        newHeight = Math.max(50, Math.min(newHeight, 1200));
        
        img.style.width = newWidth + 'px';
        img.style.height = newHeight + 'px';
    }
    
    function stopResize() {
        document.removeEventListener('mousemove', resize);
        document.removeEventListener('mouseup', stopResize);
    }
    
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResize);
}

function alignImage(wrapper, alignment) {
    wrapper.style.display = 'block';
    
    if (alignment === 'left') {
        wrapper.style.float = 'left';
        wrapper.style.marginRight = '20px';
        wrapper.style.marginBottom = '10px';
        wrapper.style.textAlign = 'left';
    } else if (alignment === 'right') {
        wrapper.style.float = 'right';
        wrapper.style.marginLeft = '20px';
        wrapper.style.marginBottom = '10px';
        wrapper.style.textAlign = 'right';
    } else {
        wrapper.style.float = 'none';
        wrapper.style.margin = '20px auto';
        wrapper.style.textAlign = 'center';
    }
}

function deleteImage(wrapper) {
    if (confirm('Supprimer cette image ?')) {
        wrapper.remove();
    }
}

function deselectImage(wrapper) {
    const img = wrapper.querySelector('img');
    img.classList.remove('selected-image');
    wrapper.querySelectorAll('.resize-handle').forEach(h => h.remove());
    wrapper.querySelector('.image-toolbar')?.remove();
    
    if (wrapper.parentNode) {
        wrapper.replaceWith(img);
    }
}

async function insertImage() {
    const url = await customPrompt("URL de l'image :");
    if (!url) return;
    
    const content = document.getElementById("editContent");
    
    // Créer un conteneur pour l'image
    const wrapper = document.createElement('div');
    wrapper.className = 'image-wrapper';
    wrapper.contentEditable = 'false';
    wrapper.style.cssText = 'position: relative; display: inline-block; margin: 20px auto; max-width: 100%; text-align: center;';
    
    const img = document.createElement('img');
    img.src = url;
    img.className = 'rule-content-image';
    img.alt = 'Image du règlement';
    img.style.cssText = 'max-width: 100%; height: auto; display: block; cursor: move;';
    img.draggable = true;
    
    img.onerror = function() {
        this.src = 'https://via.placeholder.com/800x400/1a1a1e/666?text=Image+non+trouvée';
    };
    
    // Ajouter des poignées de redimensionnement
    const handles = ['nw', 'ne', 'sw', 'se'];
    handles.forEach(pos => {
        const handle = document.createElement('div');
        handle.className = `resize-handle resize-${pos}`;
        handle.style.cssText = `
            position: absolute;
            width: 10px;
            height: 10px;
            background: var(--primary);
            border: 2px solid white;
            border-radius: 50%;
            cursor: ${pos}-resize;
            z-index: 10;
        `;
        
        // Positionner les poignées
        if (pos.includes('n')) handle.style.top = '-5px';
        if (pos.includes('s')) handle.style.bottom = '-5px';
        if (pos.includes('w')) handle.style.left = '-5px';
        if (pos.includes('e')) handle.style.right = '-5px';
        
        // Événement de redimensionnement
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = img.offsetWidth;
            const startHeight = img.offsetHeight;
            const aspectRatio = startWidth / startHeight;
            
            function resize(e) {
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                
                let newWidth = startWidth;
                let newHeight = startHeight;
                
                if (pos.includes('e')) newWidth = startWidth + deltaX;
                if (pos.includes('w')) newWidth = startWidth - deltaX;
                if (pos.includes('s')) newHeight = startHeight + deltaY;
                if (pos.includes('n')) newHeight = startHeight - deltaY;
                
                // Maintenir le ratio
                if (Math.abs(deltaX) > Math.abs(deltaY)) {
                    newHeight = newWidth / aspectRatio;
                } else {
                    newWidth = newHeight * aspectRatio;
                }
                
                img.style.width = Math.max(100, newWidth) + 'px';
                img.style.height = 'auto';
            }
            
            function stopResize() {
                document.removeEventListener('mousemove', resize);
                document.removeEventListener('mouseup', stopResize);
            }
            
            document.addEventListener('mousemove', resize);
            document.addEventListener('mouseup', stopResize);
        });
        
        wrapper.appendChild(handle);
    });
    
    // Menu contextuel pour alignement
    const alignMenu = document.createElement('div');
    alignMenu.className = 'image-align-menu';
    alignMenu.style.cssText = 'position: absolute; top: -40px; left: 50%; transform: translateX(-50%); background: #1a1a1e; border-radius: 8px; padding: 8px; display: flex; gap: 8px; opacity: 0; transition: opacity 0.3s;';
    
    ['left', 'center', 'right'].forEach(align => {
        const btn = document.createElement('button');
        btn.innerHTML = `<i class="fa-solid fa-align-${align}"></i>`;
        btn.style.cssText = 'background: rgba(255,255,255,0.1); border: none; color: white; padding: 8px 12px; border-radius: 4px; cursor: pointer;';
        btn.onclick = () => {
            wrapper.style.textAlign = align;
            wrapper.style.display = align === 'center' ? 'block' : 'inline-block';
            wrapper.style.margin = align === 'center' ? '20px auto' : '20px';
            if (align === 'left') wrapper.style.float = 'left';
            if (align === 'right') wrapper.style.float = 'right';
        };
        alignMenu.appendChild(btn);
    });
    
    wrapper.appendChild(alignMenu);
    
    // Afficher le menu au survol
    wrapper.addEventListener('mouseenter', () => {
        alignMenu.style.opacity = '1';
    });
    wrapper.addEventListener('mouseleave', () => {
        alignMenu.style.opacity = '0';
    });
    
    wrapper.appendChild(img);
    content.appendChild(wrapper);
    content.appendChild(document.createElement('br'));
    content.focus();
    
    toastSuccess('Image ajoutée', 'L\'image a été insérée. Utilisez les poignées pour redimensionner.');
}

async function insertLink() {
    const selection = window.getSelection();
    const selectedText = selection.toString();
    
    const url = await customPrompt("URL du lien :");
    if (!url) return;
    
    let linkText = selectedText;
    if (!linkText) {
        linkText = await customPrompt("Texte du lien :", url);
        if (!linkText) return;
    }
    
    const link = document.createElement('a');
    link.href = url;
    link.textContent = linkText;
    link.className = 'rule-content-link';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    
    if (selectedText) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(link);
    } else {
        const content = document.getElementById("editContent");
        content.appendChild(link);
        content.appendChild(document.createTextNode(' '));
    }
    
    document.getElementById("editContent").focus();
    toastSuccess('Lien ajouté', 'Le lien a été inséré.');
}

/* =============================================
   COPIER-COLLER PROPRE
============================================= */
function setupCleanPaste() {
    const editContent = document.getElementById('editContent');
    if (!editContent) return;
    
    editContent.addEventListener('paste', function(e) {
        e.preventDefault();
        
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        
        const range = selection.getRangeAt(0);
        range.deleteContents();
        
        const lines = text.split('\n');
        lines.forEach((line, index) => {
            if (line.trim()) {
                const textNode = document.createTextNode(line);
                range.insertNode(textNode);
                
                if (index < lines.length - 1) {
                    const br = document.createElement('br');
                    range.insertNode(br);
                    range.setStartAfter(br);
                }
            }
        });
        
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    });
}

function cleanPaste() {
    const content = document.getElementById("editContent");
    if (!content) return;
    
    const text = content.innerText;
    content.innerHTML = '';
    
    const lines = text.split('\n');
    lines.forEach(line => {
        if (line.trim()) {
            const p = document.createElement('p');
            p.textContent = line;
            content.appendChild(p);
        }
    });
    
    content.focus();
    toastSuccess('Formatage nettoyé', 'Le texte a été nettoyé avec succès');
}

function execCmd(cmd, val=null) { 
    document.execCommand(cmd, false, val); 
    document.getElementById("editContent").focus();
}

function insertHeading() {
    execCmd('formatBlock', '<h2>');
}

function insertDivider() {
    const content = document.getElementById("editContent");
    const hr = document.createElement('hr');
    hr.className = 'content-divider';
    content.appendChild(hr);
    content.focus();
}

async function insertCodeBlock() {
    const code = await customPrompt("Entrez le code :");
    if(code) {
        const pre = document.createElement('pre');
        pre.className = 'code-block';
        pre.textContent = code;
        document.getElementById("editContent").appendChild(pre);
    }
}

function saveRule(event) {
    if(!currentCat || !currentRuleId) return;
    const rule = data.rules[currentCat].find(r => r.id === currentRuleId);
    rule.content = document.getElementById("editContent").innerHTML;
    pushData('rules', data.rules).then(() => { 
        if(event && event.target) {
            const saveBtn = event.target;
            const originalText = saveBtn.innerHTML;
            saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Sauvegardé !';
            saveBtn.style.background = '#00ff9d';
            setTimeout(() => {
                saveBtn.innerHTML = originalText;
                saveBtn.style.background = '';
            }, 2000);
        }
        renderSidebar();
        toastWarning('Règle modifiée', `"${rule.title}" a été mise à jour.`);
    });
}

async function deleteRule() {
    if(!await customConfirm("Supprimer cette règle ?")) return;
    const rule = data.rules[currentCat].find(r => r.id === currentRuleId);
    const ruleTitle = rule.title;
    
    data.rules[currentCat] = data.rules[currentCat].filter(r => r.id !== currentRuleId);
    pushData('rules', data.rules).then(() => { 
        document.getElementById("ruleDisplay").innerHTML = `
            <div class="empty-state">
                <div class="icon-circle"><i class="fa-regular fa-file-lines"></i></div>
                <h3>Prêt à lire ?</h3>
                <p>Sélectionnez une règle.</p>
            </div>`;
        currentCat = null;
        currentRuleId = null;
        renderSidebar();
        toastError('Règle supprimée', `"${ruleTitle}" a été supprimée.`);
    });
}

function reorganizeRule() {
    if(!currentCat || !currentRuleId) return;
    
    const categories = Object.keys(data.rules);
    const currentRule = data.rules[currentCat].find(r => r.id === currentRuleId);
    
    let options = '';
    categories.forEach(cat => {
        const isCurrent = cat === currentCat;
        const icon = isCurrent ? 'fa-folder-open' : 'fa-folder';
        const currentClass = isCurrent ? ' current-category' : '';
        
        options += `
            <label class="reorganize-option${currentClass}">
                <input type="radio" name="targetCat" value="${cat}" ${isCurrent ? 'checked' : ''}>
                <span class="reorganize-option-label">${cat}</span>
                <i class="fa-solid ${icon} reorganize-option-icon"></i>
            </label>
        `;
    });
    
    const modal = document.getElementById('modalReorganize');
    document.getElementById('reorganizeOptions').innerHTML = options;
    document.getElementById('reorganizeRuleName').innerText = currentRule.title;
    modal.classList.remove('hidden');
}

function confirmReorganize() {
    const selectedCat = document.querySelector('input[name="targetCat"]:checked')?.value;
    if(!selectedCat || selectedCat === currentCat) {
        closeAllModals();
        return;
    }
    
    const ruleIndex = data.rules[currentCat].findIndex(r => r.id === currentRuleId);
    const rule = data.rules[currentCat].splice(ruleIndex, 1)[0];
    
    data.rules[selectedCat].push(rule);
    
    pushData('rules', data.rules).then(() => {
        closeAllModals();
        openRule(selectedCat, currentRuleId);
        toastInfo('Règle déplacée', `"${rule.title}" → ${selectedCat}`);
    });
}

async function renameCat(oldName) {
    const newName = await customPrompt("Nouveau nom :", oldName);
    if(newName && newName !== oldName) {
        const newRules = {};
        Object.keys(data.rules).forEach(cat => {
            if(cat === oldName) {
                newRules[newName] = data.rules[oldName];
            } else {
                newRules[cat] = data.rules[cat];
            }
        });
        data.rules = newRules;
        pushData('rules', data.rules).then(() => {
            renderSidebar();
            toastWarning('Catégorie renommée', `"${oldName}" → "${newName}"`);
        });
    }
}

async function deleteCat(cat) {
    if(!await customConfirm(`Supprimer la catégorie "${cat}" et toutes ses règles ?`)) return;
    delete data.rules[cat];
    pushData('rules', data.rules).then(() => {
        renderSidebar();
        toastError('Catégorie supprimée', `La catégorie "${cat}" a été supprimée.`);
    });
}

function addCat() {
    const name = document.getElementById("inCatName").value;
    if(name) { 
        data.rules[name] = []; 
        pushData('rules', data.rules).then(() => { 
            closeAllModals(); 
            renderSidebar();
            toastSuccess('Catégorie créée', `La catégorie "${name}" a été ajoutée avec succès.`);
        }); 
    }
}

/* --- FACTIONS --- */
function renderLegal() { renderFactions(data.legal, "legalGrid"); }
function renderIllegal() { renderFactions(data.illegal, "illegalGrid"); }

function renderFactions(list, gridId) {
    const grid = document.getElementById(gridId);
    grid.innerHTML = "";
    
    list.forEach((f, i) => {
        const imgSrc = f.image || "https://via.placeholder.com/600x300/1a1a1e/555?text=SmallCity";
        
        const card = document.createElement('div');
        card.className = 'faction-card';
        card.innerHTML = `
            <div class="faction-img-wrapper">
                <img src="${imgSrc}" class="faction-img" alt="${f.name}" onerror="this.src='https://via.placeholder.com/600x300/1a1a1e/555?text=Image+Error'">
            </div>
            <div class="faction-body">
                <h3 class="faction-title">${f.name}</h3>
                <p class="faction-desc">${f.description || ""}</p>
                <div class="faction-actions">
                    <a href="${f.discord}" target="_blank" class="btn btn-glow"><i class="fa-brands fa-discord"></i> Rejoindre</a>
                    ${currentUser?.isEditor ? `
                        <button class="btn-icon" onclick="editFaction('${gridId}', ${i})"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-icon btn-danger" onclick="delFaction('${gridId}', ${i})"><i class="fa-solid fa-trash"></i></button>
                    ` : ''}
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function addFaction(gridId) {
    const prefix = gridId === "legalGrid" ? "inLegal" : "inIllegal";
    const name = document.getElementById(`${prefix}Name`).value;
    const desc = document.getElementById(`${prefix}Desc`).value;
    const img = document.getElementById(`${prefix}Image`).value;
    const discord = document.getElementById(`${prefix}Discord`).value;
    const type = gridId === "legalGrid" ? "legal" : "illegal";

    if(!name || !discord) {
        alert("Le nom et le lien Discord sont obligatoires !");
        return;
    }

    const list = type === "legal" ? data.legal : data.illegal;
    list.push({ id: Date.now().toString(), name, description: desc, image: img, discord, type });
    pushData('factions', [...data.legal, ...data.illegal]).then(() => { 
        closeAllModals(); 
        renderLegal(); 
        renderIllegal();
        const typeLabel = type === "legal" ? "Entreprise" : "Groupe illégal";
        toastSuccess(`${typeLabel} créé${type === "legal" ? "e" : ""}`, `${name} a été ajouté${type === "legal" ? "e" : ""}.`);
    });
}

async function editFaction(gridId, index) {
    const list = gridId === "legalGrid" ? data.legal : data.illegal;
    const f = list[index];
    const oldName = f.name;
    
    const newName = await customPrompt("Nom :", f.name);
    const newDesc = await customPrompt("Description :", f.description);
    const newImage = await customPrompt("URL Image :", f.image);
    const newDiscord = await customPrompt("Lien Discord :", f.discord);
    
    if(newName) f.name = newName;
    if(newDesc !== null) f.description = newDesc;
    if(newImage !== null) f.image = newImage;
    if(newDiscord) f.discord = newDiscord;
    
    pushData('factions', [...data.legal, ...data.illegal]).then(() => { 
        renderLegal(); 
        renderIllegal();
        toastWarning('Faction modifiée', `${oldName} a été mis${gridId === "legalGrid" ? "e" : ""} à jour.`);
    });
}

async function delFaction(gridId, index) {
    const list = gridId === "legalGrid" ? data.legal : data.illegal;
    const factionName = list[index].name;
    
    if(!await customConfirm("Supprimer cette faction ?")) return;
    list.splice(index, 1);
    pushData('factions', [...data.legal, ...data.illegal]).then(() => { 
        renderLegal(); 
        renderIllegal();
        toastError('Faction supprimée', `${factionName} a été supprimé${gridId === "legalGrid" ? "e" : ""}.`);
    });
}

function switchPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    
    const targetPage = document.getElementById(id);
    if (targetPage) {
        targetPage.classList.add('active');
    }
    
    document.querySelectorAll('.nav a').forEach(a => a.classList.remove('active'));
    
    if (event && event.target) {
        event.target.classList.add('active');
    }

    const body = document.body;
    body.classList.remove('theme-green', 'theme-red');
    if(id === 'legal') body.classList.add('theme-green');
    if(id === 'illegal') body.classList.add('theme-red');
    
    if(id === 'faq') {
        loadFAQ();
    }
    
    closeMobileMenu();
}

async function pushData(type, body) {
    await fetch(`${API_URL}/api/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
    });
}

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeAllModals() { document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')); }

/* =============================================
   MENU HAMBURGER MOBILE
============================================= */
function toggleMobileMenu() {
    const nav = document.getElementById('navMenu');
    const hamburger = document.getElementById('hamburger');
    
    nav.classList.toggle('mobile-open');
    hamburger.classList.toggle('active');
}

function closeMobileMenu() {
    const nav = document.getElementById('navMenu');
    const hamburger = document.getElementById('hamburger');
    
    if (nav.classList.contains('mobile-open')) {
        nav.classList.remove('mobile-open');
        hamburger.classList.remove('active');
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const navLinks = document.querySelectorAll('.nav a');
    navLinks.forEach(link => {
        link.addEventListener('click', closeMobileMenu);
    });
});

/* =============================================
   MODALS PERSONNALISÉES
============================================= */
let customConfirmResolve = null;
let customPromptResolve = null;

function customConfirm(message) {
    return new Promise((resolve) => {
        customConfirmResolve = resolve;
        document.getElementById('confirmMessage').textContent = message;
        document.getElementById('customConfirm').classList.remove('hidden');
    });
}

function resolveCustomConfirm(value) {
    document.getElementById('customConfirm').classList.add('hidden');
    if (customConfirmResolve) {
        customConfirmResolve(value);
        customConfirmResolve = null;
    }
}

function customPrompt(message, defaultValue = '') {
    return new Promise((resolve) => {
        customPromptResolve = resolve;
        document.getElementById('promptMessage').textContent = message;
        document.getElementById('promptInput').value = defaultValue;
        document.getElementById('customPrompt').classList.remove('hidden');
        setTimeout(() => document.getElementById('promptInput').focus(), 100);
    });
}

function resolveCustomPrompt(value) {
    document.getElementById('customPrompt').classList.add('hidden');
    if (customPromptResolve) {
        customPromptResolve(value);
        customPromptResolve = null;
    }
}

document.addEventListener('keydown', (e) => {
    if (!document.getElementById('customConfirm').classList.contains('hidden')) {
        if (e.key === 'Enter') {
            e.preventDefault();
            resolveCustomConfirm(true);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            resolveCustomConfirm(false);
        }
    }
    
    if (!document.getElementById('customPrompt').classList.contains('hidden')) {
        if (e.key === 'Enter') {
            e.preventDefault();
            resolveCustomPrompt(document.getElementById('promptInput').value);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            resolveCustomPrompt(null);
        }
    }
    
    const openModals = Array.from(document.querySelectorAll('.modal:not(.hidden)'))
        .filter(m => m.id !== 'customConfirm' && m.id !== 'customPrompt');
    
    if (openModals.length > 0 && e.key === 'Escape') {
        e.preventDefault();
        closeAllModals();
    }
});

/* =============================================
   TOAST NOTIFICATIONS
============================================= */
function showToast(type, title, message, duration = 3000) {
    if (!currentUser?.isAdmin && !currentUser?.isModerator) return;
    
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: 'fa-check',
        error: 'fa-xmark',
        warning: 'fa-pen',
        info: 'fa-info'
    };
    
    toast.innerHTML = `
        <div class="toast-icon">
            <i class="fa-solid ${icons[type]}"></i>
        </div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => {
            container.removeChild(toast);
        }, 300);
    }, duration);
}

function toastSuccess(title, message) { showToast('success', title, message); }
function toastError(title, message) { showToast('error', title, message); }
function toastWarning(title, message) { showToast('warning', title, message); }
function toastInfo(title, message) { showToast('info', title, message); }

/* =============================================
   GESTION DES UTILISATEURS
============================================= */
let allUsers = [];

async function loadUsers() {
    if (!currentUser?.isAdmin && !currentUser?.isModerator) return;
    
    try {
        const res = await fetch(`${API_URL}/api/users`, { credentials: 'include' });
        allUsers = await res.json();
        renderUsers();
        updateUserStats();
    } catch (e) {
        console.error('Erreur chargement utilisateurs:', e);
    }
}

function renderUsers() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    const filteredUsers = allUsers.filter(u => {
        const search = document.getElementById('userSearch')?.value.toLowerCase() || '';
        return u.username.toLowerCase().includes(search) || u.id.includes(search);
    });
    
    filteredUsers.forEach(user => {
        const row = document.createElement('tr');
        
        const statusInfo = getStatusInfo(user.status);
        const date = new Date(user.connectedAt).toLocaleString('fr-FR');
        
        const canModify = (currentUser.isAdmin) || 
                         (currentUser.isModerator && user.status !== 'admin' && user.status !== 'moderator');
        
        row.innerHTML = `
            <td>
                <div class="user-cell">
                    <img src="${user.avatar}" class="user-avatar" alt="${user.username}">
                    <span class="user-name">${user.username}</span>
                </div>
            </td>
            <td><code class="user-id">${user.id}</code></td>
            <td><span class="status-badge ${user.status}">${statusInfo}</span></td>
            <td class="user-date">${date}</td>
            <td>
                <div class="user-actions">
                    ${canModify ? `
                        <select onchange="changeUserStatus('${user.id}', this.value)" class="status-select">
                            <option value="">Action...</option>
                            ${currentUser.isAdmin ? `
                                <option value="admin">👑 Administrateur</option>
                                <option value="moderator">🛡️ Modérateur</option>
                            ` : ''}
                            <option value="approved">✅ Éditeur</option>
                            <option value="refused">❌ Refuser</option>
                        </select>
                    ` : `<span class="admin-badge">${statusInfo}</span>`}
                </div>
            </td>
        `;
        
        tbody.appendChild(row);
    });
    
    if (filteredUsers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#666; padding:40px;">Aucun utilisateur trouvé</td></tr>';
    }
}

function getStatusInfo(status) {
    const statusMap = {
        'admin': '👑 Administrateur',
        'moderator': '🛡️ Modérateur',
        'approved': '✅ Éditeur',
        'pending': '⏳ En attente',
        'refused': '❌ Refusé'
    };
    return statusMap[status] || status;
}

async function changeUserStatus(userId, newStatus) {
    if (!newStatus) return;
    
    try {
        const res = await fetch(`${API_URL}/api/users/${userId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ status: newStatus })
        });
        
        if (res.ok) {
            await loadUsers();
            const statusLabels = {
                'admin': 'Administrateur',
                'moderator': 'Modérateur',
                'approved': 'Éditeur',
                'refused': 'Refusé'
            };
            toastSuccess('Statut modifié', `L'utilisateur est maintenant ${statusLabels[newStatus]}`);
        } else {
            const data = await res.json();
            toastError('Erreur', data.error || 'Impossible de modifier le statut');
        }
    } catch (e) {
        console.error(e);
        toastError('Erreur', 'Une erreur est survenue');
    }
}

function filterUsers() {
    renderUsers();
}

function updateUserStats() {
    const stats = {
        admin: allUsers.filter(u => u.status === 'admin').length,
        approved: allUsers.filter(u => u.status === 'approved').length,
        pending: allUsers.filter(u => u.status === 'pending').length,
        refused: allUsers.filter(u => u.status === 'refused').length
    };
    
    document.getElementById('adminCount').textContent = stats.admin;
    document.getElementById('approvedCount').textContent = stats.approved;
    document.getElementById('pendingCount').textContent = stats.pending;
    document.getElementById('blockedCount').textContent = stats.refused;
}

/* =============================================
   IMPORT/EXPORT JSON
============================================= */
let currentImportType = null;

function exportJSON(type) {
    if (!currentUser?.isEditor) return;
    
    let dataToExport, filename;
    
    if (type === 'rules') {
        dataToExport = data.rules;
        filename = 'reglement-smallcity.json';
    } else if (type === 'legal') {
        dataToExport = data.legal;
        filename = 'entreprises-smallcity.json';
    } else if (type === 'illegal') {
        dataToExport = data.illegal;
        filename = 'groupes-illegaux-smallcity.json';
    }
    
    const jsonString = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toastSuccess('Export réussi', `${filename} téléchargé avec succès !`);
}

function openImportModal(type) {
    if (!currentUser?.isEditor) return;
    
    currentImportType = type;
    document.getElementById('importJSONInput').value = '';
    document.getElementById('importPreview').style.display = 'none';
    document.getElementById('modalImportJSON').classList.remove('hidden');
    
    const titles = {
        'rules': 'Règlement',
        'legal': 'Entreprises',
        'illegal': 'Groupes Illégaux'
    };
    
    document.querySelector('#modalImportJSON .import-subtitle strong').textContent = titles[type];
}

function closeImportModal() {
    document.getElementById('modalImportJSON').classList.add('hidden');
    currentImportType = null;
}

const fileDropZone = document.getElementById('fileDropZone');

if (fileDropZone) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        fileDropZone.addEventListener(eventName, preventDefaults, false);
    });
    
    ['dragenter', 'dragover'].forEach(eventName => {
        fileDropZone.addEventListener(eventName, () => {
            fileDropZone.classList.add('drag-over');
        });
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        fileDropZone.addEventListener(eventName, () => {
            fileDropZone.classList.remove('drag-over');
        });
    });
    
    fileDropZone.addEventListener('drop', handleDrop);
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
        handleFiles(files[0]);
    }
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        handleFiles(file);
    }
}

function handleFiles(file) {
    if (file.type !== 'application/json') {
        toastError('Erreur', 'Le fichier doit être au format .json');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target.result;
        document.getElementById('importJSONInput').value = content;
        previewJSON(content);
    };
    reader.readAsText(file);
}

document.getElementById('importJSONInput')?.addEventListener('input', (e) => {
    previewJSON(e.target.value);
});

function previewJSON(jsonString) {
    const preview = document.getElementById('importPreview');
    const previewContent = document.getElementById('previewContent');
    
    if (!jsonString.trim()) {
        preview.style.display = 'none';
        return;
    }
    
    try {
        const parsed = JSON.parse(jsonString);
        let html = '';
        
        if (currentImportType === 'rules') {
            const catCount = Object.keys(parsed).length;
            let totalRules = 0;
            Object.values(parsed).forEach(rules => totalRules += rules.length);
            
            html = `
                <div class="preview-stat">
                    <i class="fa-solid fa-folder"></i>
                    <span><strong>${catCount}</strong> catégories</span>
                </div>
                <div class="preview-stat">
                    <i class="fa-solid fa-file-lines"></i>
                    <span><strong>${totalRules}</strong> règles au total</span>
                </div>
            `;
        } else {
            html = `
                <div class="preview-stat">
                    <i class="fa-solid fa-building"></i>
                    <span><strong>${parsed.length}</strong> ${currentImportType === 'legal' ? 'entreprises' : 'groupes'}</span>
                </div>
            `;
        }
        
        previewContent.innerHTML = html;
        preview.style.display = 'block';
    } catch (e) {
        previewContent.innerHTML = `
            <div class="preview-error">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <span>JSON invalide : ${e.message}</span>
            </div>
        `;
        preview.style.display = 'block';
    }
}

async function confirmImportJSON() {
    const jsonString = document.getElementById('importJSONInput').value.trim();
    
    if (!jsonString) {
        toastError('Erreur', 'Aucune donnée à importer');
        return;
    }
    
    try {
        const parsed = JSON.parse(jsonString);
        
        if (currentImportType === 'rules' && typeof parsed !== 'object') {
            throw new Error('Le JSON doit être un objet pour le règlement');
        }
        if ((currentImportType === 'legal' || currentImportType === 'illegal') && !Array.isArray(parsed)) {
            throw new Error('Le JSON doit être un tableau pour les factions');
        }
        
        if (!await customConfirm('⚠️ Remplacer toutes les données actuelles par ce JSON ?')) {
            return;
        }
        
        if (currentImportType === 'rules') {
            data.rules = parsed;
            await pushData('rules', data.rules);
            renderSidebar();
            toastSuccess('Import réussi', `${Object.keys(parsed).length} catégories importées`);
        } else if (currentImportType === 'legal') {
            data.legal = parsed;
            await pushData('factions', [...data.legal, ...data.illegal]);
            renderLegal();
            toastSuccess('Import réussi', `${parsed.length} entreprises importées`);
        } else if (currentImportType === 'illegal') {
            data.illegal = parsed;
            await pushData('factions', [...data.legal, ...data.illegal]);
            renderIllegal();
            toastSuccess('Import réussi', `${parsed.length} groupes importés`);
        }
        
        closeImportModal();
    } catch (e) {
        toastError('Erreur d\'import', e.message);
    }
}

/* =============================================
   SYSTÈME FAQ OPTIMISÉ
============================================= */
let allFAQ = [];
let currentFAQFilter = 'all';
let currentAnsweringQuestionId = null;

async function loadFAQ() {
    try {
        const res = await fetch(`${API_URL}/api/faq`, { credentials: 'include' });
        allFAQ = await res.json();
        renderFAQ();
    } catch (e) {
        console.error('Erreur chargement FAQ:', e);
        allFAQ = [];
        renderFAQ();
    }
}

function renderFAQ() {
    const container = document.getElementById('faqContainer');
    if (!container) return;
    
    let filteredFAQ = allFAQ;
    
    if (currentFAQFilter === 'pending') {
        filteredFAQ = allFAQ.filter(q => q.status === 'pending');
    } else if (currentFAQFilter === 'answered') {
        filteredFAQ = allFAQ.filter(q => q.status === 'answered');
    }
    
    const searchTerm = document.getElementById('faqSearch')?.value.toLowerCase() || '';
    if (searchTerm) {
        filteredFAQ = filteredFAQ.filter(q => 
            q.question.toLowerCase().includes(searchTerm) ||
            (q.answer && q.answer.toLowerCase().includes(searchTerm))
        );
    }
    
    container.innerHTML = '';
    
    if (filteredFAQ.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon-circle"><i class="fa-regular fa-circle-question"></i></div>
                <h3>Aucune question</h3>
                <p>${currentFAQFilter === 'pending' ? 'Aucune question en attente' : 'Aucune question trouvée'}</p>
            </div>
        `;
        return;
    }
    
    filteredFAQ.sort((a, b) => new Date(b.askedAt) - new Date(a.askedAt));
    
    filteredFAQ.forEach(faqItem => {
        const card = document.createElement('div');
        card.className = `faq-card ${faqItem.status}`;
        
        const askedDate = new Date(faqItem.askedAt).toLocaleString('fr-FR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const canEdit = currentUser?.isEditor || currentUser?.isAdmin || currentUser?.isModerator;
        const showUserId = canEdit;
        
        let answeredSection = '';
        if (faqItem.status === 'answered' && faqItem.answeredBy) {
            const answeredDate = new Date(faqItem.answeredAt).toLocaleString('fr-FR', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            answeredSection = `
                <div class="faq-answer-section" id="answer-${faqItem.id}" style="display: none; margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.05);">
                    <div class="faq-answer-header">
                        <img src="${faqItem.answeredBy.avatar}" class="faq-avatar" alt="${faqItem.answeredBy.username}">
                        <div class="faq-answer-meta">
                            <strong>${faqItem.answeredBy.username}</strong>
                            <span class="faq-badge staff">Staff</span>
                            <span class="faq-date">${answeredDate}</span>
                        </div>
                    </div>
                    <div class="faq-answer-text">${faqItem.answer}</div>
                </div>
            `;
        }
        
        let actions = '';
        if (faqItem.status === 'pending' && canEdit) {
            actions = `
                <div class="faq-actions">
                    <button class="btn btn-glow btn-sm" onclick="openAnswerModal('${faqItem.id}')">
                        <i class="fa-solid fa-reply"></i> Répondre
                    </button>
                    ${currentUser?.isAdmin ? `
                        <button class="btn btn-danger btn-sm" onclick="deleteFAQQuestion('${faqItem.id}')">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    ` : ''}
                </div>
            `;
        } else if (faqItem.status === 'answered') {
            actions = `
                <div class="faq-actions">
                    <button class="btn btn-secondary btn-sm" onclick="toggleFAQAnswer('${faqItem.id}')">
                        <i class="fa-solid fa-chevron-down"></i> <span id="toggle-text-${faqItem.id}">Voir la réponse</span>
                    </button>
                    ${currentUser?.isAdmin ? `
                        <button class="btn btn-danger btn-sm" onclick="deleteFAQQuestion('${faqItem.id}')">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    ` : ''}
                </div>
            `;
        }
        
            card.innerHTML = `
                <div class="faq-question-header" onclick="toggleFAQCard(this)">
                    <img src="${faqItem.askedBy.avatar}" class="faq-avatar" alt="${faqItem.askedBy.username}">
                    <div class="faq-question-meta">
                        <div class="faq-user-info">
                            <strong>${faqItem.askedBy.username}</strong>
                            ${showUserId ? `<code class="faq-user-id">${faqItem.askedBy.id}</code>` : ''}
                        </div>
                        <span class="faq-date">${askedDate}</span>
                    </div>
                    <span class="faq-badge ${faqItem.status}">
                        ${faqItem.status === 'pending' ? '⏳ En attente' : '✅ Répondue'}
                    </span>
                    <i class="fa-solid fa-chevron-down faq-chevron"></i>
                </div>
                
                <div class="faq-question-text">${faqItem.question}</div>
                
                <div class="faq-answer-container" style="max-height: 0; overflow: hidden; transition: max-height 0.3s ease;">
                    ${answeredInfo}
                    ${actions}
                </div>
            `;
        
        container.appendChild(card);
    });
}

function toggleFAQAnswer(questionId) {
    const answerSection = document.getElementById(`answer-${questionId}`);
    const toggleText = document.getElementById(`toggle-text-${questionId}`);
    const button = toggleText.parentElement;
    const icon = button.querySelector('i');
    
    if (answerSection.style.display === 'none') {
        answerSection.style.display = 'block';
        toggleText.textContent = 'Masquer la réponse';
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-up');
    } else {
        answerSection.style.display = 'none';
        toggleText.textContent = 'Voir la réponse';
        icon.classList.remove('fa-chevron-up');
        icon.classList.add('fa-chevron-down');
    }
}

function toggleFAQCard(header) {
    const card = header.parentElement;
    const answerContainer = card.querySelector('.faq-answer-container');
    const chevron = card.querySelector('.faq-chevron');
    
    if (answerContainer.style.maxHeight === '0px' || answerContainer.style.maxHeight === '') {
        answerContainer.style.maxHeight = answerContainer.scrollHeight + 'px';
        chevron.style.transform = 'rotate(180deg)';
    } else {
        answerContainer.style.maxHeight = '0';
        chevron.style.transform = 'rotate(0deg)';
    }
}

function filterFAQ(filter) {
    currentFAQFilter = filter;
    
    document.querySelectorAll('.faq-filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.filter === filter) {
            btn.classList.add('active');
        }
    });
    
    renderFAQ();
}

function searchFAQ() {
    renderFAQ();
}

function openAskQuestionModal() {
    if (!currentUser) {
        openModal('modalLoginRequired');
        return;
    }
    
    document.getElementById('faqQuestionInput').value = '';
    openModal('modalAskQuestion');
}

async function submitQuestion() {
    const question = document.getElementById('faqQuestionInput').value.trim();
    
    if (!question) {
        toastError('Erreur', 'Veuillez entrer une question');
        return;
    }
    
    try {
        const res = await fetch(`${API_URL}/api/faq/question`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ question })
        });
        
        if (res.ok) {
            await loadFAQ();
            closeAllModals();
            toastSuccess('Question envoyée', 'Votre question a été soumise avec succès !');
        } else {
            const data = await res.json();
            toastError('Erreur', data.error || 'Impossible d\'envoyer la question');
        }
    } catch (e) {
        console.error(e);
        toastError('Erreur', 'Une erreur est survenue');
    }
}

function openAnswerModal(questionId) {
    const question = allFAQ.find(q => q.id === questionId);
    if (!question) return;
    
    currentAnsweringQuestionId = questionId;
    document.getElementById('answerQuestionText').textContent = question.question;
    document.getElementById('faqAnswerInput').value = '';
    
    openModal('modalAnswerQuestion');
}

async function submitAnswer() {
    const answer = document.getElementById('faqAnswerInput').value.trim();
    
    if (!answer) {
        toastError('Erreur', 'Veuillez entrer une réponse');
        return;
    }
    
    try {
        const res = await fetch(`${API_URL}/api/faq/${currentAnsweringQuestionId}/answer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ answer })
        });
        
        if (res.ok) {
            await loadFAQ();
            closeAllModals();
            toastSuccess('Réponse publiée', 'La réponse a été ajoutée avec succès !');
            currentAnsweringQuestionId = null;
        } else {
            const data = await res.json();
            toastError('Erreur', data.error || 'Impossible de publier la réponse');
        }
    } catch (e) {
        console.error(e);
        toastError('Erreur', 'Une erreur est survenue');
    }
}

async function deleteFAQQuestion(questionId) {
    if (!await customConfirm('Supprimer cette question ?')) return;
    
    try {
        const res = await fetch(`${API_URL}/api/faq/${questionId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (res.ok) {
            await loadFAQ();
            toastSuccess('Question supprimée', 'La question a été supprimée');
        }
    } catch (e) {
        console.error(e);
        toastError('Erreur', 'Impossible de supprimer la question');
    }
}

init();