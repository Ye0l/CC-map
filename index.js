import { Client, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import commands from './commands.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// config.json 로드 (Import Attributes 대신 fs 사용)
const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const { token } = config;

// 클라이언트 객체 생성
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

// 봇 로그인 직후 슬래시 명령어 등록
client.once(Events.ClientReady, async readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(token);
    try {
        console.log('Started refreshing application (/) commands.');
        // 글로벌 커맨드로 등록 (업데이트에 시간 소요될 수 있음)
        await rest.put(
            Routes.applicationCommands(readyClient.user.id),
            { body: commands.map(cmd => cmd.data.toJSON()) },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('슬래시 명령어 등록 중 오류 발생:', error);
    }
});

// 상호작용 처리
client.on(Events.InteractionCreate, async interaction => {
    console.log(`[Interaction] type: ${interaction.type}, commandName: ${interaction.commandName}`); // 디버깅용 로그

    // 슬래시 명령어 실행
    if (interaction.isChatInputCommand()) {
        const command = commands.find(cmd => cmd.data.name === interaction.commandName);
        if (!command) {
            console.error(`명령어를 찾을 수 없음: ${interaction.commandName}`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '명령어 실행 중 오류가 발생했습니다.', ephemeral: true });
            }
        }
    }

    // 자동완성 처리
    if (interaction.isAutocomplete()) {
        const command = commands.find(cmd => cmd.data.name === interaction.commandName);
        if (!command || !command.autocomplete) return;

        try {
            await command.autocomplete(interaction);
        } catch (error) {
            console.error('자동완성 처리 중 오류 발생:', error);
        }
    }
});

// 봇 로그인
client.login(token);