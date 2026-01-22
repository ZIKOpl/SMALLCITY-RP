require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ]
});

client.once('ready', () => {
    console.log(`✅ Bot Newsletter connecté : ${client.user.tag}`);
});

// Fonction pour envoyer un DM
async function sendNewsletterDM(discordUsername, message) {
    try {
        const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
        
        // Chercher le membre par username (ex: "username#1234")
        const members = await guild.members.fetch();
        const member = members.find(m => 
            m.user.tag.toLowerCase() === discordUsername.toLowerCase() ||
            m.user.username.toLowerCase() === discordUsername.toLowerCase()
        );
        
        if (!member) {
            console.log(`❌ Utilisateur non trouvé : ${discordUsername}`);
            return { success: false, error: 'Utilisateur non trouvé sur le serveur' };
        }
        
        // Envoyer le DM
        await member.send({
            embeds: [{
                title: '🚀 SmallCity RP - Serveur Ouvert !',
                description: message,
                color: 0xFFD700,
                thumbnail: {
                    url: 'https://cdn.discordapp.com/avatars/1454590378161344736/de5e9ab35d82fac2e824808f5aa681b7.webp?size=1024' // Remplacez par votre logo
                },
                fields: [
                    {
                        name: '🎮 Rejoindre le serveur',
                        value: 'Cliquez sur le bouton ci-dessous ou utilisez : `fivem://connect/votre_ip:port`'
                    }
                ],
                footer: {
                    text: 'SmallCity RP © 2025',
                    icon_url: 'https://cdn.discordapp.com/avatars/1454590378161344736/de5e9ab35d82fac2e824808f5aa681b7.webp?size=1024'
                },
                timestamp: new Date()
            }]
        });
        
        console.log(`✅ Newsletter envoyée à ${member.user.tag}`);
        return { success: true, sentTo: member.user.tag };
        
    } catch (error) {
        console.error(`❌ Erreur envoi DM à ${discordUsername}:`, error.message);
        return { success: false, error: error.message };
    }
}

// Exporter le client et la fonction
module.exports = { client, sendNewsletterDM };

// Connexion du bot
if (process.env.DISCORD_BOT_TOKEN) {
    client.login(process.env.DISCORD_BOT_TOKEN);
} else {
    console.error('❌ DISCORD_BOT_TOKEN manquant dans .env');
}