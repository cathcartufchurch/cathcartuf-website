const { EmailClient } = require("@azure/communication-email");

module.exports = async function (context, req) {
  try {
    const { name, email, subject, message, phone, wantZoom } = req.body;

    if (!name || !email || !subject || !message) {
      return {
        status: 400,
        body: JSON.stringify({ error: "Missing required fields" })
      };
    }

    const connectionString = process.env.COMMUNICATION_SERVICES_CONNECTION_STRING;
    if (!connectionString) {
      context.log.error("Connection string missing");
      return {
        status: 500,
        body: JSON.stringify({ error: "Server configuration error" })
      };
    }

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
    
    return {
      status: 200,
      body: JSON.stringify({ message: "Thank you for contacting us. We will get back to you soon." })
    };

  } catch (error) {
    context.log.error("Error:", error.message);
    return {
      status: 500,
      body: JSON.stringify({ error: "Failed to send message" })
    };
  }
};