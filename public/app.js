const API_URL = window.location.origin; // <-- correction ici
let currentUser = null;
let data = { rules: {}, legal: [], illegal: [] };
let currentCat = null;
let currentRuleId = null;
let collapsedCategories = new Set(); // Pour tracker les catégories repliées

async function init() {
    try {
        const res = await fetch(`${API_URL}/auth/user`, { credentials: "include" });
        currentUser = await res.json();
    } catch(e) {
        console.error("Erreur récupération utilisateur :", e);
    }
    renderAuth();
    await loadData();
    
    // Charger la FAQ
    await loadFAQ();
    
    // Charger les users si admin
    if (currentUser?.isAdmin) {
        await loadUsers();
    }
    
    // Fermer toutes les catégories au chargement
    Object.keys(data.rules).forEach(cat => {
        collapsedCategories.add(cat);
    });
    renderSidebar();
}

/* --- INIT --- */
async function init() {
    try {
        const res = await fetch(`${API_URL}/auth/user`, { credentials: "include" });
        currentUser = await res.json();
    } catch(e) {
        console.error("Erreur récupération utilisateur :", e);
    }
    renderAuth();
    await loadData();
    
    // Charger les users si admin
    if (currentUser?.isAdmin) {
        await loadUsers();
    }
    
    // Fermer toutes les catégories au chargement
    Object.keys(data.rules).forEach(cat => {
        collapsedCategories.add(cat);
    });
    renderSidebar();
}

/* --- AUTH --- */
function renderAuth() {
    const area = document.getElementById("auth-area");
    if (!currentUser) {
        area.innerHTML = `<a href="${API_URL}/auth/discord" class="btn btn-discord"><i class="fa-brands fa-discord"></i> Connexion</a>`;
        document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.editor-control').forEach(el => el.classList.add('hidden'));
    } else {
        // Afficher le profil
        area.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; background:#111; padding:5px 15px; border-radius:20px; border:1px solid #222;">
                <img src="${currentUser.avatar}" style="width:30px;height:30px;border-radius:50%;">
                <span style="font-weight:600; font-size:0.9rem">${currentUser.username}</span>
                <button class="btn-icon" onclick="logout()" style="padding:4px;"><i class="fa-solid fa-power-off"></i></button>
            </div>`;
        
        // Afficher les contrôles admin SEULEMENT si admin
        if (currentUser.isAdmin) {
            document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
            document.querySelectorAll('.editor-only').forEach(el => el.classList.remove('hidden'));
        } else {
            document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
        }
        
        // Afficher les contrôles éditeur si éditeur (admin OU approuvé)
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
async function loadData() {
    try {
        const [rulesRes, factionsRes] = await Promise.all([
            fetch(`${API_URL}/api/rules`).then(r => r.json()),
            fetch(`${API_URL}/api/factions`).then(r => r.json())
        ]);

        data.rules = rulesRes || {};
        data.legal = factionsRes.filter(f => f.type === "legal") || [];
        data.illegal = factionsRes.filter(f => f.type === "illegal") || [];

        // Ne pas appeler renderSidebar ici, init() s'en charge
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

        // Mettre à jour les boutons Discord
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
        
        // Wrapper pour catégorie (pour position relative du menu)
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

        // Menu contextuel admin (dropdown) - maintenant dans le wrapper
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

        // Container pour les règles
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
        
        // Positionner le menu à côté du bouton
        if(!menu.classList.contains('hidden')) {
            const rect = triggerElement.getBoundingClientRect();
            const menuRect = menu.getBoundingClientRect();
            const sidebar = document.querySelector('.docs-sidebar');
            const sidebarRect = sidebar.getBoundingClientRect();
            
            // Position par défaut : à droite du bouton
            menu.style.left = 'auto';
            menu.style.right = '8px';
            menu.style.top = (rect.bottom - sidebarRect.top + sidebar.scrollTop + 4) + 'px';
        }
    }
}

function closeCatMenus() {
    document.querySelectorAll('.cat-dropdown').forEach(m => m.classList.add('hidden'));
}

// Fermer les menus si on clique ailleurs
document.addEventListener('click', (e) => {
    if(!e.target.closest('.cat-menu-trigger') && !e.target.closest('.cat-dropdown')) {
        closeCatMenus();
    }
});

function toggleCatMenu(cat) {
    closeCatMenus();
    const menu = document.getElementById(`catMenu-${cat}`);
    if(menu) {
        menu.classList.toggle('hidden');
    }
}

function closeCatMenus() {
    document.querySelectorAll('.cat-dropdown').forEach(m => m.classList.add('hidden'));
}

// Fermer les menus si on clique ailleurs
document.addEventListener('click', (e) => {
    if(!e.target.closest('.cat-menu-trigger') && !e.target.closest('.cat-dropdown')) {
        closeCatMenus();
    }
});

/* --- TOGGLE CATEGORY --- */
function toggleCategory(catName) {
    if (collapsedCategories.has(catName)) {
        collapsedCategories.delete(catName);
    } else {
        collapsedCategories.add(catName);
    }
    renderSidebar();
}

/* --- DÉPLACEMENT CATÉGORIES --- */
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

/* --- RÈGLES ADMIN --- */
async function addRulePrompt(cat) {
    if(!currentUser?.isAdmin) return;
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
    
    // ✅ CORRECTION : Vérifier isEditor au lieu de isAdmin
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
    
    // ✅ CORRECTION : Afficher toolbar et footer si isEditor
    if(canEdit) { 
        toolbar.classList.remove('hidden'); 
        footer.classList.remove('hidden'); 
    } else { 
        toolbar.classList.add('hidden'); 
        footer.classList.add('hidden'); 
    }
}

/* =============================================
   ÉDITEUR ENRICHI - Images, Liens, Formatage
============================================= */

async function insertImage() {
    const url = await customPrompt("URL de l'image :");
    if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.className = 'rule-content-image';
        img.alt = 'Image du règlement';
        img.onerror = function() {
            this.src = 'https://via.placeholder.com/800x400/1a1a1e/666?text=Image+non+trouvée';
        };
        
        const content = document.getElementById("editContent");
        content.appendChild(img);
        content.focus();
        
        toastSuccess('Image ajoutée', 'L\'image a été insérée dans le règlement.');
    }
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

// Nettoyer le formatage lors du collage
function cleanPaste() {
    const content = document.getElementById("editContent");
    if (!content) return;
    
    // Sélectionner tout le contenu
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(content);
    selection.removeAllRanges();
    selection.addRange(range);
    
    // Retirer le formatage
    document.execCommand('removeFormat', false, null);
    document.execCommand('unlink', false, null);
    
    toastInfo('Formatage nettoyé', 'Le formatage a été supprimé du texte sélectionné.');
}

// Améliorer le collage automatique
document.addEventListener('DOMContentLoaded', function() {
    const editContent = document.getElementById('editContent');
    if (editContent) {
        editContent.addEventListener('paste', function(e) {
            e.preventDefault();
            
            // Récupérer le texte sans formatage
            const text = e.clipboardData.getData('text/plain');
            
            // Insérer le texte proprement
            document.execCommand('insertText', false, text);
        });
    }
});

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

function changeFontSize(size) {
    execCmd('fontSize', size);
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

/* --- RÉORGANISER RÈGLE (nouvelle fonction) --- */
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

/* --- FACTIONS LEGAL / ILLEGAL --- */
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

/* --- NAV / THEME --- */
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
}

/* --- HELPERS --- */
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
   MODALS PERSONNALISÉES - Remplace prompt/confirm
============================================= */
let customConfirmResolve = null;
let customPromptResolve = null;

// Remplace confirm()
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

// Remplace prompt()
function customPrompt(message, defaultValue = '') {
    return new Promise((resolve) => {
        customPromptResolve = resolve;
        document.getElementById('promptMessage').textContent = message;
        document.getElementById('promptInput').value = defaultValue;
        document.getElementById('customPrompt').classList.remove('hidden');
        // Focus sur l'input
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

/* =============================================
   SUPPORT CLAVIER - Entrée/Échap pour modals
============================================= */
document.addEventListener('keydown', (e) => {
    // Modal Confirm
    if (!document.getElementById('customConfirm').classList.contains('hidden')) {
        if (e.key === 'Enter') {
            e.preventDefault();
            resolveCustomConfirm(true);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            resolveCustomConfirm(false);
        }
    }
    
    // Modal Prompt
    if (!document.getElementById('customPrompt').classList.contains('hidden')) {
        if (e.key === 'Enter') {
            e.preventDefault();
            resolveCustomPrompt(document.getElementById('promptInput').value);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            resolveCustomPrompt(null);
        }
    }
    
    // Autres modals (ajout catégorie, faction, etc.)
    const openModals = Array.from(document.querySelectorAll('.modal:not(.hidden)'))
        .filter(m => m.id !== 'customConfirm' && m.id !== 'customPrompt');
    
    if (openModals.length > 0 && e.key === 'Escape') {
        e.preventDefault();
        closeAllModals();
    }
});

/* =============================================
   TOAST NOTIFICATIONS SYSTEM - Admin uniquement
============================================= */
function showToast(type, title, message, duration = 3000) {
    // Vérifier si l'utilisateur est admin
    if (!currentUser?.isAdmin) return;
    
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Icônes selon le type
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
    
    // Retirer après la durée spécifiée
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => {
            container.removeChild(toast);
        }, 300);
    }, duration);
}

// Fonctions raccourcies pour chaque type
function toastSuccess(title, message) {
    showToast('success', title, message);
}

function toastError(title, message) {
    showToast('error', title, message);
}

function toastWarning(title, message) {
    showToast('warning', title, message);
}

function toastInfo(title, message) {
    showToast('info', title, message);
}

/* =============================================
   GESTION DES UTILISATEURS - Admin uniquement
============================================= */

let allUsers = [];

async function loadUsers() {
    if (!currentUser?.isAdmin) return;
    
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
                    ${user.status !== 'admin' ? `
                        <select onchange="changeUserStatus('${user.id}', this.value)" class="status-select">
                            <option value="">Action...</option>
                            <option value="admin">👑 Administrateur</option>
                            <option value="approved">✅ Éditeur</option>
                            <option value="refused">❌ Refuser</option>
                        </select>
                    ` : '<span class="admin-badge">👑 Admin</span>'}
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
        'approved': '✅ Éditeur',
        'pending': '⏳ En attente',
        'refused': '❌ Refusé'
    };
    return statusMap[status] || status;
}

async function changeUserStatus(userId, newStatus) {
    if (!newStatus) return;
    
    if (!await customConfirm(`Changer le statut de cet utilisateur en "${getStatusInfo(newStatus)}" ?`)) {
        return;
    }
    
    try {
        const res = await fetch(`${API_URL}/api/users/${userId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ status: newStatus })
        });
        
        if (res.ok) {
            await loadUsers();
            toastSuccess('Statut modifié', `L'utilisateur a été mis à jour.`);
        }
    } catch (e) {
        console.error(e);
        toastError('Erreur', 'Impossible de modifier le statut.');
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
   SYSTÈME IMPORT/EXPORT JSON
============================================= */

let currentImportType = null; // 'rules', 'legal', 'illegal'

// EXPORT JSON
function exportJSON(type) {
    if (!currentUser?.isAdmin) return;
    
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
    
    // Créer le fichier JSON
    const jsonString = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Télécharger
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toastSuccess('Export réussi', `${filename} téléchargé avec succès !`);
}

// OUVRIR MODAL IMPORT
function openImportModal(type) {
    if (!currentUser?.isAdmin) return;
    
    currentImportType = type;
    document.getElementById('importJSONInput').value = '';
    document.getElementById('importPreview').style.display = 'none';
    document.getElementById('modalImportJSON').classList.remove('hidden');
    
    // Mettre à jour le titre selon le type
    const titles = {
        'rules': 'Règlement',
        'legal': 'Entreprises',
        'illegal': 'Groupes Illégaux'
    };
    
    document.querySelector('#modalImportJSON .import-subtitle strong').textContent = titles[type];
}

// FERMER MODAL IMPORT
function closeImportModal() {
    document.getElementById('modalImportJSON').classList.add('hidden');
    currentImportType = null;
}

// DRAG & DROP
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

// PRÉVISUALISATION JSON
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

// CONFIRMER IMPORT
async function confirmImportJSON() {
    const jsonString = document.getElementById('importJSONInput').value.trim();
    
    if (!jsonString) {
        toastError('Erreur', 'Aucune donnée à importer');
        return;
    }
    
    try {
        const parsed = JSON.parse(jsonString);
        
        // Validation selon le type
        if (currentImportType === 'rules' && typeof parsed !== 'object') {
            throw new Error('Le JSON doit être un objet pour le règlement');
        }
        if ((currentImportType === 'legal' || currentImportType === 'illegal') && !Array.isArray(parsed)) {
            throw new Error('Le JSON doit être un tableau pour les factions');
        }
        
        // Confirmation
        if (!await customConfirm('⚠️ Remplacer toutes les données actuelles par ce JSON ?')) {
            return;
        }
        
        // Mise à jour des données
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
   SYSTÈME FAQ
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
    
    // Filtrer les questions
    let filteredFAQ = allFAQ;
    
    if (currentFAQFilter === 'pending') {
        filteredFAQ = allFAQ.filter(q => q.status === 'pending');
    } else if (currentFAQFilter === 'answered') {
        filteredFAQ = allFAQ.filter(q => q.status === 'answered');
    }
    
    // Recherche
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
    
    // Trier par date (plus récentes en premier)
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
        
        let answeredInfo = '';
        if (faqItem.status === 'answered' && faqItem.answeredBy) {
            const answeredDate = new Date(faqItem.answeredAt).toLocaleString('fr-FR', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            answeredInfo = `
                <div class="faq-answer">
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
        
        const canEdit = currentUser?.isEditor || currentUser?.isAdmin;
        const showUserId = canEdit;
        
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
        } else if (faqItem.status === 'answered' && currentUser?.isAdmin) {
            actions = `
                <div class="faq-actions">
                    <button class="btn btn-danger btn-sm" onclick="deleteFAQQuestion('${faqItem.id}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `;
        }
        
        card.innerHTML = `
            <div class="faq-question-header">
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
            </div>
            
            <div class="faq-question-text">${faqItem.question}</div>
            
            ${answeredInfo}
            ${actions}
        `;
        
        container.appendChild(card);
    });
}

function filterFAQ(filter) {
    currentFAQFilter = filter;
    
    // Mettre à jour les boutons actifs
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
        if (confirm('Vous devez être connecté pour poser une question. Se connecter maintenant ?')) {
            window.location.href = `${API_URL}/auth/discord`;
        }
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

/* --- INIT --- */
init();
