//  Переменная для хранения объекта TensorFlow.js (будет загружена через importScripts)
let tf = null;
//  Переменная для хранения загруженной модели
let model = null;
//  Флаг, указывающий, что модель загружена и готова к работе
let isReady = false;
//  Флаг отмены текущей задачи (устанавливается при получении сигнала abort)
let abortFlag = false;

//  Основной обработчик сообщений, поступающих в воркер из основного потока
self.onmessage = async (e) => {
    //  Извлекаем из данных сообщения тип, идентификатор задачи и данные (если есть)
    const { type, taskId, data } = e.data;
    console.log('[worker-model] Получено сообщение:', { type, taskId });

    //  Если тип сообщения - 'abort' (сигнал отмены задачи)
    if (type === 'abort') {
        console.log('[worker-model] Получен сигнал отмены для задачи', taskId);
        abortFlag = true;
        //  Через 100 мс сбрасываем флаг, чтобы не блокировать последующие задачи
        setTimeout(() => { abortFlag = false; }, 100);
        //  Выходим из обработчика, так как дальнейшая обработка не нужна
        return;
    }

    //  Если тип сообщения - 'infer' (запрос на выполнение инференса)
    if (type === 'infer') {
        console.log('[worker-model] Начало инференса для задачи', taskId);
        //  Проверяем, загружена ли модель (isReady и model не null)
        if (!isReady || !model) {
            //  Если модель не готова, логируем ошибку и отправляем сообщение об ошибке
            console.error('[worker-model] Модель не загружена!');
            self.postMessage({ type: 'error', taskId, error: 'Модель ещё не загружена' });
            return;
        }

        //  Сбрасываем флаг отмены для текущей задачи
        abortFlag = false;

        try {
            //  Извлекаем из data ширину, высоту и буфер с пикселями
            const { width, height, data: buffer } = data;
            console.log('[worker-model] Получены данные:', width, 'x', height);
            //  Преобразуем переданный ArrayBuffer в Float32Array (пиксели в формате RGBA)
            const pixels = new Float32Array(buffer);
            //  Вычисляем общее количество пикселей
            const totalPixels = width * height;
            console.log('[worker-model] Количество пикселей:', totalPixels);

            //  Создаём новый Float32Array для RGB-данных (3 канала, без альфа)
            const rgbData = new Float32Array(totalPixels * 3);
            //  Проходим по каждому пикселю и копируем только R, G, B каналы
            for (let i = 0; i < totalPixels; i++) {
                //  Индекс начала данных пикселя в исходном RGBA (4 значения на пиксель)
                const srcIdx = i * 4;
                //  Индекс начала данных пикселя в целевом RGB (3 значения на пиксель)
                const dstIdx = i * 3;
                //  Копируем R, G, B
                rgbData[dstIdx] = pixels[srcIdx];
                rgbData[dstIdx + 1] = pixels[srcIdx + 1];
                rgbData[dstIdx + 2] = pixels[srcIdx + 2];
            }
            console.log('[worker-model] RGB данные подготовлены');

            //  Проверяем, не был ли получен сигнал отмены во время подготовки данных
            if (abortFlag) throw new Error('Aborted');

            console.log('[worker-model] Создание тензора...');
            //  Создаём 4D-тензор из RGB-данных формы [1, height, width, 3] (batch=1, каналы=3)
            const tensor = tf.tensor4d(rgbData, [1, height, width, 3]);

            //  Проверяем отмену после создания тензора (чтобы не выполнять лишние операции)
            if (abortFlag) {
                //  Освобождаем память тензора
                tensor.dispose();
                throw new Error('Aborted');
            }

            console.log('[worker-model] Нормализация тензора...');
            //  Нормализуем пиксели, деля каждый канал на 255.0 (приводим к диапазону [0,1])
            const tensorNormalized = tensor.div(255.0);

            console.log('[worker-model] Выполнение предсказания...');
            //  Вызываем метод predict модели, передавая нормализованный тензор
            const prediction = model.predict(tensorNormalized);
            //  Получаем данные из результирующего тензора (асинхронно через data())
            const result = await prediction.data();
            //  Логируем полученное предсказание (преобразуем в массив для вывода)
            console.log('[worker-model] Предсказание получено:', Array.from(result));

            //  Освобождаем память, занятую тензорами (обязательно, чтобы избежать утечек)
            tensor.dispose();
            tensorNormalized.dispose();
            prediction.dispose();

            //  Формируем объект с параметрами: яркость, контрастность, насыщенность
            //  Если результат содержит undefined или null, подставляем значения по умолчанию
            const params = {
                brightness: result[0] || 0,
                contrast: result[1] || 1,
                saturation: result[2] || 1
            };

            //  Проверяем отмену перед отправкой результата
            if (abortFlag) throw new Error('Aborted');

            console.log('[worker-model] Отправка результата для задачи', taskId, params);
            //  Отправляем результат в основной поток
            self.postMessage({ type: 'result', taskId, params });

        } catch (err) {
            //  Если ошибка вызвана отменой задачи, просто выводим предупреждение и выходим
            if (abortFlag) {
                console.warn('[worker-model] Инференс прерван из-за отмены');
                return;
            }
            //  Иначе логируем ошибку и отправляем сообщение об ошибке
            console.error('[worker-model] Ошибка инференса:', err);
            self.postMessage({ type: 'error', taskId, error: err.message || 'Ошибка инференса' });
        }
    }
};

//  Самовызывающаяся асинхронная функция для инициализации воркера (загрузка TF.js и модели)
(async () => {
    try {
        //  Логируем начало загрузки TensorFlow.js через importScripts
        console.log('[worker-model] Загрузка TensorFlow.js через importScripts...');
        //  Используем importScripts для загрузки TensorFlow.js с CDN
        importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
        //  Извлекаем объект tf из глобальной области self (после importScripts он становится доступен как self.tf)
        tf = self.tf;
        console.log('[worker-model] TF.js загружен');

        //  Ожидаем готовности выбранного бэкенда (WebGL, CPU и т.д.) через tf.ready()
        await tf.ready();
        console.log('[worker-model] TF.js backend:', tf.getBackend());
        console.log('[worker-model] Загрузка модели...');
        //  Загружаем модель в формате GraphModel по относительному пути '../model/model.json'
        model = await tf.loadGraphModel('../model/model.json');
        //  Устанавливаем флаг готовности в true
        isReady = true;
        console.log('[worker-model] Модель загружена (GraphModel)');
        //  Отправляем сообщение 'ready' в основной поток, чтобы уведомить о готовности
        self.postMessage({ type: 'ready' });

    } catch (err) {
        //  В случае любой ошибки инициализации логируем и отправляем сообщение об ошибке
        console.error('[worker-model] Ошибка инициализации:', err);
        self.postMessage({ type: 'error', error: 'Ошибка инициализации: ' + err.message });
    }
})();