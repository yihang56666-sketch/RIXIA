const quotes = [
  { text: "把今天过扎实，明天自然会有答案。", source: "BEID 每日一句" },
  { text: "真正让人安心的，是完成而不是想象。", source: "BEID 每日一句" },
  { text: "慢一点没关系，只要方向没偏。", source: "BEID 每日一句" },
  { text: "学习不是比谁先开始，而是比谁更常回来。", source: "BEID 每日一句" },
  { text: "每一个完成的小事，都在悄悄拉高你的下限。", source: "BEID 每日一句" },
  { text: "别等状态来了再动手，动手以后状态才会来。", source: "BEID 每日一句" },
  { text: "今天的笨功夫，就是明天的不慌。", source: "BEID 每日一句" },
  { text: "能聚焦的十分钟，好过走神的两个小时。", source: "BEID 每日一句" },
  { text: "备考不是冲刺，是每天都在场。", source: "BEID 每日一句" },
  { text: "问题不是一次解决的，是一点点越变越小的。", source: "BEID 每日一句" },
  { text: "把任务写下来，大脑才腾得出去找解法。", source: "BEID 每日一句" },
  { text: "重复不是枯燥，是让正确变得自然。", source: "BEID 每日一句" },
  { text: "先做五分钟，收尾的力气往往比开始的难得多。", source: "BEID 每日一句" },
  { text: "节奏感不是天赋，是每天对一次表。", source: "BEID 每日一句" },
  { text: "你不需要完美开场，只需要一次专注的落笔。", source: "BEID 每日一句" },
  { text: "复习的意义，是让忘记不再能打败你。", source: "BEID 每日一句" },
  { text: "今天多留十分钟复盘，明天就少走一小时弯路。", source: "BEID 每日一句" },
  { text: "沉下心的时候，时间安静地站在你这边。", source: "BEID 每日一句" },
  { text: "别和别人比进度，和昨天的自己比清醒。", source: "BEID 每日一句" },
  { text: "坚定不是不累，是累完还愿意坐回书桌前。", source: "BEID 每日一句" },
];

function hashDate(dateKey: string): number {
  let hash = 0;
  for (let index = 0; index < dateKey.length; index += 1) {
    hash = (hash * 31 + dateKey.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export function getDailyQuote(dateKey: string): { text: string; source: string } {
  const quote = quotes[hashDate(dateKey) % quotes.length] ?? quotes[0];
  return { ...quote };
}
