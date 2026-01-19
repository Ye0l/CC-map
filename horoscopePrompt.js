import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getHoroscopePrompt(date) {
  let skillData = '';
  try {
    const skillsPath = path.join(__dirname, 'ff14_pvp_skills.json');
    if (fs.existsSync(skillsPath)) {
      const skills = JSON.parse(fs.readFileSync(skillsPath, 'utf8'));
      const simplifiedSkills = [];

      for (const [job, jobSkills] of Object.entries(skills)) {
        const skillTexts = jobSkills.map(s => `${s.name}: ${s.effect.replace(/\n/g, ' ')}`).join(' | ');
        simplifiedSkills.push(`[${job}] ${skillTexts}`);
      }
      skillData = simplifiedSkills.join('\n');
    }
  } catch (e) {
    console.error("Error reading skills file:", e);
  }

  return `
오늘은 ${date}입니다.
FF14의 PvP 콘텐츠인 '크리스탈라인 컨플릭트'를 테마로 하여 황도 12궁(Aries, Taurus, Gemini, Cancer, Leo, Virgo, Libra, Scorpio, Sagittarius, Capricorn, Aquarius, Pisces)의 오늘의 운세를 작성해 주세요.

# 참고 데이터
1. **[FF14 PvP Skills Data]**:
${skillData}
2. **[Map List]**: 팔라이스트라, 화산심장, 절정의 구름, 동방 꼭두각시 어전, 붉은 사막, 바닷가 전투장

# 작성 지침 (중요)
1. **일상과 게임의 조화**: 단순히 게임 플레이 팁을 주는 것이 아니라, **현실의 업무, 학업, 인간관계**에 대한 조언을 해주세요. 게임 요소는 상황을 묘사하는 **'비유(Metaphor)'**로만 사용해야 합니다.
2. **요소 활용**: 각 별자리마다 무작위로 **[추천 맵]**과 **[추천 직업]**을 선정하고, 해당 직업의 **[스킬]** 하나를 골라 운세 내용에 자연스럽게 녹여내세요.
    - *나쁜 예*: "전사의 원초적 혈기를 쓰세요. 적을 기절시키고 크리스탈을 미세요." (게임 공략 같음)
    - *좋은 예*: "전사가 '원초적 혈기'로 피해를 회복하듯, 오늘은 실수조차 전화위복의 기회로 바뀔 것입니다. 업무에서 과감하게 치고 나가세요." (일상 조언)
    - *맵 활용 예*: "화산심장의 폭탄처럼 주변 분위기가 급변할 수 있으니 눈치를 잘 챙기세요."
3. **분량**: 3줄 내외로 간결하고 위트 있게 작성하세요.
4. **출력 형식**: 값(Value)은 반드시 **"운세 텍스트|[추천 맵]|[추천 직업]"** 형식을 준수하세요. (대괄호 포함 아님, 파이프 \`|\` 로 구분)

# 출력 예시
{
  "Aries": "업무가 몰아쳐도 [전사]의 [원초의 분노]처럼 뜨거운 열정으로 돌파할 수 있는 날입니다. [팔라이스트라]의 탁 트인 전장처럼 솔직하게 의견을 말하면 행운이 따릅니다.|팔라이스트라|전사",
  "Taurus": "주변의 유혹이 [동방 꼭두각시 어전]의 함정처럼 도사리고 있습니다. [나이트]가 [방패]를 들듯 오늘은 거절하는 용기가 필요합니다. 지갑을 지키세요.|동방 꼭두각시 어전|나이트"
}

# 결과 (JSON Only)
`;
}
