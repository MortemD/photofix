//  Импортируем утилиты из модуля utils.js для генерации идентификаторов, получения метаданных,
//  проверки форматов, конвертации HEIC/BMP, декодирования изображений, подготовки тензоров,
//  проверки размера и форматирования времени
import { generateId, getImageMetadata, isHeic, isBmp, convertHeicToJpeg, convertBmpToPng, blobToImageData, prepareTensor, isTooLarge, formatTime } from './utils.js';

//  Объявляем класс PhotoFixAPI, который расширяет EventTarget для возможности работы с событиями
class PhotoFixAPI extends EventTarget {
    constructor() {
        //  Вызываем конструктор родительского класса (EventTarget), чтобы инициализировать механизм событий
        super();
        //  Создаём коллекцию Map для хранения задач по их ID (ключ - строка taskId, значение - объект состояния задачи)
        this.tasks = new Map();
        //  Переменная для хранения ссылки на воркер модели
        this.modelWorker = null;
        //  Переменная для хранения ссылки на воркер обработки
        this.processWorker = null;
        //  Флаг готовности модели (false, пока не загружена)
        this._modelReady = false;
        //  Вызываем приватный метод инициализации воркеров
        this._initWorkers();
    }

    //  Приватный метод инициализации воркеров и ожидания готовности модели
    _initWorkers() {
        //  Оборачиваем в try...catch для перехвата ошибок создания воркеров
        try {
            this.modelWorker = new Worker('js/worker-model.js');
            this.processWorker = new Worker('js/worker-process.js', { type: 'module' });

            //  Устанавливаем обработчик сообщений от modelWorker
            this.modelWorker.onmessage = (e) => {
                //  Получаем данные из сообщения
                const data = e.data;
                //  Если тип сообщения 'ready' - модель загружена и готова
                if (data.type === 'ready') {
                    //  Устанавливаем флаг готовности модели в true
                    this._modelReady = true;
                    //  Логируем в консоль, что модель готова
                    console.log('[API] ML-модель загружена и готова');
                    //  Генерируем пользовательское событие 'modelReady' и диспатчим его
                    this.dispatchEvent(new CustomEvent('modelReady'));
                } else {
                    //  Иначе обрабатываем сообщение через приватный метод _handleModelMessage
                    this._handleModelMessage(e);
                }
            };
            //  Обработчик ошибок для modelWorker
            this.modelWorker.onerror = (e) => {
                //  Логируем ошибку в консоль
                console.error('[API] Ошибка в worker-model:', e);
                //  Диспатчим событие 'error' с деталями
                this.dispatchEvent(new CustomEvent('error', { detail: { error: 'Ошибка в ML-воркере' } }));
            };

            //  Устанавливаем обработчик сообщений от processWorker
            this.processWorker.onmessage = (e) => this._handleProcessMessage(e);
            //  Обработчик ошибок для processWorker
            this.processWorker.onerror = (e) => {
                //  Логируем ошибку в консоль
                console.error('[API] Ошибка в worker-process:', e);
                //  Диспатчим событие 'error' с деталями
                this.dispatchEvent(new CustomEvent('error', { detail: { error: 'Ошибка в процесс-воркере' } }));
            };

        } catch (err) {
            //  Если произошла ошибка при создании воркеров - логируем и диспатчим событие ошибки
            console.error('[API] Не удалось создать воркеры:', err);
            this.dispatchEvent(new CustomEvent('error', { detail: { error: 'Не удалось инициализировать воркеры' } }));
        }
    }

    //  Приватный метод создания внутреннего состояния задачи
    _createTaskState(blob, metadata) {
        //  Возвращаем объект состояния задачи:
        return {
            //  Генерируем уникальный ID через функцию generateId() из utils
            id: generateId(),
            //  Начальный статус - 'pending'
            status: 'pending',
            //  Прогресс 0%
            progress: 0,
            //  Сохраняем исходный Blob
            blob: blob,
            //  Метаданные (имя, формат, размер и т.д.)
            metadata: metadata,
            //  Параметры улучшения
            params: null,
            //  Результирующий Blob
            resultBlob: null,
            //  Сообщение об ошибке
            error: null,
            //  AbortController для отмены задачи
            abortController: new AbortController(),
            //  Время начала задачи
            startTime: performance.now(),
            //  Идентификатор таймаута
            timeoutId: null
        };
    }

    //  Приватный метод обновления статуса задачи и отправки события 'statusChange'
    _updateTask(taskId, status, progress, extra = {}) {
        //  Получаем задачу из Map по taskId
        const task = this.tasks.get(taskId);
        //  Если задача не найдена - выходим
        if (!task) return;

        //  Устанавливаем новый статус
        task.status = status;
        //  Ограничиваем прогресс диапазоном 0-100
        task.progress = Math.min(100, Math.max(0, progress));
        //  Если в extra передан параметр params - сохраняем его
        if (extra.params !== undefined) task.params = extra.params;
        //  Если ошибка - тоже сохраняем её
        if (extra.error !== undefined) task.error = extra.error;

        //  Логируем обновление для отладки
        console.log(`[API] Обновление задачи ${taskId}: статус=${status}, прогресс=${task.progress}%`, extra);

        //  Диспатчим пользовательское событие 'statusChange' в соответствии с ТЗ
        //  Событие содержит идентификатор задачи, текущий статус, прогресс, параметры, метаданные и ошибку
        this.dispatchEvent(new CustomEvent('statusChange', {
            detail: {
                taskId,
                status,
                progress: task.progress,
                params: task.params,
                metadata: task.metadata,
                error: task.error
            }
        }));
    }

    //  Приватный метод обработки сообщений от worker-model
    _handleModelMessage(e) {
        //  Деструктурируем данные из сообщения
        const { type, taskId, params, error } = e.data;
        console.log('[API] _handleModelMessage:', { type, taskId, params, error });
        //  Получаем задачу по taskId
        const task = this.tasks.get(taskId);
        //  Если задача не найдена - выводим предупреждение и выходим
        if (!task) {
            console.warn('[API] Задача не найдена:', taskId);
            return;
        }

        //  Проверяем, не отменена ли задача через AbortController
        if (task.abortController.signal.aborted) {
            //  Если отменена - обновляем статус на 'canceled' и выходим
            this._updateTask(taskId, 'canceled', 0);
            return;
        }

        //  Обработка различных типов сообщений от модели
        if (type === 'result') {
            //  Модель вернула вычисленные параметры улучшения (params)
            task.params = params;  //  Сохраняем параметры в задаче
            //  Обновляем статус на 'processing' и прогресс 40%
            this._updateTask(taskId, 'processing', 40);
            //  Запускаем процесс применения улучшений (вызов приватного метода _startProcessing)
            this._startProcessing(task);
        } else if (type === 'error') {
            //  Если воркер вернул ошибку - обновляем статус на 'failed' и передаём сообщение об ошибке
            this._updateTask(taskId, 'failed', 0, { error });
        } else if (type === 'progress') {
            //  Промежуточный прогресс от модели (от 0 до 100 внутри воркера)
            //  Пересчитываем прогресс в диапазон 20–40% (так как моделирование занимает часть времени)
            const progress = 20 + Math.floor(e.data.progress * 20);
            this._updateTask(taskId, 'analyzing', progress);
        }
    }

    //  Приватный метод запуска обработки изображения в processWorker
    _startProcessing(task) {
        //  Логируем начало обработки с параметрами
        console.log('[API] _startProcessing для задачи', task.id, 'с параметрами', task.params);
        //  Создаём MessageChannel для передачи порта для коммуникации с воркером (для отмены)
        const channel = new MessageChannel();
        //  Получаем порт для отправки сообщений воркеру
        const port = channel.port1;

        //  Подписываемся на сигнал отмены через AbortController
        task.abortController.signal.addEventListener('abort', () => {
            //  При отмене отправляем сообщение 'abort' через порт воркеру
            port.postMessage('abort');
        });

        //  Отправляем задание в processWorker через postMessage, передавая taskId, исходный Blob, параметры
        //  Также передаём порт (channel.port2) для двусторонней связи (передаётся как Transferable)
        this.processWorker.postMessage({
            type: 'enhance',
            taskId: task.id,
            blob: task.blob,
            params: task.params
        }, [channel.port2]);

        //  Создаём обработчик сообщений от processWorker (для получения прогресса и результата)
        const processHandler = (e) => {
            const msg = e.data;
            //  Если сообщение не относится к текущей задаче - игнорируем
            if (msg.taskId !== task.id) return;

            console.log('[API] Сообщение от processWorker:', msg.type, msg);

            //  Обработка разных типов сообщений от processWorker
            if (msg.type === 'progress') {
                //  Прогресс от processWorker (0-100 внутри воркера) - маппим на диапазон 40–95%
                const progress = 40 + Math.floor(msg.progress * 55);
                this._updateTask(task.id, 'processing', progress);
            } else if (msg.type === 'result') {
                //  Получен готовый результат (Blob)
                task.resultBlob = msg.blob;  //  Сохраняем результирующий Blob
                //  Обновляем статус на 'completed', прогресс 100%
                this._updateTask(task.id, 'completed', 100);
                //  Диспатчим дополнительное событие 'taskComplete' для удобства UI
                this.dispatchEvent(new CustomEvent('taskComplete', {
                    detail: { taskId: task.id }
                }));
                //  Удаляем временный обработчик, чтобы не накапливались
                this.processWorker.removeEventListener('message', processHandler);
            } else if (msg.type === 'error') {
                //  Если processWorker вернул ошибку - обновляем статус задачи на 'failed'
                this._updateTask(task.id, 'failed', 0, { error: msg.error });
                //  Удаляем обработчик
                this.processWorker.removeEventListener('message', processHandler);
            }
        };
        //  Регистрируем обработчик на processWorker
        this.processWorker.addEventListener('message', processHandler);
    }

    //  Приватный метод обработки сообщений от worker-process (фоновые ошибки)
    _handleProcessMessage(e) {
        //  Получаем данные из сообщения
        const { type, taskId, error } = e.data;
        //  Если тип сообщения 'error' и taskId указан - пытаемся обновить задачу
        if (type === 'error' && taskId) {
            const task = this.tasks.get(taskId);
            if (task) {
                //  Если задача существует - обновляем статус на 'failed' с сообщением об ошибке
                this._updateTask(taskId, 'failed', 0, { error });
            }
        }
    }

    //  Приватный асинхронный метод конвейера: предобработка, ресайз, инференс
    async _runPipeline(task) {
        console.log('[API] _runPipeline START для задачи', task.id);
        //  Устанавливаем таймаут на выполнение задачи (30 секунд) согласно ТЗ
        task.timeoutId = setTimeout(() => {
            //  Если задача ещё не завершена (не в финальном состоянии) - принудительно отменяем
            if (!['completed', 'canceled', 'failed'].includes(task.status)) {
                console.warn(`[API] Задача ${task.id} превысила таймаут 30 с, отмена`);
                //  Вызываем публичный метод abort для отмены задачи
                const abortResult = this.abort(task.id);
                //  Если отмена успешна - обновляем статус на 'failed' с сообщением о превышении времени
                if (abortResult.cancelled) {
                    this._updateTask(task.id, 'failed', 0, {
                        error: 'Превышено максимальное время обработки (30 секунд)'
                    });
                }
            }
        }, 30000); //  30 000 миллисекунд = 30 секунд

        try {
            //  Ожидаем готовность модели (если ещё не готова)
            if (!this._modelReady) {
                //  Обновляем статус на 'pending' с прогрессом 5%, пока ждём модель
                this._updateTask(task.id, 'pending', 5);
                console.log('[API] Ожидание готовности модели...');
                //  Создаём промис, который разрешится, когда модель станет готовой
                await new Promise((resolve) => {
                    const checkReady = () => {
                        if (this._modelReady) {
                            resolve();  //  Если модель готова - разрешаем промис
                        } else {
                            setTimeout(checkReady, 50);  //  Иначе проверяем через 50 мс
                        }
                    };
                    checkReady();
                });
                console.log('[API] Модель готова');
            }

            //  Проверяем, не была ли задача отменена во время ожидания модели
            if (task.abortController.signal.aborted) {
                this._updateTask(task.id, 'canceled', 0);
                return;
            }

            //  Шаг 1: Конвертация HEIC в JPEG (требование ТЗ: поддержка HEIC)
            let blob = task.blob;
            if (isHeic(blob)) {
                console.log('[API] Обнаружен HEIC, конвертация...');
                //  Обновляем прогресс до 10%
                this._updateTask(task.id, 'processing', 10);
                try {
                    //  Вызываем функцию конвертации HEIC из utils
                    blob = await convertHeicToJpeg(blob);
                    //  Обновляем blob в состоянии задачи
                    task.blob = blob;
                    console.log('[API] HEIC сконвертирован');
                } catch (error) {
                    throw new Error(`Ошибка конвертации HEIC: ${error.message}`);
                }
            }

            //  Шаг 1.5: Конвертация BMP в PNG
            //  Большинство браузеров поддерживают BMP, но на всякий случай
            if (isBmp(blob)) {
                console.log('[API] Обнаружен BMP, конвертация...');
                this._updateTask(task.id, 'processing', 12);
                try {
                    //  Пытаемся конвертировать BMP в PNG
                    blob = await convertBmpToPng(blob);
                    task.blob = blob;
                    console.log('[API] BMP сконвертирован');
                } catch (error) {
                    //  Если не удалось - продолжаем с оригиналом, если createImageBitmap справится
                    console.warn('[API] Не удалось конвертировать BMP, пробуем как есть:', error.message);
                }
            }

            //  Шаг 2: Декодируем Blob в ImageData (пиксельные данные)
            this._updateTask(task.id, 'analyzing', 20);
            console.log('[API] Декодирование изображения...');
            let imageData;
            try {
                //  Используем функцию blobToImageData из utils
                imageData = await blobToImageData(blob);
                console.log('[API] Декодировано, размер:', imageData.width, 'x', imageData.height);
            } catch (error) {
                throw new Error(`Не удалось декодировать изображение: ${error.message}`);
            }

            //  Шаг 3: Проверка на максимальный размер (ТЗ: "Обработка изображений до 15 Мпк")
            if (isTooLarge(imageData.width, imageData.height)) {
                const mp = (imageData.width * imageData.height / 1000000).toFixed(1);
                throw new Error(`Изображение слишком большое (${mp} Мп, максимум 15 Мп)`);
            }

            //  Проверяем отмену после длительных операций
            if (task.abortController.signal.aborted) {
                this._updateTask(task.id, 'canceled', 0);
                return;
            }

            //  Шаг 4: Готовим уменьшенное изображение для модели (224×224) - функция prepareTensor из utils.js
            this._updateTask(task.id, 'analyzing', 30);
            console.log('[API] Подготовка тензора...');
            //  prepareTensor возвращает { data: Float32Array, width, height }
            const tensorData = prepareTensor(imageData);
            console.log('[API] Тензор подготовлен, размер:', tensorData.width, 'x', tensorData.height);

            //  Проверяем отмену перед отправкой в воркер
            if (task.abortController.signal.aborted) {
                this._updateTask(task.id, 'canceled', 0);
                return;
            }

            //  Шаг 5: Отправляем данные в modelWorker для инференса (вычисления параметров улучшения)
            console.log('[API] Отправка в modelWorker...');
            //  Передаём данные как Transferable (буфер) для высокой производительности
            this.modelWorker.postMessage({
                type: 'infer',
                taskId: task.id,
                data: {
                    data: tensorData.data.buffer,  //  Передаём буфер (будет передан по transfer)
                    width: tensorData.width,
                    height: tensorData.height
                }
            }, [tensorData.data.buffer]);  //  Перечисляем передаваемые объекты (transfer list)

            //  Дальнейшая обработка результата будет в _handleModelMessage
            console.log('[API] _runPipeline завершён, ожидаем ответ от modelWorker');

        } catch (err) {
            //  Обработка ошибок в конвейере
            console.error('[API] Ошибка в _runPipeline:', err);
            if (task.abortController.signal.aborted) {
                //  Если задача отменена - устанавливаем статус 'canceled'
                this._updateTask(task.id, 'canceled', 0);
            } else {
                //  Иначе - 'failed' с сообщением об ошибке
                this._updateTask(task.id, 'failed', 0, { error: err.message });
            }
        }
    }

    //  Публичный метод постановки задачи (ТЗ)
    async enhance(input, extraMeta = {}) {
        //  Приводим входной объект к Blob (если это File, то он уже Blob, если что-то другое - создаём)
        const blob = input instanceof Blob ? input : new Blob([input], { type: 'image/jpeg' });
        //  Получаем метаданные изображения (имя, формат, размер, ширину/высоту) через функцию getImageMetadata
        const metadata = await getImageMetadata(blob, extraMeta.name || 'unknown');
        //  Создаём состояние задачи через приватный метод _createTaskState
        const task = this._createTaskState(blob, metadata);
        //  Сохраняем задачу в Map по её ID
        this.tasks.set(task.id, task);
        //  Обновляем статус задачи на 'pending' с прогрессом 0% (диспатчим событие statusChange)
        this._updateTask(task.id, 'pending', 0);
        //  Асинхронно запускаем конвейер обработки (не блокируем основной поток)
        this._runPipeline(task).catch(err => {
            console.error('[API] Ошибка в конвейере:', err);
        });
        //  Возвращаем taskId - идентификатор задачи
        return task.id;
    }

    //  Публичный метод получения статуса задачи (ТЗ)
    getStatus(taskId) {
        //  Получаем задачу по ID
        const task = this.tasks.get(taskId);
        //  Если задачи нет - возвращаем null
        if (!task) return null;
        //  Возвращаем объект с нужными полями согласно ТЗ
        return {
            status: task.status,
            progress: task.progress,
            params: task.params,
            metadata: task.metadata,
            error: task.error
        };
    }

    //  Публичный метод прерывания задачи (ТЗ)
    abort(taskId) {
        //  Получаем задачу по ID
        const task = this.tasks.get(taskId);
        //  Если задача не найдена - возвращаем объект с cancelled: false и причиной
        if (!task) {
            return { cancelled: false, reason: 'Задача не найдена' };
        }
        //  Если задача уже в финальном состоянии (завершена, отменена или с ошибкой) - не можем отменить
        if (['completed', 'canceled', 'failed'].includes(task.status)) {
            return {
                cancelled: false,
                reason: `Задача уже ${task.status === 'completed' ? 'завершена' : task.status}`,
                status: task.status
            };
        }
        //  Отменяем задачу через AbortController (сигнал отмены)
        task.abortController.abort();
        //  Отправляем сигнал отмены в воркеры (чтобы они могли прервать текущие вычисления)
        try {
            this.modelWorker?.postMessage({ type: 'abort', taskId });
            this.processWorker?.postMessage({ type: 'abort', taskId });
        } catch (e) {
            console.warn('[API] Не удалось отправить сигнал отмены в воркеры:', e);
        }
        //  Очищаем таймаут (если был установлен)
        if (task.timeoutId) {
            clearTimeout(task.timeoutId);
            task.timeoutId = null;
        }
        //  Обновляем статус задачи на 'canceled'
        this._updateTask(taskId, 'canceled', 0);
        //  Возвращаем информацию об успешной отмене (согласно ТЗ)
        return {
            cancelled: true,
            status: 'canceled'
        };
    }

    //  Публичный метод получения готового изображения (ТЗ)
    getResult(taskId) {
        const task = this.tasks.get(taskId);
        //  Если задачи нет - возвращаем null
        if (!task) return null;
        //  Если статус не 'completed' - возвращаем null (результат ещё не готов)
        if (task.status !== 'completed') return null;
        //  Возвращаем результирующий Blob (готовое изображение)
        return task.resultBlob;
    }

    //  Публичный метод получения полной информации о задаче (для отладки)
    getTaskInfo(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) return null;
        //  Возвращаем объект с расширенной информацией: оператор расширения (spread operator) "разворачивает" все свойства объекта task в новый объект
        return {
            ...task,
            //  Добавляем вычисляемое время выполнения
            executionTime: task.startTime ? performance.now() - task.startTime : null,
            //  Форматируем время через функцию formatTime из utils
            formattedTime: task.startTime ? formatTime(performance.now() - task.startTime) : null
        };
    }

    //  Публичный метод очистки завершённых задач (освобождение памяти)
    cleanup(olderThanMs = 60000) {
        //  Текущее время для расчёта возраста задач
        const now = performance.now();
        let removed = 0;
        //  Массив для хранения ID задач, подлежащих удалению
        const toRemove = [];
        //  Проходим по всем задачам
        for (const [taskId, task] of this.tasks) {
            //  Удаляем только завершённые задачи (completed, canceled, failed)
            if (['completed', 'canceled', 'failed'].includes(task.status)) {
                //  Вычисляем возраст задачи
                const age = now - (task.startTime || now);
                //  Если возраст превышает заданный порог, добавляем ID в список
                if (age > olderThanMs) {
                    toRemove.push(taskId);
                }
            }
        }
        //  Удаляем задачи из списка
        for (const taskId of toRemove) {
            const task = this.tasks.get(taskId);
            if (task) {
                //  Очищаем таймаут, если он ещё активен
                if (task.timeoutId) {
                    clearTimeout(task.timeoutId);
                }
                //  Отменяем, если ещё не отменена (на всякий случай)
                if (!['canceled', 'failed'].includes(task.status)) {
                    task.abortController.abort();
                }
                //  Удаляем из Map
                this.tasks.delete(taskId);
                removed++;
            }
        }
        //  Возвращаем количество удалённых задач
        return removed;
    }

    //  Публичный метод получения всех задач (для отладки)
    getAllTasks() {
        const result = [];
        //  Проходим по всем задачам
        for (const [taskId, task] of this.tasks) {
            //  Добавляем краткую информацию о каждой задаче
            result.push({
                id: taskId,
                status: task.status,
                progress: task.progress,
                name: task.metadata?.name || 'unknown',
                format: task.metadata?.format || 'unknown',
                executionTime: task.startTime ? performance.now() - task.startTime : null
            });
        }
        return result;
    }

    //  Публичный метод проверки готовности модели
    isModelReady() {
        return this._modelReady;
    }

    //  Публичный метод деструктора - завершение работы и освобождение ресурсов
    destroy() {
        //  Завершаем воркеры (terminate)
        if (this.modelWorker) {
            this.modelWorker.terminate();
            this.modelWorker = null;
        }
        if (this.processWorker) {
            this.processWorker.terminate();
            this.processWorker = null;
        }
        //  Отменяем все задачи и очищаем таймауты
        for (const [taskId, task] of this.tasks) {
            if (task.timeoutId) {
                clearTimeout(task.timeoutId);
            }
            task.abortController.abort();
        }
        //  Очищаем коллекцию задач
        this.tasks.clear();
        //  Сбрасываем флаг готовности модели
        this._modelReady = false;
        //  Логируем завершение работы API
        console.log('[API] API завершил работу');
    }
}

//  Создаём глобальный экземпляр для использования в main.js
export const photoAPI = new PhotoFixAPI();

//  Для совместимости с обычным скриптом (не модульным), если window определён
if (typeof window !== 'undefined') {
    window.photoAPI = photoAPI;
}