// Этот код выполняется на серверах Netlify
// API-ключ хранится в переменных окружения и не виден пользователям

exports.handler = async (event) => {
  // Разрешаем CORS для локальной разработки
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Обработка preflight-запросов
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { text } = JSON.parse(event.body);
    
    if (!text || typeof text !== 'string') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Требуется поле "text"' }) };
    }
    
    if (text.length > 5000) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Текст слишком длинный (макс. 5000 символов)' }) };
    }

    // 🤖 Запрос к OpenRouter API
    const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_KEY) {
      throw new Error('Не настроен OPENROUTER_API_KEY в переменных окружения Netlify');
    }

    const prompt = `Ты — эксперт по русскому языку. Проверь текст на:
1. Орфографические ошибки
2. Пунктуационные ошибки  
3. Стилистические неточности
4. Лишние/пропущенные знаки

Верни ответ СТРОГО в формате JSON без лишнего текста:
{
  "corrected_text": "полностью исправленный текст",
  "errors": [
    {
      "original": "фрагмент с ошибкой",
      "suggestion": "как правильно",
      "type": "орфография|пунктуация|стиль|знаки",
      "explanation": "краткое объяснение почему так"
    }
  ]
}

Если ошибок нет, верни: {"corrected_text": "текст", "errors": []}

Текст для проверки:
${text}`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://text-checker.netlify.app', // Укажите ваш домен после деплоя
        'X-Title': 'Text Checker'
      },
      body: JSON.stringify({
        model: "qwen/qwen-2.5-7b-instruct:free", // Бесплатная модель с хорошим русским
        // Альтернативы: "deepseek/deepseek-chat:free", "google/gemma-2-9b-it:free"
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1, // Минимум креатива, максимум точности
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('OpenRouter error:', errText);
      throw new Error(`API ошибка: ${response.status}`);
    }

    const apiData = await response.json();
    const content = apiData.choices?.[0]?.message?.content;
    
    if (!content) throw new Error('Пустой ответ от ИИ');

    // Парсим ответ: ИИ может добавить ```json ... ```
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    }
    
    const result = JSON.parse(jsonStr);
    
    if (!result.corrected_text) {
      throw new Error('ИИ не вернул исправленный текст');
    }

    // Возвращаем клиенту
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        corrected_text: result.corrected_text,
        errors: Array.isArray(result.errors) ? result.errors : []
      })
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Внутренняя ошибка сервера' })
    };
  }
};