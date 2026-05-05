import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getCurrentRotation, generateRotationSeed, getNextMapSchedules, maps } from './mapRotation.js';
import { zodiacSigns, getDailyHoroscope, getDailyJobRecommendation } from './horoscope.js';
import db from './db.js';
import fs from 'fs';
import path from 'path';
import { AttachmentBuilder } from 'discord.js';
import mapList from './map_list.json' with { type: "json" };
import config from './config.json' with { type: "json" };

const CC_RANKING_API_BASE = (config.ccRankingApiBase || 'https://cc-ranking-api.casiya03.workers.dev').replace(/\/+$/, '');
const CC_RANKING_PUBLIC_SITE_BASE = (
    config.ccRankingPublicSiteBase ||
    config.ccRankingSiteBase ||
    'https://kstr.dev/cc-ranking'
).replace(/\/+$/, '');

const getMapImage = (mapName) => {
    const mapInfo = mapList.find(m => m.name === mapName);
    if (!mapInfo || !mapInfo.image) return null;

    const imagePath = path.join(process.cwd(), 'maps', mapInfo.image);
    if (fs.existsSync(imagePath)) {
        return new AttachmentBuilder(imagePath, { name: mapInfo.image });
    }
    return null;
};

const truncateText = (value, maxLength = 1024) => {
    const text = String(value ?? '');
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 3)}...`;
};

const movementIcon = (movement) => {
    if (!movement) return '-';
    if (movement.direction === 'up') return `▲ ${movement.text}`;
    if (movement.direction === 'down') return `▼ ${movement.text}`;
    if (movement.direction === 'new') return 'NEW';
    return movement.text || '-';
};

const formatRankingEntry = (entry) => {
    const tier = entry.tier || '-';
    const points = entry.points ? ` · 평점 ${entry.points}` : '';
    const wins = Number.isInteger(entry.wins) ? ` · ${entry.wins}승` : '';
    const movement = movementIcon(entry.movement);
    return `#${entry.rank} **${entry.character_name}@${entry.server_name}**\n${tier}${points}${wins} · 변동 ${movement}`;
};

const buildRankingUrl = (pathName, params = {}) => {
    const url = new URL(pathName, CC_RANKING_API_BASE);
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, value);
        }
    }
    return url;
};

const buildCharacterDetailUrl = (data) => {
    const character = data.character || {};
    const detailUrl = data.detail_url || character.detail_url;
    if (detailUrl) {
        return new URL(detailUrl, CC_RANKING_PUBLIC_SITE_BASE).toString();
    }

    if (!character.character_id) return null;

    const url = new URL('details/', `${CC_RANKING_PUBLIC_SITE_BASE}/`);
    url.searchParams.set('id', character.character_id);
    return url.toString();
};

const fetchRankingJson = async (pathName, params = {}) => {
    const url = buildRankingUrl(pathName, params);
    const response = await fetch(url);
    if (!response.ok) {
        let detail = '';
        try {
            const errorBody = await response.json();
            detail = errorBody.error || errorBody.message || '';
        } catch (e) {
            detail = await response.text().catch(() => '');
        }
        throw new Error(`Ranking API ${response.status}: ${detail || response.statusText}`);
    }
    return response.json();
};

const buildCharacterEmbed = (data) => {
    const character = data.character;
    const apiEmbed = data.discord_embed || {};
    const embed = new EmbedBuilder()
        .setColor(apiEmbed.color || 0x58D68D)
        .setTitle(apiEmbed.title || `#${character.rank} ${character.character_name}@${character.server_name}`)
        .setDescription(apiEmbed.description || formatRankingEntry(character))
        .setTimestamp();

    const fields = Array.isArray(apiEmbed.fields) ? apiEmbed.fields : [];
    if (fields.length > 0) {
        embed.addFields(fields.map(field => ({
            name: truncateText(field.name, 256),
            value: truncateText(field.value, 1024),
            inline: Boolean(field.inline)
        })));
    }

    const summary = data.summary;
    if (summary) {
        embed.addFields({
            name: '순위 변화',
            value: `첫 기록 #${summary.first_rank} → 최신 #${summary.latest_rank} (${summary.rank_delta >= 0 ? '+' : ''}${summary.rank_delta})`,
            inline: false
        });
    }

    const recentHistory = Array.isArray(data.history) ? data.history.slice(-5) : [];
    if (recentHistory.length > 0) {
        embed.addFields({
            name: '최근 기록',
            value: truncateText(recentHistory.map(item => {
                const wins = Number.isInteger(item.wins) ? ` · ${item.wins}승` : '';
                return `#${item.rank} ${item.tier || '-'}${wins} · ${item.source_time}`;
            }).join('\n'), 1024),
            inline: false
        });
    }

    if (apiEmbed.footer?.text) {
        embed.setFooter({ text: apiEmbed.footer.text });
    } else if (character.source_time) {
        embed.setFooter({ text: character.source_time });
    }

    const detailUrl = buildCharacterDetailUrl(data);
    if (detailUrl) {
        embed.setURL(detailUrl);
    }

    if (data.graph_url) {
        const graphUrl = new URL(data.graph_url, CC_RANKING_API_BASE).toString();
        embed.setImage(graphUrl);
    }

    return embed;
};

// 직업 이모지 상수
const jobEmotes = {
    '나이트': '<:PLD:1465245862363136145>', '전사': '<:WAR:1465245785934528574>', '암흑기사': '<:DRK:1465245768989540467>', '건브레이커': '<:GNB:1465245757803335680>',
    '백마도사': '<:WHM:1465245779349213255>', '학자': '<:SCH:1465245859498164276>', '점성술사': '<:AST:1465245864770666609>', '현자': '<:SGE:1465245752090689556>',
    '몽크': '<:MNK:1465245792070668363>', '용기사': '<:DRG:1465245799049986161>', '닌자': '<:NIN:1465245773418598495>', '사무라이': '<:SAM:1465245763616636938>', '리퍼': '<:RPR:1465245753986253015>', '바이퍼': '<:VPR:1465245750509174818>',
    '음유시인': '<:BRD:1465245746642030613>', '기공사': '<:MCH:1465245767047315629>', '무도가': '<:DNC:1465245755613777980>',
    '흑마도사': '<:BLM:1465245782004334666>', '소환사': '<:SMN:1465245774890799290>', '적마도사': '<:RDM:1465245765373923536>', '픽토맨서': '<:PCT:1465245748588187825>'
};

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

            const timeOption = { hour: '2-digit', minute: '2-digit' };
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('🗺️ 현재 맵 정보')
                .addFields(
                    { name: '🔥 현재 진행 중', value: `**:${rotation.current.map.emote}: ${rotation.current.map.name}**\n🕒 ~ ${rotation.current.endTime.toLocaleTimeString('ko-KR', timeOption)} 종료`, inline: false },
                    { name: '🔜 다음 맵', value: `**:${rotation.next.map.emote}: ${rotation.next.map.name}**\n🕒 ${rotation.next.startTime.toLocaleTimeString('ko-KR', timeOption)} 시작`, inline: false }
                )
                .setTimestamp();




            const image = getMapImage(rotation.current.map.name);
            if (image) {
                embed.setImage(`attachment://${image.name}`);
            }

            const options = { embeds: [embed] };
            if (image) options.files = [image];

            await interaction.reply(options);
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

            const description = seed.map((item, i) => `${i + 1}. [${item.time.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}] **:${item.map.emote}: ${item.map.name}**`).join('\n');

            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`📅 향후 ${seed.length}개 로테이션 일정`)
                .setDescription(description)
                .setFooter({ text: 'CC-Map Bot' });

            await interaction.reply({ embeds: [embed] });
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

            const scheduleList = schedules.map((item, i) => {
                const month = item.startTime.getMonth() + 1;
                const day = item.startTime.getDate();
                const weekday = item.startTime.toLocaleDateString('ko-KR', { weekday: 'short' });
                const startTime = item.startTime.toLocaleTimeString('ko-KR', timeOption);
                const startStr = `${month}/${day} (${weekday}) ${startTime}`;

                const endStr = item.endTime.toLocaleTimeString('ko-KR', timeOption);

                const status = item.isCurrent ? ' **(현재 진행 중! 🔥)**' : '';
                return `- ${startStr} ~ ${endStr}${status}`;
            }).join('\n');

            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`🕰️ ${mapDisplay} 일정`)
                .setDescription(scheduleList);




            const image = getMapImage(mapName);
            if (image) {
                embed.setImage(`attachment://${image.name}`);
            }

            const options = { embeds: [embed] };
            if (image) options.files = [image];

            await interaction.reply(options);
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

                const embed = new EmbedBuilder()
                    .setColor(0x9b59b6)
                    .setTitle(`🌠 [${sign}] 오늘의 운세`)
                    .setDescription(formattedHoroscope);

                if (parts.length >= 3) {
                    const recommendedMapName = parts[1].trim();
                    const mapObj = maps.find(m => m.name === recommendedMapName);
                    const mapDisplay = mapObj ? `:${mapObj.emote}: ${recommendedMapName}` : recommendedMapName;

                    embed.addFields(
                        { name: '🗺️ 추천 맵', value: mapDisplay, inline: true },
                        { name: '⚔️ 추천 직업', value: parts[2].trim(), inline: true }
                    );
                }

                await interaction.editReply({ embeds: [embed] });
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

                const embed = new EmbedBuilder().setColor(0xE67E22);

                if (isSimpleMode) {
                    const simpleList = recommendations.map(r => {
                        const emote = jobEmotes[r.job_name] || '';
                        return `- ${emote}**${r.job_name}**`;
                    }).join('\n');
                    embed.setTitle(`🎲 추천 직업 연속가챠 (${count}회)`);
                    embed.setDescription(simpleList);
                } else {
                    const r = recommendations[0];
                    const emote = jobEmotes[r.job_name] || '';
                    embed.setTitle(`🎲 오늘의 추천 직업`);
                    embed.setDescription(`## ${emote} **${r.job_name}**\n\n${r.comment}`);
                }
                await interaction.editReply({ embeds: [embed] });
            } catch (error) {
                console.error(error);
                await interaction.editReply({ content: '직업을 추천하는 중 오류가 발생했습니다.', ephemeral: true });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('dice')
            .setNameLocalizations({ 'ko': '주사위' })
            .setDescription('Roll a dice.')
            .setDescriptionLocalizations({ 'ko': '주사위를 굴립니다.' })
            .addStringOption(option =>
                option.setName('range')
                    .setNameLocalizations({ 'ko': '범위' })
                    .setDescription('Range of the dice (e.g. 1-100)')
                    .setDescriptionLocalizations({ 'ko': '주사위 범위 (예: 1-100)' })
                    .setRequired(false)
            ),
        async execute(interaction) {
            const rangeStr = interaction.options.getString('range') || '1-999';
            let min = 1, max = 999;

            const parts = rangeStr.split('-');
            if (parts.length === 2) {
                const p1 = parseInt(parts[0]);
                const p2 = parseInt(parts[1]);
                if (!isNaN(p1) && !isNaN(p2)) {
                    min = Math.min(p1, p2);
                    max = Math.max(p1, p2);
                }
            } else if (parts.length === 1) {
                const p1 = parseInt(parts[0]);
                if (!isNaN(p1)) max = p1;
            }

            const result = Math.floor(Math.random() * (max - min + 1)) + min;

            const embed = new EmbedBuilder()
                .setColor(0x2ECC71)
                .setTitle('🎲 주사위 굴리기!')
                .setDescription(`범위: ${min} ~ ${max}`)
                .addFields({ name: '결과', value: `# **${result}**` });

            await interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('duel')
            .setNameLocalizations({ 'ko': '결투' })
            .setDescription('Challenge someone to a duel.')
            .setDescriptionLocalizations({ 'ko': '누군가에게 결투를 신청합니다.' })
            .addUserOption(option =>
                option.setName('target')
                    .setNameLocalizations({ 'ko': '상대방' })
                    .setDescription('User to challenge')
                    .setDescriptionLocalizations({ 'ko': '결투할 상대방' })
                    .setRequired(true)
            ),
        async execute(interaction) {
            if (!interaction.guild) {
                await interaction.reply({ content: '이 명령어는 서버 내에서만 사용할 수 있습니다.', ephemeral: true });
                return;
            }

            const targetUser = interaction.options.getUser('target');
            const user = interaction.user;

            if (targetUser.id === user.id) {
                await interaction.reply({ content: '자기 자신과는 결투할 수 없습니다!', ephemeral: true });
                return;
            }
            if (targetUser.bot) {
                await interaction.reply({ content: '봇과는 결투할 수 없습니다. (너무 강하거든요!)', ephemeral: true });
                return;
            }

            const member = interaction.member;
            let targetMember;
            try {
                targetMember = await interaction.guild.members.fetch(targetUser.id);
            } catch (e) {
                targetMember = null;
            }

            const userNick = member.nickname || user.username;
            const targetNick = targetMember ? (targetMember.nickname || targetUser.username) : targetUser.username;

            const userRoll = Math.floor(Math.random() * 100) + 1;
            const targetRoll = Math.floor(Math.random() * 100) + 1;

            let resultMsg = '';
            let winnerId = null;
            let loserId = null;
            let isDraw = false;

            if (userRoll > targetRoll) {
                resultMsg = `🏆 **${userNick} 승리!**`;
                winnerId = user.id;
                loserId = targetUser.id;
            } else if (targetRoll > userRoll) {
                resultMsg = `🏆 **${targetNick} 승리!**`;
                winnerId = targetUser.id;
                loserId = user.id;
            } else {
                resultMsg = '🤝 **무승부!**';
                isDraw = true;
            }

            const guildId = interaction.guild.id;
            const updateStats = (userId, result) => {
                const dbKey = `${userId}@${guildId}`;
                const stats = db.prepare('SELECT * FROM duel_stats WHERE user_id = ?').get(dbKey) || { wins: 0, losses: 0, draws: 0 };

                if (result === 'win') stats.wins++;
                else if (result === 'loss') stats.losses++;
                else if (result === 'draw') stats.draws++;

                db.prepare(`
                    INSERT OR REPLACE INTO duel_stats (user_id, wins, losses, draws)
                    VALUES (?, ?, ?, ?)
                `).run(dbKey, stats.wins, stats.losses, stats.draws);
            };

            if (isDraw) {
                updateStats(user.id, 'draw');
                updateStats(targetUser.id, 'draw');
            } else {
                updateStats(winnerId, 'win');
                updateStats(loserId, 'loss');
            }

            const embed = new EmbedBuilder()
                .setColor(0xE74C3C)
                .setTitle('⚔️ 결투 발생! ⚔️')
                .addFields(
                    { name: userNick, value: `🎲 ${userRoll}`, inline: true },
                    { name: 'VS', value: '⚡', inline: true },
                    { name: targetNick, value: `🎲 ${targetRoll}`, inline: true },
                    { name: '결과', value: resultMsg, inline: false }
                );

            await interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('stats')
            .setNameLocalizations({ 'ko': '전적' })
            .setDescription('Check duel stats.')
            .setDescriptionLocalizations({ 'ko': '결투 전적을 확인합니다.' })
            .addUserOption(option =>
                option.setName('target')
                    .setNameLocalizations({ 'ko': '대상' })
                    .setDescription('User to check')
                    .setDescriptionLocalizations({ 'ko': '전적을 확인할 대상' })
                    .setRequired(false)
            ),
        async execute(interaction) {
            if (!interaction.guild) {
                await interaction.reply({ content: '이 명령어는 서버 내에서만 사용할 수 있습니다.', ephemeral: true });
                return;
            }

            const targetUser = interaction.options.getUser('target') || interaction.user;
            let targetMember;
            try {
                targetMember = await interaction.guild.members.fetch(targetUser.id);
            } catch (e) {
                targetMember = null;
            }
            const targetNick = targetMember ? (targetMember.nickname || targetUser.username) : targetUser.username;

            const guildId = interaction.guild.id;
            const dbKey = `${targetUser.id}@${guildId}`;
            const stats = db.prepare('SELECT * FROM duel_stats WHERE user_id = ?').get(dbKey);

            if (!stats) {
                await interaction.reply(`${targetNick}님은 이 서버에서 결투 기록이 없습니다.`);
                return;
            }

            const total = stats.wins + stats.losses + stats.draws;
            const winRate = total > 0 ? ((stats.wins / total) * 100).toFixed(1) : 0;

            const embed = new EmbedBuilder()
                .setColor(0xF1C40F)
                .setTitle(`📊 ${targetNick}님의 전적`)
                .addFields(
                    { name: '승리', value: `${stats.wins}회`, inline: true },
                    { name: '패배', value: `${stats.losses}회`, inline: true },
                    { name: '무승부', value: `${stats.draws}회`, inline: true },
                    { name: '승률', value: `${winRate}%`, inline: false }
                );

            await interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('team')
            .setNameLocalizations({ 'ko': '팀' })
            .setDescription('Divide into two teams.')
            .setDescriptionLocalizations({ 'ko': '두 팀으로 나눕니다.' })
            .addIntegerOption(option =>
                option.setName('count')
                    .setNameLocalizations({ 'ko': '인원' })
                    .setDescription('Number of people (distributes numbers)')
                    .setDescriptionLocalizations({ 'ko': '인원 수 (1부터 해당 숫자까지 배분)' })
                    .setRequired(false)
            )
            .addStringOption(option =>
                option.setName('names')
                    .setNameLocalizations({ 'ko': '이름' })
                    .setDescription('Names separated by spaces')
                    .setDescriptionLocalizations({ 'ko': '공백으로 구분된 이름 목록' })
                    .setRequired(false)
            ),
        async execute(interaction) {
            const count = interaction.options.getInteger('count');
            const namesStr = interaction.options.getString('names');

            if (!count && !namesStr) {
                await interaction.reply({ content: '❌ 인원(count) 또는 이름(names) 중 하나는 반드시 입력해야 합니다.', ephemeral: true });
                return;
            }

            let items = [];
            if (namesStr) {
                items = namesStr.split(/\s+/).filter(Boolean);
            } else {
                items = Array.from({ length: count }, (_, i) => i + 1);
            }

            if (items.length < 2) {
                await interaction.reply({ content: '❌ 팀을 나누려면 최소 2명 이상이어야 합니다.', ephemeral: true });
                return;
            }

            // Shuffle
            for (let i = items.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [items[i], items[j]] = [items[j], items[i]];
            }

            const mid = Math.ceil(items.length / 2);
            const teamA = items.slice(0, mid);
            const teamB = items.slice(mid);

            const embed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle('📢 팀 나누기 결과')
                .addFields(
                    { name: `🔴 A팀 (${teamA.length}명)`, value: teamA.join(', ') || '없음', inline: false },
                    { name: `🔵 B팀 (${teamB.length}명)`, value: teamB.join(', ') || '없음', inline: false }
                );

            await interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('tip')
            .setNameLocalizations({ 'ko': '팁' })
            .setDescription('Get useful tips.')
            .setDescriptionLocalizations({ 'ko': '유용한 팁을 확인합니다.' })
            .addStringOption(option =>
                option.setName('keyword')
                    .setNameLocalizations({ 'ko': '키워드' })
                    .setDescription('Keyword to search')
                    .setDescriptionLocalizations({ 'ko': '검색할 팁 키워드' })
                    .setRequired(true)
                    .setAutocomplete(true)
            ),
        async execute(interaction) {
            const keyword = interaction.options.getString('keyword');
            const tip = db.prepare('SELECT * FROM tips WHERE keyword = ?').get(keyword);

            if (!tip) {
                await interaction.reply({ content: `❌ '${keyword}'에 대한 팁을 찾을 수 없습니다.`, ephemeral: true });
                return;
            }

            let emote = '';
            if (tip.category === '직업') {
                emote = jobEmotes[tip.keyword] || '';
            } else if (tip.category === '맵') {
                const mapObj = maps.find(m => m.name === tip.keyword);
                if (mapObj) {
                    emote = `:${mapObj.emote}: `;
                }
            }

            const embed = new EmbedBuilder()
                .setColor(0xF39C12)
                .setTitle(`${emote}${tip.keyword}`)
                .setDescription(tip.content);

            await interaction.reply({ embeds: [embed] });
        },
        async autocomplete(interaction) {
            const focusedValue = interaction.options.getFocused();
            const tips = db.prepare('SELECT keyword FROM tips WHERE keyword LIKE ? LIMIT 25').all(`%${focusedValue}%`);

            await interaction.respond(
                tips.map(t => ({ name: t.keyword, value: t.keyword }))
            );
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ask')
            .setNameLocalizations({ 'ko': '질문' })
            .setDescription('Ask the chatbot about CC skills.')
            .setDescriptionLocalizations({ 'ko': '교관님에게 물어봐요! (Beta)' })
            .addStringOption(option =>
                option.setName('content')
                    .setNameLocalizations({ 'ko': '내용' })
                    .setDescription('Question content')
                    .setDescriptionLocalizations({ 'ko': '질문할 내용' })
                    .setRequired(true)
            ),
        async execute(interaction) {
            const API_URL = config.chatbotApiUrl; 

            const content = interaction.options.getString('content');

            if (!API_URL) {
                await interaction.reply({ content: '❌ 챗봇 API 링크가 설정되지 않았습니다.', ephemeral: true });
                return;
            }

            await interaction.deferReply();

            const userId = interaction.user.id;
            const nickname = interaction.member?.nickname || interaction.user.username;

            try {
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        chatInput: content,
                        userId: userId,
                        nickname: nickname
                    })
                });

                if (!response.ok) {
                    throw new Error(`API Error: ${response.statusText}`);
                }

                const result = await response.text();
                let answer = result;
                
                // JSON 파싱 시도
                try {
                    const json = JSON.parse(result);
                    if (json.response) answer = json.response;
                    else if (json.answer) answer = json.answer;
                    else if (json.content) answer = json.content;
                    else if (typeof json === 'object') answer = json.output;
                } catch (e) {
                    // JSON이 아니면 텍스트 그대로 사용
                }

                if (answer.length > 4000) answer = answer.substring(0, 4000) + '...';

                const embed = new EmbedBuilder()
                    .setColor(0x00CEC9)
                    .setTitle(`🗨️ 질문: ${content}`)
                    .setDescription(answer)
                    .setFooter({ text: 'CC-Map Chatbot (Beta)' });

                await interaction.editReply({ embeds: [embed] });

            } catch (error) {
                console.error(error);
                await interaction.editReply('❌ 답변을 가져오는 중 오류가 발생했습니다.');
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ranking')
            .setNameLocalizations({ 'ko': '랭킹' })
            .setDescription('Check Crystalline Conflict rankings.')
            .setDescriptionLocalizations({ 'ko': '크리스탈 컨플릭트 랭킹을 확인합니다.' })
            .addSubcommand(subcommand =>
                subcommand
                    .setName('top')
                    .setNameLocalizations({ 'ko': '상위' })
                    .setDescription('Shows top ranked characters.')
                    .setDescriptionLocalizations({ 'ko': '상위 랭킹 캐릭터를 보여줍니다.' })
                    .addIntegerOption(option =>
                        option.setName('limit')
                            .setNameLocalizations({ 'ko': '개수' })
                            .setDescription('Number of entries to show (1-20)')
                            .setDescriptionLocalizations({ 'ko': '표시할 랭킹 수 (1-20)' })
                            .setRequired(false)
                            .setMinValue(1)
                            .setMaxValue(20)
                    )
                    .addIntegerOption(option =>
                        option.setName('snapshot_id')
                            .setNameLocalizations({ 'ko': '스냅샷' })
                            .setDescription('Snapshot ID to view')
                            .setDescriptionLocalizations({ 'ko': '조회할 스냅샷 ID' })
                            .setRequired(false)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('search')
                    .setNameLocalizations({ 'ko': '검색' })
                    .setDescription('Search ranked characters.')
                    .setDescriptionLocalizations({ 'ko': '랭킹에 기록된 캐릭터를 검색합니다.' })
                    .addStringOption(option =>
                        option.setName('query')
                            .setNameLocalizations({ 'ko': '검색어' })
                            .setDescription('Character name keyword')
                            .setDescriptionLocalizations({ 'ko': '캐릭터명 검색어' })
                            .setRequired(true)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('character')
                    .setNameLocalizations({ 'ko': '캐릭터' })
                    .setDescription('Shows a character ranking detail.')
                    .setDescriptionLocalizations({ 'ko': '캐릭터 랭킹 상세 정보를 보여줍니다.' })
                    .addStringOption(option =>
                        option.setName('character')
                            .setNameLocalizations({ 'ko': '캐릭터' })
                            .setDescription('Character name or autocomplete result')
                            .setDescriptionLocalizations({ 'ko': '캐릭터명 또는 자동완성 결과' })
                            .setRequired(true)
                            .setAutocomplete(true)
                    )
                    .addStringOption(option =>
                        option.setName('server')
                            .setNameLocalizations({ 'ko': '서버' })
                            .setDescription('Server name, required when not using autocomplete')
                            .setDescriptionLocalizations({ 'ko': '자동완성을 쓰지 않을 때 필요한 서버명' })
                            .setRequired(false)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('snapshots')
                    .setNameLocalizations({ 'ko': '스냅샷' })
                    .setDescription('Shows available ranking snapshots.')
                    .setDescriptionLocalizations({ 'ko': '조회 가능한 랭킹 스냅샷을 보여줍니다.' })
            ),
        async execute(interaction) {
            const subcommand = interaction.options.getSubcommand();
            await interaction.deferReply();

            try {
                if (subcommand === 'top') {
                    const limit = interaction.options.getInteger('limit') || 10;
                    const snapshotId = interaction.options.getInteger('snapshot_id');
                    const data = await fetchRankingJson('/api/v1/top', { limit, snapshot_id: snapshotId });
                    const entries = Array.isArray(data.entries) ? data.entries : [];

                    if (entries.length === 0) {
                        await interaction.editReply('랭킹 데이터가 없습니다.');
                        return;
                    }

                    const embed = new EmbedBuilder()
                        .setColor(0x58D68D)
                        .setTitle(`🏆 크리스탈 컨플릭트 TOP ${entries.length}`)
                        .setDescription(truncateText(entries.map(formatRankingEntry).join('\n\n'), 4096))
                        .setFooter({ text: data.snapshot?.source_time_text || 'CC Ranking' });

                    await interaction.editReply({ embeds: [embed] });
                    return;
                }

                if (subcommand === 'search') {
                    const query = interaction.options.getString('query');
                    const data = await fetchRankingJson('/api/v1/search', { q: query });
                    const characters = Array.isArray(data.characters) ? data.characters : [];

                    if (characters.length === 0) {
                        await interaction.editReply(`'${query}' 검색 결과가 없습니다.`);
                        return;
                    }

                    const description = characters.slice(0, 10).map(character => (
                        `**${character.character_name}@${character.server_name}**\n` +
                        `최고 #${character.best_rank} · 최저 #${character.worst_rank} · 기록 ${character.samples}회 · key: \`${character.character_key}\``
                    )).join('\n\n');

                    const embed = new EmbedBuilder()
                        .setColor(0x58D68D)
                        .setTitle(`🔎 랭킹 검색: ${query}`)
                        .setDescription(truncateText(description, 4096))
                        .setFooter({ text: `상세 조회: /ranking character character:${characters[0].character_key}` });

                    await interaction.editReply({ embeds: [embed] });
                    return;
                }

                if (subcommand === 'character') {
                    const characterInput = interaction.options.getString('character');
                    const server = interaction.options.getString('server');
                    const params = characterInput.includes('::') && !server
                        ? { key: characterInput }
                        : { name: characterInput, server };

                    if (!params.key && !params.server) {
                        await interaction.editReply('서버명을 같이 입력하거나 자동완성 목록에서 캐릭터를 선택해주세요.');
                        return;
                    }

                    const data = await fetchRankingJson('/api/v1/character', params);
                    await interaction.editReply({ embeds: [buildCharacterEmbed(data)] });
                    return;
                }

                if (subcommand === 'snapshots') {
                    const data = await fetchRankingJson('/api/v1/snapshots');
                    const snapshots = Array.isArray(data.snapshots) ? data.snapshots : [];

                    if (snapshots.length === 0) {
                        await interaction.editReply('조회 가능한 스냅샷이 없습니다.');
                        return;
                    }

                    const embed = new EmbedBuilder()
                        .setColor(0x58D68D)
                        .setTitle('📌 랭킹 스냅샷')
                        .setDescription(snapshots.slice(0, 10).map(snapshot => (
                            `ID \`${snapshot.id}\` · 시즌 ${snapshot.season} · ${snapshot.entry_count}명\n${snapshot.source_time_text}`
                        )).join('\n\n'));

                    await interaction.editReply({ embeds: [embed] });
                }
            } catch (error) {
                console.error(error);
                await interaction.editReply('랭킹 API를 호출하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
            }
        },
        async autocomplete(interaction) {
            const focused = interaction.options.getFocused();
            if (!focused || focused.length < 1) {
                await interaction.respond([]);
                return;
            }

            try {
                const data = await fetchRankingJson('/api/v1/search', { q: focused });
                const characters = Array.isArray(data.characters) ? data.characters : [];
                await interaction.respond(
                    characters.slice(0, 25).map(character => ({
                        name: `${character.character_name}@${character.server_name} · 최고 #${character.best_rank}`,
                        value: character.character_key
                    }))
                );
            } catch (error) {
                console.error('랭킹 자동완성 처리 중 오류 발생:', error);
                await interaction.respond([]);
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
**/now (지금)**
현재 진행 중인 맵 정보 확인

**/rotation (로테이션)**
향후 맵 로테이션 일정 확인

**/when (언제)**
특정 맵 일정 검색

**/horoscope (운세)**
오늘의 별자리 운세 확인

**/recommend (직업추천)**
PvP 직업 추천 (단일/연속)

**/dice (주사위)**
주사위 굴리기 (범위 지정 가능)

**/duel (결투)**
주사위 결투 미니게임

**/stats (전적)**
결투 전적 확인

**/team (팀)**
팀 나누기 (인원/이름)

**/tip (팁)**
유용한 팁 검색

**/podcast (팟캐스트)**
오늘의 크리스탈라인 컨플릭트 팟캐스트 듣기

**/ranking (랭킹)**
크리스탈 컨플릭트 랭킹 조회 (상위/검색/캐릭터/스냅샷)

**/ask (질문)**
교관님에게 물어봐요! (Beta)
            `.trim();

            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('📖 명령어 도움말')
                .setDescription(helpMessage)
                .setFooter({ text: 'CC-Map Bot | Last Update: 2026-05-05' });

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('podcast')
            .setNameLocalizations({ 'ko': '팟캐스트' })
            .setDescription('Listen to today\'s Crystalline Conflict podcast.')
            .setDescriptionLocalizations({ 'ko': '오늘의 크리스탈라인 컨플릭트 팟캐스트를 듣습니다.' })
            .addStringOption(option =>
                option.setName('caster')
                    .setNameLocalizations({ 'ko': '캐스터' })
                    .setDescription('Choose a specific caster.')
                    .setDescriptionLocalizations({ 'ko': '원하는 캐스터를 선택하세요.' })
                    .setRequired(false)
                    .addChoices(
                        { name: 'Fenrir (Shoutcaster)', value: 'Fenrir' },
                        { name: 'Charon (News Anchor)', value: 'Charon' },
                        { name: 'Puck (Radio DJ)', value: 'Puck' }
                    )
            ),
        async execute(interaction) {
            await interaction.deferReply();

            try {
                // podcast 모듈 동적 임포트 (순환 참조 방지)
                const { getRandomPodcast, getPodcastByVoice } = await import('./podcast.js');

                // 오늘 날짜 구하기 (한국 시간)
                const now = new Date();
                const kstOffset = 9 * 60 * 60 * 1000;
                const date = new Date(now.getTime() + kstOffset).toISOString().split('T')[0];

                const caster = interaction.options.getString('caster');
                let podcast;

                if (caster) {
                    podcast = getPodcastByVoice(date, caster);
                } else {
                    podcast = getRandomPodcast(date);
                }

                if (!podcast) {
                    const msg = caster
                        ? `오늘 ${caster} 캐스터의 방송이 준비되지 않았습니다.`
                        : '오늘 준비된 팟캐스트가 없습니다. 잠시 후 다시 시도해보세요 (또는 관리자에게 문의).';
                    await interaction.editReply(msg);
                    return;
                }

                // 오디오 파일 경로 확인
                // DB에는 웹 경로(/audio/...)가 저장되어 있음. 로컬 파일 시스템 경로로 변환.
                // podcast.js의 audioDir 로직과 동일해야 함: ./web/public/audio/filename
                // 하지만 DB에는 /audio/filename.mp3 로 저장됨. (web서버용)
                // 따라서 파일명만 추출.
                const filename = path.basename(podcast.audio_path);
                const filePath = path.join(process.cwd(), 'web', 'public', 'audio', filename);

                // 파일이 존재하는지 확인 (오디오 생성 실패했을 수도 있음)
                if (!fs.existsSync(filePath)) {
                    // 파일이 없으면 대본만 출력
                    const embed = new EmbedBuilder()
                        .setColor(0xE74C3C)
                        .setTitle(`🎙️ 오늘의 CC 팟캐스트 (오류)`)
                        .setDescription(`**Voice:** ${podcast.voice}\n\n오디오 파일이 없습니다. 관리자에게 문의하세요.`)
                        .setFooter({ text: '오디오 생성 실패' });

                    await interaction.editReply({ embeds: [embed] });
                    return;
                }

                const attachment = new AttachmentBuilder(filePath, { name: filename });

                const embed = new EmbedBuilder()
                    .setColor(0x8E44AD)
                    .setTitle(`🎙️ 오늘의 CC 팟캐스트`)
                    .setDescription(`**Voice:** ${podcast.voice}`)
                    .setFooter({ text: 'Enjoy the show!' });

                await interaction.editReply({ embeds: [embed], files: [attachment] });

            } catch (error) {
                console.error(error);
                await interaction.editReply('팟캐스트를 불러오는 중 오류가 발생했습니다.');
            }
        }
    }
];

export default commands;
