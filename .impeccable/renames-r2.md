# Renames, round 2 prep (Ali's change list 3, item 5, ADC-LOG-781)

Ali: "If things can have a simpler name then it should be simplified." Every label below got a
shorter, plainer word in the app (src/lib/copy.ts, src/lib/i18n.ts). Applied by
`scripts/renames_r2.py`, which refuses to write unless each old label matches exactly once.
Context (which diwaniya, which seat, which table) moved into the aria-label where a short
visible word would otherwise be ambiguous for a screen reader, e.g. Remove · Bu Fahad.

Also renamed with the structure changes: the Score tab (was Score a game, سجّل لعبة -> النقاط),
Diwaniya settings -> Settings (now a part of the one Diwaniya page), the Inbox tab -> Inbox in
the top menu, and the host's note: the line 'No private messages before approval' was removed
because Messages now exist (item 2).

## English

| Key | Before | After |
|---|---|---|
| `walkIn` | Seat a walk-in guest | Add guest |
| `walkInName` | Guest's name | Guest name |
| `sitMe` | Sit me here | Sit here |
| `clearSeat` | Free the seat | Remove from seat |
| `needOneOff` | Stop the call | Stop |
| `makeRegular` | Make a regular | Make regular |
| `closeNight` | Close the night | Close night |
| `name` | Diwaniya name | Name |
| `create` | Create diwaniya | Create |
| `label` | Table name (optional) | Name (optional) |
| `score` | Score a game | Score |
| `settings` | Diwaniya settings | Settings |
| `title` | Diwaniya settings | Settings |
| `visibility` | Who sees your nights | Who sees it |
| `approval` | Approving requests | Approvals |
| `approvalOpts` | { host: 'I approve every request', regulars_auto: 'Regulars are approved automatically' } | { host: 'I approve each one', regulars_auto: 'Regulars get in straight away' } |
| `guestCap` | Most guests per night | Guest limit |
| `pinUnlock` | Location unlocks before start (minutes) | Show location (minutes before) |
| `location` | Exact location | Location |
| `saveLocation` | Save location | Save |
| `title` | Score a game | Score |
| `start` | Start scoring | Start |
| `thisRound` | This round's points | Points |
| `finishTitle` | End of the game | Finish |
| `finish` | Finish and send to the league | Finish game |
| `discard` | Discard this game | Discard game |
| `again` | New game, same players | Play again |
| `checkIn` | Take this seat | Sit |
| `pickSeat` | Pick an open seat | Pick a seat |
| `leaveSeat` | Leave the seat | Leave seat |
| `joinQueue` | Put me in the queue | Join queue |
| `leaveQueue` | Leave the queue | Leave queue |
| `report` | Report this diwaniya | Report |
| `manage` | Run the night | Manage |
| `eta` | When will you arrive? | Arriving in |
| `note` | Note to the host (optional) | Note (optional) |
| `send` | Send request | Send |
| `report` | Report this player | Report |
| `send` | Send report | Send |
| `markAll` | Mark all read | Read all |
| `signIn` | Sign-in method | Sign-in |
| `download` | Download my data | Download data |
| `deleteTitle` | Delete my account | Delete account |
| `deleteButton` | Delete my account for good | Delete account |
| `devicePings` | Pings on this device | This device |
| `pingsGuide` | Install and pings guide | Pings guide |
| `turnOff` | Turn off on this device | Turn off |
| `title` | A note to tonight's guests | Note to guests |
| `body` | Reaches only the guests you approved tonight. No private messages before approval. | Reaches only the guests you approved tonight. |
| `send` | Send the note | Send |
| `title` | Report review | Reports |
| `entry` | Report review (admin) | Reports (admin) |
| `score` | Score a game | Score |
| `scoreTable` | Score this table | Score |
| `toSeason` | Season table | Season |
| `walkIn` | Someone else (type the name) | Someone else |
| `account` | Account and profile | Account |
| `pings` | Pings and quiet hours | Pings |

## العربية

| المفتاح | قبل | بعد |
|---|---|---|
| `walkIn` | أجلس ضيفاً حاضراً | أضف ضيفاً |
| `clearSeat` | أفرغ المقعد | أزل من المقعد |
| `needOneOff` | أوقف النداء | أوقف |
| `makeRegular` | اجعله من الروّاد | من الروّاد |
| `score` | سجّل لعبة | النقاط |
| `settings` | إعدادات الديوانية | الإعدادات |
| `title` | إعدادات الديوانية | الإعدادات |
| `visibility` | من يرى لياليك | من يراها |
| `approval` | الموافقة على الطلبات | الموافقة |
| `approvalOpts` | { host: 'أوافق بنفسي على كل طلب', regulars_auto: 'الروّاد يُقبلون تلقائياً' } | { host: 'أوافق على كل طلب', regulars_auto: 'الروّاد يدخلون مباشرة' } |
| `guestCap` | أقصى عدد ضيوف في الليلة | عدد الضيوف |
| `pinUnlock` | يفتح الموقع قبل الموعد بـ (دقائق) | يظهر الموقع قبل الموعد (دقائق) |
| `location` | الموقع الدقيق | الموقع |
| `saveLocation` | احفظ الموقع | حفظ |
| `cohosts` | المشرفون المساعدون | المساعدون |
| `title` | سجّل لعبة | النقاط |
| `pack` | نوع اللعبة | اللعبة |
| `start` | ابدأ التسجيل | ابدأ |
| `thisRound` | نقاط هذه الجولة | النقاط |
| `finishTitle` | نهاية اللعبة | إنهاء |
| `finish` | أنهِ اللعبة وأرسلها للدوري | أنهِ اللعبة |
| `discard` | ألغِ هذه اللعبة | ألغِ اللعبة |
| `again` | لعبة جديدة بنفس اللاعبين | العب مرة أخرى |
| `joinQueue` | سجّلني في الدور | ادخل الدور |
| `checkIn` | اجلس في هذا المقعد | اجلس |
| `pickSeat` | اختر مقعداً شاغراً | اختر مقعداً |
| `report` | بلّغ عن هذه الديوانية | بلّغ |
| `manage` | أدر الليلة | أدرها |
| `note` | ملاحظة للمضيف (اختياري) | ملاحظة (اختياري) |
| `send` | أرسل الطلب | أرسل |
| `report` | بلّغ عن هذا اللاعب | بلّغ |
| `makeCohost` | ادعُه مشرفاً مساعداً | ادعُه مساعداً |
| `send` | أرسل البلاغ | أرسل |
| `markAll` | اعتبر الكل مقروءاً | قرأتها كلها |
| `deleteTitle` | احذف حسابي | احذف الحساب |
| `deleteButton` | احذف حسابي نهائياً | احذف الحساب |
| `download` | نزّل بياناتي | نزّل البيانات |
| `devicePings` | التنبيهات على هذا الجهاز | هذا الجهاز |
| `pingsGuide` | دليل التثبيت والتنبيهات | دليل التنبيهات |
| `turnOff` | أوقفها على هذا الجهاز | أوقفها |
| `title` | إعلان لضيوف الليلة | إعلان للضيوف |
| `body` | يصل إلى من وافقت عليهم الليلة فقط. لا رسائل خاصة قبل الموافقة. | يصل إلى من وافقت عليهم الليلة فقط. |
| `send` | أرسل الإعلان | أرسل |
| `title` | مراجعة البلاغات | البلاغات |
| `entry` | مراجعة البلاغات (للمشرف) | البلاغات (للمشرف) |
| `score` | سجّل لعبة | النقاط |
| `scoreTable` | سجّل لعبة لهذه الطاولة | النقاط |
| `toSeason` | جدول الموسم | الموسم |
| `walkIn` | شخص آخر (اكتب اسمه) | شخص آخر |
| `account` | الحساب والملف | الحساب |
| `pings` | التنبيهات وأوقات الهدوء | التنبيهات |
| `name` | اسم الديوانية | الاسم |
| `create` | أنشئ الديوانية | أنشئ |
| `label` | اسم الطاولة (اختياري) | الاسم (اختياري) |

58 English and 54 Arabic labels.
