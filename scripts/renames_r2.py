#!/usr/bin/env python3
"""Ali's change list 3 item 5: plainer labels. Each (old, new) must match exactly once in copy.ts.
The same table is written to .impeccable/renames-r2.md by hand from this list."""
import sys

PATH = "src/lib/copy.ts"
R = [
    # ---- Arabic
    ("    walkIn: 'أجلس ضيفاً حاضراً',", "    walkIn: 'أضف ضيفاً',"),
    ("    clearSeat: 'أفرغ المقعد',", "    clearSeat: 'أزل من المقعد',"),
    ("    removeTable: 'احذف الطاولة',", "    removeTable: 'احذف الطاولة',"),
    ("    needOneOff: 'أوقف النداء',", "    needOneOff: 'أوقف',"),
    ("    makeRegular: 'اجعله من الروّاد',", "    makeRegular: 'من الروّاد',"),
    ("    score: 'سجّل لعبة',\n    settings: 'إعدادات الديوانية',", "    score: 'النقاط',\n    settings: 'الإعدادات',"),
    ("    title: 'إعدادات الديوانية',\n    basics: 'الأساسيات',", "    title: 'الإعدادات',\n    basics: 'الأساسيات',"),
    ("    visibility: 'من يرى لياليك',", "    visibility: 'من يراها',"),
    ("    approval: 'الموافقة على الطلبات',", "    approval: 'الموافقة',"),
    ("    approvalOpts: { host: 'أوافق بنفسي على كل طلب', regulars_auto: 'الروّاد يُقبلون تلقائياً' },", "    approvalOpts: { host: 'أوافق على كل طلب', regulars_auto: 'الروّاد يدخلون مباشرة' },"),
    ("    guestCap: 'أقصى عدد ضيوف في الليلة',", "    guestCap: 'عدد الضيوف',"),
    ("    pinUnlock: 'يفتح الموقع قبل الموعد بـ (دقائق)',", "    pinUnlock: 'يظهر الموقع قبل الموعد (دقائق)',"),
    ("    location: 'الموقع الدقيق',", "    location: 'الموقع',"),
    ("    saveLocation: 'احفظ الموقع',", "    saveLocation: 'حفظ',"),
    ("    cohosts: 'المشرفون المساعدون',", "    cohosts: 'المساعدون',"),
    ("    title: 'سجّل لعبة',\n    pack: 'نوع اللعبة',", "    title: 'النقاط',\n    pack: 'اللعبة',"),
    ("    start: 'ابدأ التسجيل',", "    start: 'ابدأ',"),
    ("    thisRound: 'نقاط هذه الجولة',", "    thisRound: 'النقاط',"),
    ("    finishTitle: 'نهاية اللعبة',", "    finishTitle: 'إنهاء',"),
    ("    finish: 'أنهِ اللعبة وأرسلها للدوري',", "    finish: 'أنهِ اللعبة',"),
    ("    discard: 'ألغِ هذه اللعبة',", "    discard: 'ألغِ اللعبة',"),
    ("    again: 'لعبة جديدة بنفس اللاعبين',", "    again: 'العب مرة أخرى',"),
    ("    joinQueue: 'سجّلني في الدور',", "    joinQueue: 'ادخل الدور',"),
    ("    leaveQueue: 'اخرج من الدور',", "    leaveQueue: 'اخرج من الدور',"),
    ("    leaveSeat: 'قم من المقعد',", "    leaveSeat: 'قم من المقعد',"),
    ("    checkIn: 'اجلس في هذا المقعد',", "    checkIn: 'اجلس',"),
    ("    pickSeat: 'اختر مقعداً شاغراً',", "    pickSeat: 'اختر مقعداً',"),
    ("    report: 'بلّغ عن هذه الديوانية',", "    report: 'بلّغ',"),
    ("    manage: 'أدر الليلة',", "    manage: 'أدرها',"),
    ("    note: 'ملاحظة للمضيف (اختياري)',", "    note: 'ملاحظة (اختياري)',"),
    ("    send: 'أرسل الطلب',\n    sent: 'وصل طلبك للمضيف',", "    send: 'أرسل',\n    sent: 'وصل طلبك للمضيف',"),
    ("    report: 'بلّغ عن هذا اللاعب',", "    report: 'بلّغ',"),
    ("    makeCohost: 'ادعُه مشرفاً مساعداً',", "    makeCohost: 'ادعُه مساعداً',"),
    ("    send: 'أرسل البلاغ',", "    send: 'أرسل',"),
    ("    markAll: 'اعتبر الكل مقروءاً',", "    markAll: 'قرأتها كلها',"),
    ("    deleteTitle: 'احذف حسابي',", "    deleteTitle: 'احذف الحساب',"),
    ("    deleteButton: 'احذف حسابي نهائياً',", "    deleteButton: 'احذف الحساب',"),
    ("    download: 'نزّل بياناتي',", "    download: 'نزّل البيانات',"),
    ("    devicePings: 'التنبيهات على هذا الجهاز',", "    devicePings: 'هذا الجهاز',"),
    ("    pingsGuide: 'دليل التثبيت والتنبيهات',", "    pingsGuide: 'دليل التنبيهات',"),
    ("    turnOff: 'أوقفها على هذا الجهاز',", "    turnOff: 'أوقفها',"),
    ("    title: 'إعلان لضيوف الليلة',\n    body: 'يصل إلى من وافقت عليهم الليلة فقط. لا رسائل خاصة قبل الموافقة.',", "    title: 'إعلان للضيوف',\n    body: 'يصل إلى من وافقت عليهم الليلة فقط.',"),
    ("    send: 'أرسل الإعلان',", "    send: 'أرسل',"),
    ("    title: 'مراجعة البلاغات',\n    entry: 'مراجعة البلاغات (للمشرف)',", "    title: 'البلاغات',\n    entry: 'البلاغات (للمشرف)',"),
    ("    score: 'سجّل لعبة',\n    scoreTable: 'سجّل لعبة لهذه الطاولة',", "    score: 'النقاط',\n    scoreTable: 'النقاط',"),
    ("    toSeason: 'جدول الموسم',", "    toSeason: 'الموسم',"),
    ("    walkIn: 'شخص آخر (اكتب اسمه)',", "    walkIn: 'شخص آخر',"),
    ("    account: 'الحساب والملف',\n    pings: 'التنبيهات وأوقات الهدوء',", "    account: 'الحساب',\n    pings: 'التنبيهات',"),
    ("    name: 'اسم الديوانية',\n    create: 'أنشئ الديوانية',", "    name: 'الاسم',\n    create: 'أنشئ',"),
    ("    label: 'اسم الطاولة (اختياري)',", "    label: 'الاسم (اختياري)',"),
    ("    closeNight: 'أغلق الليلة',", "    closeNight: 'أغلق الليلة',"),
    ("    walkInName: 'اسم الضيف',", "    walkInName: 'اسم الضيف',"),
    # ---- English
    ("    walkIn: 'Seat a walk-in guest',", "    walkIn: 'Add guest',"),
    ("    walkInName: \"Guest's name\",", "    walkInName: 'Guest name',"),
    ("    sitMe: 'Sit me here',", "    sitMe: 'Sit here',"),
    ("    clearSeat: 'Free the seat',", "    clearSeat: 'Remove from seat',"),
    ("    needOneOff: 'Stop the call',", "    needOneOff: 'Stop',"),
    ("    makeRegular: 'Make a regular',", "    makeRegular: 'Make regular',"),
    ("    closeNight: 'Close the night',", "    closeNight: 'Close night',"),
    ("    name: 'Diwaniya name',\n    create: 'Create diwaniya',", "    name: 'Name',\n    create: 'Create',"),
    ("    label: 'Table name (optional)',", "    label: 'Name (optional)',"),
    ("    score: 'Score a game',\n    settings: 'Diwaniya settings',", "    score: 'Score',\n    settings: 'Settings',"),
    ("    title: 'Diwaniya settings',\n    basics: 'Basics',", "    title: 'Settings',\n    basics: 'Basics',"),
    ("    visibility: 'Who sees your nights',", "    visibility: 'Who sees it',"),
    ("    approval: 'Approving requests',", "    approval: 'Approvals',"),
    ("    approvalOpts: { host: 'I approve every request', regulars_auto: 'Regulars are approved automatically' },", "    approvalOpts: { host: 'I approve each one', regulars_auto: 'Regulars get in straight away' },"),
    ("    guestCap: 'Most guests per night',", "    guestCap: 'Guest limit',"),
    ("    pinUnlock: 'Location unlocks before start (minutes)',", "    pinUnlock: 'Show location (minutes before)',"),
    ("    location: 'Exact location',", "    location: 'Location',"),
    ("    saveLocation: 'Save location',", "    saveLocation: 'Save',"),
    ("    title: 'Score a game',\n    pack: 'Game',", "    title: 'Score',\n    pack: 'Game',"),
    ("    start: 'Start scoring',", "    start: 'Start',"),
    ("    thisRound: \"This round's points\",", "    thisRound: 'Points',"),
    ("    finishTitle: 'End of the game',", "    finishTitle: 'Finish',"),
    ("    finish: 'Finish and send to the league',", "    finish: 'Finish game',"),
    ("    discard: 'Discard this game',", "    discard: 'Discard game',"),
    ("    again: 'New game, same players',", "    again: 'Play again',"),
    ("    checkIn: 'Take this seat',", "    checkIn: 'Sit',"),
    ("    pickSeat: 'Pick an open seat',", "    pickSeat: 'Pick a seat',"),
    ("    leaveSeat: 'Leave the seat',", "    leaveSeat: 'Leave seat',"),
    ("    joinQueue: 'Put me in the queue',", "    joinQueue: 'Join queue',"),
    ("    leaveQueue: 'Leave the queue',", "    leaveQueue: 'Leave queue',"),
    ("    report: 'Report this diwaniya',", "    report: 'Report',"),
    ("    manage: 'Run the night',", "    manage: 'Manage',"),
    ("    eta: 'When will you arrive?',", "    eta: 'Arriving in',"),
    ("    note: 'Note to the host (optional)',", "    note: 'Note (optional)',"),
    ("    send: 'Send request',", "    send: 'Send',"),
    ("    report: 'Report this player',", "    report: 'Report',"),
    ("    send: 'Send report',", "    send: 'Send',"),
    ("    markAll: 'Mark all read',", "    markAll: 'Read all',"),
    ("    signIn: 'Sign-in method',", "    signIn: 'Sign-in',"),
    ("    download: 'Download my data',", "    download: 'Download data',"),
    ("    deleteTitle: 'Delete my account',", "    deleteTitle: 'Delete account',"),
    ("    deleteButton: 'Delete my account for good',", "    deleteButton: 'Delete account',"),
    ("    devicePings: 'Pings on this device',", "    devicePings: 'This device',"),
    ("    pingsGuide: 'Install and pings guide',", "    pingsGuide: 'Pings guide',"),
    ("    turnOff: 'Turn off on this device',", "    turnOff: 'Turn off',"),
    ("    title: \"A note to tonight's guests\",\n    body: 'Reaches only the guests you approved tonight. No private messages before approval.',", "    title: 'Note to guests',\n    body: 'Reaches only the guests you approved tonight.',"),
    ("    send: 'Send the note',", "    send: 'Send',"),
    ("    title: 'Report review',\n    entry: 'Report review (admin)',", "    title: 'Reports',\n    entry: 'Reports (admin)',"),
    ("    score: 'Score a game',\n    scoreTable: 'Score this table',", "    score: 'Score',\n    scoreTable: 'Score',"),
    ("    toSeason: 'Season table',", "    toSeason: 'Season',"),
    ("    walkIn: 'Someone else (type the name)',", "    walkIn: 'Someone else',"),
    ("    account: 'Account and profile',\n    pings: 'Pings and quiet hours',", "    account: 'Account',\n    pings: 'Pings',"),
]

src = open(PATH, encoding="utf-8").read()
bad = 0
for old, new in R:
    n = src.count(old)
    if n != 1:
        print(f"MATCH {n}: {old[:70]!r}")
        bad += 1
        continue
    src = src.replace(old, new)
if bad:
    sys.exit(f"{bad} renames did not match exactly once; nothing written")
open(PATH, "w", encoding="utf-8").write(src)
changed = sum(1 for o, n in R if o != n)
print(f"renamed {changed} labels ({len(R)} checked)")
