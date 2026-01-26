import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getHoroscopePrompt(date, jobAssignments) {
  let skillData = '';
  try {
    const skillsPath = path.join(__dirname, 'ff14_pvp_skills.json');
    if (fs.existsSync(skillsPath)) {
      // 1. JSON 데이터 로드
      const skills = JSON.parse(fs.readFileSync(skillsPath, 'utf8'));

      // 2. 오늘 배정된 직업 리스트 추출 (예시: assignments 배열이 있다고 가정)
      // 만약 assignmentsText만 있다면, 거기서 직업명만 뽑아내거나,
      // 운세 생성 로직에서 사용한 'selectedJobs' 배열을 그대로 가져오세요.
      // 예: const targetJobs = ['전사', '백마도사', '용기사', ...]; 
      const targetJobs = new Set(Object.values(jobAssignments)); // 검색 속도를 위해 Set 사용 권장

      const simplifiedSkills = [];

      for (const [job, jobSkills] of Object.entries(skills)) {
        // [중요] 배정된 직업이 아니면 건너뜀 (토큰 절약의 핵심)
        if (!targetJobs.has(job)) continue;

        const skillTexts = jobSkills.map(s => {
          let effect = s.effect;

          // [최적화] 불필요한 정보 제거 (토큰 절약 + 자연스러운 문장 유도)

          // 1. 줄바꿈을 공백으로 변경
          effect = effect.replace(/\n/g, ' ');

          // 2. 단순 수치 정보 제거 (운세에는 '위력 12000'보다 '강력한 공격'이라는 뉘앙스만 있으면 됨)
          // 예: "위력: 12000" -> 삭제
          effect = effect.replace(/위력: \d+~?\d*/g, '');
          effect = effect.replace(/회복력: \d+~?\d*/g, '');
          effect = effect.replace(/지속 회복력: \d+/g, '');
          effect = effect.replace(/지속 피해 위력: \d+/g, '');

          // 3. 시스템적인 제약 사항(※) 제거
          effect = effect.replace(/※.*?입니다\./g, '');
          effect = effect.replace(/※.*?변화합니다\./g, '');
          effect = effect.replace(/※ 이 기술은 단축바에 등록할 수 없습니다\./g, '');

          // 4. 중복 공백 제거
          effect = effect.replace(/\s+/g, ' ').trim();

          return `**${s.name}**: ${effect}`;
        }).join(' | ');

        simplifiedSkills.push(`### **${job}**\n${skillTexts}`);
      }

      skillData = simplifiedSkills.join('\n\n');
    }
  } catch (e) {
    console.error("Error reading skills file:", e);
  }

  // 별자리별 할당된 직업 정보 텍스트 생성
  const assignmentsText = Object.entries(jobAssignments || {})
    .map(([sign, job]) => `- ${sign}: ${job}`)
    .join('\n');

  return `
오늘은 ${date}입니다.
당신은 에오르제아 최고의 점성술사이자, 입담 좋은 크리스탈라인 컨플릭트 해설가입니다.
제공된 데이터를 바탕으로 황도 12궁(Aries, Taurus, Gemini, Cancer, Leo, Virgo, Libra, Scorpio, Sagittarius, Capricorn, Aquarius, Pisces)의 오늘의 운세를 작성해 주세요.

# 참고 데이터
1. **[오늘의 지정 추천 직업]** (각 별자리에 할당된 직업을 반드시 사용):
${assignmentsText}

2. **[FF14 PvP Skills Data]**:
${skillData}

3. **[Map List]** (운세의 분위기에 맞는 맵을 하나 선정):
* **팔라이스트라**: 정정당당한 승부, 속도전, 기초가 중요한 하루. ('전력 질주 구간')
* **화산심장**: 다혈질 주의, 폭발적인 분노나 열정, 횡재수. ('분화', '봄의 혼')
* **절정의 구름**: 기분파, 롤러코스터 같은 하루, 위기 탈출. ('난기류', '도약대')
* **동방 꼭두각시 어전**: 눈치싸움, 함정 조심, 반전의 기회. ('꼭두각시 장판/문', '금화/은화')
* **붉은 사막**: 인내심 필요, 예상치 못한 방해꾼, 회복과 휴식. ('개미귀신', '오아시스', '작열파')
* **바닷가 전투장**: 시원한 해결, 빠른 이동, 휴양지의 설렘. ('도약대')

# 작성 지침 (Tone & Manner - 매우 중요)
1. **[빙의 모드]**: 단순히 비유(~~처럼 하세요)하지 말고, **현실 세계를 PvP 전장 그 자체로 취급**하세요. 독자를 '모험가' 혹은 '플레이어'로 대우하며 조언하세요.
    * *나쁜 예*: "화가 날 때는 전사의 원초의 분노처럼 화를 내세요." (설명조)
    * *좋은 예*: "상사의 잔소리가 난기류처럼 쏟아집니다? **전사**의 **원초의 해방**을 켜고 기절 면역 상태로 묵묵히 업무를 밀어버리세요!" (몰입형)
2. **[스킬의 재해석]**: 스킬의 '대미지'나 '수치'보다는 **'판정(기절, 정화, 무적, 변이)'이나 '컨셉'**을 일상 상황에 대입하세요.
    * *예시*: 정화(CC해제) → 스트레스 해소 / 방어(대미지 경감) → 멘탈 보호 / 리미트 브레이크(필살기) → 결정적인 한 방.
3. **[맵과의 조화]**: 선정된 맵의 기믹을 행운/불운의 요소로 자연스럽게 섞으세요.
4. **[형식 준수]**:
    - 직업명과 스킬명은 반드시 **볼드체**로 감싸주세요.
    - 문장은 2~3문장으로 간결하고 위트 있게(음슴체나 해요체 혼용 가능).
    - 값(Value) 형식: **"운세 텍스트|[추천 맵]|[추천 직업]"**

# 출력 예시
{
  "Aries": "답답한 출근길, **바닷가 전투장**의 **도약대**를 탄 것처럼 빠르게 사무실에 도착합니다. 오늘 회의에서는 **용기사**의 **천룡점정**으로 확실한 마무리를 지어보세요. 타이밍이 생명입니다!|바닷가 전투장|용기사",
  "Taurus": "**화산심장**의 **봄**처럼 언제 터질지 모르는 사람이 주변에 있습니다. **백마도사**의 **미라클 오브 네이처**로 상대를 꼬마 돼지로 만들어 잠시 조용히 시키고 싶어지는 날이네요. 인내심이 필요합니다.|화산심장|백마도사"
}

# 결과 (JSON Only)
`;
}

export function getJobRecommendationPrompt(date, jobName) {
  return `
오늘은 ${date}입니다.
당신은 에오르제아 최고의 점성술사이자, 입담 좋은 크리스탈라인 컨플릭트 해설가입니다.
오늘의 추천 직업인 **${jobName}**에 대해 위트 있고 짧은 추천 멘트를 작성해 주세요.

# 작성 지침
1. **[빙의 모드]**: 현실 세계를 PvP 전장 그 자체로 취급하세요. 독자를 '모험가'로 대우하며 조언하세요.
2. **[직업 컨셉 반영]**: **${jobName}**의 특징이나 PvP 스킬의 느낌을 일상 상황에 대입하세요.
3. **[문체]**: 1~2문장으로 간결하고 위트 있게(음름체나 해요체 혼용 가능).
4. **[강조]**: 직업명과 스킬명은 반드시 **볼드체**로 감싸주세요.

# 출력 예시
- "오늘은 **용기사**의 **천룡점정**처럼 확실한 마무리가 필요한 날입니다. 망설이지 말고 결단을 내리세요!"
- "주변의 CC기가 쏟아진다면 **전사**의 **원초의 해방**을 켜고 앞만 보고 나아가세요. 당신의 앞길을 막을 자는 없습니다."

결과는 따옴표 없이 멘트만 출력하세요.
`;
}
