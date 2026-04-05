// netlify/functions/check-text.js
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { text } = JSON.parse(event.body);
    const apiKey = process.env.GROQ_API_KEY;
    
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'GROQ_API_KEY не найден. Добавьте его в переменные окружения Netlify.' })
      };
    }

    // Запрос к Groq API
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', // или 'mixtral-8x7b-32768'
        messages: [
          {
            role: 'system',
            content: `Ты - эксперт по русскому языку. Найди в тексте все ошибки (орфографические, пунктуационные, стилистические). Верни результат ТОЛЬКО в формате JSON без лишнего текста:
            {
              "corrected_text": "исправленный текст",
              "errors": [
                {
                  "original": "ошибочный фрагмент",
                  "suggestion": "исправленный вариант",
                  "type": "орфография/пунктуация/стиль",
                  "explanation": "почему так правильно"
                }
              ]
            }`
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Groq API error: ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;
    
    // Извлекаем JSON из ответа
    let result;
    try {
      // Пробуем найти JSON в ответе
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        result = JSON.parse(aiResponse);
      }
    } catch (e) {
      console.error('Failed to parse AI response:', aiResponse);
      result = {
        corrected_text: text,
        errors: [{
          original: "ошибка парсинга",
          suggestion: "проверьте текст",
          type: "система",
          explanation: "Не удалось обработать ответ ИИ. Попробуйте ещё раз."
        }]
      };
    }
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Ошибка при проверке текста',
        details: error.message 
      })
    };
  }
};
