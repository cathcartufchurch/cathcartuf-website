const { EmailClient } = require("@azure/communication-email");

module.exports = async function (context, req) {
  context.log("Prayer request form submission received");

  try {
    // Get form data from request body
    const { name, email, phone, prayerRequest, isPrivate, wantZoom } = req.body;

    // Validate required fields
    if (!name || !prayerRequest) {
      return {
        status: 400,
        body: JSON.stringify({
          error: "Missing required fields: name, prayerRequest"
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

    // Determine recipient based on privacy setting
    const recipientEmail = "prayer@cathcartuf.org.uk";
    const privacyNote = isPrivate ? "[PRIVATE REQUEST]" : "[SHARED WITH PRAYER TEAM]";

    // Build contact info
    let contactInfo = "";
    if (email) {
      contactInfo += `\nContact email: ${email}`;
    }
    if (phone) {
      contactInfo += `\nPhone: ${phone}`;
    }
    if (wantZoom) {
      contactInfo += `\n\n[Requested Monday Zoom prayer meeting details to be sent]`;
    }

    // Create email client
    const client = new EmailClient(connectionString);

    // Send email to prayer team
    const emailMessage = {
      senderAddress: "donotreply@953990c2-e815-4ff0-b9d1-45cfc48b94ba.azurecomm.net",
      content: {
        subject: `Prayer Request from ${name} ${privacyNote}`,
        plainText: `
${privacyNote}

Name: ${name}${contactInfo}

Prayer Request:
${prayerRequest}
        `
      },
      recipients: {
        to: [
          {
            address: recipientEmail
          }
        ]
      }
    };

    // Send the email
    const sendResult = await client.send(emailMessage);
    context.log(`Prayer request sent successfully with ID: ${sendResult.messageId}`);

    // Return success response
    return {
      status: 200,
      body: JSON.stringify({
        message: "Thank you for your prayer request. The prayer team will remember you in prayer."
      })
    };

  } catch (error) {
    context.log.error("Error sending prayer request:", error);
    return {
      status: 500,
      body: JSON.stringify({
        error: "Failed to submit prayer request. Please try again later."
      })
    };
  }
};