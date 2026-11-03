# Вид хранилища «Облачное», производители драйвер-пака, приёмка плана добавления

- Дата: 2026-11-03
- Команда: `mockup`
- Коммит контракта: `9818b3b`
- Статус: новый

Прототип 12 (план добавления устройств) перенесён в `index.html`. В прототипе вид «Облачное» и производители драйвер-пака были константами в HTML поверх набора. В `index.html` так нельзя, поэтому константы при переносе сняты. Контракт менять не просим: оба пункта укладываются в него, нужны данные набора и правка документов.

## 1. Вид `cloud` в `reference.archiveKinds` набора `demo.json`

**Что нужно.** Запись вида рядом с `network`: те же поля, что у `network`, с `kind: "cloud"` и `address: "bucket"`. В прототипе порядок был `local, network, cloud, backup, edge, incidents`. Сервер должен принимать `POST /archives` с этим видом: сейчас вид вне списка — `422 NOT_SUPPORTED`.

**Зачем.** Интерфейс уже умеет: карточка вида, выбор провайдера из `reference.cloudProviders`, поле бакета, проверка подключения, метка S3 в дереве, создание с сервера и с домена. Без записи в наборе форма вид не предлагает, поэтому в основном макете «Облачного» нет.

**Что учесть.** `api/BACKEND.md`, «Виды хранилищ»: у w2c пять видов, `cloud` не объявляется (ADR-0112 доп. (5) п. 2). Ничего не ломается: форма показывает то, что отдал сервер, и w2c его по-прежнему не объявляет. Если вид не должен появиться и в демо, ответьте отказом: тогда код вида в `index.html` останется без данных, и решать, убирать ли его, будет владелец макета.

**Проверка.** В `tests/ui-plan.js` блок «Шестой вид» выполняется, только когда вид объявлен: появится запись — проверки включатся сами. Строка `refArchKinds…join()` там же ждёт порядок из этого пункта.

## 2. Производители драйвер-пака в `reference.deviceModels` набора `demo.json`

**Что нужно.** Добавить производителей из списка ниже с `models: []`, модель у них вводят вручную. Источник: `PROJ/ipint.driverspack_git`, `Drivers/**/*.rep`, поле `<brand>`, коммит `5141226`, без джойстиков и служебной записи. Тем, что уже есть в наборе (сравнение без учёта регистра), записи не менять.

**Зачем.** В форме «По адресу», в строке плана и при загрузке файла производитель проверяется по этому списку: строка с производителем вне списка получает ошибку и не применяется. В наборе 14 производителей, поэтому настоящие устройства из файла упираются в ошибку.

Особенно нужен `RTSP`. Камера с таким производителем заводится только по адресу потока, без IP и порта. Пока его нет в списке, его можно только вписать руками в поле производителя, а это не найти без подсказки.

**Что сломается.** Ничего. Но проверьте `tests/api-*.js` и `tests/scale-large.js`, если они считают производителей. `one-domain.json` и `large.json` собирает `tools/profile_fixture.py`.

**Проверка.** Вернуть в `tests/ui-plan.js` проверки «весь список» (больше 300 производителей, есть `RTSP`) и выбор `RTSP` автокомплитом; `текущий виден и выделен` станет проверять и производителя за первой сотней.

Список (347):

```
360Vision, 3S, Abron, ABUS, ACTi, Acumen, Adino, Advantech, Aebell, AEVision, AGRG, AiMobile, Alinking, AlphaOTM, Amatek, AMG, Ampleye B.V., AMTK, Andy, Arecont Vision, ARH, Arlotto, Asoni, ASTR, Astra, Astrohn, Aver, AverDVR, Avgit, AVIGILON, AVIGILON generic, AVIOSYS, AVTech, AVTS, Avycon, Axis, AxyCam, Balter, Basler, BCS, BestDigital, BestDVR, BestNVR, Beward, BikInform, BlacklineSafety, BOLID, Bolin Technology, Bosch, Bosch Generic, Brickcom, BSP, Byterg, Cametron, Canon, CaptureDevice, Cellinx, CERTIS, Cisco, CloudClient, CNB, Commax, Commax Complex Server, Commax generic, Commbox, ComOnyx, Compotrol, Corwus, CP Plus, D-Link, Dahua, DahuaDSS, DahuaNetSDK, DahuaSDK, Digiever, DiGieyes, DigitalWatchdog, DSSL, Dynacolor, EasyN, ECHD, Eneo, EPI, Ericsson, Etrovision, Etz, EverFocus, Everview, EVG, eVidence, EVS, FFMPEG, FINE, FineCCTV, FlexWatch, Flir, FlirAXSeries, G4S, GAI-Tronics, Ganz, GBT28181, Geovision, GFE, GIGA, GIT, Glosav, Grandstream, Grundig, Grundig CVion, Grundig SMART Line, Gunnebo, Hanwha Techwin, Hanwha Techwin generic, HawkEye, HikCentralPro, HikConnect, Hikvision, HiWatch, Holowits, Homeland Safety Systems, Honeywell, HttpListener, Huawei, HuaweiIVS, Hunda, Hunt, IDIS, iFlow, IMOU, Inaxsys Legend, Inaxsys STORM, IndigoVision, Infiniti, Infinity, Infinova, Infralan, InHot, InMotion, Intel, Intelbras, Intellico, Intelliko, Interop, Intralogic Solutions, InVid, IOBoard, IPDROM, IPDROM generic, IPS, IPTRONIC, IPux, IPV Halo Smart Sensors, IPVideo Corporation, IQeye, IRLab, iZett, J2000IP, Jasamarga, Jassun, Jovision, JVC, JVC NVR, K-New, KernelChip, KONEKT, LegacySDK, Legrand, Lesohranitel, LevelOne, LG, Li-Lin, LILIN, Linceo, Live Eye, Logitech, LTS, LTS Platinum, LTV, Luminys Basic, Luminys generic, LuminysSDK, Luna, Mago, Mango, March, Master, Mediatronix, MeritLilin, Messoa, MicroDigital, Milesight, MilesightToF, Mitsubishi, Mobotix, MOXA, Naziraty, NexusIP, NIC Tehnologii, NicTechGeneric, Nikiret, Novicam, Novus, Olvia, OlviaFTP, OMNY, OncamGrandeye, ONVIF 2.X, ONVIF generic, Optelecom, OTN Systems, Panasonic, Panasonic generic, Partizan, Patronus Laboratories Corporation, Pelco, Perfect-4, Pinetron, Pixeye, Pixord, Planet, POSLegacy, PosXml, PRESENTCO, Probe, Probe Digital, PROENG, Promelit, Provision, PSIA, Q-cam, QNAP, REDLINE, RIVA, ROKA, Rostec, RS, RTP stream device, RTSP, Rubetek, RVi, Samsung, SamsungTW, Santec, Sanyo, SCS, SEEnergy, Selea, SenstarSymphony, Sentry360, Sentryway, SenturianServerGeneric, SERVICE TELEMATIKA, SerVision, Sieza, SightlineApplications, SimpleIP, Singtel, Sinkross, SIP, SIP and RTSP, SIP Device, SIP with RTSP, SIP with Video, Smartec, SMAVID, SNR, Sony, Sophus, Spark, Spezvision, Sprut, ST, StarDot, Stkomplex, STORM, StreamLabs, Stretch, Sunell, Sunkwang, Svplus, Takex, Tamron, Tantos, Targa Systems, TARGET, Tattile, TBK, TcpListener, Teb, Techpro Security, Tecnosens, TEDD, TeleEye, Tiandy, Tibbo, Tibet, TrendNet, Trezor, True IP, TruVision, TVHelp, TVT, Tyco, Typhoon, UDP, Uniarch, Uniview, V1netIP, Vandi, Veilux, Verint, Vesta, Video Intelligent, Videosec, Videotec, ViDigi, Vido, VidoNet, Vigilate, Virtual, Virtual bench, Virtual Generic, Visiocom, Vision, VisionTek, VisioWave, VisualGate, Visualint, VITEK, Vivotek, VivotekNVR, VMsistemos, VniiaRadiation, VWEB, WatchNET, Webgate, WebPlayer, Witson, WuT, Xenics, XeronVision, Y-cam, Youngkook, Yuan, Yudor, Zavio, Zenosys
```

## 3. Критерии приёмки добавления устройств

**Что нужно.** В `api/ACCEPTANCE.md` шаги М-03, М-04 и М-05 описывают прежний интерфейс: «Добавить», вкладка «Вручную», «Импортировать». Теперь это вкладки «В сети», «По адресу», «Из файла», кнопка «В план» и одно «Применить план». Заодно проверьте `api/FRONTEND.md`: что повторить в интерфейсе, если там описан прежний мастер.

**Зачем.** Фронтенд и тестировщики сверяются по этим шагам. По старому тексту их уже не пройти.

**Что должно быть сказано.** В системе ничего не появляется до «Применить план». Применение — один `POST /devices` на все строки. Отказ остаётся в плане со своей причиной, «Повторить неудачные» отправляет только такие строки и с тем же ключом повтора, пока состав не менялся. Контракт для этого не менялся.

Сценарий поведения — `tests/ui-plan.js`.
