//  Вспомогательная функция ограничения значения диапазоном [0, 255] для каналов RGB
function clamp(v) {
    //  Возвращаем минимальное из 255 и максимального из 0 и переданного значения v
    return Math.min(255, Math.max(0, v));
}

//  Вспомогательная функция преобразования HSL в RGB (используется при изменении цветности / насыщенности)
function hue2rgb(p, q, t) {
    //  Если t меньше 0, прибавляем 1 (нормализация оттенка)
    if (t < 0) t += 1;
    //  Если t больше 1, вычитаем 1
    if (t > 1) t -= 1;
    //  Если t меньше 1/6, возвращаем p + (q - p) * 6 * t
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    //  Если t меньше 1/2, возвращаем q
    if (t < 1 / 2) return q;
    //  Если t меньше 2/3, возвращаем p + (q - p) * (2 / 3 - t) * 6
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    //  Иначе возвращаем p
    return p;
}

//  Флаг отмены текущей задачи (управляется через MessagePort)
let abortFlag = false;

//  Основной обработчик событий от основного потока
self.onmessage = async (e) => {
    //  Извлекаем из данных сообщения тип, идентификатор задачи, Blob и параметры
    const { type, taskId, blob, params } = e.data;
    //  Получаем порт для связи «воркер - основной поток» - используется для отмены
    const port = e.ports[0];
    console.log('[worker-process] Получено сообщение:', { type, taskId });

    //  Обработка команды отмены
    if (type === 'abort') {
        console.log('[worker-process] Получен сигнал отмены для задачи', taskId);
        //  Устанавливаем флаг отмены в true
        abortFlag = true;
        //  Завершаем обработку
        return;
    }

    //  Обработка запроса на улучшение изображения
    if (type === 'enhance') {
        console.log('[worker-process] Начало обработки для задачи', taskId);
        //  Сбрасываем флаг отмены перед началом новой задачи
        abortFlag = false;

        //  Если порт передан, настраиваем слушатель на получение сигнала отмены через порт
        if (port) {
            //  Устанавливаем обработчик сообщений от порта
            port.onmessage = (msg) => {
                //  Если пришло сообщение 'abort', устанавливаем флаг отмены
                if (msg.data === 'abort') {
                    console.log('[worker-process] Отмена через порт для задачи', taskId);
                    abortFlag = true;
                }
            };
        }

        try {
            //  Запускаем основную функцию обработки изображения, передавая Blob, параметры и колбэк для прогресса
            const resultBlob = await enhanceImage(blob, params, (progress) => {
                //  Отправляем прогресс только если задача не отменена
                if (!abortFlag) {
                    self.postMessage({ type: 'progress', taskId, progress });
                }
            });

            //  После завершения обработки проверяем, не была ли задача отменена
            if (abortFlag) {
                //  Если отмена произошла, отправляем сообщение об ошибке
                console.warn('[worker-process] Задача отменена после обработки', taskId);
                self.postMessage({ type: 'error', taskId, error: 'Задача отменена пользователем' });
            } else {
                //  Иначе отправляем результат в основной поток
                console.log('[worker-process] Результат готов для задачи', taskId);
                self.postMessage({ type: 'result', taskId, blob: resultBlob });
            }
        } catch (err) {
            //  Если произошла ошибка и задача не отменена, сообщаем об ошибке
            if (!abortFlag) {
                console.error('[worker-process] Ошибка обработки:', err);
                self.postMessage({ type: 'error', taskId, error: err.message || 'Ошибка обработки' });
            }
        }
    }
};

//  Основная функция: загрузка изображения, применение параметров, возврат JPEG-Blob
async function enhanceImage(blob, params, onProgress) {
    //  Логируем начало декодирования изображения
    console.log('[worker-process] Декодирование изображения...');
    //  1. Декодирование Blob в ImageBitmap
    const bitmap = await createImageBitmap(blob);
    //  Проверяем отмену после декодирования
    if (abortFlag) throw new Error('Aborted');

    //  Получаем размеры изображения
    const width = bitmap.width;
    const height = bitmap.height;
    console.log('[worker-process] Размер изображения:', width, 'x', height);

    //  2. Создание OffscreenCanvas и отрисовка изображения
    const canvas = new OffscreenCanvas(width, height);
    //  Получаем контекст 2D для рисования
    const ctx = canvas.getContext('2d');
    //  Рисуем битмап на канвасе
    ctx.drawImage(bitmap, 0, 0);
    //  Освобождаем ресурсы битмапа
    bitmap.close();
    //  Проверяем отмену
    if (abortFlag) throw new Error('Aborted');

    //  3. Получение пиксельных данных в формате ImageData
    const imageData = ctx.getImageData(0, 0, width, height);
    //  Получаем плоский массив пикселей (Uint8ClampedArray) в формате RGBA
    const data = imageData.data;
    //  Общая длина массива (количество значений, равное width*height*4)
    const len = data.length;

    //  Извлекаем параметры с подстановкой значений по умолчанию
    const brightness = params.brightness || 0;
    const contrast = params.contrast || 1;
    const saturation = params.saturation || 1;
    console.log('[worker-process] Параметры:', { brightness, contrast, saturation });

    //  4. Последовательное применение корректировок

    //  4.1. Яркость (аддитивное смещение)
    if (brightness !== 0) {
        console.log('[worker-process] Применение яркости...');
        //  Вычисляем смещение: brightness * 255
        const offset = brightness * 255;
        //  Проходим по всем пикселям (шаг 4, так как RGBA)
        for (let i = 0; i < len; i += 4) {
            //  Применяем смещение к каналам R, G, B, ограничивая значения через clamp
            data[i] = clamp(data[i] + offset);
            data[i + 1] = clamp(data[i + 1] + offset);
            data[i + 2] = clamp(data[i + 2] + offset);
            //  Альфа-канал (i+3) не трогаем
        }
    }
    //  Проверяем отмену после длительного цикла
    if (abortFlag) throw new Error('Aborted');
    //  Отправляем прогресс 25%
    onProgress(0.25);

    //  4.2. Контраст (мультипликативная коррекция относительно 128)
    if (contrast !== 1) {
        console.log('[worker-process] Применение контраста...');
        const factor = contrast;
        //  Проходим по всем пикселям
        for (let i = 0; i < len; i += 4) {
            //  Применяем формулу: new = (old - 128) * factor + 128, ограничивая через clamp
            data[i] = clamp((data[i] - 128) * factor + 128);
            data[i + 1] = clamp((data[i + 1] - 128) * factor + 128);
            data[i + 2] = clamp((data[i + 2] - 128) * factor + 128);
        }
    }
    if (abortFlag) throw new Error('Aborted');
    onProgress(0.50);

    //  4.3. Насыщенность (цветность) через преобразование RGB в HSL в умножение S в обратно
    if (saturation !== 1) {
        console.log('[worker-process] Применение насыщенности...');
        //  Проходим по всем пикселям
        for (let i = 0; i < len; i += 4) {
            //  Приводим значения R, G, B к диапазону [0, 1]
            let r = data[i] / 255;
            let g = data[i + 1] / 255;
            let b = data[i + 2] / 255;

            //  Находим максимум и минимум из RGB
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            //  Вычисляем яркость (lightness) как среднее арифметическое max и min
            const l = (max + min) / 2;

            //  Если max != min, цвет не серый, можно менять насыщенность
            if (max !== min) {
                //  Вычисляем разницу
                const d = max - min;
                //  Вычисляем насыщенность s по стандартной формуле HSL
                let s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                //  Умножаем насыщенность на заданный коэффициент, но ограничиваем 1
                s = Math.min(1, s * saturation);

                //  Вычисляем оттенок (hue)
                let hue;
                if (max === r) {
                    hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                } else if (max === g) {
                    hue = ((b - r) / d + 2) / 6;
                } else { // max === b
                    hue = ((r - g) / d + 4) / 6;
                }

                //  Преобразуем (hue, насыщенность, яркость) обратно в RGB через вспомогательную функцию hue2rgb
                const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                const p = 2 * l - q;

                r = hue2rgb(p, q, hue + 1 / 3);
                g = hue2rgb(p, q, hue);
                b = hue2rgb(p, q, hue - 1 / 3);
            }

            //  Записываем обратно с округлением и ограничением
            data[i] = Math.round(r * 255);
            data[i + 1] = Math.round(g * 255);
            data[i + 2] = Math.round(b * 255);
            //  Альфа-канал остаётся без изменений
        }
    }
    if (abortFlag) throw new Error('Aborted');
    onProgress(0.85);

    //  5. Запись изменённых пикселей обратно на канвас
    ctx.putImageData(imageData, 0, 0);
    onProgress(0.95);

    //  6. Конвертация канваса в JPEG-блоб
    console.log('[worker-process] Конвертация в JPEG...');
    const resultBlob = await canvas.convertToBlob({
        type: 'image/jpeg',  //  целевой формат
        quality: 0.92  //  качество сжатия (92%)
    });

    console.log('[worker-process] Готово, размер блоба:', resultBlob.size);
    //  Возвращаем готовый Blob
    return resultBlob;
}