// Английский прототипа 81 (docs/TEXTS.md, «Как менять текст безопасно»): подключён после assets/i18n-en.js
Object.assign(window.I18N_EN,{
  // Мост страницы подсистемы (шаг 2): problem.message отказа моста
  "Консоль не выполняет эту операцию для страницы.":"The console does not run this operation for the page.",
  "Параметр не подходит к описанию операции.":"The parameter does not match the operation description.",
  "Страница открыта только для просмотра, поэтому консоль не принимает шаги черновика.":"The page is view-only, so the console does not accept draft steps.",
  "Страница отправила больше вызовов, чем разрешает предел.":"The page sent more calls than the limit allows.",
  "Пользователь отказался в диалоге консоли.":"The user refused in the console dialog.",
  "Нет связи с сервером.":"There is no connection to the server.",
  // Диалог команды с ActionDescriptor.confirm (ключи карточки, в assets/i18n-en.js английского нет)
  "Выполнить команду?":"Run the command?",
  "Чтобы подтвердить, ввести число объектов команды":"To confirm, enter the number of objects for the command",
  // Черновик моста (задача 4): строки плана, диалог удаления, отказ «Применить»
  "Изменить «{имя}»":"Change “{имя}”",
  "Добавить: {вид} «{имя}»":"Add: {вид} “{имя}”",
  "Удалить «{имя}»":"Delete “{имя}”",
  "Перенести «{имя}» в «{родитель}»":"Move “{имя}” to “{родитель}”",
  "Папки «{имя}»":"Folders of “{имя}”",
  "Удалить объекты?":"Delete the objects?",
  "Страница вида «{вид}» просит удалить объекты.":"The page of the “{вид}” kind asks to delete objects.",
  "Вместе с ними консоль удалит вложенные объекты: {n}.":"The console also deletes their nested objects: {n}.",
  "Вместе с ними консоль удалит вложенные объекты.":"The console also deletes their nested objects.",
  "Вложенных объектов нет.":"There are no nested objects.",
  "другие объекты и шаги черновика.":"other objects and draft steps.",
  "Консоль удалит их по кнопке «Применить». До этого объекты останутся на сервере.":"The console deletes them when you click “Apply”. Until then, the objects stay on the server.",
  "Консоль не может отправить эту правку и шаги страницы одной операцией.":"The console cannot send this change and the page steps in one operation.",
});
