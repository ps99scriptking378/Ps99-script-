require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const nsfw = require('nsfwjs');
const tf = require('@tensorflow/tfjs-node');
const axios = require('axios');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildBans 
    ]
});

let model;
const userWarnings = new Map(); 

async function loadModel() {
    console.log("Loading filter model...");
    model = await nsfw.load();
    console.log("Model loaded successfully!");
}

client.once('ready', async () => {
    await loadModel();
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    if (message.attachments.size > 0) {
        for (const [id, attachment] of message.attachments) {
            const url = attachment.url;
            const extension = url.split('.').pop().toLowerCase();

            if (['jpg', 'jpeg', 'png', 'webp'].includes(extension)) {
                try {
                    const response = await axios.get(url, { responseType: 'arraybuffer' });
                    const imageBuffer = Buffer.from(response.data);

                    const imageTensor = tf.node.decodeImage(imageBuffer, 3);
                    const predictions = await model.classify(imageTensor);
                    imageTensor.dispose(); 

                    for (const prediction of predictions) {
                        if (
                            (prediction.className === 'Hentai' || prediction.className === 'Porn' || prediction.className === 'Sexy') && 
                            prediction.probability > 0.70 
                        ) {
                            await message.delete().catch(console.error);

                            const userId = message.author.id;
                            const currentWarnings = (userWarnings.get(userId) || 0) + 1;
                            userWarnings.set(userId, currentWarnings);

                            if (currentWarnings > 2) {
                                try {
                                    await message.guild.members.ban(userId, {
                                        reason: 'Exceeded maximum warnings for posting restricted content.',
                                        deleteMessageSeconds: 604800 
                                    });

                                    await message.channel.send(`🚨 **${message.author.tag}** has been permanently banned and their message history has been cleared after receiving 3 warnings.`);
                                    userWarnings.delete(userId);
                                } catch (banError) {
                                    console.error("Failed to ban user:", banError);
                                    message.channel.send(`❌ Failed to ban ${message.author.tag}. Make sure my role is higher than theirs.`);
                                }
                            } else {
                                const warningMsg = await message.channel.send(
                                    `⚠️ ${message.author}, that content is not allowed. Warning **${currentWarnings}/2**. You will be permanently banned on the next offense.`
                                );
                                setTimeout(() => warningMsg.delete().catch(console.error), 7000);
                            }
                            return; 
                        }
                    }
                } catch (error) {
                    console.error("Error processing image:", error);
                }
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
