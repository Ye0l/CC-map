import db from './db.js';

// 맵 목록 로드
const maps = db.prepare('SELECT name FROM maps ORDER BY rotation_order ASC').pluck().all();

/**
 * 설정값
 * ROTATION_INTERVAL: 90분 (단위: 밀리초)
 */
const ROTATION_INTERVAL = 90 * 60 * 1000;
// 사용자의 기준 정보: 2026-01-17 21:00에 '팔라이스트라'(인덱스 0) 시작
const EPOCH_TIME = new Date('2026-01-17T21:00:00+09:00').getTime();

/**
 * 특정 시간에 해당하는 맵 인덱스 계산
 */
export function getMapIndexAtTime(timestamp) {
    const elapsed = timestamp - EPOCH_TIME;
    const rotationCount = Math.floor(elapsed / ROTATION_INTERVAL);
    return ((rotationCount % maps.length) + maps.length) % maps.length;
}

/**
 * 특정 시점의 맵 이름 반환
 */
export function getMapAtTime(timestamp) {
    const index = getMapIndexAtTime(timestamp);
    return maps[index];
}

/**
 * 특정 시작 시점부터 지정된 개수만큼의 맵 로테이션 시드 생성
 */
export function generateRotationSeed(startTime, count = 10) {
    const seed = [];
    const currentRotationStart = Math.floor((startTime - EPOCH_TIME) / ROTATION_INTERVAL) * ROTATION_INTERVAL + EPOCH_TIME;

    for (let i = 0; i < count; i++) {
        const rotationTime = currentRotationStart + (i * ROTATION_INTERVAL);
        seed.push({
            time: new Date(rotationTime),
            map: getMapAtTime(rotationTime)
        });
    }
    return seed;
}

/**
 * 현재 시간을 기준으로 현재 맵과 다음 맵 정보를 반환
 */
export function getCurrentRotation() {
    const now = Date.now();
    const currentMap = getMapAtTime(now);
    const nextRotationTime = Math.floor((now - EPOCH_TIME) / ROTATION_INTERVAL + 1) * ROTATION_INTERVAL + EPOCH_TIME;
    const nextMap = getMapAtTime(nextRotationTime);

    return {
        current: {
            map: currentMap,
            endTime: new Date(nextRotationTime)
        },
        next: {
            map: nextMap,
            startTime: new Date(nextRotationTime)
        }
    };
}

/**
 * 특정 맵의 향후 일정 검색
 * @param {string} targetMapName 찾을 맵 이름
 * @param {number} count 반환할 일정 개수
 * @returns {Array<{startTime: Date, endTime: Date}>} 일정 목록
 */
export function getNextMapSchedules(targetMapName, count = 5) {
    const targetIndex = maps.indexOf(targetMapName);
    if (targetIndex === -1) return [];

    const now = Date.now();
    const currentRotationStartTime = Math.floor((now - EPOCH_TIME) / ROTATION_INTERVAL) * ROTATION_INTERVAL + EPOCH_TIME;
    const currentIndex = getMapIndexAtTime(now);

    // 목표 맵까지 남은 턴 수 계산 (음수 방지를 위해 maps.length 더함)
    const turnsDiff = (targetIndex - currentIndex + maps.length) % maps.length;

    // 가장 가까운 시작 시간 (현재 진행 중이라면 turnsDiff는 0)
    // 하지만 현재 진행 중인 경우, 사용자는 '지금'을 포함해서 알고 싶어할 것이므로 포함.
    let firstStartTime = currentRotationStartTime + (turnsDiff * ROTATION_INTERVAL);

    // 만약 계산된 시작 시간이 현재 시간보다 90분(1텀) 이상 전이라면 (즉, 이미 끝난 텀이라면) 보정
    // 로직상 turnsDiff가 0이면 현재 텀의 시작시간이 됨. (이미 지났지만 현재 진행중)
    // 따라서 별도 보정 불필요. 

    const schedules = [];
    const cycleDuration = maps.length * ROTATION_INTERVAL; // 한 바퀴 도는 데 걸리는 시간

    for (let i = 0; i < count; i++) {
        const startTime = firstStartTime + (i * cycleDuration);
        const endTime = startTime + ROTATION_INTERVAL;
        schedules.push({
            startTime: new Date(startTime),
            endTime: new Date(endTime),
            isCurrent: (startTime <= now && now < endTime)
        });
    }

    return schedules;
}

export { maps };
