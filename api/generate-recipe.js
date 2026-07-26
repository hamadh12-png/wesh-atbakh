// Serverless function (Vercel). Runs on the server, never in the visitor's browser —
// this is what keeps ANTHROPIC_API_KEY secret. Set it in Vercel: Project Settings → Environment Variables.

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY غير مضبوط على السيرفر" });
  }

  const { budget = "20", ingredients = "", prefs = "" } = req.body || {};

  const userPrompt = `
الميزانية: ${budget} ريال سعودي
المكونات المتوفرة: ${ingredients || "لا يوجد، اقترح مكونات متوفرة عادة في أي بيت سعودي"}
التفضيلات: ${prefs || "لا يوجد تفضيل خاص"}

اقترح وصفة طبخ واحدة مناسبة لعازب ما يعرف يطبخ، بتكلفة قريبة من الميزانية المذكورة (بأسعار السوق السعودي التقريبية).
رجّع النتيجة بصيغة JSON فقط بدون أي نص إضافي أو علامات markdown أو شرح، بهذا الشكل بالضبط ولا شي غيره:
{"title":"اسم الوصفة","description":"جملة قصيرة","prep_time_minutes":رقم,"calories":رقم,"total_cost_sar":رقم,"ingredients":[{"name":"اسم","amount":"كمية","price_sar":رقم}],"steps":["خطوة مفصلة بالتوقيت"]}

مهم جدًا لكل خطوة بمصفوفة steps: اكتبها بشكل مفصل وعملي، تذكر فيها التوقيت بالدقائق، متى تضاف كل مكون، ودرجة الحرارة أو علامات النضج (مثل اللون أو القوام) — مو جملة عامة قصيرة. خلي المقادير بين ٤ و٧ عناصر، والخطوات بين ٤ و٧ خطوات.
`.trim();

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1500,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Anthropic API error: ${errText.slice(0, 300)}` });
    }

    const data = await response.json();
    const textBlock = (data.content || []).find((b) => b.type === "text");
    if (!textBlock) {
      return res.status(500).json({ error: "لم يرجع النموذج أي نص" });
    }

    let raw = textBlock.text.replace(/```json|```/g, "").trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) raw = jsonMatch[0];

    let recipe;
    try {
      recipe = JSON.parse(raw);
    } catch (e) {
      return res.status(500).json({ error: "تعذّر قراءة رد النموذج", raw: raw.slice(0, 300) });
    }

    return res.status(200).json({ recipe });
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
};
