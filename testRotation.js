import { getMapAtTime, generateRotationSeed, getCurrentRotation, getNextMapSchedules, maps } from './mapRotation.js';

console.log('--- [검증] 맵 로테이션 시스템 ---\n');

// 1. 현재 정보 출력
const current = getCurrentRotation();
console.log('현재 맵:', current.current.map);
console.log('종료 예정:', current.current.endTime.toLocaleString());
console.log('다음 맵:', current.next.map);
console.log('\n---------------------------\n');

// 2. 시드 생성 테스트 (향후 5개 로테이션)
console.log('향후 5개 로테이션 일정 (시드):');
const seed = generateRotationSeed(Date.now(), 5);
seed.forEach((item, index) => {
    console.log(`${index + 1}. [${item.time.toLocaleString()}] ${item.map}`);
});

console.log('\n---------------------------\n');

// 3. 로직 무결성 체크 (90분 후 맵이 바뀌는지)
const now = Date.now();
const mapNow = getMapAtTime(now);
const map90MinLater = getMapAtTime(now + 90 * 60 * 1000);

console.log(`현재 시간 맵: ${mapNow}`);
console.log(`90분 후 맵: ${map90MinLater}`);

if (mapNow !== map90MinLater) {
    console.log('\n✅ 맵 전환 로직 정상 작동 확인');
} else {
    console.log('\n⚠️ 맵이 그대로입니다.');
}

console.log('\n---------------------------\n');

// 4. 일정 검색 테스트 (getNextMapSchedules)
const targetMap = maps[0]; // 첫 번째 맵(팔라이스트라) 검색
console.log(`'${targetMap}' 향후 일정 검색:`);
const schedules = getNextMapSchedules(targetMap, 3);
schedules.forEach((item, index) => {
    const status = item.isCurrent ? " (현재 진행 중!)" : "";
    console.log(`${index + 1}. ${item.startTime.toLocaleTimeString()} ~ ${item.endTime.toLocaleTimeString()}${status}`);
});

if (schedules.length > 0 && schedules[0].startTime) {
    console.log('\n✅ 일정 검색 로직 정상 작동 확인');
}
