// Guest-screen translations. English text is the key; Arabic is looked up, falling back to English.
// {name}-style placeholders are filled from the second argument.

export type Lang = 'en' | 'ar';

export const LANG_COOKIE = 'serendine-lang';

const AR: Record<string, string> = {
  // Sign in and check-in
  'Someone in this room might be worth meeting.': 'قد يكون في هذا المكان شخص يستحق التعرّف عليه.',
  'Say hello to another table, as yourself or by an alias. Nobody sees you until you choose to be seen.':
    'ألقِ التحية على طاولة أخرى، باسمك أو باسم مستعار. لن يراك أحد حتى تختار أن تظهر.',
  'Continue with Google': 'المتابعة باستخدام Google',
  'Continue with Apple': 'المتابعة باستخدام Apple',
  'Continue with Telegram': 'المتابعة باستخدام تيليجرام',
  'Open in Telegram': 'افتح في تيليجرام',
  "Opened from WhatsApp or Instagram? Open this page in Safari or Chrome first, as Google sign-in doesn't work inside those apps.":
    'هل فتحت الرابط من واتساب أو إنستغرام؟ افتح هذه الصفحة في Safari أو Chrome أولاً، لأن تسجيل الدخول عبر Google لا يعمل داخل هذه التطبيقات.',
  or: 'أو',
  'Check your email for a sign-in link. Open it on this phone.': 'تحقّق من بريدك الإلكتروني للحصول على رابط تسجيل الدخول، وافتحه على هذا الهاتف.',
  'Use email instead': 'أو استخدم بريدك الإلكتروني',
  'Send link': 'إرسال الرابط',
  '18+ only. Your email is never shown to other guests. By continuing you agree to the':
    'للبالغين 18 عاماً فأكثر فقط. لا يظهر بريدك الإلكتروني للضيوف الآخرين. بالمتابعة فإنك توافق على',
  '18+ only. By continuing you agree to the': 'للبالغين 18 عاماً فأكثر فقط. بالمتابعة فإنك توافق على',
  terms: 'الشروط',
  and: 'و',
  'privacy policy': 'سياسة الخصوصية',
  'Privacy policy': 'سياسة الخصوصية',
  'Sign-in did not work. Please try again.': 'لم ينجح تسجيل الدخول. يرجى المحاولة مرة أخرى.',
  'Too many sign-in emails just now. Try Google, or wait a few minutes.': 'تم إرسال رسائل كثيرة للتو. جرّب Google أو انتظر بضع دقائق.',
  'We could not send the link. Check the address and try again.': 'تعذّر إرسال الرابط. تحقّق من العنوان وحاول مرة أخرى.',
  'Checked in at {where}': 'سجّلت حضورك في {where}',
  Table: 'طاولة',
  'How should people know you tonight?': 'كيف تحب أن يعرفك الناس الليلة؟',
  'How should people know you today?': 'كيف تحب أن يعرفك الناس اليوم؟',
  'Name or alias': 'الاسم أو اسم مستعار',
  'e.g. Harry, or Blue Jumper': 'مثلاً: سارة، أو صاحب القميص الأزرق',
  'I am': 'أنا',
  Male: 'ذكر',
  Female: 'أنثى',
  'Prefer not to say': 'أفضّل عدم الإفصاح',
  "Shown next to your name so people know who they're chatting to.": 'يظهر بجانب اسمك ليعرف الناس مع من يتحدثون.',
  "I'm here for": 'أنا هنا من أجل',
  'Friendly chat': 'دردشة ودية',
  Networking: 'تعارف مهني',
  Dating: 'مواعدة',
  'Shown next to your name so nobody misreads your intent.': 'يظهر بجانب اسمك حتى لا يُساء فهم نيتك.',
  'I am 18 or over and agree to the house rules: be kind, take no for an answer.':
    'عمري 18 عاماً أو أكثر وأوافق على قواعد المكان: كن لطيفاً، واقبل الرفض بصدر رحب.',
  "Tonight's welcome offer": 'عرض الترحيب الليلة',
  'Yes, send me offers and events from {venue}. Optional; chatting works either way.':
    'نعم، أرسلوا لي العروض والفعاليات من {venue}. هذا اختياري، والدردشة تعمل في الحالتين.',
  'Your birthday (optional)': 'تاريخ ميلادك (اختياري)',
  Day: 'اليوم',
  Month: 'الشهر',
  'No year needed.': 'لا حاجة لذكر السنة.',
  "{venue} will see your name, email and when you visited and where you sat, so they can welcome you back. Your chats stay private: nobody but you and the person you're talking to can read them.":
    'سيرى {venue} اسمك وبريدك الإلكتروني ووقت زيارتك ومكان جلوسك ليرحّب بك مجدداً. تبقى محادثاتك خاصة: لا يقرأها أحد سواك والشخص الذي تتحدث معه.',
  "{venue} will see your name, email and when you checked in and which area you were in, so they can welcome you back. Your chats stay private: nobody but you and the person you're talking to can read them.":
    'سيرى {venue} اسمك وبريدك الإلكتروني ووقت تسجيلك والمنطقة التي كنت فيها ليرحّب بك مجدداً. تبقى محادثاتك خاصة: لا يقرأها أحد سواك والشخص الذي تتحدث معه.',
  'Enter the room': 'ادخل',
  'Entering…': 'جارٍ الدخول…',
  'Add a name or alias so people know who they are talking to.': 'أضف اسماً أو اسماً مستعاراً ليعرف الناس مع من يتحدثون.',
  'Please choose male, female or prefer not to say.': 'يرجى الاختيار: ذكر أو أنثى أو أفضّل عدم الإفصاح.',
  'Please confirm you are 18 or over.': 'يرجى تأكيد أن عمرك 18 عاماً أو أكثر.',
  'Something went wrong. Please try again.': 'حدث خطأ ما. يرجى المحاولة مرة أخرى.',
  'Not open yet': 'لم يُفتح بعد',
  'This event has finished': 'انتهت هذه الفعالية',
  'Your connections': 'معارفك',

  // The room
  '{here} people here tonight · {open} open to chat': '{here} أشخاص هنا الليلة · {open} متاحون للدردشة',
  '{here} people here tonight': '{here} أشخاص هنا الليلة',
  'Tonight’s icebreaker': 'سؤال الليلة لكسر الجليد',
  'Answer in the group': 'أجب في الدردشة الجماعية',
  'AI host': 'مضيف ذكي',
  'Seren is Serendine’s AI host. It only joins the group chat, never your private chats.': 'سيرين هي المضيفة الذكية من Serendine. تشارك في الدردشة الجماعية فقط، ولا تصل أبداً إلى محادثاتك الخاصة.',
  'Everyone who is open to chat here can read the group. Private chats stay encrypted. Group messages are cleared after the night.':
    'يمكن لكل من هو متاح للدردشة هنا قراءة الدردشة الجماعية. تبقى المحادثات الخاصة مشفّرة، وتُحذف رسائل المجموعة بعد انتهاء الليلة.',
  'Nobody has said anything yet. Break the ice: say hello to the room.': 'لم يقل أحد شيئاً بعد. اكسر الجليد وألقِ التحية على الجميع.',
  Leave: 'مغادرة',
  People: 'الأشخاص',
  'Group chat': 'الدردشة الجماعية',
  Service: 'الخدمة',
  Info: 'معلومات',
  'Open to chat': 'متاح للدردشة',
  'Visible as {name} · {mode}': 'ظاهر باسم {name} · {mode}',
  "You're hidden. Nobody can message you.": 'أنت مخفي. لا يمكن لأحد مراسلتك.',
  'Switch on Open to chat to join the group chat for everyone here.': 'فعّل «متاح للدردشة» للانضمام إلى الدردشة الجماعية لكل الموجودين هنا.',
  'Your photo': 'صورتك',
  'Add a selfie (optional)': 'أضف صورة سيلفي (اختياري)',
  'Shown only to people open to chat here tonight. Deleted when you leave.': 'تظهر فقط لمن هم متاحون للدردشة هنا الليلة، وتُحذف عند مغادرتك.',
  'Saving…': 'جارٍ الحفظ…',
  Retake: 'إعادة الالتقاط',
  'Take selfie': 'التقط سيلفي',
  Remove: 'إزالة',
  'Redeemed · {code}. Enjoy!': 'تم الاستخدام · {code}. استمتع!',
  'Show this to your server at {where} to redeem.': 'أظهر هذا للنادل في {where} للاستفادة من العرض.',
  'Your chats': 'محادثاتك',
  'New message': 'رسالة جديدة',
  Connected: 'متصلان',
  'Tap to open': 'اضغط للفتح',
  'Open to chat now · {n}': 'متاحون للدردشة الآن · {n}',
  "Nobody else is open yet. We'll show them here as soon as they switch on.": 'لا أحد غيرك متاح بعد. سنعرضهم هنا فور تفعيلهم.',
  'It works both ways': 'الأمر متبادل',
  "Switch on Open to chat to see who else is open. Until then, nobody knows you're here.":
    'فعّل «متاح للدردشة» لترى من غيرك متاح. حتى ذلك الحين، لا أحد يعرف أنك هنا.',
  'Your connections from other nights': 'معارفك من ليالٍ أخرى',
  'See the menu': 'عرض قائمة الطعام',
  'See the programme': 'عرض البرنامج',
  'Tonight’s menu from {venue}': 'قائمة الليلة من {venue}',
  'From {venue}': 'من {venue}',
  'The menu isn’t online yet. Ask your server.': 'القائمة غير متاحة بعد. اسأل النادل.',
  'The programme isn’t online yet.': 'البرنامج غير متاح بعد.',
  'Ask the staff': 'اطلب من الطاقم',
  'Call a waiter': 'نادِ النادل',
  'Waiter called': 'تم نداء النادل',
  'Bring the bill': 'أحضر الفاتورة',
  'Bill requested': 'تم طلب الفاتورة',
  'Water please': 'ماء من فضلك',
  'Water requested': 'تم طلب الماء',
  'Your requests': 'طلباتك',
  'Sent to staff': 'أُرسل إلى الطاقم',
  'On the way': 'في الطريق',
  Done: 'تم',
  Cancelled: 'أُلغي',
  Cancel: 'إلغاء',
  'Requests go straight to the staff screen with your table number. Pay with your server as usual.':
    'تصل الطلبات مباشرة إلى شاشة الطاقم مع رقم طاولتك. ادفع للنادل كالمعتاد.',
  'That did not send. Please try again.': 'لم يُرسل. يرجى المحاولة مرة أخرى.',
  'That photo did not upload. Please try again.': 'لم يتم رفع الصورة. يرجى المحاولة مرة أخرى.',

  // Chat
  'Back to the room': 'العودة',
  Encrypted: 'مشفّرة',
  'End-to-end encrypted': 'مشفّرة بين الطرفين',
  "This message can't be read on this device.": 'لا يمكن قراءة هذه الرسالة على هذا الجهاز.',
  "Tables shared. {name} is at Table {their}. You're at Table {mine}.": 'تمت مشاركة الطاولات. {name} على الطاولة {their}، وأنت على الطاولة {mine}.',
  "Locations shared. {name} is in {their}. You're in {mine}.": 'تمت مشاركة المكانين. {name} في {their}، وأنت في {mine}.',
  'You offered to share tables. Nothing is revealed until {name} agrees.': 'عرضت مشاركة الطاولات. لن يُكشف شيء حتى يوافق {name}.',
  'You offered to share where you are. Nothing is revealed until {name} agrees.': 'عرضت مشاركة مكانك. لن يُكشف شيء حتى يوافق {name}.',
  '{name} would like to share tables.': 'يرغب {name} في مشاركة الطاولات.',
  '{name} would like to share where you both are.': 'يرغب {name} في مشاركة مكانكما.',
  'Connected. This chat stays after you both leave.': 'أنتما متصلان. تبقى هذه المحادثة بعد مغادرتكما.',
  'You asked to keep in touch. Waiting for {name}.': 'طلبت البقاء على تواصل. بانتظار {name}.',
  '{name} would like to keep in touch after tonight.': 'يرغب {name} في البقاء على تواصل بعد الليلة.',
  'Share where I am': 'شارك مكاني',
  'Offer to share where we are': 'اعرض مشاركة مكانينا',
  'Share tables': 'شارك الطاولات',
  'Offer to share tables': 'اعرض مشاركة الطاولات',
  'Keep in touch': 'ابقَ على تواصل',
  'Ask to keep in touch': 'اطلب البقاء على تواصل',
  'Switching…': 'جارٍ التبديل…',
  'Use chat on this device': 'استخدم الدردشة على هذا الجهاز',
  'You checked in on another device, so these messages can only be read there. You can move chat to this device instead: new messages will appear here, and the other device will stop receiving them.':
    'سجّلت حضورك على جهاز آخر، لذا لا يمكن قراءة هذه الرسائل إلا هناك. يمكنك نقل الدردشة إلى هذا الجهاز: ستظهر الرسائل الجديدة هنا، وسيتوقف الجهاز الآخر عن استلامها.',
  'Start with something easy: ask about their order, or what brings them here tonight. Messages are encrypted; only the two of you can read them.':
    'ابدأ بشيء بسيط: اسأل عن طلبهم، أو عمّا جاء بهم الليلة. الرسائل مشفّرة؛ لا يقرأها سواكما.',
  Message: 'رسالة',
  'Say hello…': 'قل مرحباً…',
  Send: 'إرسال',
  'Ignore & block': 'تجاهل وحظر',
  Report: 'إبلاغ',
  'Block {name}?': 'حظر {name}؟',
  "They won't be able to see or message you again, and they won't be told.": 'لن يتمكن من رؤيتك أو مراسلتك مجدداً، ولن يتم إخباره.',
  Block: 'حظر',
  'Report {name}': 'الإبلاغ عن {name}',
  "We'll block them for you. Your recent messages in this chat are sent with the report so we can review it.":
    'سنحظره نيابةً عنك. تُرسل رسائلك الأخيرة في هذه الدردشة مع البلاغ لنتمكن من مراجعته.',
  'What happened? (optional)': 'ماذا حدث؟ (اختياري)',
  'Block & report': 'حظر وإبلاغ',
  'Slow down a little, then try again.': 'تمهّل قليلاً ثم حاول مرة أخرى.',
  'That did not work. Please try again.': 'لم ينجح ذلك. يرجى المحاولة مرة أخرى.',

  // Group chat
  Close: 'إغلاق',
  'Message the room': 'راسل الجميع',
  'Say something to the room…': 'قل شيئاً للجميع…',
  "We'll block them for you and send this message with your report.": 'سنحظره نيابةً عنك ونرسل هذه الرسالة مع بلاغك.',

  // Drinks
  'Send a drink': 'أرسل مشروباً',
  'Send {name} a drink': 'أرسل مشروباً إلى {name}',
  "They can accept or say no thanks. If they accept, it's added to your bill.": 'يمكنه القبول أو الاعتذار. إذا قبل، يُضاف المشروب إلى فاتورتك.',
  'Note for the staff (optional)': 'ملاحظة للطاقم (اختياري)',
  "e.g. whatever they're drinking": 'مثلاً: نفس ما يشربه',
  'Sending…': 'جارٍ الإرسال…',
  'Offer drink': 'اعرض المشروب',
  '{name} would like to buy you a drink': 'يرغب {name} في دعوتك إلى مشروب',
  'No thanks': 'لا، شكراً',
  Accept: 'قبول',
  'Drink from {name}': 'مشروب من {name}',
  'Drink for {name}': 'مشروب إلى {name}',
  'Accepted · on its way': 'تم القبول · في الطريق',
  'Delivered. Cheers!': 'تم التقديم. في صحتك!',
  'You said no thanks': 'اعتذرت عن القبول',
  Withdrawn: 'تم السحب',
  'Waiting for them to accept': 'بانتظار القبول',
  'Accepted · staff will bring it over': 'تم القبول · سيحضره الطاقم',
  'They said no thanks': 'اعتذر عن القبول',
  Withdraw: 'سحب',
  'Drink offered to {name}. If they accept, staff will bring it over and add it to your bill.':
    'تم عرض المشروب على {name}. إذا قبل، سيحضره الطاقم ويُضاف إلى فاتورتك.',

  // Venue messages
  'Last orders': 'الطلبات الأخيرة',
  'Happy hour': 'ساعة التخفيضات',
  'Running low': 'الكمية تنفد',
  Special: 'عرض خاص',
  'From the venue': 'من المكان',
  'just now': 'الآن',
  '{n} min ago': 'قبل {n} دقيقة',
  Dismiss: 'إخفاء',
  "Turn {venue}'s notifications back on": 'أعد تشغيل إشعارات {venue}',
  'Mute notifications from {venue}': 'كتم إشعارات {venue}',

  // Notifications card
  'Turn on notifications': 'تفعيل الإشعارات',
  'Turning on…': 'جارٍ التفعيل…',
  'Notifications on': 'الإشعارات مفعّلة',
  'Send test': 'إرسال تجربة',
  'Sound on': 'الصوت مفعّل',
  'Sound off': 'الصوت مغلق',
  'Alerts play while this screen is open': 'تعمل التنبيهات أثناء فتح هذه الشاشة',
  'Get a notification when someone messages you, sends you a drink, or staff are on their way, even with your phone locked.':
    'احصل على إشعار عندما يراسلك أحد أو يرسل لك مشروباً أو يكون الطاقم في الطريق، حتى عندما يكون هاتفك مقفلاً.',

  // After the visit
  'How was tonight?': 'كيف كانت الليلة؟',
  'How was it?': 'كيف كانت التجربة؟',
  'One tap. It helps {venue} look after you next time.': 'نقرة واحدة تساعد {venue} على الاهتمام بك أكثر في المرة القادمة.',
  Skip: 'تخطٍّ',
  'So glad you enjoyed it.': 'سعداء أنك استمتعت.',
  'Thanks for being honest.': 'شكراً على صراحتك.',
  'Would you share that on Google?': 'هل تشارك رأيك على Google؟',
  'Reviews make a real difference to {venue}. It takes a minute.': 'التقييمات تُحدث فرقاً حقيقياً لـ {venue}. لن يستغرق الأمر سوى دقيقة.',
  'Leave a Google review': 'اكتب تقييماً على Google',
  'Anything you’d like the team to know? (optional)': 'هل هناك ما تود أن يعرفه الفريق؟ (اختياري)',
  'What could {venue} do better?': 'ما الذي يمكن أن يحسّنه {venue}؟',
  'Shout out a great server, a favourite dish…': 'أشِد بنادل رائع أو طبق أعجبك…',
  'Only the manager sees this.': 'لا يرى هذا سوى المدير.',
  'Goes privately to the manager with your name and table.': 'يُرسل بشكل خاص إلى المدير مع اسمك ورقم طاولتك.',
  'Send to the manager': 'أرسل إلى المدير',
  'Or leave a public review on Google': 'أو اكتب تقييماً علنياً على Google',
  'Thank you.': 'شكراً لك.',
  '{venue} will see your feedback. Hope to see you again soon.': 'سيطّلع {venue} على رأيك. نأمل أن نراك قريباً.',
  'Posting tonight?': 'ستنشر الليلة؟',
  'Tag @{insta} and @serendiners in your story.': 'أشِر إلى ‎@{insta} و‎@serendiners في قصتك.',
  'Open @{insta} on Instagram': 'افتح ‎@{insta} على إنستغرام',
  'Back to Serendine': 'العودة إلى Serendine',
};

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function monthNames(lang: Lang) {
  return lang === 'ar' ? MONTHS_AR : MONTHS_EN;
}

export function translate(lang: Lang, text: string, vars?: Record<string, string | number>) {
  let out = lang === 'ar' ? (AR[text] ?? text) : text;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

export function isLang(v: unknown): v is Lang {
  return v === 'en' || v === 'ar';
}
