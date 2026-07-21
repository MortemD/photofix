//  Экспортируем функцию generateId для генерации уникального идентификатора задачи
export function generateId() {
    //  Возвращаем строку, начинающуюся с 'task_', к которой добавляем текущую метку времени в миллисекундах (Date.now())
    //  и случайную строку из 9 символов в 36-ричной системе, полученную через Math.random().toString(36).slice(2, 11)
    return 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
}

//  Экспортируем функцию форматирования размера файла в байтах в читаемый вид
export function formatFileSize(bytes) {
    //  Если размер меньше 1024 байт, выводим в байтах
    if (bytes < 1024) return bytes + ' Б';
    //  Если размер меньше 1 МБ (1024 * 1024), выводим в килобайтах с одним знаком после запятой
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
    //  Иначе выводим в мегабайтах с одним знаком после запятой
    return (bytes / (1024 * 1024)).toFixed(1) + ' МБ';
}

//  Экспортируем функцию форматирования времени в миллисекундах в читаемый вид
export function formatTime(ms) {
    //  Если время меньше 1000 мс (1 секунда), выводим в миллисекундах
    if (ms < 1000) return ms + ' мс';
    //  Иначе переводим в секунды делением на 1000 и округляем до 1 знака
    return (ms / 1000).toFixed(1) + ' с';
}

//  Экспортируем функцию расчёта мегапикселей по ширине и высоте
export function getMegapixels(width, height) {
    //  Умножаем ширину на высоту, делим на 1 000 000 (число пикселей в мегапикселе) и форматируем с одним знаком после запятой через toFixed(1)
    return ((width * height) / 1000000).toFixed(1);
}

//  Экспортируем функцию определения формата файла по MIME-типу или расширению
export function getFormatFromBlob(blob) {
    //  Получаем MIME-тип в нижнем регистре для удобства сравнения
    const type = blob.type.toLowerCase();
    //  Проверяем, содержит ли строка type подстроку 'heic' или 'heif' - это формат HEIC
    if (type.includes('heic') || type.includes('heif')) return 'HEIC';
    //  Проверяем на PNG
    if (type.includes('png')) return 'PNG';
    //  Проверяем на BMP
    if (type.includes('bmp')) return 'BMP';
    //  Проверяем на JPEG (возможны варианты 'jpeg' или 'jpg')
    if (type.includes('jpeg') || type.includes('jpg')) return 'JPG';
    //  Если MIME-тип не определён или не подходит, пытаемся определить по расширению в имени файла
    if (blob.name) {
        //  Разбиваем имя по точке, берём последний элемент (расширение) и приводим к нижнему регистру
        const ext = blob.name.split('.').pop().toLowerCase();
        //  Сравниваем расширение с известными
        if (['heic', 'heif'].includes(ext)) return 'HEIC';
        if (ext === 'png') return 'PNG';
        if (ext === 'bmp') return 'BMP';
        if (['jpg', 'jpeg'].includes(ext)) return 'JPG';
    }
    //  Если ничего не подошло, возвращаем 'Unknown'
    return 'Unknown';
}

//  Экспортируем функцию проверки, является ли файл HEIC-форматом
export function isHeic(blob) {
    //  Получаем MIME-тип в нижнем регистре
    const type = blob.type.toLowerCase();
    //  Возвращаем true, если строка содержит 'heic' или 'heif'
    return type.includes('heic') || type.includes('heif');
}

//  Экспортируем функцию проверки, является ли файл BMP-форматом
export function isBmp(blob) {
    //  Получаем MIME-тип в нижнем регистре и проверяем, содержит ли он 'bmp'
    const type = blob.type.toLowerCase();
    return type.includes('bmp');
}

//  Экспортируем функцию проверки, является ли файл PNG-форматом
export function isPng(blob) {
    const type = blob.type.toLowerCase();
    return type.includes('png');
}

//  Экспортируем функцию проверки, является ли файл JPG-форматом
export function isJpg(blob) {
    const type = blob.type.toLowerCase();
    return type.includes('jpeg') || type.includes('jpg');
}

//  Экспортируем асинхронную функцию получения метаданных изображения
export async function getImageMetadata(blob, originalName) {
    //  Определяем формат файла через getFormatFromBlob
    const format = getFormatFromBlob(blob);
    //  Получаем размер файла в байтах
    const fileSize = blob.size;
    //  Инициализируем переменные ширины и высоты нулём
    let width = 0;
    let height = 0;

    try {
        //  Пытаемся декодировать изображение с помощью createImageBitmap (асинхронный API)
        const bitmap = await createImageBitmap(blob);
        //  Записываем реальную ширину и высоту
        width = bitmap.width;
        height = bitmap.height;
        //  Закрываем битмап, чтобы освободить занятые ресурсы
        bitmap.close();
    } catch (e) {
        console.warn('[utils] Не удалось декодировать изображение:', e.message);
    }

    //  Возвращаем объект с метаданными
    return {
        name: originalName || 'unknown', //  имя файла, если не передано, то 'unknown'
        format: format,
        size: fileSize,
        width: width,
        height: height,
        megapixels: getMegapixels(width, height) //  вычисляем мегапиксели через вспомогательную функцию
    };
}

//  Экспортируем асинхронную функцию конвертации HEIC в JPEG с использованием библиотеки heic2any
export async function convertHeicToJpeg(blob) {
    try {
        //  Логируем начало конвертации HEIC
        console.log('[utils] Конвертация HEIC...');
        //  Динамически импортируем библиотеку heic2any с CDN (загружается только при необходимости)
        const heic2anyModule = await import(
            'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js'
            );
        //  Извлекаем функцию heic2any из модуля (поддерживается как default, так и сам модуль)
        const heic2any = heic2anyModule.default || heic2anyModule;
        //  Вызываем heic2any с параметрами: blob, целевой тип 'image/jpeg' и качество 0.92
        const result = await heic2any({
            blob: blob,
            toType: 'image/jpeg',
            quality: 0.92
        });
        //  heic2any может вернуть массив, если внутри HEIC несколько изображений; берём первый элемент
        return Array.isArray(result) ? result[0] : result;
    } catch (error) {
        console.error('[utils] Ошибка конвертации HEIC:', error);
        throw new Error(`Не удалось конвертировать HEIC: ${error.message}`);
    }
}

//  Экспортируем асинхронную функцию конвертации BMP в PNG
export async function convertBmpToPng(blob) {
    try {
        //  Декодируем BMP через createImageBitmap
        const bitmap = await createImageBitmap(blob);
        //  Создаём OffscreenCanvas для рендеринга вне основного потока (не влияет на DOM)
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        //  Получаем 2D-контекст для рисования
        const ctx = canvas.getContext('2d');
        //  Рисуем битмап на канвасе
        ctx.drawImage(bitmap, 0, 0);
        //  Закрываем битмап для освобождения памяти
        bitmap.close();
        //  Конвертируем содержимое канваса в Blob с типом image/png (формат без потерь)
        const result = await canvas.convertToBlob({ type: 'image/png' });
        //  Возвращаем результат
        return result;
    } catch (error) {
        throw new Error(`Не удалось конвертировать BMP: ${error.message}`);
    }
}

//  Экспортируем асинхронную функцию преобразования Blob в ImageData
export async function blobToImageData(blob) {
    console.log('[utils] blobToImageData START');
    //  Декодируем blob в битмап
    const bitmap = await createImageBitmap(blob);
    //  Логируем размеры полученного битмапа
    console.log('[utils] bitmap создан:', bitmap.width, 'x', bitmap.height);
    //  Создаём OffscreenCanvas с размерами битмапа
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    //  Получаем контекст 2D
    const ctx = canvas.getContext('2d');
    //  Рисуем битмап на канвасе (заполняет всю область)
    ctx.drawImage(bitmap, 0, 0);
    //  Освобождаем битмап
    bitmap.close();
    //  Извлекаем пиксельные данные в формате ImageData (содержит Uint8ClampedArray RGBA)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    console.log('[utils] blobToImageData OK');
    return imageData;
}

//  Экспортируем функцию подготовки тензора для передачи в ML-воркер
export function prepareTensor(imageData) {
    console.log('[utils] prepareTensor START');
    //  Уменьшаем изображение до 224x224 с помощью resizeImageData
    const resized = resizeImageData(imageData, 224);
    //  Преобразуем данные пикселей (Uint8ClampedArray) в Float32Array - это удобнее для работы с тензорами в TensorFlow.js
    const data = new Float32Array(resized.data);
    console.log('[utils] prepareTensor OK, размер:', resized.width, 'x', resized.height);
    //  Возвращаем объект, содержащий плоский массив данных, ширину и высоту
    return {
        data: data,
        width: resized.width,
        height: resized.height
    };
}

//  Экспортируем функцию изменения размера ImageData до указанного (обычно 224×224)
export function resizeImageData(imageData, targetSize = 224) {
    console.log('[utils] resizeImageData START');
    //  Создаём исходный канвас с размерами оригинального изображения
    const sourceCanvas = new OffscreenCanvas(imageData.width, imageData.height);
    //  Получаем контекст 2D исходного канваса
    const sourceCtx = sourceCanvas.getContext('2d');
    //  Помещаем пиксельные данные (imageData) на исходный канвас
    sourceCtx.putImageData(imageData, 0, 0);

    //  Создаём целевой канвас с размерами targetSize x targetSize
    const targetCanvas = new OffscreenCanvas(targetSize, targetSize);
    //  Получаем контекст 2D целевого канваса
    const targetCtx = targetCanvas.getContext('2d');
    //  Рисуем исходный канвас на целевом с масштабированием до targetSize (билинейная интерполяция по умолчанию)
    targetCtx.drawImage(sourceCanvas, 0, 0, targetSize, targetSize);

    //  Извлекаем пиксельные данные из целевого канваса
    const result = targetCtx.getImageData(0, 0, targetSize, targetSize);
    console.log('[utils] resizeImageData OK');
    return result;
}

//  Экспортируем функцию проверки, является ли изображение слишком большим (>15 Мп)
export function isTooLarge(width, height, maxPixels = 15_000_000) {
    //  Вычисляем общее количество пикселей и сравниваем с максимальным допустимым
    return (width * height) > maxPixels;
}

//  Экспортируем функцию получения размера файла в мегапикселях (для проверки)
export function getTotalMegapixels(width, height) {
    //  Возвращаем число мегапикселей (без округления) как дробное число
    return (width * height) / 1000000;
}