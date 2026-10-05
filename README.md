# Keste — SDU Intelligent Course Registration Assistant

SDU студенттеріне арналған курстарға тіркелу көмекшісі (жоба: **1.2 — Intelligent Course Registration Assistant**).
Студент **my.sdu.edu.kz аккаунтымен** (студенттік ID + портал паролі) кіреді. Сол сәтте сервер порталдан
оның ағымдағы кестесін, бағаларын және транскриптін тартып алады. Кейін студент қайшылықсыз кесте құрып,
бір батырмамен тіркеле алады.

> Демо нұсқасы (FastAPI + бір HTML файл) негізінде толық қайта жазылған: backend бұрынғыдай FastAPI,
> фронтенд — React + TypeScript.

## Мүмкіндіктер (User Story → іске асыру)

| # | User story | Қайда |
|---|------------|-------|
| US1 | Auto schedule — қалаған уақыт/демалыс күндері бойынша қайшылықсыз кесте нұсқалары, real-time фильтр | **Auto Scheduler** беті, `services/generator.py` |
| US2 | Degree progress analysis — қалған міндетті курстар | **Degree Progress**, `services/audit.py` |
| US3 | Instant prerequisite check — қызыл "Missing Prerequisite: …" белгісі, Add батырмасы өшік, corequisite тексеру (C және жоғары) | **Course Registration**, `services/registration.py` |
| US4 | Waitlist auto-enrollment — орын босағанда кезектегі #1 автоматты тіркеледі; конфликт болса өткізіп жіберіледі; financial hold болса 24 сағат беріледі | `process_waitlist` |
| US5 | Advisor approval routing — overload / prerequisite waiver, тек өз кафедрасы (RBAC), reject үшін feedback міндетті | **Approval queue** (advisor) |
| US6 | Seat alerts — толған секцияға 5-ке дейін alert, 0→1 болғанда хабарлама (in-app, браузер, e-mail) | **Waitlists & Alerts** |
| US7 | Conflict resolver — қайшылық қызыл болып белгіленеді, бос балама секциялар, бір батырмамен ауыстыру | **My Schedule** |
| US8 | Degree audit gap visualizer — категориялар бойынша диаграмма, басқанда курстар сүзіледі | Advisor → **My students** → студент |
| US9 | Course section swap — атомарлы ауыстыру, орын толса "Target section is now full", ескі секция сақталады | **My Schedule → Swap** |
| US10 | Calendar integration — тек расталған кестені .ics экспорттау немесе календарьға жазылу сілтемесі | **My Schedule → Export .ics** |
| US11 | Multi-term planner — болашақ семестрлерге жоспар, тіркелуге әсер етпейді | **Multi-term Planner** |
| US12 | Basic AI suggestions — degree gap бойынша рейтингтелген ұсыныстар | **Recommendations** |

Қосымша: e-mail арқылы тіркелу/кіру, құпиясөзді қалпына келтіру, admin панелі (SDU кестесін импорттау,
орын санын өзгерту, рөлдер мен financial hold), қараңғы режим, мобильді нұсқа, хабарламалар.

## Студенттің негізгі жолы (3 қадам)

1. **My courses** — оқыған, қазір оқып жатқан және енді оқитын сабақтар (my.sdu "My Curriculum" бетінен).
   Күзгі семестрде тек 1-3-5-7, көктемде тек 2-4-6-8 семестрдің сабақтары ұсынылады; басқалары "Later" бөлімінде.
   Керектерін белгілеп → **Build schedule**.
2. **Build schedule** — таңдалған сабақтардан қайшылықсыз кесте нұсқалары (демалыс күндері, уақыт аралығы).
3. **Register & confirm** — тіркелу, кестені растау, календарьға экспорт.

## SDU-мен интеграция қалай жұмыс істейді

1. Студент ID мен паролін енгізеді → сервер `https://my.sdu.edu.kz/loginAuth.php`-ке POST жібереді.
   Портал 2FA код сұраса, сайт кодты енгізу терезесін көрсетеді.
2. Кіргеннен кейін сервер жүктейді:
   * басты бет → аты-жөні, мамандығы;
   * `index.php?mod=schedule` + `action=showSchedule` AJAX → ағымдағы семестр кестесі (`table.clTbl`);
   * `mod=transkript` және `mod=grades` + `action=GetGrades` → бағалар мен транскрипт;
   * мәзірдегі **My Curriculum** сілтемесі → семестрлер бойынша оқу жоспары (өтілген / оқылып жатқан / алынбаған, элективтер).
3. Деректер базаға импортталады: курстар мен секциялар ортақ каталогқа қосылады, студент сол секцияларға тіркелген болып
   саналады, транскрипт degree audit пен prerequisite тексеруге қолданылады.
4. **Пароль сақталмайды** — тек бір рет порталға кіру үшін қолданылып, жадтан өшіріледі. Келесі синхрондауда
   (Profile → Sync now) пароль қайта сұралады.

Автоматты кіру мүмкін болмаса (мысалы, портал өзгерсе), Profile → *Manual import* арқылы my.sdu бетінің HTML-ін
қоюға болады; admin бүкіл кесте торын **Import from SDU** бетінен жүктей алады. Бұрынғы демодағы CSV/JSON учебный план
форматы да сақталған (Degree Progress → Import curriculum).

> ⚠️ Портал парсерлері my.sdu.edu.kz HTML құрылымы бойынша (және ашық `sdu_app` жобасының талдауы бойынша) жазылды
> және жалған порталмен тестіленді. Сервер my.sdu.edu.kz-ке желі арқылы қол жеткізе алуы керек.

## Іске қосу (локально)

Талаптар: Python 3.11+, Node.js 20+.

```bash
# 1) Backend
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
python run.py --reload                                  # http://127.0.0.1:8000

# 2) Frontend (басқа терминалда)
npm install
npm run dev                                             # http://localhost:5173 (/api → 8000)
```

Production-ға ұқсас режим: `npm run build`, содан кейін `cd backend && python run.py` — FastAPI `dist/` қалтасын өзі береді.

### Демо аккаунттар (`SEED_DEMO=true` болғанда)

| Рөл | E-mail | Пароль |
|-----|--------|--------|
| Студент (CS) | `student@sdu.demo` | `student2026` |
| Студент (Business) | `business@sdu.demo` | `student2026` |
| Advisor (CS) | `advisor.cs@sdu.demo` | `advisor2026` |
| Advisor (Business) | `advisor.bus@sdu.demo` | `advisor2026` |
| Registrar (admin) | `admin@sdu.demo` | `admin2026` (`ADMIN_PASSWORD`) |

Демо каталог SDU форматында (CSS 105, CSS 222 …) жасалған үлгі деректер. Нақты деректер студенттер SDU аккаунтымен кіргенде
және admin кестені импорттағанда толтырылады. Нақты пайдалану үшін `SEED_DEMO=false` және мықты `ADMIN_PASSWORD` қойыңыз.

## Тесттер

```bash
cd backend && python -m pytest -q      # 55 тест: US1–US12, семестр ережесі, My Curriculum парсері QA сценарийлері, SDU логин/импорт (жалған портал), auth
npm run lint && npx tsc -b             # фронтенд
```

`backend/tests/test_usXX_*.py` файлдары Excel-дегі `USxQATest` Given/When/Then сценарийлеріне сәйкес келеді.

## Deploy

Backend тұрақты диск (SQLite) немесе `DATABASE_URL` (PostgreSQL) керек, сондықтан тек фронтендке арналған хостинг (Vercel static)
жеткіліксіз. Дайын файлдар:

* `Dockerfile` — фронтендті build етіп, FastAPI-мен бірге бір контейнерде іске қосады (`/data` томы).
* `render.yaml` — Render.com-ға тегін жоспармен deploy (New → Blueprint). Тегін жоспарда диск жоқ: сервис қайта іске қосылғанда
  деректер демо күйге қайтады, ал 15 минут ешкім кірмесе сервис ұйықтап қалады (бірінші ашылуы ~1 минут). Тұрақты деректер үшін
  ақылы жоспар + диск немесе `DATABASE_URL` (PostgreSQL) керек.

Барлық баптаулар `.env.example` файлында.

## Құрылым

```
backend/
  app/
    main.py            FastAPI қосымшасы, SPA беру
    models.py          SQLAlchemy модельдері
    routers/           auth (SDU логин), registration, academics, staff (advisor/admin)
    services/          registration, generator, audit, recommend, calendar, curriculum, notify
    sdu/               my.sdu.edu.kz клиенті, HTML парсерлер, импорт
    seed.py            демо каталог
  tests/               pytest (US1–US12)
src/
  pages/               auth, student, advisor, admin беттері
  components/          Layout, WeekGrid, DraftPanel, GapChart, UI kit
  styles/              дизайн жүйесі (tokens, light/dark)
```
