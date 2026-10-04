// Light questions for the group chat, so nobody has to think of an opening line.
// The question changes every 20 minutes, the same for everyone in the room.

const QUESTIONS: [string, string][] = [
  ['Best thing you’ve eaten this week?', 'ما أفضل شيء أكلته هذا الأسبوع؟'],
  ['What brings you out tonight?', 'ما الذي أخرجك الليلة؟'],
  ['What should everyone here order?', 'ماذا يجب أن يطلب الجميع هنا؟'],
  ['Hidden gem in Dubai that nobody talks about?', 'ما المكان المميز في دبي الذي لا يتحدث عنه أحد؟'],
  ['Last song you had on repeat?', 'ما آخر أغنية استمعت إليها مراراً؟'],
  ['Beach, desert or mountains?', 'الشاطئ أم الصحراء أم الجبال؟'],
  ['Best trip you’ve ever taken?', 'ما أفضل رحلة قمت بها؟'],
  ['Brunch or dinner: which is the better meal?', 'الفطور المتأخر أم العشاء: أيهما أفضل؟'],
  ['What’s something you’re looking forward to this month?', 'ما الشيء الذي تتطلع إليه هذا الشهر؟'],
  ['Sweet or savoury dessert person?', 'هل تفضّل الحلويات الحلوة أم المالحة؟'],
  ['Most underrated dish on the menu?', 'ما أكثر طبق لا يأخذ حقه في القائمة؟'],
  ['Coffee order that says everything about you?', 'ما طلب القهوة الذي يقول كل شيء عنك؟'],
  ['Where in the world would you eat tomorrow if you could?', 'لو استطعت، أين في العالم ستتناول طعامك غداً؟'],
  ['Best film or series you’ve watched lately?', 'ما أفضل فيلم أو مسلسل شاهدته مؤخراً؟'],
  ['A skill you’d love to learn?', 'ما المهارة التي تتمنى تعلّمها؟'],
  ['Early bird or night owl?', 'هل أنت من محبي الصباح أم السهر؟'],
  ['Spiciest thing you’ve ever eaten?', 'ما أكثر شيء حار أكلته في حياتك؟'],
  ['What’s your go-to karaoke song?', 'ما أغنيتك المفضلة في الكاريوكي؟'],
  ['Weekend plans?', 'ما خططك لعطلة نهاية الأسبوع؟'],
  ['One food you could eat every day?', 'ما الطعام الذي يمكنك أكله كل يوم؟'],
];

export function currentIcebreaker(lang: 'en' | 'ar', at = Date.now()) {
  const slot = Math.floor(at / (20 * 60 * 1000));
  const [en, ar] = QUESTIONS[slot % QUESTIONS.length];
  return lang === 'ar' ? ar : en;
}
