require("dotenv").config();
const express = require("express");
const cors = require("cors");
const session = require("express-session");
const passport = require("passport");
console.log("=== DEBUG ENV ===");
console.log("CLIENT_ID:", process.env.DISCORD_CLIENT_ID);
console.log("CLIENT_SECRET:", process.env.DISCORD_CLIENT_SECRET ? "✅" : "❌");
console.log("CALLBACK_URL:", process.env.DISCORD_CALLBACK_URL);
console.log("=================");
const DiscordStrategy = require("passport-discord").Strategy;
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   CRÉATION DU DOSSIER DATA
========================= */
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
    console.log("📁 Dossier 'data' créé");
}

// Créer les fichiers JSON s'ils n'existent pas
const rulesPath = path.join(dataDir, 'rules.json');
const factionsPath = path.join(dataDir, 'factions.json');
const usersPath = path.join(dataDir, 'users.json');

if (!fs.existsSync(rulesPath)) {
    fs.writeFileSync(rulesPath, JSON.stringify({}, null, 2));
    console.log("📄 Fichier rules.json créé");
}

if (!fs.existsSync(factionsPath)) {
    fs.writeFileSync(factionsPath, JSON.stringify([], null, 2));
    console.log("📄 Fichier factions.json créé");
}

if (!fs.existsSync(usersPath)) {
    fs.writeFileSync(usersPath, JSON.stringify([], null, 2));
    console.log("📄 Fichier users.json créé");
}

/* =========================
   HELPERS
========================= */
const readJSON = (filename) => {
    const filePath = path.join(dataDir, filename);
    if (!fs.existsSync(filePath)) {
        console.log(`⚠️ ${filename} n'existe pas, création...`);
        const defaultData = filename === 'rules.json' ? {} : [];
        writeJSON(filename, defaultData);
        return defaultData;
    }
    
    try {
        const content = fs.readFileSync(filePath, 'utf-8').trim();
        if (!content) {
            console.log(`⚠️ ${filename} est vide, initialisation...`);
            const defaultData = filename === 'rules.json' ? {} : [];
            writeJSON(filename, defaultData);
            return defaultData;
        }
        return JSON.parse(content);
    } catch (error) {
        console.error(`❌ Erreur lecture ${filename}:`, error.message);
        const defaultData = filename === 'rules.json' ? {} : [];
        writeJSON(filename, defaultData);
        return defaultData;
    }
};

const writeJSON = (filename, data) => {
    fs.writeFileSync(path.join(dataDir, filename), JSON.stringify(data, null, 2));
};

/* =========================
   MIDDLEWARE
========================= */
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.set('trust proxy', 1);

/* =========================
   SESSION & PASSPORT
========================= */
app.use(session({
    secret: process.env.SESSION_SECRET || "secret-dev-smallcity-2024",
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: true, // OBLIGATOIRE en HTTPS
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    }
}));


app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// Vérification des variables d'environnement
const requiredEnvVars = [
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET', 
    'DISCORD_CALLBACK_URL',
    'ADMIN_DISCORD_ID'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.error('❌ ERREUR : Variables d\'environnement manquantes :');
    missingVars.forEach(varName => {
        console.error(`   - ${varName}`);
    });
    console.error('\n📋 Variables actuellement définies :');
    console.error(`   DISCORD_CLIENT_ID: ${process.env.DISCORD_CLIENT_ID ? '✅ Définie' : '❌ Manquante'}`);
    console.error(`   DISCORD_CLIENT_SECRET: ${process.env.DISCORD_CLIENT_SECRET ? '✅ Définie' : '❌ Manquante'}`);
    console.error(`   DISCORD_CALLBACK_URL: ${process.env.DISCORD_CALLBACK_URL ? '✅ Définie' : '❌ Manquante'}`);
    console.error(`   ADMIN_DISCORD_ID: ${process.env.ADMIN_DISCORD_ID ? '✅ Définie' : '❌ Manquante'}`);
    process.exit(1);
}

passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL,
    scope: ["identify"]
}, async (accessToken, refreshToken, profile, done) => {
    try {
        // Enregistrer/mettre à jour l'utilisateur
        let users = readJSON('users.json');
        let user = users.find(u => u.id === profile.id);
        
        if (!user) {
            // Nouvel utilisateur
            user = {
                id: profile.id,
                username: profile.username,
                avatar: `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`,
                status: profile.id === process.env.ADMIN_DISCORD_ID ? 'admin' : 'pending',
                connectedAt: new Date().toISOString()
            };
            users.push(user);
            console.log('✅ Nouvel utilisateur créé:', user.username);
        } else {
            // Mettre à jour
            user.username = profile.username;
            user.avatar = `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`;
            user.connectedAt = new Date().toISOString();
            console.log('✅ Utilisateur mis à jour:', user.username);
        }
        
        writeJSON('users.json', users);
        
        // Vérifier le statut
        if (user.status === 'refused') {
          console.log('🚫 Utilisateur refusé:', user.username);
          return done(null, false);
        }
        
        console.log('✅ Connexion réussie:', user.username, 'Status:', user.status);
        return done(null, user);
    } catch (error) {
        console.error('❌ Erreur lors de l\'authentification:', error);
        return done(error);
    }
}));

/* =========================
   AUTH ROUTES
========================= */
app.get("/auth/discord", passport.authenticate("discord"));

app.get("/auth/discord/callback", 
    passport.authenticate("discord", { failureRedirect: "/" }),
    (req, res) => {
        // Vérifier si l'utilisateur est bloqué
        if (!req.user) {
            return res.send(`
                <html>
                <head><title>Accès refusé</title></head>
                <body style="background:#0a0a0c; color:white; font-family:Arial; display:flex; align-items:center; justify-content:center; height:100vh; text-align:center;">
                    <div>
                        <h1 style="color:#ff4757;">🚫 Accès Refusé</h1>
                        <p>Votre compte a été refusé ou restreint.</p>
                        <p>Contactez un administrateur pour plus d'informations.</p>
                    </div>
                </body>
                </html>
            `);
        }
        res.redirect("/");
    }
);

app.get("/auth/logout", (req, res) => {
    req.logout(err => {
        if (err) return next(err);
        res.redirect("/");
    });
});

app.get("/auth/user", (req, res) => {
    if (!req.user) return res.json(null);
    
    res.json({
        id: req.user.id,
        username: req.user.username,
        avatar: req.user.avatar,
        status: req.user.status,
        isAdmin: req.user.status === 'admin',
        isEditor: req.user.status === 'admin' || req.user.status === 'approved'
    });
});

/* =========================
   GESTION UTILISATEURS
========================= */
app.get('/api/users', (req, res) => {
    if (!req.user || req.user.status !== 'admin') {
        return res.status(403).json({ error: 'Accès refusé' });
    }
    
    const users = readJSON('users.json');
    res.json(users);
});

app.post('/api/users/:id/status', (req, res) => {
    if (!req.user || req.user.status !== 'admin') {
        return res.status(403).json({ error: 'Accès refusé' });
    }
    
    const { id } = req.params;
    const { status } = req.body;
    
    const users = readJSON('users.json');
    const user = users.find(u => u.id === id);
    
    if (user) {
        user.status = status;
        writeJSON('users.json', users);
        res.json({ success: true, user });
    } else {
        res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
});

/* =========================
   DATA HELPERS
========================= */
const getPath = (file) => path.join(__dirname, `data/${file}.json`);

const sendFile = (res, file) => {
    try { 
        const filePath = getPath(file);
        if (!fs.existsSync(filePath)) {
            console.log(`⚠️ Fichier ${file}.json n'existe pas, retour vide`);
            return res.json(file === 'rules' ? {} : []);
        }
        const content = fs.readFileSync(filePath, "utf-8");
        const data = JSON.parse(content);
        console.log(`✅ ${file}.json chargé`);
        res.json(data);
    } catch (e) {
        console.error(`❌ Erreur lecture ${file}.json:`, e);
        res.status(500).json({ error: "Erreur lecture fichier" });
    }
};

const saveFile = (req, res, file) => {
    // ✅ CORRECTION : Autoriser admin ET approved (éditeurs)
    const isEditor = req.user && (req.user.status === 'admin' || req.user.status === 'approved');
    
    if (!isEditor) {
        console.log("🚫 Accès refusé - pas éditeur");
        return res.sendStatus(403);
    }
    try {
        const filePath = getPath(file);
        fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2));
        console.log(`💾 ${file}.json sauvegardé par ${req.user.username}`);
        res.sendStatus(200);
    } catch (e) {
        console.error(`❌ Erreur sauvegarde ${file}.json:`, e);
        res.status(500).json({ error: "Erreur sauvegarde" });
    }
};

/* =========================
   DISCORD LINKS MANAGEMENT
========================= */
const discordLinksPath = path.join(dataDir, 'discord-links.json');

// Créer le fichier s'il n'existe pas
if (!fs.existsSync(discordLinksPath)) {
    fs.writeFileSync(discordLinksPath, JSON.stringify({
        legal: "https://discord.gg/legal-default",
        illegal: "https://discord.gg/illegal-default"
    }, null, 2));
    console.log("📄 Fichier discord-links.json créé");
}

app.get("/api/discord-links", (req, res) => sendFile(res, "discord-links"));

app.post("/api/discord-links", (req, res) => {
    if (!req.user || req.user.status !== 'admin') {
        return res.status(403).json({ error: 'Accès refusé' });
    }
    saveFile(req, res, "discord-links");
});

/* =========================
   API ROUTES
========================= */
app.get("/api/rules", (req, res) => sendFile(res, "rules"));
app.post("/api/rules", (req, res) => saveFile(req, res, "rules"));

app.get("/api/factions", (req, res) => sendFile(res, "factions"));
app.post("/api/factions", (req, res) => saveFile(req, res, "factions"));

/* =========================
   FAQ SYSTEM
========================= */
const faqPath = path.join(dataDir, 'faq.json');

// Créer le fichier s'il n'existe pas
if (!fs.existsSync(faqPath)) {
    fs.writeFileSync(faqPath, JSON.stringify([], null, 2));
    console.log("📄 Fichier faq.json créé");
}

// Récupérer toutes les questions
app.get("/api/faq", (req, res) => {
    try {
        const faq = readJSON('faq.json');
        // Les utilisateurs normaux ne voient que les questions approuvées
        if (!req.user || (req.user.status !== 'admin' && req.user.status !== 'approved')) {
            const approvedFaq = faq.filter(q => q.status === 'answered');
            return res.json(approvedFaq);
        }
        res.json(faq);
    } catch(e) {
        console.error("Erreur FAQ:", e);
        res.json([]);
    }
});

// Poster une nouvelle question
app.post("/api/faq/question", (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Connexion requise' });
    }
    
    const { question } = req.body;
    if (!question || question.trim() === '') {
        return res.status(400).json({ error: 'Question vide' });
    }
    
    const faq = readJSON('faq.json');
    const newQuestion = {
        id: Date.now().toString(),
        question: question.trim(),
        answer: '',
        status: 'pending', // pending, answered
        askedBy: {
            id: req.user.id,
            username: req.user.username,
            avatar: req.user.avatar
        },
        askedAt: new Date().toISOString(),
        answeredBy: null,
        answeredAt: null
    };
    
    faq.push(newQuestion);
    writeJSON('faq.json', faq);
    
    console.log(`❓ Nouvelle question par ${req.user.username}`);
    res.json({ success: true, question: newQuestion });
});

// Répondre à une question (admin/éditeur uniquement)
app.post("/api/faq/:id/answer", (req, res) => {
    if (!req.user || (req.user.status !== 'admin' && req.user.status !== 'approved')) {
        return res.status(403).json({ error: 'Accès refusé' });
    }
    
    const { id } = req.params;
    const { answer } = req.body;
    
    if (!answer || answer.trim() === '') {
        return res.status(400).json({ error: 'Réponse vide' });
    }
    
    const faq = readJSON('faq.json');
    const question = faq.find(q => q.id === id);
    
    if (!question) {
        return res.status(404).json({ error: 'Question non trouvée' });
    }
    
    question.answer = answer.trim();
    question.status = 'answered';
    question.answeredBy = {
        id: req.user.id,
        username: req.user.username,
        avatar: req.user.avatar
    };
    question.answeredAt = new Date().toISOString();
    
    writeJSON('faq.json', faq);
    
    console.log(`✅ Question répondue par ${req.user.username}`);
    res.json({ success: true, question });
});

// Supprimer une question (admin uniquement)
app.delete("/api/faq/:id", (req, res) => {
    if (!req.user || req.user.status !== 'admin') {
        return res.status(403).json({ error: 'Accès refusé' });
    }
    
    const { id } = req.params;
    let faq = readJSON('faq.json');
    faq = faq.filter(q => q.id !== id);
    writeJSON('faq.json', faq);
    
    res.json({ success: true });
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║   ✅ SmallCity RP - Serveur lancé     ║
║   📡 http://localhost:${PORT}            ║
║   📁 Données: ${dataDir}      ║
╚════════════════════════════════════════╝
    `);
});