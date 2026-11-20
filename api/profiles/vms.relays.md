<!-- Собрано tools/build_api.py из api/profiles/vms.relays.json — руками не править -->
# `vms.relays/1` — Ретрансляторы

Версия 1.0 · ведёт: mockup · смотрят правку: w2c

Использует: —

Виды эталонного набора: `domain`. Предметные пути: `/units/{uid}/relays`, `/units/{uid}/relays/{name}`.

## Свойства

Своих свойств нет.

## Состояние (`status.observed`)

Своих свойств нет.

## Изменения

| Версия | Что |
|---|---|
| 1.0 | Новый профиль, контракт 0.29.0: пути профиля /units/{uid}/relays (GET — listRelays) и /units/{uid}/relays/{name} (GET — getRelay) у объекта области (у VMS — домен) вместо путей /domains/{domainId}/relays…. Свойств нет: профиль объявляет только пути |
