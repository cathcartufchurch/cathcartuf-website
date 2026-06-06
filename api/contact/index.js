const { EmailClient } = require("@azure/communication-email");

module.exports = async function (context, req) {
  try {
    const { name, email, subject, message, phone, wantZoom } = req.body || {};

    if (!name || !email || !subject || !message) {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing required fields" })
      };
      return;
    }

    const connectionString = process.env.COMMUNICATION_SERVICES_CONNECTION_STRING;
    if (!connectionString) {
      context.log.error("Connection string not found");
      context.res = {
        status: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Server configuration error" })
      };
      return;
    }

    try {
      const client = new EmailClient(connectionString);
      
      const emailMessage = {
        senderAddress: "donotreply@953990c2-e815-4ff0-b9d1-45cfc48b94ba.azurecomm.net",
        content: {
          subject: `New Contact Form: ${subject}`,
          plainText: `Name: ${name}\nEmail: ${email}\nPhone: ${phone || 'Not provided'}\n\nMessage:\n${message}`
        },
        recipients: {
          to: [{ address: "services@cathcartuf.org.uk" }]
        }
      };

      const sendResult = await client.send(emailMessage);
      context.log(`Email sent: ${sendResult.messageId}`);
      
      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Thank you for contacting us. We will get back to you soon." })
      };
    } catch (emailError) {
      context.log.error("Email send error:", emailError.message);
      context.res = {
        status: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Failed to send message" })
      };
    }

  } catch (error) {
    context.log.error("Function error:", error.message);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal server error" })
    };
  }
};