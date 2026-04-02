exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

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

    const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_KEY) {
      throw new Error('Не настроен OPENROUTER_API_KEY в Netlify');
    }

    const prompt = `Ты — строгий эксперт по русскому языку. Найди и исправь ВСЕ ошибки.

🔴 ОСОБОЕ ВНИМАНИЕ НА ГРАММАТИКУ:
- Падежные окончания (особенно после предлогов: "в магазине", а не "в магазины")
- Управление глаголов и предлогов
- Согласование по роду, числу и падежу
- Орфография, пунктуация, стилистика

⚪ ИГНОРИРУЙ: длину тире (—) и дефисов (-), оформление прямой речи.

Верни ответ СТРОГО в формате JSON:
{
  "corrected_text": "полностью исправленный текст",
  "errors": [
    {"original": "фрагмент с ошибкой", "suggestion": "исправление", "type": "грамматика|орфография|пунктуация|стиль", "explanation": "кратко почему"}
  ]
}
Если ошибок нет: {"corrected_text": "текст", "errors": []}

Текст для проверки:
${text}`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://frolicking-scone-f5f06d.netlify.app',
        'X-Title': 'Text Checker'
      },
      body: JSON.stringify({
        model: "openrouter/auto",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.05, // Ещё ниже для максимальной строгости
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

    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    }
    
    const result = JSON.parse(jsonStr);
    
    if (!result.corrected_text) {
      throw new Error('ИИ не вернул исправленный текст');
    }

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
