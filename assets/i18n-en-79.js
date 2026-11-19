// Английские подписи прототипа 79 (механизм без VMS): поверх assets/i18n-en.js, общий файл прототип не меняет
window.I18N_EN=Object.assign(window.I18N_EN||{},{
// Разделы приложения объявляет система (capabilities.sections)
"Система не объявила ни одного раздела.":"The system declares no sections.",
// Подписи набора agents (оркестратор агентов): разделы, раскладки и виды приходят от системы Text без ключа словаря —
// textOf переводит их text через i18n
"Агенты":"Agents","Конвейеры":"Pipelines","По моделям":"By model","По папкам":"By folder",
"Домен → папки → объекты":"Domain → folders → objects","Рабочее пространство":"Workspace",
"Конвейер":"Pipeline","Агент":"Agent","Инструмент":"Tool",
"Шаги":"Steps","Модели":"Models","Инструменты":"Tools","Задание":"Task","Запустить":"Run","Поставщик":"Provider",
"Окно, токены":"Window, tokens","Область системы":"System area",
"Агент: закончил":"Agent: finished","Агент: сбой":"Agent: failed","Конвейер: закончил":"Pipeline: finished","Конвейер: сбой":"Pipeline: failed",
// Строка условия в трассе правила: хук профиля не проверяет условие у объекта (cond.devices, code: notSupported)
"система не проверяет это условие у этого объекта":"the system does not check this condition for this object",
});
