export async function execute(params, context) {
  const { to, subject, body, from = "onboarding@resend.dev" } = params;

  if (!to || !subject || !body) {
    throw new Error("Parameters 'to', 'subject', and 'body' are required");
  }

  // Retrieve API key from context
  const apiKey = context?.apiKey || context?.config?.apiKey;
  if (!apiKey) {
    throw new Error(
      "Resend API key is required. Please configure your Resend API key to use this skill."
    );
  }

  const requestBody = JSON.stringify({
    from,
    to: [to],
    subject,
    text: body,
  });

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: requestBody,
    });

    const responseData = await response.json();

    if (!response.ok) {
      const errorMessage =
        responseData?.message || responseData?.error || `HTTP ${response.status}`;
      throw new Error(`Resend API error: ${errorMessage}`);
    }

    return {
      result: `Email sent to ${to}`,
      metadata: {
        id: responseData.id,
        status: "sent",
      },
    };
  } catch (error) {
    if (error.message.startsWith("Resend API error:")) {
      throw error;
    }
    throw new Error(`Failed to send email: ${error.message}`);
  }
}
