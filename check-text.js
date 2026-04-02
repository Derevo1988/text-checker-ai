exports.handler = async (event, context) => {
  // Разрешаем запросы только с вашего домена или локально для тестов
  const headers = {
    'Access-Control-Allow-Origin': '*', // В продакшене лучше указать конкретный домен
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Обработка preflight запросов (OPTIONS)
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  // Работаем только с POST запросами
  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      headers, 
      body: JSON.stringify({ error: 'Метод не разрешен. Используйте POST.' }) 
    };
  }

  try {
    const data = JSON.parse(event.body);
    const textToCheck = data.text;

    if (!textToCheck) {
      return { 
        statusCode: 400, 
        headers, 
        body: JSON.stringify({ error: 'Поле "text" обязательно.' }) 
      };
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.error('API ключ не найден в переменных окружения');
      throw new Error('Серверная ошибка: не настроен API ключ');
    }

    // Настраиваем таймаут через AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 секунд + запас до лимита Netlify

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://frolicking-scone-f5f06d.netlify.app', // Обязательно для OpenRouter
        'X-Title': 'Text Checker App'
      },
      body: JSON.stringify({
        model: "mistralai/mistral-7b-instruct:free", // Или другая бесплатная/дешевая модель
        messages: [
          {
            role: "user",
            content: `Проверь следующий текст на грамотность и стилистику. Если есть ошибки, исправь их и кратко объясни. Если ошибок нет, напиши "Текст хорош". Текст: "${textToCheck}"`
          }
        ]
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`Ошибка API: ${response.status}`, errorData);
      throw new Error(`Ошибка внешнего сервиса: ${response.status}`);
    }

    const result = await response.json();
    
    // Извлекаем ответ модели
    const answer = result.choices?.[0]?.message?.content || "Нет ответа от модели";

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ result: answer })
    };

  } catch (error) {
    console.error('Критическая ошибка в функции:', error.message);
    
    let errorMessage = "Не удалось обработать запрос.";
    if (error.name === 'AbortError') {
      errorMessage = "Превышено время ожидания ответа от сервиса. Попробуйте позже.";
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: errorMessage })
    };
  }
};