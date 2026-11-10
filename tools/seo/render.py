"""Nafaf city pages — render step. Reads data/seo/cities.json (made by fetch.py) and writes, with no network:
   /city/<slug>/            English          /<lang>/city/<slug>/   ar · fr · de · ur · hi · bn (where the city has it)
   /cities/ · /<lang>/cities/   index by country        /sitemap.xml · /robots.txt
Every page carries real numbers for its own city (1991–2020 normals, rainy days, the season sentences computed from
them), the live weather, the country's official met service and links to nearby cities — no page is a renamed copy.
Run:  python3 tools/seo/render.py
"""
import json, os, math, html, re, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = json.load(open(os.path.join(ROOT, 'data', 'seo', 'cities.json'), encoding='utf-8'))
MET = json.load(open(os.path.join(ROOT, 'tools', 'seo', 'metservices.json'), encoding='utf-8'))
SITE = 'https://nafaf.online'
FAHR = {'US', 'LR', 'BS', 'KY', 'PW', 'FM', 'MH'}
TODAY = datetime.date.today().isoformat()
E = lambda s: html.escape(str(s if s is not None else ''), quote=True)

MONTHS = {
 'en': 'January February March April May June July August September October November December'.split(),
 'ar': 'يناير فبراير مارس أبريل مايو يونيو يوليو أغسطس سبتمبر أكتوبر نوفمبر ديسمبر'.split(),
 'fr': 'janvier février mars avril mai juin juillet août septembre octobre novembre décembre'.split(),
 'de': 'Januar Februar März April Mai Juni Juli August September Oktober November Dezember'.split(),
 'ur': 'جنوری فروری مارچ اپریل مئی جون جولائی اگست ستمبر اکتوبر نومبر دسمبر'.split(),
 'hi': 'जनवरी फ़रवरी मार्च अप्रैल मई जून जुलाई अगस्त सितंबर अक्टूबर नवंबर दिसंबर'.split(),
 'bn': 'জানুয়ারি ফেব্রুয়ারি মার্চ এপ্রিল মে জুন জুলাই আগস্ট সেপ্টেম্বর অক্টোবর নভেম্বর ডিসেম্বর'.split(),
}
RTL = {'ar', 'ur'}
UNIT = {'ar': ('ملم', 'كم/س'), 'ur': ('ملی میٹر', 'کلومیٹر/گھنٹہ')}
def mm(lg, v): return f'<bdi>{v} {UNIT.get(lg, ("mm", "km/h"))[0]}</bdi>'
def kmh(lg, v): return f'<bdi>{v} {UNIT.get(lg, ("mm", "km/h"))[1]}</bdi>'
T = {
 'en': dict(
  title='{c} weather & climate by month', h1='{c} weather and climate', sub='{r} · average conditions month by month, 1991–2020',
  live='Right now in {c}', loading='Loading live weather…', feels='feels like', hum='humidity', wind='wind',
  sumh='The climate of {c} in brief', hot='The warmest month is {m}, with an average high of {t}.',
  cold='The coolest month is {m}, with an average low of {t}.',
  rain='{c} gets about {r} mm of rain a year, on roughly {d} days; the wettest month is {m} ({mr} mm).',
  dry='Rain is rare in {c}: about {r} mm a year in total.', best='The most comfortable months are {ms}.',
  nobest='No month is fully mild here; the least extreme are {ms}.', heat='Summer heat is extreme: afternoons above 40° are normal in {ms}.',
  frost='Nights fall below freezing on average in {ms}.', monsoon='Most of the year\'s rain falls in {ms}.',
  tableh='Month-by-month averages', month='Month', hi='Avg high', lo='Avg low', rmm='Rain', rd='Rainy days', rh='Humidity', ws='Wind',
  chart='Average high and low temperature (lines) and monthly rain (bars)',
  cta='Follow {c} live in Nafaf', ctas='Rain alerts, radar, official warnings and your sky — free, no ads.', open='Open {c} in Nafaf',
  official='Official forecasts and warnings for {cn}', near='Nearby cities', more='More cities in {cn}', all='All cities',
  src='Sources', s1='Climate: NASA POWER daily data (MERRA-2 reanalysis), 1991–2020 averages — a ~50 km grid estimate that can differ from the nearest station by 1–3°.',
  s2='Live weather: Open-Meteo (CC BY 4.0). Place names: GeoNames (CC BY 4.0).', s3='Nafaf is not a weather service; for warnings follow your national authority.',
  home='Nafaf', cities='Cities', idxt='Weather and climate of the world\'s cities', idxs='Monthly climate averages, live weather and the official weather service for {n} cities in {k} countries.',
  desc='{c} weather now and its climate month by month: average highs {a}–{b}, {r} mm of rain a year. Warmest month {m}. Live conditions and official warnings in Nafaf.',
  privacy='Privacy', terms='Terms', wmo=['Clear', 'Mostly clear', 'Cloudy', 'Fog', 'Drizzle', 'Rain', 'Snow', 'Showers', 'Thunderstorm'], today='Today'),
 'ar': dict(
  title='طقس {c} ومناخها شهرًا بشهر', h1='طقس {c} ومناخها', sub='{r} · متوسط الأجواء شهرًا بشهر، 1991–2020',
  live='الطقس الآن في {c}', loading='جارٍ جلب الطقس الحي…', feels='المحسوسة', hum='الرطوبة', wind='الرياح',
  sumh='مناخ {c} باختصار', hot='أحرّ الشهور {m}، بمتوسط عظمى {t}.', cold='أبرد الشهور {m}، بمتوسط صغرى {t}.',
  rain='يهطل على {c} نحو {r} ملم من المطر في السنة، على قرابة {d} يومًا؛ وأكثر الشهور مطرًا {m} ({mr} ملم).',
  dry='المطر نادر في {c}: نحو {r} ملم في السنة كلها.', best='أنسب الشهور للأجواء المعتدلة: {ms}.',
  nobest='لا يوجد شهر معتدل تمامًا هنا؛ وأخفّها حدّة: {ms}.', heat='حرّ الصيف شديد: تجاوز 40° بعد الظهر أمر معتاد في {ms}.',
  frost='تنخفض الحرارة ليلًا تحت الصفر في المتوسط خلال {ms}.', monsoon='معظم مطر السنة يهطل في {ms}.',
  tableh='المتوسطات شهرًا بشهر', month='الشهر', hi='العظمى', lo='الصغرى', rmm='المطر', rd='أيام المطر', rh='الرطوبة', ws='الرياح',
  chart='متوسط الحرارة العظمى والصغرى (خطوط) والمطر الشهري (أعمدة)',
  cta='تابع طقس {c} لحظة بلحظة في نفاف', ctas='تنبيهات المطر والرادار والتحذيرات الرسمية وسماؤك — مجانًا وبلا إعلانات.', open='افتح {c} في نفاف',
  official='التنبؤات والتحذيرات الرسمية في {cn}', near='مدن قريبة', more='مدن أخرى في {cn}', all='كل المدن',
  src='المصادر', s1='المناخ: بيانات NASA POWER اليومية (إعادة تحليل MERRA-2)، متوسطات 1991–2020 — تقدير لشبكة بدقة ~50 كم قد يختلف عن أقرب محطة رصد بدرجة إلى 3 درجات.',
  s2='الطقس الحي: Open-Meteo (CC BY 4.0). أسماء الأماكن: GeoNames (CC BY 4.0).', s3='نفاف ليس جهة أرصاد رسمية؛ للتحذيرات اتبع الجهة الرسمية في بلدك.',
  home='نفاف', cities='المدن', idxt='طقس ومناخ مدن العالم', idxs='متوسطات المناخ الشهرية والطقس الحي والجهة الرسمية للأرصاد لـ {n} مدينة في {k} دولة.',
  desc='طقس {c} الآن ومناخها شهرًا بشهر: متوسط العظمى بين {a} و{b}، ونحو {r} ملم مطر في السنة. أحرّ الشهور {m}. الطقس الحي والتحذيرات الرسمية في نفاف.',
  privacy='الخصوصية', terms='الشروط', wmo=['صحو', 'صحو غالبًا', 'غائم', 'ضباب', 'رذاذ', 'مطر', 'ثلج', 'زخات', 'عاصفة رعدية'], today='اليوم'),
 'fr': dict(
  title='Météo et climat de {c} mois par mois', h1='Météo et climat de {c}', sub='{r} · conditions moyennes mois par mois, 1991–2020',
  live='En ce moment à {c}', loading='Chargement de la météo en direct…', feels='ressenti', hum='humidité', wind='vent',
  sumh='Le climat de {c} en bref', hot='Le mois le plus chaud est {m}, avec une maximale moyenne de {t}.',
  cold='Le mois le plus frais est {m}, avec une minimale moyenne de {t}.',
  rain='{c} reçoit environ {r} mm de pluie par an, sur à peu près {d} jours ; le mois le plus pluvieux est {m} ({mr} mm).',
  dry='La pluie est rare à {c} : environ {r} mm par an au total.', best='Les mois les plus agréables sont {ms}.',
  nobest='Aucun mois n\'est vraiment doux ici ; les moins extrêmes sont {ms}.', heat='La chaleur estivale est extrême : plus de 40° l\'après-midi est courant en {ms}.',
  frost='Les nuits passent en moyenne sous zéro en {ms}.', monsoon='La majeure partie de la pluie annuelle tombe en {ms}.',
  tableh='Moyennes mois par mois', month='Mois', hi='Max. moy.', lo='Min. moy.', rmm='Pluie', rd='Jours de pluie', rh='Humidité', ws='Vent',
  chart='Températures maximale et minimale moyennes (lignes) et pluie mensuelle (barres)',
  cta='Suivez {c} en direct dans Nafaf', ctas='Alertes pluie, radar, alertes officielles et votre ciel — gratuit, sans publicité.', open='Ouvrir {c} dans Nafaf',
  official='Prévisions et alertes officielles en {cn}', near='Villes proches', more='Autres villes en {cn}', all='Toutes les villes',
  src='Sources', s1='Climat : données quotidiennes NASA POWER (réanalyse MERRA-2), moyennes 1991–2020 — estimation sur une grille d\'environ 50 km, qui peut différer de la station la plus proche de 1 à 3°.',
  s2='Météo en direct : Open-Meteo (CC BY 4.0). Noms de lieux : GeoNames (CC BY 4.0).', s3='Nafaf n\'est pas un service météorologique ; pour les alertes, suivez l\'autorité nationale.',
  home='Nafaf', cities='Villes', idxt='Météo et climat des villes du monde', idxs='Moyennes climatiques mensuelles, météo en direct et service météo officiel pour {n} villes dans {k} pays.',
  desc='Météo de {c} en ce moment et climat mois par mois : maximales moyennes de {a} à {b}, {r} mm de pluie par an. Mois le plus chaud : {m}. Conditions en direct et alertes officielles dans Nafaf.',
  privacy='Confidentialité', terms='Conditions', wmo=['Dégagé', 'Plutôt dégagé', 'Nuageux', 'Brouillard', 'Bruine', 'Pluie', 'Neige', 'Averses', 'Orage'], today='Aujourd\'hui'),
 'de': dict(
  title='Wetter und Klima in {c} nach Monaten', h1='Wetter und Klima in {c}', sub='{r} · durchschnittliche Bedingungen Monat für Monat, 1991–2020',
  live='Gerade in {c}', loading='Live-Wetter wird geladen…', feels='gefühlt', hum='Luftfeuchte', wind='Wind',
  sumh='Das Klima von {c} kurz gefasst', hot='Der wärmste Monat ist der {m} mit einer durchschnittlichen Höchsttemperatur von {t}.',
  cold='Der kühlste Monat ist der {m} mit einer durchschnittlichen Tiefsttemperatur von {t}.',
  rain='In {c} fallen jährlich etwa {r} mm Regen an rund {d} Tagen; der nasseste Monat ist der {m} ({mr} mm).',
  dry='Regen ist in {c} selten: insgesamt etwa {r} mm im Jahr.', best='Die angenehmsten Monate sind {ms}.',
  nobest='Kein Monat ist hier wirklich mild; am wenigsten extrem sind {ms}.', heat='Die Sommerhitze ist extrem: Nachmittage über 40° sind im {ms} normal.',
  frost='Nachts fällt die Temperatur im Mittel unter null im {ms}.', monsoon='Der größte Teil des Jahresregens fällt im {ms}.',
  tableh='Mittelwerte Monat für Monat', month='Monat', hi='Ø Höchst', lo='Ø Tiefst', rmm='Regen', rd='Regentage', rh='Feuchte', ws='Wind',
  chart='Durchschnittliche Höchst- und Tiefsttemperatur (Linien) und monatlicher Regen (Balken)',
  cta='Verfolge {c} live in Nafaf', ctas='Regenalarme, Radar, amtliche Warnungen und dein Himmel — kostenlos, ohne Werbung.', open='{c} in Nafaf öffnen',
  official='Amtliche Vorhersagen und Warnungen in {cn}', near='Städte in der Nähe', more='Weitere Städte in {cn}', all='Alle Städte',
  src='Quellen', s1='Klima: tägliche Daten von NASA POWER (MERRA-2-Reanalyse), Mittel 1991–2020 — eine Schätzung auf einem ~50-km-Raster, die von der nächsten Station um 1–3° abweichen kann.',
  s2='Live-Wetter: Open-Meteo (CC BY 4.0). Ortsnamen: GeoNames (CC BY 4.0).', s3='Nafaf ist kein Wetterdienst; für Warnungen folge der nationalen Behörde.',
  home='Nafaf', cities='Städte', idxt='Wetter und Klima der Städte der Welt', idxs='Monatliche Klimamittel, Live-Wetter und der amtliche Wetterdienst für {n} Städte in {k} Ländern.',
  desc='Wetter in {c} jetzt und Klima nach Monaten: mittlere Höchstwerte {a} bis {b}, {r} mm Regen pro Jahr. Wärmster Monat: {m}. Live-Bedingungen und amtliche Warnungen in Nafaf.',
  privacy='Datenschutz', terms='Bedingungen', wmo=['Klar', 'Überwiegend klar', 'Bewölkt', 'Nebel', 'Niesel', 'Regen', 'Schnee', 'Schauer', 'Gewitter'], today='Heute'),
 'ur': dict(
  title='{c} کا موسم اور ماہ بہ ماہ آب و ہوا', h1='{c} کا موسم اور آب و ہوا', sub='{r} · ماہ بہ ماہ اوسط حالات، 1991–2020',
  live='{c} میں اس وقت', loading='براہِ راست موسم لوڈ ہو رہا ہے…', feels='محسوس', hum='نمی', wind='ہوا',
  sumh='{c} کی آب و ہوا مختصراً', hot='سب سے گرم مہینہ {m} ہے، اوسط زیادہ سے زیادہ درجہ حرارت {t}۔',
  cold='سب سے ٹھنڈا مہینہ {m} ہے، اوسط کم سے کم درجہ حرارت {t}۔',
  rain='{c} میں سال بھر میں تقریباً {r} ملی میٹر بارش تقریباً {d} دنوں میں ہوتی ہے؛ سب سے زیادہ بارش {m} میں ({mr} ملی میٹر)۔',
  dry='{c} میں بارش کم ہوتی ہے: سال بھر میں کل تقریباً {r} ملی میٹر۔', best='سب سے خوشگوار مہینے: {ms}۔',
  nobest='یہاں کوئی مہینہ مکمل معتدل نہیں؛ سب سے کم شدید: {ms}۔', heat='گرمیوں کی گرمی شدید ہے: {ms} میں دوپہر کو 40° سے زیادہ معمول ہے۔',
  frost='{ms} میں راتیں اوسطاً نقطۂ انجماد سے نیچے جاتی ہیں۔', monsoon='سال کی زیادہ تر بارش {ms} میں ہوتی ہے۔',
  tableh='ماہ بہ ماہ اوسط', month='مہینہ', hi='اوسط زیادہ', lo='اوسط کم', rmm='بارش', rd='بارش کے دن', rh='نمی', ws='ہوا',
  chart='اوسط زیادہ اور کم درجہ حرارت (لکیریں) اور ماہانہ بارش (کالم)',
  cta='{c} کا موسم نفاف میں براہِ راست دیکھیں', ctas='بارش کے انتباہ، ریڈار، سرکاری انتباہات اور آپ کا آسمان — مفت، بغیر اشتہار۔', open='{c} نفاف میں کھولیں',
  official='{cn} کی سرکاری پیش گوئیاں اور انتباہات', near='قریبی شہر', more='{cn} کے مزید شہر', all='تمام شہر',
  src='ماخذ', s1='آب و ہوا: NASA POWER کا روزانہ ڈیٹا (MERRA-2 ری اینالیسس)، 1991–2020 کا اوسط — تقریباً 50 کلومیٹر گرڈ کا تخمینہ جو قریبی اسٹیشن سے 1–3° مختلف ہو سکتا ہے۔',
  s2='براہِ راست موسم: Open-Meteo (CC BY 4.0)۔ مقامات کے نام: GeoNames (CC BY 4.0)۔', s3='نفاف سرکاری موسمیاتی ادارہ نہیں؛ انتباہات کے لیے اپنے ملک کے ادارے کی پیروی کریں۔',
  home='نفاف', cities='شہر', idxt='دنیا کے شہروں کا موسم اور آب و ہوا', idxs='{k} ممالک کے {n} شہروں کے لیے ماہانہ اوسط، براہِ راست موسم اور سرکاری محکمۂ موسمیات۔',
  desc='{c} کا موسم ابھی اور ماہ بہ ماہ آب و ہوا: اوسط زیادہ سے زیادہ {a} سے {b}، سالانہ {r} ملی میٹر بارش۔ سب سے گرم مہینہ {m}۔ نفاف میں براہِ راست حالات اور سرکاری انتباہات۔',
  privacy='رازداری', terms='شرائط', wmo=['صاف', 'زیادہ تر صاف', 'ابر آلود', 'دھند', 'بوندا باندی', 'بارش', 'برف', 'بوچھاڑ', 'گرج چمک'], today='آج'),
 'hi': dict(
  title='{c} का मौसम और महीनेवार जलवायु', h1='{c} का मौसम और जलवायु', sub='{r} · महीनेवार औसत स्थिति, 1991–2020',
  live='{c} में अभी', loading='लाइव मौसम लोड हो रहा है…', feels='महसूस', hum='नमी', wind='हवा',
  sumh='{c} की जलवायु संक्षेप में', hot='सबसे गर्म महीना {m} है, औसत अधिकतम तापमान {t}।', cold='सबसे ठंडा महीना {m} है, औसत न्यूनतम तापमान {t}।',
  rain='{c} में साल भर में लगभग {r} मिमी बारिश लगभग {d} दिनों में होती है; सबसे ज़्यादा बारिश {m} में ({mr} मिमी)।',
  dry='{c} में बारिश कम होती है: साल भर में कुल लगभग {r} मिमी।', best='सबसे सुहावने महीने: {ms}।',
  nobest='यहाँ कोई महीना पूरी तरह सुहावना नहीं; सबसे कम कठोर: {ms}।', heat='गर्मी बहुत तेज़ होती है: {ms} में दोपहर 40° से ऊपर सामान्य है।',
  frost='{ms} में रातें औसतन शून्य से नीचे जाती हैं।', monsoon='साल की ज़्यादातर बारिश {ms} में होती है।',
  tableh='महीनेवार औसत', month='महीना', hi='औसत अधिकतम', lo='औसत न्यूनतम', rmm='बारिश', rd='बारिश के दिन', rh='नमी', ws='हवा',
  chart='औसत अधिकतम और न्यूनतम तापमान (रेखाएँ) और मासिक बारिश (स्तंभ)',
  cta='नफ़ाफ़ में {c} का मौसम लाइव देखें', ctas='बारिश की चेतावनी, रडार, आधिकारिक चेतावनियाँ और आपका आसमान — मुफ़्त, बिना विज्ञापन।', open='{c} नफ़ाफ़ में खोलें',
  official='{cn} के आधिकारिक पूर्वानुमान और चेतावनियाँ', near='पास के शहर', more='{cn} के और शहर', all='सभी शहर',
  src='स्रोत', s1='जलवायु: NASA POWER दैनिक डेटा (MERRA-2 रीएनालिसिस), 1991–2020 का औसत — लगभग 50 किमी ग्रिड का अनुमान, जो नज़दीकी स्टेशन से 1–3° अलग हो सकता है।',
  s2='लाइव मौसम: Open-Meteo (CC BY 4.0)। स्थानों के नाम: GeoNames (CC BY 4.0)।', s3='नफ़ाफ़ आधिकारिक मौसम सेवा नहीं है; चेतावनियों के लिए अपने देश की संस्था का पालन करें।',
  home='नफ़ाफ़', cities='शहर', idxt='दुनिया के शहरों का मौसम और जलवायु', idxs='{k} देशों के {n} शहरों के लिए मासिक जलवायु औसत, लाइव मौसम और आधिकारिक मौसम सेवा।',
  desc='{c} का मौसम अभी और महीनेवार जलवायु: औसत अधिकतम {a} से {b}, सालाना {r} मिमी बारिश। सबसे गर्म महीना {m}। नफ़ाफ़ में लाइव स्थिति और आधिकारिक चेतावनियाँ।',
  privacy='गोपनीयता', terms='शर्तें', wmo=['साफ़', 'ज़्यादातर साफ़', 'बादल', 'कोहरा', 'बूँदाबाँदी', 'बारिश', 'बर्फ़', 'बौछारें', 'आँधी-तूफ़ान'], today='आज'),
 'bn': dict(
  title='{c}-এর আবহাওয়া ও মাসভিত্তিক জলবায়ু', h1='{c}-এর আবহাওয়া ও জলবায়ু', sub='{r} · মাসভিত্তিক গড় অবস্থা, 1991–2020',
  live='{c}-এ এখন', loading='লাইভ আবহাওয়া লোড হচ্ছে…', feels='অনুভূত', hum='আর্দ্রতা', wind='বাতাস',
  sumh='সংক্ষেপে {c}-এর জলবায়ু', hot='সবচেয়ে গরম মাস {m}, গড় সর্বোচ্চ তাপমাত্রা {t}।', cold='সবচেয়ে ঠান্ডা মাস {m}, গড় সর্বনিম্ন তাপমাত্রা {t}।',
  rain='{c}-এ বছরে প্রায় {r} মিমি বৃষ্টি হয়, প্রায় {d} দিনে; সবচেয়ে বেশি বৃষ্টি {m} মাসে ({mr} মিমি)।',
  dry='{c}-এ বৃষ্টি বিরল: বছরে মোট প্রায় {r} মিমি।', best='সবচেয়ে আরামদায়ক মাস: {ms}।',
  nobest='এখানে কোনো মাস পুরোপুরি মৃদু নয়; সবচেয়ে কম চরম: {ms}।', heat='গ্রীষ্মের গরম তীব্র: {ms} মাসে দুপুরে 40°-এর বেশি স্বাভাবিক।',
  frost='{ms} মাসে রাতে গড়ে তাপমাত্রা শূন্যের নিচে নামে।', monsoon='বছরের বেশিরভাগ বৃষ্টি হয় {ms} মাসে।',
  tableh='মাসভিত্তিক গড়', month='মাস', hi='গড় সর্বোচ্চ', lo='গড় সর্বনিম্ন', rmm='বৃষ্টি', rd='বৃষ্টির দিন', rh='আর্দ্রতা', ws='বাতাস',
  chart='গড় সর্বোচ্চ ও সর্বনিম্ন তাপমাত্রা (রেখা) এবং মাসিক বৃষ্টি (স্তম্ভ)',
  cta='নাফাফে {c}-এর আবহাওয়া লাইভ দেখুন', ctas='বৃষ্টির সতর্কতা, রাডার, সরকারি সতর্কবার্তা ও আপনার আকাশ — বিনামূল্যে, বিজ্ঞাপন ছাড়া।', open='নাফাফে {c} খুলুন',
  official='{cn}-এর সরকারি পূর্বাভাস ও সতর্কবার্তা', near='কাছের শহর', more='{cn}-এর আরও শহর', all='সব শহর',
  src='উৎস', s1='জলবায়ু: NASA POWER দৈনিক ডেটা (MERRA-2 রিঅ্যানালাইসিস), 1991–2020-এর গড় — প্রায় 50 কিমি গ্রিডের অনুমান, যা কাছের স্টেশন থেকে 1–3° আলাদা হতে পারে।',
  s2='লাইভ আবহাওয়া: Open-Meteo (CC BY 4.0)। স্থানের নাম: GeoNames (CC BY 4.0)।', s3='নাফাফ সরকারি আবহাওয়া সংস্থা নয়; সতর্কবার্তার জন্য আপনার দেশের কর্তৃপক্ষকে অনুসরণ করুন।',
  home='নাফাফ', cities='শহর', idxt='বিশ্বের শহরগুলোর আবহাওয়া ও জলবায়ু', idxs='{k}টি দেশের {n}টি শহরের মাসিক জলবায়ু গড়, লাইভ আবহাওয়া ও সরকারি আবহাওয়া সংস্থা।',
  desc='{c}-এর এখনকার আবহাওয়া ও মাসভিত্তিক জলবায়ু: গড় সর্বোচ্চ {a} থেকে {b}, বছরে {r} মিমি বৃষ্টি। সবচেয়ে গরম মাস {m}। নাফাফে লাইভ অবস্থা ও সরকারি সতর্কবার্তা।',
  privacy='গোপনীয়তা', terms='শর্তাবলি', wmo=['পরিষ্কার', 'প্রায় পরিষ্কার', 'মেঘলা', 'কুয়াশা', 'গুঁড়ি বৃষ্টি', 'বৃষ্টি', 'তুষার', 'ঝরো বৃষ্টি', 'বজ্রঝড়'], today='আজ'),
}
LIST_SEP = {'en': ', ', 'ar': '، ', 'fr': ', ', 'de': ', ', 'ur': '، ', 'hi': ', ', 'bn': ', '}
AND = {'en': ' and ', 'ar': ' و', 'fr': ' et ', 'de': ' und ', 'ur': ' اور ', 'hi': ' और ', 'bn': ' ও '}

def joinm(lg, ms):
    ms = list(ms)
    if len(ms) <= 1: return ''.join(ms)
    return LIST_SEP[lg].join(ms[:-1]) + AND[lg] + ms[-1]

def runs(idx):
    """month indexes → contiguous runs (wrapping Dec→Jan), e.g. [11,0,1] stays one run"""
    s = sorted(set(idx))
    if not s: return []
    R = [[s[0]]]
    for m in s[1:]:
        if m == R[-1][-1] + 1: R[-1].append(m)
        else: R.append([m])
    if len(R) > 1 and R[0][0] == 0 and R[-1][-1] == 11: R[0] = R.pop() + R[0]
    return R

def mlist(lg, idx):
    M = MONTHS[lg]; parts = []
    for r in runs(idx):
        parts.append(M[r[0]] if len(r) == 1 else (M[r[0]] + (' – ' if lg not in RTL else ' – ') + M[r[-1]]) if len(r) > 2 else joinm(lg, [M[r[0]], M[r[1]]]))
    return joinm(lg, parts)

def fdeg(c, fahr):
    if c is None: return '–'
    return f'{round(c * 9 / 5 + 32)}°F' if fahr else f'{round(c)}°'

def langs_of(v):
    return [lg for lg in ['en', 'ar', 'fr', 'de', 'ur', 'hi', 'bn'] if lg in v['names'] and v['names'][lg].get('n')]

def cname(v, lg): return (v['names'].get(lg) or v['names'].get('en') or {}).get('n') or v['geo']
def country(v, lg): return (v['names'].get(lg) or v['names'].get('en') or {}).get('c') or v['cc']
def region(v, lg):
    n = v['names'].get(lg) or v['names'].get('en') or {}
    a1 = n.get('a1'); c = n.get('c') or v['cc']
    return (a1 + ('، ' if lg in RTL else ', ') + c) if a1 and a1 != n.get('n') else c

def path(lg, slug): return (f'/city/{slug}/' if lg == 'en' else f'/{lg}/city/{slug}/')
def ipath(lg): return '/cities/' if lg == 'en' else f'/{lg}/cities/'

def km(a, b):
    r = math.pi / 180
    x = math.sin((b['lat'] - a['lat']) * r / 2) ** 2 + math.cos(a['lat'] * r) * math.cos(b['lat'] * r) * math.sin((b['lon'] - a['lon']) * r / 2) ** 2
    return 12742 * math.asin(math.sqrt(x))

def facts(v, lg, fahr):
    c = v['clim']; M = MONTHS[lg]; t = T[lg]; nm = cname(v, lg)
    tx, tn, rn, wd = c['tmax'], c['tmin'], c['rain'], c['wet']
    hot = max(range(12), key=lambda i: tx[i]); cold = min(range(12), key=lambda i: tn[i]); wet = max(range(12), key=lambda i: rn[i])
    yr = round(sum(rn)); days = round(sum(wd))
    out = [t['hot'].format(m=M[hot], t=fdeg(tx[hot], fahr)), t['cold'].format(m=M[cold], t=fdeg(tn[cold], fahr))]
    out.append(t['dry'].format(c=nm, r=yr) if yr < 80 else t['rain'].format(c=nm, r=yr, d=days, m=M[wet], mr=round(rn[wet])))
    if yr >= 400:
        top = sorted(range(12), key=lambda i: -rn[i]); acc = 0; keep = []
        for i in top:
            keep.append(i); acc += rn[i]
            if acc >= 0.6 * sum(rn): break
        if len(keep) <= 4: out.append(t['monsoon'].format(ms=mlist(lg, keep)))
    good = [i for i in range(12) if 18 <= tx[i] <= 31 and rn[i] < 90 and wd[i] < 10]
    if good and len(good) < 12: out.append(t['best'].format(ms=mlist(lg, good)))
    elif not good: out.append(t['nobest'].format(ms=mlist(lg, sorted(range(12), key=lambda i: abs(tx[i] - 25))[:3])))
    h40 = [i for i in range(12) if tx[i] >= 40]
    if h40: out.append(t['heat'].format(ms=mlist(lg, h40)))
    fr = [i for i in range(12) if tn[i] < 0]
    if fr: out.append(t['frost'].format(ms=mlist(lg, fr)))
    return out, hot, yr

def chart(v, lg, fahr):
    c = v['clim']; W, H, P = 640, 220, 34
    tx = [x * 9 / 5 + 32 if fahr else x for x in c['tmax']]; tn = [x * 9 / 5 + 32 if fahr else x for x in c['tmin']]
    lo = math.floor(min(tn) / 5) * 5; hi = math.ceil(max(tx) / 5) * 5
    if hi - lo < 10: hi = lo + 10
    rmax = max(50, max(c['rain']))
    cw = (W - 2 * P) / 12
    X = lambda i: P + cw * (i + .5)
    Y = lambda t: H - P - (t - lo) / (hi - lo) * (H - 2 * P)
    bars = ''.join(f'<rect x="{X(i) - cw * .3:.1f}" y="{H - P - r / rmax * (H - 2 * P) * .55:.1f}" width="{cw * .6:.1f}" height="{r / rmax * (H - 2 * P) * .55:.1f}" rx="3" class="br"/>' for i, r in enumerate(c['rain']))
    line = lambda arr, cl: f'<polyline class="{cl}" fill="none" points="' + ' '.join(f'{X(i):.1f},{Y(t):.1f}' for i, t in enumerate(arr)) + '"/>'
    dots = ''.join(f'<text x="{X(i):.1f}" y="{Y(t) - 7:.1f}" class="tl">{round(t)}</text>' for i, t in enumerate(tx))
    dots += ''.join(f'<text x="{X(i):.1f}" y="{Y(t) + 15:.1f}" class="tl lo">{round(t)}</text>' for i, t in enumerate(tn))
    months = ''.join(f'<text x="{X(i):.1f}" y="{H - 10}" class="ml">{E(MONTHS[lg][i][:3] if lg in ("en", "fr", "de") else i + 1)}</text>' for i in range(12))
    flip = ' transform="translate(640,0) scale(-1,1)"' if lg in RTL else ''
    # keep numbers readable when the chart is mirrored for right-to-left pages: mirror geometry, not text
    if lg in RTL:
        Xr = lambda i: W - X(i)
        bars = ''.join(f'<rect x="{Xr(i) - cw * .3:.1f}" y="{H - P - r / rmax * (H - 2 * P) * .55:.1f}" width="{cw * .6:.1f}" height="{r / rmax * (H - 2 * P) * .55:.1f}" rx="3" class="br"/>' for i, r in enumerate(c['rain']))
        line = lambda arr, cl: f'<polyline class="{cl}" fill="none" points="' + ' '.join(f'{Xr(i):.1f},{Y(t):.1f}' for i, t in enumerate(arr)) + '"/>'
        dots = ''.join(f'<text x="{Xr(i):.1f}" y="{Y(t) - 7:.1f}" class="tl">{round(t)}</text>' for i, t in enumerate(tx)) + ''.join(f'<text x="{Xr(i):.1f}" y="{Y(t) + 15:.1f}" class="tl lo">{round(t)}</text>' for i, t in enumerate(tn))
        months = ''.join(f'<text x="{Xr(i):.1f}" y="{H - 10}" class="ml">{i + 1}</text>' for i in range(12))
    return (f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="{E(T[lg]["chart"])}" class="ch">{bars}{line(tx, "lx")}{line(tn, "ln")}{dots}{months}</svg>')

CSS = """:root{--bg:#0e1626;--card:#16213a;--tx:#eef2f8;--mu:#a9b5c8;--ln:rgba(255,255,255,.1);--ac:#f2c36b;--hi:#ff8a5b;--lo:#6cb8ff;--rn:rgba(108,184,255,.35)}
@media (prefers-color-scheme:light){:root{--bg:#f4f6fa;--card:#fff;--tx:#14213a;--mu:#55627a;--ln:rgba(20,33,58,.12);--ac:#b07400;--hi:#d9531e;--lo:#1f6fc4;--rn:rgba(31,111,196,.22)}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans","Noto Naskh Arabic",Tahoma,sans-serif}
a{color:var(--ac)}main{max-width:860px;margin:0 auto;padding:16px}
.bc{font-size:13px;color:var(--mu)}.bc a{color:var(--mu)}
h1{font-size:clamp(26px,6vw,38px);line-height:1.2;margin:10px 0 4px}h2{font-size:20px;margin:0 0 10px}.sub{color:var(--mu);margin:0 0 16px}
.card{background:var(--card);border:1px solid var(--ln);border-radius:18px;padding:16px;margin:0 0 14px}
.now{display:flex;flex-wrap:wrap;align-items:center;gap:6px 18px}.now .t{font-size:44px;font-weight:800;line-height:1}.now .d{color:var(--mu);font-size:14px}
.days{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px;font-size:13px;text-align:center}.days div{background:rgba(127,127,127,.08);border-radius:12px;padding:8px 4px}
.days b{display:block;font-size:15px}
ul.f{margin:0;padding-inline-start:20px}ul.f li{margin:4px 0}
.tw{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14px;white-space:nowrap}th,td{padding:7px 8px;border-bottom:1px solid var(--ln);text-align:center}th:first-child,td:first-child{text-align:start}
td.h{color:var(--hi);font-weight:700}td.l{color:var(--lo);font-weight:700}
.ch{width:100%;height:auto;display:block}.ch .br{fill:var(--rn)}.ch .lx{stroke:var(--hi);stroke-width:3}.ch .ln{stroke:var(--lo);stroke-width:3}
.ch text{font-size:11px;text-anchor:middle;fill:var(--mu)}.ch .tl{fill:var(--hi);font-weight:700}.ch .tl.lo{fill:var(--lo)}
.cta{display:block;text-align:center;background:linear-gradient(135deg,#f2c36b,#ff9a5b);color:#1b1206;font-weight:900;padding:14px;border-radius:14px;text-decoration:none;font-size:17px;margin-top:10px}
.links{display:flex;flex-wrap:wrap;gap:8px}.links a{background:rgba(127,127,127,.1);border-radius:999px;padding:6px 12px;text-decoration:none;color:var(--tx);font-size:14px}
.src{font-size:12.5px;color:var(--mu)}footer{font-size:13px;color:var(--mu);text-align:center;padding:10px 0 30px}
.lang{font-size:13px}.lang a{margin-inline-end:10px}
.co{margin:0 0 18px}.co h2{font-size:17px;margin:14px 0 8px}"""

LIVE_JS = """(function(){var e=document.getElementById('now');if(!e)return;var D=e.dataset,L=D.lang,W=JSON.parse(D.wmo);
function w(c){return W[c===0?0:c<=2?1:c===3?2:c<=48?3:c<=57?4:c<=67?5:c<=77?6:c<=86?7:8]}
var u='https://api.open-meteo.com/v1/forecast?latitude='+D.lat+'&longitude='+D.lon+'&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=4'+(D.f?'&temperature_unit=fahrenheit&wind_speed_unit=mph':'');
fetch(u).then(function(r){return r.json()}).then(function(j){var c=j.current,d=j.daily;if(!c)return;
var h='<div class="t">'+Math.round(c.temperature_2m)+'°</div><div><b>'+w(c.weather_code)+'</b><div class="d">'+D.feels+' '+Math.round(c.apparent_temperature)+'° · '+D.hum+' '+c.relative_humidity_2m+'% · '+D.wind+' '+Math.round(c.wind_speed_10m)+' '+(D.f?'mph':D.kmh)+'</div></div>';
var g='<div class="days">';for(var i=0;i<4;i++){var dt=new Date(d.time[i]+'T12:00');var n=i?dt.toLocaleDateString(L,{weekday:'short'}):D.today;
g+='<div>'+n+'<b>'+Math.round(d.temperature_2m_max[i])+'° / '+Math.round(d.temperature_2m_min[i])+'°</b>'+w(d.weather_code[i])+(d.precipitation_probability_max[i]>=30?' · '+d.precipitation_probability_max[i]+'%':'')+'</div>'}
e.querySelector('.now').innerHTML=h;e.insertAdjacentHTML('beforeend',g+'</div>')}).catch(function(){})})();"""

def head(lg, title, desc, canon, alts, extra=''):
    links = ''.join(f'<link rel="alternate" hreflang="{a}" href="{SITE}{p}">' for a, p in alts)
    if alts: links += f'<link rel="alternate" hreflang="x-default" href="{SITE}{dict(alts).get("en", alts[0][1])}">'
    return (f'<!doctype html><html lang="{lg}" dir="{"rtl" if lg in RTL else "ltr"}"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width,initial-scale=1"><title>{E(title)}</title>'
            f'<meta name="description" content="{E(desc)}"><link rel="canonical" href="{SITE}{canon}">{links}'
            f'<meta property="og:type" content="website"><meta property="og:title" content="{E(title)}"><meta property="og:description" content="{E(desc)}">'
            f'<meta property="og:url" content="{SITE}{canon}"><meta property="og:image" content="{SITE}/icons/icon-512.png"><meta property="og:site_name" content="Nafaf">'
            f'<meta name="theme-color" content="#0e1626"><link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png">'
            f'<link rel="apple-touch-icon" href="/icons/icon-180.png"><style>{CSS}</style>{extra}</head><body><main>')

def foot(lg):
    t = T[lg]
    return (f'<footer><a href="/">{E(t["home"])}</a> · <a href="{ipath(lg)}">{E(t["all"])}</a> · <a href="/privacy.html">{E(t["privacy"])}</a> · '
            f'<a href="/terms.html">{E(t["terms"])}</a></footer></main></body></html>')

def page(slug, v, lg, near, same):
    t = T[lg]; nm = cname(v, lg); cn = country(v, lg); fahr = v['cc'] in FAHR and lg == 'en'
    c = v['clim']; fs, hot, yr = facts(v, lg, fahr)
    alts = [(a, path(a, slug)) for a in langs_of(v)]
    title = t['title'].format(c=nm) + ' | ' + ('نفاف' if lg in ('ar',) else 'Nafaf')
    desc = t['desc'].format(c=nm, a=fdeg(min(c['tmax']), fahr), b=fdeg(max(c['tmax']), fahr), r=yr, m=MONTHS[lg][hot])
    ld = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': t['home'], 'item': SITE + '/'},
            {'@type': 'ListItem', 'position': 2, 'name': t['cities'], 'item': SITE + ipath(lg)},
            {'@type': 'ListItem', 'position': 3, 'name': cn, 'item': SITE + ipath(lg) + '#' + v['cc'].lower()},
            {'@type': 'ListItem', 'position': 4, 'name': nm}]},
        {'@type': 'Place', 'name': nm, 'address': {'@type': 'PostalAddress', 'addressCountry': v['cc']},
         'geo': {'@type': 'GeoCoordinates', 'latitude': v['lat'], 'longitude': v['lon']}}]}
    h = head(lg, title, desc, path(lg, slug), alts, f'<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>')
    h += (f'<nav class="bc"><a href="/">{E(t["home"])}</a> › <a href="{ipath(lg)}">{E(t["cities"])}</a> › '
          f'<a href="{ipath(lg)}#{v["cc"].lower()}">{E(cn)}</a></nav>')
    if len(alts) > 1:
        h += '<div class="lang">' + ''.join(f'<a href="{p}" hreflang="{a}" lang="{a}">{E(cname(v, a))}</a>' for a, p in alts if a != lg) + '</div>'
    h += f'<h1>{E(t["h1"].format(c=nm))}</h1><p class="sub">{E(t["sub"].format(r=region(v, lg)))}</p>'
    h += (f'<section class="card" id="now" data-lat="{v["lat"]}" data-lon="{v["lon"]}" data-lang="{lg}" data-f="{"1" if fahr else ""}" '
          f'data-feels="{E(t["feels"])}" data-hum="{E(t["hum"])}" data-wind="{E(t["wind"])}" data-today="{E(t["today"])}" data-kmh="{E(UNIT.get(lg, ("mm", "km/h"))[1])}" data-wmo="{E(json.dumps(t["wmo"], ensure_ascii=False))}">'
          f'<h2>{E(t["live"].format(c=nm))}</h2><div class="now"><span class="d">{E(t["loading"])}</span></div></section>')
    h += f'<section class="card"><h2>{E(t["sumh"].format(c=nm))}</h2><ul class="f">' + ''.join(f'<li>{E(x)}</li>' for x in fs) + '</ul></section>'
    h += f'<section class="card"><h2>{E(t["tableh"])}</h2>{chart(v, lg, fahr)}<div class="tw"><table><thead><tr>'
    h += ''.join(f'<th>{E(x)}</th>' for x in [t['month'], t['hi'], t['lo'], t['rmm'], t['rd'], t['rh'], t['ws']]) + '</tr></thead><tbody>'
    for i in range(12):
        h += (f'<tr><td>{E(MONTHS[lg][i])}</td><td class="h">{fdeg(c["tmax"][i], fahr)}</td><td class="l">{fdeg(c["tmin"][i], fahr)}</td>'
              f'<td>{mm(lg, round(c["rain"][i]))}</td><td>{c["wet"][i]:.0f}</td><td><bdi>{c["rh"][i]}%</bdi></td><td>{kmh(lg, round(c["wind"][i]))}</td></tr>')
    h += '</tbody></table></div></section>'
    q = f'/?lat={v["lat"]:.3f}&lon={v["lon"]:.3f}&n={html.escape(nm)}&utm_source=seo&utm_medium=city'
    h += (f'<section class="card"><h2>{E(t["cta"].format(c=nm))}</h2><p style="margin:0">{E(t["ctas"])}</p>'
          f'<a class="cta" href="{E(q)}" rel="nofollow">{E(t["open"].format(c=nm))}</a></section>')
    ms = MET.get(v['cc'])
    if ms: h += f'<section class="card"><h2>{E(t["official"].format(cn=cn))}</h2><a href="https://{E(ms[1])}" rel="noopener" target="_blank">{E(ms[0])} — {E(ms[1])} ↗</a></section>'
    if near: h += f'<section class="card"><h2>{E(t["near"])}</h2><div class="links">' + ''.join(f'<a href="{path(lg if lg in langs_of(n) else "en", s)}">{E(cname(n, lg))}</a>' for s, n in near) + '</div></section>'
    if same: h += f'<section class="card"><h2>{E(t["more"].format(cn=cn))}</h2><div class="links">' + ''.join(f'<a href="{path(lg if lg in langs_of(n) else "en", s)}">{E(cname(n, lg))}</a>' for s, n in same) + '</div></section>'
    h += f'<section class="card src"><h2 style="font-size:15px">{E(t["src"])}</h2><p>{E(t["s1"])}</p><p>{E(t["s2"])}</p><p>{E(t["s3"])}</p></section>'
    h += f'<script>{LIVE_JS}</script>' + foot(lg)
    return h

def index_page(lg, items, ILANGS):
    if lg not in ('en', 'ar'): items = [x for x in items if lg in langs_of(x[1])]
    t = T[lg]; by = {}
    for s, v in items: by.setdefault(v['cc'], []).append((s, v))
    order = sorted(by, key=lambda cc: country(by[cc][0][1], lg))
    alts = [(a, ipath(a)) for a in ILANGS]
    title = t['idxt'] + ' | ' + ('نفاف' if lg == 'ar' else 'Nafaf')
    desc = t['idxs'].format(n=len(items), k=len(by))
    h = head(lg, title, desc, ipath(lg), alts)
    h += f'<nav class="bc"><a href="/">{E(t["home"])}</a></nav><h1>{E(t["idxt"])}</h1><p class="sub">{E(desc)}</p>'
    h += '<div class="lang">' + ''.join(f'<a href="{p}" hreflang="{a}">{a.upper()}</a>' for a, p in alts if a != lg) + '</div>'
    for cc in order:
        L = sorted(by[cc], key=lambda x: -x[1]['pop'])
        h += (f'<section class="co" id="{cc.lower()}"><h2>{E(country(L[0][1], lg))}</h2><div class="links">'
              + ''.join(f'<a href="{path(lg if lg in langs_of(v) else "en", s)}">{E(cname(v, lg))}</a>' for s, v in L) + '</div></section>')
    return h + foot(lg)

def write(rel, text):
    p = os.path.join(ROOT, rel.lstrip('/'), 'index.html') if rel.endswith('/') else os.path.join(ROOT, rel.lstrip('/'))
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w', encoding='utf-8').write(text)

def main():
    items = [(s, v) for s, v in DATA.items() if v.get('clim') and all(x is not None for x in v['clim']['tmax'])]
    urls = []
    for s, v in items:
        others = [(s2, v2) for s2, v2 in items if s2 != s]
        near = sorted(others, key=lambda x: km(v, x[1]))[:8]
        near = [x for x in near if km(v, x[1]) < 600][:6]
        same = [x for x in sorted(others, key=lambda x: -x[1]['pop']) if x[1]['cc'] == v['cc'] and x not in near][:10]
        for lg in langs_of(v):
            write(path(lg, s), page(s, v, lg, near, same))
            urls.append((path(lg, s), [(a, path(a, s)) for a in langs_of(v)]))
    ILANGS = [lg for lg in ['en', 'ar', 'fr', 'de', 'ur', 'hi', 'bn'] if lg in ('en', 'ar') or any(lg in langs_of(v) for s, v in items)]
    for lg in ILANGS:
        write(ipath(lg), index_page(lg, items, ILANGS))
        urls.append((ipath(lg), [(a, ipath(a)) for a in ILANGS]))
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
          f'<url><loc>{SITE}/</loc><lastmod>{TODAY}</lastmod></url>',
          f'<url><loc>{SITE}/privacy.html</loc></url>', f'<url><loc>{SITE}/terms.html</loc></url>']
    for u, alts in urls:
        sm.append(f'<url><loc>{SITE}{u}</loc><lastmod>{TODAY}</lastmod>' + ''.join(f'<xhtml:link rel="alternate" hreflang="{a}" href="{SITE}{p}"/>' for a, p in alts) + '</url>')
    sm.append('</urlset>')
    open(os.path.join(ROOT, 'sitemap.xml'), 'w', encoding='utf-8').write('\n'.join(sm))
    open(os.path.join(ROOT, 'robots.txt'), 'w').write('User-agent: *\nAllow: /\nDisallow: /portal.html\n\nSitemap: https://nafaf.online/sitemap.xml\n')
    print('cities', len(items), 'pages', len(urls))

if __name__ == '__main__':
    main()
