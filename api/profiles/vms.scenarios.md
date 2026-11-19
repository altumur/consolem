<!-- Собрано tools/build_api.py из api/profiles/vms.scenarios.json — руками не править -->
# `vms.scenarios/1` — Сценарии между камерами

Версия 1.0 · ведёт: mockup · смотрят правку: w2c

Использует: —

Виды эталонного набора: `domain`. Предметные пути: `/units/{uid}/scenarios`, `/units/{uid}/scenarios/status`.

## Свойства

Своих свойств нет.

## Состояние (`status.observed`)

Своих свойств нет.

## Изменения

| Версия | Что |
|---|---|
| 1.0 | Новый профиль, контракт 0.29.0: пути профиля /units/{uid}/scenarios (GET, PUT — getScenarios, putScenarios) и /units/{uid}/scenarios/status (GET — getScenariosStatus) у объекта области (у VMS — домен) вместо путей /domains/{domainId}/scenarios…. Свойств нет: профиль объявляет только пути |
