// Прототип 34: английский для текстов, переписанных простым языком. Дополняет assets/i18n-en.js.
Object.assign(window.I18N_EN=window.I18N_EN||{},{
"Правило сравнивает у событий подсистему, вид события, устройство и уточнения. Все они должны совпасть точно. Поле «в пределах» появляется, когда в правиле два события или больше.":"The rule compares the subsystem, event type, device and details of the events. All of them must match exactly. The “within” field appears when the rule has two or more events.",
"Событие на одной камере запускает действие на камере другого кластера. Это не правило. Домен хранит такие сценарии в своём документе":"An event on one camera starts an action on a camera of a different cluster. This is not a rule. The domain keeps these scenarios in its document",
"Убрать эту камеру из события «Обрыв потока камеры» или не включать оба правила одновременно":"Remove this camera from the “Camera stream broken” event, or do not enable the two rules at the same time",
"будет запускать выбранное правило. Консоль не изменит другие настройки правила.":"will start the selected rule. The console does not change the other settings of the rule.",
"консоль удалит только этот сценарий. Камеры и другие сценарии останутся.":"the console deletes only this scenario. The cameras and the other scenarios stay.",
"Документ изменился. Консоль не записала ваше изменение. Изменились:":"The document changed. The console did not save your change. Changed:",
"Условий нет. Правило выполняет действия при каждом запуске":"There are no conditions. The rule does the actions at each start",
"Правило запущено и ждёт ответ оператора":"The rule started and waits for the operator's answer",
"Для двух событий нужно окно. Окно задаёт, за сколько секунд должны произойти оба события":"Two events need a window. The window sets in how many seconds both events must occur",
"Цели правила находятся в другом домене, не в домене его сервера. Выбрать сервер из домена целей":"The targets of the rule are in a different domain from its server. Select a server from the domain of the targets",
"Окно — это время между событиями. Для одного события окно не нужно":"The window is the time between the events. One event does not need a window",
"не выполняется, если цели правила взяты из нескольких доменов":"does not run if the targets of the rule are from more than one domain",
"задать окно: секунды до или после события":"set the window: seconds before or after the event",
"Годность действия должна быть от 10 до 600 секунд":"The action validity must be from 10 to 600 seconds",
});
