---
phase: quick-261030-ah1
plan: 01
subsystem: frontend/webview + i18n
tags: [webview, i18n, d-34, d-09]
key-files:
  modified:
    - src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx
    - src/frontend/screens/WebView/index.tsx
    - src/frontend/screens/WebView/components/__tests__/WebviewUnavailablePanel.test.tsx
    - public/locales/*/gamelib.json (49)
    - public/locales/*/gamelib.mt.json (48)
    - .planning/todos/pending/2026-10-29-store-embed-follow-ups-off-windows.md
commits: [e66fb6780, 289271de3]
completed: 2026-10-30
---

# Quick 261030-ah1: dedicated origin reason for the D-34 deep-link panel

The D-34 deep-link escape hatch now renders `WebviewUnavailablePanel` with `reason="origin"` ("GameLib can't open this link in-app"), so supported OSes are never told their platform is the cause. The `platform` reason remains only as the unknown-platform fallback, with unchanged copy.

## Commits
- `e66fb6780` fix: panel + call site + tests + 49-catalog fill (100 paths).
- `289271de3` docs: todo item 5 closed; frontmatter now minor / windows / blocked.

## Verification
- WebView jest: 455/455 (5 new/changed tests observed RED first). `pnpm codecheck` clean. Prettier clean on the three src files.
- lint-translations:gamelib BEFORE: 2784 findings, 96 hard failures (all `webview.unavailable.origin.*`). AFTER: 2688 findings, 0 hard failures. Baseline untouched. Captures in the executor scratchpad (lint-before.txt, lint-after.txt).
- Python check: all 49 catalogs have non-empty origin.heading/body; each mt `keys[]` ends with the two keys, no duplicates.
- Prettier omitted for `public/locales/**` and the todo file: both are prettier-ignored, so `--check` would prove nothing.
- Todo frontmatter gate passes.

## Authorship / D-09 disclosure
Non-en strings are model-authored in-session (no machine-fill). Each `gamelib.mt.json` `keys[]` has the two keys appended; global `model`/`filledAt` left stale (LD-5 precedent). D-09 never-overwrite means a future machine-fill will not revisit them. Product name "GameLib" untranslated. Existing locales have no `platform.body`, so vocabulary was reused from `platform.heading` and `open-in-browser`.

## Deviations
- Locale `gamelib.mt.json` files use 2-space indent (not 4 as the plan's recipe implied); round-trip proven byte-exact with indent 2 before writing.
- Pre-existing, out of scope (not fixed): `meta/__tests__/hardcodedStringGate.test.ts` fails on `src/frontend/screens/WebView/useStoreEmbedHost.ts:9` (`gamelib:titlebar-style-applied`), a file last touched by `2fd875107` and not modified here. The other two meta suites pass.
- During execution, unrelated working-tree edits in five src files (`macArch/recovery.ts`, steam download files, `signInIdentityResync.ts`) appeared and then vanished (not mine, never staged).

## Observation for the operator
The shared `webview.unavailable.next-step` copy ("This is tracked as its own future work -- ...") still renders under the origin reason; left alone deliberately. It may read oddly for a link not meant to be embedded.

## Locale table (48)
| locale | heading | body | confidence |
|---|---|---|---|
| ar | لا يمكن لـ GameLib فتح هذا الرابط داخل التطبيق | يؤدي هذا الرابط إلى مكان لا يفتحه متصفح المتجر والويكي داخل GameLib. | medium-high |
| az | GameLib bu keçidi tətbiq daxilində aça bilmir | Bu keçid GameLib-in tətbiqdaxili mağaza və wiki brauzerinin açmadığı yerə aparır. | medium-high |
| be | GameLib не можа адкрыць гэту спасылку ў праграме | Гэта спасылка вядзе туды, дзе ўбудаваны браўзер крамы і вікі GameLib не адкрываецца. | medium-high |
| bg | GameLib не може да отвори тази връзка в приложението | Тази връзка води до място, което вграденият браузър за магазина и уикито на GameLib не отваря. | medium-high |
| br | Ne c'hall ket GameLib digeriñ al liamm-mañ en arload | Al liamm-mañ a gas d'ul lec'h ma ne zigor ket merdeer stal ha wiki GameLib en-diabarzh. | low |
| bs | GameLib ne može otvoriti ovu vezu unutar aplikacije | Ova veza vodi na mjesto koje GameLibov preglednik trgovine i wikija unutar aplikacije ne otvara. | medium-high |
| ca | GameLib no pot obrir aquest enllaç dins l'aplicació | Aquest enllaç porta a un lloc que el navegador de botiga i wiki de GameLib dins l'aplicació no obre. | medium-high |
| cs | GameLib nemůže tento odkaz otevřít v aplikaci | Tento odkaz vede na místo, které prohlížeč obchodu a wiki v aplikaci GameLib neotevírá. | medium-high |
| da | GameLib kan ikke åbne dette link i appen | Dette link fører et sted hen, som GameLibs indbyggede butik- og wiki-browser ikke åbner. | medium-high |
| de | GameLib kann diesen Link nicht in der App öffnen | Dieser Link führt an einen Ort, den der In-App-Browser für Store und Wiki von GameLib nicht öffnet. | medium-high |
| el | Το GameLib δεν μπορεί να ανοίξει αυτόν τον σύνδεσμο στην εφαρμογή | Αυτός ο σύνδεσμος οδηγεί κάπου που το πρόγραμμα περιήγησης καταστήματος και wiki του GameLib εντός της εφαρμογής δεν ανοίγει. | medium-high |
| es | GameLib no puede abrir este enlace dentro de la aplicación | Este enlace lleva a un sitio que el navegador de tienda y wiki de GameLib dentro de la aplicación no abre. | medium-high |
| et | GameLib ei saa seda linki rakenduses avada | See link viib kohta, mida GameLibi rakendusesisene poe ja wiki brauser ei ava. | medium-high |
| eu | GameLib-ek ezin du esteka hau aplikazioan ireki | Esteka honek GameLib-en app barruko denda eta wiki arakatzaileak irekitzen ez duen lekura darama. | low |
| fa | GameLib نمی‌تواند این پیوند را درون برنامه باز کند | این پیوند به جایی می‌رود که مرورگر درون‌برنامه‌ای فروشگاه و ویکی GameLib آن را باز نمی‌کند. | low |
| fi | GameLib ei voi avata tätä linkkiä sovelluksessa | Tämä linkki johtaa paikkaan, jota GameLibin sovelluksen sisäinen kaupan ja wikin selain ei avaa. | medium-high |
| fr | GameLib ne peut pas ouvrir ce lien dans l'application | Ce lien mène à un endroit que le navigateur intégré de magasin et de wiki de GameLib n'ouvre pas. | medium-high |
| ga | Ní féidir le GameLib an nasc seo a oscailt san aip | Téann an nasc seo áit nach n-osclaíonn brabhsálaí siopa agus vicí GameLib san aip. | low |
| gl | GameLib non pode abrir esta ligazón dentro da aplicación | Esta ligazón leva a un sitio que o navegador de tenda e wiki de GameLib dentro da aplicación non abre. | medium-high |
| he | GameLib לא יכול לפתוח קישור זה בתוך האפליקציה | הקישור הזה מוביל למקום שדפדפן החנות והוויקי של GameLib בתוך האפליקציה אינו פותח. | medium-high |
| hr | GameLib ne može otvoriti ovu poveznicu unutar aplikacije | Ova poveznica vodi na mjesto koje GameLibov preglednik trgovine i wikija unutar aplikacije ne otvara. | medium-high |
| hu | A GameLib nem tudja megnyitni ezt a hivatkozást az alkalmazásban | Ez a hivatkozás olyan helyre vezet, amelyet a GameLib alkalmazáson belüli áruház- és wikiböngészője nem nyit meg. | medium-high |
| id | GameLib tidak dapat membuka tautan ini di dalam aplikasi | Tautan ini mengarah ke tempat yang tidak dibuka oleh peramban toko dan wiki dalam aplikasi GameLib. | medium-high |
| it | GameLib non può aprire questo link nell'app | Questo link porta a una destinazione che il browser integrato di store e wiki di GameLib non apre. | medium-high |
| ja | GameLib はこのリンクをアプリ内で開けません | このリンクの移動先は、GameLib のアプリ内ストア・Wiki ブラウザーでは開けません。 | medium-high |
| ka | GameLib-ს ამ ბმულის აპში გახსნა არ შეუძლია | ეს ბმული ისეთ ადგილზე მიდის, რომელსაც GameLib-ის აპში ჩაშენებული მაღაზიისა და ვიკის ბრაუზერი არ ხსნის. | low |
| ko | GameLib에서 이 링크를 앱 안에서 열 수 없습니다 | 이 링크는 GameLib의 앱 내 스토어 및 위키 브라우저가 열지 않는 곳으로 연결됩니다. | medium-high |
| lt | GameLib negali atidaryti šios nuorodos programoje | Ši nuoroda veda ten, kur GameLib programoje esanti parduotuvės ir wiki naršyklė neatidaro. | medium-high |
| ml | GameLib-ന് ഈ ലിങ്ക് ആപ്പിനുള്ളിൽ തുറക്കാൻ കഴിയില്ല | ഈ ലിങ്ക് GameLib-ന്റെ ആപ്പിനുള്ളിലെ സ്റ്റോർ, വിക്കി ബ്രൗസർ തുറക്കാത്ത ഒരിടത്തേക്കാണ് പോകുന്നത്. | low |
| nb_NO | GameLib kan ikke åpne denne lenken i appen | Denne lenken fører til et sted som GameLibs innebygde butikk- og wiki-nettleser ikke åpner. | medium-high |
| nl | GameLib kan deze link niet in de app openen | Deze link leidt naar een plek die de in-app store- en wikibrowser van GameLib niet opent. | medium-high |
| pl | GameLib nie może otworzyć tego linku w aplikacji | Ten link prowadzi w miejsce, którego przeglądarka sklepu i wiki w aplikacji GameLib nie otwiera. | medium-high |
| pt | O GameLib não consegue abrir esta ligação na aplicação | Esta ligação leva a um local que o navegador de loja e wiki do GameLib dentro da aplicação não abre. | medium-high |
| pt_BR | O GameLib não consegue abrir este link no aplicativo | Este link leva a um lugar que o navegador de loja e wiki do GameLib dentro do aplicativo não abre. | medium-high |
| ro | GameLib nu poate deschide acest link în aplicație | Acest link duce undeva pe care browserul de magazin și wiki din aplicația GameLib nu îl deschide. | medium-high |
| ru | GameLib не может открыть эту ссылку в приложении | Эта ссылка ведёт туда, куда встроенный браузер магазина и вики GameLib не заходит. | medium-high |
| sk | GameLib nemôže otvoriť tento odkaz v aplikácii | Tento odkaz vedie na miesto, ktoré prehliadač obchodu a wiki v aplikácii GameLib neotvára. | medium-high |
| sl | GameLib te povezave ne more odpreti v aplikaciji | Ta povezava vodi na mesto, ki ga brskalnik trgovine in wikija znotraj aplikacije GameLib ne odpre. | medium-high |
| sr | GameLib ne može da otvori ovaj link unutar aplikacije | Ovaj link vodi na mesto koje GameLib-ov pregledač prodavnice i wiki-ja unutar aplikacije ne otvara. | medium-high |
| sv | GameLib kan inte öppna den här länken i appen | Den här länken leder till en plats som GameLibs butiks- och wikiwebbläsare i appen inte öppnar. | medium-high |
| ta | GameLib இந்த இணைப்பை ஆப்பிற்குள் திறக்க முடியாது | இந்த இணைப்பு, GameLib இன் ஆப்பிற்குள் உள்ள ஸ்டோர் மற்றும் விக்கி உலாவி திறக்காத இடத்திற்குச் செல்கிறது. | low |
| th | GameLib เปิดลิงก์นี้ในแอปไม่ได้ | ลิงก์นี้ไปยังที่ที่เบราว์เซอร์ร้านค้าและวิกิในแอปของ GameLib ไม่เปิดให้ | medium-high |
| tr | GameLib bu bağlantıyı uygulama içinde açamıyor | Bu bağlantı, GameLib'in uygulama içi mağaza ve wiki tarayıcısının açmadığı bir yere gidiyor. | medium-high |
| uk | GameLib не може відкрити це посилання в застосунку | Це посилання веде туди, куди вбудований браузер магазину та вікі GameLib не заходить. | medium-high |
| uz | GameLib bu havolani ilova ichida ocha olmaydi | Bu havola GameLib'ning ilova ichidagi do'kon va viki brauzeri ochmaydigan joyga olib boradi. | low |
| vi | GameLib không thể mở liên kết này trong ứng dụng | Liên kết này dẫn đến nơi mà trình duyệt cửa hàng và wiki trong ứng dụng của GameLib không mở được. | medium-high |
| zh_Hans | GameLib 无法在应用内打开此链接 | 此链接指向的位置不是 GameLib 应用内商店和 wiki 浏览器能打开的。 | medium-high |
| zh_Hant | GameLib 無法在應用程式內開啟此連結 | 此連結指向的位置不是 GameLib 應用程式內商店與 wiki 瀏覽器能開啟的。 | medium-high |

Low-confidence locales (less common / lower-resource, native review recommended): br, eu, fa, ga, ka, ml, ta, uz.

## Self-Check: PASSED
