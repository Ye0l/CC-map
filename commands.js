import { SlashCommandBuilder } from 'discord.js';
import { getCurrentRotation, generateRotationSeed, getNextMapSchedules, maps } from './mapRotation.js';
import { zodiacSigns, getDailyHoroscope, getDailyJobRecommendation } from './horoscope.js';
import db from './db.js';

/**
 * 명령어 정의 목록
 */
const commands = [
    {
        data: new SlashCommandBuilder()
            .setName('지금')
            .setDescription('현재 활성화된 맵 정보를 보여줍니다.'),
        async execute(interaction) {
            const rotation = getCurrentRotation();
            await interaction.reply(formatRotationMessage(rotation));
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('now')
            .setDescription('Shows the currently active map information.'),
        async execute(interaction) {
            const rotation = getCurrentRotation();
            await interaction.reply(formatRotationMessage(rotation));
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('로테이션')
            .setDescription('향후 맵 로테이션 일정을 보여줍니다.')
            .addIntegerOption(option =>
                option.setName('개수')
                    .setDescription('표시할 로테이션 개수 (최대 10개)')
                    .setAutocomplete(true)
            ),
        async execute(interaction) {
            const count = interaction.options.getInteger('개수') || 5;
            const seed = generateRotationSeed(Date.now(), Math.min(count, 10));

            const response = [
                `**📅 향후 ${seed.length}개 로테이션 일정**`,
                ...seed.map((item, i) => `${i + 1}. [${item.time.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}] **:${item.map.emote}: ${item.map.name}**`)
            ].join('\n');

            await interaction.reply(response);
        },
        async autocomplete(interaction) {
            const focusedValue = interaction.options.getFocused();
            const choices = ['3', '5', '7', '10'];
            const filtered = choices.filter(choice => choice.startsWith(focusedValue.toString()));
            await interaction.respond(
                filtered.map(choice => ({ name: `${choice}개 보기`, value: parseInt(choice) }))
            );
        }
    },
    // /언제 명령어
    {
        data: new SlashCommandBuilder()
            .setName('언제')
            .setDescription('특정 맵이 언제 나오는지 알려줍니다.')
            .addStringOption(option =>
                option.setName('맵이름')
                    .setDescription('검색할 맵 이름')
                    .setRequired(true)
                    .setAutocomplete(true)
            )
            .addIntegerOption(option =>
                option.setName('개수')
                    .setDescription('표시할 시간표 개수')
                    .setRequired(false)
            ),
        async execute(interaction) {
            const mapName = interaction.options.getString('맵이름');
            const count = interaction.options.getInteger('개수') || 1;
            const schedules = getNextMapSchedules(mapName, count);

            if (schedules.length === 0) {
                await interaction.reply({ content: `❌ '${mapName}' 맵을 찾을 수 없습니다.`, ephemeral: true });
                return;
            }

            const timeOption = { hour: '2-digit', minute: '2-digit' };
            const mapObj = maps.find(m => m.name === mapName);
            const mapDisplay = mapObj ? `:${mapObj.emote}: ${mapName}` : mapName;

            const response = [
                `**${mapDisplay} 향후 일정**`,
                ...schedules.map((item, i) => {
                    const month = item.startTime.getMonth() + 1;
                    const day = item.startTime.getDate();
                    const weekday = item.startTime.toLocaleDateString('ko-KR', { weekday: 'short' });
                    const startTime = item.startTime.toLocaleTimeString('ko-KR', timeOption);
                    const startStr = `${month}/${day} (${weekday}) ${startTime}`;

                    const endStr = item.endTime.toLocaleTimeString('ko-KR', timeOption);

                    const status = item.isCurrent ? ' **(현재 진행 중! 🔥)**' : '';
                    return `- ${startStr} ~ ${endStr}${status}`;
                })
            ].join('\n');

            await interaction.reply(response);
        },
        async autocomplete(interaction) {
            const focusedValue = interaction.options.getFocused();
            const choices = maps.map(m => m.name);
            const filtered = choices.filter(choice => choice.includes(focusedValue));
            await interaction.respond(
                filtered.slice(0, 25).map(choice => ({ name: choice, value: choice }))
            );
        }
    },
    // /운세 명령어
    {
        data: new SlashCommandBuilder()
            .setName('운세')
            .setDescription('오늘의 별자리 운세를 확인합니다.')
            .addStringOption(option =>
                option.setName('별자리')
                    .setDescription('운세를 확인할 별자리')
                    .setRequired(true)
                    .setAutocomplete(true)
            ),
        async execute(interaction) {
            await interaction.deferReply(); // API 호출 시간이 걸릴 수 있으므로 defer

            const sign = interaction.options.getString('별자리');
            const validSigns = Object.values(zodiacSigns);

            if (!validSigns.includes(sign)) {
                await interaction.editReply(`❌ 올바르지 않은 별자리입니다. 다음 중에서 선택해주세요!\n${validSigns.join(', ')}`);
                return;
            }

            try {
                const contentRaw = await getDailyHoroscope(sign);

                const parts = contentRaw.split('|');
                const formattedHoroscope = parts[0].split('.').map(s => s.trim()).filter(s => s).join('.\n');
                let message = `**🌠 [${sign}] 오늘의 운세**\n\n${formattedHoroscope}`;

                if (parts.length >= 3) {
                    const recommendedMapName = parts[1].trim();
                    const mapObj = maps.find(m => m.name === recommendedMapName);
                    const mapDisplay = mapObj ? `:${mapObj.emote}: ${recommendedMapName}` : recommendedMapName;

                    message += `\n\n🗺️ **추천 맵**: ${mapDisplay}`;
                    message += `\n⚔️ **추천 직업**: ${parts[2]}`;
                }

                await interaction.editReply(message);
            } catch (error) {
                console.error(error);
                await interaction.editReply('운세를 가져오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
            }
        },
        async autocomplete(interaction) {
            const focusedValue = interaction.options.getFocused();
            const choices = Object.values(zodiacSigns);
            const filtered = choices.filter(choice => choice.includes(focusedValue));
            await interaction.respond(
                filtered.map(choice => ({ name: choice, value: choice }))
            );
        }
    },
    // /직업추천 명령어
    {
        data: new SlashCommandBuilder()
            .setName('직업추천')
            .setDescription('무작위로 직업 하나를 추천해줍니다.'),
        async execute(interaction) {
            await interaction.deferReply();
            try {
                const recommendation = await getDailyJobRecommendation();
                await interaction.editReply(`🎲 오늘의 추천 직업은 **[${recommendation.job_name}]** 입니다!\n\n${recommendation.comment}`);
            } catch (error) {
                console.error(error);
                await interaction.editReply({ content: '직업을 추천하는 중 오류가 발생했습니다.', ephemeral: true });
            }
        }
    }
];

function formatRotationMessage(rotation) {
    const { current, next } = rotation;
    const timeOption = { hour: '2-digit', minute: '2-digit' };
    return [
        `**[현재 맵]** :${current.map.emote}: ${current.map.name}`,
        `🕒 종료 시간: ${current.endTime.toLocaleTimeString('ko-KR', timeOption)}`,
        '',
        `**[다음 맵]** :${next.map.emote}: ${next.map.name}`,
        `🕒 시작 시간: ${next.startTime.toLocaleTimeString('ko-KR', timeOption)}`
    ].join('\n');
}

export default commands;
