require("dotenv").config();
const express = require("express");
const cors = require("cors");
const session = require("express-session");
const passport = require("passport");
const DiscordStrategy = require("passport-discord").Strategy;
const fs = require("fs");
const path = require("path");
const { client, sendNewsletterDM } = require('./bot');

const app = express();
const PORT = 3000;

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

/* =========================
   SESSION & PASSPORT
========================= */
app.use(session({
    secret: process.env.SESSION_SECRET || "secret-dev-smallcity-2024",
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,
        httpOnly: true,
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
    req.logout(() => res.redirect("/"));
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
   NEWSLETTER
========================= */
app.get("/api/newsletter", (req, res) => {
    if (!req.user || req.user.status !== 'admin') {
        return res.status(403).json({ error: 'Accès refusé' });
    }
    sendFile(res, "newsletter");
});

app.post("/api/newsletter", async (req, res) => {
    try {
        const newsletterPath = path.join(dataDir, 'newsletter.json');
        let subscribers = [];
        
        if (fs.existsSync(newsletterPath)) {
            subscribers = JSON.parse(fs.readFileSync(newsletterPath, 'utf-8'));
        }
        
        // Vérifier si déjà inscrit
        const exists = subscribers.find(s => s.discord === req.body.discord);
        if (exists) {
            return res.status(409).json({ error: 'Déjà inscrit' });
        }
        
        subscribers.push(req.body);
        fs.writeFileSync(newsletterPath, JSON.stringify(subscribers, null, 2));
        console.log(`✅ Nouvelle inscription newsletter: ${req.body.discord}`);
        
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur newsletter:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// NOUVELLE ROUTE - Envoyer newsletter à tous
app.post("/api/newsletter/send", async (req, res) => {
    if (!req.user || req.user.status !== 'admin') {
        return res.status(403).json({ error: 'Accès refusé' });
    }
    
    try {
        const { message } = req.body;
        const newsletterPath = path.join(dataDir, 'newsletter.json');
        
        if (!fs.existsSync(newsletterPath)) {
            return res.status(404).json({ error: 'Aucun abonné' });
        }
        
        const subscribers = JSON.parse(fs.readFileSync(newsletterPath, 'utf-8'));
        const results = [];
        
        for (const sub of subscribers) {
            const result = await sendNewsletterDM(sub.discord, message);
            results.push({
                discord: sub.discord,
                ...result
            });
            
            // Attendre 1 seconde entre chaque envoi (éviter rate limit)
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        const successCount = results.filter(r => r.success).length;
        
        res.json({
            success: true,
            total: subscribers.length,
            sent: successCount,
            failed: subscribers.length - successCount,
            results
        });
        
    } catch (error) {
        console.error('❌ Erreur envoi newsletter:', error);
        res.status(500).json({ error: 'Erreur serveur' });
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
   API ROUTES
========================= */
app.get("/api/rules", (req, res) => sendFile(res, "rules"));
app.post("/api/rules", (req, res) => saveFile(req, res, "rules"));

app.get("/api/factions", (req, res) => sendFile(res, "factions"));
app.post("/api/factions", (req, res) => saveFile(req, res, "factions"));

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