import { SlashCommandBuilder } from 'discord.js';
import { getCurrentRotation, generateRotationSeed, getNextMapSchedules, maps } from './mapRotation.js';

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
                ...seed.map((item, i) => `${i + 1}. [${item.time.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}] **${item.map}**`)
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
            ),
        async execute(interaction) {
            const mapName = interaction.options.getString('맵이름');
            const schedules = getNextMapSchedules(mapName, 5);

            if (schedules.length === 0) {
                await interaction.reply({ content: `❌ '${mapName}' 맵을 찾을 수 없습니다.`, ephemeral: true });
                return;
            }

            const dateTimeOption = { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' };
            const timeOption = { hour: '2-digit', minute: '2-digit' };

            const response = [
                `**🗺️ '${mapName}' 향후 일정**`,
                ...schedules.map((item, i) => {
                    // 시작 시간은 날짜 포함
                    const startStr = item.startTime.toLocaleString('ko-KR', dateTimeOption);
                    // 종료 시간은 시간만 표시 (같은 날일 확률이 높지만, 날짜가 넘어갈 수도 있음. 그래도 간결함을 위해 시간만 혹은 필요시 날짜 포함? 
                    // 보통 시작 날짜만 알면 충분하므로 종료는 시간만 표시하되, 사용자 요청이 "날짜랑 요일"이므로 시작 시간에 집중.
                    // 종료 시간까지 날짜를 넣으면 너무 길어짐. 시작 시간에만 넣는 것이 일반적 패턴.
                    const endStr = item.endTime.toLocaleTimeString('ko-KR', timeOption);

                    const status = item.isCurrent ? ' **(현재 진행 중! 🔥)**' : '';
                    return `- ${startStr} ~ ${endStr}${status}`;
                })
            ].join('\n');

            await interaction.reply(response);
        },
        async autocomplete(interaction) {
            const focusedValue = interaction.options.getFocused();
            const choices = maps; // mapRotation.js에서 가져온 전체 맵 리스트
            const filtered = choices.filter(choice => choice.includes(focusedValue));
            // 최대 25개까지만 반환 가능
            await interaction.respond(
                filtered.slice(0, 25).map(choice => ({ name: choice, value: choice }))
            );
        }
    }
];

function formatRotationMessage(rotation) {
    const { current, next } = rotation;
    const timeOption = { hour: '2-digit', minute: '2-digit' };
    return [
        `**[현재 맵]** ${current.map}`,
        `🕒 종료 시간: ${current.endTime.toLocaleTimeString('ko-KR', timeOption)}`,
        '',
        `**[다음 맵]** ${next.map}`,
        `🕒 시작 시간: ${next.startTime.toLocaleTimeString('ko-KR', timeOption)}`
    ].join('\n');
}

export default commands;
