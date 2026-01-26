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
            .setName('now')
            .setNameLocalizations({ 'ko': '지금' })
            .setDescription('Shows the currently active map information.')
            .setDescriptionLocalizations({ 'ko': '현재 활성화된 맵 정보를 보여줍니다.' }),
        async execute(interaction) {
            const rotation = getCurrentRotation();
            await interaction.reply(formatRotationMessage(rotation));
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('rotation')
            .setNameLocalizations({ 'ko': '로테이션' })
            .setDescription('Shows future map rotation schedule.')
            .setDescriptionLocalizations({ 'ko': '향후 맵 로테이션 일정을 보여줍니다.' })
            .addIntegerOption(option =>
                option.setName('count')
                    .setNameLocalizations({ 'ko': '개수' })
                    .setDescription('Number of rotations to show (max 10)')
                    .setDescriptionLocalizations({ 'ko': '표시할 로테이션 개수 (최대 10개)' })
                    .setAutocomplete(true)
            ),
        async execute(interaction) {
            const count = interaction.options.getInteger('count') || 5;
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
    {
        data: new SlashCommandBuilder()
            .setName('when')
            .setNameLocalizations({ 'ko': '언제' })
            .setDescription('Check when a specific map is coming up.')
            .setDescriptionLocalizations({ 'ko': '특정 맵이 언제 나오는지 알려줍니다.' })
            .addStringOption(option =>
                option.setName('map_name')
                    .setNameLocalizations({ 'ko': '맵이름' })
                    .setDescription('Name of the map to search')
                    .setDescriptionLocalizations({ 'ko': '검색할 맵 이름' })
                    .setRequired(true)
                    .setAutocomplete(true)
            )
            .addIntegerOption(option =>
                option.setName('count')
                    .setNameLocalizations({ 'ko': '개수' })
                    .setDescription('Number of schedules to show')
                    .setDescriptionLocalizations({ 'ko': '표시할 시간표 개수' })
                    .setRequired(false)
            ),
        async execute(interaction) {
            const mapName = interaction.options.getString('map_name');
            const count = interaction.options.getInteger('count') || 1;
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
    {
        data: new SlashCommandBuilder()
            .setName('horoscope')
            .setNameLocalizations({ 'ko': '운세' })
            .setDescription('Check your daily horoscope.')
            .setDescriptionLocalizations({ 'ko': '오늘의 별자리 운세를 확인합니다.' })
            .addStringOption(option =>
                option.setName('sign')
                    .setNameLocalizations({ 'ko': '별자리' })
                    .setDescription('Zodiac sign to check')
                    .setDescriptionLocalizations({ 'ko': '운세를 확인할 별자리' })
                    .setRequired(true)
                    .setAutocomplete(true)
            ),
        async execute(interaction) {
            await interaction.deferReply();

            const sign = interaction.options.getString('sign');
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
    {
        data: new SlashCommandBuilder()
            .setName('recommend')
            .setNameLocalizations({ 'ko': '직업추천' })
            .setDescription('Get a random job recommendation.')
            .setDescriptionLocalizations({ 'ko': '무작위로 직업을 추천해줍니다.' })
            .addIntegerOption(option =>
                option.setName('count')
                    .setNameLocalizations({ 'ko': '개수' })
                    .setDescription('Number of jobs to recommend (1~10)')
                    .setDescriptionLocalizations({ 'ko': '추천받을 직업 개수 (1~10)' })
                    .setRequired(false)
                    .setMinValue(1)
                    .setMaxValue(10)
            ),
        async execute(interaction) {
            await interaction.deferReply();
            try {
                const countOption = interaction.options.getInteger('count');
                const isSimpleMode = countOption !== null;
                const count = countOption || 1;

                const results = await getDailyJobRecommendation(count);
                const recommendations = Array.isArray(results) ? results : [results];

                const jobEmotes = {
                    '나이트': '<:PLD:1465245862363136145>', '전사': '<:WAR:1465245785934528574>', '암흑기사': '<:DRK:1465245768989540467>', '건브레이커': '<:GNB:1465245757803335680>',
                    '백마도사': '<:WHM:1465245779349213255>', '학자': '<:SCH:1465245859498164276>', '점성술사': '<:AST:1465245864770666609>', '현자': '<:SGE:1465245752090689556>',
                    '몽크': '<:MNK:1465245792070668363>', '용기사': '<:DRG:1465245799049986161>', '닌자': '<:NIN:1465245773418598495>', '사무라이': '<:SAM:1465245763616636938>', '리퍼': '<:RPR:1465245753986253015>', '바이퍼': '<:VPR:1465245750509174818>',
                    '음유시인': '<:BRD:1465245746642030613>', '기공사': '<:MCH:1465245767047315629>', '무도가': '<:DNC:1465245755613777980>',
                    '흑마도사': '<:BLM:1465245782004334666>', '소환사': '<:SMN:1465245774890799290>', '적마도사': '<:RDM:1465245765373923536>', '픽토맨서': '<:PCT:1465245748588187825>'
                };

                if (isSimpleMode) {
                    const simpleList = recommendations.map(r => {
                        const emote = jobEmotes[r.job_name] || '';
                        return `- ${emote}**${r.job_name}**`;
                    }).join('\n');
                    await interaction.editReply(`🎲 추천 직업 연속가챠\n${simpleList}`);
                } else {
                    const r = recommendations[0];
                    const emote = jobEmotes[r.job_name] || '';
                    await interaction.editReply(`🎲 오늘의 추천 직업은 ${emote}**${r.job_name}** 입니다!\n\n${r.comment}`);
                }
            } catch (error) {
                console.error(error);
                await interaction.editReply({ content: '직업을 추천하는 중 오류가 발생했습니다.', ephemeral: true });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('help')
            .setNameLocalizations({ 'ko': '도움말' })
            .setDescription('Shows list of available commands.')
            .setDescriptionLocalizations({ 'ko': '사용 가능한 명령어 목록을 보여줍니다.' }),
        async execute(interaction) {
            const helpMessage = `
**📖 명령어 도움말 / Command Help**

**/now (지금)**
- 현재 진행 중인 크리스탈 컨플릭트 맵 정보를 보여줍니다.

**/rotation (로테이션)**
- 향후 맵 로테이션 일정을 확인합니다.
- 옵션: \`count (개수)\` - 표시할 일정 개수

**/when (언제)**
- 특정 맵이 언제 나오는지 검색합니다.
- 옵션: \`map_name (맵이름)\`, \`count (개수)\`

**/horoscope (운세)**
- 오늘의 별자리 운세를 확인합니다. (FF14 테마)
- 옵션: \`sign (별자리)\`

**/recommend (직업추천)**
- 무작위로 PvP 직업을 추천해줍니다.
- 옵션: \`count (개수)\` - 간략하게 여러 직업 추천

**/help (도움말)**
- 이 도움말을 표시합니다.
            `.trim();
            await interaction.reply({ content: helpMessage, ephemeral: true });
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
