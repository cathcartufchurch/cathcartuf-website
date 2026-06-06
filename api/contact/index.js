const { EmailClient } = require("@azure/communication-email");

module.exports = async function (context, req) {
  context.log("Contact form submission received");

  try {
    // Get form data from request body
    const { name, email, subject, message, phone, wantZoom } = req.body;

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return {
        status: 400,
        body: JSON.stringify({
          error: "Missing required fields: name, email, subject, message"
        })
      };
    }

    // Get connection string from environment variable
    const connectionString = process.env.COMMUNICATION_SERVICES_CONNECTION_STRING;
    if (!connectionString) {
      context.log.error("Connection string not configured");
      return {
        status: 500,
        body: JSON.stringify({ error: "Server configuration error" })
      };
    }

    // Create email client
    const client = new EmailClient(connectionString);

    // Build contact info
    let contactInfo = `\nContact email: ${email}`;
    if (phone) {
      contactInfo += `\nPhone: ${phone}`;
    }
    if (wantZoom) {
      contactInfo += `\n\n[Requested Zoom details to be sent]`;
    }

    // Send email to church
    const emailMessage = {
      senderAddress: "donotreply@953990c2-e815-4ff0-b9d1-45cfc48b94ba.azurecomm.net",
      content: {
        subject: `New Contact Form: ${subject}`,
        plainText: `
Name: ${name}${contactInfo}

Message:
${message}
        `
      },
      recipients: {
        to: [
          {
            address: "services@cathcartuf.org.uk"
          }
        ]
      }
    };

    // Send the email
    const sendResult = await client.send(emailMessage);
    context.log(`Email sent successfully with ID: ${sendResult.messageId}`);

    // Return success response
    return {
      status: 200,
      body: JSON.stringify({
        message: "Thank you for contacting us. We will get back to you soon."
      })
    };

  } catch (error) {
    context.log.error("Error sending email:", error);
    return {
      status: 500,
      body: JSON.stringify({
        error: "Failed to send message. Please try again later."
      })
    };
  }
};