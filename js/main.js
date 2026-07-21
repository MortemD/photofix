//  ОБЩЕЕ
//  Импортируем утилиты из модуля utils.js: получение метаданных, форматирование размера и времени
import { getImageMetadata, formatFileSize, formatTime } from './utils.js';
//  Импортируем экземпляр API для управления задачами
import { photoAPI } from './api.js';

//  Переменная для хранения текущего загруженного файла (Blob)
let currentFile = null;
//  Переменная для хранения URL текущего загруженного файла (для отображения)
let currentFileUrl = null;
//  Переменная для хранения ID текущей задачи (для отслеживания статуса)
let currentTaskId = null;
//  Переменная для хранения времени начала задачи (для расчёта времени выполнения)
let taskStartTime = null;

//  DOM ЭЛЕМЕНТЫ ПОЛЯ С ХАРАКТЕРИСТИКАМИ
//  Получаем DOM-элемент заголовка поля "Статус" по его ID
const statusTitle = document.getElementById('statusTitle');
//  Получаем DOM-элемент значения поля "Статус" по его ID
const status = document.getElementById('statusValue');
//  Получаем DOM-элемент заголовка поля "Прогресс" по его ID
const progressTitle = document.getElementById('progressTitle');
//  Получаем DOM-элемент значения поля "Прогресс" по его ID
const progress = document.getElementById('progressValue');
//  Получаем DOM-элемент заголовка поля "Формат" по его ID
const formatTitle = document.getElementById('formatTitle');
//  Получаем DOM-элемент значения поля "Формат" по его ID
const format = document.getElementById('formatValue');
//  Получаем DOM-элемент заголовка поля "Яркость" по его ID
const brightnessTitle = document.getElementById('brightnessTitle');
//  Получаем DOM-элемент значения поля "Яркость" по его ID
const brightness = document.getElementById('brightnessValue');
//  Получаем DOM-элемент заголовка поля "Размер" по его ID
const sizeTitle = document.getElementById('sizeTitle');
//  Получаем DOM-элемент значения поля "Размер" по его ID
const size = document.getElementById('sizeValue');
//  Получаем DOM-элемент заголовка поля "Время" по его ID
const timeTitle = document.getElementById('timeTitle');
//  Получаем DOM-элемент значения поля "Время" по его ID
const time = document.getElementById('timeValue');
//  Получаем DOM-элемент заголовка поля "Разрешение" по его ID
const resolutionTitle = document.getElementById('resolutionTitle');
//  Получаем DOM-элемент значения поля "Разрешение" по его ID
const resolution = document.getElementById('resolutionValue');
//  Получаем DOM-элемент заголовка поля "Цветность" по его ID
const saturationTitle = document.getElementById('saturationTitle');
//  Получаем DOM-элемент значения поля "Цветность" по его ID
const saturation = document.getElementById('saturationValue');
//  Получаем DOM-элемент заголовка поля "Название" по его ID
const nameTitle = document.getElementById('nameTitle');
//  Получаем DOM-элемент значения поля "Название" по его ID
const name = document.getElementById('nameValue');
//  Получаем DOM-элемент заголовка поля "Контрастность" по его ID
const contrastTitle = document.getElementById('contrastTitle');
//  Получаем DOM-элемент значения поля "Контрастность" по его ID
const contrast = document.getElementById('contrastValue');

//  Получаем все элементы с классом .photo (их два: левый и правый блок)
const photoContainers = document.querySelectorAll('.photo');
//  Берём первый элемент - левый блок (для загрузки и отображения исходного фото)
const leftPhoto = photoContainers[0];
//  Берём второй элемент - правый блок (для отображения результата улучшения)
const rightPhoto = photoContainers[1];

//  Функция обновления состояния disabled у полей
function updateDisabledState() {
    //  Массив объектов, содержащих заголовок (title) и значение (value) каждого поля
    const fields = [
        { title: statusTitle, value: status },
        { title: progressTitle, value: progress },
        { title: formatTitle, value: format },
        { title: brightnessTitle, value: brightness },
        { title: sizeTitle, value: size },
        { title: timeTitle, value: time },
        { title: resolutionTitle, value: resolution },
        { title: saturationTitle, value: saturation },
        { title: nameTitle, value: name },
        { title: contrastTitle, value: contrast }
    ];
    //  Проходим по каждому полю
    fields.forEach(({ title, value }) => {
        //  Проверяем, что элементы существуют
        if (title && value) {
            //  Если значение не равно "X" (то есть данные есть), убираем класс disabled
            if (value.textContent && value.textContent !== 'X') {
                title.classList.remove('disabled');
                value.classList.remove('disabled');
            } else {
                //  Если значение равно "X" (данных нет), добавляем класс disabled
                title.classList.add('disabled');
                value.classList.add('disabled');
            }
        }
    });
}

//  Асинхронная функция обновления информации о загруженном файле
async function updateFileInfo(file) {
    //  Если файл не передан - выходим
    if (!file) return;
    try {
        //  Получаем метаданные изображения через функцию getImageMetadata из utils.js
        const metadata = await getImageMetadata(file, file.name);
        //  Обновляем поле "Название"
        if (name) name.textContent = metadata.name || 'X';
        //  Обновляем поле "Формат"
        if (format) format.textContent = metadata.format || 'X';
        //  Обновляем поле "Размер", форматируем размер через formatFileSize
        if (size) size.textContent = metadata.size ? formatFileSize(metadata.size) : 'X';
        //  Обновляем поле "Разрешение"
        if (resolution && metadata.width && metadata.height) {
            resolution.textContent = `${metadata.width}×${metadata.height} (${metadata.megapixels} Мп)`;
        } else {
            resolution.textContent = 'X';
        }
        //  Обновляем поле "Статус" на "Загружено"
        if (status) status.textContent = 'Uploaded';
        //  Сбрасываем поле "Яркость" на "X"
        if (brightness) brightness.textContent = 'X';
        //  Сбрасываем поле "Контрастность" на "X"
        if (contrast) contrast.textContent = 'X';
        //  Сбрасываем поле "Цветность" на "X"
        if (saturation) saturation.textContent = 'X';
        //  Сбрасываем поле "Время" на "X"
        if (time) time.textContent = 'X';
        //  Сбрасываем поле "Прогресс" на "0%"
        if (progress) progress.textContent = '0%';
        //  Обновляем состояние disabled у полей
        updateDisabledState();
        console.log('Информация о файле обновлена:', metadata);
    } catch (err) {
        //  В случае ошибки получения метаданных логируем и устанавливаем статус "Ошибка чтения"
        console.error('Ошибка получения метаданных:', err);
        if (status) status.textContent = 'Error data';
        updateDisabledState();
    }
}

//  Функция сброса информации о файле
function resetFileInfo() {
    //  Сбрасываем все поля на "X"
    if (status) status.textContent = 'X';
    if (progress) progress.textContent = 'X';
    if (format) format.textContent = 'X';
    if (brightness) brightness.textContent = 'X';
    if (contrast) contrast.textContent = 'X';
    if (saturation) saturation.textContent = 'X';
    if (size) size.textContent = 'X';
    if (time) time.textContent = 'X';
    if (resolution) resolution.textContent = 'X';
    if (name) name.textContent = 'X';
    //  Обновляем состояние disabled у полей
    updateDisabledState();
}

//  Функция очистки правого блока (результата)
function clearRightPhoto() {
    //  Очищаем фоновое изображение
    rightPhoto.style.backgroundImage = '';
    //  Очищаем размер фона
    rightPhoto.style.backgroundSize = '';
    //  Очищаем позицию фона
    rightPhoto.style.backgroundPosition = '';
    //  Очищаем рамку
    rightPhoto.style.border = '';
    //  Очищаем скругление углов
    rightPhoto.style.borderRadius = '';
    //  Добавляем класс empty (пустой блок)
    rightPhoto.classList.add('empty');
    //  Ищем кнопку скачивания внутри правого блока
    const downloadBtn = rightPhoto.querySelector('.download-btn');
    //  Если кнопка есть - скрываем её
    if (downloadBtn) {
        downloadBtn.style.display = 'none';
    }
}

//  КНОПКА ЗАГРУЗКИ ИЗОБРАЖЕНИЯ
//  Находим кнопку загрузки внутри левого блока (первый .simple-btn)
const uploadBtn = leftPhoto.querySelector('.simple-btn');
//  Создаём скрытый input для выбора файла через document.createElement
const fileInput = document.createElement('input');
//  Устанавливаем тип input - 'file'
fileInput.type = 'file';
//  Устанавливаем допустимые расширения файлов
fileInput.accept = '.jpg,.jpeg,.png,.heic,.bmp';
//  Скрываем input (не отображаем на странице)
fileInput.style.display = 'none';
//  Добавляем input в DOM
document.body.appendChild(fileInput);

//  Асинхронная функция загрузки фото
async function loadPhoto(file) {
    //  Если файл не передан - выходим
    if (!file) return;
    try {
        //  Логируем начало загрузки
        console.log('[UI] Загрузка файла:', file.name);

        //  Проверка размера (до 15 Мп) через createImageBitmap
        const bitmap = await createImageBitmap(file);
        //  Вычисляем количество мегапикселей
        const megapixels = (bitmap.width * bitmap.height) / 1000000;
        //  Закрываем битмап для освобождения памяти
        bitmap.close();
        //  Если мегапикселей больше 15 - показываем предупреждение и выходим
        if (megapixels > 15) {
            alert(`Слишком большое фото (${megapixels.toFixed(1)} Мп). Максимум 15 Мп.`);
            fileInput.value = '';
            return;
        }

        //  Сохраняем файл
        currentFile = file;
        //  Если уже был создан URL для предыдущего файла - освобождаем его
        if (currentFileUrl) {
            URL.revokeObjectURL(currentFileUrl);
        }
        //  Создаём URL для загруженного файла через URL.createObjectURL
        currentFileUrl = URL.createObjectURL(file);

        //  Отображение фото в левом блоке
        leftPhoto.style.backgroundImage = `url(${currentFileUrl})`;
        leftPhoto.style.backgroundSize = 'cover';
        leftPhoto.style.backgroundPosition = 'center';
        leftPhoto.style.border = '6px solid #222';
        leftPhoto.style.borderRadius = '10px';
        leftPhoto.style.width = '855px';
        leftPhoto.style.height = '568px';
        leftPhoto.style.boxSizing = 'border-box';
        //  Добавляем класс has-image (есть изображение)
        leftPhoto.classList.add('has-image');
        //  Убираем класс empty (не пустой)
        leftPhoto.classList.remove('empty');
        //  Скрываем кнопку загрузки
        uploadBtn.style.display = 'none';

        //  Находим блок с дополнительными кнопками (.added-btns) внутри левого блока
        const addedBtns = leftPhoto.querySelector('.added-btns');
        //  Если блок найден - показываем его
        if (addedBtns) {
            addedBtns.style.display = 'flex';
        }

        //  Очищаем правый блок (результат) через функцию clearRightPhoto
        clearRightPhoto();

        //  Сбрасываем ID текущей задачи
        currentTaskId = null;
        //  Сбрасываем время начала задачи
        taskStartTime = null;

        //  Обновляем информацию о файле в полях
        await updateFileInfo(file);
        //  Логируем успешную загрузку
        console.log('Загружено фото:', file.name);

    } catch (err) {
        console.error('Ошибка загрузки:', err);
        alert('Не удалось загрузить изображение');
        fileInput.value = '';
    }
}

//  Обработчик клика по кнопке загрузки - открывает диалог выбора файла
uploadBtn.addEventListener('click', () => fileInput.click());
//  Обработчик изменения input - при выборе файла вызываем loadPhoto
fileInput.addEventListener('change', async (e) => {
    //  Берём первый выбранный файл
    const file = e.target.files[0];
    //  Если файл есть - загружаем его
    if (file) await loadPhoto(file);
});

//  КНОПКА СМЕНЫ ФОТО
//  Находим кнопку смены фото внутри левого блока (вторая кнопка в .added-btns)
const changeBtn = leftPhoto.querySelector('.added-btns .simple-btn:last-child');
//  Добавляем обработчик клика (если кнопка существует, через optional chaining)
changeBtn?.addEventListener('click', () => {
    //  Логируем смену фото
    console.log('[UI] Смена фото');
    //  Очищаем левый блок
    leftPhoto.style.backgroundImage = '';
    leftPhoto.style.backgroundSize = '';
    leftPhoto.style.backgroundPosition = '';
    leftPhoto.style.border = '';
    leftPhoto.style.borderRadius = '';
    //  Убираем класс has-image
    leftPhoto.classList.remove('has-image');
    //  Добавляем класс empty (пустой)
    leftPhoto.classList.add('empty');
    //  Показываем кнопку загрузки
    uploadBtn.style.display = 'block';
    //  Находим блок с дополнительными кнопками
    const addedBtns = leftPhoto.querySelector('.added-btns');
    //  Если блок найден - скрываем его
    if (addedBtns) addedBtns.style.display = 'none';

    //  Сбрасываем информацию в полях
    resetFileInfo();
    //  Очищаем правый блок
    clearRightPhoto();

    //  Очищаем input
    fileInput.value = '';
    //  Если был создан URL - освобождаем его
    if (currentFileUrl) {
        URL.revokeObjectURL(currentFileUrl);
        currentFileUrl = null;
    }
    //  Сбрасываем все переменные состояния
    currentFile = null;
    currentTaskId = null;
    taskStartTime = null;
    //  Открываем диалог выбора файла
    fileInput.click();
    //  Логируем сброс
    console.log('Фото сброшено');
});

//  КНОПКА УЛУЧШЕНИЯ
//  Находим кнопку улучшения внутри левого блока (первая кнопка в .added-btns)
const upgradeBtn = leftPhoto.querySelector('.added-btns .simple-btn:first-child');
//  Добавляем обработчик клика (если кнопка существует)
upgradeBtn?.addEventListener('click', async () => {
    if (!currentFile) {
        alert('Сначала загрузите фото!');
        return;
    }
    //  Проверяем, не выполняется ли уже обработка
    if (currentTaskId) {
        //  Получаем статус текущей задачи через API
        const taskStatus = photoAPI.getStatus(currentTaskId);
        //  Если задача в процессе выполнения - показываем предупреждение
        if (taskStatus && ['pending', 'analyzing', 'processing'].includes(taskStatus.status)) {
            alert('Уже выполняется обработка! Подождите.');
            return;
        }
    }
    try {
        //  Логируем нажатие кнопки
        console.log('[UI] Нажата кнопка "Улучшить"');
        //  Очищаем правый блок (результат)
        clearRightPhoto();

        //  Сбрасываем параметры на "X"
        if (brightness) brightness.textContent = 'X';
        if (contrast) contrast.textContent = 'X';
        if (saturation) saturation.textContent = 'X';
        if (time) time.textContent = 'X';
        if (progress) progress.textContent = '0%';
        if (status) status.textContent = 'pending';
        //  Обновляем состояние disabled у полей
        updateDisabledState();

        //  Запоминаем время начала задачи
        taskStartTime = performance.now();
        //  Вызываем метод enhance у API для улучшения изображения
        currentTaskId = await photoAPI.enhance(currentFile);
        console.log('Задача создана:', currentTaskId);
    } catch (err) {
        //  В случае ошибки логируем и устанавливаем статус 'failed'
        console.error('Ошибка улучшения:', err);
        if (status) status.textContent = 'failed';
    }
});

//  ПОДПИСКА НА СОБЫТИЯ API
//  Подписываемся на событие изменения статуса
photoAPI.addEventListener('statusChange', (e) => {
    //  Извлекаем данные из объекта события
    const { taskId, status: taskStatus, progress: taskProgress, params, error } = e.detail;
    console.log('[UI] statusChange:', { taskId, taskStatus, taskProgress, params, error });
    //  Если есть текущая задача и ID не совпадает - игнорируем
    if (currentTaskId && taskId !== currentTaskId) return;
    //  Обновляем поле "Статус"
    if (status) status.textContent = taskStatus;
    //  Обновляем поле "Прогресс"
    if (progress) progress.textContent = `${Math.round(taskProgress)}%`;
    //  Если получены параметры - обновляем поля
    if (params) {
        //  Обновляем яркость с округлением до 3 знаков
        if (brightness) brightness.textContent = params.brightness?.toFixed(3) || 'X';
        //  Обновляем контрастность с округлением до 3 знаков
        if (contrast) contrast.textContent = params.contrast?.toFixed(3) || 'X';
        //  Обновляем цветность (насыщенность) с округлением до 3 знаков
        if (saturation) saturation.textContent = params.saturation?.toFixed(3) || 'X';
        updateDisabledState();
    }
    //  Если задача в процессе или завершена - обновляем время
    if (time && taskStartTime && (taskStatus === 'processing' || taskStatus === 'completed')) {
        //  Вычисляем прошедшее время
        const elapsed = performance.now() - taskStartTime;
        //  Форматируем время через formatTime из utils.js
        time.textContent = formatTime(elapsed);
        updateDisabledState();
    }
    //  Если пришла ошибка - устанавливаем статус 'failed'
    if (error) {
        console.error('[UI] Ошибка задачи:', error);
        status.textContent = 'failed';
    }
    //  Обновляем состояние disabled у полей
    updateDisabledState();
});

//  Подписываемся на событие завершения задачи
photoAPI.addEventListener('taskComplete', (e) => {
    const { taskId } = e.detail;
    console.log('[UI] taskComplete:', taskId);
    //  Если есть текущая задача и ID не совпадает - игнорируем
    if (currentTaskId && taskId !== currentTaskId) return;
    //  Устанавливаем статус 'completed'
    if (status) status.textContent = 'completed';
    //  Устанавливаем прогресс 100%
    if (progress) progress.textContent = '100%';
    //  Обновляем финальное время
    if (time && taskStartTime) {
        const elapsed = performance.now() - taskStartTime;
        time.textContent = formatTime(elapsed);
        updateDisabledState();
    }

    //  Получаем готовое изображение через API
    const blob = photoAPI.getResult(taskId);
    //  Если Blob существует и правый блок найден
    if (blob && rightPhoto) {
        //  Создаём URL для Blob через URL.createObjectURL
        const url = URL.createObjectURL(blob);
        //  Отображаем результат в правом блоке
        rightPhoto.style.backgroundImage = `url(${url})`;
        rightPhoto.style.backgroundSize = 'cover';
        rightPhoto.style.backgroundPosition = 'center';
        rightPhoto.style.border = '6px solid #222';
        rightPhoto.style.borderRadius = '10px';
        rightPhoto.style.boxSizing = 'border-box';
        //  Убираем класс empty (не пустой)
        rightPhoto.classList.remove('empty');
        //  Находим кнопку скачивания
        const downloadBtn = rightPhoto.querySelector('.download-btn');
        //  Если кнопка есть - показываем её
        if (downloadBtn) {
            downloadBtn.style.display = 'flex';
            //  Находим внутри кнопку .simple-btn
            const btn = downloadBtn.querySelector('.simple-btn');
            if (btn) {
                //  Клонируем кнопку, чтобы удалить старые обработчики
                const newBtn = btn.cloneNode(true);
                //  Заменяем старую кнопку на клон
                btn.parentNode.replaceChild(newBtn, btn);
                //  Добавляем новый обработчик клика
                newBtn.addEventListener('click', () => {
                    //  Создаём элемент <a> для скачивания
                    const a = document.createElement('a');
                    //  Устанавливаем href на URL изображения
                    a.href = url;
                    //  Устанавливаем имя файла для скачивания
                    a.download = `enhanced_${Date.now()}.jpg`;
                    //  Программно кликаем для запуска скачивания
                    a.click();
                });
            }
        }
    }
    //  Обновляем состояние disabled у полей
    updateDisabledState();
});

//  Подписываемся на событие готовности модели
photoAPI.addEventListener('modelReady', () => {
    console.log('ML-модель загружена и готова');
    //  Если есть статус и текущий файл - устанавливаем статус 'pending'
    if (status && currentFile) {
        status.textContent = 'pending';
    }
});

//  Подписываемся на событие ошибки API
photoAPI.addEventListener('error', (e) => {
    console.error('Ошибка в API:', e.detail.error);
    //  Устанавливаем статус 'failed'
    if (status) {
        status.textContent = 'failed';
    }
});

//  Логируем запуск приложения
console.log('Фото Фиикс запущен');